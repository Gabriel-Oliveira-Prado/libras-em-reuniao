import { criarRegistro, validarBackup, MAX_SINAIS_PESSOAIS } from "./dicionario-pessoal.mjs";

// IndexedDB mantém nomes e pontos de movimento no perfil local, sem permissão
// adicional da extensão. Nenhum vídeo, áudio ou sinal pessoal é enviado à rede.
export function criarArmazenamento(indexado = globalThis.indexedDB) {
  let banco;
  function abrir() {
    banco ??= new Promise((resolve, reject) => {
      if (!indexado) { reject(new Error("O navegador bloqueou o armazenamento dos sinais pessoais.")); return; }
      const pedido = indexado.open("libras-sinais-pessoais", 1);
      let bloqueado = false;
      pedido.onupgradeneeded = () => pedido.result.createObjectStore("sinais", { keyPath: "id" });
      pedido.onsuccess = () => {
        const db = pedido.result;
        if (bloqueado) { db.close(); return; }
        db.onversionchange = () => { db.close(); banco = undefined; };
        resolve(db);
      };
      pedido.onerror = () => { banco = undefined; reject(pedido.error); };
      pedido.onblocked = () => { bloqueado = true; banco = undefined; reject(new Error("Feche outra aba antiga do tradutor e tente novamente.")); };
    });
    return banco;
  }
  async function escrever(acao) {
    const db = await abrir();
    return new Promise((resolve, reject) => {
      const tx = db.transaction("sinais", "readwrite");
      let falha;
      const abortar = (erro) => { falha = erro; tx.abort(); };
      tx.oncomplete = () => resolve();
      tx.onerror = tx.onabort = () => reject(falha ?? tx.error ?? new Error("Não foi possível salvar os sinais."));
      try { acao(tx.objectStore("sinais"), abortar); } catch (erro) { abortar(erro); }
    });
  }
  return {
    async listar() {
      const db = await abrir();
      return new Promise((resolve, reject) => {
        const pedido = db.transaction("sinais", "readonly").objectStore("sinais").getAll();
        pedido.onsuccess = () => resolve(pedido.result);
        pedido.onerror = () => reject(pedido.error);
      });
    },
    salvar: (registro) => escrever((loja, abortar) => {
      const pedido = loja.getAll();
      pedido.onsuccess = () => {
        try {
          const existentes = pedido.result;
          if (!existentes.some((r) => r.id === registro.id) && existentes.length >= MAX_SINAIS_PESSOAIS) throw new Error(`O limite é de ${MAX_SINAIS_PESSOAIS} sinais pessoais.`);
          loja.put(criarRegistro(registro, existentes));
        } catch (erro) { abortar(erro); }
      };
    }),
    excluir: (id) => escrever((loja) => loja.delete(id)),
    importar: (registros) => escrever((loja, abortar) => {
      const pedido = loja.getAll();
      pedido.onsuccess = () => {
        try { for (const registro of validarBackup({ schema: 1, sinais: registros }, pedido.result)) loja.put(registro); }
        catch (erro) { abortar(erro); }
      };
    }),
  };
}
