import test from "node:test";
import assert from "node:assert/strict";
import { montarVLibras } from "../painel/vlibras.js";

const aguardar = () => new Promise((resolve) => setImmediate(resolve));

test("avatar inicializa personagem, enfileira frases e permanece após limpar", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const elementos = {};
  const enviados = [];
  let aoEvento, iframe, removidos = 0, consultas = 0, falhar = false;
  const criarElemento = () => ({
    hidden: false, disabled: false, value: "", textContent: "", eventos: {}, setAttribute() {},
    addEventListener(nome, acao) { this.eventos[nome] = acao; },
    append(filho) { iframe = filho; },
  });
  for (const id of ["avatar", "estado-vlibras", "glosa", "texto-glosa", "traduzir", "repetir", "tentar-avatar", "texto-fala", "limpar-fala", "pausar-avatar", "velocidade-avatar"]) elementos[`#${id}`] = criarElemento();
  const originais = { document: globalThis.document, window: globalThis.window, fetch: globalThis.fetch };
  globalThis.document = {
    querySelector: (id) => elementos[id],
    createElement: () => ({ contentWindow: { postMessage: (mensagem) => enviados.push(mensagem) }, remove: () => removidos++ }),
  };
  globalThis.window = { addEventListener: (_tipo, acao) => { aoEvento = acao; } };
  globalThis.fetch = async (_url, opcoes) => {
    consultas++;
    if (falhar) return { ok: false, status: 503 };
    return { ok: true, text: async () => JSON.parse(opcoes.body).text.toUpperCase() };
  };
  const emitir = (event, data) => aoEvento({ source: iframe.contentWindow, origin: "https://vlibras.gov.br", data: { type: "unity_event", event, data } });
  let avatar;
  try {
    avatar = montarVLibras();
    assert.equal(iframe, undefined, "modo de câmera não inicia o avatar oculto");
    avatar.abrir();
    assert.ok(iframe, "iframe já existe antes de qualquer tradução");
    avatar.adicionar("Bom dia");
    avatar.adicionar("Tudo bem");
    await aguardar();
    assert.equal(enviados.filter((item) => item.method === "playNow").length, 0);
    emitir("on_load_player");
    assert.equal(enviados.filter((item) => item.method === "playNow").length, 0, "aguarda inicialização do personagem");
    t.mock.timers.tick(500);
    assert.ok(enviados.findIndex((item) => item.method === "Change" && item.params === "icaro") < enviados.findIndex((item) => item.method === "playNow"));
    assert.deepEqual(enviados.filter((item) => item.method === "playNow").map((item) => item.params), ["BOM DIA"]);
    emitir("on_playing_state_change", ["False", "False", "False", "True", "False"]);
    emitir("on_playing_state_change", ["True", "False", "False", "False", "True"]);
    assert.equal(enviados.filter((item) => item.method === "playNow").length, 1);
    emitir("on_playing_state_change", ["False", "True", "False", "False", "True"]);
    assert.equal(enviados.filter((item) => item.method === "playNow").length, 1, "pausa não termina a frase");
    emitir("on_playing_state_change", ["False", "False", "False", "True", "False"]);
    assert.equal(enviados.filter((item) => item.method === "playNow").length, 1, "carregar animação não termina a frase");
    emitir("on_playing_state_change", ["False", "False", "True", "False", "True"]);
    assert.deepEqual(enviados.filter((item) => item.method === "playNow").map((item) => item.params), ["BOM DIA", "TUDO BEM"]);
    elementos["#limpar-fala"].eventos.click();
    assert.equal(removidos, 0, "limpar mantém o boneco na tela");
    assert.equal(elementos["#avatar"].hidden, false);
    avatar.adicionar("Bom dia");
    await aguardar();
    assert.equal(consultas, 2, "frase repetida reutiliza tradução em memória");
    // Continua aceitando o evento de três flags de versões antigas.
    emitir("on_playing_state_change", [true, false, false]);
    emitir("on_playing_state_change", [false, false, false]);
    assert.match(elementos["#estado-vlibras"].textContent, /pronto/);
    elementos["#pausar-avatar"].eventos.click();
    const antesDaPausa = enviados.filter((item) => item.method === "playNow").length;
    avatar.adicionar("Depois da pausa");
    await aguardar();
    assert.equal(enviados.filter((item) => item.method === "playNow").length, antesDaPausa);
    elementos["#velocidade-avatar"].value = "1.5";
    elementos["#velocidade-avatar"].eventos.change();
    assert.deepEqual(enviados.at(-1), { type: "unity", object: "PlayerManager", method: "setSlider", params: 1.5 });
    elementos["#pausar-avatar"].eventos.click();
    assert.equal(enviados.filter((item) => item.method === "playNow").length, antesDaPausa + 1);
    emitir("on_playing_state_change", [true, false, false, false, true]);
    falhar = true;
    avatar.adicionar("Após falha temporária");
    await aguardar();
    assert.equal(elementos["#tentar-avatar"].hidden, false);
    const quadroAnterior = iframe;
    falhar = false;
    elementos["#tentar-avatar"].eventos.click();
    await aguardar();
    assert.equal(iframe, quadroAnterior, "erro HTTP não recarrega o Unity");
    assert.equal(removidos, 0);
    assert.equal(enviados.filter((item) => item.method === "playNow").length, antesDaPausa + 1, "retentar tradução não interrompe nem repete o trecho atual");
    emitir("on_playing_state_change", [false, false, true, false, true]);
    assert.equal(enviados.filter((item) => item.method === "playNow").at(-1).params, "APÓS FALHA TEMPORÁRIA");
  } finally {
    avatar?.destruir();
    Object.assign(globalThis, originais);
  }
});

