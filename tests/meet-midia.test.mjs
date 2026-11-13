import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const codigo = await readFile(new URL("../meet/midia-main.js", import.meta.url), "utf8");
const CANAL = "libras-em-reuniao-meet-v1";
const ORIGEM = "https://meet.google.com";
class Eventos {
  eventos = new Map();
  addEventListener(nome, fn) {
    if (!this.eventos.has(nome)) this.eventos.set(nome, new Set());
    this.eventos.get(nome).add(fn);
  }
  removeEventListener(nome, fn) { this.eventos.get(nome)?.delete(fn); }
  dispatchEvent(evento) {
    for (const fn of [...(this.eventos.get(evento.type) || [])]) fn(evento);
  }
}
function ambiente(opcoes = {}) {
  const emitidas = [], chamadas = [], capturadas = [], contextos = [], canvases = [], videos = [];
  const intervalos = new Map(), prazos = new Map();
  let tempo = 0, proximoIntervalo = 0, idFaixa = 0, liberarPermissao, liberarVideo;
  class Faixa extends Eventos {
    constructor(kind, settings = {}) {
      super();
      this.kind = kind;
      this.id = "faixa-" + ++idFaixa;
      this.label = "Dispositivo " + kind;
      this.readyState = "live";
      this.valorHabilitado = true;
      this.valorMute = false;
      this.settings = settings;
      this.restricoes = {};
      this.paradas = 0;
    }
    get enabled() { return this.valorHabilitado; }
    set enabled(valor) { this.valorHabilitado = Boolean(valor); }
    get muted() { return this.valorMute; }
    stop() { this.readyState = "ended"; this.paradas++; }
    clone() {
      const clone = new Faixa(this.kind, this.settings);
      clone.enabled = this.enabled;
      return clone;
    }
    getSettings() { return { ...this.settings }; }
    getCapabilities() { return { width: { min: 16, max: 1920 } }; }
    getConstraints() { return this.restricoes; }
    async applyConstraints(restricoes) { this.restricoes = restricoes; }
    terminarExternamente() { this.readyState = "ended"; this.dispatchEvent({ type: "ended" }); }
    alterarMute(valor) { this.valorMute = valor; this.dispatchEvent({ type: valor ? "mute" : "unmute" }); }
  }
  class Stream {
    constructor(faixas = []) { this.faixas = faixas; }
    getTracks() { return [...this.faixas]; }
    getVideoTracks() { return this.faixas.filter(f => f.kind === "video"); }
    getAudioTracks() { return this.faixas.filter(f => f.kind === "audio"); }
  }
  class NoAudio {
    conexoes = new Set();
    disconnect(alvo) { if (alvo) this.conexoes.delete(alvo); else this.conexoes.clear(); }
    connect(alvo) { this.conexoes.add(alvo); return alvo; }
  }
  class Audio extends Eventos {
    constructor() {
      super();
      this.state = opcoes.suspenso ? "suspended" : "running";
      this.currentTime = 0;
      this.destination = { altoFalante: true };
      this.fontes = [];
      this.entradas = [];
      this.destinos = [];
      this.resumes = 0;
      contextos.push(this);
    }
    createMediaStreamSource(stream) {
      const no = new NoAudio();
      no.stream = stream;
      this.entradas.push(no);
      return no;
    }
    createMediaStreamDestination() {
      const no = new NoAudio();
      no.stream = new Stream([new Faixa("audio", { sampleRate: 48000 })]);
      this.destinos.push(no);
      return no;
    }
    createBuffer(canais, quantidade, taxa) {
      assert.equal(canais, 1);
      const amostras = new Float32Array(quantidade);
      return { duration: quantidade / taxa, sampleRate: taxa, getChannelData: () => amostras };
    }
    createBufferSource() {
      const no = new NoAudio();
      no.start = inicio => { no.inicio = inicio; no.iniciada = true; };
      no.stop = () => { no.parada = true; no.onended?.(); };
      this.fontes.push(no);
      return no;
    }
    async resume() {
      this.resumes++;
      if (opcoes.resumePendente) return new Promise(() => {});
      if (opcoes.resumeRecusado) throw new Error("Autoplay bloqueado");
      this.state = "running"; this.onstatechange?.();
    }
    async close() { this.state = "closed"; this.onstatechange?.(); }
  }
  class Bitmap {
    constructor(width = 240, height = 320) { this.width = width; this.height = height; this.fechado = false; }
    close() { this.fechado = true; }
  }
  const documento = new Eventos();
  documento.createElement = nome => {
    if (nome === "video") {
      const video = {
        videoWidth: 1280, videoHeight: 720,
        async play() {
          if (opcoes.falhaVideo) throw new Error("Vídeo indisponível");
          if (opcoes.videoPendente) return new Promise(resolve => { liberarVideo = resolve; });
        },
        pause() { this.pausado = true; }
      };
      videos.push(video);
      return video;
    }
    assert.equal(nome, "canvas");
    const canvas = { width: 0, height: 0, desenhos: [] };
    const desenho = {
      drawImage(imagem, ...args) {
        if (opcoes.falhaDesenho) throw new Error("Desenho indisponível");
        canvas.desenhos.push({ imagem, args });
      },
      fillRect() {},
      clearRect() {}
    };
    canvas.getContext = () => desenho;
    canvas.captureStream = taxa => {
      assert.equal(taxa, 25);
      if (opcoes.falhaCanvas) throw new Error("Canvas indisponível");
      return new Stream([new Faixa("video", { width: canvas.width, height: canvas.height, frameRate: taxa })]);
    };
    canvases.push(canvas);
    return canvas;
  };
  const janela = new Eventos();
  janela.AudioContext = Audio;
  janela.ImageBitmap = Bitmap;
  janela.postMessage = mensagem => emitidas.push(mensagem);
  const local = { hostname: "meet.google.com", protocol: "https:", origin: ORIGEM };
  const navegacao = { userActivation: { hasBeenActive: opcoes.hasBeenActive === true }, mediaDevices: {
    async getUserMedia(restricoes) {
      chamadas.push(restricoes);
      if (opcoes.falhaPermissao) throw new Error("Permissão recusada");
      if (opcoes.permissaoPendente) await new Promise(resolve => { liberarPermissao = resolve; });
      const faixas = [];
      if (restricoes.video) faixas.push(new Faixa("video", { width: 1280, height: 720, deviceId: "camera-usb", groupId: "usb" }));
      if (restricoes.audio) faixas.push(new Faixa("audio", { deviceId: "microfone-usb", groupId: "usb", echoCancellation: true }));
      if (opcoes.audioPrimeiro) faixas.sort((a, b) => a.kind === "audio" ? -1 : 1);
      const stream = new Stream(faixas);
      capturadas.push(stream);
      return stream;
    }
  } };
  const contextoVm = vm.createContext({
    window: janela, document: documento, navigator: navegacao, location: local,
    MediaStream: Stream, Event, performance: { now: () => tempo },
    setInterval(fn, intervalo) { const id = ++proximoIntervalo; intervalos.set(id, { fn, intervalo }); return id; },
    clearInterval(id) { intervalos.delete(id); },
    setTimeout(fn, espera) { const id = ++proximoIntervalo; prazos.set(id, { fn, instante: tempo + espera }); return id; },
    clearTimeout(id) { prazos.delete(id); }
  });
  vm.runInContext(codigo, contextoVm);
  const enviar = (dados, opcoesEvento = {}) => janela.dispatchEvent({
    type: "message", data: { canal: CANAL, sessao: "sessao-teste", ...dados },
    source: opcoesEvento.source ?? janela, origin: opcoesEvento.origin ?? ORIGEM
  });
  const configurar = config => enviar({ tipo: "config", config: {
    conectado: true, modo: "fala", posicao: "inferior-esquerdo", tamanho: "medio", vozNoMeet: true, ...config
  } });
  const avancar = ms => {
    tempo += ms;
    for (const [id, prazo] of [...prazos]) if (prazo.instante <= tempo) { prazos.delete(id); prazo.fn(); }
    for (const intervalo of [...intervalos.values()]) intervalo.fn();
  };
  const audio = (id = 1, segundos = 1, dados = {}) => enviar({
    tipo: "audio", id, samples: Array(Math.round(8000 * segundos)).fill(0.25),
    sampleRate: 8000, frase: "Oi Gabriel", ...dados
  });
  return {
    enviar, configurar, avancar, audio, emitirClique: isTrusted => documento.dispatchEvent({ type: "click", isTrusted }),
    capturar: r => navegacao.mediaDevices.getUserMedia(r),
    liberarPermissao: () => liberarPermissao?.(), liberarVideo: () => liberarVideo?.(),
    emitidas, chamadas, capturadas, contextos, canvases, videos, Bitmap, intervalos, prazos, Faixa,
    ultimoStatus: () => emitidas.filter(m => m.tipo === "midia-status").at(-1),
    respostaAudio: id => emitidas.findLast(m => m.tipo === "audio-recebido" && m.id === id)
  };
}

