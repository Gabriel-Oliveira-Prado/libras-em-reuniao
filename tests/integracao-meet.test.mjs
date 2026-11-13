import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import fs from "node:fs";
import { configuracao, glosaValida, ehMeet } from "../meet/protocolo.mjs";

const fonte = fs.readFileSync(new URL("../painel/integracao-meet.mjs", import.meta.url), "utf8")
  .replace(/^import .*;\s*/m, "").replace("export function montarIntegracaoMeet", "function montarIntegracaoMeet")
  + "\nglobalThis.montar = montarIntegracaoMeet;";
const flush = () => new Promise(resolve => setImmediate(resolve));
class Elemento {
  constructor() { this.value = ""; this.checked = true; this.disabled = false; this.hidden = false; this.textContent = ""; this.listeners = new Map(); this.children = []; }
  addEventListener(tipo, fn) { this.listeners.set(tipo, fn); }
  emitir(tipo = "click") { return this.listeners.get(tipo)?.(); }
  replaceChildren(...itens) { this.children = itens; }
}
function ambiente({ salvo, erroEnvio = false } = {}) {
  const nomes = ["reuniao-meet", "estado-meet", "conectar-meet", "desconectar-meet", "posicao-meet", "tamanho-meet", "voz-no-meet", "testar-voz-meet", "atualizar-meet"];
  const elementos = Object.fromEntries(nomes.map(n => [n, new Elemento()]));
  const dados = new Map(salvo === undefined ? [] : [["libras-meet-config", JSON.stringify(salvo)]]);
  const portas = [], hooks = [], timers = new Map();
  let numero = 0, falhar = erroEnvio, testes = 0;
  const criarPorta = () => {
    const mensagens = [], ouvintes = [], desligamentos = [];
    let fechada = false;
    const p = {
      mensagens, onMessage: { addListener: f => ouvintes.push(f) }, onDisconnect: { addListener: f => desligamentos.push(f) },
      postMessage(d) { if (falhar || fechada) throw new Error("Porta perdida"); mensagens.push(d); },
      receber(d) { for (const f of ouvintes) f(d); },
      disconnect() { if (!fechada) { fechada = true; for (const f of desligamentos) f(); } }
    };
    portas.push(p); return p;
  };
  const contexto = vm.createContext({
    configuracao, glosaValida, ehMeet, document: { querySelector: s => elementos[s.slice(1)], createElement: () => new Elemento() },
    localStorage: { getItem: k => dados.get(k) ?? null, setItem: (k, v) => dados.set(k, v) },
    chrome: { runtime: { connect: cfg => { assert.equal(cfg.name, "libras-painel"); return criarPorta(); } } },
    setTimeout(fn, ms) { const i = ++numero; timers.set(i, { fn, ms, intervalo: false }); return i; },
    clearTimeout(i) { timers.delete(i); },
    setInterval(fn, ms) { const i = ++numero; timers.set(i, { fn, ms, intervalo: true }); return i; },
    clearInterval(i) { timers.delete(i); }
  });
  vm.runInContext(fonte, contexto);
  const app = contexto.montar({ aoConexao: valor => hooks.push(valor), aoTesteVoz: () => { testes += 1; } });
  return {
    app, elementos, dados, portas, hooks, timers, falhar: v => { falhar = v; }, testes: () => testes,
    porta: () => portas.at(-1),
    tempo(ms) { for (const [i, t] of [...timers]) if (t.ms === ms) { if (!t.intervalo) timers.delete(i); t.fn(); } },
    conectar(tabId = 2) { elementos["reuniao-meet"].value = String(tabId); elementos["conectar-meet"].emitir(); },
    confirmar(tabId = 2) { portas.at(-1).receber({ tipo: "conectado", tabId, disponivel: true, sessao: "sessao-teste" }); },
    midia(audio = true) { portas.at(-1).receber({ tipo: "midia-status", audio, camera: true, avatar: true }); },
    estado: () => elementos["estado-meet"].textContent
  };
}
const entrada = () => ({ samples: new Float32Array([0, .1, -.1]), sampleRate: 16000, frase: "Oi Gabriel" });
const ultimo = (a, tipo) => a.porta().mensagens.filter(d => d.tipo === tipo).at(-1);

