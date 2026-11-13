// Teste offline do mesmo Whisper Tiny, usando o backend CPU do Node.
// Uso: node tests/testar_falas_curtas.mjs audio.wav /pasta/com/node_modules
// O desempenho do backend Node não mede a latência WebAssembly no Chrome.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { SegmentadorDeFala } from "../painel/segmentacao-audio.mjs";

const [arquivo, dependencias] = process.argv.slice(2);
if (!arquivo || !dependencias) throw new Error("Informe WAV PCM mono/16 kHz/16 bits e a pasta com node_modules.");
const bytes = readFileSync(arquivo);
let dados, taxa, canais, bits;
for (let pos = 12; pos + 8 <= bytes.length;) {
  const id = bytes.toString("ascii", pos, pos + 4);
  const tamanho = bytes.readUInt32LE(pos + 4);
  if (id === "fmt ") {
    canais = bytes.readUInt16LE(pos + 10);
    taxa = bytes.readUInt32LE(pos + 12);
    bits = bytes.readUInt16LE(pos + 22);
  }
  if (id === "data") dados = bytes.subarray(pos + 8, pos + 8 + tamanho);
  pos += 8 + tamanho + (tamanho % 2);
}
if (!dados || taxa !== 16000 || canais !== 1 || bits !== 16) throw new Error("Formato de WAV inesperado.");
const audio = Float32Array.from({ length: dados.length / 2 }, (_, i) => dados.readInt16LE(i * 2) / 32768);
const segmentador = new SegmentadorDeFala(taxa);
const trechos = [];
for (let i = 0; i < audio.length; i += 320) {
  const trecho = segmentador.receber(audio.slice(i, i + 320));
  if (trecho) trechos.push(trecho);
}
const ultimo = segmentador.concluir();
if (ultimo) trechos.push(ultimo);
const { env, pipeline } = await import(pathToFileURL(resolve(dependencias, "node_modules/@huggingface/transformers/dist/transformers.node.mjs")));
env.allowRemoteModels = false;
env.localModelPath = fileURLToPath(new URL("../modelos/", import.meta.url));
const transcrever = await pipeline("automatic-speech-recognition", "whisper-tiny", { device: "cpu", dtype: "q8" });
for (let i = 0; i < trechos.length; i++) {
  const resultado = await transcrever(trechos[i], { language: "portuguese", task: "transcribe", max_new_tokens: 96 });
  console.log(JSON.stringify({ trecho: i + 1, duracao: trechos[i].length / 16000, texto: resultado.text.trim() }));
}
await transcrever.dispose();
