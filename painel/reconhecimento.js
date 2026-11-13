import { HolisticLandmarker } from "../vendor/mediapipe/vision_bundle.mjs";
import { criarCarregadorDeRastreamento, criarModeloComAceleracao } from "./rastreamento.mjs";

const recurso = (caminho) => new URL(caminho, import.meta.url).href;
const carregar = criarCarregadorDeRastreamento(criarDetector);

export function carregarDetectorDeMaos(perfil = "lite", opcoes) {
  return carregar(perfil, opcoes);
}

async function criarDetector(perfil, opcoes) {
  return criarModeloComAceleracao((delegate) => HolisticLandmarker.createFromOptions({
    wasmLoaderPath: recurso("../vendor/mediapipe/wasm/vision_wasm_internal.js"),
    wasmBinaryPath: recurso("../vendor/mediapipe/wasm/vision_wasm_internal.wasm"),
  }, {
    baseOptions: { modelAssetPath: recurso(perfil.arquivo), delegate },
    runningMode: "VIDEO",
    minHandLandmarksConfidence: 0.5,
    minPoseDetectionConfidence: 0.5,
    minPosePresenceConfidence: 0.5,
    minFaceDetectionConfidence: 0.5,
    outputFaceBlendshapes: false,
    outputPoseSegmentationMasks: false,
  }), opcoes);
}
