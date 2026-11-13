import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import fs from "node:fs";
import { configuracao, glosaValida, ehMeet } from "../meet/protocolo.mjs";

const fonte = fs.readFileSync(new URL("../painel/integracao-meet.mjs", import.meta.url), "utf8")
  .replace(/^import .*;\s*/gm, "").replace("export function montarIntegracaoMeet", "function montarIntegracaoMeet")
  + "\nglobalThis.montar = montarIntegracaoMeet;";
const flush = () => new Promise(resolve => setImmediate(resolve));
const diferido = () => { let resolve, reject; const promise = new Promise((sim, nao) => { resolve = sim; reject = nao; }); return { promise, resolve, reject }; };
class Elemento {
  constructor() { this.value = ""; this.checked = true; this.disabled = false; this.hidden = false; this.textContent = ""; this.children = []; this.listeners = new Map(); }
  addEventListener(tipo, fn) { this.listeners.set(tipo, fn); }
  emitir(tipo = "click") { return this.listeners.get(tipo)?.(); }
  replaceChildren(...itens) { this.children = itens; }
}
function ambiente({ consultar = async () => [] } = {}) {
  const nomes = ["reuniao-meet", "estado-meet", "conexao-meet", "conectar-meet", "desconectar-meet", "posicao-meet", "tamanho-meet", "voz-no-meet", "testar-voz-meet", "atualizar-meet"];
  const elementos = Object.fromEntries(nomes.map(nome => [nome, new Elemento()]));
  const carregando = new Elemento(); carregando.textContent = "Carregando reuniões…";
  elementos["reuniao-meet"].children = [carregando];
  const portas = [], consultas = [], hooks = [], timers = new Map(), dados = new Map();
  let numero = 0, agora = 0, erroAtual, leiturasErro = 0, capturas = 0;
  const runtime = {
    get lastError() { leiturasErro += 1; return erroAtual; },
    connect(cfg) {
      assert.equal(cfg.name, "libras-painel");
      const ouvintes = [], desligamentos = [], mensagens = [];
      let fechada = false;
      const porta = {
        mensagens, onMessage: { addListener: fn => ouvintes.push(fn) }, onDisconnect: { addListener: fn => desligamentos.push(fn) },
        postMessage(d) { if (fechada) throw new Error("Porta fechada"); mensagens.push(d); },
        receber(d) { for (const fn of ouvintes) fn(d); },
        disconnect(erro) {
          if (fechada) return;
          fechada = true; erroAtual = erro ? { message: erro } : undefined;
          try { for (const fn of desligamentos) fn(); } finally { erroAtual = undefined; }
        }
      };
      portas.push(porta); return porta;
    }
  };
  function agendar(fn, ms, intervalo) {
    const id = ++numero; timers.set(id, { fn, em: agora + ms, ms, intervalo }); return id;
  }
  const contexto = vm.createContext({
    configuracao, glosaValida, ehMeet, URL,
    document: { querySelector: seletor => elementos[seletor.slice(1)], createElement: () => new Elemento() },
    localStorage: { getItem: chave => dados.get(chave) ?? null, setItem: (chave, valor) => dados.set(chave, valor) },
    chrome: { runtime, tabs: { query(filtro) { consultas.push(filtro); return consultar(filtro, consultas.length); } } },
    navigator: { mediaDevices: { getUserMedia() { capturas += 1; throw new Error("A listagem não deve abrir o microfone."); } } },
    setTimeout: (fn, ms) => agendar(fn, ms, false), clearTimeout: id => timers.delete(id),
    setInterval: (fn, ms) => agendar(fn, ms, true), clearInterval: id => timers.delete(id)
  });
  vm.runInContext(fonte, contexto);
  const app = contexto.montar({ aoConexao: valor => hooks.push(valor) });
  return {
    app, elementos, portas, consultas, hooks, timers, leiturasErro: () => leiturasErro, capturas: () => capturas,
    porta: () => portas.at(-1), estado: () => elementos["estado-meet"].textContent,
    opcoes: () => elementos["reuniao-meet"].children.map(item => item.textContent),
    atualizar: () => elementos["atualizar-meet"].emitir(),
    conectar(id = 7) { elementos["reuniao-meet"].value = String(id); elementos["conectar-meet"].emitir(); },
    async avancar(ms) {
      const ate = agora + ms;
      for (let iteracao = 0; iteracao < 100; iteracao++) {
        const proximo = [...timers].filter(([, timer]) => timer.em <= ate).sort((a, b) => a[1].em - b[1].em)[0];
        if (!proximo) break;
        const [id, timer] = proximo; agora = timer.em;
        if (timer.intervalo) timer.em += timer.ms; else timers.delete(id);
        timer.fn(); await flush();
        if (iteracao === 99) throw new Error("Laço inesperado nos temporizadores.");
      }
      agora = ate; await flush();
    }
  };
}
const reuniao = (id = 7, title = "Minha reunião") => ({ id, title, url: "https://meet.google.com/abc-defg-hij", active: true });
const semResposta = () => new Promise(() => {});
const totalEnviadas = (a, tipo) => a.portas.flatMap(porta => porta.mensagens).filter(d => d.tipo === tipo).length;

