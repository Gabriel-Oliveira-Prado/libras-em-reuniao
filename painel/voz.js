import { createEspeak, toFloat32 } from "../vendor/spellophone/dist/browser.js";

let sintetizador;

function carregarSintetizador() {
  sintetizador ??= (async () => {
    const motor = await createEspeak({
      dataUrl: new URL("../vendor/spellophone/espeak-ng-data/", import.meta.url),
      languages: ["pt"],
    });
    await motor.loadVoice("pt-br");
    return motor;
  })().catch((erro) => {
    sintetizador = undefined;
    throw erro;
  });
  return sintetizador;
}

export function montarVoz({ dispositivos } = {}) {
  const botao = document.querySelector("#falar");
  const texto = document.querySelector("#texto-camera");
  const estado = document.querySelector("#estado-voz");
  const testar = document.querySelector("#testar-som");
  const pararBotao = document.querySelector("#parar-voz");
  const indicador = document.querySelector("#voz-camera");
  const fontes = new Set();
  const inicios = new Map();
  let contexto, fila = Promise.resolve(), proximoInicio = 0, geracao = 0;
  let rota = Promise.resolve();
  let saidaIndisponivel = false;
  function mostrarVoz(mensagem) { indicador.textContent = mensagem; indicador.hidden = !mensagem; }

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
  const mensagemErro = (erro, padrao) => erro?.name === "SaidaDeAudioError" ? erro.message : padrao;

  function preparar() {
    try {
      contexto ??= new AudioContext();
      encaminharSaida().catch((erro) => { estado.textContent = erro.message; });
      contexto.resume().catch(() => {
        estado.textContent = "O Chrome bloqueou o áudio. Clique em Falar mensagem para ativá-lo.";
      });
      carregarSintetizador().catch(() => {
        estado.textContent = "A voz não carregou. Use Falar mensagem para tentar novamente.";
      });
    } catch {
      estado.textContent = "O áudio não está disponível nesta janela.";
    }
  }

  function parar() {
    geracao += 1;
    proximoInicio = 0;
    for (const timer of inicios.values()) clearTimeout(timer);
    inicios.clear();
    for (const fonte of fontes) {
      try { fonte.stop(); } catch { /* A fonte pode já ter terminado. */ }
      fonte.disconnect();
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
      const [motor] = await Promise.all([carregarSintetizador(), contexto.resume(), encaminharSaida()]);
      if (token !== geracao) return;
      const { samples, sampleRate } = motor.synthesize(frase);
      if (!samples.length) throw new Error("A síntese retornou um áudio vazio.");
      const audio = contexto.createBuffer(1, samples.length, sampleRate);
      audio.copyToChannel(toFloat32(samples), 0);
      const fonte = contexto.createBufferSource();
      fonte.buffer = audio;
      fonte.connect(contexto.destination);
      fontes.add(fonte);
      fonte.onended = () => {
        clearTimeout(inicios.get(fonte)); inicios.delete(fonte);
        fonte.disconnect();
        fontes.delete(fonte);
        if (!fontes.size) pararBotao.hidden = true;
        if (token !== geracao) return;
        if (!fontes.size) mostrarVoz("Voz concluída.");
        if (manual && !fontes.size) {
          botao.disabled = false;
          testar.disabled = false;
          estado.textContent = teste
            ? "Teste concluído. Se não ouviu, confira o volume do Windows e se esta aba está silenciada."
            : "Leitura concluída.";
        } else if (!fontes.size) estado.textContent = "Áudio concluído nesta aba.";
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
    return trabalho;
  }

  testar.addEventListener("click", () => {
    parar();
    preparar();
    testar.disabled = true;
    enfileirar("Oi. O som do tradutor está funcionando.", true, true).catch((erro) => {
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
  return { preparar, falarSinal, parar };
}
