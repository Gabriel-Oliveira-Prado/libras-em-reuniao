import test from "node:test";
import assert from "node:assert/strict";
import { montarDicionario } from "../painel/sinais-pessoais.js";
import { gesto } from "./apoio-gestos.mjs";
const tick = () => new Promise((resolve) => setImmediate(resolve));
const idsCadastro = ["estado-pessoais", "lista-pessoais", "cadastro-pessoal", "nome-pessoal", "tipo-pessoal", "gravar-pessoal", "cancelar-pessoal", "novo-pessoal", "progresso-pessoal", "quantidade-pessoais", "exportar-pessoais", "importar-pessoais", "arquivo-pessoais", "regravar-pessoal", "guia-cadastro-camera", "continuar-cadastro-camera", "cancelar-cadastro-camera", "area-legenda", "etapa-cadastro-camera", "contagem-cadastro", "instrucao-cadastro-camera", "tempo-cadastro", "dados-pessoal", "resumo-pessoal", "etapas-pessoal", "ajuda-gravacao", "passo-nome", "passo-gravacoes", "passo-confirmacao", "etapa-pessoal", "camera"];
const criarElemento = () => ({ value: "", hidden: false, disabled: false, textContent: "", eventos: {}, filhos: [], dataset: {}, atributos: {},
  setAttribute(n, v) { this.atributos[n] = v; }, removeAttribute(n) { delete this.atributos[n]; },
  addEventListener(n, fn) { this.eventos[n] = fn; }, append(...filhos) { this.filhos.push(...filhos); },
  replaceChildren(...filhos) { this.filhos = filhos; }, focus() {}, click() { if (!this.disabled) this.eventos.click?.(); }, remove() {} });

test("cadastro requer câmera, três exemplos e confirmação, persiste, testa o nome e cancela sem gravar", async () => {
  const elementos = Object.fromEntries(idsCadastro.map((id) => [id, criarElemento()])), salvos = new Map(), falas = [];
  const armazenamento = { listar: async () => structuredClone([...salvos.values()]), salvar: async (r) => salvos.set(r.id, structuredClone(r)), excluir: async (id) => salvos.delete(id), importar: async (rs) => rs.forEach((r) => salvos.set(r.id, r)) };
  const anteriores = { document: globalThis.document, BroadcastChannel: globalThis.BroadcastChannel };
  globalThis.document = { querySelector: (s) => elementos[s.slice(1)], createElement: criarElemento, body: criarElemento() };
  globalThis.BroadcastChannel = class { postMessage() {} close() {} };
  let tempo = 0, dicionario;
  const gravar = async () => {
    dicionario.receber(Array(228).fill(0), tempo);
    await elementos["gravar-pessoal"].eventos.click();
    assert.equal(elementos["contagem-cadastro"].textContent, "3");
    assert.equal(elementos["guia-cadastro-camera"].dataset.fase, "preparando");
    tempo += 3100;
    for (const v of [...gesto(), ...Array.from({ length: 6 }, () => Array(228).fill(0))]) dicionario.receber(v, tempo += 70);
    await tick();
  };
  try {
    dicionario = montarDicionario({ armazenamento, agora: () => tempo, aoTeste: (nome) => falas.push(nome) });
    await dicionario.pronto;
    elementos["novo-pessoal"].eventos.click();
    elementos["nome-pessoal"].value = "Gabriel";
    await elementos["gravar-pessoal"].eventos.click();
    assert.match(elementos["estado-pessoais"].textContent, /Ligue a câmera/);
    for (let i = 0; i < 3; i++) await gravar();
    assert.equal(salvos.size, 0, "não ativa antes da quarta tentativa");
    assert.match(elementos["gravar-pessoal"].textContent, /Confirmar/);
    assert.match(elementos["gravar-pessoal"].textContent, /mesmo sinal/);
    assert.equal(elementos["passo-confirmacao"].atributos["aria-current"], "step");
    await gravar();
    assert.equal(salvos.size, 1);
    assert.equal(elementos["cadastro-pessoal"].hidden, true);
    assert.equal(elementos["guia-cadastro-camera"].hidden, true);
    assert.equal(dicionario.reconhecer(gesto()).registro.nome, "Gabriel");
    assert.equal(falas.length, 0, "cadastro não fala automaticamente durante as gravações");
    const item = elementos["lista-pessoais"].filhos[0];
    item.filhos[0].filhos[1].filhos[0].click();
    await gravar();
    assert.deepEqual(falas, ["Gabriel"]);
    elementos["cancelar-pessoal"].eventos.click();
    elementos["novo-pessoal"].eventos.click();
    elementos["nome-pessoal"].value = "Ana";
    await elementos["gravar-pessoal"].eventos.click();
    dicionario.cancelar();
    tempo += 3000;
    for (const v of gesto(2)) dicionario.receber(v, tempo += 70);
    assert.equal(salvos.size, 1);
    elementos["cancelar-pessoal"].eventos.click();
    elementos["lista-pessoais"].filhos[0].filhos[0].filhos[1].filhos[1].click();
    elementos["nome-pessoal"].value = "Gabi";
    await elementos["gravar-pessoal"].eventos.click();
    assert.equal([...salvos.values()][0].nome, "Gabi");
    assert.equal(dicionario.reconhecer(gesto()).registro.nome, "Gabi");
    elementos["lista-pessoais"].filhos[0].filhos[0].filhos[1].filhos[2].click();
    await tick();
    assert.equal(dicionario.temSinais(), false);
    dicionario.destruir();
    dicionario = montarDicionario({ armazenamento, agora: () => tempo });
    await dicionario.pronto;
    assert.equal(dicionario.temSinais(), false, "reabrir mantém o cadastro pausado");
    assert.match(elementos["lista-pessoais"].filhos[0].filhos[0].filhos[0].textContent, /Gabi.*pausado/);
  } finally { dicionario?.destruir(); Object.assign(globalThis, anteriores); }
});

