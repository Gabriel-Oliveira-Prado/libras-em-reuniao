// Vídeo → landmarks → lógica real do painel → PCM neural → buffer Web Audio.
// DOM/alto-falantes são simulados; não controla navegador/câmera.
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import assert from "node:assert/strict";
import { montarSinais } from "../painel/sinais.js";
import { montarVoz } from "../painel/voz.js";
import { criarClienteVoz } from "../vozes/cliente.mjs";
const dados = JSON.parse(await readFile(resolve(process.env.TEMP, "libras-oi/ines-landmarks.json"), "utf8"));
const anteriores = Object.fromEntries(["document", "fetch", "AudioContext"].map((nome) => [nome, globalThis[nome]]));
const elementos = new Map(), fontes = [];
const elemento = () => ({ value: "", maxLength: 500, textContent: "", hidden: false, eventos: {}, addEventListener(n, fn) { this.eventos[n] = fn; }, replaceChildren() {} });
const el = (id) => { if (!elementos.has(id)) elementos.set(id, elemento()); return elementos.get(id); };
const ler = async (url) => { try { return new Response(await readFile(new URL(url))); } catch { return new Response("", { status: 404 }); } };
globalThis.document = { querySelector: el, createElement: elemento };
globalThis.fetch = ler;
globalThis.AudioContext = class {
  currentTime = 0; destination = {};
  async resume() {}
  createBuffer(_c, n, taxa) { return { duration: n / taxa, copyToChannel(v) { assert.ok(v.length && v.some((n) => Math.abs(n) > 0.01)); } }; }
  createBufferSource() { const fonte = { connect() {}, disconnect() {}, start() { fontes.push(this); }, stop() {} }; return fonte; }
};
const cliente = criarClienteVoz(class { constructor() { throw new Error("Oi deve usar a fala já preparada, sem aguardar inferência."); } }, ler);
let voz;
try {
  voz = montarVoz({ cliente, catalogo: async () => [{ id: "pf_dora", nome: "Dora" }, { id: "pm_alex", nome: "Alex" }] });
  const sinais = montarSinais({ falarSinal: voz.falarSinal }); await sinais.pronto;
  const ultima = dados.quadros.findLast((q) => q.poseLandmarks.length && q.faceLandmarks.length);
  const neutro = { ...ultima, leftHandLandmarks: [], rightHandLandmarks: [] };
  const perfis = ["pf_dora", "pm_alex"];
  for (let rodada = 0; rodada < 2; rodada++) {
    el("#perfil-voz").value = perfis[rodada]; el("#perfil-voz").eventos.change();
    const deslocamento = rodada * (dados.quadros.length * 1000 / dados.fps + 1800);
    dados.quadros.forEach((q, i) => sinais.receber(q, deslocamento + i * 1000 / dados.fps, dados.proporcao));
    for (let i = 0; i < 16; i++) sinais.receber(neutro, deslocamento + (dados.quadros.length + i) * 1000 / dados.fps, dados.proporcao);
    for (let i = 0; i < 100 && fontes.length <= rodada; i++) await new Promise((ok) => setTimeout(ok, 10));
    assert.equal(fontes.length, rodada + 1, "um novo Oi deve gerar um novo áudio");
    fontes.at(-1).onended();
    assert.equal(el("#voz-camera").hidden, true);
    assert.equal(el("#estado-voz").textContent, "");
  }
  assert.equal(el("#legenda-camera").textContent, "Oi Oi");
  console.log(JSON.stringify({ pipeline: "INES → extrairAtributos com proporção real → montarSinais → montarVoz → PCM Kokoro", falas: fontes.length, vozes: perfis, legenda: el("#legenda-camera").textContent, limite: "Landmarks reais, DOM e saída de áudio simulados. Não mede câmera/Chrome/Meet." }));
} finally { voz?.destruir(); Object.assign(globalThis, anteriores); }