test("prepara somente vídeo antes da conexão; origem, fonte e sessão inválidas não integram áudio nem avatar", async () => {
  const e = ambiente();
  const restricoes = { video: { deviceId: { exact: "camera-usb" } }, audio: true };
  const original = await e.capturar(restricoes);
  assert.notEqual(original.getVideoTracks()[0], e.capturadas[0].getVideoTracks()[0]);
  assert.equal(original.getAudioTracks()[0], e.capturadas[0].getAudioTracks()[0]);
  assert.equal(e.chamadas.length, 1);
  assert.equal(e.chamadas[0], restricoes);
  assert.equal(e.contextos.length, 0);
  e.avancar(40);
  assert.equal(e.canvases[0].desenhos.at(-1).imagem, e.videos[0]);
  e.enviar({ tipo: "config", config: {
    conectado: true, modo: "fala", posicao: "inferior-esquerdo", tamanho: "medio", vozNoMeet: true
  } }, { origin: "https://outro.example" });
  e.enviar({ tipo: "config", config: {
    conectado: true, modo: "fala", posicao: "inferior-esquerdo", tamanho: "medio", vozNoMeet: true
  } }, { source: {} });
  assert.equal(await e.capturar({ audio: true }), e.capturadas[1]);
  e.configurar();
  e.audio(1, 1, { sessao: "outra-sessao" });
  assert.equal(e.respostaAudio(1), undefined);
  assert.equal(e.contextos.length, 0);
});

