import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import assert from "node:assert/strict";
import * as ort from "../vendor/onnxruntime/ort.wasm.min.mjs";
import { createEspeak, encodeWav } from "../vendor/spellophone/dist/browser.js";
import { criarMotorKokoro } from "../vozes/kokoro.mjs";

ort.env.wasm.numThreads = 1;
ort.env.wasm.wasmPaths = {
  mjs: new URL("../vendor/onnxruntime/ort-wasm-simd-threaded.mjs", import.meta.url).href,
  wasm: new URL("../vendor/onnxruntime/ort-wasm-simd-threaded.wasm", import.meta.url).href,
};
const motor = criarMotorKokoro({ ort,
  motorFonemas: async () => {
    const fonemas = await createEspeak({ dataUrl: new URL("../vendor/spellophone/espeak-ng-data/", import.meta.url), languages: ["pt"], fetch: async (url) => new Response(await readFile(url)) });
    await fonemas.loadVoice("pt-br"); return fonemas;
  },
  lerJson: async (url) => JSON.parse(await readFile(url, "utf8")), lerBytes: async (url) => new Uint8Array(await readFile(url)),
});
const pasta = resolve(process.env.TEMP, "libras-vozes-neurais"); await mkdir(pasta, { recursive: true });
const antes = performance.now(); await motor.carregar(); const carregamentoMs = Math.round(performance.now() - antes);
console.log(JSON.stringify({ carregamentoMs }));
const resultados = [];
const somenteOi = process.argv.includes("--somente-oi");
for (const perfil of ["pf_dora", "pm_alex"]) for (const texto of somenteOi ? ["Oi!"] : ["Oi!", "Gabriel.", "Oi. Bom dia, tudo bem? Meu nome é Gabriel."]) {
  const inicio = performance.now(); const audio = await motor.sintetizar(texto, perfil);
  const rms = Math.sqrt(audio.samples.reduce((s, n) => s + n * n, 0) / audio.samples.length);
  assert.ok(rms > 0.001 && audio.samples.every(Number.isFinite));
  assert.ok(audio.samples.length > 2400);
  const item = { perfil, texto, segundos: audio.samples.length / audio.sampleRate, rms, sinteseMs: Math.round(performance.now() - inicio), arquivo: resolve(pasta, `${perfil}-${resultados.length}.wav`) };
  await writeFile(item.arquivo, new Uint8Array(encodeWav(Int16Array.from(audio.samples, (n) => Math.round(Math.max(-1, Math.min(1, n)) * 32767)), audio.sampleRate)));
  const repeticaoInicio = performance.now(), repetido = await motor.sintetizar(texto, perfil);
  assert.equal(repetido.cache, true); assert.deepEqual(repetido.samples, audio.samples);
  item.repeticaoMs = performance.now() - repeticaoInicio;
  resultados.push(item); console.log(JSON.stringify(item));
}
await writeFile(new URL(somenteOi ? "../treinamento/resultado-oi-voz-wasm.json" : "../treinamento/resultado-vozes-neurais.json", import.meta.url), JSON.stringify({ motor: "Kokoro v1.0 q8 + fonemização eSpeak pt-br, ONNX WASM distribuído, uma thread no Node", carregamentoMs, resultados, limites: "Não verifica reprodução nos alto-falantes ou áudio do Meet. A naturalidade e a pronúncia precisam de avaliação humana." }, null, 2) + "\n");
