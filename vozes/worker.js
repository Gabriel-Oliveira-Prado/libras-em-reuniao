import * as ort from "../vendor/onnxruntime/ort.wasm.min.mjs";
import { createEspeak } from "../vendor/spellophone/dist/browser.js";
import { criarMotorKokoro } from "./kokoro.mjs";

ort.env.wasm.numThreads = 1;
ort.env.wasm.proxy = false;
ort.env.wasm.wasmPaths = {
  mjs: new URL("../vendor/onnxruntime/ort-wasm-simd-threaded.mjs", import.meta.url).href,
  wasm: new URL("../vendor/onnxruntime/ort-wasm-simd-threaded.wasm", import.meta.url).href,
};
async function ler(url) { const resposta = await fetch(url); if (!resposta.ok) throw new Error("Falta um arquivo da voz. Confira a pasta vozes do projeto."); return resposta; }
const motor = criarMotorKokoro({ ort,
  motorFonemas: async () => {
    const fonemas = await createEspeak({ dataUrl: new URL("../vendor/spellophone/espeak-ng-data/", import.meta.url), languages: ["pt"] });
    await fonemas.loadVoice("pt-br"); return fonemas;
  },
  lerJson: async (url) => (await ler(url)).json(),
  lerBytes: async (url) => new Uint8Array(await (await ler(url)).arrayBuffer()),
});
let fila = Promise.resolve(), geracao = 0;
self.onmessage = ({ data }) => {
  if (data.tipo === "cancelar") { geracao = data.geracao; return; }
  fila = fila.then(async () => {
    if (data.tipo === "sintetizar" && data.geracao !== geracao) return;
    if (data.tipo === "carregar") { await motor.carregar(); self.postMessage({ id: data.id, tipo: "pronto" }); return; }
    const inicio = performance.now();
    const audio = await motor.sintetizar(data.texto, data.perfil);
    if (data.tipo === "preparar") { self.postMessage({ id: data.id, tipo: "pronto" }); return; }
    if (data.geracao !== geracao) return;
    self.postMessage({ id: data.id, tipo: "audio", ...audio, sinteseMs: performance.now() - inicio }, [audio.samples.buffer]);
  }).catch((erro) => self.postMessage({ id: data.id, tipo: "erro", mensagem: erro?.message ?? "A voz não carregou." }));
};