test("contagem mostra 3, 2, 1 sem depender de novos quadros; cancelar e repetir não deixam relógios antigos", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const elementos = Object.fromEntries(idsCadastro.map((id) => [id, criarElemento()]));
  const anteriores = { document: globalThis.document, BroadcastChannel: globalThis.BroadcastChannel };
  globalThis.document = { querySelector: (s) => elementos[s.slice(1)], createElement: criarElemento };
  globalThis.BroadcastChannel = class { postMessage() {} close() {} };
  let tempo = 0, dicionario;
  const avancar = (ms) => { tempo += ms; t.mock.timers.tick(ms); };
  try {
    dicionario = montarDicionario({ armazenamento: { listar: async () => [] }, agora: () => tempo });
    await dicionario.pronto;
    elementos["novo-pessoal"].click(); elementos["nome-pessoal"].value = "Bia";
    dicionario.receber(Array(228).fill(0), tempo);
    await elementos["gravar-pessoal"].eventos.click();
    assert.equal(elementos["contagem-cadastro"].textContent, "3");
    avancar(1000); assert.equal(elementos["contagem-cadastro"].textContent, "2");
    avancar(1000); assert.equal(elementos["contagem-cadastro"].textContent, "1");
    avancar(1000);
    assert.equal(elementos["contagem-cadastro"].hidden, true);
    assert.equal(elementos["guia-cadastro-camera"].dataset.fase, "gravando");
    assert.match(elementos["instrucao-cadastro-camera"].textContent, /Sinalize agora/);
    avancar(12000);
    assert.equal(elementos["guia-cadastro-camera"].dataset.fase, "erro");
    assert.equal(elementos["continuar-cadastro-camera"].hidden, false);
    assert.equal(elementos["gravar-pessoal"].disabled, false);
    dicionario.receber(Array(228).fill(0), tempo);
    elementos["continuar-cadastro-camera"].click();
    assert.equal(elementos["contagem-cadastro"].textContent, "3");
    elementos["cancelar-cadastro-camera"].click();
    avancar(20000);
    assert.equal(elementos["guia-cadastro-camera"].hidden, true);
    assert.match(elementos["estado-pessoais"].textContent, /Cadastro encerrado/);
    assert.equal(dicionario.receber(Array(228).fill(0), tempo), false);
  } finally { dicionario?.destruir(); Object.assign(globalThis, anteriores); }
});
