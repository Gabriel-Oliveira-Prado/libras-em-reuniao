import test from "node:test";
import assert from "node:assert/strict";
import { FluxoSequencialDeSinais, lerSinalConhecido } from "../painel/encadeamento-sinais.mjs";

function quadro(classe, x, bases = [36]) {
  const v = Array(228).fill(0);
  v[0] = classe;
  for (const b of bases) { v[b] = 1; v[b + 1] = x; v[b + 2] = -0.2; }
  return v;
}
function bancada(ler) {
  const consultas = [], eventos = [];
  const fluxo = new FluxoSequencialDeSinais((seq) => {
    consultas.push(seq);
    if (ler) return ler(seq);
    const ids = new Set(seq.map((v) => v[0]));
    const xs = seq.map((v) => v[v[36] ? 37 : 103]);
    if (ids.size !== 1 || Math.max(...xs) - Math.min(...xs) < 0.25) return null;
    const id = seq[0][0];
    return id === 1 ? { chave: "oi", palavra: "Oi" } :
      id === 2 ? { chave: "gabriel", palavra: "Gabriel" } : null;
  });
  let tempo = 0;
  function enviar(v) {
    const r = fluxo.receber(v, tempo);
    tempo += 50;
    if (r) eventos.push(r);
    return r;
  }
  function manter(v, ms) { for (let i = 0; i < ms / 50; i++) enviar(v); }
  function mover(id, bases = [36]) {
    for (let i = 0; i < 6; i++) enviar(quadro(id, i / 5, bases));
    return quadro(id, 1, bases);
  }
  return { fluxo, consultas, eventos, enviar, manter, mover,
    palavras: () => eventos.filter((e) => e.tipo === "conhecido").map((e) => e.leitura.palavra) };
}

test("Oi, Gabriel e Gabriel são separados com pausa de 500 ms e mãos sempre visíveis", () => {
  const b = bancada();
  for (const id of [1, 2, 2]) b.manter(b.mover(id), 500);
  assert.deepEqual(b.palavras(), ["Oi", "Gabriel", "Gabriel"]);
  assert.equal(b.eventos.length, 3);
  for (const evento of b.eventos) {
    assert.equal(evento.sequencia.length, 6, "a espera não altera o peso da pose final");
    assert.equal(evento.sequencia[0][37], 0, "preserva o começo do próximo movimento");
    assert.equal(evento.sequencia.at(-1)[37], 1);
    assert.ok(evento.sequencia.every((v) => v[36] === 1));
  }
});

test("uma pose reconhecida mantida por 3,2 s não é falada novamente", () => {
  const b = bancada();
  b.manter(b.mover(2), 3200);
  assert.deepEqual(b.palavras(), ["Gabriel"]);
  assert.equal(b.eventos.length, 1);
});

test("a consulta em pausa exige duas confirmações mesmo sem aumentar o recorte", () => {
  const b = bancada();
  const final = b.mover(1);
  b.manter(final, 250);
  assert.equal(b.consultas.length, 1);
  assert.equal(b.eventos.length, 0);
  b.manter(final, 100);
  assert.equal(b.consultas.length, 2);
  assert.equal(b.eventos.length, 1);
  assert.equal(b.consultas[0].length, b.consultas[1].length);
});

test("incerteza e ambiguidade mantêm o sinal inteiro para a conclusão normal", () => {
  for (const leitura of [null, { ambiguo: true }]) {
    const b = bancada(() => leitura);
    const final = b.mover(3);
    b.manter(final, 500);
    assert.equal(b.eventos.length, 0);
    b.manter(final, 1000);
    assert.equal(b.eventos.length, 1);
    assert.equal(b.eventos[0].tipo, "sequencia");
    assert.ok(b.eventos[0].sequencia.length > 20);
    assert.equal(b.eventos[0].sequencia[0][37], 0);
  }
});

test("leituras que alternam de palavra não encerram o trecho antecipadamente", () => {
  let n = 0;
  const b = bancada(() => ({ chave: ++n % 2 ? "oi" : "gabriel", palavra: "instável" }));
  b.manter(b.mover(1), 1500);
  assert.equal(b.palavras().length, 0);
  assert.equal(b.eventos.length, 1);
  assert.equal(b.eventos[0].tipo, "sequencia");
});

test("trocar a mão ativa ou passar a duas mãos permite o próximo sinal", () => {
  for (const [primeira, proxima] of [[[36], [102]], [[102], [36]], [[36], [36, 102]]]) {
    const b = bancada();
    b.manter(b.mover(1, primeira), 500);
    b.manter(b.mover(2, proxima), 500);
    assert.deepEqual(b.palavras(), ["Oi", "Gabriel"]);
    assert.equal(b.eventos[1].sequencia[0][proxima[0] + 1], 0);
  }
});

test("aparecimento fugaz da outra mão e retorno à pose não iniciam nova fala", () => {
  const b = bancada();
  const final = b.mover(1);
  b.manter(final, 500);
  b.enviar(quadro(2, 0, [102]));
  b.manter(final, 3200);
  assert.deepEqual(b.palavras(), ["Oi"]);
  assert.equal(b.eventos.length, 1);
});

test("reiniciar a câmera apaga a confirmação parcial do sinal anterior", () => {
  const b = bancada();
  b.manter(b.mover(1), 250);
  assert.ok(b.fluxo.confirmacao);
  b.fluxo.reiniciar();
  assert.equal(b.fluxo.confirmacao, undefined);
  b.manter(Array(228).fill(0), 350);
  b.manter(b.mover(2), 500);
  assert.deepEqual(b.palavras(), ["Gabriel"]);
});

test("cadastros têm prioridade e sua ambiguidade não é substituída por Oi", () => {
  const reconhecerSaudacao = () => ({ palavra: "Oi" });
  const conhecido = lerSinalConhecido([], {
    pessoais: { reconhecer: () => ({ registro: { id: "pessoa-1", nome: "Gabriel" } }) },
    reconhecerSaudacao
  });
  assert.equal(conhecido.palavra, "Gabriel");
  assert.deepEqual(lerSinalConhecido([], {
    pessoais: { reconhecer: () => ({ ambiguo: true }) }, reconhecerSaudacao
  }), { ambiguo: true });
});
