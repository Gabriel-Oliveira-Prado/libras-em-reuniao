import test from "node:test";
import assert from "node:assert/strict";
import { consultarAuxiliar, MODELO_AUXILIAR } from "../painel/auxiliar-local.mjs";

test("Qwen recebe apenas texto solicitado no loopback, mantém original e pede revisão restrita", async () => {
  const original = "Gabriel, eu não quero essa merda. 42 vezes.";
  const r = await consultarAuxiliar({ texto: original, fetchImpl: async (url, opcoes) => {
    assert.equal(url, "http://127.0.0.1:11434/api/chat");
    const p = JSON.parse(opcoes.body);
    assert.equal(p.model, MODELO_AUXILIAR); assert.equal(p.think, false);
    assert.equal(JSON.parse(p.messages[1].content).transcricao, original);
    assert.match(p.messages[0].content, /nomes, números, negações, palavrões, repetições/);
    assert.equal(opcoes.redirect, "error");
    return { ok: true, json: async () => ({ done: true, message: { content: JSON.stringify({ texto: original }) } }) };
  } });
  assert.equal(r.original, original); assert.equal(r.texto, original);
});
test("falha, saída inválida e cancelamento não geram texto substituto", async () => {
  await assert.rejects(consultarAuxiliar({ texto: "Oi", fetchImpl: async () => ({ ok: false, status: 404 }) }), /não está instalado/);
  await assert.rejects(consultarAuxiliar({ texto: "Oi", fetchImpl: async () => ({ ok: true, json: async () => ({ done: true, message: { content: "inventei um texto" } }) }) }), /inválida/);
  await assert.rejects(consultarAuxiliar({ texto: "Eu não quero essa merda", fetchImpl: async () => ({ ok: true, json: async () => ({ done: true, message: { content: JSON.stringify({ texto: "Eu quero essa coisa" }) } }) }) }), /alterava palavras/);
  const c = new AbortController(); c.abort();
  await assert.rejects(consultarAuxiliar({ texto: "Oi", signal: c.signal, fetchImpl: async (_u, o) => { o.signal.throwIfAborted(); } }), /abort/i);
  await assert.rejects(consultarAuxiliar({ texto: "x".repeat(501) }), /500/);
});
