import { criarClienteVoz } from "../vozes/cliente.mjs";
import { listarVozes } from "../vozes/catalogo.mjs";

export function montarVoz({ dispositivos, cliente = criarClienteVoz(), catalogo = listarVozes, encaminharAudio, aoPararAudio } = {}) {
  const botao = document.querySelector("#falar");
  const texto = document.querySelector("#texto-camera");
  const estado = document.querySelector("#estado-voz");
  const testar = document.querySelector("#testar-som");
  const pararBotao = document.querySelector("#parar-voz");
  const indicador = document.querySelector("#voz-camera");
  const seletor = document.querySelector("#perfil-voz"), estadoVozes = document.querySelector("#estado-vozes");
  const fontes = new Set();
  const inicios = new Map();
  let contexto, fila = Promise.resolve(), proximoInicio = 0, geracao = 0;
  let rota = Promise.resolve();
  let saidaIndisponivel = false;
  let perfil = "pf_dora", revisaoCatalogo = 0;
  try { perfil = localStorage.getItem("libras-perfil-voz") || perfil; } catch { /* Usa a voz feminina inicial. */ }
  function mostrarVoz(mensagem) { indicador.textContent = mensagem; indicador.hidden = !mensagem; }
  async function atualizarVozes() {
    const token = ++revisaoCatalogo;
    try {
      const vozes = await catalogo();
      if (token !== revisaoCatalogo) return;
      const opcoes = vozes.map((voz) => { const o = document.createElement("option"); o.value = voz.id; o.textContent = voz.nome; return o; });
      if (!vozes.some((v) => v.id === perfil)) {
        const ausente = document.createElement("option"); ausente.value = perfil; ausente.textContent = "Voz salva indisponível · escolha outra"; ausente.disabled = true; opcoes.push(ausente);
      }
      seletor.replaceChildren(...opcoes); seletor.value = perfil;
      estadoVozes.textContent = vozes.length ? "Vozes em português brasileiro. A escolha fica salva neste Chrome." : "Nenhuma voz encontrada. Confira a pasta de vozes do projeto.";
    } catch { estadoVozes.textContent = "Não foi possível listar as vozes. Recarregue a extensão e tente novamente."; }
  }
  seletor.addEventListener("change", () => {
    parar(); perfil = seletor.value;
    try { localStorage.setItem("libras-perfil-voz", perfil); } catch { /* Preserva a seleção nesta aba. */ }
  });
  document.querySelector("#atualizar-vozes").addEventListener("click", atualizarVozes);
  atualizarVozes();

  function encaminharSaida() {
    const id = dispositivos?.selecionado("saida") || "";
    rota = rota.catch(() => {}).then(async () => {
      try {
        if (saidaIndisponivel) throw new Error("dispositivo desconectado");
        if (!contexto || (contexto.sinkId ?? "") === id) return;
        if (!contexto.setSinkId) throw new Error("setSinkId indisponível");
        await contexto.setSinkId(id);
      } catch (causa) {
        const erro = new Error("Não foi possível usar a saída escolhida. Confira a conexão e a permissão do dispositivo ou escolha Padrão do sistema.", { cause: causa });
        erro.name = "SaidaDeAudioError";
        throw erro;
      }
    });
    return rota;
  }
  const mensagemErro = (erro, padrao) => ["SaidaDeAudioError", "ConexaoMeetError"].includes(erro?.name) ? erro.message : padrao;

  function preparar(texto) {
    const token = geracao;
    try {
      contexto ??= new AudioContext();
      encaminharSaida().catch((erro) => { if (token === geracao) estado.textContent = erro.message; });
      contexto.resume().catch(() => {
        estado.textContent = "O Chrome bloqueou o áudio. Clique em Falar mensagem para ativá-lo.";
      });
      const preparacao = texto ? Promise.all([cliente.preparar(texto, perfil),
        ...(["pf_dora", "pm_alex"].includes(perfil) ? [cliente.preparar(texto, perfil === "pf_dora" ? "pm_alex" : "pf_dora")] : [])]) : cliente.carregar();
      preparacao.catch(() => {
        if (token === geracao) estado.textContent = "A voz não carregou. Use Falar mensagem para tentar novamente.";
      });
    } catch {
      estado.textContent = "O áudio não está disponível nesta janela.";
    }
  }

  function parar() {
    geracao += 1;
    aoPararAudio?.();
    cliente.cancelar();
    proximoInicio = 0;
    for (const timer of inicios.values()) clearTimeout(timer);
    inicios.clear();
    for (const fonte of fontes) {
      try { fonte.stop(); } catch { /* A fonte pode já ter terminado. */ }
      fonte.disconnect();
      fonte._liberarSaida?.();
    }
    fontes.clear();
    fila = Promise.resolve();
    botao.disabled = false;
    testar.disabled = false;
    pararBotao.hidden = true;
    estado.textContent = "";
    mostrarVoz("");
  }

  function enfileirar(frase, manual = false, teste = false) {
    const token = geracao;
    const trabalho = fila.then(async () => {
      if (token !== geracao) return;
      if (!fontes.size) mostrarVoz("Preparando a voz em português…");
      contexto ??= new AudioContext();
      const [{ samples, sampleRate }] = await Promise.all([cliente.sintetizar(frase, perfil), contexto.resume(), encaminharSaida()]);
      if (token !== geracao) return;
      if (!samples.length) throw new Error("A síntese retornou um áudio vazio.");
      const enviadoAoMeet = await encaminharAudio?.({ samples, sampleRate, frase, teste });
      if (token !== geracao) return;
      const audio = contexto.createBuffer(1, samples.length, sampleRate);
      audio.copyToChannel(samples, 0);
      const fonte = contexto.createBufferSource();
      fonte.buffer = audio;
      // O Meet reproduz o PCM pelo microfone virtual da própria página.
      // Um ganho zero mantém os relógios locais sem gerar eco no alto-falante.
      if (enviadoAoMeet) {
        const silencioso = contexto.createGain(); silencioso.gain.value = 0;
        fonte.connect(silencioso); silencioso.connect(contexto.destination);
        fonte._liberarSaida = () => silencioso.disconnect();
      } else fonte.connect(contexto.destination);
      fontes.add(fonte);
      fonte.onended = () => {
        clearTimeout(inicios.get(fonte)); inicios.delete(fonte);
        fonte.disconnect();
        fonte._liberarSaida?.();
        fontes.delete(fonte);
        if (!fontes.size) pararBotao.hidden = true;
        if (token !== geracao) return;
        if (!fontes.size) { mostrarVoz(""); estado.textContent = ""; }
        if (manual && !fontes.size) {
          botao.disabled = false;
          testar.disabled = false;
          if (teste) estado.textContent = "Se não ouviu o teste, confira o volume, a saída de áudio e se esta aba está silenciada.";
        }
      };
      const inicio = Math.max(contexto.currentTime + 0.02, proximoInicio);
      fonte.start(inicio);
      inicios.set(fonte, setTimeout(() => {
        inicios.delete(fonte);
        if (token !== geracao || !fontes.has(fonte)) return;
        mostrarVoz(`Falando: ${frase}`);
        estado.textContent = teste ? "Reproduzindo o teste de som…" : `Falando: ${frase}`;
      }, Math.max(0, (inicio - contexto.currentTime) * 1000)));
      pararBotao.hidden = false;
      proximoInicio = inicio + audio.duration + 0.04;
      if (fontes.size > 1) estado.textContent = "A voz vai falar os sinais reconhecidos em ordem.";
    });
    fila = trabalho.catch(() => {});
    return trabalho.catch((erro) => {
      if (token !== geracao) return;
      throw erro;
    });
  }

  testar.addEventListener("click", () => {
    parar();
    preparar();
    testar.disabled = true;
    enfileirar("Oi. O som do tradutor está funcionando.", true, true).catch((erro) => {
      if (erro.name === "AbortError") return;
      console.warn("Teste de voz:", erro?.message);
      testar.disabled = false;
      mostrarVoz("Não consegui reproduzir o teste de som.");
      estado.textContent = mensagemErro(erro, "Não foi possível reproduzir o teste. Reabra o tradutor em uma aba e tente novamente.");
    });
  });
  pararBotao.addEventListener("click", () => { parar(); estado.textContent = "Voz interrompida. A mensagem foi mantida."; });

  function falarSinal(frase) {
    const anterior = texto.value.trimEnd();
    const proximo = anterior ? `${anterior} ${frase}` : frase;
    texto.value = proximo.slice(-texto.maxLength);
    enfileirar(frase).catch((erro) => {
      if (erro.name === "AbortError") return;
      console.warn("Voz de sinal indisponível:", erro?.message);
      mostrarVoz("Não consegui falar este sinal. Confira a saída e use Testar som.");
      estado.textContent = mensagemErro(erro, "A voz do sinal falhou. Use Falar mensagem para tentar novamente.");
    });
  }

  botao.addEventListener("click", () => {
    const frase = texto.value.trim();
    if (!frase) {
      estado.textContent = "Mostre um sinal treinado ou escreva uma mensagem primeiro.";
      return;
    }
    parar();
    botao.disabled = true;
    estado.textContent = "Preparando a voz em português…";
    enfileirar(frase, true).catch((erro) => {
      if (erro.name === "AbortError") return;
      console.warn("Falha ao gerar voz:", erro?.message);
      botao.disabled = false;
      mostrarVoz("Não consegui falar a mensagem. Use Testar som para conferir.");
      estado.textContent = mensagemErro(erro, "Não foi possível gerar a voz. Recarregue a extensão e tente novamente.");
    });
  });
  document.querySelector("#limpar-camera").addEventListener("click", () => {
    parar();
    texto.value = "";
  });
  dispositivos?.observar(({ tipo, removido }) => {
    if (tipo !== "saida") return;
    saidaIndisponivel = removido === true;
    parar();
    if (removido) {
      estado.textContent = "A saída de áudio foi desconectada. Escolha outra e use Testar som.";
    } else if (contexto) encaminharSaida().then(() => {
      estado.textContent = "Saída de áudio alterada. Use Testar som para conferir.";
    }).catch((erro) => { estado.textContent = erro.message; });
  });
  return { preparar, falarSinal, parar, destruir() { parar(); cliente.destruir(); revisaoCatalogo++; } };
}
