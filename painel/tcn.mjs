// Inferência do candidato TCN exportado em PyTorch. Sem código remoto.
export class ReconhecedorTemporal {
  constructor(modelo) {
    if (modelo.schema !== 1 || modelo.entradas !== 228 || modelo.passos !== 32) throw new Error("Modelo temporal incompatível");
    this.modelo = modelo;
  }

  prever(quadros) {
    const m = this.modelo, s = m.estado, passos = m.passos;
    if (quadros.length !== passos || quadros.some((v) => v.length !== m.entradas)) throw new Error("Sequência inválida");
    let x = Array.from({ length: m.canais }, (_, c) => Float32Array.from({ length: passos }, (_, t) => {
      let soma = s["entrada.bias"][c];
      for (let i = 0; i < m.entradas; i++) soma += s["entrada.weight"][c][i][0] * quadros[t][i];
      return Math.max(0, soma);
    }));
    for (let bloco = 0; bloco < m.dilatacoes.length; bloco++) {
      const d = m.dilatacoes[bloco], w = s[`blocos.${bloco}.conv.weight`], b = s[`blocos.${bloco}.conv.bias`];
      x = Array.from({ length: m.canais }, (_, c) => Float32Array.from({ length: passos }, (_, t) => {
        let soma = b[c] + x[c][t];
        for (let i = 0; i < m.canais; i++) {
          for (let k = 0; k < 3; k++) {
            const instante = t - (2 - k) * d;
            if (instante >= 0) soma += w[c][i][k] * x[i][instante];
          }
        }
        return Math.max(0, soma);
      }));
    }
    const medias = x.map((v) => v.reduce((a, b) => a + b, 0) / passos);
    const logits = m.classes.map((_, c) => s["saida.bias"][c] + medias.reduce((n, v, i) => n + s["saida.weight"][c][i] * v, 0));
    const maximo = Math.max(...logits), exp = logits.map((v) => Math.exp(v - maximo)), total = exp.reduce((a, b) => a + b);
    return m.classes.map((className, i) => ({ className, probability: exp[i] / total })).sort((a, b) => b.probability - a.probability);
  }
}
