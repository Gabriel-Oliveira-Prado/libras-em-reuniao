import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import fs from "node:fs";
import { glosaValida } from "../meet/protocolo.mjs";

const CANAL = "libras-em-reuniao-meet-v1";
const EXT = "chrome-extension://jcfphakcklekbchlfdopcaanopkmppbd";
const MEET = "https://meet.google.com";
const VLIBRAS = "https://vlibras.gov.br";
const fonteWrapper = fs.readFileSync(new URL("../meet/avatar.js", import.meta.url), "utf8").replace(/^import .*;\r?\n/gm, "");
const fonteCaptura = fs.readFileSync(new URL("../meet/capturar-avatar.js", import.meta.url), "utf8");
class Bitmap {
  constructor(w = 240, h = 320) { this.width = w; this.height = h; this.fechado = false; }
  close() { this.fechado = true; }
}
function temporizadores() {
  let id = 0, agora = 0;
  const tarefas = new Map();
  return {
    setTimeout(fn, ms) { const i = ++id; tarefas.set(i, { fn, ms, intervalo: false }); return i; },
    clearTimeout(i) { tarefas.delete(i); },
    setInterval(fn, ms) { const i = ++id; tarefas.set(i, { fn, ms, intervalo: true }); return i; },
    clearInterval(i) { tarefas.delete(i); },
    executar(ms) {
      agora += ms;
      for (const [i, t] of [...tarefas]) if (t.ms === ms) {
        if (!t.intervalo) tarefas.delete(i);
        t.fn();
      }
    },
    performance: { now: () => agora }, tarefas
  };
}
function janela() {
  const eventos = new Map(), enviados = [];
  const parent = { postMessage(...args) { enviados.push(args); } };
  return {
    parent, enviados, eventos,
    addEventListener(tipo, fn) { eventos.set(tipo, fn); },
    removeEventListener(tipo, fn) { if (eventos.get(tipo) === fn) eventos.delete(tipo); }
  };
}
function wrapper({ pronta = true } = {}) {
  let playerPronto = pronta;
  const timer = temporizadores(), window = janela(), aoUnity = [], portas = [], metodos = [];
  const iframe = { contentWindow: { postMessage(...args) { aoUnity.push(args); } } };
  let iframeAtual = iframe;
  const area = { querySelector: () => iframeAtual };
  const estado = { textContent: "Carregando" }, captura = { textContent: "" };
  const observadores = [];
  let aoPort, desconectar, desconectou = 0;
  const port = {
    postMessage: msg => portas.push(msg),
    onMessage: { addListener: fn => { aoPort = fn; } },
    onDisconnect: { addListener: fn => { desconectar = fn; } },
    disconnect: () => { desconectou += 1; }
  };
  const context = vm.createContext({
    ...timer, window, ImageBitmap: Bitmap, console, glosaValida,
    document: { querySelector: id => ({ "#avatar": area, "#estado-vlibras": estado, "#estado-captura": captura }[id]) },
    chrome: { runtime: { connect: cfg => { assert.equal(cfg.name, "libras-avatar"); return port; } } },
    montarVLibras: () => ({
      pronta: () => playerPronto,
      abrir: () => metodos.push("abrir"), parar: () => metodos.push("parar"),
      destruir: () => metodos.push("destruir"),
      adicionar: texto => { metodos.push(texto); return true; },
      mostrarSinal: (glosa, rotulo) => { metodos.push({ glosa, rotulo }); return true; }
    }),
    MutationObserver: class {
      constructor(fn) { this.fn = fn; observadores.push(this); }
      observe() {}
      disconnect() { this.desconectado = true; }
    }
  });
  vm.runInContext(fonteWrapper, context);
  return {
    timer, window, iframe, aoUnity, portas, metodos, estado, captura, observadores,
    pronto: valor => { playerPronto = valor; },
    trocarIframe() {
      const novo = { contentWindow: { postMessage(...args) { aoUnity.push(args); } } };
      iframeAtual = novo;
      return novo;
    },
    port: msg => aoPort(msg), desligar: () => desconectar(), desconectou: () => desconectou,
    evento: (data, source = iframe.contentWindow, origin = VLIBRAS) => window.eventos.get("message")?.({ data, source, origin }),
    configurar: (sessao = "teste-1", modo = "fala") => aoPort({ tipo: "config", sessao, config: { modo } })
  };
}
function captura({ erroCanvas, semCanvas = false, semQuadros = false, playPendente = false } = {}) {
  const timer = temporizadores(), window = janela(), bitmaps = [];
  let capturas = 0, parado = 0, pausas = 0;
  const track = { stop: () => { parado += 1; } };
  const canvas = {
    width: 640, height: 720,
    captureStream(fps) {
      assert.equal(fps, 12); capturas += 1;
      if (erroCanvas) throw Object.assign(new Error("erro de teste"), { name: erroCanvas });
      return { getTracks: () => [track] };
    }
  };
  const video = { muted: false, playsInline: false, srcObject: null, readyState: semQuadros ? 0 : 3,
    videoWidth: 640, videoHeight: 720, currentTime: 0, play: () => playPendente ? new Promise(() => {}) : Promise.resolve(), pause: () => { pausas += 1; } };
  const context = vm.createContext({
    ...timer, window, console,
    chrome: { runtime: { id: EXT.split("://")[1] } },
    document: { querySelectorAll: () => semCanvas ? [] : [canvas], createElement: tipo => { assert.equal(tipo, "video"); return video; } },
    OffscreenCanvas: class {
      constructor(w, h) { this.width = w; this.height = h; }
      getContext() { return { drawImage() {} }; }
      transferToImageBitmap() { const b = new Bitmap(this.width, this.height); bitmaps.push(b); return b; }
    }
  });
  vm.runInContext(fonteCaptura, context);
  return {
    timer, window, video, bitmaps, capturas: () => capturas, parado: () => parado, pausas: () => pausas,
    evento: (data, source = window.parent, origin = EXT) => window.eventos.get("message")?.({ data, source, origin }),
    iniciar(sessao = "teste-1") { this.evento({ canal: CANAL, tipo: "capturar-avatar", sessao, ativo: true }); },
    frames() { return window.enviados.filter(([m]) => m.tipo === "avatar-frame"); }
  };
}
const flush = () => new Promise(resolve => setImmediate(resolve));
const frame = (bitmap, sessao = "teste-1", quadro = 1) => ({ canal: CANAL, tipo: "avatar-frame", sessao, quadro, bitmap });

