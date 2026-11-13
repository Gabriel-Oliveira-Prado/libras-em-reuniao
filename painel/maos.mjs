// Os pontos e linhas indicam detecção das mãos; não são tradução de Libras.
export const LIGACOES = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [17, 18], [18, 19], [19, 20], [0, 17],
];

export function caixaDaMao(pontos, largura, altura) {
  if (!pontos?.length || !largura || !altura) return null;
  const xs = pontos.map((ponto) => ponto.x * largura);
  const ys = pontos.map((ponto) => ponto.y * altura);
  const margem = Math.max(10, Math.min(largura, altura) * 0.025);
  const x = Math.max(0, Math.min(...xs) - margem);
  const y = Math.max(0, Math.min(...ys) - margem);
  const direita = Math.min(largura, Math.max(...xs) + margem);
  const baixo = Math.min(altura, Math.max(...ys) + margem);
  return { x, y, largura: direita - x, altura: baixo - y };
}

export function desenharMaos(canvas, maos, corpo = [], rosto = []) {
  const contexto = canvas.getContext("2d");
  const { width: largura, height: altura } = canvas;
  contexto.clearRect(0, 0, largura, altura);
  contexto.lineJoin = "round";
  contexto.lineCap = "round";
  contexto.strokeStyle = "#ffffff88";
  contexto.lineWidth = 2;
  for (const [a, b] of [[11, 12], [11, 13], [13, 15], [12, 14], [14, 16], [11, 23], [12, 24], [23, 24]]) {
    if (!corpo[a] || !corpo[b] || corpo[a].visibility < 0.5 || corpo[b].visibility < 0.5) continue;
    contexto.beginPath();
    contexto.moveTo(corpo[a].x * largura, corpo[a].y * altura);
    contexto.lineTo(corpo[b].x * largura, corpo[b].y * altura);
    contexto.stroke();
  }
  // Sobrancelhas, olhos e boca ficam visíveis sem cobrir o rosto.
  contexto.strokeStyle = "#9d9fe6cc";
  contexto.lineWidth = 1.5;
  for (const linha of [[70, 63, 105, 66, 107], [336, 296, 334, 293, 300], [33, 159, 133, 145, 33], [263, 386, 362, 374, 263], [61, 40, 37, 0, 267, 270, 291, 321, 314, 17, 84, 91, 61]]) {
    if (linha.some((i) => !rosto[i])) continue;
    contexto.beginPath();
    linha.forEach((i, j) => contexto[j ? "lineTo" : "moveTo"](rosto[i].x * largura, rosto[i].y * altura));
    contexto.stroke();
  }
  for (const pontos of maos) {
    const caixa = caixaDaMao(pontos, largura, altura);
    if (!caixa) continue;
    contexto.strokeStyle = "#ffffff";
    contexto.lineWidth = 4;
    contexto.strokeRect(caixa.x, caixa.y, caixa.largura, caixa.altura);
    contexto.strokeStyle = "#846dc2";
    contexto.lineWidth = 2;
    contexto.strokeRect(caixa.x, caixa.y, caixa.largura, caixa.altura);
    contexto.strokeStyle = "#ffffff";
    contexto.lineWidth = 3;
    for (const [a, b] of LIGACOES) {
      if (!pontos[a] || !pontos[b]) continue;
      contexto.beginPath();
      contexto.moveTo(pontos[a].x * largura, pontos[a].y * altura);
      contexto.lineTo(pontos[b].x * largura, pontos[b].y * altura);
      contexto.stroke();
    }
    for (const [indice, ponto] of pontos.entries()) {
      const ponta = [4, 8, 12, 16, 20].includes(indice);
      contexto.beginPath();
      contexto.arc(ponto.x * largura, ponto.y * altura, Math.max(4.5, largura / 180) * (ponta ? 1.35 : 1), 0, Math.PI * 2);
      contexto.fillStyle = ponta ? "#11114e" : "#9d9fe6";
      contexto.fill();
      contexto.strokeStyle = "#ffffff";
      contexto.lineWidth = 1.5;
      contexto.stroke();
    }
  }
}
