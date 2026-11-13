export function criarClienteVoz(WorkerLocal = globalThis.Worker, ler = globalThis.fetch) {
  let worker, contador = 0, geracao = 0, carregamento;
  const pendentes = new Map();
  const preparados = new Map(), falasProntas = new Map();
  let catalogoFalas;
  const chaveTexto = (texto) => texto.normalize("NFC").toLocaleLowerCase("pt-BR").trim().replace(/[.!?]+$/u, "");
  async function procurarFala(texto, perfil) {
    catalogoFalas ??= ler(new URL("./falas/catalogo.json", import.meta.url)).then((r) => r.ok ? r.json() : {}).catch(() => ({}));
    const catalogo = await catalogoFalas;
    const arquivo = catalogo[perfil]?.[chaveTexto(texto)];
    if (!arquivo || !/^[a-z0-9_-]+\.pcm$/.test(arquivo)) return null;
    const caminho = `${perfil}/${arquivo}`;
    if (!falasProntas.has(caminho)) {
      const r = await ler(new URL(`./falas/${caminho}`, import.meta.url));
      if (!r.ok) return null;
      const bytes = await r.arrayBuffer();
      if (!bytes.byteLength || bytes.byteLength % 4 || bytes.byteLength > 4 * 1024 * 1024) throw new Error("Arquivo de fala preparada inválido.");
      const samples = new Float32Array(bytes);
      if (!samples.every(Number.isFinite)) throw new Error("A fala preparada contém áudio inválido.");
      falasProntas.set(caminho, samples);
    }
    return { samples: falasProntas.get(caminho).slice(), sampleRate: 24000, cache: true };
  }
  function rejeitarTodos(mensagem) {
    for (const pedido of pendentes.values()) { clearTimeout(pedido.prazo); pedido.reject(new Error(mensagem)); }
    pendentes.clear(); carregamento = undefined;
  }
  function enviar(tipo, dados = {}) {
    if (!worker) {
      worker = new WorkerLocal(new URL("./worker.js", import.meta.url), { type: "module" });
      const iniciado = worker;
      worker.onmessage = ({ data }) => {
        const pedido = pendentes.get(data.id);
        if (!pedido) return;
        pendentes.delete(data.id);
        clearTimeout(pedido.prazo);
        if (data.tipo === "erro") pedido.reject(new Error(data.mensagem));
        else pedido.resolve(data);
      };
      worker.onerror = () => { if (worker !== iniciado) return; worker.terminate(); worker = undefined; rejeitarTodos("A voz neural não pôde iniciar. Recarregue a extensão e confira a pasta vozes."); };
      worker.postMessage({ tipo: "cancelar", geracao });
    }
    const id = ++contador;
    return new Promise((resolve, reject) => {
      const prazo = setTimeout(() => { pendentes.delete(id); reject(new Error("A geração da voz demorou demais. Use Parar voz e tente uma mensagem menor.")); }, 120000);
      pendentes.set(id, { resolve, reject, tipo, prazo });
      try { worker.postMessage({ tipo, id, geracao, ...dados }); }
      catch (erro) { clearTimeout(prazo); pendentes.delete(id); reject(erro); }
    });
  }
  return {
    carregar() { carregamento ??= procurarFala("Oi", "pf_dora"); return carregamento; },
    async sintetizar(texto, perfil) {
      const token = geracao, pronta = await procurarFala(texto, perfil);
      if (token !== geracao) throw new DOMException("Voz cancelada.", "AbortError");
      return pronta ?? enviar("sintetizar", { texto, perfil });
    },
    preparar(texto, perfil) {
      const chave = `${perfil}\0${texto}`;
      if (!preparados.has(chave)) preparados.set(chave, procurarFala(texto, perfil).then((pronta) => pronta ?? enviar("preparar", { texto, perfil })).catch((erro) => { preparados.delete(chave); throw erro; }));
      if (preparados.size > 80) preparados.delete(preparados.keys().next().value);
      return preparados.get(chave);
    },
    cancelar() {
      geracao++;
      worker?.postMessage({ tipo: "cancelar", geracao });
      for (const [id, pedido] of pendentes) if (pedido.tipo === "sintetizar") {
        clearTimeout(pedido.prazo); pedido.reject(new DOMException("Voz cancelada.", "AbortError")); pendentes.delete(id);
      }
    },
    destruir() { worker?.terminate(); worker = undefined; rejeitarTodos("Voz encerrada."); },
  };
}
