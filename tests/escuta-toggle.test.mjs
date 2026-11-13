import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";
import { criarEscutaRapida } from "../painel/fala-rapida.mjs";
import { reamostrar } from "../painel/segmentacao-audio.mjs";
import { modeloValido } from "../painel/configuracao-transcricao.mjs";

const tick = () => new Promise((resolve) => setImmediate(resolve));
function ambiente({ tipo = "local", permissaoPendente = false, modeloPendente = false, moduloPendente = false } = {}) {
  const elementos = Object.fromEntries(["ouvir-microfone", "ouvir-guia", "estado-fala", "texto-fala", "tipo-escuta", "fala-parcial", "modelo-transcricao", "motor-transcricao"].map((id) => [`#${id}`, {
    value: "", maxLength: 500, eventos: {}, atributos: {},
    addEventListener(n, fn) { this.eventos[n] = fn; },
    setAttribute(n, v) { this.atributos[n] = v; },
  }]));
  elementos["#tipo-escuta"].value = tipo;
  const pedidos = [], permissoes = [], streams = [], workers = [], contextos = [], capturas = [], reconhecedores = [], frases = [], modulos = [];
  let observador, escolhido = "microfone-usb";
  const streamNovo = (fonte = "microfone") => {
    const faixa = { kind: "audio", paradas: 0, eventos: {}, stop() { this.paradas++; },
      addEventListener(n, fn) { this.eventos[n] = fn; } };
    const video = { paradas: 0, stop() { this.paradas++; }, getSettings: () => ({ displaySurface: "browser" }), addEventListener() {} };
    const tracks = fonte === "guia" ? [faixa, video] : [faixa];
    const stream = { fonte, tracks, getTracks: () => tracks, getAudioTracks: () => [faixa], getVideoTracks: () => fonte === "guia" ? [video] : [] };
    streams.push(stream); return stream;
  };
  function pedir(fonte, opcoes) {
    pedidos.push({ fonte, opcoes });
    return permissaoPendente ? new Promise((resolve, reject) => permissoes.push({ resolve, reject, fonte })) : Promise.resolve(streamNovo(fonte));
  }
  class Worker {
    mensagens = [];
    constructor(url) { this.vad = String(url).includes("vad-worker"); workers.push(this); }
    postMessage(data) {
      this.mensagens.push(data);
      if (data.tipo === "carregar" && (this.vad || !modeloPendente)) queueMicrotask(() => this.emitir({ tipo: "carregado" }));
    }
    emitir(data) { this.onmessage?.({ data }); }
    terminate() { this.terminado = true; }
  }
  class Reconhecimento {
    constructor() { reconhecedores.push(this); }
    start(faixa) { this.faixa = faixa; this.onstart(); }
    stop() { this.parou = true; }
    abort() { this.abortado = true; }
  }
  const contexto = {
    URL, console: { warn() {}, debug() {} }, setTimeout, clearTimeout, queueMicrotask,
    reamostrar, modeloValido, criarEscutaRapida: (opcoes) => criarEscutaRapida(opcoes, Reconhecimento),
    criarTranscricaoAcelerada: () => new Worker("transcricao-local"),
    document: { querySelector: (s) => elementos[s] },
    localStorage: { getItem() { return null; }, setItem() {} },
    window: { AudioWorkletNode: true }, Worker,
    navigator: { userAgent: "Chrome/145.0.0.0", mediaDevices: {
      getUserMedia: (opcoes) => pedir("microfone", opcoes), getDisplayMedia: (opcoes) => pedir("guia", opcoes),
    } },
    MediaStream: class {},
    AudioContext: class {
      sampleRate = 16000;
      constructor() {
        contextos.push(this);
        this.audioWorklet = { addModule: () => moduloPendente ? new Promise((resolve) => modulos.push(resolve)) : Promise.resolve() };
      }
      resume() { return Promise.resolve(); }
      close() { this.fechado = true; return Promise.resolve(); }
      createMediaStreamSource() { return { connect() {}, disconnect() {} }; }
    },
    AudioWorkletNode: class {
      constructor() {
        capturas.push(this); this.mensagens = [];
        this.port = { postMessage: (m) => this.mensagens.push(m) };
      }
      connect() {} disconnect() { this.desconectado = true; }
    },
    dispositivos: {
      selecionado: () => escolhido, atualizar() {},
      observar(fn) { observador = fn; },
    },
    aoTexto: (frase) => { frases.push(frase); },
  };
  const codigo = readFileSync(new URL("../painel/fala.js", import.meta.url), "utf8")
    .replace(/^import .*;\r?\n/gm, "").replace("export function", "function")
    .replaceAll("import.meta.url", '"file:///painel/fala.js"');
  vm.runInNewContext(codigo + "\nthis.parar = montarFala({ dispositivos, aoTexto });", contexto);
  return {
    elementos, pedidos, permissoes, streams, workers, contextos, capturas, reconhecedores, frases, modulos,
    parar: contexto.parar, streamNovo,
    clicar: (fonte = "microfone") => elementos[fonte === "guia" ? "#ouvir-guia" : "#ouvir-microfone"].eventos.click(),
    mudarDispositivo(removido = false) { escolhido = "outro-microfone"; observador({ tipo: "microfone", removido }); },
    asr: () => workers.filter((w) => !w.vad).at(-1),
    vad: () => workers.filter((w) => w.vad).at(-1),
  };
}
function estadoBotao(a, fonte, ligada) {
  const botao = a.elementos[fonte === "guia" ? "#ouvir-guia" : "#ouvir-microfone"];
  assert.equal(botao.disabled, false, "o mesmo botão permanece disponível para desligar imediatamente");
  assert.equal(botao.atributos["aria-pressed"], String(ligada));
  assert.equal(botao.textContent, fonte === "guia" ? ligada ? "Parar áudio da guia" : "Ouvir guia" : ligada ? "Desligar microfone" : "Ligar microfone");
}
const resultado = (texto, final = true) => Object.assign([{ transcript: texto }], { isFinal: final });

