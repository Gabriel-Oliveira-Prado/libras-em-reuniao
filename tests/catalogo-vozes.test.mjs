import test from "node:test";
import assert from "node:assert/strict";
import { listarVozes, nomePerfil } from "../vozes/catalogo.mjs";
import { criarClienteVoz } from "../vozes/cliente.mjs";
const tick = () => new Promise((resolve) => setImmediate(resolve));

test("descobre novas vozes brasileiras na pasta, inclusive lotes adicionais do Chrome", async () => {
  const arquivo = (name, isFile = true) => ({ name, isFile });
  const lotes = [[arquivo("pf_dora.bin"), arquivo("pm_alex.bin"), arquivo("af_heart.bin")], [arquivo("pm_santa.bin"), arquivo("pf_teste.bin", false)], []];
  const runtime = { getPackageDirectoryEntry: async () => ({ getDirectory(nome, opcoes, resolve) {
    assert.equal(nome, "vozes/perfis"); assert.equal(opcoes.create, false);
    resolve({ createReader: () => ({ readEntries: (ok) => ok(lotes.shift()) }) });
  } }) };
  assert.deepEqual((await listarVozes({ runtime })).map((v) => v.id), ["pm_alex", "pf_dora", "pm_santa"]);
  assert.equal(nomePerfil("pf_dora"), "Dora · feminina");
  assert.throws(() => nomePerfil("../outra-voz"), /inválido/);
});

test("fala preparada toca sem modelo; nome novo usa a geração certa mesmo após cancelar antes do primeiro uso", async () => {
  const motores = [];
  class WorkerLocal {
    mensagens = [];
    constructor() { motores.push(this); }
    postMessage(msg) { this.mensagens.push(msg); }
    terminate() {}
  }
  const pcm = Float32Array.of(0.1, -0.1, 0.2, -0.2);
  const ler = async (url) => String(url).endsWith("catalogo.json") ? new Response(JSON.stringify({ pf_dora: { oi: "oi.pcm" } })) : new Response(pcm.slice().buffer);
  const voz = criarClienteVoz(WorkerLocal, ler);
  try {
    voz.cancelar();
    const oi = await voz.sintetizar("Oi!", "pf_dora");
    assert.deepEqual(oi.samples, pcm);
    assert.equal(motores.length, 0, "saudações preparadas não esperam inferência neural");
    const novo = voz.sintetizar("Um nome novo", "pm_alex"); await tick();
    const motor = motores[0], pedido = motor.mensagens.at(-1);
    assert.equal(motor.mensagens[0].geracao, pedido.geracao, "sincroniza cancelamentos anteriores à criação do worker");
    motor.onmessage({ data: { id: pedido.id, tipo: "audio", samples: pcm.slice(), sampleRate: 24000 } });
    assert.equal((await novo).sampleRate, 24000);
    const tardio = voz.sintetizar("Outro nome", "pf_dora"); await tick();
    const promessa = assert.rejects(tardio, { name: "AbortError" });
    voz.cancelar(); await promessa;
  } finally { voz.destruir(); }
});
