export const URL_BIBLIOTECA_VLIBRAS = "https://dicionario2.vlibras.gov.br/signs?version=2018.3.1";
export const VERSAO_BIBLIOTECA_VLIBRAS = "2018.3.1";
export const LIMITE_RESPOSTA = 5 * 1024 * 1024;
const MAX_ENTRADAS = 50_000;
const MAX_NOS = 1_000_000;
// A API atual contém glosas de até 105 caracteres, inclusive termos compostos.
const MAX_PROFUNDIDADE = 128;
const TAMANHO_PAGINA = 24;
const COMUNS = ["OI", "OLÁ", "BOM_DIA", "BOA_TARDE", "BOA_NOITE", "TUDO_BEM",
  "COMO", "VOCÊ", "NOME", "CONHECER", "OBRIGADO", "POR_FAVOR", "DESCULPA",
  "SIM", "NÃO", "AJUDAR", "PESSOA", "REUNIÃO", "MICROFONE", "CÂMERA"];
const indices = new WeakMap();
const comparar = new Intl.Collator("pt-BR", { sensitivity: "base", numeric: true }).compare;

export function validarGlosa(glosa) {
  return typeof glosa === "string" && glosa.length > 0 && glosa.length <= 128 &&
    /^[\p{L}\p{M}\p{N}_&()+\-\[\]{}%$]+$/u.test(glosa);
}

export function normalizarBusca(texto) {
  return String(texto ?? "").normalize("NFD").replace(/\p{M}/gu, "")
    .toLocaleLowerCase("pt-BR").replace(/[_&()+\-\[\]{}]+/g, " ")
    .replace(/\s+/g, " ").trim();
}

export function rotuloDaGlosa(glosa) {
  const texto = glosa.normalize("NFC").replace(/_/g, " ").replace(/&/g, " · ")
    .toLocaleLowerCase("pt-BR");
  return texto.charAt(0).toLocaleUpperCase("pt-BR") + texto.slice(1);
}

function validarLista(lista) {
  if (!Array.isArray(lista) || lista.length === 0 || lista.length > MAX_ENTRADAS)
    throw new Error("Lista de sinais inválida.");
  const unicos = new Set();
  for (const glosa of lista) {
    if (!validarGlosa(glosa)) throw new Error("A biblioteca contém uma glosa inválida.");
    unicos.add(glosa);
  }
  return [...unicos];
}

// Aceita o snapshot, listas simples e a trie publicada pelo VLibras.
// Usa pilha explícita para não estourar a pilha de chamadas em dados externos.
export function extrairGlosas(dados) {
  if (Array.isArray(dados)) return validarLista(dados);
  if (!dados || typeof dados !== "object") throw new Error("Biblioteca inválida.");
  if (Array.isArray(dados.sinais)) return validarLista(dados.sinais);
  if (!dados.root || typeof dados.root !== "object") throw new Error("Trie inválida.");
  const pilha = [{ no: dados.root, prefixo: "", profundidade: 0 }];
  const vistos = new WeakSet();
  const lista = [];
  let quantidade = 0;
  while (pilha.length) {
    const { no, prefixo, profundidade } = pilha.pop();
    if (++quantidade > MAX_NOS || profundidade > MAX_PROFUNDIDADE ||
        !no || typeof no !== "object" || Array.isArray(no) || vistos.has(no) ||
        typeof no.end !== "boolean" || !no.children ||
        typeof no.children !== "object" || Array.isArray(no.children)) {
      throw new Error("Estrutura da biblioteca inválida.");
    }
    vistos.add(no);
    if (no.end) {
      if (!validarGlosa(prefixo) || lista.length >= MAX_ENTRADAS)
        throw new Error("Limite ou glosa da biblioteca inválida.");
      lista.push(prefixo);
    }
    for (const [caractere, filho] of Object.entries(no.children)) {
      if ([...caractere].length !== 1 || !validarGlosa(caractere))
        throw new Error("Caractere da biblioteca inválido.");
      pilha.push({ no: filho, prefixo: prefixo + caractere, profundidade: profundidade + 1 });
    }
  }
  return validarLista(lista);
}

export function validarCatalogo(dados) {
  if (dados && !Array.isArray(dados) && Array.isArray(dados.sinais)) {
    if (dados.origem !== undefined && dados.origem !== URL_BIBLIOTECA_VLIBRAS)
      throw new Error("Origem da biblioteca inválida.");
    if (dados.versao !== undefined && dados.versao !== VERSAO_BIBLIOTECA_VLIBRAS)
      throw new Error("Versão da biblioteca inválida.");
    if (dados.total !== undefined && dados.total !== dados.sinais.length)
      throw new Error("Quantidade da biblioteca inválida.");
    if (dados.sha256_resposta !== undefined && !/^[a-f0-9]{64}$/.test(dados.sha256_resposta))
      throw new Error("Identificador da biblioteca inválido.");
  }
  return extrairGlosas(dados);
}

