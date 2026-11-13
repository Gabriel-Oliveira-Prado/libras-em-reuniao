const TRADUCAO = "https://traducao2.vlibras.gov.br/translate";
const AVATAR = new URL("https://vlibras.gov.br/app/unity/index.html?v=7.12.2");
const DICIONARIO = "https://dicionario2.vlibras.gov.br/2018.3.1/WEBGL/";

async function obterGlosa(texto, signal) {
  const resposta = await fetch(TRADUCAO, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: texto }), signal,
  });
  if (!resposta.ok) throw new Error(`VLibras HTTP ${resposta.status}`);
  const corpo = (await resposta.text()).trim();
  let glosa = corpo;
  if (corpo.startsWith("{")) glosa = JSON.parse(corpo).traducao;
  if (typeof glosa !== "string" || !glosa.trim() || glosa.startsWith("<")) throw new Error("Tradução inválida.");
  return glosa.trim();
}

export function montarVLibras() {
  const area = document.querySelector("#avatar");
  const estado = document.querySelector("#estado-vlibras");
  const detalhes = document.querySelector("#glosa");
  const textoGlosa = document.querySelector("#texto-glosa");
  const traduzir = document.querySelector("#traduzir");
  const repetir = document.querySelector("#repetir");
  const tentar = document.querySelector("#tentar-avatar");
  const texto = document.querySelector("#texto-fala");
  let quadro, pronta = false, ultimaGlosa, consulta, espera, prazoReproducao, atual;
  let geracao = 0;
  const fila = [];
  const cacheGlosas = new Map();

  function comando(method, params) {
    quadro?.contentWindow?.postMessage({ type: "unity", object: "PlayerManager", method, params }, AVATAR.origin);
  }

  function informarEspera() {
    const falhou = fila.some((item) => item.erro);
    tentar.hidden = !falhou;
    estado.textContent = falhou
      ? "O VLibras não respondeu a um trecho. Use Tentar novamente para retomar a fila."
      : fila.length ? "Preparando os próximos trechos em Libras…" : "Intérprete pronto para a próxima fala.";
  }

  function reproduzirProximo() {
    if (!pronta || atual || !fila[0]?.glosa) return;
    atual = fila.shift();
    atual.iniciou = false;
    atual.comandoEm = performance.now();
    ultimaGlosa = atual.glosa;
    textoGlosa.textContent = ultimaGlosa;
    detalhes.hidden = false;
    repetir.disabled = false;
    comando("playNow", atual.glosa);
    estado.textContent = "Preparando o próximo trecho em Libras…";
    prazoReproducao = setTimeout(() => {
      if (!atual) return;
      estado.textContent = "O avatar não confirmou o fim do trecho. Use Tentar novamente para retomar.";
      tentar.hidden = false;
    }, 90000);
  }

  async function traduzirProximo() {
    if (consulta || fila.some((item) => item.erro)) return;
    const item = fila.find((pendente) => !pendente.glosa);
    if (!item) return;
    const token = geracao;
    const controlador = new AbortController();
    consulta = controlador;
    const prazo = setTimeout(() => controlador.abort(), 15000);
    if (!atual) estado.textContent = "Traduzindo sua fala para Libras…";
    try {
      const antes = performance.now();
      item.glosa = cacheGlosas.get(item.texto) ?? await obterGlosa(item.texto, controlador.signal);
      if (token !== geracao) return;
      item.traducaoMs = performance.now() - antes;
      cacheGlosas.set(item.texto, item.glosa);
      if (cacheGlosas.size > 100) cacheGlosas.delete(cacheGlosas.keys().next().value);
      reproduzirProximo();
    } catch (erro) {
      if (token !== geracao) return;
      item.erro = true;
      estado.textContent = "O VLibras não respondeu. O trecho ficou na fila; use Tentar novamente.";
      tentar.hidden = false;
      console.warn("Tradução VLibras:", erro?.message);
    } finally {
      clearTimeout(prazo);
      if (consulta === controlador) {
        consulta = undefined;
        if (token === geracao) traduzirProximo();
      }
    }
  }

  function abrirAvatar() {
    if (quadro) return;
    estado.textContent = "Carregando o intérprete de Libras…";
    quadro = document.createElement("iframe");
    quadro.title = "Avatar do VLibras";
    quadro.sandbox = "allow-scripts allow-same-origin allow-pointer-lock";
    quadro.referrerPolicy = "no-referrer";
    quadro.src = AVATAR.href;
    area.append(quadro);
    espera = setTimeout(() => {
      if (pronta) return;
      quadro?.remove();
      quadro = undefined;
      estado.textContent = "O avatar não carregou. Confira a conexão e clique em Tentar novamente.";
      tentar.hidden = false;
    }, 60000);
  }

  function adicionar(frase) {
    const limpa = frase.trim();
    if (!limpa) return true;
    if (fila.length >= 12) {
      estado.textContent = "O avatar está com muitos trechos pendentes. Aguarde terminar antes de continuar.";
      return false;
    }
    fila.push({ texto: limpa, recebidaEm: performance.now() });
    abrirAvatar();
    traduzirProximo();
    return true;
  }

  window.addEventListener("message", ({ source, origin, data }) => {
    if (origin !== AVATAR.origin || source !== quadro?.contentWindow || data?.type !== "unity_event") return;
    if (data.event === "on_load_player") {
      clearTimeout(espera);
      pronta = true;
      comando("setBaseUrl", DICIONARIO);
      comando("setSubtitlesState", 1);
      informarEspera();
      reproduzirProximo();
    }
    if (data.event === "update_progress" && !pronta && Number.isFinite(data.data)) {
      estado.textContent = `Carregando o intérprete… ${Math.round(data.data * 100)}%`;
    }
    if (data.event === "on_error") {
      pronta = false;
      clearTimeout(espera);
      estado.textContent = "O avatar não pôde iniciar neste navegador. Use uma aba do Chrome com WebGL ativado.";
      tentar.hidden = false;
    }
    if (data.event !== "on_playing_state_change" || !atual || !Array.isArray(data.data) || data.data.length < 3) return;
    const valor = (v) => v === true || String(v).toLowerCase() === "true";
    // O Unity envia: playing, paused, intervalAnimation, loading, repeatable.
    // O adaptador antigo do VLibras reduzia isso a três flags; o iframe atual não.
    const flags = data.data.map(valor);
    const [tocando, pausado] = flags;
    const carregando = flags.length >= 4 ? flags[3] : flags[2];
    if (tocando && !carregando) {
      if (!atual.iniciou && atual.recebidaEm !== undefined) {
        console.debug("Tempos do VLibras (ms):", {
          traducao: Math.round(atual.traducaoMs ?? 0),
          textoAteComando: Math.round(atual.comandoEm - atual.recebidaEm),
          comandoAteAnimacao: Math.round(performance.now() - atual.comandoEm),
        });
      }
      atual.iniciou = true;
      estado.textContent = fila.length ? `Sinalizando. ${fila.length} trecho(s) na fila.` : "Avatar sinalizando em Libras.";
    } else if (!tocando && !pausado && !carregando && atual.iniciou) {
      clearTimeout(prazoReproducao);
      atual = undefined;
      informarEspera();
      reproduzirProximo();
    }
  });

  function parar() {
    geracao += 1;
    consulta?.abort();
    consulta = undefined;
    fila.length = 0;
    atual = undefined;
    ultimaGlosa = undefined;
    clearTimeout(prazoReproducao);
    if (pronta) comando("stopAll");
    detalhes.hidden = true;
    repetir.disabled = true;
    if (pronta) informarEspera();
  }

  traduzir.addEventListener("click", () => {
    const frase = texto.value.trim();
    if (!frase) {
      estado.textContent = "Fale ou digite uma mensagem primeiro.";
      return;
    }
    parar();
    adicionar(frase);
  });
  repetir.addEventListener("click", () => {
    if (!ultimaGlosa || fila.length >= 12) return;
    fila.push({ glosa: ultimaGlosa });
    reproduzirProximo();
  });
  tentar.addEventListener("click", () => {
    tentar.hidden = true;
    if (atual) {
      fila.unshift({ glosa: atual.glosa });
      atual = undefined;
    }
    clearTimeout(prazoReproducao);
    clearTimeout(espera);
    quadro?.remove();
    quadro = undefined;
    pronta = false;
    for (const item of fila) item.erro = false;
    abrirAvatar();
    traduzirProximo();
  });
  document.querySelector("#limpar-fala").addEventListener("click", () => {
    texto.value = "";
    parar();
  });

  return { adicionar, abrir: abrirAvatar, parar, destruir() {
    parar();
    clearTimeout(espera);
    quadro?.remove();
    quadro = undefined;
    pronta = false;
  } };
}
