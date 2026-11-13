import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ReconhecedorTemporal } from "../painel/tcn.mjs";
import { prepararSinal } from "../painel/atributos-sinais.mjs";
import { reconhecerSaudacao } from "../painel/saudacoes.mjs";
import { SegmentadorDeSinais } from "../painel/segmentacao-sinais.mjs";

const pasta = process.argv[2] || join(process.env.TEMP, "libras-comparacao-rastreadores");
const medicao = JSON.parse(readFileSync(join(pasta, "medicao.json"), "utf8"));
const modelo = JSON.parse(readFileSync(new URL("../modelos/sinais/tcn.json", import.meta.url), "utf8"));
const saudacao = JSON.parse(readFileSync(new URL("../modelos/sinais/saudacao.json", import.meta.url), "utf8"));
const rede = new ReconhecedorTemporal(modelo);
const variantes = {};
for (const variante of ["lite", "full", "heavy"]) {
  const dados = ["fluxo.json", "saudacoes.json"].flatMap((arquivo) => JSON.parse(readFileSync(join(pasta, variante, arquivo), "utf8")));
  const resultados = dados.map((item) => {
    const segmentador = new SegmentadorDeSinais(), falas = [];
    for (let i = 0; i < item.vetores.length + Math.ceil(item.fps); i++) {
      const seq = segmentador.receber(item.vetores[i] ?? Array(228).fill(0), i * 1000 / item.fps);
      if (!seq) continue;
      const oi = reconhecerSaudacao(seq, saudacao);
      if (oi) { falas.push(oi.palavra); continue; }
      const [a, b] = rede.prever(prepararSinal(seq));
      if (a.className !== "Sem sinal" && a.probability >= modelo.confianca && a.probability - b.probability >= modelo.margem) falas.push(a.className);
    }
    return { arquivo: item.arquivo, esperado: item.esperado, falas };
  });
  const conhecidos = resultados.filter((r) => r.esperado && r.esperado !== "Oi");
  const oi = resultados.filter((r) => r.esperado === "Oi");
  const outros = resultados.filter((r) => !r.esperado);
  const resumo = {
    conhecidos: conhecidos.length,
    conhecidos_corretos: conhecidos.filter((r) => r.falas.length === 1 && r.falas[0] === r.esperado).length,
    conhecidos_sem_fala: conhecidos.filter((r) => !r.falas.length).length,
    conhecidos_com_fala_errada_ou_repetida: conhecidos.filter((r) => r.falas.length && (r.falas.length !== 1 || r.falas[0] !== r.esperado)).length,
    exemplos_oi: oi.length,
    oi_corretos: oi.filter((r) => r.falas.length === 1 && r.falas[0] === "Oi").length,
    outros_sinais: outros.length,
    outros_com_fala: outros.filter((r) => r.falas.length).length,
  };
  variantes[variante] = { medicao: medicao.variantes[variante], resumo, resultados };
  console.log(JSON.stringify({ variante, ...resumo }));
}
const relatorio = { perfil_padrao: "lite", decisao: "Full e Heavy disponíveis apenas como opções experimentais. Full perdeu um acerto geral e um exemplo de Oi; Heavy produziu uma fala errada e perdeu um exemplo de Oi. Não foram aprovados para substituir o padrão. Um modelo maior de pose não demonstrou ganho na tradução de Libras neste ensaio.",
  protocolo: "Regressão exploratória: 40 vídeos conhecidos, 18 fora do vocabulário e 4 exemplos de Oi, todos já examinados em experimentos anteriores. Sem mudar TCN, saudação ou limiares de aceitação. Inclui prioridade de Oi antes da TCN e correção de proporção dos exemplos de saudação.",
  ambiente: medicao.ambiente, variantes,
  limites: "Não é uma nova validação independente. Não mede a precisão dos landmarks contra anotações humanas, o filtro de enquadramento do painel, câmera ao vivo, áudio, Chrome ou Meet. Tempos de Python CPU são descritivos; não representam latência de ponta a ponta da extensão." };
writeFileSync(new URL("./resultado-rastreamento.json", import.meta.url), JSON.stringify(relatorio, null, 2) + "\n");
