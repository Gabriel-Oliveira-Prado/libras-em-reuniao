// Executa o bundle WASM distribuído com a extensão, em Node, sem navegador.
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
const processo = globalThis.process;
let env, pipeline;
try { globalThis.process = undefined; ({ env, pipeline } = await import("../vendor/transformers/transformers.min.js")); }
finally { globalThis.process = processo; }
const fetchOriginal = globalThis.fetch;
globalThis.fetch = async (url, opcoes) => {
  if (!String(url).startsWith("file:")) return fetchOriginal(url, opcoes);
  try { return new Response(await readFile(new URL(url))); } catch { return new Response("", { status: 404 }); }
};
Object.assign(env, { allowRemoteModels: false, allowLocalModels: true, useFS: false, useBrowserCache: false, useFSCache: false,
  localModelPath: process.argv[5] ? pathToFileURL(resolve(process.argv[5]) + "/").href : new URL("../modelos/", import.meta.url).href });
Object.assign(env.backends.onnx.wasm, { numThreads: 1, proxy: false, wasmPaths: {
  mjs: new URL("../vendor/transformers/ort-wasm-simd-threaded.jsep.mjs", import.meta.url).href,
  wasm: new URL("../vendor/transformers/ort-wasm-simd-threaded.jsep.wasm", import.meta.url).href,
} });
function lerWav(b) {
  let data, taxa, canais, bits;
  for (let p = 12; p + 8 <= b.length;) {
    const id = b.toString("ascii", p, p + 4), n = b.readUInt32LE(p + 4);
    if (id === "fmt ") { canais = b.readUInt16LE(p + 10); taxa = b.readUInt32LE(p + 12); bits = b.readUInt16LE(p + 22); }
    if (id === "data") data = b.subarray(p + 8, p + 8 + n);
    p += 8 + n + n % 2;
  }
  if (!data || taxa !== 16000 || canais !== 1 || bits !== 16) throw new Error("WAV deve ser mono PCM16 16 kHz");
  return Float32Array.from({ length: data.length / 2 }, (_, i) => data.readInt16LE(i * 2) / 32768);
}
const palavras = (s) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
function erros(a, b) {
  let linha = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const nova = [i];
    for (let j = 1; j <= b.length; j++) nova[j] = Math.min(nova[j - 1] + 1, linha[j] + 1, linha[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    linha = nova;
  }
  return linha.at(-1);
}
const pasta = process.argv[2], destino = process.argv[3] ?? new URL("resultado-transcricao-070.json", import.meta.url);
const amostras = JSON.parse(await readFile(resolve(pasta, "manifesto.json"), "utf8"));
const relatorio = { backend: "Transformers.js da extensão, WASM, 1 thread, Node", modelos: {}, limites: "Frases sintetizadas, conhecidas. Não mede sotaques, microfone real, Chrome, concorrência com Meet ou qualidade linguística do avatar." };
for (const nome of (process.argv[4]?.split(",") ?? ["whisper-tiny", "whisper-base"])) {
  const inicio = performance.now(), modelo = await pipeline("automatic-speech-recognition", nome, { device: "wasm", dtype: "q8" });
  const carregamentoMs = performance.now() - inicio, resultados = [];
  for (const item of amostras) {
    const audio = lerWav(await readFile(resolve(pasta, item.arquivo))), antes = performance.now();
    const r = await modelo(audio, { language: "portuguese", task: "transcribe", max_new_tokens: 224 });
    const esperado = palavras(item.texto), obtido = palavras(r.text);
    resultados.push({ ...item, obtido: r.text.trim(), erros: erros(esperado, obtido), palavras: esperado.length, duracaoMs: audio.length / 16, inferenciaMs: performance.now() - antes });
    console.log(JSON.stringify({ modelo: nome, esperado: item.texto, obtido: r.text.trim(), erros: resultados.at(-1).erros }));
  }
  const nErros = resultados.reduce((n, r) => n + r.erros, 0), total = resultados.reduce((n, r) => n + r.palavras, 0);
  relatorio.modelos[nome] = { carregamentoMs, exatas: resultados.filter((r) => !r.erros).length, total: resultados.length, erros: nErros, palavras: total, wer: nErros / total, resultados };
  await modelo.dispose();
}
await writeFile(destino, JSON.stringify(relatorio, null, 2) + "\n");
globalThis.fetch = fetchOriginal;