test("painel lista reuniões e aguarda seleção/conexão explícita, com padrões e preferências persistidas", () => {
  const a = ambiente();
  assert.equal(a.app.ativa(), false);
  assert.deepEqual(a.porta().mensagens.map(m => m.tipo), ["listar"]);
  assert.equal(a.elementos["posicao-meet"].value, "inferior-esquerdo");
  assert.equal(a.elementos["tamanho-meet"].value, "medio");
  assert.equal(a.hooks.length, 0);
  a.porta().receber({ tipo: "reunioes", reunioes: [{ id: 1, titulo: "Uma", ativa: false }, { id: 2, titulo: "Duas", ativa: true }] });
  assert.equal(a.elementos["reuniao-meet"].value, "2");
  assert.equal(ultimo(a, "conectar"), undefined);
  a.conectar(1);
  assert.equal(ultimo(a, "conectar").tabId, 1);
  assert.equal(a.app.ativa(), false);
  a.confirmar(1); assert.equal(a.app.ativa(), true); assert.deepEqual(a.hooks, [true]);
  a.elementos["posicao-meet"].value = "superior-direito";
  a.elementos["posicao-meet"].emitir("change");
  assert.equal(JSON.parse(a.dados.get("libras-meet-config")).posicao, "superior-direito");
  assert.equal(ultimo(a, "config").config.posicao, "superior-direito");
  a.app.destruir(); assert.equal(a.timers.size, 0);
  const b = ambiente({ salvo: { posicao: "superior-esquerdo", tamanho: "grande", vozNoMeet: false } });
  assert.equal(b.elementos["posicao-meet"].value, "superior-esquerdo");
  assert.equal(b.elementos["tamanho-meet"].value, "grande");
  assert.equal(b.elementos["voz-no-meet"].checked, false);
  b.app.destruir();
});

test("somente modo fala manda avatar; pausa e teste de voz usam ações explícitas", () => {
  const a = ambiente();
  assert.equal(a.app.adicionar("Oi"), false);
  a.conectar(); a.confirmar();
  assert.equal(a.app.adicionar("Oi"), false);
  a.app.mudarModo("fala");
  assert.equal(a.app.adicionar("Oi Gabriel"), true);
  assert.equal(ultimo(a, "avatar-texto").texto, "Oi Gabriel");
  assert.equal(a.app.adicionar("x".repeat(501)), false);
  a.app.pararAvatar(); assert.equal(ultimo(a, "avatar-parar").tipo, "avatar-parar");
  a.elementos["testar-voz-meet"].emitir(); assert.equal(a.testes(), 1);
  a.app.mudarModo("sinais");
  assert.equal(a.app.adicionar("Outro"), false);
  assert.equal(a.hooks.length, 1);
  a.app.destruir();
});

test("encaminhamento retorna false desligado/teste/voz off e só confirma após ACK positivo", async () => {
  const a = ambiente();
  assert.equal(await a.app.encaminharAudio(entrada()), false);
  a.conectar(); a.confirmar(); a.midia();
  assert.equal(await a.app.encaminharAudio({ ...entrada(), teste: true }), false);
  a.elementos["voz-no-meet"].checked = false;
  a.elementos["voz-no-meet"].emitir("change");
  assert.equal(await a.app.encaminharAudio(entrada()), false);
  a.elementos["voz-no-meet"].checked = true;
  a.elementos["voz-no-meet"].emitir("change");
  let terminou = false;
  const audio = a.app.encaminharAudio(entrada()).then(v => { terminou = true; return v; });
  await flush(); assert.equal(terminou, false);
  const enviado = ultimo(a, "audio");
  assert.deepEqual(Array.from(enviado.samples), Array.from(entrada().samples));
  a.porta().receber({ tipo: "audio-recebido", id: enviado.id + 1, aceito: true });
  await flush(); assert.equal(terminou, false);
  a.porta().receber({ tipo: "audio-recebido", id: enviado.id, aceito: true });
  assert.equal(await audio, true);
  a.app.destruir();
});

test("microfone não integrado, ACK negativo, timeout e falha de envio rejeitam sem afirmar entrega", async () => {
  const a = ambiente(); a.conectar(); a.confirmar();
  await assert.rejects(a.app.encaminharAudio(entrada()), /ainda não foi integrado/);
  assert.equal(ultimo(a, "audio"), undefined);
  a.midia();
  const rejeitado = a.app.encaminharAudio(entrada());
  const check = assert.rejects(rejeitado, /microfone recusou/);
  a.porta().receber({ tipo: "audio-recebido", id: ultimo(a, "audio").id, aceito: false, erro: "microfone recusou" });
  await check;
  const demora = a.app.encaminharAudio(entrada());
  const checkDemora = assert.rejects(demora, /não confirmou/);
  a.tempo(6000); await checkDemora;
  a.falhar(true);
  await assert.rejects(a.app.encaminharAudio(entrada()), /foi perdida/);
  a.falhar(false); a.app.destruir();
});

