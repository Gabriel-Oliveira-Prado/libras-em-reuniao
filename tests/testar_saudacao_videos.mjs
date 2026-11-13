import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import assert from "node:assert/strict";
import { reconhecerSaudacao } from "../painel/saudacoes.mjs";
import { SegmentadorDeSinais } from "../painel/segmentacao-sinais.mjs";
const pasta = join(process.env.TEMP, "libras-oi");
const modelo = JSON.parse(readFileSync(new URL("../modelos/sinais/saudacao.json", import.meta.url), "utf8"));
const dados = JSON.parse(readFileSync(join(pasta, "fluxo-treino-todos.json"), "utf8"));
dados.push({ ...JSON.parse(readFileSync(join(pasta, "ines-camera.json"), "utf8")), positivo: true, arquivo: "INES-Oi.mp4" });
dados.push(...JSON.parse(readFileSync(join(pasta, "acenar.json"), "utf8")));
const resultados = dados.map((item) => {
  const segmentador = new SegmentadorDeSinais(), falas = [];
  let segmentos = 0;
  for (let i = 0; i < item.vetores.length + Math.ceil(item.fps); i++) {
    const seq = segmentador.receber(item.vetores[i] ?? Array(228).fill(0), i * 1000 / item.fps);
    if (!seq) continue;
    segmentos++;
    const leitura = reconhecerSaudacao(seq, modelo);
    if (leitura) falas.push(leitura);
  }
  return { arquivo: item.arquivo, positivo: Boolean(item.positivo), segmentos, falas };
});
const positivos = resultados.filter((r) => r.positivo), negativos = resultados.filter((r) => !r.positivo);
assert.ok(positivos.every((r) => r.falas.length === 1));
assert.ok(negativos.every((r) => !r.falas.length));
// Uma mão imóvel, mesmo contendo uma pose retirada do Oi, não vira fala.
const amostra = dados.find((a) => a.positivo), pose = amostra.vetores.find((v) => v[36] > 0.5 || v[102] > 0.5);
assert.equal(reconhecerSaudacao(Array.from({ length: 32 }, () => pose), modelo), null);
const relatorio = {
  protocolo: "Exploratório: pessoa 1 V-Librasil treino, 2 escolha de época, 3 regressão reutilizada. INES com correção da proporção real 240/176. Regras geométricas e limite ajustados após examinar estes exemplos; não é teste final independente.",
  fontes: ["https://libras.cin.ufpe.br/sign/798", "https://huggingface.co/datasets/ibmectech/v-librasil-raw/tree/d2d3e5e95574c4e0c5c20a7d82a24d52063e12d5", "https://goiaslibras.educacao.go.gov.br/sinal/oi", "https://zenodo.org/records/2667329"],
  resumo: { exemplosOi: positivos.length, exemplosOiReconhecidos: positivos.filter((r) => r.falas.length === 1).length, outrosVideos: negativos.length, outrosComSegmento: negativos.filter((r) => r.segmentos).length, outrosComFala: negativos.filter((r) => r.falas.length).length, poseImovelSemFala: true },
  limites: "Poucos exemplos positivos, parâmetros ajustados neste material e exemplos negativos que incluem treino. Não estima acurácia na webcam, em outros sinais ou em variações regionais. O aceno aberto não é traduzido como Oi. Cadastro pessoal continua disponível.", resultados,
};
writeFileSync(new URL("../treinamento/resultado-saudacao-oi.json", import.meta.url), JSON.stringify(relatorio, null, 2) + "\n");
console.log(JSON.stringify(relatorio.resumo));
