import test from "node:test";
import assert from "node:assert/strict";
import { montarFala } from "../painel/fala.js";
import { SegmentadorDeFala } from "../painel/segmentacao-audio.mjs";

test("escuta transcreve duas falas automaticamente e descarta resultado após cancelamento", async () => {
  const nomes = ["document", "window", "navigator", "Worker", "AudioContext", "AudioWorkletNode", "MediaStream", "webkitSpeechRecognition"];
  const anteriores = Object.fromEntries(nomes.map((nome) => [nome, Object.getOwnPropertyDescriptor(globalThis, nome)]));
  const elementos = {};
  for (const id of ["ouvir-microfone", "ouvir-guia", "parar-fala", "estado-fala", "texto-fala", "tipo-escuta", "fala-parcial"]) elementos[`#${id}`] = {
    value: "", maxLength: 500, eventos: {}, hidden: false,
    addEventListener(nome, acao) { this.eventos[nome] = acao; },
  };
  let captura, worker, reconhecimentoRapido, encerradas = 0, capturas = 0;
  const faixa = { stop: () => encerradas++, addEventListener() {} };
  const stream = { getTracks: () => [faixa], getAudioTracks: () => [faixa], getVideoTracks: () => [] };
  const valores = {
    document: { querySelector: (id) => elementos[id] },
    window: { AudioWorkletNode: true },
    navigator: { mediaDevices: { getUserMedia: async () => { capturas++; return stream; } } },
    webkitSpeechRecognition: class {
      constructor() { reconhecimentoRapido = this; }
      start() { this.onstart(); }
      stop() { this.onend(); }
      abort() {}
    },
    AudioContext: class {
      sampleRate = 16000;
      audioWorklet = { addModule: async () => {} };
      resume() { return Promise.resolve(); }
      close() { return Promise.resolve(); }
      createMediaStreamSource() { return { connect() {}, disconnect() {} }; }
    },
    MediaStream: class {},
    AudioWorkletNode: class {
      constructor() {
        captura = this;
        this.port = { postMessage: () => queueMicrotask(() => this.port.onmessage?.({ data: { tipo: "fim" } })) };
      }
      connect() {}
      disconnect() {}
    },
    Worker: class {
      mensagens = [];
      constructor(url) {
        this.vad = String(url).includes("vad-worker");
        if (this.vad) this.segmentador = new SegmentadorDeFala(16000);
        else worker = this;
      }
      postMessage(data) {
        this.mensagens.push(data);
        if (data.tipo === "carregar") queueMicrotask(() => this.onmessage({ data: { tipo: "carregado" } }));
        if (this.vad && data.tipo === "audio") {
          const trecho = this.segmentador.receber(data.amostras);
          if (trecho) this.onmessage({ data: { tipo: "trecho", amostras: trecho } });
        }
        if (this.vad && data.tipo === "parar") queueMicrotask(() => this.onmessage({ data: { tipo: "fim" } }));
      }
      terminate() { this.terminado = true; }
    },
  };
  for (const [nome, valor] of Object.entries(valores)) Object.defineProperty(globalThis, nome, { configurable: true, writable: true, value: valor });
  const frases = [];
  let parar;
  const enviarFala = () => {
    for (let i = 0; i < 30; i++) captura.port.onmessage({ data: { tipo: "audio", amostras: new Float32Array(320).fill(0.1) } });
    for (let i = 0; i < 30; i++) captura.port.onmessage({ data: { tipo: "audio", amostras: new Float32Array(320) } });
  };
  try {
    parar = montarFala({ aoTexto: (frase) => frases.push(frase) });
    await elementos["#ouvir-microfone"].eventos.click();
    for (const frase of ["Bom dia.", "Tudo bem?"]) {
      enviarFala();
      const trabalho = worker.mensagens.at(-1);
      assert.equal(trabalho.tipo, "transcrever");
      worker.onmessage({ data: { id: trabalho.id, tipo: "texto", texto: frase } });
      assert.equal(encerradas, 0, "a primeira transcrição não desliga o microfone");
    }
    assert.deepEqual(frases, ["Bom dia.", "Tudo bem?"]);
    assert.equal(elementos["#texto-fala"].value, "Bom dia. Tudo bem?");
    elementos["#parar-fala"].eventos.click();
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(encerradas, 1);
    assert.equal(elementos["#parar-fala"].hidden, true);
    assert.equal(elementos["#ouvir-microfone"].disabled, false);
    await elementos["#ouvir-microfone"].eventos.click();
    enviarFala();
    const atrasado = worker.mensagens.at(-1);
    parar();
    worker.onmessage({ data: { id: atrasado.id, tipo: "texto", texto: "Ignorar" } });
    assert.equal(frases.length, 2);
    assert.equal(worker.terminado, true);
    assert.equal(encerradas, 2);
    elementos["#tipo-escuta"].value = "rapida";
    elementos["#tipo-escuta"].eventos.change();
    await elementos["#ouvir-microfone"].eventos.click();
    assert.equal(capturas, 2, "modo rápido não abre a captura local em paralelo");
    assert.equal(elementos["#tipo-escuta"].disabled, true);
    reconhecimentoRapido.onresult({ resultIndex: 0, results: [Object.assign([{ transcript: "Tudo certo." }], { isFinal: true })] });
    assert.deepEqual(frases, ["Bom dia.", "Tudo bem?", "Tudo certo."]);
    elementos["#parar-fala"].eventos.click();
    assert.equal(elementos["#parar-fala"].hidden, true);
    assert.equal(elementos["#tipo-escuta"].disabled, false);
  } finally {
    parar?.();
    for (const nome of nomes) {
      if (anteriores[nome]) Object.defineProperty(globalThis, nome, anteriores[nome]);
      else delete globalThis[nome];
    }
  }
});
