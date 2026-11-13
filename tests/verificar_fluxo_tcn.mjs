import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { ReconhecedorTemporal } from "../painel/tcn.mjs";
import { reamostrarSinal } from "../painel/atributos-sinais.mjs";
import { SegmentadorDeSinais } from "../painel/segmentacao-sinais.mjs";
const pasta = process.argv[2];
const m = JSON.parse(readFileSync(resolve(pasta, "candidato-tcn.json"), "utf8"));
const amostras = JSON.parse(readFileSync(resolve(pasta, "fluxo.json"), "utf8"));
const rede = new ReconhecedorTemporal(m), resultados = [];
for (const item of amostras) {
  const segmentador = new SegmentadorDeSinais(), falas = [];
  const passo = 1000 / item.fps;
  const quadros = [...item.vetores, ...Array.from({ length: Math.ceil(item.fps) }, () => Array(228).fill(0))];
  for (let i = 0; i < quadros.length; i++) {
    const seq = segmentador.receber(quadros[i], i * passo);
    if (!seq) continue;
    const [a, b] = rede.prever(reamostrarSinal(seq));
    if (a.className !== "Sem sinal" && a.probability >= m.confianca && a.probability - b.probability >= m.margem) {
      falas.push({ palavra: a.className, confianca: a.probability, instante_ms: i * passo });
    }
  }
  resultados.push({ arquivo: item.arquivo, esperado: item.esperado, falas });
}
const conhecidos = resultados.filter((i) => i.esperado), desconhecidos = resultados.filter((i) => !i.esperado);
const resumo = {
  conhecidos: conhecidos.length,
  corretos: conhecidos.filter((i) => i.falas.length === 1 && i.falas[0].palavra === i.esperado).length,
  sem_fala: conhecidos.filter((i) => !i.falas.length).length,
  falas_erradas_ou_repetidas: conhecidos.filter((i) => i.falas.length && (i.falas.length !== 1 || i.falas[0].palavra !== i.esperado)).length,
  desconhecidos: desconhecidos.length,
  desconhecidos_com_fala: desconhecidos.filter((i) => i.falas.length).length,
};
writeFileSync(process.argv[3] ?? resolve(pasta, "resultado-fluxo.json"), JSON.stringify({ resumo, resultados,
  limites: "Simula a segmentação real sobre landmarks dos vídeos, com 1 s neutro ao final. Não mede câmera do usuário, voz ou Meet. Sem ajuste posterior nos resultados." }, null, 2) + "\n");
console.log(JSON.stringify(resumo));
