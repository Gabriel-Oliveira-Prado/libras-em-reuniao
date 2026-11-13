import { criarRegistro } from "../painel/dicionario-pessoal.mjs";

export function gesto(deslocamento = 0, ruido = 0, quadros = 24) {
  return Array.from({ length: quadros }, (_, i) => {
    const v = Array(228).fill(0), t = i / (quadros - 1);
    v[36] = 1; v[37] = deslocamento + Math.sin(t * Math.PI) * 0.5 + ruido; v[38] = -0.2 + t * 0.4;
    for (let j = 39; j < 102; j++) v[j] = Math.sin(j) * 0.1 + deslocamento * 0.2 + ruido;
    return v;
  });
}
export function cadastro(nome = "Gabriel", deslocamento = 0) {
  return criarRegistro({ nome, exemplos: [gesto(deslocamento), gesto(deslocamento, 0.001), gesto(deslocamento, -0.001)], confirmacao: gesto(deslocamento, 0.002) });
}
