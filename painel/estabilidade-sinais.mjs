export class EstabilizadorDeSinais {
  constructor({ confiancaMinima = 0.9, margemMinima = 0.2, leituras = 3, duracaoMs = 300, pausaMs = 350 } = {}) {
    Object.assign(this, { confiancaMinima, margemMinima, leituras, duracaoMs, pausaMs });
    this.candidato = null;
    this.inicio = 0;
    this.contagem = 0;
    this.ausenteDesde = null;
    this.bloqueado = false;
  }

  semSinal(instante) {
    this.candidato = null;
    this.contagem = 0;
    this.ausenteDesde ??= instante;
    if (instante - this.ausenteDesde >= this.pausaMs) this.bloqueado = false;
  }

  receber(predicoes, instante) {
    const ordem = [...predicoes].sort((a, b) => b.probability - a.probability);
    const [principal, segunda] = ordem;
    const neutro = /^(sem sinal|nenhum sinal|nada|neutro|outro|fundo|background)$/i;
    if (!principal || neutro.test(principal.className.trim()) ||
        principal.probability < this.confiancaMinima ||
        principal.probability - (segunda?.probability ?? 0) < this.margemMinima) {
      this.semSinal(instante);
      return null;
    }
    this.ausenteDesde = null;
    if (this.bloqueado) return null;
    if (this.candidato !== principal.className) {
      this.candidato = principal.className;
      this.inicio = instante;
      this.contagem = 1;
    } else {
      this.contagem += 1;
    }
    if (this.contagem < this.leituras || instante - this.inicio < this.duracaoMs) return null;
    this.bloqueado = true;
    return principal.className.trim();
  }
}
