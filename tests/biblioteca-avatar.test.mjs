import test from "node:test";
import assert from "node:assert/strict";
import { montarVLibras } from "../painel/vlibras.js";
import { glosaValida } from "../meet/protocolo.mjs";

const flush = () => new Promise((r) => setImmediate(r));
test("entrada de biblioteca toca a glosa exata em fila sem nova tradução ou microfone", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const ids = ["avatar", "estado-vlibras", "glosa", "texto-glosa", "trecho-avatar", "traduzir", "repetir",
    "tentar-avatar", "testar-avatar", "texto-fala", "pausar-avatar", "velocidade-avatar", "limpar-fala"];
  const elementos = Object.fromEntries(ids.map((id) => [id, { textContent: "", value: "1", hidden: false,
    addEventListener() {}, setAttribute() {}, append(f) { iframe = f; } }]));
  const comandos = [], eventos = {};
  let iframe, consultas = 0, avatar;
  const anterior = { document: globalThis.document, window: globalThis.window, fetch: globalThis.fetch };
  globalThis.document = { querySelector: (id) => elementos[id.slice(1)],
    createElement: () => ({ contentWindow: { postMessage: (d) => comandos.push(d) }, remove() {} }) };
  globalThis.window = { addEventListener: (tipo, fn) => { eventos[tipo] = fn; }, removeEventListener() {} };
  globalThis.fetch = async () => { consultas++; throw new Error("Uma glosa do catálogo não precisa retradução."); };
  const emitir = (event, data) => eventos.message({ source: iframe.contentWindow, origin: "https://vlibras.gov.br",
    data: { type: "unity_event", event, data } });
  try {
    avatar = montarVLibras();
    assert.equal(avatar.mostrarSinal("BOM_DIA", "Bom dia"), true);
    assert.equal(avatar.mostrarSinal("TUDO_BEM", "Tudo bem"), true);
    emitir("on_load_player");
    t.mock.timers.tick(500); await flush();
    assert.deepEqual(comandos.filter((d) => d.method === "playNow").map((d) => d.params), ["BOM_DIA"]);
    emitir("on_playing_state_change", [true, false, false, false, true]);
    emitir("on_playing_state_change", [false, false, false, false, true]);
    assert.deepEqual(comandos.filter((d) => d.method === "playNow").map((d) => d.params), ["BOM_DIA", "TUDO_BEM"]);
    assert.equal(consultas, 0);
    for (const ruim of ["../OUTRO", "<script>", "https://example.com", "A".repeat(129)]) assert.equal(avatar.mostrarSinal(ruim), false);
  } finally { avatar?.destruir(); Object.assign(globalThis, anterior); }
});
test("biblioteca encaminha glosa ao avatar do Meet uma vez, com origem e caracteres limitados", () => {
  const elementos = new Map(), pedidos = [];
  const anterior = { document: globalThis.document, window: globalThis.window };
  globalThis.document = { querySelector: (id) => {
    if (!elementos.has(id)) elementos.set(id, { addEventListener() {}, setAttribute() {} });
    return elementos.get(id);
  }, createElement() { throw new Error("Não pode criar avatar local durante conexão."); } };
  globalThis.window = { addEventListener() {}, removeEventListener() {} };
  let avatar;
  try {
    avatar = montarVLibras({ remoto: { ativa: () => true, mostrarSinal(...args) { pedidos.push(args); return true; }, pararAvatar() {} } });
    assert.equal(avatar.mostrarSinal("OLÁ", "Olá"), true);
    assert.equal(avatar.mostrarSinal("0_QUILÔMETRO", "0 quilômetro"), true);
    assert.equal(avatar.mostrarSinal("BOM_DIA/OUTRO", "ruim"), false);
    assert.deepEqual(pedidos, [["OLÁ", "Olá"], ["0_QUILÔMETRO", "0 quilômetro"]]);
    for (const glosa of ["OI", "E\u0301", "SINAL(+)", "SINAL[-]", "SINAL{1}", "SINAL&NOME", "$50", "100%"]) assert.equal(glosaValida(glosa), true, glosa);
  } finally { avatar?.destruir(); Object.assign(globalThis, anterior); }
});
