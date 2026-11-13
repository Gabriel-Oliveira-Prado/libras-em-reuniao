import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";
const tick = () => new Promise((resolve) => setImmediate(resolve));

test("testar som usa a saída de áudio, preserva legenda e permite cancelar; sinal fala automaticamente", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const elementos = Object.fromEntries(["falar", "texto-camera", "estado-voz", "testar-som", "limpar-camera", "parar-voz", "voz-camera", "perfil-voz", "estado-vozes", "atualizar-vozes"].map((id) => [`#${id}`, {
    value: "Texto existente", maxLength: 500, eventos: {}, addEventListener(n, fn) { this.eventos[n] = fn; }, replaceChildren(...itens) { this.itens = itens; },
  }]));
  const sintetizadas = [], fontes = [];
  const rotas = [];
  let saida = "", aoMudar, falharSaida = false;
  const dispositivos = { selecionado: () => saida, observar(fn) { aoMudar = fn; } };
  const perfis = [], salvos = new Map();
  let cancelamentos = 0;
  const cliente = { carregar: async () => {}, preparar: async () => {}, cancelar() { cancelamentos++; }, destruir() {},
    async sintetizar(frase, perfil) { sintetizadas.push(frase); perfis.push(perfil); return { samples: new Float32Array(22050).fill(0.1), sampleRate: 22050 }; } };
  const contexto = {
    URL, setTimeout, clearTimeout, console: { warn() {} }, dispositivos, cliente,
    listarVozes: async () => [{ id: "pf_dora", nome: "Dora · feminina" }, { id: "pm_alex", nome: "Alex · masculina" }],
    localStorage: { getItem: (id) => salvos.get(id), setItem: (id, v) => salvos.set(id, v) },
    document: { querySelector: (id) => elementos[id], createElement: () => ({}) },
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
  vm.runInNewContext(fonte + "\nthis.voz = montarVoz({ dispositivos, cliente });", contexto);
  elementos["#testar-som"].eventos.click();
  await tick();
  assert.match(sintetizadas[0], /Oi/);
  assert.equal(elementos["#texto-camera"].value, "Texto existente");
  assert.ok(fontes[0].destino);
  assert.equal(fontes[0].inicio, 0.02);
  assert.equal(perfis[0], "pf_dora");
  t.mock.timers.tick(20);
  assert.match(elementos["#voz-camera"].textContent, /Falando: Oi/);
  fontes[0].onended();
  assert.equal(elementos["#voz-camera"].hidden, true, "terminar um áudio não encerra a conversa na legenda");
  assert.match(elementos["#estado-voz"].textContent, /volume/);
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
  elementos["#perfil-voz"].value = "pm_alex";
  elementos["#perfil-voz"].eventos.change();
  assert.equal(salvos.get("libras-perfil-voz"), "pm_alex");
  contexto.voz.falarSinal("Gabriel"); await tick();
  assert.equal(perfis.at(-1), "pm_alex");
  fontes.at(-1).onended();
  assert.equal(elementos["#estado-voz"].textContent, "");
  contexto.voz.falarSinal("Gabriel"); await tick();
  assert.equal(sintetizadas.at(-1), "Gabriel", "o mesmo nome pode ser falado novamente");
  assert.ok(cancelamentos > 0);
  contexto.voz.destruir();
});

