import test from "node:test";
import assert from "node:assert/strict";
import { criarEscutaRapida } from "../painel/fala-rapida.mjs";

function ambiente() {
  let motor;
  class Reconhecimento {
    constructor() { motor = this; }
    start() { this.onstart(); }
    stop() { this.parou = true; }
    abort() { this.abortou = true; }
  }
  const falas = [], parciais = [], estados = [], fins = [];
  const escuta = criarEscutaRapida({ aoTexto: (t) => { falas.push(t); }, aoParcial: (t) => parciais.push(t), aoEstado: (t) => estados.push(t), aoFim: (t) => fins.push(t) }, Reconhecimento);
  const resultado = (texto, final) => Object.assign([{ transcript: texto }], { isFinal: final });
  return { escuta, falas, parciais, estados, fins, resultado, motor: () => motor };
}

test("modo rápido mostra parcial e só envia texto final uma vez ao avatar, sem filtro lexical", () => {
  const a = ambiente();
  try {
    a.escuta.iniciar();
    const motor = a.motor();
    assert.equal(motor.lang, "pt-BR");
    motor.onresult({ resultIndex: 0, results: [a.resultado("bom", false)] });
    assert.deepEqual(a.parciais, ["bom"]);
    assert.equal(a.falas.length, 0);
    motor.onresult({ resultIndex: 1, results: [a.resultado("bom", false), a.resultado("dia", false)] });
    assert.equal(a.parciais.at(-1), "bom dia", "preserva os parciais anteriores ao índice alterado");
    motor.onresult({ resultIndex: 0, results: [a.resultado("Bom dia", true)] });
    motor.onresult({ resultIndex: 0, results: [a.resultado("Bom dia", true), a.resultado("merda", true)] });
    assert.deepEqual(a.falas, ["Bom dia", "merda"]);
    a.escuta.parar();
    assert.equal(motor.parou, true);
    motor.onresult({ resultIndex: 2, results: [a.resultado("Bom dia", true), a.resultado("merda", true), a.resultado("Fim", true)] });
    motor.onend();
    assert.deepEqual(a.falas, ["Bom dia", "merda", "Fim"]);
    assert.equal(a.fins.length, 1);
  } finally { a.escuta.abortar(); }
});

test("modo rápido recebe a faixa do microfone escolhido também ao reiniciar", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const faixa = { kind: "audio", readyState: "live" }, faixas = [], motores = [];
  class Reconhecimento {
    constructor() { motores.push(this); }
    start(recebida) { faixas.push(recebida); }
    abort() {}
  }
  const escuta = criarEscutaRapida({ faixa, aoTexto() {}, aoParcial() {}, aoEstado() {}, aoFim() {} }, Reconhecimento);
  try {
    escuta.iniciar();
    motores[0].onend();
    t.mock.timers.tick(200);
    assert.deepEqual(faixas, [faixa, faixa]);
  } finally { escuta.abortar(); }
});

test("cancelamento descarta resultados tardios e erro de rede oferece modo local", () => {
  const a = ambiente();
  a.escuta.iniciar();
  a.escuta.abortar();
  a.motor().onresult({ resultIndex: 0, results: [a.resultado("Não enviar", true)] });
  a.motor().onend();
  assert.equal(a.falas.length, 0);
  assert.equal(a.fins.length, 0);
  const b = ambiente();
  b.escuta.iniciar();
  b.motor().onerror({ error: "network" });
  assert.equal(b.motor().abortou, true);
  assert.match(b.fins[0], /Local/);
  assert.throws(() => criarEscutaRapida({}, null), /selecione Local/i);
});
