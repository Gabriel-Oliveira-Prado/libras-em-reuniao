import { env, pipeline } from "../vendor/transformers/transformers.min.js";

env.allowRemoteModels = false;
env.allowLocalModels = true;
env.localModelPath = new URL("../modelos/", import.meta.url).href;
env.useBrowserCache = false;
env.backends.onnx.wasm.numThreads = 1;
env.backends.onnx.wasm.proxy = false;
env.backends.onnx.wasm.wasmPaths = {
  mjs: new URL("../vendor/transformers/ort-wasm-simd-threaded.jsep.mjs", import.meta.url).href,
  wasm: new URL("../vendor/transformers/ort-wasm-simd-threaded.jsep.wasm", import.meta.url).href,
};

let modelo;
self.onmessage = async ({ data: { id, amostras } }) => {
  try {
    modelo ??= pipeline("automatic-speech-recognition", "whisper-tiny", { device: "wasm", dtype: "q8" });
    const transcrever = await modelo;
    self.postMessage({ id, tipo: "pronto" });
    const resultado = await transcrever(amostras, {
      language: "portuguese",
      task: "transcribe",
      max_new_tokens: 96,
    });
    self.postMessage({ id, tipo: "texto", texto: resultado.text.trim() });
  } catch (erro) {
    modelo = undefined;
    self.postMessage({ id, tipo: "erro", erro: String(erro) });
  }
};
