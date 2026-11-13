import * as ort from "../vendor/onnxruntime/ort.wasm.min.mjs";
import { DetectorDeFala } from "./detector-fala.mjs";

ort.env.wasm.numThreads = 1;
ort.env.wasm.proxy = false;
ort.env.wasm.wasmPaths = {
  mjs: new URL("../vendor/onnxruntime/ort-wasm-simd-threaded.mjs", import.meta.url).href,
  wasm: new URL("../vendor/onnxruntime/ort-wasm-simd-threaded.wasm", import.meta.url).href,
};
let detector, fila = Promise.resolve(), pendentes = 0, falhou = false;
function enviar(trechos) {
  for (const amostras of trechos) self.postMessage({ tipo: "trecho", amostras }, [amostras.buffer]);
}
self.onmessage = ({ data }) => {
  if (falhou) return;
  pendentes++;
  if (pendentes > 150) {
    falhou = true;
    self.postMessage({ tipo: "erro", erro: "O detector de fala ficou atrasado. A escuta foi interrompida." });
    return;
  }
  fila = fila.then(async () => {
    if (falhou) return;
    if (data.tipo === "carregar") {
      const sessao = await ort.InferenceSession.create(new URL("../modelos/silero_vad.onnx", import.meta.url).href, { executionProviders: ["wasm"] });
      detector = new DetectorDeFala(ort, sessao);
      self.postMessage({ tipo: "carregado" });
    } else if (data.tipo === "audio") {
      enviar(await detector.receber(data.amostras));
    } else if (data.tipo === "parar") {
      enviar(await detector.concluir());
      self.postMessage({ tipo: "fim" });
    }
  }).catch((erro) => {
    falhou = true;
    self.postMessage({ tipo: "erro", erro: String(erro) });
  }).finally(() => pendentes--);
};
