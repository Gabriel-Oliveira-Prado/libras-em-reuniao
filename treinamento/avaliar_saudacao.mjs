// Extrai atributos de sinais já rastreados. Dados e candidatos ficam no TEMP.
import fs from "node:fs";
import path from "node:path";
import { atributosSaudacao } from "../painel/saudacoes.mjs";
import { SegmentadorDeSinais } from "../painel/segmentacao-sinais.mjs";
const pasta = process.env.TEMP;
const amostras = JSON.parse(fs.readFileSync(path.join(pasta, "libras-oi/fluxo-treino-todos.json"), "utf8"));
const manifesto = JSON.parse(fs.readFileSync(path.join(pasta, "libras-minds-holistic/manifesto.json"), "utf8"));
const dados = [];
for (const item of amostras) {
  const s = new SegmentadorDeSinais();
  const quadros = [...item.vetores, ...Array.from({ length: Math.ceil(item.fps) }, () => Array(228).fill(0))];
  for (let i = 0; i < quadros.length; i++) {
    const seq = s.receber(quadros[i], i * 1000 / item.fps);
    if (!seq) continue;
    const atributos = atributosSaudacao(seq); if (!atributos) continue;
    const nome = item.nome ?? item.arquivo;
    const pessoa = nome.match(/Articulador(\d+)/)?.[1];
    const origem = manifesto.amostras.find((a) => a.arquivo === nome);
    dados.push({ nome, y: item.positivo ? 1 : 0, divisao: item.positivo ? pessoa === "1" ? "treino" : pessoa === "2" ? "validacao" : "regressao" : origem?.divisao ?? "regressao", atributos });
    break;
  }
}
fs.writeFileSync(path.join(pasta, "libras-oi/atributos-oi.json"), JSON.stringify(dados));
console.log(JSON.stringify({total:dados.length,positivos:dados.filter((a)=>a.y).map((a)=>a.nome)}));
