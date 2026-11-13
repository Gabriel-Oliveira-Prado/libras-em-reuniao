import { readFile, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { prepararSinal, reamostrarSinal } from "../painel/atributos-sinais.mjs";
import { SegmentadorDeSinais } from "../painel/segmentacao-sinais.mjs";
import { ReconhecedorTemporal } from "../painel/tcn.mjs";
const referenciaGit = "b2c848bb4261e81e1bbc13284c1050889e96570b";
const codigo = execFileSync("git", ["show", referenciaGit + ":painel/segmentacao-sinais.mjs"], { encoding: "utf8" })
  .replace("./atributos-sinais.mjs", new URL("../painel/atributos-sinais.mjs", import.meta.url).href);
const { SegmentadorDeSinais: Antigo } = await import("data:text/javascript;base64," + Buffer.from(codigo).toString("base64"));
const dados = JSON.parse(await readFile(join(process.env.TEMP, "libras-tcn-holistic/fluxo.json"), "utf8"));
const m = JSON.parse(await readFile(new URL("../modelos/sinais/tcn.json", import.meta.url), "utf8"));
const rede = new ReconhecedorTemporal(m);
function transformar(item, velocidade, altura) {
  if (velocidade === 1) return { ...item, vetores: item.vetores.map((v) => mudarAltura(v, altura)) };
  const fps = 25, n = Math.ceil(item.vetores.length / item.fps / velocidade * fps);
  return { ...item, fps, vetores: Array.from({ length: n }, (_, i) => {
    const t = Math.min(item.vetores.length - 1, i / fps * velocidade * item.fps);
    const a = Math.floor(t), b = Math.min(a + 1, item.vetores.length - 1), p = t - a;
    const v = item.vetores[a].map((x, j) => x * (1 - p) + item.vetores[b][j] * p);
    for (const base of [36, 102]) {
      const origem = item.vetores[p < 0.5 ? a : b];
      if (item.vetores[a][base] !== item.vetores[b][base]) for (let j = base; j < base + 66; j++) v[j] = origem[j];
      v[base] = origem[base];
    }
    return mudarAltura(v, altura);
  }) };
}
function mudarAltura(v, altura) {
  const r = Array.from(v);
  for (const [base, punho] of [[36, 21], [102, 25]]) if (r[base] > 0.5) { r[base + 2] += altura; r[punho] += altura; }
  return r;
}
const cenarios = [];
for (const velocidade of [1, 0.65, 1.7]) for (const altura of [0, -0.1, 0.1]) {
  const resultados = [];
  for (const item of dados) {
    const d = transformar(item, velocidade, altura), leitura = {};
    for (const [nome, Classe, preparar] of [["anterior", Antigo, reamostrarSinal], ["atual", SegmentadorDeSinais, prepararSinal]]) {
      const s = new Classe(), falas = [];
      for (let i = 0; i < d.vetores.length + Math.ceil(d.fps); i++) {
        const seq = s.receber(d.vetores[i] ?? Array(228).fill(0), i * 1000 / d.fps);
        if (!seq) continue;
        const [a, b] = rede.prever(preparar(seq));
        if (a.className !== "Sem sinal" && a.probability >= m.confianca && a.probability - b.probability >= m.margem) falas.push(a.className);
      }
      leitura[nome] = falas;
    }
    resultados.push({ arquivo: item.arquivo, esperado: item.esperado, ...leitura });
  }
  const resumo = {};
  for (const nome of ["anterior", "atual"]) {
    const c = resultados.filter((r) => r.esperado), n = resultados.filter((r) => !r.esperado);
    resumo[nome] = { conhecidos: c.length, corretos: c.filter((r) => r[nome].length === 1 && r[nome][0] === r.esperado).length,
      semFala: c.filter((r) => !r[nome].length).length,
      erradasOuRepetidas: c.filter((r) => r[nome].length && (r[nome].length !== 1 || r[nome][0] !== r.esperado)).length,
      desconhecidos: n.length, desconhecidosComFala: n.filter((r) => r[nome].length).length };
  }
  cenarios.push({ velocidade, alturaEmLargurasDeOmbro: altura, resumo, resultados });
  console.log(JSON.stringify({ velocidade, altura, resumo }));
}
await writeFile(new URL("resultado-robustez-070.json", import.meta.url), JSON.stringify({ referenciaGit, cenarios,
  limites: "Exploratório. Landmarks de 58 vídeos já examinados, com variações sintéticas de tempo e pequenas mudanças de altura (0,10 largura dos ombros). Não são novas pessoas nem nova validação independente; não avalia acurácia de MediaPipe sobre novos pixels, línguas de sinais diferentes, webcam ao vivo, fala, Chrome ou Meet. Mesma TCN e limiares nos dois fluxos." }, null, 2) + "\n");
