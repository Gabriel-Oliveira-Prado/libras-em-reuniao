import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { criarServidorTranscricao } from "../scripts/transcricao-local.mjs";
import { criarTranscricaoAcelerada } from "../painel/transcricao-acelerada.mjs";

test("serviço aceita só origem autorizada e PCM válido, com modelo restrito", async () => {
  const origem = "chrome-extension://" + "a".repeat(32), chamadas = [];
  const servidor = criarServidorTranscricao({ origem, carregar: async (m) => chamadas.push(m), transcrever: async (audio) => { assert.equal(audio.length, 160); return "Onde é?"; } });
  await new Promise((r) => servidor.listen(0, "127.0.0.1", r));
  const api = "http://127.0.0.1:" + servidor.address().port;
  const headers = { Origin: origem, "Content-Type": "application/octet-stream" };
  try {
    assert.equal((await fetch(api + "/health")).status, 403);
    assert.equal((await fetch(api + "/health", { headers: { Origin: "https://example.invalid" } })).status, 403);
    const preflight = await fetch(api + "/transcribe?modelo=small", { method: "OPTIONS", headers });
    assert.equal(preflight.status, 204); assert.equal(preflight.headers.get("access-control-allow-origin"), origem);
    assert.equal((await fetch(api + "/load?modelo=../../x", { method: "POST", headers })).status, 400);
    assert.equal((await fetch(api + "/transcribe?modelo=small", { method: "POST", headers, body: Float32Array.of(NaN) })).status, 400);
    assert.equal((await fetch(api + "/transcribe?modelo=small", { method: "POST", headers, body: new Uint8Array(900001) })).status, 413);
    const resposta = await fetch(api + "/transcribe?modelo=small", { method: "POST", headers, body: new Float32Array(160).fill(0.1) });
    assert.equal(resposta.status, 200); assert.equal((await resposta.json()).texto, "Onde é?");
    assert.deepEqual(chamadas, ["small"]);
    let recebidos = 0;
    const chegaram = new Promise((r) => servidor.on("request", () => { if (++recebidos === 3) r(); }));
    const uploads = Array.from({ length: 3 }, () => {
      const q = http.request(api + "/transcribe?modelo=small", { method: "POST", headers: { ...headers, "Content-Length": 640 } });
      q.on("error", () => {}); q.flushHeaders(); return q;
    });
    try {
      await chegaram;
      assert.equal((await fetch(api + "/load?modelo=small", { method: "POST", headers })).status, 429, "uploads incompletos também reservam vaga");
    } finally { uploads.forEach((q) => q.destroy()); }
  } finally { servidor.closeAllConnections(); await new Promise((r) => servidor.close(r)); }
});
test("cliente acelerado preserva texto/ID e ignora resposta depois de cancelar", async () => {
  let concluir, signal, corpo;
  const cliente = criarTranscricaoAcelerada(async (url, o) => { assert.equal(url, "http://127.0.0.1:18271/transcribe?modelo=small"); signal = o.signal; corpo = o.body; return new Promise((r) => { concluir = () => r({ ok: true, json: async () => ({ texto: "Gabriel, não.", inferenciaMs: 1000 }) }); }); });
  const respostas = []; cliente.onmessage = ({ data }) => respostas.push(data);
  const audio = new Float32Array(160);
  cliente.postMessage({ tipo: "transcrever", modelo: "small", id: 7, amostras: audio });
  concluir(); await new Promise((r) => setImmediate(r));
  assert.equal(corpo, audio); assert.deepEqual(respostas[0], { tipo: "texto", id: 7, texto: "Gabriel, não.", inferenciaMs: 1000 });
  cliente.postMessage({ tipo: "transcrever", modelo: "small", id: 8, amostras: audio });
  cliente.terminate(); assert.equal(signal.aborted, true); concluir();
  await new Promise((r) => setImmediate(r)); assert.equal(respostas.length, 1);
});
