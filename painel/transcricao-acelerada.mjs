const API = "http://127.0.0.1:18271";
export function criarTranscricaoAcelerada(fetchImpl = globalThis.fetch) {
  let encerrado = false;
  const consultas = new Set();
  const cliente = {
    onmessage: undefined, onerror: undefined,
    terminate() { encerrado = true; for (const c of consultas) c.abort(); consultas.clear(); },
    postMessage(data) {
      if (encerrado) return;
      const c = new AbortController(); consultas.add(c);
      const prazo = setTimeout(() => c.abort(), 45000);
      (async () => {
        try {
          const modelo = ["base", "tiny", "small"].includes(data.modelo) ? data.modelo : "base";
          const carregar = data.tipo === "carregar";
          const r = await fetchImpl(API + (carregar ? "/load" : "/transcribe") + "?modelo=" + modelo, {
            method: "POST", headers: { "Content-Type": "application/octet-stream" },
            body: carregar ? new Uint8Array(0) : data.amostras,
            signal: c.signal, credentials: "omit", redirect: "error", cache: "no-store",
          });
          if (!r.ok) throw new Error("Serviço local HTTP " + r.status);
          const resultado = await r.json();
          if (encerrado) return;
          if (carregar) {
            if (!resultado.carregado) throw new Error("Modelo não carregou");
            cliente.onmessage?.({ data: { tipo: "carregado" } });
          } else {
            if (typeof resultado.texto !== "string" || resultado.texto.length > 2000) throw new Error("Transcrição inválida");
            cliente.onmessage?.({ data: { tipo: "texto", id: data.id, texto: resultado.texto, inferenciaMs: resultado.inferenciaMs } });
          }
        } catch (erro) {
          if (!encerrado) cliente.onmessage?.({ data: { tipo: "erro", id: data.id, erro: "A transcrição acelerada não respondeu. Inicie o serviço local, confira o ID da extensão ou escolha Navegador. " + erro.message } });
        } finally { clearTimeout(prazo); consultas.delete(c); }
      })();
    },
  };
  return cliente;
}
