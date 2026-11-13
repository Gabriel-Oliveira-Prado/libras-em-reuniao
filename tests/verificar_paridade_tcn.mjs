import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import assert from "node:assert/strict";
import { ReconhecedorTemporal } from "../painel/tcn.mjs";

const pasta = process.argv[2];
if (!pasta) throw new Error("Informe a pasta do candidato e da referência PyTorch.");
const modelo = JSON.parse(readFileSync(resolve(pasta, "candidato-tcn.json"), "utf8"));
const referencia = JSON.parse(readFileSync(resolve(pasta, "paridade.json"), "utf8"));
const rede = new ReconhecedorTemporal(modelo);
const inicio = performance.now();
const previsto = rede.prever(referencia.entrada);
const ms = performance.now() - inicio;
let maiorErro = 0;
for (const item of previsto) {
  const esperado = referencia.probabilidades[modelo.classes.indexOf(item.className)];
  const erro = Math.abs(item.probability - esperado);
  maiorErro = Math.max(maiorErro, erro);
  assert.ok(erro < 1e-5, `${item.className}: erro ${erro}`);
}
console.log(JSON.stringify({ maiorErro, inferencia_js_ms: ms, classe: previsto[0].className }));
