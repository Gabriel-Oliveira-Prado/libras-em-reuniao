// Motor WASM e dicionários reais da extensão. Não verifica o alto-falante.
import { readFile, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { createEspeak, encodeWav, toFloat32 } from "../vendor/spellophone/dist/browser.js";

const inicio = performance.now();
const motor = await createEspeak({
  dataUrl: new URL("../vendor/spellophone/espeak-ng-data/", import.meta.url),
  languages: ["pt"],
  fetch: async (url) => new Response(await readFile(new URL(url))),
});
await motor.loadVoice("pt-br");
const carregamento = performance.now() - inicio;
const frases = ["Oi", "Oi. O som do tradutor está funcionando.", "merda", "Gabriel", "João", "Ana Clara"];
const resultados = [];
for (const texto of frases) {
  const antes = performance.now();
  const { samples, sampleRate } = motor.synthesize(texto);
  const pcm = toFloat32(samples);
  const rms = Math.sqrt(pcm.reduce((s, x) => s + x * x, 0) / pcm.length);
  assert.ok(samples.length > sampleRate * 0.1, "áudio com duração válida");
  assert.ok(rms > 0.001, "áudio contém som");
  assert.ok(pcm.every(Number.isFinite));
  resultados.push({ texto, sampleRate, segundos: samples.length / sampleRate, rms, sintese_ms: performance.now() - antes });
  if (texto === frases[1] && process.argv[2]) await writeFile(process.argv[2], new Uint8Array(encodeWav(samples, sampleRate)));
}
const relatorio = { motor: "Spellophone/eSpeak WASM distribuído com a extensão", carregamento_ms: carregamento, resultados,
  limites: "Executado no Node. Valida a síntese de áudio, não o volume, a política de autoplay do Chrome ou o áudio compartilhado no Meet." };
await writeFile(new URL("../treinamento/resultado-sintese.json", import.meta.url), JSON.stringify(relatorio, null, 2) + "\n");
console.log(JSON.stringify(relatorio));
motor.dispose();