test("compõe câmera e avatar nos quatro cantos, fecha cada bitmap e confirma o quadro", async () => {
  const e = ambiente();
  e.configurar();
  const composto = await e.capturar({ video: true });
  assert.notEqual(composto, e.capturadas[0]);
  assert.notEqual(composto.getVideoTracks()[0], e.capturadas[0].getVideoTracks()[0]);
  const camera = e.canvases[0];
  for (const [indice, posicao] of ["inferior-esquerdo", "inferior-direito", "superior-esquerdo", "superior-direito"].entries()) {
    e.configurar({ posicao });
    const bitmap = new e.Bitmap(240, 320);
    e.enviar({ tipo: "avatar-frame", quadro: indice, bitmap });
    assert.equal(bitmap.fechado, true);
    assert.equal(e.emitidas.at(-1).tipo, "avatar-frame-ack");
    assert.equal(e.emitidas.at(-1).quadro, indice);
    e.avancar(40);
    const ultimo = camera.desenhos.at(-1);
    assert.equal(ultimo.imagem, e.canvases[1]);
    const [x, y, w, h] = ultimo.args;
    assert.equal(h, 720 * 0.28);
    assert.equal(w / h, 240 / 320);
    assert.equal(x, posicao.endsWith("esquerdo") ? 18 : 1280 - w - 18);
    assert.equal(y, posicao.startsWith("superior") ? 18 : 720 - h - 18);
    assert.equal(e.ultimoStatus().avatar, true);
  }
  e.configurar({ tamanho: "pequeno" });
  e.avancar(40);
  assert.equal(camera.desenhos.at(-1).args[3], 720 * 0.22);
  e.configurar({ tamanho: "grande" });
  e.avancar(40);
  assert.equal(camera.desenhos.at(-1).args[3], 720 * 0.35);
});

