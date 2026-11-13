const distancia = (a, b) => Math.hypot(...a.map((v, i) => v - b[i]));
function angulo(a, b, c) {
  const u = a.map((v, i) => v - b[i]), v = c.map((n, i) => n - b[i]);
  return u.reduce((s, n, i) => s + n * v[i], 0) / Math.max(1e-6, Math.hypot(...u) * Math.hypot(...v));
}
function quantil(v, q) { const ordem = [...v].sort((a, b) => a - b); return ordem[Math.min(ordem.length - 1, Math.floor(q * ordem.length))] ?? 0; }

// Forma dos dedos e movimento, sem depender de rosto/roupa/fundo.
export function atributosSaudacao(sequencia) {
  const lados = [36, 102].map((inicio) => {
    const quadros = sequencia.filter((v) => v[inicio] > 0.5 && v[inicio + 2] < 1.3);
    const atributos = quadros.map((v) => {
      const p = Array.from({ length: 21 }, (_, i) => [v[inicio + 3 + i * 3], v[inicio + 4 + i * 3], v[inicio + 5 + i * 3] / 0.3]);
      return [distancia(p[4], p[8]), distancia(p[4], p[12]), distancia(p[4], p[16]), distancia(p[4], p[20]),
        ...[8, 12, 16, 20].map((tip) => distancia(p[tip], p[tip - 3])),
        ...[8, 12, 16, 20].map((tip) => angulo(p[tip - 3], p[tip - 2], p[tip])),
        v[inicio + 1], v[inicio + 2]];
    });
    return { atributos, quadros };
  });
  const principal = lados.sort((a, b) => b.atributos.length - a.atributos.length)[0];
  if (principal.atributos.length < 8) return null;
  const a = principal.atributos, saida = [];
  for (let j = 0; j < 14; j++) {
    const coluna = a.map((v) => v[j]);
    saida.push(quantil(coluna, 0.2), quantil(coluna, 0.5), quantil(coluna, 0.8));
  }
  return saida;
}

export function reconhecerSaudacao(sequencia, modelo) {
  const v = atributosSaudacao(sequencia);
  if (!v || !modelo?.habilitado) return null;
  // A forma O→I exige polegar perto do indicador, mínimo estendido,
  // indicador curvado e deslocamento. Uma pose parada não é uma saudação.
  if (v[1] > 0.35 || v[25] > 0.9 || v[34] > -0.6 || v[22] < 0.4 ||
      Math.hypot(v[38] - v[36], v[41] - v[39]) < 0.25) return null;
  const z = modelo.pesos.reduce((s, peso, i) => s + peso * (v[i] - modelo.media[i]) / modelo.escala[i], modelo.bias);
  const confianca = 1 / (1 + Math.exp(-z));
  return confianca >= modelo.limite ? { palavra: "Oi", confianca } : null;
}
