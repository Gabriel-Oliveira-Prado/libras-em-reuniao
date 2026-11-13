import { SegmentadorDeFala } from "./segmentacao-audio.mjs";

// Silero VAD v6.2: 512 amostras de áudio + 64 de contexto, estado [2,1,128].
// Detecta atividade de fala; não identifica quem está falando.
export class DetectorDeFala {
  constructor(ort, sessao) {
    this.ort = ort;
    this.sessao = sessao;
    this.estado = new ort.Tensor("float32", new Float32Array(256), [2, 1, 128]);
    this.contexto = new Float32Array(64);
    this.pendente = new Float32Array(0);
    this.segmentador = new SegmentadorDeFala(16000, { pausaMs: 320, maximoMs: 3500, minimoVozMs: 160 });
  }

  async receber(amostras) {
    const total = new Float32Array(this.pendente.length + amostras.length);
    total.set(this.pendente);
    total.set(amostras, this.pendente.length);
    const trechos = [];
    let offset = 0;
    for (; offset + 512 <= total.length; offset += 512) {
      const bloco = total.slice(offset, offset + 512);
      const entrada = new Float32Array(576);
      entrada.set(this.contexto);
      entrada.set(bloco, 64);
      const inputs = {
        input: new this.ort.Tensor("float32", entrada, [1, 576]),
        state: this.estado,
        sr: new this.ort.Tensor("int64", BigInt64Array.of(16000n), []),
      };
      const saida = await this.sessao.run(inputs);
      this.estado = saida.stateN;
      this.contexto = bloco.slice(-64);
      const limiar = this.segmentador.ativo ? 0.35 : 0.6;
      const trecho = this.segmentador.receber(bloco, saida.output.data[0] >= limiar);
      if (trecho) trechos.push(trecho);
    }
    this.pendente = total.slice(offset);
    return trechos;
  }

  async concluir() {
    const trechos = [];
    if (this.pendente.length) trechos.push(...await this.receber(new Float32Array(512 - this.pendente.length)));
    const ultimo = this.segmentador.concluir();
    if (ultimo) trechos.push(ultimo);
    return trechos;
  }
}
