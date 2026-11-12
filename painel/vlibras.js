const TRADUCAO = "https://traducao2.vlibras.gov.br/translate";
const AVATAR = new URL("https://vlibras.gov.br/app/unity/index.html?v=7.12.2");
const DICIONARIO = "https://dicionario2.vlibras.gov.br/2018.3.1/WEBGL/";

async function obterGlosa(texto, signal) {
  const resposta = await fetch(TRADUCAO, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: texto }),
    signal,
  });
  if (!resposta.ok) throw new Error(`VLibras HTTP ${resposta.status}`);
  const corpo = (await resposta.text()).trim();
  let glosa = corpo;
  if (corpo.startsWith("{")) glosa = JSON.parse(corpo).traducao;
  if (typeof glosa !== "string" || !glosa.trim() || glosa.startsWith("<")) {
    throw new Error("O VLibras retornou uma tradução inválida.");
  }
  return glosa.trim();
}

export function montarVLibras() {
  const area = document.querySelector("#avatar");
  const estado = document.querySelector("#estado-vlibras");
  const detalhes = document.querySelector("#glosa");
  const textoGlosa = document.querySelector("#texto-glosa");
  const traduzir = document.querySelector("#traduzir");
  const repetir = document.querySelector("#repetir");
  const texto = document.querySelector("#texto-fala");
  let quadro, pronta, glosa, consulta, espera;

  function comando(method, params) {
    quadro?.contentWindow?.postMessage({
      type: "unity",
      object: "PlayerManager",
      method,
      params,
    }, AVATAR.origin);
  }

  function reproduzir() {
    if (!pronta || !glosa) return;
    comando("playNow", glosa);
    repetir.disabled = false;
    estado.textContent = "Tradução enviada ao avatar.";
  }

  function abrirAvatar() {
    area.hidden = false;
    if (quadro) return;
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
      estado.textContent = "O avatar não carregou. A glosa está disponível. Clique em Repetir para tentar abrir o avatar novamente.";
      repetir.disabled = !glosa;
    }, 60000);
  }

  window.addEventListener("message", ({ source, origin, data }) => {
    if (origin !== AVATAR.origin || source !== quadro?.contentWindow || data?.type !== "unity_event") return;
    if (data.event === "on_load_player") {
      clearTimeout(espera);
      pronta = true;
      comando("setBaseUrl", DICIONARIO);
      comando("setSubtitlesState", 1);
      reproduzir();
    }
    if (data.event === "update_progress" && !pronta && glosa && Number.isFinite(data.data)) {
      estado.textContent = `Carregando o avatar do VLibras… ${Math.round(data.data * 100)}%`;
    }
    if (glosa && data.event === "on_playing_state_change" && data.data?.[0] === "True") {
      estado.textContent = "Avatar sinalizando em Libras.";
    }
  });

  traduzir.addEventListener("click", async () => {
    const frase = texto.value.trim();
    if (!frase) {
      estado.textContent = "Fale ou digite uma frase para traduzir.";
      return;
    }
    consulta?.abort();
    const atual = new AbortController();
    consulta = atual;
    glosa = undefined;
    repetir.disabled = true;
    detalhes.hidden = true;
    if (pronta) comando("stopAll");
    estado.textContent = "Traduzindo com o VLibras…";
    const prazo = setTimeout(() => atual.abort(), 15000);
    try {
      const resultado = await obterGlosa(frase, atual.signal);
      if (consulta !== atual) return;
      glosa = resultado;
      textoGlosa.textContent = glosa;
      detalhes.hidden = false;
      estado.textContent = "Carregando o avatar do VLibras…";
      abrirAvatar();
      reproduzir();
    } catch (erro) {
      if (consulta !== atual) return;
      console.error(erro);
      estado.textContent = "O VLibras não respondeu. Confira a conexão e tente novamente.";
    } finally {
      clearTimeout(prazo);
      if (consulta === atual) consulta = undefined;
    }
  });

  repetir.addEventListener("click", () => {
    if (!glosa) return;
    if (!pronta) {
      repetir.disabled = true;
      estado.textContent = "Carregando o avatar do VLibras…";
      abrirAvatar();
      return;
    }
    reproduzir();
  });

  function parar() {
    consulta?.abort();
    consulta = undefined;
    clearTimeout(espera);
    if (pronta) comando("stopAll");
    quadro?.remove();
    quadro = undefined;
    pronta = false;
    glosa = undefined;
    detalhes.hidden = true;
    area.hidden = true;
    repetir.disabled = true;
    estado.textContent = "";
  }

  document.querySelector("#limpar-fala").addEventListener("click", () => {
    texto.value = "";
    parar();
  });
  return parar;
}
