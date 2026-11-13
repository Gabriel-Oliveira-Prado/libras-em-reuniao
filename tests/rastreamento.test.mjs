import test from "node:test";
import assert from "node:assert/strict";
import { criarCarregadorDeRastreamento, criarModeloComAceleracao } from "../painel/rastreamento.mjs";

test("usa aceleração gráfica quando disponível e retorna ao processador se a criação falhar", async () => {
  const tentativas = [];
  let fechou = false;
  const modelo = await criarModeloComAceleracao(async (delegate) => {
    tentativas.push(delegate);
    if (delegate === "GPU") throw new Error("WebGL não disponível");
    return { detectForVideo: (v, t) => [v, t], close() { fechou = true; } };
  });
  assert.deepEqual(tentativas, ["GPU", "CPU"]);
  assert.equal(modelo.aceleracao, "processador");
  assert.deepEqual(modelo.detectForVideo("quadro", 45), ["quadro", 45]);
  modelo.close(); assert.equal(fechou, true);
  const gpu = await criarModeloComAceleracao(async (delegate) => {
    assert.equal(delegate, "GPU");
    return { detectForVideo() {}, close() {} };
  });
  assert.equal(gpu.aceleracao, "aceleração gráfica");
  gpu.close();
  const cpu = await criarModeloComAceleracao(async (delegate) => {
    assert.equal(delegate, "CPU");
    return { detectForVideo() {}, close() {} };
  }, { forcarCPU: true });
  assert.equal(cpu.aceleracao, "processador");
  cpu.close();
});

test("reutiliza o detector e libera o antigo antes de trocar o pacote", async () => {
  const eventos = [];
  const carregar = criarCarregadorDeRastreamento(async (perfil) => {
    eventos.push(`abrir:${perfil.nome}`);
    return { close() { eventos.push(`fechar:${perfil.nome}`); }, detectForVideo(video, t) { return { video, t }; } };
  });
  const a = carregar("full"), b = carregar("full");
  assert.equal(a, b);
  const detectar = await a;
  assert.deepEqual(detectar("quadro", 123), { video: "quadro", t: 123 });
  await carregar("heavy");
  assert.deepEqual(eventos, ["abrir:Full · experimental", "fechar:Full · experimental", "abrir:Heavy · experimental"]);
});

test("trocas durante carregamento são serializadas; a falha usa Lite com aviso", async () => {
  let resolver, criado = false;
  const eventos = [];
  const carregar = criarCarregadorDeRastreamento(async (perfil) => {
    eventos.push(perfil.nome);
    if (perfil.nome.includes("Full")) {
      await new Promise((resolve) => { resolver = resolve; });
      criado = true;
      return { close() { assert.ok(criado); eventos.push("fechado"); }, detectForVideo() {} };
    }
    if (perfil.nome.includes("Heavy")) throw new Error("Pacote indisponível");
    return { close() {}, detectForVideo() { return { poseLandmarks: [] }; } };
  });
  const a = carregar("full"), b = carregar("heavy");
  await Promise.resolve();
  assert.deepEqual(eventos, ["Full · experimental"]);
  resolver();
  await a;
  const fallback = await b;
  assert.equal(fallback.perfil, "lite");
  assert.match(fallback.aviso, /não carregou/);
  assert.deepEqual(eventos, ["Full · experimental", "fechado", "Heavy · experimental", "Mais leve · Lite"]);
});

test("falha total permite tentar novamente e valores desconhecidos usam o padrão", async () => {
  let falhar = true, tentativas = 0;
  const carregar = criarCarregadorDeRastreamento(async () => {
    tentativas++;
    if (falhar) throw new Error("sem modelo");
    return { detectForVideo() { return {}; }, close() {} };
  });
  await assert.rejects(carregar("full"), /sem modelo/);
  falhar = false;
  const detector = await carregar("constructor");
  assert.equal(detector.perfil, "lite");
  assert.equal(tentativas, 3);
});
