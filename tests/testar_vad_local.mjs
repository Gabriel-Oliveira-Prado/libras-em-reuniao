// Integração real Silero + Whisper, backend CPU do Node, sem câmera/microfone.
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import assert from "node:assert/strict";
import { DetectorDeFala } from "../painel/detector-fala.mjs";

const [arquivo, dependencias] = process.argv.slice(2);
if (!arquivo || !dependencias) throw new Error("Informe WAV PCM mono/16kHz e pasta com node_modules.");
const bytes = readFileSync(arquivo);
let dados, taxa, canais, bits;
for (let pos = 12; pos + 8 <= bytes.length;) {
  const id = bytes.toString("ascii", pos, pos + 4), tamanho = bytes.readUInt32LE(pos + 4);
  if (id === "fmt ") { canais = bytes.readUInt16LE(pos + 10); taxa = bytes.readUInt32LE(pos + 12); bits = bytes.readUInt16LE(pos + 22); }
  if (id === "data") dados = bytes.subarray(pos + 8, pos + 8 + tamanho);
  pos += 8 + tamanho + (tamanho % 2);
}
assert.equal(taxa, 16000); assert.equal(canais, 1); assert.equal(bits, 16);
const audio = Float32Array.from({ length: dados.length / 2 }, (_, i) => dados.readInt16LE(i * 2) / 32768);
const wasm = process.argv[4] === "wasm";
const ort = wasm ? await import("../vendor/onnxruntime/ort.wasm.min.mjs")
  : await import(pathToFileURL(resolve(dependencias, "node_modules/onnxruntime-node/dist/index.js")));
if (wasm) {
  ort.env.wasm.numThreads = 1;
  ort.env.wasm.proxy = false;
  ort.env.wasm.wasmPaths = {
    mjs: new URL("../vendor/onnxruntime/ort-wasm-simd-threaded.mjs", import.meta.url).href,
    wasm: new URL("../vendor/onnxruntime/ort-wasm-simd-threaded.wasm", import.meta.url).href,
  };
}
const sessao = await ort.InferenceSession.create(readFileSync(new URL("../modelos/silero_vad.onnx", import.meta.url)), wasm ? { executionProviders: ["wasm"] } : { intraOpNumThreads: 1 });
async function segmentar(amostras) {
  const detector = new DetectorDeFala(ort, sessao), trechos = [];
  for (let i = 0; i < amostras.length; i += 320) trechos.push(...await detector.receber(amostras.slice(i, i + 320)));
  trechos.push(...await detector.concluir());
  return trechos;
}
let seed = 123;
const ruido = Float32Array.from({ length: 16000 * 10 }, (_, i) => {
  seed = (1664525 * seed + 1013904223) >>> 0;
  return (seed / 4294967296 - 0.5) * 0.04 + Math.sin(i * 2 * Math.PI * 60 / 16000) * 0.05;
});
const ruida = await segmentar(ruido);
assert.equal(ruida.length, 0, "ruído e zumbido não devem disparar transcrição");
const trechos = await segmentar(audio);
assert.equal(trechos.length, 2, "as duas frases devem ser preservadas");
const { env, pipeline } = await import(pathToFileURL(resolve(dependencias, "node_modules/@huggingface/transformers/dist/transformers.node.mjs")));
env.allowRemoteModels = false;
env.localModelPath = fileURLToPath(new URL("../modelos/", import.meta.url));
const transcrever = await pipeline("automatic-speech-recognition", "whisper-tiny", { device: "cpu", dtype: "q8" });
const resultados = [];
for (const trecho of trechos) {
  const r = await transcrever(trecho, { language: "portuguese", task: "transcribe", max_new_tokens: 96 });
  resultados.push({ segundos: trecho.length / 16000, texto: r.text.trim() });
}
assert.match(resultados[0].texto.toLowerCase(), /bom dia/);
assert.match(resultados[1].texto.toLowerCase(), /preciso de ajuda/);
const relatorio = { backend: wasm ? "Silero WASM no Node + Whisper CPU (não mede Chrome)" : "ONNX CPU Node (não mede Chrome)", ruido_segundos: 10, transcricoes_ruido: ruida.length, frases: resultados,
  limites: "Áudio sintetizado e ruído artificial. Não avalia microfone real nem separação entre pessoas." };
writeFileSync(new URL(`../treinamento/resultado-audio${wasm ? "-wasm" : ""}.json`, import.meta.url), JSON.stringify(relatorio, null, 2) + "\n");
console.log(JSON.stringify(relatorio));
await transcrever.dispose();
await sessao.release();
