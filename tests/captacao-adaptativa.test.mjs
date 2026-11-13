import test from "node:test";
import assert from "node:assert/strict";
import { SegmentadorDeSinais } from "../painel/segmentacao-sinais.mjs";
import { prepararExemplo } from "../painel/dicionario-pessoal.mjs";
import { SegmentadorDeFala } from "../painel/segmentacao-audio.mjs";

const quadro = (t, { baixo = false, direita = false, duas = false } = {}) => {
  const v = Array(228).fill(0);
  for (const b of duas ? [36, 102] : [direita ? 102 : 36]) {
    v[b] = 1; v[b + 1] = t; v[b + 2] = baixo ? 2 : -0.2;
    for (let j = b + 3; j < b + 66; j++) v[j] = Math.sin(j) * 0.2;
  }
  return v;
};
test("segmenta sinal rápido, lento e baixo, com mão esquerda, direita ou ambas", () => {
  for (const opcoes of [{}, { baixo: true }, { baixo: true, direita: true }, { duas: true }]) {
    for (const n of [6, 24, 110]) {
      const s = new SegmentadorDeSinais(), seqs = [];
      for (let i = 0; i < n + 20; i++) {
        const v = i < n ? quadro(i / (n - 1), opcoes) : Array(228).fill(0);
        const seq = s.receber(v, i * 50); if (seq) seqs.push(seq);
      }
      assert.equal(seqs.length, 1, JSON.stringify({ n, opcoes }));
      assert.equal(prepararExemplo(seqs[0]).length, 32);
    }
  }
});
test("perda de mão por 100 ms não divide um sinal e manter pose não repete fala", () => {
  const s = new SegmentadorDeSinais(), seqs = [];
  for (let i = 0; i < 90; i++) {
    const v = i === 8 || i === 9 ? Array(228).fill(0) : quadro(Math.min(i, 20) / 20);
    const seq = s.receber(v, i * 50); if (seq) seqs.push(seq);
  }
  assert.equal(seqs.length, 1);
});
test("oclusão da mão ativa por 600 ms com outra mão baixa não divide o sinal", () => {
  const s = new SegmentadorDeSinais(), seqs = [];
  for (let i = 0; i < 85; i++) {
    const v = i < 60 ? quadro(Math.sin(i / 10), { direita: true }) : Array(228).fill(0);
    if (i < 60) { v[36] = 1; v[38] = 2.9; }
    if (i >= 20 && i <= 32) v.fill(0, 102, 168);
    const r = s.receber(v, i * 50); if (r) seqs.push(r);
  }
  assert.equal(seqs.length, 1);
});
test("movimento além de dez segundos é recusado sem falar um trecho incompleto", () => {
  const s = new SegmentadorDeSinais();
  for (let i = 0; i < 260; i++) assert.equal(s.receber(quadro(Math.sin(i / 3)), i * 50), null);
  assert.equal(s.situacao, "longo");
  for (let i = 260; i < 272; i++) assert.equal(s.receber(Array(228).fill(0), i * 50), null);
  let novo;
  for (let i = 272; i < 310; i++) { const r = s.receber(i < 295 ? quadro((i - 272) / 23) : Array(228).fill(0), i * 50); if (r) novo = r; }
  assert.ok(novo, "volta a aceitar um sinal novo após repouso");
});
test("perfil de áudio preserva fala além de 3,5 s e corta na pausa natural", () => {
  const s = new SegmentadorDeFala(16000, { pausaMs: 480, maximoMs: 12000, alvoMs: 6000, pausaCurtaMs: 160 });
  const bloco = new Float32Array(320).fill(0.1);
  for (let i = 0; i < 300; i++) assert.equal(s.receber(bloco, true), null);
  let resultado;
  for (let i = 0; i < 10; i++) resultado ??= s.receber(new Float32Array(320), false);
  assert.ok(resultado.length >= 16000 * 6);
});
