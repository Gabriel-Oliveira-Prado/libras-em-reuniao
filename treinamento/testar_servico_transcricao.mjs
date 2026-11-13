import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import assert from "node:assert/strict";
import { criarTranscricaoAcelerada } from "../painel/transcricao-acelerada.mjs";
const id = process.argv[2];
if (!/^[a-p]{32}$/.test(id ?? "")) throw new Error("Informe o ID da extensão.");
const origem = "chrome-extension://" + id;
const cliente = criarTranscricaoAcelerada((url, opcoes) => fetch(url, { ...opcoes, headers: { ...opcoes.headers, Origin: origem } }));
const pasta = process.argv[3] ?? resolve(process.env.TEMP, "libras-asr-070");
const manifesto = JSON.parse(await readFile(resolve(pasta, "manifesto.json"), "utf8"));
let proximo = 0;
function pedir(data) {
  return new Promise((resolve, reject) => { cliente.onmessage = ({ data: r }) => r.tipo === "erro" ? reject(new Error(r.erro)) : resolve(r); cliente.postMessage({ ...data, id: ++proximo, modelo: "small" }); });
}
function pcm(b) {
  let dados;
  for (let p = 12; p + 8 <= b.length;) {
    const n = b.readUInt32LE(p + 4);
    if (b.toString("ascii", p, p + 4) === "data") dados = b.subarray(p + 8, p + 8 + n);
    p += 8 + n + n % 2;
  }
  if (!dados) throw new Error("WAV inválido");
  return Float32Array.from({ length: dados.length / 2 }, (_, i) => dados.readInt16LE(i * 2) / 32768);
}
const normalizar = (s) => (s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []).join(" ");
const inicio = performance.now(), resultados = [];
try {
  await pedir({ tipo: "carregar" });
  const carregamentoMs = performance.now() - inicio;
  for (const indice of [0, 2, 7]) {
    const item = manifesto[indice], amostras = pcm(await readFile(resolve(pasta, item.arquivo))), antes = performance.now();
    const r = await pedir({ tipo: "transcrever", amostras });
    assert.equal(normalizar(r.texto), normalizar(item.texto));
    resultados.push({ esperado: item.texto, obtido: r.texto, inferenciaMs: r.inferenciaMs, totalHttpMs: performance.now() - antes });
  }
  const proibido = await fetch("http://127.0.0.1:18271/health", { headers: { Origin: "https://example.invalid" } });
  assert.equal(proibido.status, 403);
  await writeFile(new URL("resultado-servico-transcricao.json", import.meta.url), JSON.stringify({ backend: "Adaptador HTTP real da extensão e serviço nativo real, pelo Node", carregamentoMs, resultados, origemEstranhaRecusada: true,
    limites: "Áudio sintetizado e chamadas HTTP. Não verifica navegador, permissão do Chrome, microfone, envio de PCM pelo AudioWorklet real, sotaques humanos, Meet ou animação do VLibras." }, null, 2) + "\n");
  console.log(JSON.stringify({ carregamentoMs, resultados, origemEstranhaRecusada: true }));
} finally { cliente.terminate(); }
