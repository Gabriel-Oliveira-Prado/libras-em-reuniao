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
  let escolhido = "mic-usb", aoDispositivo;
  const pedidos = [];
  const dispositivos = { selecionado: () => escolhido, atualizar() {}, observar(fn) { aoDispositivo = fn; } };
  const faixa = { stop: () => encerradas++, addEventListener() {} };
  const stream = { getTracks: () => [faixa], getAudioTracks: () => [faixa], getVideoTracks: () => [] };
  const valores = {
    document: { querySelector: (id) => elementos[id] },
    window: { AudioWorkletNode: true },
    navigator: { userAgent: "Chrome/145.0.0.0", mediaDevices: { getUserMedia: async (pedido) => { capturas++; pedidos.push(pedido); return stream; } } },
    webkitSpeechRecognition: class {
      constructor() { reconhecimentoRapido = this; }
      start(faixa) { this.faixa = faixa; this.onstart(); }
      stop() { this.onend(); }
      abort() { this.abortado = true; }
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
    parar = montarFala({ dispositivos, aoTexto: (frase) => frases.push(frase) });
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
    assert.equal(pedidos[0].audio.deviceId.exact, "mic-usb");
    elementos["#ouvir-microfone"].eventos.click();
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
    const ultimoPcm = captura;
    await elementos["#ouvir-microfone"].eventos.click();
    assert.equal(capturas, 3, "modo rápido abre somente a faixa selecionada");
    assert.equal(captura, ultimoPcm, "modo rápido não inicia o processador Whisper/PCM em paralelo");
    assert.equal(reconhecimentoRapido.faixa, faixa);
    assert.equal(elementos["#tipo-escuta"].disabled, true);
    reconhecimentoRapido.onresult({ resultIndex: 0, results: [Object.assign([{ transcript: "Tudo certo." }], { isFinal: true })] });
    assert.deepEqual(frases, ["Bom dia.", "Tudo bem?", "Tudo certo."]);
    elementos["#ouvir-microfone"].eventos.click();
    assert.equal(elementos["#parar-fala"].hidden, true);
    assert.equal(elementos["#tipo-escuta"].disabled, false);
    await elementos["#ouvir-microfone"].eventos.click();
    const anterior = reconhecimentoRapido;
    escolhido = "mic-webcam";
    aoDispositivo({ tipo: "microfone" });
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(anterior.abortado, true);
    assert.equal(capturas, 4, "mudar dispositivo não religa o microfone automaticamente");
    await elementos["#ouvir-microfone"].eventos.click();
    assert.equal(pedidos.at(-1).audio.deviceId.exact, "mic-webcam");
    anterior.onresult({ results: [Object.assign([{ transcript: "Ignorar microfone antigo" }], { isFinal: true })] });
    assert.equal(frases.length, 3);
    aoDispositivo({ tipo: "microfone", removido: true });
    assert.equal(encerradas, 5, "cada captura iniciada foi liberada");
    assert.equal(capturas, 5, "desconexão não inicia o microfone padrão");
    assert.match(elementos["#estado-fala"].textContent, /desconectado/);
    valores.navigator.userAgent = "Chrome/134.0.0.0";
    await elementos["#ouvir-microfone"].eventos.click();
    assert.equal(capturas, 5);
    assert.match(elementos["#estado-fala"].textContent, /transcrição Local/);
  } finally {
    parar?.();
    for (const nome of nomes) {
      if (anteriores[nome]) Object.defineProperty(globalThis, nome, anteriores[nome]);
      else delete globalThis[nome];
    }
  }
});