test("sinais sobrepostos Oi → Gabriel → Gabriel são sintetizados e falados em ordem, sem cortes", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const elementos = Object.fromEntries(["falar", "texto-camera", "estado-voz", "testar-som", "limpar-camera", "parar-voz", "voz-camera", "perfil-voz", "estado-vozes", "atualizar-vozes"].map((id) => [`#${id}`, {
    value: "", maxLength: 500, eventos: {}, hidden: true,
    addEventListener(nome, fn) { this.eventos[nome] = fn; }, replaceChildren() {},
  }]));
  const pedidos = [], fontes = [], resolver = [];
  let cancelamentos = 0, sintesesAtivas = 0, picoSinteses = 0, agoraMs = 0;
  const cliente = {
    cancelar() { cancelamentos++; }, destruir() {},
    async sintetizar(frase, perfil) {
      pedidos.push({ frase, perfil });
      picoSinteses = Math.max(picoSinteses, ++sintesesAtivas);
      try { return await new Promise((resolve) => resolver.push(resolve)); }
      finally { sintesesAtivas--; }
    },
  };
  const contexto = {
    setTimeout, clearTimeout, console: { warn() {} }, cliente,
    listarVozes: async () => [{ id: "pf_dora", nome: "Dora · feminina" }],
    localStorage: { getItem() { return null; } },
    document: { querySelector: (id) => elementos[id], createElement: () => ({}) },
    AudioContext: class {
      destination = {};
      get currentTime() { return agoraMs / 1000; }
      resume() { return Promise.resolve(); }
      createBuffer(canais, n, taxa) {
        assert.equal(canais, 1);
        return { duration: n / taxa, copyToChannel(samples, canal) {
          assert.equal(canal, 0); this.samples = Float32Array.from(samples);
        } };
      }
      createBufferSource() {
        const fonte = {
          paradas: 0, connect(destino) { this.destino = destino; },
          start(inicio) { this.inicio = inicio; },
          stop() { this.paradas++; }, disconnect() {},
        };
        fontes.push(fonte); return fonte;
      }
    },
  };
  const codigo = readFileSync(new URL("../painel/voz.js", import.meta.url), "utf8")
    .replace(/^import .*;\r?\n/gm, "").replace("export function", "function")
    .replaceAll("import.meta.url", '"file:///painel/voz.js"');
  vm.runInNewContext(codigo + "\nthis.voz = montarVoz({ cliente });", contexto);
  const semCortes = () => {
    assert.equal(cancelamentos, 0, "novos sinais não cancelam sínteses ou falas anteriores");
    assert.ok(fontes.every((f) => f.paradas === 0), "nenhuma fonte PCM é interrompida automaticamente");
  };
  const avancarAte = (instanteMs) => {
    const destinoMs = Math.ceil(instanteMs);
    const passo = destinoMs - agoraMs;
    assert.ok(passo >= 0);
    agoraMs = destinoMs; t.mock.timers.tick(passo);
  };
  try {
    contexto.voz.falarSinal("Oi");
    contexto.voz.falarSinal("Gabriel");
    contexto.voz.falarSinal("Gabriel");
    assert.equal(elementos["#texto-camera"].value, "Oi Gabriel Gabriel", "o nome repetido é preservado");
    await tick();
    assert.deepEqual(pedidos.map((p) => p.frase), ["Oi"]);
    assert.equal(fontes.length, 0, "a primeira síntese continua pendente quando os três sinais chegam");

    const tamanhos = [6000, 14400, 9600], valores = [0.125, 0.25, 0.375];
    for (let i = 0; i < 3; i++) {
      assert.equal(sintesesAtivas, 1);
      resolver[i]({ samples: new Float32Array(tamanhos[i]).fill(valores[i]), sampleRate: 24000 });
      await tick();
      assert.equal(fontes.length, i + 1);
      assert.equal(fontes[i].buffer.samples.length, tamanhos[i]);
      assert.equal(fontes[i].buffer.samples[0], valores[i], "cada fala conserva o PCM da própria síntese");
      assert.equal(fontes[i].buffer.samples.at(-1), valores[i]);
      assert.ok(fontes[i].destino);
      semCortes();
    }
    assert.deepEqual(pedidos.map((p) => p.frase), ["Oi", "Gabriel", "Gabriel"]);
    assert.ok(pedidos.every((p) => p.perfil === "pf_dora"));
    assert.equal(picoSinteses, 1, "a síntese seguinte aguarda a anterior, mesmo com chamadas sobrepostas");
    assert.equal(sintesesAtivas, 0);
    assert.equal(fontes[0].inicio, 0.02);
    for (let i = 1; i < fontes.length; i++) {
      const fimAnterior = fontes[i - 1].inicio + fontes[i - 1].buffer.duration;
      assert.ok(fontes[i].inicio >= fimAnterior, "os intervalos de PCM não se sobrepõem");
    }

    for (const [i, frase] of ["Oi", "Gabriel", "Gabriel"].entries()) {
      avancarAte(fontes[i].inicio * 1000);
      assert.equal(elementos["#voz-camera"].textContent, `Falando: ${frase}`);
      avancarAte((fontes[i].inicio + fontes[i].buffer.duration) * 1000);
      fontes[i].onended();
      if (i < 2) assert.equal(elementos["#parar-voz"].hidden, false, "a próxima fala continua agendada");
      semCortes();
    }
    assert.equal(elementos["#voz-camera"].hidden, true);
    assert.equal(elementos["#parar-voz"].hidden, true);
    assert.equal(elementos["#texto-camera"].value, "Oi Gabriel Gabriel");
    assert.equal(elementos["#estado-voz"].textContent, "");
  } finally { contexto.voz.destruir(); }
});