test("toggle local cancela captura e ASR pendente imediatamente, preservando texto confirmado", async () => {
  const a = ambiente();
  try {
    estadoBotao(a, "microfone", false); estadoBotao(a, "guia", false);
    a.parar.preparar(); await tick();
    assert.equal(a.pedidos.length, 0, "preparar modelo não pede microfone");
    estadoBotao(a, "microfone", false);
    await a.clicar();
    estadoBotao(a, "microfone", true);
    assert.equal(a.pedidos[0].opcoes.audio.deviceId.exact, "microfone-usb");
    a.vad().emitir({ tipo: "trecho", amostras: new Float32Array(1600) });
    let trabalho = a.asr().mensagens.at(-1);
    a.asr().emitir({ tipo: "texto", id: trabalho.id, texto: "Olá, tudo bem?" });
    a.vad().emitir({ tipo: "trecho", amostras: new Float32Array(1600) });
    trabalho = a.asr().mensagens.at(-1);
    const asr = a.asr(), vad = a.vad();
    a.clicar();
    estadoBotao(a, "microfone", false);
    assert.equal(a.streams[0].tracks[0].paradas, 1);
    assert.equal(a.contextos[0].fechado, true);
    assert.equal(a.capturas[0].desconectado, true);
    assert.deepEqual(a.capturas[0].mensagens, [], "desligar não solicita conclusão de outro trecho");
    assert.equal(asr.terminado, true);
    assert.equal(vad.terminado, true);
    asr.emitir({ tipo: "texto", id: trabalho.id, texto: "Não enviar" });
    vad.emitir({ tipo: "trecho", amostras: new Float32Array(1600) });
    assert.deepEqual(a.frases, ["Olá, tudo bem?"]);
    assert.equal(a.elementos["#texto-fala"].value, "Olá, tudo bem?");
    assert.equal(a.elementos["#estado-fala"].textContent, "Microfone desligado.");
    assert.equal(a.elementos["#modelo-transcricao"].disabled, false);
    assert.equal(a.pedidos.length, 1);
  } finally { a.parar(); }
});

test("clicar novamente durante permissão local ou rápida desliga e libera stream recebido depois", async () => {
  for (const tipo of ["local", "rapida"]) {
    const a = ambiente({ tipo, permissaoPendente: true });
    try {
      const abertura = a.clicar(); await tick();
      estadoBotao(a, "microfone", true);
      assert.equal(a.permissoes.length, 1);
      const existente = await a.parar.iniciar();
      assert.equal(existente.fonte, "microfone");
      assert.equal(a.pedidos.length, 1, "iniciar novamente não duplica pedido de acesso");
      a.clicar();
      estadoBotao(a, "microfone", false);
      const tardio = a.streamNovo();
      a.permissoes[0].resolve(tardio); await abertura;
      assert.equal(tardio.tracks[0].paradas, 1);
      assert.equal(a.capturas.length, 0);
      assert.equal(a.reconhecedores.length, 0);
      assert.equal(a.pedidos.length, 1);
      assert.equal(a.elementos["#estado-fala"].textContent, "Microfone desligado.");
      estadoBotao(a, "microfone", false);
    } finally { a.parar(); }
  }
});