test("wrapper aceita configuração por porta e só traduz a sessão ativa", () => {
  const a = wrapper();
  assert.equal(a.portas[0].tipo, "avatar-pronto");
  a.configurar();
  assert.ok(a.metodos.includes("abrir"));
  a.port({ tipo: "avatar-texto", sessao: "outra", texto: "errado" });
  a.port({ tipo: "avatar-texto", sessao: "teste-1", texto: "Tudo bem?" });
  assert.ok(!a.metodos.includes("errado"));
  assert.ok(a.metodos.includes("Tudo bem?"));
  assert.equal(a.aoUnity.at(-1)[1], VLIBRAS);
  assert.equal(a.aoUnity.at(-1)[0].ativo, true);
  a.configurar("teste-1", "sinais");
  assert.equal(a.aoUnity.at(-1)[0].ativo, false);
  a.port({ tipo: "avatar-texto", sessao: "teste-1", texto: "não traduz" });
  assert.ok(!a.metodos.includes("não traduz"));
});
test("wrapper valida origem e source, transfere um bitmap e aguarda ACK do Meet", () => {
  const a = wrapper(); a.configurar();
  a.evento(frame(new Bitmap()), {}, VLIBRAS);
  a.evento(frame(new Bitmap()), a.iframe.contentWindow, "https://exemplo.com");
  assert.equal(a.window.enviados.length, 0);
  const b = new Bitmap();
  a.evento(frame(b));
  assert.equal(a.window.enviados.length, 1);
  const [msg, origem, transferidos] = a.window.enviados[0];
  assert.equal(origem, MEET); assert.equal(msg.bitmap, b); assert.equal(transferidos[0], b);
  const excedente = new Bitmap(); a.evento(frame(excedente, "teste-1", 2));
  assert.equal(excedente.fechado, true);
  assert.equal(a.window.enviados.length, 1);
  const ack = { canal: CANAL, tipo: "avatar-frame-ack", sessao: "teste-1", quadro: 1 };
  a.evento(ack, {}, MEET);
  a.evento(ack, a.window.parent, "https://exemplo.com");
  const terceiro = new Bitmap(); a.evento(frame(terceiro, "teste-1", 3));
  assert.equal(terceiro.fechado, true);
  a.evento(ack, a.window.parent, MEET);
  assert.equal(a.aoUnity.at(-1)[0].tipo, "avatar-frame-ack");
  a.evento(frame(new Bitmap(), "teste-1", 4));
  assert.equal(a.window.enviados.filter(([m]) => m.tipo === "avatar-frame").length, 2);
});
test("wrapper fecha quadros inválidos/antigos e não acumula com Meet travado", () => {
  const a = wrapper(); a.configurar();
  for (const b of [new Bitmap(321, 100), new Bitmap(200, 361), new Bitmap(0, 100)]) {
    a.evento(frame(b)); assert.equal(b.fechado, true);
  }
  const velho = new Bitmap(); a.evento(frame(velho, "outra")); assert.equal(velho.fechado, true);
  a.evento(frame(new Bitmap())); a.timer.executar(3000);
  assert.ok(a.portas.some(m => m.erro === "AckTimeout"));
  for (let i = 2; i < 20; i++) { const b = new Bitmap(); a.evento(frame(b, "teste-1", i)); assert.equal(b.fechado, true); }
  assert.equal(a.window.enviados.filter(([m]) => m.tipo === "avatar-frame").length, 1);
});
test("wrapper deduplica status e encerra captura/observadores ao desconectar", () => {
  const a = wrapper(); a.configurar();
  a.observadores[0].fn(); a.observadores[0].fn();
  assert.equal(a.portas.filter(m => m.tipo === "avatar-status").length, 1);
  a.desligar(); a.desligar();
  assert.equal(a.desconectou(), 1);
  assert.equal(a.aoUnity.at(-1)[0].ativo, false);
  assert.equal(a.metodos.filter(m => m === "destruir").length, 1);
  assert.ok(a.observadores.every(o => o.desconectado));
  assert.equal(a.timer.tarefas.size, 0);
});
test("wrapper aguarda Unity por mais de 20 segundos e só captura quando o personagem está pronto", () => {
  const a = wrapper({ pronta: false }); a.configurar();
  for (let i = 0; i < 21; i++) a.timer.executar(1000);
  assert.equal(a.aoUnity.filter(([m]) => m.tipo === "capturar-avatar" && m.ativo).length, 0);
  assert.match(a.captura.textContent, /Carregando o intérprete/);
  const prematuro = new Bitmap(); a.evento(frame(prematuro));
  assert.equal(prematuro.fechado, true);
  assert.equal(a.window.enviados.filter(([m]) => m.tipo === "avatar-frame").length, 0);
  a.pronto(true); a.timer.executar(1000);
  assert.equal(a.aoUnity.at(-1)[0].ativo, true);
  a.evento(frame(new Bitmap()));
  assert.equal(a.window.enviados.filter(([m]) => m.tipo === "avatar-frame").length, 1);
  a.desligar();
});