test("avatar aceita progresso oficial com loading ativo e oferece retomada se não iniciar", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const elementos = {}, enviados = [];
  let aoEvento, iframe;
  for (const id of ["avatar", "estado-vlibras", "glosa", "texto-glosa", "traduzir", "repetir", "testar-avatar", "tentar-avatar", "texto-fala", "limpar-fala", "pausar-avatar", "velocidade-avatar"]) elementos[`#${id}`] = {
    value: "1", eventos: {}, setAttribute() {}, addEventListener(n, fn) { this.eventos[n] = fn; }, append(filho) { iframe = filho; },
  };
  const originais = { document: globalThis.document, window: globalThis.window, fetch: globalThis.fetch };
  globalThis.document = {
    querySelector: (id) => elementos[id],
    createElement: () => ({ contentWindow: { postMessage: (msg) => enviados.push(msg) }, remove() {} }),
  };
  globalThis.window = { addEventListener(_n, fn) { aoEvento = fn; }, removeEventListener() {} };
  globalThis.fetch = async (_url, pedido) => ({ ok: true, text: async () => JSON.parse(pedido.body).text === "Tudo bem?" ? "TUDO_BEM [INTERROGAÇÃO]" : "COMO VOCÊ BOM [INTERROGAÇÃO]" });
  const emitir = (event, data) => aoEvento({ origin: "https://vlibras.gov.br", source: iframe.contentWindow, data: { type: "unity_event", event, data } });
  let avatar;
  try {
    avatar = montarVLibras();
    elementos["#testar-avatar"].eventos.click();
    await aguardar();
    emitir("on_load_player"); t.mock.timers.tick(500);
    assert.equal(enviados.at(-1).params, "TUDO_BEM [INTERROGAÇÃO]");
    emitir("counter_gloss", [0, 2]);
    t.mock.timers.tick(15000);
    assert.match(elementos["#estado-vlibras"].textContent, /não iniciou/);
    assert.equal(elementos["#tentar-avatar"].hidden, false);
    elementos["#tentar-avatar"].eventos.click();
    emitir("on_load_player"); t.mock.timers.tick(500);
    assert.equal(enviados.filter((msg) => msg.method === "playNow").length, 2, "retoma o mesmo trecho preservado");
    avatar.adicionar("Como você está?"); await aguardar();
    emitir("on_playing_state_change", ["True", "False", "False", "True", "False"]);
    assert.match(elementos["#estado-vlibras"].textContent, /Sinalizando/);
    emitir("counter_gloss", [1, 2]);
    t.mock.timers.tick(15000);
    assert.equal(elementos["#tentar-avatar"].hidden, true, "sinalização confirmada não usa o prazo curto de inicialização");
    emitir("on_playing_state_change", ["False", "False", "True", "False", "True"]);
    assert.equal(enviados.at(-1).params, "COMO VOCÊ BOM [INTERROGAÇÃO]", "avança para a segunda frase");
    emitir("counter_gloss", [1, 4]);
    emitir("on_playing_state_change", ["False", "False", "False", "False", "True"]);
    assert.match(elementos["#estado-vlibras"].textContent, /pronto/);
  } finally { avatar?.destruir(); Object.assign(globalThis, originais); }
});