test("avatar expirado, inválido ou fora do modo fala nunca mantém uma animação falsa", async () => {
  const e = ambiente();
  e.configurar();
  await e.capturar({ video: true });
  const bitmap = new e.Bitmap();
  e.enviar({ tipo: "avatar-frame", quadro: 3, bitmap });
  e.avancar(40);
  assert.equal(e.ultimoStatus().avatar, true);
  e.avancar(2501);
  assert.equal(e.ultimoStatus().avatar, false);
  assert.match(e.ultimoStatus().erro, /parou de enviar/);
  const camera = e.canvases[0];
  assert.equal(camera.desenhos.at(-1).imagem, e.videos[0]);
  const grande = new e.Bitmap(321, 320);
  e.enviar({ tipo: "avatar-frame", quadro: 4, bitmap: grande });
  assert.equal(grande.fechado, true);
  assert.equal(e.emitidas.at(-1).quadro, 4);
  e.configurar({ modo: "sinais" });
  const foraDoModo = new e.Bitmap();
  e.enviar({ tipo: "avatar-frame", quadro: 5, bitmap: foraDoModo });
  e.avancar(40);
  assert.equal(foraDoModo.fechado, true);
  assert.equal(e.ultimoStatus().avatar, false);
  assert.equal(camera.desenhos.at(-1).imagem, e.videos[0]);
});

test("mixer preserva microfone, agenda PCM em ordem e cancela sem tocar nos alto-falantes", async () => {
  const e = ambiente();
  e.configurar();
  await e.capturar({ audio: true });
  const ctx = e.contextos[0];
  const destino = ctx.destinos[0];
  assert.equal(ctx.entradas[0].conexoes.has(destino), true);
  assert.equal(ctx.entradas[0].conexoes.has(ctx.destination), false);
  e.audio(1);
  e.audio(2);
  const [primeira, segunda] = ctx.fontes;
  assert.equal(e.respostaAudio(1).aceito, true);
  assert.equal(e.respostaAudio(2).aceito, true);
  assert.equal(primeira.buffer.getChannelData(0)[0], 0.25);
  assert.ok(segunda.inicio >= primeira.inicio + primeira.buffer.duration + 0.039);
  assert.equal(primeira.conexoes.has(destino), true);
  assert.equal(primeira.conexoes.has(ctx.destination), false);
  e.enviar({ tipo: "audio-parar" });
  assert.equal(primeira.parada, true);
  assert.equal(segunda.parada, true);
  e.audio(3);
  assert.equal(ctx.fontes[2].inicio, 0.02);
  assert.equal(e.respostaAudio(3).aceito, true);
});

test("recusa PCM inválido e fila maior que 15 segundos com ACK negativo", async () => {
  const e = ambiente();
  e.configurar();
  await e.capturar({ audio: true });
  e.audio(1, 8);
  e.audio(2, 7);
  assert.equal(e.respostaAudio(1).aceito, true);
  assert.equal(e.respostaAudio(2).aceito, false);
  assert.match(e.respostaAudio(2).erro, /fila/);
  for (const [indice, dados] of [
    { samples: [Number.NaN] },
    { samples: [2] },
    { sampleRate: 7999 },
    { samples: [0.1], frase: "x".repeat(501) },
    { samples: [0.1], sampleRate: 48001 },
    { samples: Array(160001).fill(0), sampleRate: 8000 }
  ].entries()) {
    e.audio(indice + 10, 1, dados);
    assert.equal(e.respostaAudio(indice + 10).aceito, false);
    assert.match(e.respostaAudio(indice + 10).erro, /inválido/);
  }
  assert.equal(e.contextos[0].fontes.length, 1);
});

test("sem microfone, com mute ou voz desativada não envia nem desmuta áudio", async () => {
  const e = ambiente();
  e.configurar();
  e.audio(1);
  assert.equal(e.respostaAudio(1).aceito, false);
  assert.match(e.respostaAudio(1).erro, /Reconecte o microfone/);
  const capturado = await e.capturar({ audio: true });
  const saida = capturado.getAudioTracks()[0];
  const original = e.capturadas[0].getAudioTracks()[0];
  saida.enabled = false;
  e.audio(2);
  assert.equal(e.respostaAudio(2).aceito, false);
  assert.equal(original.enabled, false);
  assert.equal(saida.enabled, false);
  saida.enabled = true;
  e.audio(3);
  assert.equal(e.respostaAudio(3).aceito, true);
  original.alterarMute(true);
  assert.equal(saida.muted, true);
  assert.equal(e.contextos[0].fontes[0].parada, true);
  e.audio(4);
  assert.equal(e.respostaAudio(4).aceito, false);
  original.alterarMute(false);
  e.configurar({ vozNoMeet: false });
  e.audio(5);
  assert.equal(e.respostaAudio(5).aceito, false);
  assert.equal(e.contextos[0].fontes.length, 1);
});