function indiceDe(sinais) {
  let indice = indices.get(sinais);
  if (!indice) {
    indice = sinais.map(glosa => ({ glosa, rotulo: rotuloDaGlosa(glosa),
      busca: normalizarBusca(glosa) })).sort((a, b) => comparar(a.rotulo, b.rotulo));
    indices.set(sinais, indice);
  }
  return indice;
}

export function buscarSinais(sinais, consulta = "", { limite = TAMANHO_PAGINA, deslocamento = 0 } = {}) {
  const busca = normalizarBusca(consulta).slice(0, 128);
  let resultados = indiceDe(sinais);
  if (busca) {
    resultados = resultados.filter(item => item.busca.includes(busca)).map(item => ({
      ...item, ordem: item.busca === busca ? 0 : item.busca.startsWith(busca) ? 1 : 2
    })).sort((a, b) => a.ordem - b.ordem || comparar(a.rotulo, b.rotulo));
  } else {
    const prioridades = new Map(COMUNS.map((glosa, i) => [glosa, i]));
    resultados = [...resultados].sort((a, b) =>
      (prioridades.get(a.glosa) ?? COMUNS.length) - (prioridades.get(b.glosa) ?? COMUNS.length) ||
      comparar(a.rotulo, b.rotulo));
  }
  const inicio = Math.max(0, Math.floor(Number(deslocamento) || 0));
  const tamanho = Math.min(100, Math.max(1, Math.floor(Number(limite) || TAMANHO_PAGINA)));
  return { itens: resultados.slice(inicio, inicio + tamanho).map(({ glosa, rotulo }) => ({ glosa, rotulo })),
    total: resultados.length, haMais: inicio + tamanho < resultados.length };
}

export async function lerRespostaCatalogo(resposta) {
  if (!resposta.ok) throw new Error("Biblioteca indisponível.");
  const tipo = resposta.headers?.get("content-type") ?? "";
  if (tipo && !/^application\/(?:[\w.+-]+\+)?json(?:\s*;|$)/i.test(tipo))
    throw new Error("O serviço não retornou JSON.");
  const comprimento = Number(resposta.headers?.get("content-length"));
  if (Number.isFinite(comprimento) && comprimento > LIMITE_RESPOSTA)
    throw new Error("Biblioteca maior que o limite.");
  let texto;
  if (resposta.body?.getReader) {
    const leitor = resposta.body.getReader();
    const decoder = new TextDecoder();
    let bytes = 0;
    const partes = [];
    try {
      for (;;) {
        const { value, done } = await leitor.read();
        if (done) break;
        bytes += value.byteLength;
        if (bytes > LIMITE_RESPOSTA) {
          await leitor.cancel();
          throw new Error("Biblioteca maior que o limite.");
        }
        partes.push(decoder.decode(value, { stream: true }));
      }
      partes.push(decoder.decode());
      texto = partes.join("");
    } finally { leitor.releaseLock?.(); }
  } else {
    texto = await resposta.text();
    if (new TextEncoder().encode(texto).byteLength > LIMITE_RESPOSTA)
      throw new Error("Biblioteca maior que o limite.");
  }
  const dados = JSON.parse(texto);
  return { sinais: validarCatalogo(dados), texto };
}

export async function baixarBiblioteca({ signal, fetchImpl = globalThis.fetch } = {}) {
  const resposta = await fetchImpl(URL_BIBLIOTECA_VLIBRAS, {
    signal, credentials: "omit", redirect: "follow", cache: "no-store"
  });
  if (resposta.url) {
    const final = new URL(resposta.url);
    if (final.origin !== new URL(URL_BIBLIOTECA_VLIBRAS).origin ||
        !["/signs", "/static/TREES/2018.3.1.json"].includes(final.pathname))
      throw new Error("Redirecionamento da biblioteca inválido.");
  }
  return lerRespostaCatalogo(resposta);
}

