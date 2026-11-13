const POSE = [0, 11, 12, 13, 14, 15, 16, 23, 24];
const ROSTO = [1, 4, 10, 33, 133, 159, 145, 263, 362, 386, 374, 61, 291, 13, 14, 70, 105, 300, 334, 152];

// Mesmo contrato de treinamento/preparar_holistic.py: 228 atributos por quadro.
export function extrairAtributos(resultado, proporcao = 16 / 9) {
  // MediaPipe normaliza x pela largura e y pela altura. O treino usa 16:9.
  // Corrige a geometria de webcams 4:3/retrato antes de calcular distâncias.
  const fatorY = (16 / 9) / (Number.isFinite(proporcao) && proporcao > 0 ? proporcao : 16 / 9);
  if (Math.abs(fatorY - 1) > 1e-6) {
    resultado = Object.fromEntries(["poseLandmarks", "leftHandLandmarks", "rightHandLandmarks", "faceLandmarks"].map((campo) => [
      campo, (resultado[campo] ?? []).map((p) => ({ ...p, y: (p.y - 0.5) * fatorY + 0.5 })),
    ]));
  }
  const pose = resultado.poseLandmarks ?? [];
  const saida = [];
  let cx = 0.5, cy = 0.5, escala = 0.3;
  if (pose.length >= 25) {
    cx = (pose[11].x + pose[12].x) / 2;
    cy = (pose[11].y + pose[12].y) / 2;
    escala = Math.max(Math.hypot(pose[11].x - pose[12].x, pose[11].y - pose[12].y), 0.05);
  }
  for (const indice of POSE) {
    const p = pose[indice];
    saida.push(...(p ? [(p.x - cx) / escala, (p.y - cy) / escala, p.z * 0.2 / escala, p.visibility ?? 0] : [0, 0, 0, 0]));
  }
  for (const mao of [resultado.leftHandLandmarks ?? [], resultado.rightHandLandmarks ?? []]) {
    if (mao.length !== 21) { saida.push(...Array(66).fill(0)); continue; }
    const origem = mao[0];
    saida.push(1, (origem.x - cx) / escala, (origem.y - cy) / escala);
    const tamanho = Math.max(Math.hypot(mao[9].x - origem.x, mao[9].y - origem.y), 0.02);
    for (const p of mao) saida.push((p.x - origem.x) / tamanho, (p.y - origem.y) / tamanho, (p.z - origem.z) / tamanho * 0.3);
  }
  const face = resultado.faceLandmarks ?? [];
  if (face.length >= 387) {
    const tamanho = Math.max(Math.hypot(face[33].x - face[263].x, face[33].y - face[263].y), 0.02);
    for (const indice of ROSTO) {
      const p = face[indice], origem = face[1];
      saida.push((p.x - origem.x) / tamanho, (p.y - origem.y) / tamanho, (p.z - origem.z) / tamanho * 0.3);
    }
  } else saida.push(...Array(60).fill(0));
  return Float32Array.from(saida, (v) => Number.isFinite(v) ? Math.max(-5, Math.min(5, v)) : 0);
}

export function sinalEmCurso(v) {
  return (v[36] > 0.5 && v[38] < 1.5) || (v[102] > 0.5 && v[104] < 1.5);
}

export function reamostrarSinal(quadros, passos = 32) {
  if (!quadros.length) throw new Error("Sequência vazia");
  return Array.from({ length: passos }, (_, i) => {
    const p = i * (quadros.length - 1) / (passos - 1);
    const a = Math.floor(p), b = Math.min(a + 1, quadros.length - 1), peso = p - a;
    return Float32Array.from(quadros[a], (v, j) => v * (1 - peso) + quadros[b][j] * peso);
  });
}

// Mesmo recorte do treino: preserva dois quadros de contexto em cada ponta.
// O rastreamento de mãos baixas continua; não deslocamos o sinal para o ombro.
export function prepararSinal(quadros) {
  const ativos = quadros.map((v, i) => sinalEmCurso(v) ? i : -1).filter((i) => i >= 0);
  const recorte = ativos.length >= 4 ? quadros.slice(Math.max(0, ativos[0] - 2), ativos.at(-1) + 3) : quadros;
  return reamostrarSinal(recorte);
}
