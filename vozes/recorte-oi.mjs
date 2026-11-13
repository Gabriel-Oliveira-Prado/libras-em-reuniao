// Recorta apenas a primeira palavra de "Oi! Tudo bem?" na primeira pausa.
// Enunciados curtos são uma limitação conhecida do Kokoro v1.0.
export function recortarOi(samples, sampleRate = 24000) {
  const bloco = Math.round(sampleRate * 0.02);
  const niveis = Array.from({ length: Math.floor(samples.length / bloco) }, (_, i) => {
    const trecho = samples.subarray(i * bloco, (i + 1) * bloco);
    return Math.sqrt(trecho.reduce((s, n) => s + n * n, 0) / trecho.length);
  });
  const limiar = Math.max(0.004, Math.max(...niveis) * 0.08);
  const primeiro = niveis.findIndex((n) => n > limiar);
  let silencio = 0, fim;
  for (let i = primeiro + 10; primeiro >= 0 && i < niveis.length; i++) {
    silencio = niveis[i] < limiar ? silencio + 1 : 0;
    if (silencio >= 2) { fim = i * bloco; break; }
  }
  if (!fim || fim / sampleRate > 0.8) throw new Error("Esta voz não produziu uma pausa segura depois de Oi. Escolha outra voz.");
  return samples.slice(0, fim);
}
