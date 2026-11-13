import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";

test("avatar só aparece em Voz para Libras e captura para ao trocar de modo", () => {
  const criar = () => ({ hidden: false, eventos: {}, addEventListener(n, f) { this.eventos[n] = f; } });
  const elementos = { interprete: { hidden: true }, "modo-camera": { hidden: false }, "modo-fala": { hidden: true }, "limpar-camera": criar(), "limpar-fala": criar() };
  const botoes = ["modo-camera", "modo-fala"].map((modo, i) => ({
    ...criar(), atributos: { "aria-controls": modo, "aria-pressed": String(i === 0) },
    getAttribute(n) { return this.atributos[n]; }, setAttribute(n, v) { this.atributos[n] = v; },
  }));
  let cameraParou = 0, micParou = 0, abriu = 0, avatarParou = 0;
  const pararFala = Object.assign(() => micParou++, { preparar() {} });
  const contexto = {
    document: { querySelector: (s) => elementos[s.slice(1)], querySelectorAll: () => botoes, getElementById: (id) => elementos[id] },
    window: { addEventListener() {} },
    montarCamera: () => () => cameraParou++, montarFala: () => pararFala,
    montarSinais: () => ({ receber() {}, parar() {}, temModelo() {} }),
    montarVoz: () => ({ falarSinal() {}, preparar() {}, parar() {} }),
    montarDicionario: () => ({ destruir() {} }),
    montarDispositivos: () => ({ destruir() {} }),
    montarBiblioteca: () => ({ destruir() {} }),
    montarAuxiliarLocal: () => ({ invalidar() {}, destruir() {} }),
    montarIntegracaoMeet: () => ({ ativa: () => false, mudarModo() {}, encaminharAudio() {}, pararAudio() {}, destruir() {} }),
    montarVLibras: () => ({ abrir: () => abriu++, parar: () => avatarParou++, adicionar() {}, destruir() {} }),
  };
  const fonte = readFileSync(new URL("../painel/painel.js", import.meta.url), "utf8").replace(/^import .*;\r?\n/gm, "");
  vm.runInNewContext(fonte, contexto);
  botoes[1].eventos.click();
  assert.equal(elementos.interprete.hidden, false);
  assert.equal(elementos["modo-camera"].hidden, true);
  assert.equal(abriu, 1); assert.equal(cameraParou, 1);
  botoes[0].eventos.click();
  assert.equal(elementos.interprete.hidden, true);
  assert.equal(elementos["modo-fala"].hidden, true);
  assert.equal(micParou, 1); assert.equal(avatarParou, 1);
});

