// Conferência auxiliar por ASR. Não substitui avaliação humana da voz.
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { reamostrar } from "../painel/segmentacao-audio.mjs";
const { env, pipeline } = await import(pathToFileURL(resolve(process.env.TEMP, "libras-asr-verificacao/node_modules/@huggingface/transformers/dist/transformers.node.mjs")));
env.allowRemoteModels = false;
env.localModelPath = fileURLToPath(new URL("../modelos/", import.meta.url));
const asr = await pipeline("automatic-speech-recognition", "whisper-tiny", { device: "cpu", dtype: "q8" });
const catalogo = JSON.parse(await readFile(new URL("../vozes/falas/catalogo.json", import.meta.url), "utf8")), resultados = [];
for (const perfil of ["pf_dora", "pm_alex"]) for (const texto of ["oi", "gabriel", "oi. o som do tradutor está funcionando"]) {
  const bytes = await readFile(new URL(`../vozes/falas/${perfil}/${catalogo[perfil][texto]}`, import.meta.url));
  const pcm = new Float32Array(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
  const audio = reamostrar(pcm, 24000);
  const r = await asr(audio, { language: "portuguese", task: "transcribe", max_new_tokens: 96 });
  const item = { perfil, textoEsperado: texto, transcricao: r.text.trim() };
  resultados.push(item); console.log(JSON.stringify(item));
}
await asr.dispose();
await writeFile(new URL("../treinamento/resultado-pronuncia-neural.json", import.meta.url), JSON.stringify({ motorASR: "Whisper Tiny CPU no Node", resultados, limites: "ASR auxiliar sobre áudio gerado. Não comprova naturalidade, pronúncia de todas as palavras ou som nos alto-falantes/Meet." }, null, 2) + "\n");
