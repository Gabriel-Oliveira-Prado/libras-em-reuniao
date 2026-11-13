import test from "node:test";
import assert from "node:assert/strict";
import { montarAuxiliarLocal } from "../painel/auxiliar-local.mjs";
test("sugestão Qwen exige ação manual e edição/ASR invalida resultado pendente", async () => {
  const antes = { document: globalThis.document, fetch: globalThis.fetch };
  const ids = ["texto-fala", "estado-auxiliar", "sugestao-auxiliar", "resultado-auxiliar", "revisar-auxiliar", "verificar-auxiliar", "aplicar-auxiliar", "limpar-fala"];
  const els = Object.fromEntries(ids.map((id) => [id, { value: "", textContent: "", hidden: true, disabled: false, eventos: {}, addEventListener(n, f) { this.eventos[n] = f; } }]));
  let concluir, sinal;
  globalThis.document = { querySelector: (id) => els[id.slice(1)] };
  globalThis.fetch = async (_url, opcoes) => { sinal = opcoes.signal; return new Promise((r) => { concluir = () => r({ ok: true, json: async () => ({ done: true, message: { content: JSON.stringify({ texto: "Olá!" }) } }) }); }); };
  let auxiliar;
  try {
    auxiliar = montarAuxiliarLocal(); els["texto-fala"].value = "ola";
    const consulta = els["revisar-auxiliar"].eventos.click(); concluir(); await consulta;
    assert.equal(els["texto-fala"].value, "ola", "consulta não substitui o original");
    assert.equal(els["resultado-auxiliar"].hidden, false);
    els["aplicar-auxiliar"].eventos.click(); assert.equal(els["texto-fala"].value, "Olá!");
    els["texto-fala"].value = "ola"; const pendente = els["revisar-auxiliar"].eventos.click();
    els["texto-fala"].value = "Gabriel, não"; auxiliar.invalidar();
    assert.equal(sinal.aborted, true); concluir(); await pendente;
    assert.equal(els["texto-fala"].value, "Gabriel, não"); assert.equal(els["resultado-auxiliar"].hidden, true);
    els["aplicar-auxiliar"].eventos.click(); assert.equal(els["texto-fala"].value, "Gabriel, não");
  } finally { auxiliar?.destruir(); Object.assign(globalThis, antes); }
});
