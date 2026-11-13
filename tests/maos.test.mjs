import test from "node:test";
import assert from "node:assert/strict";
import { caixaDaMao, LIGACOES } from "../painel/maos.mjs";
import { EstabilizadorDeSinais } from "../painel/estabilidade-sinais.mjs";

test("caixa envolve a mão sem sair do quadro", () => {
  const caixa = caixaDaMao([{ x: 0.1, y: 0.2 }, { x: 0.8, y: 0.9 }], 640, 480);
  assert.ok(caixa.x >= 0 && caixa.y >= 0);
  assert.ok(caixa.x + caixa.largura <= 640);
  assert.ok(caixa.y + caixa.altura <= 480);
  assert.equal(LIGACOES.length, 21);
});

test("fala uma palavra estável uma vez e exige pausa antes de repetir", () => {
  const filtro = new EstabilizadorDeSinais();
  const acenar = [{ className: "Acenar", probability: 0.95 }, { className: "Sem sinal", probability: 0.05 }];
  assert.equal(filtro.receber(acenar, 0), null);
  assert.equal(filtro.receber(acenar, 180), null);
  assert.equal(filtro.receber(acenar, 360), "Acenar");
  assert.equal(filtro.receber(acenar, 540), null);
  filtro.semSinal(600);
  filtro.semSinal(960);
  assert.equal(filtro.receber(acenar, 1100), null);
  assert.equal(filtro.receber(acenar, 1280), null);
  assert.equal(filtro.receber(acenar, 1460), "Acenar");
});

test("não fala com classe neutra nem leitura ambígua", () => {
  const filtro = new EstabilizadorDeSinais();
  const neutra = [{ className: "Sem sinal", probability: 0.99 }, { className: "Acenar", probability: 0.01 }];
  const ambigua = [{ className: "Acenar", probability: 0.54 }, { className: "Olá", probability: 0.46 }];
  for (const instante of [0, 180, 360, 540]) {
    assert.equal(filtro.receber(neutra, instante), null);
    assert.equal(filtro.receber(ambigua, instante + 90), null);
  }
});
