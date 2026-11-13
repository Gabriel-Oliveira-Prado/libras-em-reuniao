import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { SegmentadorDeFala, reamostrar } from "../painel/segmentacao-audio.mjs";

const bloco = (valor) => new Float32Array(320).fill(valor);

test("duas falas são emitidas nas pausas sem encerrar a escuta", () => {
  const filtro = new SegmentadorDeFala(16000);
  const trechos = [];
  for (const quantidade of [30, 40]) {
    for (let i = 0; i < quantidade; i++) {
      const trecho = filtro.receber(bloco(0.1));
      if (trecho) trechos.push(trecho);
    }
    for (let i = 0; i < 30; i++) {
      const trecho = filtro.receber(bloco(0));
      if (trecho) trechos.push(trecho);
    }
  }
  assert.equal(trechos.length, 2);
  assert.ok(trechos.every((audio) => audio.length < 16000 * 2));
  assert.equal(filtro.concluir(), null);
});

test("silêncio e um estalo curto não geram transcrição; fala longa é segmentada", () => {
  const filtro = new SegmentadorDeFala(16000);
  for (let i = 0; i < 100; i++) assert.equal(filtro.receber(bloco(0)), null);
  assert.equal(filtro.receber(bloco(0.5)), null);
  for (let i = 0; i < 40; i++) assert.equal(filtro.receber(bloco(0)), null);
  const trechos = [];
  for (let i = 0; i < 550; i++) {
    const audio = filtro.receber(bloco(0.1));
    if (audio) trechos.push(audio);
  }
  assert.equal(trechos.length, 2);
  assert.ok(trechos.every((audio) => audio.length <= 16000 * 5 + 320));
  assert.ok(filtro.concluir().length > 0);
});

test("reamostragem preserva duração e amplitude em 48 kHz e 44,1 kHz", () => {
  for (const taxa of [48000, 44100]) {
    const audio = reamostrar(new Float32Array(taxa).fill(0.25), taxa);
    assert.equal(audio.length, 16000);
    assert.ok(audio.every((valor) => Math.abs(valor - 0.25) < 1e-6));
  }
});

test("worklet envia PCM sem duplicar amostras e descarrega o último bloco ao parar", () => {
  let Classe;
  const enviados = [];
  const ambiente = {
    AudioWorkletProcessor: class { constructor() { this.port = { postMessage: (data) => enviados.push(data) }; } },
    sampleRate: 16000,
    registerProcessor: (_nome, classe) => { Classe = classe; },
    Float32Array,
  };
  vm.runInNewContext(readFileSync(new URL("../painel/captura-audio.js", import.meta.url), "utf8"), ambiente);
  const captura = new Classe();
  for (const tamanho of [128, 256, 128]) captura.process([[new Float32Array(tamanho).fill(0.2)]]);
  captura.port.onmessage({ data: "parar" });
  const partes = enviados.filter((item) => item.tipo === "audio");
  assert.equal(partes.reduce((n, parte) => n + parte.amostras.length, 0), 512);
  assert.equal(enviados.at(-1).tipo, "fim");
  assert.equal(captura.process([[]]), false);
});
