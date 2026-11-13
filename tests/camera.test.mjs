import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";
const tick = () => new Promise((resolve) => setImmediate(resolve));
function ambiente(getUserMedia, dispositivos, carregarDetector) {
  const frames = [], recebidos = [], eventos = {};
  const criar = () => ({ hidden: true, textContent: "", eventos: {}, addEventListener(n, fn) { this.eventos[n] = fn; } });
  const elementos = Object.fromEntries(["camera", "desenho-maos", "camera-inativa", "alternar-camera", "estado-camera", "maos-detectadas", "qualidade-rastreamento", "estado-rastreamento"].map((id) => [id, criar()]));
  elementos["qualidade-rastreamento"].value = "lite";
  Object.assign(elementos.camera, { videoWidth: 640, videoHeight: 480, readyState: 2, currentTime: 0, play: async () => {}, pause() {},
    addEventListener(n, fn) { eventos[n] = fn; }, removeEventListener(n) { delete eventos[n]; } });
  elementos["desenho-maos"].getContext = () => ({ clearRect() {} });
  const contexto = { console: { warn() {} }, setTimeout, clearTimeout, performance: { now: () => 1 }, navigator: { mediaDevices: { getUserMedia } },
    document: { querySelector: (s) => elementos[s.slice(1)] },
    carregarDetectorDeMaos: carregarDetector ?? (async () => () => ({ leftHandLandmarks: [Array.from({ length: 21 }, (_, i) => ({ x: 0.3 + i * 0.004, y: 0.4, z: 0 }))], poseLandmarks: [[]], faceLandmarks: [[]] })),
    desenharMaos() {}, requestAnimationFrame: (fn) => { frames.push(fn); return frames.length; }, cancelAnimationFrame() {}, recebidos, dispositivos,
  };
  const fonte = readFileSync(new URL("../painel/camera.js", import.meta.url), "utf8").replace(/^import .*;\r?\n/gm, "").replace("export function", "function");
  vm.runInNewContext(fonte + "\nthis.parar = montarCamera({dispositivos, aoDetectar: (...args) => recebidos.push(args), temModelo: () => true});", contexto);
  return { contexto, elementos, frames, recebidos, eventos };
}
test("câmera encaminha mãos e proporção reais, ajusta sobreposição ao mudar resolução e libera a faixa", async () => {
  let paradas = 0;
  const faixa = { stop: () => paradas++, addEventListener() {} }, stream = { getTracks: () => [faixa], getVideoTracks: () => [faixa] };
  const a = ambiente(async (pedido) => { assert.equal(pedido.audio, false); return stream; });
  try {
    a.elementos["alternar-camera"].eventos.click(); await tick();
    a.frames.at(-1)(100);
    assert.equal(a.recebidos[0][0].leftHandLandmarks.length, 21);
    assert.equal(a.recebidos[0][2], 4 / 3);
    a.elementos.camera.videoWidth = 1280; a.elementos.camera.videoHeight = 720; a.elementos.camera.currentTime = 0.2;
    a.frames.at(-1)(200);
    assert.equal(a.recebidos[1][2], 16 / 9);
    assert.equal(a.elementos["desenho-maos"].width, 1280);
    assert.equal(a.elementos["desenho-maos"].height, 720);
  } finally { a.contexto.parar(); }
  assert.equal(paradas, 1);
  assert.equal(a.elementos.camera.srcObject, null);
});

test("trocar modelo enquanto carrega cancela a sessão anterior sem iniciar quadros antigos", async () => {
  const faixas = [], perfis = [], pendentes = [];
  const a = ambiente(async () => {
    const faixa = { parou: false, stop() { this.parou = true; }, addEventListener() {} };
    faixas.push(faixa);
    return { getTracks: () => [faixa], getVideoTracks: () => [faixa] };
  }, undefined, (perfil) => {
    perfis.push(perfil);
    return new Promise((resolve) => pendentes.push(resolve));
  });
  try {
    a.elementos["alternar-camera"].eventos.click(); await tick();
    a.elementos["qualidade-rastreamento"].value = "heavy";
    a.elementos["qualidade-rastreamento"].eventos.change(); await tick();
    assert.deepEqual(perfis, ["lite", "heavy"]);
    assert.equal(faixas[0].parou, true);
    pendentes[0](() => { throw new Error("Não usar detector da sessão cancelada"); });
    await tick();
    assert.equal(a.frames.length, 0);
    pendentes[1](Object.assign(() => ({ poseLandmarks: [] }), { nome: "Detalhada · Heavy" }));
    await tick();
    assert.equal(a.frames.length, 1);
    assert.match(a.elementos["estado-rastreamento"].textContent, /Heavy/);
    a.frames[0](100);
    assert.equal(a.recebidos.length, 1);
  } finally { a.contexto.parar(); }
  assert.equal(faixas[1].parou, true);
});

