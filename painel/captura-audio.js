class CapturaPCM extends AudioWorkletProcessor {
  constructor() {
    super();
    this.buffer = new Float32Array(Math.round(sampleRate * 0.02));
    this.posicao = 0;
    this.ativo = true;
    this.port.onmessage = ({ data }) => {
      if (data !== "parar") return;
      if (this.posicao) this.enviar();
      this.ativo = false;
      this.port.postMessage({ tipo: "fim" });
    };
  }

  enviar() {
    const amostras = this.buffer.slice(0, this.posicao);
    this.port.postMessage({ tipo: "audio", amostras }, [amostras.buffer]);
    this.posicao = 0;
  }

  process(inputs) {
    if (!this.ativo) return false;
    const canais = inputs[0];
    if (!canais?.length) return true;
    for (let i = 0; i < canais[0].length; i += 1) {
      let valor = 0;
      for (const canal of canais) valor += canal[i] / canais.length;
      this.buffer[this.posicao++] = valor;
      if (this.posicao === this.buffer.length) this.enviar();
    }
    // A saída fica em silêncio: ouvir não deve realimentar o microfone.
    return true;
  }
}

registerProcessor("captura-pcm", CapturaPCM);
