import test from "node:test";
import assert from "node:assert/strict";
import { instalarServicoMeet } from "../meet/servico.mjs";
import { configuracao, ehMeet, audioValido } from "../meet/protocolo.mjs";

const ID = "jcfphakcklekbchlfdopcaanopkmppbd";
const EXT = "chrome-extension://" + ID;
const pausa = () => new Promise(resolve => setImmediate(resolve));
function evento() {
  const ouvintes = [];
  return { addListener: fn => ouvintes.push(fn), async emitir(...args) { await Promise.all(ouvintes.map(fn => fn(...args))); } };
}
function porta(name, sender) {
  const onMessage = evento(), onDisconnect = evento(), enviadas = [];
  let fechada = false;
  return {
    name, sender, onMessage, onDisconnect, enviadas,
    postMessage(dado) { if (fechada) throw new Error("Porta fechada"); enviadas.push(dado); },
    disconnect() { if (!fechada) { fechada = true; onDisconnect.emitir(); } },
    fechada: () => fechada,
    receber: msg => onMessage.emitir(msg)
  };
}
function ambiente() {
  const tabs = new Map([
    [1, { id: 1, url: "https://meet.google.com/aaa-bbbb-ccc", title: "Reunião 1", active: true }],
    [2, { id: 2, url: "https://meet.google.com/ddd-eeee-fff", title: "Reunião 2", active: false }],
    [3, { id: 3, url: "https://example.com", title: "Outra", active: false }]
  ]);
  const consultas = [], procuras = [];
  let obter = async id => tabs.get(id);
  const api = {
    runtime: { id: ID, onConnect: evento() },
    tabs: { onRemoved: evento(), onUpdated: evento(),
      query: async filtro => { consultas.push(filtro); return [...tabs.values()]; },
      get: async id => { procuras.push(id); return obter(id); } }
  };
  const servico = instalarServicoMeet(api);
  const registrar = p => { api.runtime.onConnect.emitir(p); return p; };
  return {
    api, servico, consultas, procuras, tabs,
    obter(fn) { obter = fn; },
    painel(extra = {}) { return registrar(porta("libras-painel", { id: ID, url: EXT + "/painel/index.html", ...extra })); },
    meet(id, extra = {}) { return registrar(porta("libras-meet", { id: ID, url: tabs.get(id)?.url, tab: { id }, frameId: 0, ...extra })); },
    avatar(id, extra = {}) { return registrar(porta("libras-avatar", { id: ID, url: EXT + "/meet/avatar.html", tab: { id }, frameId: 2, ...extra })); },
    registrar
  };
}
const pcm = (id = 1) => ({ tipo: "audio", id, sampleRate: 16000, samples: [0, .25, -.25], frase: "Oi Gabriel" });
const ultima = (p, tipo) => p.enviadas.filter(m => m.tipo === tipo).at(-1);
const diferido = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };

test("protocolo usa origem Meet exata, cantos válidos e PCM limitado", () => {
  assert.equal(ehMeet("https://meet.google.com/aaa-bbbb-ccc"), true);
  for (const url of ["http://meet.google.com", "https://meet.google.com.example.com", "https://meet.google.com:444/aaa-bbbb-ccc", "chrome://extensions", "inválida"]) {
    assert.equal(ehMeet(url), false, url);
  }
  assert.deepEqual(configuracao(), { conectado: true, modo: "sinais", posicao: "inferior-esquerdo", tamanho: "medio", vozNoMeet: true });
  assert.equal(configuracao({ modo: "fala", posicao: "superior-direito", tamanho: "grande", vozNoMeet: false }).posicao, "superior-direito");
  assert.equal(configuracao({ posicao: "fora", tamanho: "fora" }).tamanho, "medio");
  assert.equal(audioValido(pcm()), true);
  for (const alteracao of [{ id: 0 }, { sampleRate: 7999 }, { samples: [] }, { samples: [NaN] }, { samples: [Infinity] }, { samples: [1.01] }, { frase: "x".repeat(501) }]) {
    assert.equal(audioValido({ ...pcm(), ...alteracao }), false);
  }
});

