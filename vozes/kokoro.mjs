// Inferência Kokoro v1.0; o eSpeak só converte texto em fonemas.
// O áudio é produzido pela rede neural, não pelo sintetizador do eSpeak.
import { recortarOi } from "./recorte-oi.mjs";
const TROCAS = [["aɪ", "I"], ["aʊ", "W"], ["dʒ", "ʤ"], ["dz", "ʣ"], ["eɪ", "A"], ["oʊ", "O"], ["əʊ", "Q"], ["ss", "S"], ["ts", "ʦ"], ["tʃ", "ʧ"], ["ɔɪ", "Y"]];

export function fonemizarPortugues(texto, motor) {
  return (texto.match(/[^;:,.!?…]+|[;:,.!?…]/gu) ?? []).map((trecho) => {
    if (/^[;:,.!?…]$/u.test(trecho)) return trecho;
    let fonemas = motor.phonemes(trecho.trim(), { voice: "pt-br", tie: true }).replace(/[\u0361\u035c^]/gu, "");
    for (const [de, para] of TROCAS) fonemas = fonemas.replaceAll(de, para);
    return fonemas.replace(/\([a-z-]+\)/giu, "").replace(/[-_\n]/gu, " ");
  }).join(" ").replace(/\s+/gu, " ").trim();
}

export function separarTokens(fonemas, vocabulario, limite = 180) {
  const tokens = [...fonemas].filter((letra) => Object.hasOwn(vocabulario, letra)).map((letra) => vocabulario[letra]);
  if (!tokens.length) throw new Error("Não foi possível preparar o texto para a voz em português.");
  const trechos = [];
  while (tokens.length) {
    let fim = Math.min(limite, tokens.length);
    if (fim < tokens.length) {
      for (let i = fim - 1; i >= Math.floor(limite * 0.6); i--) if ([3, 4, 5, 6, 16].includes(tokens[i])) { fim = i + 1; break; }
    }
    trechos.push(tokens.splice(0, fim));
  }
  return trechos;
}

export function criarMotorKokoro({ ort, motorFonemas, lerJson, lerBytes, opcoesSessao = { executionProviders: ["wasm"], graphOptimizationLevel: "all" } }) {
  let carregamento;
  const perfis = new Map(), cache = new Map();
  let bytesCache = 0;
  function carregar() {
    carregamento ??= Promise.all([
      lerJson(new URL("./modelos/tokenizer.json", import.meta.url)),
      lerBytes(new URL("./modelos/kokoro-q8.onnx", import.meta.url)).then((bytes) => ort.InferenceSession.create(bytes, opcoesSessao)),
      motorFonemas(),
    ]).catch((erro) => { carregamento = undefined; throw erro; });
    return carregamento;
  }
  async function obterPerfil(id) {
    if (!/^p[fm]_[a-z0-9_-]{1,60}$/.test(id)) throw new Error("Escolha uma voz brasileira disponível.");
    if (!perfis.has(id)) {
      const bytes = await lerBytes(new URL(`./perfis/${id}.bin`, import.meta.url));
      const perfil = new Float32Array(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
      if (perfil.length < 181 * 256 || perfil.length % 256 || !perfil.every(Number.isFinite)) throw new Error("O arquivo desta voz não é um perfil Kokoro válido.");
      perfis.set(id, perfil);
      if (perfis.size > 8) perfis.delete(perfis.keys().next().value);
    }
    return perfis.get(id);
  }
  async function sintetizar(texto, id) {
    const chave = `${id}\0${texto}`;
    if (cache.has(chave)) return { samples: cache.get(chave).slice(), sampleRate: 24000, cache: true };
    const [{ model: { vocab } }, sessao, motor] = await carregar();
    const perfil = await obterPerfil(id);
    const oi = texto.trim().toLocaleLowerCase("pt-BR").replace(/[.!?]+$/u, "") === "oi";
    const trechos = separarTokens(fonemizarPortugues(oi ? "Oi! Tudo bem?" : texto, motor), vocab), audios = [];
    for (const tokens of trechos) {
      const estilo = perfil.slice(tokens.length * 256, (tokens.length + 1) * 256);
      const saidas = await sessao.run({
        input_ids: new ort.Tensor("int64", BigInt64Array.from([0, ...tokens, 0], BigInt), [1, tokens.length + 2]),
        style: new ort.Tensor("float32", estilo, [1, 256]),
        speed: new ort.Tensor("float32", Float32Array.of(1), [1]),
      });
      const audio = saidas[sessao.outputNames[0]].data;
      if (!audio.length || !audio.every(Number.isFinite)) throw new Error("A voz retornou um áudio inválido.");
      audios.push(Float32Array.from(audio));
    }
    let samples = new Float32Array(audios.reduce((s, a) => s + a.length, 0));
    let posicao = 0;
    for (const audio of audios) { samples.set(audio, posicao); posicao += audio.length; }
    if (oi) samples = recortarOi(samples);
    if (samples.byteLength <= 16 * 1024 * 1024) {
      cache.set(chave, samples); bytesCache += samples.byteLength;
      while (bytesCache > 16 * 1024 * 1024 || cache.size > 80) {
        const primeira = cache.keys().next().value; bytesCache -= cache.get(primeira).byteLength; cache.delete(primeira);
      }
    }
    return { samples: samples.slice(), sampleRate: 24000, cache: false };
  }
  return { carregar, sintetizar };
}
