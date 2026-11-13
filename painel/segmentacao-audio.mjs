export class SegmentadorDeFala {
  constructor(taxa, { limiar = 0.006, pausaMs = 450, maximoMs = 5000, minimoVozMs = 160 } = {}) {
    Object.assign(this, { taxa, limiar, pausaMs, maximoMs, minimoVozMs });
    this.reiniciar();
  }

  reiniciar() {
    this.partes = [];
    this.antes = [];
    this.total = 0;
    this.voz = 0;
    this.silencio = 0;
    this.ativo = false;
  }

  receber(amostras, vozDetectada) {
    let energia = 0;
    for (const valor of amostras) energia += valor * valor;
    const temVoz = vozDetectada ?? (amostras.length > 0 && Math.sqrt(energia / amostras.length) >= this.limiar);
    if (!this.ativo) {
      if (!temVoz) {
        this.antes.push(amostras);
        while (this.antes.reduce((n, parte) => n + parte.length, 0) > this.taxa * 0.16) this.antes.shift();
        return null;
      }
      this.ativo = true;
      this.partes = this.antes;
      this.total = this.partes.reduce((n, parte) => n + parte.length, 0);
      this.antes = [];
    }
    this.partes.push(amostras);
    this.total += amostras.length;
    if (temVoz) {
      this.voz += amostras.length;
      this.silencio = 0;
    } else this.silencio += amostras.length;
    if (this.silencio >= this.taxa * this.pausaMs / 1000 || this.total >= this.taxa * this.maximoMs / 1000) {
      return this.concluir();
    }
    return null;
  }

  concluir() {
    let audio = null;
    if (this.voz >= this.taxa * this.minimoVozMs / 1000) {
      audio = new Float32Array(this.total);
      let deslocamento = 0;
      for (const parte of this.partes) {
        audio.set(parte, deslocamento);
        deslocamento += parte.length;
      }
    }
    this.reiniciar();
    return audio;
  }
}

export function reamostrar(audio, origem, destino = 16000) {
  if (origem === destino) return audio;
  const tamanho = Math.floor(audio.length * destino / origem);
  const resultado = new Float32Array(tamanho);
  const proporcao = origem / destino;
  for (let i = 0; i < tamanho; i += 1) {
    const inicio = i * proporcao;
    const fim = Math.min(audio.length, (i + 1) * proporcao);
    let soma = 0;
    for (let j = Math.floor(inicio); j < Math.ceil(fim); j += 1) {
      soma += audio[j] * (Math.min(j + 1, fim) - Math.max(j, inicio));
    }
    resultado[i] = soma / (fim - inicio);
  }
  return resultado;
}