test("consulta direta lista Meet mesmo sem resposta do worker e não inicia conexão ou microfone", async () => {
  const a = ambiente({ consultar: async () => [reuniao(), { id: 9, title: "Fora", url: "https://meet.google.com.example.org/abc" }] });
  await flush();
  assert.equal(a.consultas.length, 1);
  assert.equal(a.consultas[0].url, "https://meet.google.com/*");
  assert.deepEqual(a.opcoes(), ["Minha reunião"]);
  assert.equal(a.elementos["reuniao-meet"].value, "7");
  assert.doesNotMatch(a.estado(), /Carregando/);
  assert.equal(a.app.ativa(), false); assert.deepEqual(a.hooks, []);
  assert.equal(totalEnviadas(a, "conectar"), 0); assert.equal(a.capturas(), 0);
  a.app.destruir();
});

test("resposta vazia ou erro da consulta não deixam seletor preso em Carregando", async () => {
  const vazia = ambiente(); await flush();
  assert.equal(vazia.elementos["reuniao-meet"].value, "");
  assert.equal(vazia.opcoes().some(texto => /Carregando/.test(texto)), false);
  assert.match(vazia.estado(), /Abra|Meet/); vazia.app.destruir();
  const falha = ambiente({ consultar: async () => { throw new Error("Consulta indisponível"); } });
  await flush(); await falha.avancar(5000);
  assert.equal(falha.opcoes().some(texto => /Carregando/.test(texto)), false);
  assert.match(falha.estado(), /[Rr]ecarreg|[Aa]tualiz|[Nn]ão|indisponível/);
  assert.equal(falha.app.ativa(), false); falha.app.destruir();
});

test("desconexão inicial lê lastError e refaz comunicação após 500 ms sem conectar reunião", async () => {
  const a = ambiente({ consultar: semResposta }), velha = a.porta();
  velha.disconnect("Could not establish connection. Receiving end does not exist.");
  assert.ok(a.leiturasErro() > 0);
  await a.avancar(499); assert.equal(a.portas.length, 1);
  await a.avancar(1); assert.equal(a.portas.length, 2);
  a.porta().receber({ tipo: "reunioes", reunioes: [{ id: 4, titulo: "Reunião recuperada", ativa: true }] });
  assert.equal(a.elementos["reuniao-meet"].value, "4");
  velha.receber({ tipo: "reunioes", reunioes: [{ id: 3, titulo: "Antiga", ativa: true }] });
  velha.receber({ tipo: "conectado", tabId: 3, disponivel: true, confirmado: true });
  assert.equal(a.elementos["reuniao-meet"].value, "4"); assert.equal(a.app.ativa(), false);
  assert.deepEqual(a.hooks, []); assert.equal(totalEnviadas(a, "conectar"), 0); assert.equal(a.capturas(), 0);
  a.app.destruir();
});

