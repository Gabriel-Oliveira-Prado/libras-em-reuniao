import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";

const CANAL = "libras-em-reuniao-meet-v1", ID = "a".repeat(32);
const EXT = "chrome-extension://" + ID, MEET = "https://meet.google.com";
function bancada() {
  const ouvintes = {}, principal = [], portas = [], filhos = [];
  const evento = () => ({ listeners: [], addListener(fn) { this.listeners.push(fn); }, disparar(d) { for (const f of this.listeners) f(d); } });
  function elemento(tag) {
    const node = { tag, style: {}, filhos: [], removido: false, append(...itens) { this.filhos.push(...itens); },
      remove() { this.removido = true; } };
    if (tag === "iframe") {
      node.contentWindow = { mensagens: [], postMessage(d, origem, transfer) { this.mensagens.push({ d, origem, transfer }); } };
      filhos.push(node);
    }
    return node;
  }
  const body = elemento("body");
  const window = { postMessage(d, origem, transfer) { principal.push({ d, origem, transfer }); },
    addEventListener(tipo, fn) { ouvintes[tipo] = fn; }, removeEventListener(tipo) { delete ouvintes[tipo]; } };
  const chrome = { runtime: { id: ID, getURL: (path) => EXT + "/" + path,
    connect() {
      const p = { onMessage: evento(), onDisconnect: evento(), mensagens: [], disconnect() { this.onDisconnect.disparar(); },
        postMessage(d) { this.mensagens.push(d); } };
      portas.push(p); return p;
    } } };
  class Bitmap { constructor(w = 200, h = 280) { this.width = w; this.height = h; this.fechado = false; } close() { this.fechado = true; } }
  vm.runInNewContext(readFileSync(new URL("../meet/conteudo.js", import.meta.url), "utf8"), {
    chrome, window, location: { origin: MEET }, document: { body, documentElement: body, createElement: elemento },
    URL, ImageBitmap: Bitmap, setTimeout() { return 1; }, clearTimeout() {}, setInterval() { return 2; }, clearInterval() {}
  });
  const porta = portas[0];
  const config = (extras = {}) => porta.onMessage.disparar({ tipo: "config", sessao: "sessao-1",
    config: { conectado: true, modo: "fala", posicao: "inferior-esquerdo", tamanho: "medio", vozNoMeet: true, ...extras } });
  const msg = (d, source = window, origin = MEET) => ouvintes.message({ source, origin, data: { canal: CANAL, sessao: "sessao-1", ...d } });
  return { window, ouvintes, principal, porta, filhos, body, Bitmap, config, msg };
}
test("ponte cria avatar apenas por configuração da extensão e mantém canto/tamanho sem duplicar iframe", () => {
  const b = bancada();
  b.msg({ tipo: "config", config: { modo: "fala" } });
  assert.equal(b.filhos.length, 0);
  b.config();
  assert.equal(b.filhos.length, 1);
  assert.equal(b.filhos[0].src, EXT + "/meet/avatar.html");
  const caixa = b.body.filhos[0];
  assert.equal(caixa.style.left, "16px"); assert.equal(caixa.style.bottom, "88px");
  b.config({ posicao: "superior-direito", tamanho: "grande" });
  assert.equal(b.filhos.length, 1);
  assert.equal(caixa.style.right, "16px"); assert.equal(caixa.style.top, "16px");
  assert.match(caixa.style.width, /285px/);
  b.config({ modo: "sinais" });
  assert.equal(caixa.removido, true);
});
test("bitmap passa por transferência e seu ACK retorna ao mesmo avatar sem canal JSON", () => {
  const b = bancada(); b.config();
  const filho = b.filhos[0].contentWindow, bitmap = new b.Bitmap();
  b.msg({ tipo: "avatar-frame", quadro: 1, bitmap }, filho, EXT);
  const encaminhado = b.principal.at(-1);
  assert.equal(encaminhado.d.bitmap, bitmap);
  assert.equal(encaminhado.transfer[0], bitmap);
  assert.equal(b.porta.mensagens.length, 0);
  b.msg({ tipo: "avatar-frame-ack", quadro: 1 });
  assert.equal(filho.mensagens.at(-1).d.quadro, 1);
  assert.equal(filho.mensagens.at(-1).origem, EXT);
});
test("quadros antigos ou grandes são fechados e origem/fonte falsa não atravessa ponte", () => {
  const b = bancada(); b.config();
  const filho = b.filhos[0].contentWindow;
  const antes = b.principal.length;
  for (const [source, origin] of [[{}, EXT], [filho, "https://outro.example"]]) {
    b.msg({ tipo: "avatar-frame", quadro: 1, bitmap: new b.Bitmap() }, source, origin);
  }
  assert.equal(b.principal.length, antes);
  const antigo = new b.Bitmap();
  b.msg({ tipo: "avatar-frame", quadro: 2, bitmap: antigo, sessao: "antiga" }, filho, EXT);
  assert.equal(antigo.fechado, true);
  const grande = new b.Bitmap(999, 500);
  b.msg({ tipo: "avatar-frame", quadro: 3, bitmap: grande }, filho, EXT);
  assert.equal(grande.fechado, true);
  assert.equal(b.principal.length, antes);
});
test("status e ACKs têm sessão exata; desconexão remove avatar e cancela mídia", () => {
  const b = bancada(); b.config();
  b.msg({ tipo: "midia-status", audio: true, sessao: "antiga" });
  b.msg({ tipo: "audio-recebido", id: 1, aceito: true }, {}, MEET);
  assert.equal(b.porta.mensagens.length, 0);
  b.msg({ tipo: "audio-recebido", id: 1, aceito: true });
  assert.equal(b.porta.mensagens.length, 1);
  assert.equal(b.porta.mensagens[0].aceito, true);
  b.porta.onMessage.disparar({ tipo: "audio", sessao: "sessao-1", id: 1, samples: [0.1] });
  assert.equal(b.principal.at(-1).d.tipo, "audio");
  b.porta.onDisconnect.disparar();
  assert.equal(b.principal.at(-1).d.tipo, "desconectar");
  assert.equal(b.body.filhos[0].removido, true);
  b.msg({ tipo: "midia-status", audio: true });
  assert.equal(b.porta.mensagens.length, 1);
});

test("ponte encaminha confirmação somente do MAIN, origem e sessão atuais", () => {
  const b = bancada();
  b.msg({ tipo: "meet-pronto" });
  assert.equal(b.porta.mensagens.at(-1).tipo, "meet-pronto");
  b.msg({ tipo: "meet-confirmado" });
  assert.equal(b.porta.mensagens.length, 1, "não confirma antes da configuração");
  b.config();
  const filho = b.filhos[0].contentWindow;
  b.msg({ tipo: "meet-confirmado" }, {}, MEET);
  b.msg({ tipo: "meet-confirmado" }, b.window, "https://outro.example");
  b.msg({ tipo: "meet-confirmado", sessao: "antiga" });
  b.msg({ tipo: "meet-confirmado" }, filho, EXT);
  assert.equal(b.porta.mensagens.length, 1);
  b.msg({ tipo: "meet-confirmado" });
  assert.equal(b.porta.mensagens.length, 2);
  assert.equal(b.porta.mensagens[1].tipo, "meet-confirmado");
  assert.equal(b.porta.mensagens[1].sessao, "sessao-1");
  b.config({ modo: "sinais" });
  b.msg({ tipo: "meet-confirmado" });
  assert.equal(b.porta.mensagens.length, 3, "modo sinais também confirma sem abrir avatar");
});