test("serviço exige painel autorizado, remetente/frame corretos e seleção explícita de guia Meet", async () => {
  const a = ambiente();
  for (const p of [
    porta("libras-painel", { id: "outra", url: EXT + "/painel/index.html" }),
    porta("libras-painel", { id: ID, url: "https://example.com/painel/index.html" }),
    porta("libras-painel", { id: ID, url: EXT + "/outro.html" }),
    porta("libras-painel", { id: ID, url: "chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/painel/index.html" }),
    porta("libras-meet", { id: ID, url: "https://meet.google.com/aaa", tab: { id: 1 }, frameId: 4 }),
    porta("libras-meet", { id: ID, url: "https://example.com", tab: { id: 3 }, frameId: 0 })
  ]) { a.registrar(p); assert.equal(p.fechada(), true); }
  const p = a.painel();
  assert.equal(a.procuras.length, 0); assert.equal(ultima(p, "conectado"), undefined);
  await p.receber({ tipo: "listar" });
  assert.deepEqual(ultima(p, "reunioes").reunioes.map(t => t.id), [1, 2]);
  assert.deepEqual(a.consultas[0], { url: "https://meet.google.com/*" });
  await p.receber({ tipo: "conectar" });
  assert.match(ultima(p, "erro").erro, /Escolha/);
  await p.receber({ tipo: "conectar", tabId: 3 });
  assert.equal(ultima(p, "conectado"), undefined);
  await p.receber({ tipo: "conectar", tabId: 2, config: { modo: "fala" } });
  assert.equal(ultima(p, "conectado").tabId, 2);
  assert.equal(ultima(p, "conectado").disponivel, false);
});

test("um painel controla uma guia; PCM e ACK só passam pela guia e sessão selecionadas", async () => {
  const a = ambiente(), m1 = a.meet(1), m2 = a.meet(2), p1 = a.painel(), p2 = a.painel();
  await p1.receber({ tipo: "conectar", tabId: 1 });
  const antiga = ultima(p1, "conectado").sessao;
  await p2.receber({ tipo: "conectar", tabId: 2 });
  const sessao = ultima(p2, "conectado").sessao;
  assert.notEqual(sessao, antiga);
  assert.ok(ultima(p1, "desconectado"));
  await p1.receber(pcm(1)); assert.equal(ultima(m1, "audio"), undefined);
  await p2.receber(pcm(2));
  assert.equal(ultima(m1, "audio"), undefined);
  assert.equal(ultima(m2, "audio").id, 2);
  assert.equal(ultima(m2, "audio").sessao, sessao);
  await m1.receber({ tipo: "audio-recebido", sessao, id: 2, aceito: true });
  await m2.receber({ tipo: "audio-recebido", sessao: antiga, id: 2, aceito: true });
  assert.equal(ultima(p2, "audio-recebido"), undefined);
  await m2.receber({ tipo: "audio-recebido", sessao, id: 2, aceito: true });
  assert.equal(ultima(p2, "audio-recebido").aceito, true);
  assert.equal(ultima(p1, "audio-recebido"), undefined);
});

test("cancelar ou fechar painel durante tabs.get não ressuscita conexão; pedido mais novo vence", async () => {
  const a = ambiente(), p = a.painel(), d = diferido();
  a.obter(() => d.promise);
  const pedido = p.receber({ tipo: "conectar", tabId: 1 });
  await p.receber({ tipo: "desconectar" });
  d.resolve(a.tabs.get(1)); await pedido;
  assert.equal(ultima(p, "conectado"), undefined);
  const fechado = a.painel(), d2 = diferido();
  a.obter(() => d2.promise);
  const pedido2 = fechado.receber({ tipo: "conectar", tabId: 1 });
  fechado.disconnect(); d2.resolve(a.tabs.get(1)); await pedido2;
  assert.equal(ultima(fechado, "conectado"), undefined);
  const d3 = diferido();
  a.obter(id => id === 1 ? d3.promise : Promise.resolve(a.tabs.get(id)));
  const antigo = p.receber({ tipo: "conectar", tabId: 1 });
  await p.receber({ tipo: "conectar", tabId: 2 });
  d3.resolve(a.tabs.get(1)); await antigo;
  assert.equal(p.enviadas.filter(m => m.tipo === "conectado").length, 1);
  assert.equal(ultima(p, "conectado").tabId, 2);
});

test("fila do avatar conserva 12 trechos na ordem; parar e mudar modo limpam os pendentes", async () => {
  const a = ambiente(), p = a.painel(); a.meet(1);
  await p.receber({ tipo: "conectar", tabId: 1, config: { modo: "fala" } });
  const indevido = a.avatar(2); assert.equal(indevido.fechada(), true);
  for (let i = 0; i < 13; i++) await p.receber({ tipo: "avatar-texto", texto: "trecho " + i });
  assert.match(ultima(p, "erro").erro, /cheio/);
  const avatar = a.avatar(1);
  assert.deepEqual(avatar.enviadas.filter(m => m.tipo === "avatar-texto").map(m => m.texto),
    Array.from({ length: 12 }, (_, i) => "trecho " + i));
  avatar.disconnect();
  await p.receber({ tipo: "avatar-texto", texto: "descartar no stop" });
  await p.receber({ tipo: "avatar-parar" });
  const segundo = a.avatar(1);
  assert.equal(ultima(segundo, "avatar-texto"), undefined);
  segundo.disconnect();
  await p.receber({ tipo: "avatar-texto", texto: "descartar no modo" });
  await p.receber({ tipo: "config", config: { modo: "sinais" } });
  await p.receber({ tipo: "config", config: { modo: "fala" } });
  const terceiro = a.avatar(1);
  assert.equal(ultima(terceiro, "avatar-texto"), undefined);
});