test("Meet recebe cada fala uma vez e nunca liga o microfone ao trocar modo ou reconectar", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const criar = () => ({
    hidden: false, value: "1", eventos: {}, setAttribute() {},
    addEventListener(n, f) { (this.eventos[n] ??= []).push(f); },
    append() {},
  });
  const ids = ["interprete", "modo-camera", "modo-fala", "limpar-camera", "limpar-fala", "avatar", "estado-vlibras", "glosa", "texto-glosa", "trecho-avatar", "traduzir", "repetir", "tentar-avatar", "testar-avatar", "texto-fala", "pausar-avatar", "velocidade-avatar"];
  const elementos = Object.fromEntries(ids.map((id) => [id, criar()]));
  elementos.interprete.hidden = elementos["modo-fala"].hidden = true;
  const botoes = ["modo-camera", "modo-fala"].map((modo, i) => ({
    ...criar(), atributos: { "aria-controls": modo, "aria-pressed": String(i === 0) },
    getAttribute(n) { return this.atributos[n]; }, setAttribute(n, v) { this.atributos[n] = v; },
  }));
  let ativa = true, callbacks, opcoesFala, opcoesVoz, cameraParou = 0, micParou = 0, micIniciou = 0;
  let vozParou = 0, iframes = 0, removidos = 0, consultas = 0, modo = "sinais", meetDestruido = 0;
  const enviados = [], modos = [], eventosJanela = {};
  const meet = {
    ativa: () => ativa, mudarModo(m) { modo = m; modos.push(m); },
    adicionar(frase) { assert.equal(modo, "fala"); enviados.push(frase); return true; },
    pararAvatar() {}, encaminharAudio() {}, pararAudio() {},
    destruir() { meetDestruido++; ativa = false; callbacks.aoConexao(false); },
  };
  const pararFala = Object.assign(() => micParou++, {
    preparar() {}, iniciar() { micIniciou++; },
  });
  const contexto = {
    URL, AbortController, performance, setTimeout, clearTimeout, console,
    document: {
      querySelector: (s) => elementos[s.slice(1)], querySelectorAll: () => botoes,
      getElementById: (id) => elementos[id],
      createElement(tag) {
        assert.equal(tag, "iframe"); iframes++;
        return { contentWindow: { postMessage() {} }, remove() { removidos++; } };
      },
    },
    window: {
      addEventListener(n, f) { eventosJanela[n] = f; },
      removeEventListener(n, f) { if (eventosJanela[n] === f) delete eventosJanela[n]; },
    },
    fetch: async () => { consultas++; return { ok: true, text: async () => "TESTE" }; },
    montarIntegracaoMeet(opcoes) { callbacks = opcoes; return meet; },
    montarCamera: () => () => cameraParou++,
    montarFala(opcoes) { opcoesFala = opcoes; return pararFala; },
    montarSinais: () => ({ receber() {}, parar() {}, temModelo() {} }),
    montarVoz(opcoes) { opcoesVoz = opcoes; return { falarSinal() {}, preparar() {}, parar() { vozParou++; }, destruir() {} }; },
    montarDicionario: () => ({ destruir() {} }),
    montarDispositivos: () => ({ destruir() {} }),
    montarBiblioteca: () => ({ destruir() {} }),
    montarAuxiliarLocal: () => ({ invalidar() {}, destruir() {} }),
  };
  const avatarReal = readFileSync(new URL("../painel/vlibras.js", import.meta.url), "utf8").replace(/^import .*;\r?\n/gm, "").replace("export function montarVLibras", "function montarVLibras");
  const painel = readFileSync(new URL("../painel/painel.js", import.meta.url), "utf8").replace(/^import .*;\r?\n/gm, "");
  vm.runInNewContext(avatarReal + "\n" + painel, contexto);
  const clicar = (botao) => botao.eventos.click.forEach((f) => f());
  try {
    assert.equal(opcoesVoz.encaminharAudio, meet.encaminharAudio);
    assert.equal(opcoesVoz.aoPararAudio, meet.pararAudio);
    clicar(botoes[1]);
    assert.equal(micIniciou, 0);
    assert.equal(cameraParou, 1);
    assert.equal(elementos.interprete.hidden, true, "o avatar é remoto quando conectado");
    assert.equal(iframes, 0, "o painel não cria um segundo avatar oculto");
    for (const frase of ["Oi", "Gabriel", "Gabriel"]) assert.equal(opcoesFala.aoTexto(frase), true);
    assert.deepEqual(enviados, ["Oi", "Gabriel", "Gabriel"], "cada emissão é encaminhada uma vez, inclusive repetições legítimas");
    assert.equal(consultas, 0, "o painel não traduz novamente o texto encaminhado");
    clicar(botoes[1]);
    assert.equal(micIniciou, 0, "selecionar o modo não liga a captura");

    ativa = false; callbacks.aoConexao(false);
    assert.equal(micParou, 1);
    assert.equal(elementos.interprete.hidden, false);
    assert.equal(iframes, 1, "desconectar restaura o avatar local");
    ativa = true; callbacks.aoConexao(true);
    assert.equal(micParou, 2);
    assert.equal(micIniciou, 0, "reconectar não liga o microfone");
    assert.equal(removidos, 1, "reconectar remove a instância local anterior");
    assert.equal(elementos.interprete.hidden, true);
    opcoesFala.aoTexto("Tudo bem?");
    assert.deepEqual(enviados, ["Oi", "Gabriel", "Gabriel", "Tudo bem?"]);

    clicar(botoes[0]);
    assert.equal(micParou, 3);
    assert.equal(elementos["modo-camera"].hidden, false);
    assert.equal(elementos["modo-fala"].hidden, true);
    assert.equal(elementos.interprete.hidden, true);
    assert.deepEqual(modos, ["fala", "sinais"]);
    assert.ok(vozParou >= 3, "trocar destino ou modo interrompe a rota de voz antiga");
    ativa = false; callbacks.aoConexao(false);
    assert.equal(micIniciou, 0, "conexão em modo câmera não abre microfone");
    assert.equal(iframes, 1, "conexão em modo câmera não abre avatar local");
    assert.equal(consultas, 0);
  } finally { eventosJanela.pagehide(); }
  assert.equal(meetDestruido, 1);
  assert.equal(iframes, 1, "callback de desconexão durante pagehide não reabre o avatar");
});