function criarCenarioVozMeet(t, { encaminharAudio, aoPararAudio, sintetizar } = {}) {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const elementos = Object.fromEntries(["falar", "texto-camera", "estado-voz", "testar-som", "limpar-camera", "parar-voz", "voz-camera", "perfil-voz", "estado-vozes", "atualizar-vozes"].map((id) => [`#${id}`, {
    value: "", maxLength: 500, eventos: {}, hidden: true,
    addEventListener(n, fn) { this.eventos[n] = fn; }, replaceChildren() {},
  }]));
  const fontes = [], ganhos = [], sintetizadas = [], destino = {};
  const contagem = { cancelamentos: 0, paradasRemotas: 0 };
  const cliente = {
    carregar: async () => {}, preparar: async () => {}, destruir() {},
    cancelar() { contagem.cancelamentos++; },
    async sintetizar(frase, perfil) {
      sintetizadas.push({ frase, perfil });
      return sintetizar ? sintetizar(frase, perfil) : { samples: new Float32Array(2400).fill(0.25), sampleRate: 24000 };
    },
  };
  const contexto = {
    setTimeout, clearTimeout, console: { warn() {} }, cliente, encaminharAudio,
    aoPararAudio() { contagem.paradasRemotas++; aoPararAudio?.(); },
    listarVozes: async () => [{ id: "pf_dora", nome: "Dora · feminina" }],
    localStorage: { getItem() { return null; } },
    document: { querySelector: (id) => elementos[id], createElement: () => ({}) },
    AudioContext: class {
      currentTime = 0; destination = destino;
      resume() { return Promise.resolve(); }
      createBuffer(_c, n, taxa) { return { duration: n / taxa, copyToChannel(samples) { this.samples = Float32Array.from(samples); } }; }
      createGain() {
        const ganho = { gain: { value: 1 }, desconectado: false,
          connect(alvo) { this.destino = alvo; }, disconnect() { this.desconectado = true; } };
        ganhos.push(ganho); return ganho;
      }
      createBufferSource() {
        const fonte = { paradas: 0, connect(alvo) { this.destino = alvo; }, start(inicio) { this.inicio = inicio; },
          stop() { this.paradas++; }, disconnect() {} };
        fontes.push(fonte); return fonte;
      }
    },
  };
  const codigo = readFileSync(new URL("../painel/voz.js", import.meta.url), "utf8")
    .replace(/^import .*;\r?\n/gm, "").replace("export function", "function")
    .replaceAll("import.meta.url", '"file:///painel/voz.js"');
  vm.runInNewContext(codigo + "\nthis.voz = montarVoz({ cliente, encaminharAudio, aoPararAudio });", contexto);
  return { voz: contexto.voz, elementos, fontes, ganhos, sintetizadas, contagem, destino };
}

test("áudio aceito pelo Meet aguarda ACK, mantém a ordem e silencia somente a cópia local", async (t) => {
  const enviados = [], confirmar = [];
  const c = criarCenarioVozMeet(t, { encaminharAudio(pacote) {
    enviados.push(pacote);
    if (pacote.teste) return false;
    return new Promise((resolve) => confirmar.push(resolve));
  } });
  try {
    for (const frase of ["Oi", "Gabriel", "Gabriel"]) c.voz.falarSinal(frase);
    await tick();
    assert.deepEqual(enviados.map((p) => p.frase), ["Oi"]);
    assert.equal(c.fontes.length, 0, "não cria/agende PCM antes da confirmação remota");
    for (let i = 0; i < 3; i++) {
      assert.equal(enviados[i].sampleRate, 24000);
      assert.equal(enviados[i].samples.length, 2400);
      assert.equal(enviados[i].samples[0], 0.25);
      assert.equal(enviados[i].teste, false);
      confirmar[i](true); await tick();
      assert.equal(c.fontes.length, i + 1);
      assert.equal(c.fontes[i].destino, c.ganhos[i]);
      assert.equal(c.ganhos[i].gain.value, 0, "o PCM encaminhado não sai também no alto-falante");
      assert.equal(c.ganhos[i].destino, c.destino);
      assert.equal(c.contagem.cancelamentos, 0);
      assert.equal(c.contagem.paradasRemotas, 0);
    }
    assert.deepEqual(enviados.map((p) => p.frase), ["Oi", "Gabriel", "Gabriel"]);
    assert.deepEqual(c.sintetizadas.map((p) => p.frase), ["Oi", "Gabriel", "Gabriel"]);
    for (let i = 1; i < 3; i++) assert.ok(c.fontes[i].inicio >= c.fontes[i - 1].inicio + c.fontes[i - 1].buffer.duration);
    assert.ok(c.fontes.every((f) => f.paradas === 0));
    for (const f of c.fontes) f.onended();
    assert.ok(c.ganhos.every((g) => g.desconectado), "fim de fala libera os ganhos locais silenciosos");

    c.elementos["#testar-som"].eventos.click(); await tick();
    assert.equal(enviados.at(-1).teste, true, "o adaptador recebe a marca de teste local");
    assert.equal(c.fontes.at(-1).destino, c.destino);
    assert.equal(c.ganhos.length, 3, "Testar som conserva a reprodução local audível");
  } finally { c.voz.destruir(); }
});