test("autoplay suspenso preserva mic original e exige clique real e recaptura para enviar PCM", async () => {
  const e = ambiente({ suspenso: true });
  e.configurar();
  const recebido = await e.capturar({ audio: true });
  const micOriginal = e.capturadas[0].getAudioTracks()[0];
  assert.equal(recebido.getAudioTracks()[0], micOriginal);
  assert.equal(micOriginal.enabled, true);
  assert.equal(e.contextos[0].entradas.length, 0);
  assert.equal(e.ultimoStatus().audio, false);
  assert.equal(e.ultimoStatus().ativarAudio, true);
  assert.match(e.ultimoStatus().erro, /original foi preservado/);
  e.audio(1);
  assert.equal(e.respostaAudio(1).aceito, false);
  e.emitirClique(false);
  assert.equal(e.contextos[0].resumes, 0);
  e.emitirClique(true);
  await Promise.resolve();
  assert.equal(e.contextos[0].resumes, 1);
  assert.equal(e.ultimoStatus().ativarAudio, false);
  assert.match(e.ultimoStatus().erro, /Desative e ative/);
  e.audio(2);
  assert.equal(e.respostaAudio(2).aceito, false);
  const recapturado = await e.capturar({ audio: true });
  assert.notEqual(recapturado.getAudioTracks()[0], e.capturadas[1].getAudioTracks()[0]);
  assert.equal(e.contextos.length, 1);
  e.audio(3);
  assert.equal(e.respostaAudio(3).aceito, true);
  assert.equal(e.ultimoStatus().audio, true);
  assert.equal(micOriginal.readyState, "live");
});

test("stop e clones preservam a fonte até a última faixa e repassam configurações", async () => {
  const e = ambiente();
  e.configurar();
  const composto = await e.capturar({ video: true, audio: true });
  for (const faixa of composto.getTracks()) {
    const fonte = e.capturadas[0].getTracks().find(f => f.kind === faixa.kind);
    assert.equal(faixa.getSettings().deviceId, fonte.getSettings().deviceId);
    assert.equal(faixa.label, fonte.label);
    assert.deepEqual(faixa.getCapabilities(), fonte.getCapabilities());
    await faixa.applyConstraints({ width: { ideal: 800 } });
    assert.deepEqual(faixa.getConstraints(), { width: { ideal: 800 } });
    const copia = faixa.clone();
    faixa.enabled = false;
    assert.equal(fonte.enabled, true);
    const copiaDesativada = faixa.clone();
    assert.equal(copiaDesativada.enabled, false);
    faixa.stop();
    copiaDesativada.stop();
    assert.equal(fonte.readyState, "live");
    assert.equal(copia.readyState, "live");
    copia.stop();
    assert.equal(fonte.readyState, "ended");
    assert.equal(fonte.paradas, 1);
  }
  assert.equal(e.contextos[0].state, "closed");
  assert.equal(e.videos[0].pausado, true);
  assert.equal(e.videos[0].srcObject, null);
  assert.equal(e.ultimoStatus().camera, false);
  assert.equal(e.ultimoStatus().audio, false);
  assert.equal(e.intervalos.size, 1); // apenas o watchdog sem faixas de mídia
});

test("fim da fonte encerra e notifica as faixas derivadas e suas cópias", async () => {
  const e = ambiente();
  e.configurar();
  const composto = await e.capturar({ audio: true });
  const saida = composto.getAudioTracks()[0], copia = saida.clone();
  let avisos = 0;
  saida.addEventListener("ended", () => avisos++);
  copia.addEventListener("ended", () => avisos++);
  e.capturadas[0].getAudioTracks()[0].terminarExternamente();
  assert.equal(saida.readyState, "ended");
  assert.equal(copia.readyState, "ended");
  assert.equal(avisos, 2);
  assert.equal(e.contextos[0].state, "closed");
});

