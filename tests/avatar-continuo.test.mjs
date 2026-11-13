import test from "node:test";
import assert from "node:assert/strict";
import { montarVLibras } from "../painel/vlibras.js";

const aguardar = () => new Promise((resolve) => setImmediate(resolve));

test("avatar carrega ao entrar no modo de voz, enfileira frases e permanece após limpar", async () => {
  const elementos = {};
  const enviados = [];
  let aoEvento, iframe, removidos = 0, consultas = 0;
  const criarElemento = () => ({
    hidden: false, disabled: false, value: "", textContent: "", eventos: {},
    addEventListener(nome, acao) { this.eventos[nome] = acao; },
    append(filho) { iframe = filho; },
  });
  for (const id of ["avatar", "estado-vlibras", "glosa", "texto-glosa", "traduzir", "repetir", "tentar-avatar", "texto-fala", "limpar-fala"]) elementos[`#${id}`] = criarElemento();
  const originais = { document: globalThis.document, window: globalThis.window, fetch: globalThis.fetch };
  globalThis.document = {
    querySelector: (id) => elementos[id],
    createElement: () => ({ contentWindow: { postMessage: (mensagem) => enviados.push(mensagem) }, remove: () => removidos++ }),
  };
  globalThis.window = { addEventListener: (_tipo, acao) => { aoEvento = acao; } };
  globalThis.fetch = async (_url, opcoes) => {
    consultas++;
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
  } finally {
    avatar?.destruir();
    Object.assign(globalThis, originais);
  }
});
