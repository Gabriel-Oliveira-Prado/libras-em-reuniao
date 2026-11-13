import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";

test("avatar só aparece em Voz para Libras e captura para ao trocar de modo", () => {
  const criar = () => ({ hidden: false, eventos: {}, addEventListener(n, f) { this.eventos[n] = f; } });
  const elementos = { interprete: { hidden: true }, "modo-camera": { hidden: false }, "modo-fala": { hidden: true }, "limpar-camera": criar(), "limpar-fala": criar() };
  const botoes = ["modo-camera", "modo-fala"].map((modo, i) => ({
    ...criar(), atributos: { "aria-controls": modo, "aria-pressed": String(i === 0) },
    getAttribute(n) { return this.atributos[n]; }, setAttribute(n, v) { this.atributos[n] = v; },
  }));
  let cameraParou = 0, micParou = 0, abriu = 0, avatarParou = 0;
  const pararFala = Object.assign(() => micParou++, { preparar() {} });
  const contexto = {
    document: { querySelector: (s) => elementos[s.slice(1)], querySelectorAll: () => botoes, getElementById: (id) => elementos[id] },
    window: { addEventListener() {} },
    montarCamera: () => () => cameraParou++, montarFala: () => pararFala,
    montarSinais: () => ({ receber() {}, parar() {}, temModelo() {} }),
    montarVoz: () => ({ falarSinal() {}, preparar() {}, parar() {} }),
    montarDicionario: () => ({ destruir() {} }),
    montarDispositivos: () => ({ destruir() {} }),
    montarVLibras: () => ({ abrir: () => abriu++, parar: () => avatarParou++, adicionar() {}, destruir() {} }),
  };
  const fonte = readFileSync(new URL("../painel/painel.js", import.meta.url), "utf8").replace(/^import .*;\r?\n/gm, "");
  vm.runInNewContext(fonte, contexto);
  botoes[1].eventos.click();
  assert.equal(elementos.interprete.hidden, false);
  assert.equal(elementos["modo-camera"].hidden, true);
  assert.equal(abriu, 1); assert.equal(cameraParou, 1);
  botoes[0].eventos.click();
  assert.equal(elementos.interprete.hidden, true);
  assert.equal(elementos["modo-fala"].hidden, true);
  assert.equal(micParou, 1); assert.equal(avatarParou, 1);
});
