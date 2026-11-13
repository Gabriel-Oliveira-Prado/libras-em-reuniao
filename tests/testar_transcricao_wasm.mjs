// Mesmo bundle/modelo WASM do painel; sem Chrome, microfone ou Meet.
import { readFile, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { DetectorDeFala } from "../painel/detector-fala.mjs";
import * as ort from "../vendor/onnxruntime/ort.wasm.min.mjs";
// O bundle Web remove os backends nativos do Node. Seleciona o backend Web
// durante a importação, sem abrir/automatizar um navegador.
const processo = globalThis.process;
let env, pipeline;
try {
  globalThis.process = undefined;
  ({ env, pipeline } = await import("../vendor/transformers/transformers.min.js"));
} finally { globalThis.process = processo; }

const fetchOriginal = globalThis.fetch;
globalThis.fetch = async (url, opcoes) => {
  if (!String(url).startsWith("file:")) return fetchOriginal(url, opcoes);
  try { return new Response(await readFile(new URL(url))); }
  catch { return new Response("", { status: 404 }); }
};
env.allowRemoteModels = false;
env.allowLocalModels = true;
env.useFS = false;
env.useBrowserCache = false;
env.useFSCache = false;
env.localModelPath = new URL("../modelos/", import.meta.url).href;
env.backends.onnx.wasm.numThreads = 1;
env.backends.onnx.wasm.proxy = false;
env.backends.onnx.wasm.wasmPaths = {
  mjs: new URL("../vendor/transformers/ort-wasm-simd-threaded.jsep.mjs", import.meta.url).href,
  wasm: new URL("../vendor/transformers/ort-wasm-simd-threaded.jsep.wasm", import.meta.url).href,
};
const bytes = await readFile(process.argv[2]);
let dados, taxa, canais, bits;
for (let pos = 12; pos + 8 <= bytes.length;) {
  const id = bytes.toString("ascii", pos, pos + 4), tamanho = bytes.readUInt32LE(pos + 4);
  if (id === "fmt ") { canais = bytes.readUInt16LE(pos + 10); taxa = bytes.readUInt32LE(pos + 12); bits = bytes.readUInt16LE(pos + 22); }
  if (id === "data") dados = bytes.subarray(pos + 8, pos + 8 + tamanho);
  pos += 8 + tamanho + (tamanho % 2);
}
assert.equal(taxa, 16000); assert.equal(canais, 1); assert.equal(bits, 16);
const audio = Float32Array.from({ length: dados.length / 2 }, (_, i) => dados.readInt16LE(i * 2) / 32768);
ort.env.wasm.numThreads = 1;
ort.env.wasm.wasmPaths = {
  mjs: new URL("../vendor/onnxruntime/ort-wasm-simd-threaded.mjs", import.meta.url).href,
  wasm: new URL("../vendor/onnxruntime/ort-wasm-simd-threaded.wasm", import.meta.url).href,
};
const sessaoVAD = await ort.InferenceSession.create(await readFile(new URL("../modelos/silero_vad.onnx", import.meta.url)), { executionProviders: ["wasm"] });
const segmentador = new DetectorDeFala(ort, sessaoVAD);
const trechos = [];
for (let i = 0; i < audio.length; i += 320) {
  trechos.push(...await segmentador.receber(audio.slice(i, i + 320)));
}
trechos.push(...await segmentador.concluir());
const inicio = performance.now();
const modelo = await pipeline("automatic-speech-recognition", "whisper-tiny", { device: "wasm", dtype: "q8" });
const carregamento_ms = performance.now() - inicio;
const resultados = [];
for (const audio of trechos) {
  const antes = performance.now();
  const r = await modelo(audio, { language: "portuguese", task: "transcribe", max_new_tokens: 96 });
  resultados.push({ texto: r.text.trim(), audio_segundos: audio.length / 16000, transcricao_ms: performance.now() - antes });
}
assert.equal(resultados.length, 2);
assert.match(resultados[0].texto.toLowerCase(), /bom dia/);
assert.match(resultados[1].texto.toLowerCase(), /preciso de ajuda/);
const relatorio = { backend: "Bundle Transformers.js e Whisper WASM da extensão, no Node, 1 thread", carregamento_ms, resultados,
  limites: "Não mede a execução no Chrome nem disputa de CPU com uma chamada no Meet." };
await writeFile(new URL("../treinamento/resultado-whisper-wasm.json", import.meta.url), JSON.stringify(relatorio, null, 2) + "\n");
console.log(JSON.stringify(relatorio));
await modelo.dispose();
await sessaoVAD.release();
globalThis.fetch = fetchOriginal;