test("desconectar remove avatar e PCM preservando câmera e microfone da chamada", async () => {
  const e = ambiente();
  e.configurar();
  const composto = await e.capturar({ video: true, audio: true });
  e.enviar({ tipo: "avatar-frame", quadro: 9, bitmap: new e.Bitmap() });
  e.audio(1);
  e.avancar(40);
  assert.equal(e.ultimoStatus().avatar, true);
  e.enviar({ tipo: "desconectar" });
  e.avancar(40);
  assert.equal(e.ultimoStatus().avatar, false);
  assert.equal(e.contextos[0].fontes[0].parada, true);
  assert.equal(e.canvases[0].desenhos.at(-1).imagem, e.videos[0]);
  assert.equal(composto.getTracks().every(f => f.readyState === "live"), true);
  assert.equal(e.capturadas[0].getTracks().every(f => f.readyState === "live"), true);
  assert.equal(e.contextos[0].entradas[0].conexoes.has(e.contextos[0].destinos[0]), true);
  e.audio(2);
  assert.equal(e.respostaAudio(2).aceito, false);
});

test("falha na composição devolve o stream original e não encerra dispositivos", async () => {
  const e = ambiente({ falhaCanvas: true });
  e.configurar();
  const recebido = await e.capturar({ audio: true, video: true });
  assert.equal(recebido, e.capturadas[0]);
  assert.equal(recebido.getTracks().every(f => f.readyState === "live"), true);
  assert.match(e.ultimoStatus().erro, /originais/);
  assert.equal(e.videos[0].pausado, true);
});

test("recusa nativa de permissão é preservada e não solicita uma nova captura", async () => {
  const e = ambiente({ falhaPermissao: true });
  e.configurar();
  await assert.rejects(e.capturar({ video: true }), /Permissão recusada/);
  assert.equal(e.chamadas.length, 1);
  assert.match(e.ultimoStatus().erro, /permissões/);
});

test("play de câmera pendente tem prazo e libera o mixer parcial sem encerrar dispositivos originais", async () => {
  const e = ambiente({ videoPendente: true, audioPrimeiro: true });
  e.configurar();
  const pendente = e.capturar({ audio: true, video: true });
  await new Promise(setImmediate);
  assert.equal(e.contextos.length, 1);
  assert.equal(e.prazos.size, 1);
  e.avancar(15001);
  const devolvido = await pendente;
  assert.equal(devolvido, e.capturadas[0]);
  assert.equal(e.contextos[0].state, "closed");
  assert.equal(e.videos[0].srcObject, null);
  assert.equal(e.prazos.size, 0);
  assert.equal(devolvido.getTracks().every(f => f.readyState === "live"), true);
  assert.match(e.ultimoStatus().erro, /originais/);
});

test("desconectar cancela abertura de câmera pendente imediatamente", async () => {
  const e = ambiente({ videoPendente: true, audioPrimeiro: true });
  e.configurar();
  const pendente = e.capturar({ audio: true, video: true });
  await new Promise(setImmediate);
  assert.equal(e.prazos.size, 1);
  e.enviar({ tipo: "desconectar" });
  const devolvido = await pendente;
  assert.equal(devolvido, e.capturadas[0]);
  assert.equal(e.contextos[0].state, "closed");
  assert.equal(e.videos[0].srcObject, null);
  assert.equal(e.prazos.size, 0);
  assert.equal(devolvido.getTracks().every(f => f.readyState === "live"), true);
});

test("watchdog libera fontes quando o Meet usa stop diretamente no protótipo nativo", async () => {
  const e = ambiente();
  e.configurar();
  const composto = await e.capturar({ audio: true, video: true });
  for (const faixa of composto.getTracks()) e.Faixa.prototype.stop.call(faixa);
  assert.equal(e.capturadas[0].getTracks().every(f => f.readyState === "live"), true);
  e.avancar(250);
  assert.equal(e.capturadas[0].getTracks().every(f => f.readyState === "ended"), true);
  assert.equal(e.contextos[0].state, "closed");
  assert.equal(e.videos[0].srcObject, null);
});

