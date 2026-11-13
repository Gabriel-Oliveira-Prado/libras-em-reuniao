import { sinalEmCurso } from "./atributos-sinais.mjs";

// Limites de sinais isolados; ainda não segmenta conversação contínua.
export class SegmentadorDeSinais {
  constructor() { this.reiniciar(); }
  reiniciar() {
    this.quadros = [];
    this.inicio = 0;
    this.ultimoAtivo = 0;
    this.ultimoInstante = -Infinity;
    this.bloqueado = false;
    this.neutroDesde = undefined;
  }
  receber(v, instante) {
    if (instante - this.ultimoInstante < 60) return null;
    this.ultimoInstante = instante;
    const ativo = sinalEmCurso(v);
    if (!ativo) {
      this.neutroDesde ??= instante;
      if (instante - this.neutroDesde >= 320) this.bloqueado = false;
    } else this.neutroDesde = undefined;
    if (this.bloqueado) return null;
    if (ativo) {
      if (!this.quadros.length) this.inicio = instante;
      this.ultimoAtivo = instante;
      this.quadros.push(v);
    } else if (this.quadros.length) this.quadros.push(v);
    if (this.quadros.length && (instante - this.ultimoAtivo >= 320 || instante - this.inicio >= 4000)) {
      const sequencia = this.quadros;
      this.quadros = [];
      this.bloqueado = ativo;
      return sequencia.length >= 8 ? sequencia : null;
    }
    return null;
  }
}
