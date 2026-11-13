import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";
const tick = () => new Promise((resolve) => setImmediate(resolve));

test("testar som usa a saída de áudio, preserva legenda e permite cancelar; sinal fala automaticamente", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const elementos = Object.fromEntries(["falar", "texto-camera", "estado-voz", "testar-som", "limpar-camera", "parar-voz", "voz-camera"].map((id) => [`#${id}`, {
    value: "Texto existente", maxLength: 500, eventos: {}, addEventListener(n, fn) { this.eventos[n] = fn; },
  }]));
  const sintetizadas = [], fontes = [];
  const rotas = [];
  let saida = "", aoMudar, falharSaida = false;
  const dispositivos = { selecionado: () => saida, observar(fn) { aoMudar = fn; } };
  const contexto = {
    URL, setTimeout, clearTimeout, console: { warn() {} }, dispositivos, document: { querySelector: (id) => elementos[id] },
    createEspeak: async () => ({ loadVoice: async () => {}, synthesize(frase) { sintetizadas.push(frase); return { samples: new Int16Array(22050).fill(100), sampleRate: 22050 }; } }),
    toFloat32: (v) => Float32Array.from(v, (x) => x / 32768),
    AudioContext: class {
      currentTime = 0; destination = {};
      sinkId = "";
      async setSinkId(id) { if (falharSaida) throw new Error("desconectado"); this.sinkId = id; rotas.push(id); }
      resume() { return Promise.resolve(); }
      createBuffer(_c, n, taxa) { return { duration: n / taxa, copyToChannel() {} }; }
      createBufferSource() {
        const fonte = { connect(destino) { this.destino = destino; }, start(t) { this.inicio = t; }, stop() { this.parou = true; }, disconnect() {} };
        fontes.push(fonte); return fonte;
      }
    },
  };
  const fonte = readFileSync(new URL("../painel/voz.js", import.meta.url), "utf8")
    .replace(/^import .*;\r?\n/gm, "").replace("export function", "function").replaceAll("import.meta.url", '"file:///painel/voz.js"');
  vm.runInNewContext(fonte + "\nthis.voz = montarVoz({ dispositivos });", contexto);
  elementos["#testar-som"].eventos.click();
  await tick();
  assert.match(sintetizadas[0], /Oi/);
  assert.equal(elementos["#texto-camera"].value, "Texto existente");
  assert.ok(fontes[0].destino);
  assert.equal(fontes[0].inicio, 0.02);
  t.mock.timers.tick(20);
  assert.match(elementos["#voz-camera"].textContent, /Falando: Oi/);
  fontes[0].onended();
  assert.match(elementos["#estado-voz"].textContent, /volume do Windows/);
  contexto.voz.falarSinal("Oi");
  await tick();
  assert.equal(sintetizadas[1], "Oi");
  assert.equal(elementos["#texto-camera"].value, "Texto existente Oi");
  assert.ok(fontes[1].inicio >= 0);
  t.mock.timers.tick(1100);
  assert.equal(elementos["#voz-camera"].textContent, "Falando: Oi");
  elementos["#parar-voz"].eventos.click();
  assert.equal(fontes[1].parou, true);
  assert.equal(elementos["#voz-camera"].hidden, true);
  assert.equal(elementos["#texto-camera"].value, "Texto existente Oi", "parar voz preserva a legenda");
  elementos["#limpar-camera"].eventos.click();
  assert.equal(fontes[1].parou, true);
  assert.equal(elementos["#texto-camera"].value, "");
  saida = "fone-usb";
  aoMudar({ tipo: "saida" }); await tick();
  assert.deepEqual(rotas, ["fone-usb"]);
  contexto.voz.falarSinal("Gabriel"); await tick();
  assert.equal(sintetizadas.at(-1), "Gabriel");
  aoMudar({ tipo: "saida", removido: true });
  assert.equal(fontes.at(-1).parou, true, "desconexão cancela voz sem continuar no alto-falante padrão");
  const antes = fontes.length;
  contexto.voz.falarSinal("João"); await tick();
  assert.equal(fontes.length, antes, "sinal novo não toca após desconexão");
  falharSaida = true; saida = "fone-sem-permissao";
  aoMudar({ tipo: "saida", removido: false }); await tick();
  contexto.voz.falarSinal("João"); await tick();
  assert.equal(fontes.length, antes, "falha de setSinkId não toca em outro dispositivo");
  assert.match(elementos["#estado-voz"].textContent, /saída escolhida/);
  falharSaida = false; saida = "fone-usb";
  aoMudar({ tipo: "saida", removido: false }); await tick();
  contexto.voz.falarSinal("Ana Clara"); await tick();
  assert.equal(fontes.length, antes + 1, "reconexão permite a voz novamente");
});
