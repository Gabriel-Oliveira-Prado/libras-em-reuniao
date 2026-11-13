import { SegmentadorDeSinais } from "./segmentacao-sinais.mjs";

// Mantém a mesma prioridade e os mesmos limites do reconhecimento completo.
export function lerSinalConhecido(sequencia, { pessoais, saudacao, reconhecerSaudacao }) {
  const pessoal = pessoais?.reconhecer(sequencia);
  if (pessoal?.registro) return { palavra: pessoal.registro.nome, chave: "pessoal:" + (pessoal.registro.id ?? pessoal.registro.nome), tipo: "pessoal" };
  if (pessoal?.ambiguo) return { ambiguo: true };
  const cumprimento = reconhecerSaudacao(sequencia, saudacao);
  return cumprimento ? { ...cumprimento, chave: "saudacao:Oi", tipo: "saudacao" } : null;
}

// A TCN geral continua recebendo somente segmentos completos. O atalho de
// pausa só consome Oi/cadastros confirmados duas vezes, em quadros distintos.
export class FluxoSequencialDeSinais {
  constructor(lerConhecido) {
    this.lerConhecido = lerConhecido;
    this.segmentador = new SegmentadorDeSinais();
    this.reiniciar();
  }
  reiniciar() { this.segmentador.reiniciar(); this.confirmacao = undefined; this.ultimaConsulta = -Infinity; }
  receber(v, instante) {
    const sequencia = this.segmentador.receber(v, instante);
    if (sequencia) { this.confirmacao = undefined; return { tipo: "sequencia", sequencia }; }
    const candidato = this.segmentador.trechoEmPausa(instante);
    if (!candidato) { this.confirmacao = undefined; return null; }
    if (instante - this.ultimaConsulta < 90) return null;
    this.ultimaConsulta = instante;
    const leitura = this.lerConhecido(candidato);
    if (!leitura || leitura.ambiguo) { this.confirmacao = undefined; return null; }
    const anterior = this.confirmacao;
    if (anterior?.chave === leitura.chave && anterior.inicio === this.segmentador.inicio &&
        instante - anterior.instante >= 100 && this.segmentador.ultimoInstante > anterior.quadro) {
      this.segmentador.confirmarTrecho(instante);
      this.confirmacao = undefined;
      return { tipo: "conhecido", leitura, sequencia: candidato };
    }
    if (!anterior || anterior.chave !== leitura.chave || anterior.inicio !== this.segmentador.inicio) {
      this.confirmacao = { chave: leitura.chave, inicio: this.segmentador.inicio, instante, quadro: this.segmentador.ultimoInstante };
    }
    return null;
  }
}
