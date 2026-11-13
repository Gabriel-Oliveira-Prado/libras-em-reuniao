// Preparação de distribuição. Requer onnxruntime-node apenas no TEMP de desenvolvimento.
// O usuário final recebe os PCM e executa a extensão sem instalar Node/Python.
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import { createEspeak } from "../vendor/spellophone/dist/browser.js";
import { criarMotorKokoro } from "../vozes/kokoro.mjs";
const require = createRequire(process.env.TEMP + "/libras-asr-verificacao/package.json"), ort = require("onnxruntime-node");
const motor = criarMotorKokoro({ ort, opcoesSessao: { executionProviders: ["cpu"], intraOpNumThreads: 4 },
  motorFonemas: async () => {
    const f = await createEspeak({ dataUrl: new URL("../vendor/spellophone/espeak-ng-data/", import.meta.url), languages: ["pt"], fetch: async (url) => new Response(await readFile(url)) });
    await f.loadVoice("pt-br"); return f;
  }, lerJson: async (url) => JSON.parse(await readFile(url, "utf8")), lerBytes: async (url) => new Uint8Array(await readFile(url)),
});
const modelo = JSON.parse(await readFile(new URL("../modelos/sinais/tcn.json", import.meta.url), "utf8"));
const textos = [...modelo.classes.filter((c) => c !== "Sem sinal").map((c) => ({ Maca: "Maçã", America: "América" })[c] ?? c), "Oi", "Gabriel", "João", "Ana Clara", "Oi. O som do tradutor está funcionando."];
const catalogo = {}, arquivos = [];
for (const perfil of ["pf_dora", "pm_alex"]) {
  catalogo[perfil] = {}; await mkdir(new URL(`../vozes/falas/${perfil}/`, import.meta.url), { recursive: true });
  for (const texto of textos) {
    const slug = texto.normalize("NFD").replace(/\p{M}/gu, "").toLocaleLowerCase("pt-BR").replace(/[^a-z0-9]+/gu, "-").replace(/-$/u, "");
    const url = new URL(`../vozes/falas/${perfil}/${slug}.pcm`, import.meta.url);
    let bytes;
    if (!process.argv.includes("--forcar")) { try { bytes = new Uint8Array(await readFile(url)); } catch { /* Gera a fala ainda ausente. */ } }
    if (!bytes) { const audio = await motor.sintetizar(texto, perfil); bytes = new Uint8Array(audio.samples.buffer); }
    await writeFile(url, bytes);
    catalogo[perfil][texto.normalize("NFC").toLocaleLowerCase("pt-BR").trim().replace(/[.!?]+$/u, "")] = `${slug}.pcm`;
    arquivos.push({ perfil, texto, bytes: bytes.length, sampleRate: 24000, sha256: createHash("sha256").update(bytes).digest("hex") });
  }
  console.log(`${perfil}: ${textos.length} falas naturais preparadas.`);
}
await writeFile(new URL("../vozes/falas/catalogo.json", import.meta.url), JSON.stringify(catalogo, null, 2) + "\n");
await writeFile(new URL("../vozes/falas/proveniencia.json", import.meta.url), JSON.stringify({ motor: "Kokoro v1.0 q8, fonemas pt-br, ONNX CPU", revisaoModelo: "1939ad2a8e416c0acfeecc08a694d14ef25f2231", tratamentoOi: "Oi gerado em contexto e recortado na primeira pausa de 40 ms; só a saudação é reproduzida.", amostras: arquivos }, null, 2) + "\n");
