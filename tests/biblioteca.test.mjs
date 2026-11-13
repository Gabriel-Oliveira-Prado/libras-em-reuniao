import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { URL_BIBLIOTECA_VLIBRAS, LIMITE_RESPOSTA, normalizarBusca, rotuloDaGlosa,
  validarGlosa, validarCatalogo, extrairGlosas, buscarSinais, lerRespostaCatalogo,
  baixarBiblioteca, montarBiblioteca } from "../painel/biblioteca.mjs";

const snapshot = JSON.parse(await readFile(new URL("../modelos/biblioteca-vlibras.json", import.meta.url), "utf8"));
const resposta = dados => new Response(JSON.stringify(dados), { headers: { "Content-Type": "application/json" } });
const assentar = async () => { for (let i = 0; i < 4; i++) await new Promise(resolve => setImmediate(resolve)); };

test("catálogo verificado contém 22.498 glosas brasileiras do VLibras com origem e hash", () => {
  assert.equal(snapshot.total, 22498);
  assert.equal(snapshot.origem, URL_BIBLIOTECA_VLIBRAS);
  assert.match(snapshot.sha256_resposta, /^[a-f0-9]{64}$/);
  const sinais = validarCatalogo(snapshot);
  assert.equal(sinais.length, 22498);
  assert.ok(sinais.includes("TUDO_BEM"));
  assert.ok(sinais.includes("OI"));
  assert.ok(sinais.some(g => g.length > 100));
});

test("busca ignora acentos e separadores, prioriza exato e pagina sem duplicar", () => {
  assert.equal(normalizarBusca("  TUDO_BÉM  "), "tudo bem");
  assert.equal(rotuloDaGlosa("ABA&INFORMÁTICA"), "Aba · informática");
  const sinais = validarCatalogo(snapshot);
  assert.equal(buscarSinais(sinais, "olá").itens[0].glosa, "OLÁ");
  assert.equal(buscarSinais(sinais, "reuniao").itens[0].glosa, "REUNIÃO");
  assert.equal(buscarSinais(sinais, "tudo bem").itens[0].glosa, "TUDO_BEM");
  const primeira = buscarSinais(sinais);
  const segunda = buscarSinais(sinais, "", { deslocamento: 24 });
  assert.equal(primeira.itens.length, 24);
  assert.equal(primeira.itens[0].glosa, "OI");
  assert.ok(primeira.haMais);
  assert.equal(new Set([...primeira.itens, ...segunda.itens].map(i => i.glosa)).size, 48);
  assert.equal(buscarSinais(sinais, "não-existe-4f53ce").total, 0);
});

test("glosa mantém a forma exata e rejeita HTML, caminhos, espaços e limites excessivos", () => {
  for (const glosa of ["OI", "AEROAGRI\u0301COLA", "R$", "%", "CHAVES_{}", "[PONTO]", "ALEGRE(+)", "ALTO(-)", "ABA&INFORMÁTICA"])
    assert.ok(validarGlosa(glosa), glosa);
  for (const glosa of ["", "../OI", "OI/../../", "<script>", "OI?x=y", "OI\n", "Tudo bem", "A".repeat(129)])
    assert.equal(validarGlosa(glosa), false, glosa);
  assert.deepEqual(validarCatalogo(["AEROAGRI\u0301COLA"]), ["AEROAGRI\u0301COLA"]);
});

function trieDe(glosas) {
  const root = { end: false, children: {} };
  for (const glosa of glosas) {
    let no = root;
    for (const c of glosa) no = no.children[c] ??= { end: false, children: {} };
    no.end = true;
  }
  return { root };
}

test("decodifica trie real, limita profundidade e rejeita ciclos e origem falsa", () => {
  assert.deepEqual(extrairGlosas(trieDe(["OI", "OLÁ"])).sort(), ["OI", "OLÁ"]);
  assert.deepEqual(extrairGlosas(trieDe(["A".repeat(105)])), ["A".repeat(105)]);
  assert.throws(() => extrairGlosas(trieDe(["A".repeat(129)])));
  const ciclo = trieDe(["A"]); ciclo.root.children.B = ciclo.root;
  assert.throws(() => extrairGlosas(ciclo));
  assert.throws(() => extrairGlosas({ root: { children: {}, end: "true" } }));
  assert.throws(() => validarCatalogo({ ...snapshot, origem: "https://example.com" }));
  assert.throws(() => validarCatalogo({ ...snapshot, versao: "errada" }));
  assert.throws(() => validarCatalogo({ ...snapshot, total: 1 }));
  assert.throws(() => validarCatalogo(Array(50001).fill("OI")));
});