test("reload substitui porta; painel fechado, navegação e guia fechada desligam a conexão", async () => {
  const a = ambiente(), m = a.meet(1), p = a.painel();
  await p.receber({ tipo: "conectar", tabId: 1 });
  const sessao = ultima(p, "conectado").sessao;
  const novo = a.meet(1);
  assert.equal(m.fechada(), true);
  assert.equal(ultima(novo, "config").sessao, sessao);
  const antes = p.enviadas.length;
  await m.receber({ tipo: "midia-status", sessao, camera: true, audio: true });
  assert.equal(p.enviadas.length, antes);
  novo.disconnect(); await pausa();
  assert.ok(ultima(p, "aguardando-meet"));
  const reposicao = a.meet(1);
  p.disconnect(); await pausa();
  assert.ok(ultima(reposicao, "desconectar"));
  const antesDeTentar = reposicao.enviadas.length;
  await p.receber(pcm(90));
  assert.equal(reposicao.enviadas.length, antesDeTentar);
  for (const motivo of ["navegar", "fechar"]) {
    const b = ambiente(), meet = b.meet(1), painel = b.painel();
    await painel.receber({ tipo: "conectar", tabId: 1 });
    if (motivo === "navegar") await b.api.tabs.onUpdated.emitir(1, { url: "https://example.com" }, { ...b.tabs.get(1), url: "https://example.com" });
    else await b.api.tabs.onRemoved.emitir(1);
    assert.ok(ultima(meet, "desconectar"), motivo);
    assert.ok(ultima(painel, "desconectado"), motivo);
  }
});

test("serviço recusa áudio desligado/inválido e sinaliza falha sem guia receptora", async () => {
  const a = ambiente(), m = a.meet(1), p = a.painel();
  await p.receber({ tipo: "conectar", tabId: 1, config: { vozNoMeet: false } });
  await p.receber(pcm(10));
  assert.equal(ultima(m, "audio"), undefined);
  assert.equal(ultima(p, "audio-recebido").aceito, false);
  await p.receber({ tipo: "config", config: { vozNoMeet: true } });
  await p.receber({ ...pcm(11), samples: [NaN] });
  assert.equal(ultima(m, "audio"), undefined);
  assert.equal(ultima(p, "audio-recebido").id, 11);
  m.disconnect();
  await p.receber(pcm(12));
  assert.equal(ultima(p, "audio-recebido").aceito, false);
  assert.match(ultima(p, "audio-recebido").erro, /Atualize/);
});

test("resultado tardio do avatar/Meet de sessão anterior não altera o painel atual", async () => {
  const a = ambiente(), meet = a.meet(1), p = a.painel();
  await p.receber({ tipo: "conectar", tabId: 1, config: { modo: "fala" } });
  const antiga = ultima(p, "conectado").sessao;
  const avatar = a.avatar(1);
  await p.receber({ tipo: "conectar", tabId: 1, config: { modo: "fala" } });
  const atual = ultima(p, "conectado").sessao;
  const antes = p.enviadas.length;
  await avatar.receber({ tipo: "avatar-status", sessao: antiga, estado: "antigo" });
  await meet.receber({ tipo: "midia-status", sessao: antiga, audio: true, camera: true });
  assert.equal(p.enviadas.length, antes);
  await avatar.receber({ tipo: "avatar-status", sessao: atual, estado: "atual" });
  assert.equal(ultima(p, "avatar-status").estado, "atual");
});

test("serviço conserva glosa da biblioteca na fila e a encaminha somente ao avatar escolhido", async () => {
  const a = ambiente(), p = a.painel();
  await p.receber({ tipo: "conectar", tabId: 1, config: { modo: "fala" } });
  await p.receber({ tipo: "avatar-sinal", glosa: "BOM_DIA", rotulo: "Bom dia" });
  const avatar = a.avatar(1);
  assert.equal(ultima(avatar, "avatar-sinal").glosa, "BOM_DIA");
  const antes = avatar.enviadas.length;
  await p.receber({ tipo: "avatar-sinal", glosa: "../ruim", rotulo: "ruim" });
  assert.equal(avatar.enviadas.length, antes);
  await p.receber({ tipo: "avatar-sinal", glosa: "OI", rotulo: "Oi" });
  assert.equal(ultima(avatar, "avatar-sinal").glosa, "OI");
  await p.receber({ tipo: "config", config: { modo: "sinais" } });
  const depois = avatar.enviadas.length;
  await p.receber({ tipo: "avatar-sinal", glosa: "TUDO_BEM", rotulo: "Tudo bem" });
  assert.equal(avatar.enviadas.length, depois);
  a.servico.destruir();
});
