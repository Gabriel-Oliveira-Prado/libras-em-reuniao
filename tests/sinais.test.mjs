import test from "node:test";
import assert from "node:assert/strict";
import { montarSinais } from "../painel/sinais.js";
import { extrairAtributos, reamostrarSinal } from "../painel/atributos-sinais.mjs";

test("atributos sem pessoa permanecem finitos e o tempo preserva extremos", () => {
  const vazio = extrairAtributos({});
  assert.equal(vazio.length, 228);
  assert.ok(vazio.every((v) => v === 0));
  const seq = reamostrarSinal([Float32Array.of(1, 2), Float32Array.of(3, 4)]);
  assert.equal(seq.length, 32);
  assert.deepEqual([...seq[0]], [1, 2]);
  assert.deepEqual([...seq.at(-1)], [3, 4]);
});

test("o mesmo corpo em capturas 16:9, 4:3 e retrato produz os mesmos atributos", () => {
  const referencia = Object.fromEntries([["poseLandmarks", 33], ["leftHandLandmarks", 21], ["rightHandLandmarks", 21], ["faceLandmarks", 478]].map(([nome, n]) => [nome,
    Array.from({ length: n }, (_, i) => ({ x: 0.2 + i % 13 * 0.03, y: 0.3 + i % 7 * 0.02, z: i % 3 * 0.01, visibility: 0.9 })),
  ]));
  const esperado = extrairAtributos(referencia);
  for (const proporcao of [4 / 3, 3 / 4, 16 / 9]) {
    const captura = Object.fromEntries(Object.entries(referencia).map(([nome, pontos]) => [nome, pontos.map((p) => ({ ...p, y: 0.5 + (p.y - 0.5) * proporcao / (16 / 9) }))]));
    const obtido = extrairAtributos(captura, proporcao);
    assert.ok(obtido.every((v, i) => Math.abs(v - esperado[i]) < 1e-5));
  }
});

test("modelo não aprovado não inventa legenda nem fala; candidato aprovado preserva palavrão", async () => {
  const originais = { document: globalThis.document, fetch: globalThis.fetch };
  const elementos = Object.fromEntries(["estado-modelo", "sinal-atual", "legenda-camera"].map((id) => [`#${id}`, { textContent: "", hidden: true }]));
  globalThis.document = { querySelector: (id) => elementos[id] };
  let habilitado = false;
  const modelo = {
    schema: 1, entradas: 228, passos: 32, canais: 1, dilatacoes: [],
    classes: ["Sem sinal", "merda"], confianca: 0.85, margem: 0.3,
    estado: { "entrada.weight": [Array.from({ length: 228 }, () => [0])], "entrada.bias": [0],
      "saida.weight": [[0], [0]], "saida.bias": [0, 10] },
  };
  globalThis.fetch = async (url) => ({ ok: true, json: async () => String(url).endsWith("estado.json") ? { habilitado, mensagem: "Em validação" } : modelo });
  const neutro = {
    poseLandmarks: Array.from({ length: 33 }, (_, i) => ({ x: i === 11 ? 0.3 : 0.6, y: 0.5, z: 0, visibility: 1 })),
    faceLandmarks: Array.from({ length: 478 }, () => ({ x: 0.5, y: 0.2, z: 0 })),
  };
  const resultado = { ...neutro, leftHandLandmarks: Array.from({ length: 21 }, (_, i) => ({ x: 0.4 + i * 0.003, y: 0.4, z: 0 })) };
  try {
    const falas = [];
    const desligado = montarSinais({ falarSinal: (v) => falas.push(v) });
    await desligado.pronto;
    desligado.receber(resultado, 0);
    assert.equal(desligado.temModelo(), false);
    assert.equal(falas.length, 0);
    assert.match(elementos["#legenda-camera"].textContent, /validação/);
    habilitado = true;
    const sinais = montarSinais({ falarSinal: (v) => falas.push(v) });
    await sinais.pronto;
    assert.equal(sinais.temModelo(), true);
    for (let t = 0; t < 1000; t += 70) sinais.receber(resultado, t);
    for (let t = 1050; t < 1600; t += 70) sinais.receber(neutro, t);
    assert.deepEqual(falas, ["merda"]);
    assert.equal(elementos["#legenda-camera"].textContent, "merda");
    sinais.parar();
    for (let t = 2000; t < 2500; t += 70) sinais.receber({}, t);
    assert.equal(falas.length, 1);
  } finally { Object.assign(globalThis, originais); }
});