test("download tem origem fixa, não envia credenciais e rejeita HTML e respostas grandes", async () => {
  let recebido;
  const controller = new AbortController();
  const dados = await baixarBiblioteca({ signal: controller.signal, fetchImpl: async (url, options) => {
    recebido = { url, options };
    return resposta(trieDe(["OI", "TUDO_BEM"]));
  } });
  assert.equal(recebido.url, URL_BIBLIOTECA_VLIBRAS);
  assert.equal(recebido.options.credentials, "omit");
  assert.equal(recebido.options.redirect, "follow");
  assert.equal(recebido.options.signal, controller.signal);
  assert.deepEqual(dados.sinais.sort(), ["OI", "TUDO_BEM"]);
  await assert.rejects(baixarBiblioteca({ fetchImpl: async () => {
    const r = resposta(["OI"]);
    Object.defineProperty(r, "url", { value: "https://example.com/library.json" });
    return r;
  } }));
  await assert.rejects(lerRespostaCatalogo(new Response("<html>", { headers: { "content-type": "text/html" } })));
  await assert.rejects(lerRespostaCatalogo(new Response("[]", { headers: { "content-type": "application/json", "content-length": String(LIMITE_RESPOSTA + 1) } })));
  await assert.rejects(lerRespostaCatalogo(new Response("x".repeat(LIMITE_RESPOSTA + 1))));
});

class Elemento {
  constructor() { this.listeners = new Map(); this.children = []; this.value = ""; this.textContent = ""; this.hidden = false; this.disabled = false; this.open = false; this.attributes = {}; }
  addEventListener(tipo, fn) { const funcoes = this.listeners.get(tipo) ?? new Set(); funcoes.add(fn); this.listeners.set(tipo, funcoes); }
  removeEventListener(tipo, fn) { this.listeners.get(tipo)?.delete(fn); }
  emitir(tipo) { for (const fn of this.listeners.get(tipo) ?? []) fn({ target: this }); }
  append(...itens) { this.children.push(...itens); }
  replaceChildren(...itens) { this.children = itens; }
  setAttribute(chave, valor) { this.attributes[chave] = valor; }
}

async function comTela(rodar, fetchImpl) {
  const anteriores = { document: globalThis.document, fetch: globalThis.fetch };
  const ids = ["biblioteca-libras", "buscar-sinal", "lista-biblioteca", "estado-biblioteca", "mais-biblioteca", "atualizar-biblioteca"];
  const elementos = Object.fromEntries(ids.map(id => [id, new Elemento()]));
  globalThis.document = { querySelector: id => elementos[id.slice(1)], createElement: () => new Elemento() };
  globalThis.fetch = fetchImpl;
  let api;
  try {
    api = montarBiblioteca({ aoMostrar: (...args) => elementos.mostrados.push(args) });
    elementos.mostrados = [];
    await rodar(elementos, api);
  } finally {
    api?.destruir();
    globalThis.document = anteriores.document;
    globalThis.fetch = anteriores.fetch;
  }
}

test("abre snapshot local sob demanda, pagina 24 itens e chama avatar com glosa exata, sem capturar microfone", async () => {
  const requisicoes = [];
  await comTela(async e => {
    assert.equal(requisicoes.length, 0);
    e["biblioteca-libras"].open = true; e["biblioteca-libras"].emitir("toggle");
    await assentar();
    assert.equal(requisicoes.length, 1);
    assert.match(requisicoes[0], /modelos\/biblioteca-vlibras.json$/);
    assert.equal(e["lista-biblioteca"].children.length, 24);
    assert.match(e["estado-biblioteca"].textContent, /22\.498 entradas.*câmera tem seu próprio vocabulário/);
    e["mais-biblioteca"].emitir("click");
    assert.equal(e["lista-biblioteca"].children.length, 48);
    e["buscar-sinal"].value = "tudo bem"; e["buscar-sinal"].emitir("input");
    const primeiro = e["lista-biblioteca"].children[0];
    assert.equal(primeiro.children[0].textContent, "Tudo bem");
    primeiro.children[1].emitir("click");
    await assentar();
    assert.deepEqual(e.mostrados, [["TUDO_BEM", "Tudo bem"]]);
  }, async url => { requisicoes.push(String(url)); return resposta(snapshot); });
});

