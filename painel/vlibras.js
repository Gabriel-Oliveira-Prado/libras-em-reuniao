import { glosaValida } from "../meet/protocolo.mjs";

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

export function montarVLibras({ remoto } = {}) {
  const area = document.querySelector("#avatar");
  const estado = document.querySelector("#estado-vlibras");
  const detalhes = document.querySelector("#glosa");
  const textoGlosa = document.querySelector("#texto-glosa");
  const trecho = document.querySelector("#trecho-avatar");
  const traduzir = document.querySelector("#traduzir");
  const repetir = document.querySelector("#repetir");
  const tentar = document.querySelector("#tentar-avatar");
  const testar = document.querySelector("#testar-avatar");
  const texto = document.querySelector("#texto-fala");
  const pausar = document.querySelector("#pausar-avatar");
  const velocidade = document.querySelector("#velocidade-avatar");
  let quadro, pronta = false, ultimaGlosa, ultimoTexto, consulta, espera, inicializacao, prazoReproducao, atual;
  let emPausa = false;
  let geracao = 0;
  const fila = [];
  const cacheGlosas = new Map();

  function vigiarReproducao() {
    clearTimeout(prazoReproducao);
    if (!atual || emPausa) return;
    prazoReproducao = setTimeout(() => {
      if (!atual) return;
      estado.textContent = atual.iniciou
        ? "O avatar parou de confirmar a sinalização. Use Tentar novamente; o trecho foi mantido."
        : "A tradução está pronta, mas o avatar não iniciou os sinais. Confira a conexão e use Tentar novamente; o trecho foi mantido.";
      atual.travou = true;
      tentar.hidden = false;
    }, atual.iniciou ? Math.max(90000, atual.glosa.split(/\s+/).length * 5000) : 15000);
  }
  function mudarPausa(pausa) {
    emPausa = pausa;
    pausar.textContent = emPausa ? "Retomar avatar" : "Pausar avatar";
    pausar.setAttribute("aria-pressed", String(emPausa));
    vigiarReproducao();
  }

  function comando(method, params) {
    quadro?.contentWindow?.postMessage({ type: "unity", object: "PlayerManager", method, params }, AVATAR.origin);
  }

  function informarEspera() {
    const falhou = fila.some((item) => item.erro) || atual?.travou;
    tentar.hidden = !falhou;
    estado.textContent = falhou
      ? "O VLibras não respondeu a um trecho. Use Tentar novamente para retomar a fila."
      : fila.length ? "Preparando os próximos trechos em Libras…" : "Intérprete pronto para a próxima fala.";
  }

  function confirmarInicio() {
    if (!atual || emPausa) return;
    if (!atual.iniciou) {
      if (atual.recebidaEm !== undefined) console.debug("Tempos do VLibras (ms):", {
        traducao: Math.round(atual.traducaoMs ?? 0),
        textoAteComando: Math.round(atual.comandoEm - atual.recebidaEm),
        comandoAteAnimacao: Math.round(performance.now() - atual.comandoEm),
      });
      atual.iniciou = true;
      vigiarReproducao();
    }
    atual.travou = false;
    tentar.hidden = !fila.some((item) => item.erro);
    estado.textContent = fila.length ? `Sinalizando. ${fila.length} trecho(s) na fila.` : "Avatar sinalizando em Libras.";
  }

  function reproduzirProximo() {
    if (!pronta || emPausa || atual || !fila[0]?.glosa) return;
    atual = fila.shift();
    atual.iniciou = false;
    atual.travou = false;
    atual.comandoEm = performance.now();
    ultimaGlosa = atual.glosa;
    ultimoTexto = atual.texto;
    if (trecho) { trecho.textContent = atual.texto ? `Trecho do avatar: ${atual.texto}` : ""; trecho.hidden = !atual.texto; }
    textoGlosa.textContent = ultimaGlosa;
    detalhes.hidden = false;
    repetir.disabled = false;
    comando("playNow", atual.glosa);
    estado.textContent = "Preparando o próximo trecho em Libras…";
    vigiarReproducao();
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
    if (remoto?.ativa()) return;
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
    if (remoto?.ativa()) return remoto.adicionar(limpa);
    if (fila.length >= 12) {
      estado.textContent = "O avatar está com muitos trechos pendentes. Aguarde terminar antes de continuar.";
      return false;
    }
    fila.push({ texto: limpa, recebidaEm: performance.now() });
    abrirAvatar();
    traduzirProximo();
    return true;
  }

  function mostrarSinal(glosa, rotulo = glosa) {
    if (!glosaValida(glosa) || typeof rotulo !== "string" || rotulo.length > 160) return false;
    if (remoto?.ativa()) return remoto.mostrarSinal(glosa, rotulo);
    if (fila.length >= 12) return false;
    fila.push({ glosa, texto: rotulo });
    abrirAvatar();
    reproduzirProximo();
    return true;
  }

  const receberEvento = ({ source, origin, data }) => {
    if (origin !== AVATAR.origin || source !== quadro?.contentWindow || data?.type !== "unity_event") return;
    if (data.event === "on_load_player") {
      clearTimeout(espera);
      clearTimeout(inicializacao);
      comando("setBaseUrl", DICIONARIO);
      comando("setSubtitlesState", 1);
      comando("setSlider", Number(velocidade.value) || 1);
      estado.textContent = "Preparando o personagem do intérprete…";
      // O widget oficial 7.12.2 escolhe o avatar 500 ms após on_load_player.
      // Sem Change, a cena pode existir sem um personagem pronto para playNow.
      inicializacao = setTimeout(() => {
        comando("Change", "icaro");
        comando("setPauseState", 0);
        pronta = true;
        pausar.disabled = false;
        mudarPausa(false);
        informarEspera();
        reproduzirProximo();
      }, 500);
    }
    if (data.event === "update_progress" && !pronta && Number.isFinite(data.data)) {
      estado.textContent = `Carregando o intérprete… ${Math.round(data.data * 100)}%`;
    }
    if (data.event === "on_error") {
      pronta = false;
      pausar.disabled = true;
      clearTimeout(espera);
      clearTimeout(inicializacao);
      estado.textContent = "O avatar não pôde iniciar neste navegador. Use uma aba do Chrome com WebGL ativado.";
      tentar.hidden = false;
    }
    if (data.event === "counter_gloss" && atual && Array.isArray(data.data)) {
      const [contagem, total] = data.data.map(Number);
      if (Number.isFinite(contagem) && Number.isFinite(total) && contagem > 0 && total >= contagem) {
        confirmarInicio();
        vigiarReproducao();
      }
      return;
    }
    if (data.event !== "on_playing_state_change" || !atual || !Array.isArray(data.data) || data.data.length < 3) return;
    const valor = (v) => v === true || v === 1 || String(v).toLowerCase() === "true";
    // O Unity envia: playing, paused, intervalAnimation, loading, repeatable.
    // O adaptador antigo do VLibras reduzia isso a três flags; o iframe atual não.
    const flags = data.data.map(valor);
    const [tocando, pausado] = flags;
    const carregando = flags.length >= 4 ? flags[3] : flags[2];
    if (pausado !== emPausa) mudarPausa(pausado);
    const intervalo = flags.length >= 4 && flags[2];
    // O player oficial aceita playing mesmo enquanto carrega o próximo sinal.
    if (tocando && !pausado && !intervalo) {
      confirmarInicio();
    } else if (!tocando && !pausado && !carregando && atual.iniciou) {
      clearTimeout(prazoReproducao);
      atual = undefined;
      informarEspera();
      reproduzirProximo();
    } else if (carregando && !atual.iniciou && !atual.travou) {
      estado.textContent = "Carregando os sinais da sua frase…";
    }
  };
  window.addEventListener("message", receberEvento);

  function parar() {
    remoto?.pararAvatar();
    geracao += 1;
    consulta?.abort();
    consulta = undefined;
    fila.length = 0;
    atual = undefined;
    mudarPausa(false);
    ultimaGlosa = undefined;
    ultimoTexto = undefined;
    if (trecho) { trecho.textContent = ""; trecho.hidden = true; }
    clearTimeout(prazoReproducao);
    if (pronta) { comando("stopAll"); comando("setPauseState", 0); }
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
    fila.push({ glosa: ultimaGlosa, texto: ultimoTexto });
    reproduzirProximo();
  });
  testar?.addEventListener("click", () => {
    parar();
    adicionar("Tudo bem?");
  });
  tentar.addEventListener("click", () => {
    tentar.hidden = true;
    // Erro de tradução não exige baixar/iniciar novamente o Unity nem
    // interromper o trecho que já está sendo sinalizado.
    if (pronta && !atual?.travou && fila.some((item) => item.erro)) {
      for (const item of fila) item.erro = false;
      traduzirProximo();
      return;
    }
    if (atual) {
      fila.unshift({ glosa: atual.glosa, texto: atual.texto });
      atual = undefined;
    }
    clearTimeout(prazoReproducao);
    clearTimeout(espera);
    clearTimeout(inicializacao);
    quadro?.remove();
    quadro = undefined;
    pronta = false;
    pausar.disabled = true;
    for (const item of fila) item.erro = false;
    abrirAvatar();
    traduzirProximo();
  });
  pausar.addEventListener("click", () => {
    if (!pronta) return;
    mudarPausa(!emPausa);
    comando("setPauseState", emPausa ? 1 : 0);
    if (emPausa) estado.textContent = "Avatar pausado. Retome para continuar os trechos na fila.";
    else { reproduzirProximo(); if (atual) estado.textContent = "Retomando a sinalização…"; else informarEspera(); }
  });
  velocidade.addEventListener("change", () => {
    const valor = Number(velocidade.value);
    if (![0.5, 1, 1.5, 2].includes(valor)) return;
    if (pronta) comando("setSlider", valor);
  });
  document.querySelector("#limpar-fala").addEventListener("click", () => {
    texto.value = "";
    parar();
  });

  return { adicionar, mostrarSinal, abrir: abrirAvatar, pronta: () => pronta, parar,
    mudarDestino() {
      parar(); clearTimeout(espera); clearTimeout(inicializacao);
      quadro?.remove(); quadro = undefined; pronta = false; pausar.disabled = true;
    },
    destruir() {
    parar();
    clearTimeout(espera);
    clearTimeout(inicializacao);
    window.removeEventListener?.("message", receberEvento);
    quadro?.remove();
    quadro = undefined;
    pronta = false;
  } };
}