test("falha do primeiro quadro GPU recupera a leitura em CPU antes de gerar legenda", async () => {
  const pedidos = [];
  const faixa = { stop() {}, addEventListener() {} };
  const a = ambiente(async () => ({ getTracks: () => [faixa], getVideoTracks: () => [faixa] }), undefined,
    async (perfil, opcoes) => {
      pedidos.push({ perfil, cpu: opcoes?.forcarCPU });
      if (!opcoes?.forcarCPU) return Object.assign(() => { throw new Error("Driver GPU falhou"); }, { aceleracao: "aceleração gráfica", perfil });
      return Object.assign(() => ({ poseLandmarks: [] }), { aceleracao: "processador", nome: "Lite", perfil });
    });
  try {
    a.elementos["alternar-camera"].eventos.click(); await tick();
    assert.deepEqual(pedidos, [{ perfil: "lite", cpu: undefined }, { perfil: "lite", cpu: true }]);
    assert.equal(a.recebidos.length, 0, "a verificação inicial não vira legenda ou cadastro");
    assert.match(a.elementos["estado-rastreamento"].textContent, /processador/);
    a.frames.at(-1)(100);
    assert.equal(a.recebidos.length, 1);
  } finally { a.contexto.parar(); }
});

test("trocar câmera aplica deviceId exato, libera captura antiga e para ao desconectar", async () => {
  let id = "usb", aoMudar;
  const pedidos = [], faixas = [];
  const a = ambiente(async (pedido) => {
    pedidos.push(pedido);
    const faixa = { stop() { this.parou = true; }, addEventListener() {} };
    faixas.push(faixa);
    return { getTracks: () => [faixa], getVideoTracks: () => [faixa] };
  }, { selecionado: () => id, atualizar() {}, observar(fn) { aoMudar = fn; } });
  try {
    a.elementos["alternar-camera"].eventos.click(); await tick();
    assert.equal(pedidos[0].video.deviceId.exact, "usb");
    id = "interna"; aoMudar({ tipo: "camera" }); await tick();
    assert.equal(faixas[0].parou, true);
    assert.equal(pedidos[1].video.deviceId.exact, "interna");
    aoMudar({ tipo: "camera", removido: true });
    assert.equal(faixas[1].parou, true);
    assert.equal(pedidos.length, 2, "desconectar não abre outra câmera");
    assert.match(a.elementos["estado-camera"].textContent, /desconectada/);
  } finally { a.contexto.parar(); }
});
test("permissão negada mostra orientação e cancelamento durante metadados não deixa a câmera aberta", async () => {
  const negado = ambiente(async () => { throw new DOMException("denied", "NotAllowedError"); });
  negado.elementos["alternar-camera"].eventos.click(); await tick();
  assert.match(negado.elementos["estado-camera"].textContent, /Chrome bloqueou a câmera/);
  let paradas = 0;
  const faixa = { stop: () => paradas++, addEventListener() {} };
  const a = ambiente(async () => ({ getTracks: () => [faixa], getVideoTracks: () => [faixa] }));
  a.elementos.camera.videoWidth = a.elementos.camera.videoHeight = 0;
  a.elementos["alternar-camera"].eventos.click(); await tick();
  assert.ok(a.eventos.loadedmetadata);
  a.contexto.parar(); await tick();
  assert.equal(paradas, 1);
  assert.equal(a.eventos.loadedmetadata, undefined);
  assert.equal(a.frames.length, 0);
});
