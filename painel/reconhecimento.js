import { HolisticLandmarker } from "../vendor/mediapipe/vision_bundle.mjs";

const recurso = (caminho) => new URL(caminho, import.meta.url).href;
let detector;

export function carregarDetectorDeMaos() {
  detector ??= criarDetector().catch((erro) => {
    detector = undefined;
    throw erro;
  });
  return detector;
}

async function criarDetector() {
  const modelo = await HolisticLandmarker.createFromOptions({
    wasmLoaderPath: recurso("../vendor/mediapipe/wasm/vision_wasm_internal.js"),
    wasmBinaryPath: recurso("../vendor/mediapipe/wasm/vision_wasm_internal.wasm"),
  }, {
    baseOptions: { modelAssetPath: recurso("../modelos/holistic_landmarker.task") },
    runningMode: "VIDEO",
    minHandLandmarksConfidence: 0.5,
    minPoseDetectionConfidence: 0.5,
    minPosePresenceConfidence: 0.5,
    minFaceDetectionConfidence: 0.5,
    outputFaceBlendshapes: false,
    outputPoseSegmentationMasks: false,
  });
  return (video, instante) => modelo.detectForVideo(video, instante);
}