test("wrapper interrompe captura ao perder prontidão e aguarda o novo iframe após tentar novamente", () => {
  const a = wrapper(); a.configurar();
  a.evento(frame(new Bitmap()));
  a.pronto(false); a.timer.executar(1000);
  assert.equal(a.aoUnity.at(-1)[0].ativo, false);
  const velho = a.iframe.contentWindow;
  const novo = a.trocarIframe();
  a.observadores[1].fn();
  const antes = a.aoUnity.filter(([m]) => m.ativo === true).length;
  for (let i = 0; i < 21; i++) a.timer.executar(1000);
  assert.equal(a.aoUnity.filter(([m]) => m.ativo === true).length, antes);
  const enviados = a.window.enviados.filter(([m]) => m.tipo === "avatar-frame").length;
  a.evento(frame(new Bitmap(), "teste-1", 2), velho);
  assert.equal(a.window.enviados.filter(([m]) => m.tipo === "avatar-frame").length, enviados);
  a.pronto(true); a.observadores[1].fn();
  assert.equal(a.aoUnity.at(-1)[0].ativo, true);
  a.evento(frame(new Bitmap(), "teste-1", 3), novo.contentWindow);
  assert.equal(a.window.enviados.filter(([m]) => m.tipo === "avatar-frame").length, enviados + 1);
  a.desligar();
});

