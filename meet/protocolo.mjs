export function glosaValida(valor) {
  return typeof valor === "string" && /^[\p{L}\p{M}\p{N}$%&()+\[\]_\-{}]{1,128}$/u.test(valor);
}
export const CANAL = "libras-em-reuniao-meet-v1";
export const POSICOES = ["inferior-esquerdo", "inferior-direito", "superior-esquerdo", "superior-direito"];
export const TAMANHOS = ["pequeno", "medio", "grande"];
export function configuracao(valores = {}) {
  return { conectado: true, modo: valores.modo === "fala" ? "fala" : "sinais",
    posicao: POSICOES.includes(valores.posicao) ? valores.posicao : POSICOES[0],
    tamanho: TAMANHOS.includes(valores.tamanho) ? valores.tamanho : "medio",
    vozNoMeet: valores.vozNoMeet !== false };
}
export function ehMeet(url) {
  try { const u = new URL(url); return u.origin === "https://meet.google.com"; }
  catch { return false; }
}
export function audioValido(d) {
  return Number.isSafeInteger(d.id) && d.id > 0 && Number.isInteger(d.sampleRate) &&
    d.sampleRate >= 8000 && d.sampleRate <= 48000 && Array.isArray(d.samples) &&
    d.samples.length > 0 && d.samples.length <= d.sampleRate * 20 &&
    d.samples.every((n) => Number.isFinite(n) && Math.abs(n) <= 1) &&
    typeof d.frase === "string" && d.frase.length <= 500;
}