test("voz no Meet desativada preserva o microfone original sem criar AudioContext", async () => {
  const e = ambiente({ suspenso: true });
  e.configurar({ vozNoMeet: false });
  const composto = await e.capturar({ video: true, audio: true });
  const fonteMic = e.capturadas[0].getAudioTracks()[0];
  assert.equal(composto.getAudioTracks()[0], fonteMic);
  assert.notEqual(composto.getVideoTracks()[0], e.capturadas[0].getVideoTracks()[0]);
  assert.equal(e.contextos.length, 0);
  assert.equal(e.ultimoStatus().audio, false);
  assert.equal(fonteMic.enabled, true);
  e.configurar({ vozNoMeet: true });
  e.audio(31);
  assert.equal(e.respostaAudio(31).aceito, false);
  assert.match(e.respostaAudio(31).erro, /Reconecte o microfone/);
});

test("ativação anterior tenta liberar contexto sem impedir captura nativa se autoplay continua bloqueado", async () => {
  const permitido = ambiente({ suspenso: true, hasBeenActive: true });
  permitido.configurar();
  const integrado = await permitido.capturar({ audio: true });
  assert.equal(permitido.contextos[0].resumes, 1);
  assert.notEqual(integrado.getAudioTracks()[0], permitido.capturadas[0].getAudioTracks()[0]);
  permitido.audio(40);
  assert.equal(permitido.respostaAudio(40).aceito, true);
  for (const opcoes of [{ resumeRecusado: true }, { resumePendente: true }]) {
    const bloqueado = ambiente({ suspenso: true, hasBeenActive: true, ...opcoes });
    bloqueado.configurar();
    const original = await bloqueado.capturar({ audio: true });
    assert.equal(bloqueado.contextos[0].resumes, 1);
    assert.equal(original.getAudioTracks()[0], bloqueado.capturadas[0].getAudioTracks()[0]);
    assert.equal(original.getAudioTracks()[0].enabled, true);
    assert.equal(bloqueado.ultimoStatus().audio, false);
    assert.equal(bloqueado.ultimoStatus().ativarAudio, true);
  }
});

test("desconectar ou desativar voz libera contexto de preparação sem tocar no mic original", async () => {
  for (const desligar of [
    e => e.enviar({ tipo: "desconectar" }),
    e => e.configurar({ vozNoMeet: false })
  ]) {
    const e = ambiente({ suspenso: true });
    e.configurar();
    const recebido = await e.capturar({ audio: true });
    assert.equal(e.contextos[0].state, "suspended");
    desligar(e);
    assert.equal(e.contextos[0].state, "closed");
    assert.equal(recebido.getAudioTracks()[0].readyState, "live");
    assert.equal(recebido.getAudioTracks()[0].enabled, true);
    assert.equal(e.ultimoStatus().ativarAudio, false);
  }
});

test("câmera aberta antes da conexão recebe avatar na mesma faixa sem nova captura ou mixer", async () => {
  const e = ambiente();
  const stream = await e.capturar({ video: true, audio: true });
  const faixa = stream.getVideoTracks()[0], mic = stream.getAudioTracks()[0];
  e.configurar();
  e.enviar({ tipo: "avatar-frame", quadro: 1, bitmap: new e.Bitmap() });
  e.avancar(40);
  assert.equal(e.ultimoStatus().camera, true);
  assert.equal(e.ultimoStatus().avatar, true);
  assert.equal(stream.getVideoTracks()[0], faixa);
  assert.equal(mic, e.capturadas[0].getAudioTracks()[0]);
  assert.equal(e.contextos.length, 0);
  assert.equal(e.chamadas.length, 1);
  assert.notEqual(e.canvases[0].desenhos.at(-1).imagem, e.videos[0]);
  e.configurar({ modo: "sinais" });
  e.avancar(40);
  assert.equal(e.ultimoStatus().avatar, false);
  assert.equal(e.canvases[0].desenhos.at(-1).imagem, e.videos[0]);
  assert.equal(faixa.readyState, "live");
  assert.equal(e.capturadas[0].getVideoTracks()[0].readyState, "live");
  e.configurar();
  e.enviar({ tipo: "avatar-frame", quadro: 2, bitmap: new e.Bitmap() });
  e.avancar(40);
  assert.equal(e.ultimoStatus().avatar, true);
  e.enviar({ tipo: "desconectar" });
  e.avancar(40);
  assert.equal(e.ultimoStatus().avatar, false);
  assert.equal(e.canvases[0].desenhos.at(-1).imagem, e.videos[0]);
  assert.equal(faixa.readyState, "live");
  assert.equal(mic.readyState, "live");
  assert.equal(e.chamadas.length, 1);
});

