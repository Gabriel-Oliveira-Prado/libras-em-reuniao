import { sinalEmCurso } from "./atributos-sinais.mjs";

// Forma dos dedos + deslocamento do punho. Ausência de mão não é movimento.
export function deslocamentoDasMaos(a, b) {
  if (!a || !b) return 0;
  let maior = 0;
  for (const base of [36, 102]) {
    if (a[base] < 0.5 || b[base] < 0.5) continue;
    const punho = Math.hypot(a[base + 1] - b[base + 1], a[base + 2] - b[base + 2]);
    let dedos = 0;
    for (let j = base + 3; j < base + 66; j += 3) dedos += Math.hypot(a[j] - b[j], a[j + 1] - b[j + 1]);
    maior = Math.max(maior, punho + dedos / 21 * 0.4);
  }
  return maior;
}

const maoVisivel = (v, b) => v[b] > 0.5 && Math.abs(v[b + 1]) < 3.5 && v[b + 2] < 2.8;
const visivel = (v) => [36, 102].some((b) => maoVisivel(v, b));

// Sinais isolados: uma/duas mãos, velocidades diferentes e pequenas perdas.
// A posição relativa ao corpo é preservada para o classificador de Libras.
export class SegmentadorDeSinais {
  constructor({ maximoMs = 10000, minimoMs = 160, pausaMs = 320, repousoMs = 1200 } = {}) {
    Object.assign(this, { maximoMs, minimoMs, pausaMs, repousoMs });
    this.reiniciar();
  }
  reiniciar() {
    this.quadros = [];
    this.antes = [];
    this.inicio = 0;
    this.ultimoAtivo = 0;
    this.ultimoMovimento = 0;
    this.fimMovimento = 0;
    this.ultimoInstante = -Infinity;
    this.anterior = undefined;
    this.bloqueado = false;
    this.neutroDesde = undefined;
    this.reinicioDesde = undefined;
    this.referencia = undefined;
    this.situacao = "pronto";
    this.iniciouBaixo = false;
    this.baixoApos = -Infinity;
    this.ultimoFim = -Infinity;
    this.semMaoDesde = undefined;
    this.referenciaMovimento = undefined;
    this.descartandoLongo = false;
    this.encadeado = false;
  }
  receber(v, instante) {
    if (instante - this.ultimoInstante < 30) return null;
    const dt = Math.min(150, instante - this.ultimoInstante);
    this.ultimoInstante = instante;
    const deslocamento = deslocamentoDasMaos(this.anterior, v);
    const movimento = deslocamento > Math.max(0.025, dt * 0.0004) || deslocamentoDasMaos(this.referenciaMovimento, v) > 0.06;
    if (movimento || !this.referenciaMovimento) this.referenciaMovimento = v;
    const presente = visivel(v);
    if (presente) this.semMaoDesde = undefined;
    else this.semMaoDesde ??= instante;
    const alto = sinalEmCurso(v);
    const ativo = alto || ((this.iniciouBaixo || (!this.quadros.length && instante >= this.baixoApos)) && presente && movimento);
    this.anterior = v;
    if (!ativo) {
      this.neutroDesde ??= instante;
      if (instante - this.neutroDesde >= this.pausaMs) this.bloqueado = false;
    } else this.neutroDesde = undefined;
    if (this.descartandoLongo) {
      if (this.neutroDesde !== undefined && instante - this.neutroDesde >= this.pausaMs) this.reiniciar();
      return null;
    }
    if (this.bloqueado) {
      // Uma nova mão sustentada também pode começar o próximo sinal.
      // A ausência de uma mão, sozinha, continua sem contar como movimento.
      const maoNova = this.encadeado && [36, 102].some((b) => !maoVisivel(this.referencia, b) && maoVisivel(v, b));
      const movimentoReinicio = movimento || maoNova;
      const deslocado = maoNova || deslocamentoDasMaos(this.referencia, v) > (this.encadeado ? 0.12 : 0.18);
      if (this.encadeado && presente && deslocado) {
        this.antes.push({ v, instante });
        this.antes = this.antes.filter((q) => instante - q.instante <= 160);
      } else if (this.encadeado && !deslocado) this.antes = [];
      if (instante - this.ultimoFim >= (this.encadeado ? 0 : 600) && presente && deslocado && movimentoReinicio) this.reinicioDesde ??= instante;
      else this.reinicioDesde = undefined;
      if (this.reinicioDesde !== undefined && instante - this.reinicioDesde >= (this.encadeado ? 60 : 100)) {
        this.bloqueado = false;
        this.reinicioDesde = undefined;
      } else return null;
    }
    if (!this.quadros.length) {
      if (this.antes.at(-1)?.instante !== instante) this.antes.push({ v, instante });
      this.antes = this.antes.filter((q) => instante - q.instante <= 160);
      if (!ativo) return null;
      this.iniciouBaixo = !alto;
      const preservarInicio = this.encadeado && this.antes.length > 0;
      this.inicio = alto && !preservarInicio ? instante : this.antes[0].instante;
      this.quadros = alto && !preservarInicio ? [v] : this.antes.map((q) => q.v);
      this.encadeado = false;
      this.antes = [];
      this.ultimoMovimento = instante;
      this.fimMovimento = this.quadros.length;
      this.ultimoAtivo = instante;
      this.situacao = "lendo";
    } else {
      this.quadros.push(v);
      if (ativo) this.ultimoAtivo = instante;
      if (movimento) {
        this.ultimoMovimento = instante;
        this.fimMovimento = this.quadros.length;
      }
    }
    const duracao = instante - this.inicio;
    // Sinais longos/lentos toleram uma interrupção um pouco maior do rastreador.
    const pausaFinal = duracao > 2400 ? Math.max(this.pausaMs, 560) : this.pausaMs;
    const perdaParcial = !presente && (v[36] > 0.5 || v[102] > 0.5);
    const pausaAusencia = perdaParcial ? Math.max(pausaFinal, 800) : pausaFinal;
    const pausa = presente ? instante - this.ultimoAtivo >= pausaFinal : instante - this.semMaoDesde >= pausaAusencia;
    const terminou = pausa ||
      (presente && instante - this.ultimoMovimento >= this.repousoMs && duracao >= 500);
    if (!terminou && duracao < this.maximoMs) return null;
    const sequencia = this.quadros;
    this.quadros = [];
    this.bloqueado = presente;
    this.referencia = v;
    // O retorno das mãos para o colo não inicia outro sinal baixo imediatamente.
    this.baixoApos = instante + 750;
    this.ultimoFim = instante;
    this.iniciouBaixo = false;
    this.reinicioDesde = undefined;
    this.encadeado = false;
    this.situacao = terminou ? "pronto" : "longo";
    this.descartandoLongo = !terminou;
    // Um movimento cortado pelo limite não vira uma palavra incompleta.
    return terminou && duracao >= this.minimoMs && sequencia.length >= 4 ? sequencia : null;
  }
  trechoEmPausa(instante) {
    if (this.descartandoLongo || this.bloqueado || this.quadros.length < 4 ||
        !this.anterior || !visivel(this.anterior) || instante - this.inicio < 350 ||
        instante - this.ultimoMovimento < 220) return null;
    // A pausa confirma a fronteira, mas não deve sobreponderar a pose final
    // nos quantis de Oi ou na comparação temporal dos sinais cadastrados.
    return this.fimMovimento >= 4 ? this.quadros.slice(0, this.fimMovimento) : null;
  }
  confirmarTrecho(instante) {
    this.quadros = [];
    this.antes = [];
    this.bloqueado = true;
    this.encadeado = true;
    this.referencia = this.anterior;
    this.referenciaMovimento = this.anterior;
    this.ultimoFim = instante;
    this.baixoApos = instante;
    this.neutroDesde = undefined;
    this.reinicioDesde = undefined;
    this.iniciouBaixo = false;
    this.situacao = "pronto";
  }
}
