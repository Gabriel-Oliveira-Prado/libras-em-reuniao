import test from "node:test";
import assert from "node:assert/strict";
import { criarRegistro, reconhecerPessoal, validarBackup, prepararExemplo } from "../painel/dicionario-pessoal.mjs";
import { gesto, cadastro } from "./apoio-gestos.mjs";

test("cadastro com confirmação reconhece a pessoa em outra velocidade, recusa outro gesto e respeita pausa", () => {
  const a = cadastro(), b = cadastro("Ana", 1.5);
  assert.equal(reconhecerPessoal(gesto(0, 0.003, 48), [a, b]).registro.nome, "Gabriel");
  assert.equal(reconhecerPessoal(gesto(1.5, -0.003, 16), [a, b]).registro.nome, "Ana");
  assert.equal(reconhecerPessoal(gesto(3), [a, b]).registro, null);
  assert.equal(reconhecerPessoal(gesto(), [{ ...a, ativo: false }]).registro, null);
  assert.equal(reconhecerPessoal(gesto(), [a, { ...a, id: "outro", nome: "Outra pessoa" }]).ambiguo, true);
});

test("recusa cadastro inconsistente, confirmação diferente, gesto duplicado e nome repetido", () => {
  const a = cadastro();
  assert.throws(() => criarRegistro({ nome: "Ana", exemplos: [gesto(), gesto(2), gesto(-2)], confirmacao: gesto() }), /diferentes/);
  assert.throws(() => criarRegistro({ nome: "Ana", exemplos: [gesto(), gesto(), gesto()], confirmacao: gesto(3) }), /confirmação/);
  assert.throws(() => criarRegistro({ ...cadastro("Ana"), id: "novo" }, [a]), /parecido/);
  assert.throws(() => criarRegistro({ ...cadastro(" GABRIEL ", 1.5), id: "novo" }, [a]), /nome já/);
  assert.throws(() => prepararExemplo(Array.from({ length: 12 }, () => Array(228).fill(0))), /quadros/);
});

test("backup preserva acentos e palavras, ignora cadastros existentes e revalida parâmetros e dados", () => {
  const a = cadastro("João"), b = cadastro("merda", 1.5);
  const backup = JSON.parse(JSON.stringify({ schema: 1, sinais: [a, b] }));
  const novos = validarBackup(backup, [a]);
  assert.equal(novos.length, 1); assert.equal(novos[0].nome, "merda");
  backup.sinais[1].limite = 999;
  assert.ok(validarBackup(backup, [a])[0].limite <= 0.22);
  backup.sinais[1].exemplos[0][0][0] = "inválido";
  assert.throws(() => validarBackup(backup, [a]), /inválida/);
  assert.throws(() => validarBackup({ schema: 100, sinais: [] }), /inválido/);
  assert.throws(() => validarBackup({ schema: 1, sinais: [null] }), /inválido/);
  assert.throws(() => prepararExemplo(Array(10).fill(null)), /inválida/);
  assert.throws(() => criarRegistro({ ...a, ativo: "false" }), /ativação/);
});