test("conectar durante a permissão nativa prepara vídeo mas não integra o microfone solicitado antes", async () => {
  const e = ambiente({ permissaoPendente: true });
  const pendente = e.capturar({ video: true, audio: true });
  e.configurar();
  e.liberarPermissao();
  const stream = await pendente;
  assert.notEqual(stream.getVideoTracks()[0], e.capturadas[0].getVideoTracks()[0]);
  assert.equal(stream.getAudioTracks()[0], e.capturadas[0].getAudioTracks()[0]);
  assert.equal(e.contextos.length, 0);
  assert.equal(e.chamadas.length, 1);
  e.enviar({ tipo: "avatar-frame", quadro: 1, bitmap: new e.Bitmap() });
  e.avancar(40);
  assert.equal(e.ultimoStatus().avatar, true);
});

test("primeira configuração durante play pendente não cancela a composição da câmera", async () => {
  const e = ambiente({ videoPendente: true });
  const pendente = e.capturar({ video: true, audio: true });
  await new Promise(setImmediate);
  assert.equal(e.prazos.size, 1);
  e.configurar();
  assert.equal(e.prazos.size, 1);
  e.liberarVideo();
  const stream = await pendente;
  assert.notEqual(stream.getVideoTracks()[0], e.capturadas[0].getVideoTracks()[0]);
  assert.equal(stream.getAudioTracks()[0], e.capturadas[0].getAudioTracks()[0]);
  assert.equal(e.contextos.length, 0);
  assert.equal(e.prazos.size, 0);
  e.enviar({ tipo: "avatar-frame", quadro: 1, bitmap: new e.Bitmap() });
  e.avancar(40);
  assert.equal(e.ultimoStatus().avatar, true);
});

test("nova sessão durante play preserva vídeo composto e devolve somente o áudio anterior ao original", async () => {
  const e = ambiente({ videoPendente: true, audioPrimeiro: true });
  e.configurar();
  const pendente = e.capturar({ video: true, audio: true });
  await new Promise(setImmediate);
  assert.equal(e.contextos.length, 1);
  const saidaAntiga = e.contextos[0].destinos[0].stream.getAudioTracks()[0];
  e.enviar({ tipo: "config", sessao: "nova-sessao", config: {
    conectado: true, modo: "fala", posicao: "inferior-esquerdo", tamanho: "medio", vozNoMeet: true
  } });
  e.liberarVideo();
  const stream = await pendente;
  assert.notEqual(stream.getVideoTracks()[0], e.capturadas[0].getVideoTracks()[0]);
  assert.equal(stream.getAudioTracks()[0], e.capturadas[0].getAudioTracks()[0]);
  assert.equal(stream.getAudioTracks()[0].readyState, "live");
  assert.equal(saidaAntiga.readyState, "ended");
  assert.equal(e.contextos[0].state, "closed");
  assert.equal(e.contextos[0].fontes.length, 0);
  assert.equal(e.chamadas.length, 1);
  e.enviar({ tipo: "avatar-frame", sessao: "nova-sessao", quadro: 1, bitmap: new e.Bitmap() });
  e.avancar(40);
  assert.equal(e.ultimoStatus().avatar, true);
  assert.equal(e.ultimoStatus().audio, false);
});

test("troca de sessão durante a permissão nativa não integra áudio de uma solicitação antiga", async () => {
  const e = ambiente({ permissaoPendente: true });
  e.configurar();
  const pendente = e.capturar({ video: true, audio: true });
  e.enviar({ tipo: "config", sessao: "nova-sessao", config: {
    conectado: true, modo: "fala", posicao: "inferior-esquerdo", tamanho: "medio", vozNoMeet: true
  } });
  e.liberarPermissao();
  const stream = await pendente;
  assert.notEqual(stream.getVideoTracks()[0], e.capturadas[0].getVideoTracks()[0]);
  assert.equal(stream.getAudioTracks()[0], e.capturadas[0].getAudioTracks()[0]);
  assert.equal(e.contextos.length, 0);
  e.enviar({ tipo: "audio", sessao: "nova-sessao", id: 1, samples: [0.2], sampleRate: 8000, frase: "oi" });
  assert.equal(e.respostaAudio(1).aceito, false);
  assert.equal(e.contextos.length, 0);
});
