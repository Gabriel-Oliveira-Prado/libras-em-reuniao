import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";
const tick = () => new Promise((resolve) => setImmediate(resolve));

function ambiente(salvos = {}, saidaSuportada = true) {
  const elementos = Object.fromEntries(["estado-dispositivos", "atualizar-dispositivos", "permitir-dispositivos", "dispositivo-camera", "dispositivo-microfone", "dispositivo-saida"].map((id) => [id, {
    value: "", eventos: {}, filhos: [], append(item) { this.filhos.push(item); },
    replaceChildren(...itens) { this.filhos = itens; }, addEventListener(n, fn) { this.eventos[n] = fn; },
  }]));
  let lista = [], gravado = JSON.stringify(salvos), paradas = 0;
  const eventos = {}, pedidos = [], mudancas = [];
  class AudioContext {}
  if (saidaSuportada) AudioContext.prototype.setSinkId = async () => {};
  const contexto = {
    AudioContext, document: { querySelector: (id) => elementos[id.slice(1)], createElement: () => ({}) },
    localStorage: { getItem: () => gravado, setItem: (_chave, v) => { gravado = v; } },
    navigator: { mediaDevices: {
      enumerateDevices: async () => lista,
      async getUserMedia(pedido) {
        pedidos.push(pedido);
        const kind = pedido.video ? "videoinput" : "audioinput";
        lista = [...lista.filter((item) => item.kind !== kind), { kind, deviceId: kind, label: kind }];
        return { getTracks: () => [{ stop() { paradas++; } }] };
      },
      addEventListener: (n, fn) => { eventos[n] = fn; }, removeEventListener: (n) => { delete eventos[n]; },
    } },
  };
  const fonte = readFileSync(new URL("../painel/dispositivos.js", import.meta.url), "utf8").replace("export function", "function");
  vm.runInNewContext(fonte + "\nthis.api = montarDispositivos();", contexto);
  contexto.api.observar((evento) => mudancas.push(evento));
  return { api: contexto.api, elementos, eventos, pedidos, mudancas, lista(v) { lista = v; }, salvos: () => JSON.parse(gravado), paradas: () => paradas };
}

test("lista dispositivos, guarda escolhas e avisa desconexão sem abrir outra câmera", async () => {
  const a = ambiente();
  try {
    await tick();
    a.lista([
      { kind: "videoinput", deviceId: "usb", label: "Câmera USB" },
      { kind: "videoinput", deviceId: "interna", label: "Câmera interna" },
      { kind: "audioinput", deviceId: "fone-mic", label: "Microfone do fone" },
      { kind: "audiooutput", deviceId: "fone", label: "Fone USB" },
    ]);
    await a.api.atualizar();
    assert.equal(a.elementos["dispositivo-camera"].filhos[1].textContent, "Câmera USB");
    for (const [tipo, id] of [["camera", "usb"], ["microfone", "fone-mic"], ["saida", "fone"]]) {
      a.elementos[`dispositivo-${tipo}`].value = id;
      a.elementos[`dispositivo-${tipo}`].eventos.change();
      assert.equal(a.api.selecionado(tipo), id);
      assert.equal(a.salvos()[tipo], id);
    }
    a.lista([{ kind: "videoinput", deviceId: "interna", label: "Câmera interna" }]);
    await a.eventos.devicechange();
    const perdas = a.mudancas.filter((item) => item.removido);
    assert.deepEqual(perdas.map((item) => item.tipo), ["camera", "microfone", "saida"]);
    assert.equal(a.api.selecionado("camera"), "usb", "não substitui silenciosamente a câmera salva");
    assert.equal(a.pedidos.length, 0);
    await a.eventos.devicechange();
    assert.equal(a.mudancas.filter((item) => item.removido).length, 3, "não repete aviso de perda");
    assert.match(a.elementos["estado-dispositivos"].textContent, /desconectado/);
    a.lista([{ kind: "audiooutput", deviceId: "fone", label: "Fone USB" }]);
    await a.eventos.devicechange();
    assert.equal(a.mudancas.at(-1).tipo, "saida");
    assert.equal(a.mudancas.at(-1).removido, false, "reconexão libera a saída selecionada");
  } finally { a.api.destruir(); }
  assert.equal(a.eventos.devicechange, undefined);
});

test("permissão oculta não apaga escolha salva; listar libera as faixas temporárias", async () => {
  const a = ambiente({ camera: "usb-salva", microfone: "mic-salvo" });
  try {
    await tick();
    assert.equal(a.api.selecionado("camera"), "usb-salva");
    assert.equal(a.mudancas.length, 0, "lista sem permissão não significa desconexão");
    assert.match(a.elementos["dispositivo-camera"].filhos.at(-1).textContent, /permita o acesso/);
    await a.elementos["permitir-dispositivos"].eventos.click();
    assert.equal(a.pedidos.length, 2);
    assert.equal(a.paradas(), 2, "não deixa câmera nem microfone temporários abertos");
    assert.equal(a.elementos["permitir-dispositivos"].hidden, true);
  } finally { a.api.destruir(); }
  const b = ambiente({ saida: "fone-antigo" }, false);
  try {
    await tick();
    assert.equal(b.api.selecionado("saida"), "");
    assert.equal(b.elementos["dispositivo-saida"].disabled, true);
    assert.match(b.elementos["estado-dispositivos"].textContent, /saída padrão do Windows/);
  } finally { b.api.destruir(); }
});