export function montarBiblioteca({ aoMostrar } = {}) {
  const detalhes = document.querySelector("#biblioteca-libras");
  const campo = document.querySelector("#buscar-sinal");
  const lista = document.querySelector("#lista-biblioteca");
  const estado = document.querySelector("#estado-biblioteca");
  const mais = document.querySelector("#mais-biblioteca");
  const atualizar = document.querySelector("#atualizar-biblioteca");
  if (![detalhes, campo, lista, estado, mais, atualizar].every(Boolean))
    return { destruir() {} };
  let sinais;
  let exibidos = TAMANHO_PAGINA;
  let controlador;
  let temporizador;
  let geracao = 0;
  let destruido = false;
  let selecao = 0;

  function statusBase() {
    return new Intl.NumberFormat("pt-BR").format(sinais.length) +
      " entradas do VLibras. Biblioteca para o avatar; a câmera tem seu próprio vocabulário.";
  }
  function renderizar() {
    if (!sinais || destruido) return;
    const resultado = buscarSinais(sinais, campo.value, { limite: TAMANHO_PAGINA,
      deslocamento: Math.max(0, exibidos - TAMANHO_PAGINA) });
    if (exibidos === TAMANHO_PAGINA) lista.replaceChildren();
    for (const item of resultado.itens) {
      const li = document.createElement("li");
      const nome = document.createElement("span");
      const botao = document.createElement("button");
      nome.textContent = item.rotulo;
      botao.type = "button";
      botao.textContent = "Ver sinal";
      botao.setAttribute("aria-label", "Ver sinal: " + item.rotulo);
      botao.addEventListener("click", async () => {
        if (destruido || typeof aoMostrar !== "function") return;
        const atual = ++selecao;
        botao.disabled = true;
        estado.textContent = "Sinal selecionado: " + item.rotulo + ".";
        try {
          const aceito = await aoMostrar(item.glosa, item.rotulo);
          if (aceito === false && !destruido && atual === selecao)
            estado.textContent = "O avatar está ocupado ou indisponível. Aguarde e tente mostrar o sinal novamente.";
        }
        catch {
          if (!destruido && atual === selecao)
            estado.textContent = "Não foi possível mostrar este sinal. Tente novamente.";
        } finally { if (!destruido) botao.disabled = false; }
      });
      li.append(nome, botao);
      lista.append(li);
    }
    mais.hidden = !resultado.haMais;
    mais.disabled = false;
    estado.textContent = statusBase() + (normalizarBusca(campo.value) ?
      " " + resultado.total.toLocaleString("pt-BR") + " resultado(s)." : "");
  }
  async function carregar(remoto) {
    controlador?.abort();
    clearTimeout(temporizador);
    const atual = ++geracao;
    const controle = new AbortController();
    controlador = controle;
    const tempo = setTimeout(() => controle.abort(), 20_000);
    temporizador = tempo;
    atualizar.disabled = true;
    estado.textContent = remoto ? "Atualizando a biblioteca do VLibras…" : "Abrindo a biblioteca…";
    try {
      const resultado = remoto ? await baixarBiblioteca({ signal: controle.signal }) :
        await lerRespostaCatalogo(await fetch(new URL("../modelos/biblioteca-vlibras.json", import.meta.url),
          { signal: controle.signal, credentials: "omit" }));
      if (destruido || atual !== geracao || controle.signal.aborted) return;
      sinais = resultado.sinais;
      exibidos = TAMANHO_PAGINA;
      renderizar();
    } catch {
      if (destruido || atual !== geracao) return;
      if (sinais) {
        exibidos = TAMANHO_PAGINA;
        renderizar();
        estado.textContent = "Não foi possível atualizar. A biblioteca anterior continua disponível. " + statusBase();
      } else estado.textContent = "Não foi possível abrir a biblioteca. Clique em Atualizar biblioteca para tentar novamente.";
    } finally {
      clearTimeout(tempo);
      if (!destruido && atual === geracao) {
        controlador = undefined;
        atualizar.disabled = false;
      }
    }
  }
  const abrir = () => { if (detalhes.open && !sinais && !controlador) void carregar(false); };
  const pesquisar = () => { exibidos = TAMANHO_PAGINA; renderizar(); };
  const proximaPagina = () => { exibidos += TAMANHO_PAGINA; renderizar(); };
  const recarregar = () => { if (!destruido) void carregar(true); };
  detalhes.addEventListener("toggle", abrir);
  campo.addEventListener("input", pesquisar);
  mais.addEventListener("click", proximaPagina);
  atualizar.addEventListener("click", recarregar);
  mais.hidden = true;
  abrir();
  return { destruir() {
    destruido = true;
    ++geracao;
    ++selecao;
    controlador?.abort();
    clearTimeout(temporizador);
    detalhes.removeEventListener("toggle", abrir);
    campo.removeEventListener("input", pesquisar);
    mais.removeEventListener("click", proximaPagina);
    atualizar.removeEventListener("click", recarregar);
  } };
}
