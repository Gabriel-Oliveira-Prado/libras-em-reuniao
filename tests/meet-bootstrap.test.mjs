import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const fonte = fs.readFileSync(new URL("../meet/bootstrap-avatar.js", import.meta.url), "utf8");
const html = fs.readFileSync(new URL("../meet/avatar.html", import.meta.url), "utf8");
const ORIGEM = "chrome-extension://jcfphakcklekbchlfdopcaanopkmppbd";
function alvo() {
  const eventos = new Map();
  return {
    textContent: "", hidden: true, disabled: false,
    set innerHTML(_) { throw new Error("A interface deve usar somente textContent."); },
    addEventListener(tipo, fn) {
      if (!eventos.has(tipo)) eventos.set(tipo, new Set());
      eventos.get(tipo).add(fn);
    },
    removeEventListener(tipo, fn) { eventos.get(tipo)?.delete(fn); },
    emitir(tipo, evento = {}) { for (const fn of [...(eventos.get(tipo) || [])]) fn(evento); },
    ouvintes: () => [...eventos.values()].reduce((n, s) => n + s.size, 0)
  };
}
function iniciar() {
  let agora = 0, sequencia = 0, recargas = 0;
  const tarefas = new Map();
  const window = alvo();
  window.location = { origin: ORIGEM, host: ORIGEM.split("://")[1], reload: () => { recargas++; } };
  const elementos = Object.fromEntries(
    ["estado-vlibras", "reconectar-avatar", "pausar-avatar", "tentar-avatar", "modulo-avatar"]
      .map(id => [id, alvo()])
  );
  elementos["estado-vlibras"].textContent = "Conectando ao Meet…";
  const context = vm.createContext({
    window, URL,
    document: { querySelector: seletor => elementos[seletor.slice(1)] },
    setTimeout(fn, ms) { const id = ++sequencia; tarefas.set(id, { fn, prazo: agora + ms }); return id; },
    clearTimeout(id) { tarefas.delete(id); }
  });
  vm.runInContext(fonte, context);
  return {
    window, elementos, tarefas, recargas: () => recargas,
    avancar(ms) {
      agora += ms;
      for (const [id, t] of [...tarefas]) if (t.prazo <= agora) { tarefas.delete(id); t.fn(); }
    }
  };
}

test("bootstrap clássico vem antes do módulo para cobrir falha de importação", () => {
  assert.ok(html.indexOf('src="bootstrap-avatar.js"') < html.indexOf('id="modulo-avatar"'));
  assert.match(html, /id="reconectar-avatar"[^>]*hidden/);
});

test("bootstrap termina Conectando após oito segundos e permite recarregar só o iframe", () => {
  const a = iniciar();
  a.avancar(7999);
  assert.equal(a.elementos["reconectar-avatar"].hidden, true);
  assert.match(a.elementos["estado-vlibras"].textContent, /Conectando/);
  a.avancar(1);
  assert.match(a.elementos["estado-vlibras"].textContent, /Não foi possível conectar/);
  assert.equal(a.elementos["reconectar-avatar"].hidden, false);
  assert.equal(a.elementos["pausar-avatar"].disabled, true);
  assert.equal(a.tarefas.size, 0);
  assert.equal(a.recargas(), 0);
  a.elementos["reconectar-avatar"].emitir("click");
  assert.equal(a.recargas(), 1);
});

test("bootstrap confirmação cancela somente o prazo da conexão, sem confundir carregamento Unity", () => {
  const a = iniciar();
  a.window.__librasMeetAvatar.confirmar();
  a.elementos["estado-vlibras"].textContent = "Carregando o intérprete…";
  a.avancar(90000);
  assert.equal(a.elementos["estado-vlibras"].textContent, "Carregando o intérprete…");
  assert.equal(a.elementos["reconectar-avatar"].hidden, true);
  a.window.emitir("error", { target: a.elementos["modulo-avatar"] });
  assert.equal(a.elementos["estado-vlibras"].textContent, "Carregando o intérprete…");
});

test("bootstrap mostra falha estática do módulo e erros de inicialização da própria extensão", () => {
  const a = iniciar();
  a.window.emitir("error", { target: a.elementos["modulo-avatar"] });
  assert.match(a.elementos["estado-vlibras"].textContent, /não conseguiu iniciar/);
  assert.equal(a.elementos["reconectar-avatar"].hidden, false);
  assert.equal(a.tarefas.size, 0);
  const b = iniciar();
  b.window.emitir("error", { target: b.window, filename: ORIGEM + "/painel/vlibras.js" });
  assert.match(b.elementos["estado-vlibras"].textContent, /não conseguiu iniciar/);
});

test("bootstrap ignora erros de outros frames e oferece ação após encerramento confirmado", () => {
  const a = iniciar();
  a.window.emitir("error", { target: {}, filename: "https://vlibras.gov.br/app/unity.js" });
  assert.match(a.elementos["estado-vlibras"].textContent, /Conectando/);
  a.window.__librasMeetAvatar.confirmar();
  a.window.__librasMeetAvatar.falhar("Conexão encerrada. Reconecte o intérprete.");
  assert.equal(a.elementos["estado-vlibras"].textContent, "Conexão encerrada. Reconecte o intérprete.");
  assert.equal(a.elementos["reconectar-avatar"].hidden, false);
});

test("bootstrap libera prazo e ouvintes no pagehide sem criar erro ao sair", () => {
  const a = iniciar();
  a.window.emitir("pagehide");
  assert.equal(a.tarefas.size, 0);
  assert.equal(a.window.ouvintes(), 0);
  assert.equal(a.elementos["reconectar-avatar"].ouvintes(), 0);
  a.avancar(8000);
  assert.equal(a.elementos["estado-vlibras"].textContent, "Conectando ao Meet…");
});
