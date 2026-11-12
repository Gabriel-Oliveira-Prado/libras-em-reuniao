import { HandLandmarker } from "../vendor/mediapipe/vision_bundle.mjs";

const recurso = (caminho) => new URL(caminho, import.meta.url).href;
let reconhecedor;

export function carregarReconhecedor() {
  reconhecedor ??= criarReconhecedor().catch((erro) => {
    reconhecedor = undefined;
    throw erro;
  });
  return reconhecedor;
}

async function criarReconhecedor() {
  const resposta = await fetch(recurso("../modelos/alfabeto.json.gz"));
  if (!resposta.ok || !resposta.body) throw new Error("Modelo de letras indisponível.");
  const modelo = await new Response(
    resposta.body.pipeThrough(new DecompressionStream("gzip")),
  ).json();
  const detector = await HandLandmarker.createFromOptions({
    wasmLoaderPath: recurso("../vendor/mediapipe/wasm/vision_wasm_internal.js"),
    wasmBinaryPath: recurso("../vendor/mediapipe/wasm/vision_wasm_internal.wasm"),
  }, {
    baseOptions: { modelAssetPath: recurso("../modelos/hand_landmarker.task") },
    runningMode: "VIDEO",
    numHands: 1,
  });

  return (video, instante) => {
    const mao = detector.detectForVideo(video, instante).landmarks[0];
    if (!mao) return null;
    return classificar(modelo, normalizar(mao));
  };
}

function normalizar(pontos) {
  const pulso = pontos[0];
  const dedo = pontos[9];
  const escala = Math.hypot(dedo.x - pulso.x, dedo.y - pulso.y, dedo.z - pulso.z) || 1e-6;
  return Float32Array.from(pontos.flatMap(({ x, y, z }) => [
    (x - pulso.x) / escala,
    (y - pulso.y) / escala,
    (z - pulso.z) / escala,
  ]));
}

export function probabilidades({ classes, trees }, vetor) {
  const votos = new Float64Array(classes.length);
  for (const arvore of trees) {
    let no = arvore[0];
    // Cada nó interno contém [atributo, limiar, índice esquerdo, índice direito].
    while (no.length === 4) {
      const [atributo, limiar, esquerda, direita] = no;
      no = arvore[vetor[atributo] <= limiar ? esquerda : direita];
    }
    if (no.length === 1) {
      votos[no[0]] += 1;
    } else {
      // A folha com mais de uma classe começa com -1, seguido de pares classe/peso.
      for (let i = 1; i < no.length; i += 2) votos[no[i]] += no[i + 1];
    }
  }
  return votos.map((total) => total / trees.length);
}

function classificar(modelo, vetor) {
  const scores = probabilidades(modelo, vetor);
  const ordem = modelo.classes.map((_, i) => i).sort((a, b) => scores[b] - scores[a]);
  const [primeiro, segundo] = ordem;
  return {
    letra: modelo.classes[primeiro],
    confianca: scores[primeiro],
    margem: scores[primeiro] - scores[segundo],
  };
}