test("Meet recusado ou ausente mantém som local; erro de conexão aparece sem tocar em outra saída", async (t) => {
  const respostas = [false, undefined, Object.assign(new Error("O Meet não confirmou o áudio."), { name: "ConexaoMeetError" })];
  const c = criarCenarioVozMeet(t, { encaminharAudio() {
    const r = respostas.shift(); if (r instanceof Error) throw r; return r;
  } });
  try {
    for (const frase of ["Oi", "Gabriel"]) { c.voz.falarSinal(frase); await tick(); }
    assert.equal(c.fontes.length, 2);
    assert.ok(c.fontes.every((f) => f.destino === c.destino));
    assert.equal(c.ganhos.length, 0);
    c.voz.falarSinal("João"); await tick();
    assert.equal(c.fontes.length, 2, "falha do Meet não reproduz a fala no alto-falante");
    assert.equal(c.elementos["#estado-voz"].textContent, "O Meet não confirmou o áudio.");
  } finally { c.voz.destruir(); }
});

test("cancelar durante síntese não encaminha PCM tardio nem inicia o próximo sinal", async (t) => {
  let concluir;
  const enviados = [];
  const c = criarCenarioVozMeet(t, {
    sintetizar: () => new Promise((resolve) => { concluir = resolve; }),
    encaminharAudio(p) { enviados.push(p); return true; },
  });
  try {
    c.voz.falarSinal("Oi"); c.voz.falarSinal("Gabriel"); await tick();
    c.voz.parar();
    assert.equal(c.contagem.paradasRemotas, 1);
    assert.equal(c.contagem.cancelamentos, 1);
    concluir({ samples: new Float32Array(2400).fill(0.25), sampleRate: 24000 }); await tick();
    assert.equal(enviados.length, 0);
    assert.equal(c.fontes.length, 0);
    assert.deepEqual(c.sintetizadas.map((p) => p.frase), ["Oi"]);
    assert.equal(c.elementos["#estado-voz"].textContent, "");
  } finally { c.voz.destruir(); }
});

test("cancelar enquanto aguarda ACK descarta aceitação tardia sem agendar áudio local", async (t) => {
  let confirmar;
  const c = criarCenarioVozMeet(t, { encaminharAudio: () => new Promise((resolve) => { confirmar = resolve; }) });
  try {
    c.voz.falarSinal("Oi"); await tick();
    assert.equal(c.fontes.length, 0);
    c.voz.parar(); confirmar(true); await tick();
    assert.equal(c.contagem.paradasRemotas, 1);
    assert.equal(c.fontes.length, 0);
    assert.equal(c.ganhos.length, 0);
    assert.equal(c.elementos["#estado-voz"].textContent, "");
  } finally { c.voz.destruir(); }
});

test("parada remota que rejeita ACK pendente não mostra erro tardio após cancelamento", async (t) => {
  let rejeitar;
  const c = criarCenarioVozMeet(t, {
    encaminharAudio: () => new Promise((_resolve, reject) => { rejeitar = reject; }),
    aoPararAudio() { rejeitar?.(Object.assign(new Error("A voz foi interrompida."), { name: "ConexaoMeetError" })); },
  });
  try {
    c.voz.falarSinal("Oi"); await tick();
    c.voz.parar(); await tick();
    assert.equal(c.contagem.paradasRemotas, 1);
    assert.equal(c.fontes.length, 0);
    assert.equal(c.elementos["#estado-voz"].textContent, "", "a parada explícita não é falha de conexão");
    assert.equal(c.elementos["#voz-camera"].hidden, true);
  } finally { c.voz.destruir(); }
});
