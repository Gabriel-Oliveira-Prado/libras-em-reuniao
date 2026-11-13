// Teste HTTP do tradutor e dos bundles. Não executa o Unity nem controla navegador.
import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";

const tradutor = "https://traducao2.vlibras.gov.br/translate";
const dicionario = "https://dicionario2.vlibras.gov.br/2018.3.1/WEBGL/";
const casos = [];
for (const texto of ["Olá, tudo bem?", "Como você está?", "Onde é?", "Qual seu nome?", "Quem é você?", "Quero te conhecer.", "Tudo bem?", "Bom dia, tudo bem?"]) {
  const antes = performance.now();
  const resposta = await fetch(tradutor, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: texto }),
    signal: AbortSignal.timeout(15000),
  });
  assert.equal(resposta.status, 200);
  const glosa = (await resposta.text()).trim();
  assert.ok(glosa && !glosa.startsWith("<"));
  casos.push({ texto, glosa, traducaoMs: Math.round(performance.now() - antes) });
}
const sinais = [...new Set(casos.flatMap(({ glosa }) => glosa.split(/\s+/).filter((palavra) => !palavra.startsWith("["))))];
const bundles = await Promise.all(sinais.map(async (sinal) => {
  const antes = performance.now();
  const resposta = await fetch(dicionario + encodeURIComponent(sinal), {
    headers: { Origin: "https://vlibras.gov.br" }, signal: AbortSignal.timeout(15000),
  });
  assert.equal(resposta.status, 200, sinal);
  assert.ok(["*", "https://vlibras.gov.br"].includes(resposta.headers.get("access-control-allow-origin")), `CORS do iframe: ${sinal}`);
  const bytes = new Uint8Array(await resposta.arrayBuffer());
  assert.equal(new TextDecoder().decode(bytes.subarray(0, 7)), "UnityFS", `bundle Unity real: ${sinal}`);
  return { sinal, status: resposta.status, bytes: bytes.length, descargaMs: Math.round(performance.now() - antes), urlFinal: resposta.url, sha256: createHash("sha256").update(bytes).digest("hex") };
}));
const relatorio = {
  data: new Date().toISOString(), tradutor, dicionario, casos, bundles,
  limites: "Requisições HTTP fora do navegador. Confirma tradução, arquivos Unity e cabeçalho CORS; não confirma renderização, significado linguístico ou reprodução no Chrome/Meet.",
};
await writeFile(new URL("../treinamento/resultado-vlibras.json", import.meta.url), JSON.stringify(relatorio, null, 2) + "\n");
console.log(JSON.stringify({ casos, bundles: bundles.map(({ sinal, bytes }) => ({ sinal, bytes })), resultado: "Traduções e bundles disponíveis; animação real ainda requer validação no Chrome." }, null, 2));
