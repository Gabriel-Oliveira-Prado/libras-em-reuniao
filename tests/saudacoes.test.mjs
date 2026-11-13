import test from "node:test";
import assert from "node:assert/strict";
import { reconhecerSaudacao } from "../painel/saudacoes.mjs";
import { recortarOi } from "../vozes/recorte-oi.mjs";

test("mãos ausentes e pose imóvel não produzem saudação", () => {
  const modelo = { habilitado: true, pesos: Array(42).fill(0), media: Array(42).fill(0), escala: Array(42).fill(1), bias: 10, limite: 0.7 };
  assert.equal(reconhecerSaudacao(Array.from({ length: 32 }, () => Array(228).fill(0)), modelo), null);
  const pose = Array(228).fill(0); pose[36] = 1;
  assert.equal(reconhecerSaudacao(Array.from({ length: 32 }, () => pose), modelo), null);
});

test("recorte de Oi termina na pausa e não inclui a palavra seguinte", () => {
  const audio = new Float32Array(24000);
  audio.fill(0.1, 2400, 9600); // primeira palavra entre 0,1 e 0,4 s
  audio.fill(0.2, 11520, 20000); // palavra seguinte a partir de 0,48 s
  const oi = recortarOi(audio);
  assert.ok(oi.length <= 11520);
  assert.ok(oi.some((v) => v === Math.fround(0.1)));
  assert.ok(!oi.some((v) => v === Math.fround(0.2)));
  assert.throws(() => recortarOi(new Float32Array(24000).fill(0.1)), /pausa segura/);
});