test("recuperação automática é limitada a duas tentativas e Atualizar permite nova tentativa", async () => {
  const a = ambiente({ consultar: semResposta });
  for (let tentativa = 0; tentativa < 3; tentativa++) {
    a.porta().disconnect("Receiving end does not exist.");
    await a.avancar(500);
  }
  assert.equal(a.portas.length, 3);
  await a.avancar(10000); assert.equal(a.portas.length, 3);
  assert.match(a.estado(), /[Rr]ecarreg|[Aa]tualiz/);
  a.atualizar(); assert.equal(a.portas.length, 4);
  a.porta().disconnect("Falha temporária");
  await a.avancar(500); assert.equal(a.portas.length, 5);
  assert.equal(totalEnviadas(a, "conectar"), 0); assert.deepEqual(a.hooks, []);
  a.app.destruir();
});

test("consulta antiga não substitui a lista mais recente após Atualizar", async () => {
  const antiga = diferido(), nova = diferido();
  const a = ambiente({ consultar: (_filtro, numero) => numero === 1 ? antiga.promise : nova.promise });
  a.atualizar(); assert.equal(a.consultas.length, 2);
  nova.resolve([reuniao(8, "Atual")]); await flush();
  assert.equal(a.elementos["reuniao-meet"].value, "8");
  antiga.resolve([reuniao(2, "Antiga")]); await flush();
  assert.equal(a.elementos["reuniao-meet"].value, "8"); assert.deepEqual(a.opcoes(), ["Atual"]);
  a.app.destruir();
});

test("prazos de listagem e conexão devolvem controle sem declarar sucesso", async () => {
  const lista = ambiente({ consultar: semResposta });
  await lista.avancar(5000);
  assert.equal(lista.opcoes().some(texto => /Carregando/.test(texto)), false);
  assert.match(lista.estado(), /[Rr]ecarreg|[Aa]tualiz|[Nn]ão|demor|respon/);
  assert.equal(lista.app.ativa(), false); lista.app.destruir();
  const a = ambiente({ consultar: async () => [reuniao()] }); await flush();
  a.conectar(); assert.equal(a.elementos["conectar-meet"].disabled, true);
  await a.avancar(6000);
  assert.equal(a.elementos["conectar-meet"].disabled, false);
  assert.equal(a.app.ativa(), false); assert.deepEqual(a.hooks, []);
  assert.match(a.estado(), /[Rr]ecarreg|[Aa]tualiz|[Nn]ão|demor|respon/);
  a.porta().receber({ tipo: "conectado", tabId: 7, disponivel: true, confirmado: true });
  assert.equal(a.app.ativa(), false); assert.deepEqual(a.hooks, []);
  assert.equal(a.elementos["conectar-meet"].disabled, false);
  a.app.destruir();
});

test("destruir cancela todos os timers e ignora consulta ou mensagens tardias", async () => {
  const consulta = diferido(), a = ambiente({ consultar: () => consulta.promise }), velha = a.porta();
  velha.disconnect("Falha antes da lista"); a.app.destruir();
  assert.equal(a.timers.size, 0); const quantidade = a.portas.length, estado = a.estado();
  consulta.resolve([reuniao()]); await flush();
  velha.receber({ tipo: "reunioes", reunioes: [{ id: 4, titulo: "Tardia" }] });
  velha.receber({ tipo: "conectado", tabId: 4, disponivel: true, confirmado: true });
  await a.avancar(10000);
  assert.equal(a.portas.length, quantidade); assert.equal(a.estado(), estado);
  assert.equal(a.app.ativa(), false); assert.deepEqual(a.hooks, []); assert.equal(a.timers.size, 0);
});
