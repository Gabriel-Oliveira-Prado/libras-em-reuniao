import http from "node:http";
import { resolve, join } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
const MODELOS = new Set(["base", "tiny", "small"]);
export function criarServidorTranscricao({ origem, carregar, transcrever }) {
  if (!/^chrome-extension:\/\/[a-p]{32}$/.test(origem)) throw new Error("Informe o ID exato da extensão.");
  let fila = Promise.resolve(), pendentes = 0;
  return http.createServer(async (req, res) => {
    if (req.headers.origin !== origem) { res.writeHead(403); res.end(); return; }
    res.setHeader("Access-Control-Allow-Origin", origem); res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    res.setHeader("Access-Control-Allow-Private-Network", "true");
    const enviar = (status, dados) => { if (!res.destroyed) { res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }); res.end(JSON.stringify(dados)); } };
    if (req.method === "OPTIONS") { res.writeHead(204); res.end(); return; }
    const url = new URL(req.url, "http://127.0.0.1");
    if (req.method === "GET" && url.pathname === "/health") { enviar(200, { schema: 1, estado: "disponivel" }); return; }
    if (req.method !== "POST" || !["/load", "/transcribe"].includes(url.pathname)) { enviar(404, { erro: "Rota inexistente." }); return; }
    const modelo = url.searchParams.get("modelo");
    if (!MODELOS.has(modelo)) { enviar(400, { erro: "Modelo inválido." }); return; }
    if (pendentes >= 3) { enviar(429, { erro: "A transcrição local está ocupada." }); return; }
    const tipo = req.headers["content-type"]?.split(";")[0];
    if (tipo !== "application/octet-stream") { enviar(415, { erro: "Use PCM float32 mono 16 kHz." }); return; }
    const partes = []; let n = 0, cancelado = false, contado = false;
    req.on("aborted", () => { cancelado = true; });
    res.on("close", () => { if (!res.writableEnded) cancelado = true; });
    pendentes++; contado = true;
    try {
      for await (const p of req) {
        n += p.length;
        if (n > 16000 * 14 * 4) { enviar(413, { erro: "Trecho de áudio muito longo." }); return; }
        partes.push(p);
      }
      let audio;
      if (url.pathname === "/transcribe") {
        if (!n || n % 4) { enviar(400, { erro: "Áudio inválido." }); return; }
        const bytes = Buffer.concat(partes);
        audio = Float32Array.from({ length: n / 4 }, (_, i) => bytes.readFloatLE(i * 4));
        if (!audio.every((x) => Number.isFinite(x) && Math.abs(x) <= 4)) { enviar(400, { erro: "PCM inválido." }); return; }
      } else if (n) { enviar(400, { erro: "Carregamento não recebe áudio." }); return; }
      // Uma inferência por vez; cliente cancelado não inicia trabalho na fila.
      const trabalho = fila.then(async () => {
        if (cancelado) return;
        await carregar(modelo);
        if (cancelado) return;
        if (!audio) { enviar(200, { schema: 1, carregado: true }); return; }
        const inicio = performance.now(), texto = await transcrever(audio);
        enviar(200, { texto, inferenciaMs: performance.now() - inicio });
      });
      fila = trabalho.catch(() => {});
      await trabalho;
    } catch { enviar(500, { erro: "O modelo local não carregou ou não concluiu a transcrição. Confira os arquivos e o log do serviço." }); }
    finally { if (contado) pendentes--; }
  });
}

async function iniciar() {
  const id = process.env.LIBRAS_EXTENSAO_ID;
  if (!/^[a-p]{32}$/.test(id ?? "")) throw new Error("Defina LIBRAS_EXTENSAO_ID com o ID de 32 letras mostrado no Chrome.");
  const pacotes = process.env.LIBRAS_TRANSCRICAO_PACOTES;
  if (!pacotes) throw new Error("Use scripts/iniciar-transcricao-local.ps1 para configurar as dependências.");
  const sdk = pathToFileURL(join(pacotes, "node_modules/@huggingface/transformers/dist/transformers.node.mjs")).href;
  const { env, pipeline } = await import(sdk);
  const raiz = resolve(fileURLToPath(new URL("../", import.meta.url)));
  Object.assign(env, { allowRemoteModels: false, allowLocalModels: true, useFS: true, useBrowserCache: false, useFSCache: false, localModelPath: raiz.replaceAll("\\", "/") + "/modelos/" });
  let modelo, nome;
  const carregar = async (escolhido) => {
    if (nome === escolhido && modelo) return;
    await modelo?.dispose(); modelo = undefined; nome = undefined;
    modelo = await pipeline("automatic-speech-recognition", "whisper-" + escolhido, { device: "cpu", dtype: "q8",
      session_options: { executionProviders: ["cpu"], intraOpNumThreads: 4, interOpNumThreads: 1, executionMode: "sequential" } });
    nome = escolhido;
  };
  const servidor = criarServidorTranscricao({ origem: "chrome-extension://" + id, carregar,
    transcrever: async (audio) => (await modelo(audio, { language: "portuguese", task: "transcribe", max_new_tokens: 224 })).text.trim() });
  servidor.on("error", (e) => { console.error(e.code === "EADDRINUSE" ? "Já há um serviço na porta 18271." : "Falha no serviço local: " + e.code); process.exitCode = 1; });
  servidor.listen(18271, "127.0.0.1", () => console.log("Transcrição disponível somente neste computador para a extensão " + id));
  const encerrar = () => { servidor.close(); modelo?.dispose().finally(() => process.exit()); };
  process.on("SIGTERM", encerrar); process.on("SIGINT", encerrar);
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) iniciar().catch((e) => { console.error(e.message); process.exitCode = 1; });