test("atualização é explícita e erro mantém a biblioteca e a busca disponíveis", async () => {
  const requisicoes = [];
  await comTela(async e => {
    e["biblioteca-libras"].open = true; e["biblioteca-libras"].emitir("toggle"); await assentar();
    e["atualizar-biblioteca"].emitir("click"); await assentar();
    assert.equal(requisicoes.length, 2);
    assert.equal(requisicoes[1], URL_BIBLIOTECA_VLIBRAS);
    assert.match(e["estado-biblioteca"].textContent, /biblioteca anterior continua disponível/);
    e["buscar-sinal"].value = "oi"; e["buscar-sinal"].emitir("input");
    assert.equal(e["lista-biblioteca"].children[0].children[0].textContent, "Oi");
  }, async url => {
    requisicoes.push(String(url));
    if (requisicoes.length === 2) throw new Error("offline");
    return resposta(snapshot);
  });
});

test("requisição nova cancela a anterior e respostas antigas não alteram o catálogo", async () => {
  let resolverAntigo;
  let signalAntigo;
  let calls = 0;
  await comTela(async e => {
    e["biblioteca-libras"].open = true; e["biblioteca-libras"].emitir("toggle");
    e["atualizar-biblioteca"].emitir("click"); await assentar();
    assert.equal(signalAntigo.aborted, true);
    assert.equal(e["lista-biblioteca"].children.length, 1);
    resolverAntigo(resposta(["ANTIGO"])); await assentar();
    assert.equal(e["lista-biblioteca"].children[0].children[0].textContent, "Oi");
  }, async (url, options) => {
    if (++calls === 1) { signalAntigo = options.signal; return new Promise(resolve => { resolverAntigo = resolve; }); }
    return resposta(["OI"]);
  });
});

test("destruir aborta download e impede alteração posterior na tela", async () => {
  let resolver;
  let signal;
  await comTela(async (e, api) => {
    e["biblioteca-libras"].open = true; e["biblioteca-libras"].emitir("toggle");
    const status = e["estado-biblioteca"].textContent;
    api.destruir();
    assert.equal(signal.aborted, true);
    resolver(resposta(["OI"])); await assentar();
    assert.equal(e["estado-biblioteca"].textContent, status);
    assert.equal(e["lista-biblioteca"].children.length, 0);
    e["atualizar-biblioteca"].emitir("click");
    assert.equal(e["estado-biblioteca"].textContent, status);
  }, async (url, options) => { signal = options.signal; return new Promise(resolve => { resolver = resolve; }); });
});

test("atualização substitui catálogo somente após JSON válido", async () => {
  let chamadas = 0;
  await comTela(async e => {
    e["biblioteca-libras"].open = true; e["biblioteca-libras"].emitir("toggle"); await assentar();
    e["atualizar-biblioteca"].emitir("click"); await assentar();
    assert.equal(e["lista-biblioteca"].children.length, 1);
    assert.equal(e["lista-biblioteca"].children[0].children[0].textContent, "Conhecer");
    assert.match(e["estado-biblioteca"].textContent, /1 entradas/);
  }, async () => resposta(++chamadas === 1 ? ["OI", "TUDO_BEM"] : ["CONHECER"]));
});

test("download é abortado após vinte segundos e oferece nova tentativa", async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let signal;
  await comTela(async e => {
    e["biblioteca-libras"].open = true; e["biblioteca-libras"].emitir("toggle");
    t.mock.timers.tick(19_999);
    assert.equal(signal.aborted, false);
    t.mock.timers.tick(1);
    await assentar();
    assert.equal(signal.aborted, true);
    assert.match(e["estado-biblioteca"].textContent, /Não foi possível abrir/);
    assert.equal(e["atualizar-biblioteca"].disabled, false);
  }, async (url, options) => {
    signal = options.signal;
    return new Promise((resolve, reject) => signal.addEventListener("abort", () =>
      reject(new DOMException("Cancelado", "AbortError")), { once: true }));
  });
});