test("desligar com modelo ou módulo PCM carregando invalida callbacks tardios", async () => {
  const a = ambiente({ modeloPendente: true });
  try {
    await a.clicar(); estadoBotao(a, "microfone", true);
    a.vad().emitir({ tipo: "trecho", amostras: new Float32Array(1600) });
    const worker = a.asr();
    assert.equal(worker.mensagens.some((m) => m.tipo === "transcrever"), false);
    a.clicar();
    assert.equal(worker.terminado, true);
    worker.emitir({ tipo: "carregado" });
    worker.emitir({ tipo: "texto", id: 1, texto: "Ignorar" });
    assert.deepEqual(a.frases, []);
    estadoBotao(a, "microfone", false);
  } finally { a.parar(); }
  const b = ambiente({ moduloPendente: true });
  try {
    const abertura = b.clicar(); await tick();
    assert.equal(b.modulos.length, 1);
    b.clicar();
    assert.equal(b.streams[0].tracks[0].paradas, 1);
    b.modulos[0](); await abertura;
    assert.equal(b.capturas.length, 0);
    assert.equal(b.contextos[0].fechado, true);
    estadoBotao(b, "microfone", false);
  } finally { b.parar(); }
});

test("toggle rápido aborta em vez de concluir parcial e ignora eventos tardios", async () => {
  const a = ambiente({ tipo: "rapida" });
  try {
    await a.clicar();
    const r = a.reconhecedores[0];
    r.onresult({ results: [resultado("Bom dia"), resultado("texto provisório", false)] });
    assert.equal(a.elementos["#fala-parcial"].hidden, false);
    a.clicar();
    assert.equal(r.abortado, true);
    assert.equal(r.parou, undefined, "o clique não chama a parada gradual do SpeechRecognition");
    assert.equal(a.streams[0].tracks[0].paradas, 1);
    r.onresult({ results: [resultado("Não enviar")] }); r.onend();
    await tick();
    assert.deepEqual(a.frases, ["Bom dia"]);
    assert.equal(a.elementos["#texto-fala"].value, "Bom dia");
    assert.equal(a.elementos["#fala-parcial"].hidden, true);
    assert.equal(a.reconhecedores.length, 1);
    estadoBotao(a, "microfone", false);
  } finally { a.parar(); }
});

test("trocar microfone por guia e desligar a guia libera todas as faixas e cancela transcrição", async () => {
  const a = ambiente();
  try {
    await a.clicar(); const mic = a.streams[0];
    const troca = a.clicar("guia");
    assert.equal(mic.tracks[0].paradas, 1, "trocar fonte encerra a anterior antes de abrir a próxima");
    await troca;
    estadoBotao(a, "microfone", false); estadoBotao(a, "guia", true);
    const guia = a.streams[1], asr = a.asr();
    a.vad().emitir({ tipo: "trecho", amostras: new Float32Array(1600) });
    const trabalho = asr.mensagens.at(-1);
    a.clicar("guia");
    assert.ok(guia.tracks.every((track) => track.paradas === 1), "áudio e vídeo da guia são liberados");
    asr.emitir({ tipo: "texto", id: trabalho.id, texto: "Não enviar da guia" });
    assert.deepEqual(a.frases, []);
    estadoBotao(a, "guia", false);
    assert.equal(a.pedidos.length, 2);
    assert.equal(a.pedidos[1].fonte, "guia");
  } finally { a.parar(); }
});

test("permissão negada restaura botão e seleção; trocar dispositivo não religa captura", async () => {
  const a = ambiente({ permissaoPendente: true });
  try {
    const abertura = a.clicar(); await tick();
    a.permissoes[0].reject(Object.assign(new Error("Sem permissão"), { name: "NotAllowedError" }));
    await abertura;
    estadoBotao(a, "microfone", false);
    assert.equal(a.contextos[0].fechado, true);
    assert.equal(a.elementos["#tipo-escuta"].disabled, false);
    assert.equal(a.elementos["#modelo-transcricao"].disabled, false);
    const seguinte = a.clicar(); await tick();
    a.permissoes[1].resolve(a.streamNovo()); await seguinte;
    a.mudarDispositivo();
    estadoBotao(a, "microfone", false);
    assert.equal(a.streams[0].tracks[0].paradas, 1);
    assert.equal(a.pedidos.length, 2, "a escolha de outro microfone aguarda um clique explícito");
  } finally { a.parar(); }
});

test("cancelar seletor de guia pendente libera faixas recebidas depois sem trocar o estado", async () => {
  const a = ambiente({ permissaoPendente: true });
  try {
    const abertura = a.clicar("guia"); await tick();
    estadoBotao(a, "guia", true);
    a.clicar("guia"); estadoBotao(a, "guia", false);
    const tardio = a.streamNovo("guia");
    a.permissoes[0].resolve(tardio); await abertura;
    assert.ok(tardio.tracks.every((track) => track.paradas === 1));
    assert.equal(a.capturas.length, 0);
    assert.equal(a.elementos["#estado-fala"].textContent, "Áudio da guia desligado.");
  } finally { a.parar(); }
});