test("parar e desconectar cancelam áudios; ACK tardio não revive promessas nem conexão", async () => {
  const a = ambiente(); a.conectar(); a.confirmar(); a.midia();
  const audio = a.app.encaminharAudio(entrada()), primeiro = ultimo(a, "audio");
  const check = assert.rejects(audio, /interrompida/);
  a.app.pararAudio(); await check;
  assert.ok(ultimo(a, "audio-parar"));
  a.porta().receber({ tipo: "audio-recebido", id: primeiro.id, aceito: true });
  const segundo = a.app.encaminharAudio(entrada()), id2 = ultimo(a, "audio").id;
  const check2 = assert.rejects(segundo, /encerrada/);
  a.elementos["desconectar-meet"].emitir(); await check2;
  assert.equal(a.app.ativa(), false); assert.deepEqual(a.hooks, [true, false]);
  a.porta().receber({ tipo: "audio-recebido", id: id2, aceito: true });
  assert.equal(a.app.ativa(), false);
  a.conectar(); a.confirmar(); a.midia();
  const terceiro = a.app.encaminharAudio(entrada());
  const enviado = ultimo(a, "audio");
  assert.ok(enviado.id > id2);
  a.porta().receber({ tipo: "audio-recebido", id: id2, aceito: true });
  a.porta().receber({ tipo: "audio-recebido", id: enviado.id, aceito: true });
  assert.equal(await terceiro, true);
  a.app.destruir(); assert.equal(a.timers.size, 0);
});

test("reload de Meet limpa estado de mídia; fechamento de porta/painel encerra e ignora callbacks antigos", async () => {
  const a = ambiente(); a.conectar(); a.confirmar(); a.midia();
  a.porta().receber({ tipo: "aguardando-meet" });
  await assert.rejects(a.app.encaminharAudio(entrada()), /ainda não foi integrado/);
  a.midia();
  const audio = a.app.encaminharAudio(entrada()), check = assert.rejects(audio, /encerrada/);
  const velha = a.porta(); velha.disconnect(); await check;
  assert.equal(a.app.ativa(), false);
  a.elementos["atualizar-meet"].emitir();
  assert.equal(a.portas.length, 2);
  velha.receber({ tipo: "conectado", tabId: 1 }); assert.equal(a.app.ativa(), false);
  a.conectar(); a.confirmar(); a.midia();
  const pendente = a.app.encaminharAudio(entrada()), check2 = assert.rejects(pendente, /encerrada/);
  a.app.destruir(); await check2;
  assert.equal(a.timers.size, 0);
  velha.receber({ tipo: "conectado", tabId: 1 }); assert.equal(a.app.ativa(), false);
});

test("biblioteca manda glosa exata ao Meet apenas no modo fala e não inicia captura", () => {
  const a = ambiente();
  assert.equal(a.app.mostrarSinal("OI", "Oi"), false);
  a.conectar(); a.confirmar();
  assert.equal(a.app.mostrarSinal("OI", "Oi"), false);
  a.app.mudarModo("fala");
  assert.equal(a.app.mostrarSinal("BOM_DIA", "Bom dia"), true);
  const d = ultimo(a, "avatar-sinal");
  assert.equal(d.glosa, "BOM_DIA"); assert.equal(d.rotulo, "Bom dia");
  const antes = a.porta().mensagens.length;
  assert.equal(a.app.mostrarSinal("../ruim", "ruim"), false);
  assert.equal(a.porta().mensagens.length, antes);
  a.app.destruir();
});


test("guia sem integração instalada pede recarga e só informa câmera pronta após resposta de mídia", () => {
  const a = ambiente(); a.app.mudarModo("fala"); a.conectar();
  a.porta().receber({ tipo: "conectado", tabId: 2, disponivel: false });
  assert.equal(a.app.ativa(), true);
  assert.match(a.estado(), /Recarregue esta guia do Meet/);
  assert.doesNotMatch(a.estado(), /Avatar integrado/);
  a.porta().receber({ tipo: "conectado", tabId: 2, disponivel: true });
  assert.match(a.estado(), /Ligue a c.mera do Meet/);
  a.porta().receber({ tipo: "midia-status", camera: true, avatar: false, audio: false });
  assert.match(a.estado(), /Aguardando o v.deo do avatar/);
  a.app.destruir();
});