test("wrapper cancela espera de prontidão por modo, sessão e encerramento sem reativação tardia", () => {
  const a = wrapper({ pronta: false }); a.configurar();
  const callbackAntigo = [...a.timer.tarefas.values()].find(t => t.intervalo).fn;
  a.configurar("teste-1", "sinais"); a.pronto(true);
  callbackAntigo(); a.observadores[1].fn();
  assert.equal(a.aoUnity.some(([m]) => m.ativo === true), false);
  assert.equal(a.timer.tarefas.size, 0);
  a.pronto(false); a.configurar("teste-2", "fala");
  callbackAntigo();
  assert.equal(a.aoUnity.some(([m]) => m.ativo === true), false);
  a.pronto(true); a.timer.executar(1000);
  assert.equal(a.aoUnity.at(-1)[0].sessao, "teste-2");
  assert.equal(a.aoUnity.at(-1)[0].ativo, true);
  const antes = a.aoUnity.filter(([m]) => m.ativo === true).length;
  a.desligar(); callbackAntigo(); a.observadores[1].fn();
  assert.equal(a.aoUnity.filter(([m]) => m.ativo === true).length, antes);
  assert.equal(a.timer.tarefas.size, 0);
});

test("captura não inicia sem handshake do pai e da extensão exata", async () => {
  const a = captura(), msg = { canal: CANAL, tipo: "capturar-avatar", sessao: "teste-1", ativo: true };
  assert.equal(a.capturas(), 0);
  a.evento(msg, {}, EXT);
  a.evento(msg, a.window.parent, "https://meet.google.com");
  a.evento(msg, a.window.parent, "chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
  a.evento({ ...msg, sessao: "" });
  assert.equal(a.capturas(), 0);
  a.evento(msg); await flush();
  assert.equal(a.capturas(), 1);
  assert.equal(a.frames().length, 1);
  assert.equal(a.frames()[0][0].bitmap.width, 320);
  assert.equal(a.frames()[0][0].bitmap.height, 360);
  assert.equal(a.frames()[0][1], EXT);
  assert.equal(a.frames()[0][2][0], a.frames()[0][0].bitmap);
});
test("captura tem só um quadro pendente e apenas ACK válido libera o próximo", async () => {
  const a = captura(); a.iniciar(); await flush();
  a.iniciar(); a.timer.executar(100);
  assert.equal(a.capturas(), 1); assert.equal(a.frames().length, 1);
  const primeiro = a.frames()[0][0];
  a.evento({ canal: CANAL, tipo: "avatar-frame-ack", sessao: "outra", quadro: primeiro.quadro });
  a.evento({ canal: CANAL, tipo: "avatar-frame-ack", sessao: "teste-1", quadro: primeiro.quadro + 1 });
  a.timer.executar(100); assert.equal(a.frames().length, 1);
  a.evento({ canal: CANAL, tipo: "avatar-frame-ack", sessao: "teste-1", quadro: primeiro.quadro });
  a.timer.executar(100); assert.equal(a.frames().length, 2);
  a.timer.executar(3000);
  assert.ok(a.window.enviados.some(([m]) => m.erro === "AckTimeout"));
  a.timer.executar(100); assert.equal(a.frames().length, 2);
});
test("captura libera tracks/vídeo/timers ao parar e troca de sessão descarta ACK anterior", async () => {
  const a = captura(); a.iniciar(); await flush();
  const primeiro = a.frames()[0][0];
  a.iniciar("teste-2"); await flush();
  assert.equal(a.parado(), 1);
  a.evento({ canal: CANAL, tipo: "avatar-frame-ack", sessao: "teste-1", quadro: primeiro.quadro });
  a.timer.executar(100); assert.equal(a.frames().length, 2);
  a.evento({ canal: CANAL, tipo: "capturar-avatar", sessao: "teste-2", ativo: false });
  assert.equal(a.parado(), 2);
  assert.equal(a.video.srcObject, null);
  assert.equal(a.timer.tarefas.size, 0);
  a.window.eventos.get("pagehide")();
  assert.equal(a.window.eventos.has("message"), false);
});
test("captura informa SecurityError e timeout de canvas sem vazamento", async () => {
  const a = captura({ erroCanvas: "SecurityError" }); a.iniciar(); await flush();
  assert.ok(a.window.enviados.some(([m]) => m.erro === "SecurityError"));
  assert.equal(a.timer.tarefas.size, 0);
  a.iniciar(); await flush(); assert.equal(a.capturas(), 1);
  const b = captura({ semCanvas: true }); b.iniciar(); b.timer.executar(60000); b.timer.executar(250);
  assert.ok(b.window.enviados.some(([m]) => m.erro === "CanvasTimeout"));
  assert.equal(b.timer.tarefas.size, 0);
});
test("captura detecta canvas sem vídeo novo e encerra tracks", async () => {
  const a = captura({ semQuadros: true }); a.iniciar(); await flush();
  a.timer.executar(16000); a.timer.executar(100);
  assert.ok(a.window.enviados.some(([m]) => m.erro === "NoFrames"));
  assert.equal(a.parado(), 1);
  assert.equal(a.frames().length, 0);
});

test("captura encerra um play sem quadros e detecta vídeo estagnado depois do ACK", async () => {
  const a = captura({ playPendente: true }); a.iniciar();
  a.timer.executar(15000); await flush();
  assert.ok(a.window.enviados.some(([m]) => m.erro === "NoFrames"));
  assert.equal(a.parado(), 1); assert.equal(a.timer.tarefas.size, 0);
  const b = captura(); b.iniciar(); await flush();
  const primeiro = b.frames()[0][0];
  b.evento({ canal: CANAL, tipo: "avatar-frame-ack", sessao: "teste-1", quadro: primeiro.quadro });
  b.timer.executar(16000); b.timer.executar(100);
  assert.ok(b.window.enviados.some(([m]) => m.erro === "NoFrames"));
  assert.equal(b.parado(), 1); assert.equal(b.timer.tarefas.size, 0);
});

test("wrapper reproduz sinal do catálogo diretamente e recusa glosa inválida ou sessão antiga", () => {
  const a = wrapper(); a.configurar();
  a.port({ tipo: "avatar-sinal", sessao: "teste-1", glosa: "BOM_DIA", rotulo: "Bom dia" });
  a.port({ tipo: "avatar-sinal", sessao: "antiga", glosa: "OI", rotulo: "Oi" });
  a.port({ tipo: "avatar-sinal", sessao: "teste-1", glosa: "../ruim", rotulo: "ruim" });
  assert.deepEqual(a.metodos.filter((m) => typeof m === "object"), [{ glosa: "BOM_DIA", rotulo: "Bom dia" }]);
  a.desligar();
});
