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

export function montarVoz() {
  const botao = document.querySelector("#falar");
  const texto = document.querySelector("#texto-camera");
  const estado = document.querySelector("#estado-voz");
  const testar = document.querySelector("#testar-som");
  const fontes = new Set();
  let contexto, fila = Promise.resolve(), proximoInicio = 0, geracao = 0;

  function preparar() {
    try {
      contexto ??= new AudioContext();
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
    for (const fonte of fontes) {
      try { fonte.stop(); } catch { /* A fonte pode já ter terminado. */ }
      fonte.disconnect();
    }
    fontes.clear();
    fila = Promise.resolve();
    botao.disabled = false;
    testar.disabled = false;
    estado.textContent = "";
  }

  function enfileirar(frase, manual = false, teste = false) {
    const token = geracao;
    const trabalho = fila.then(async () => {
      if (token !== geracao) return;
      contexto ??= new AudioContext();
      const [motor] = await Promise.all([carregarSintetizador(), contexto.resume()]);
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
        fonte.disconnect();
        fontes.delete(fonte);
        if (token !== geracao) return;
        if (manual) {
          botao.disabled = false;
          testar.disabled = false;
          estado.textContent = teste
            ? "Teste concluído. Se não ouviu, confira o volume do Windows e se esta aba está silenciada."
            : "Leitura concluída.";
        }
      };
      const inicio = Math.max(contexto.currentTime + 0.02, proximoInicio);
      fonte.start(inicio);
      proximoInicio = inicio + audio.duration + 0.04;
      estado.textContent = manual
        ? "Reproduzindo a frase nesta aba…"
        : `Falando: ${frase}.`;
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
      estado.textContent = "Não foi possível reproduzir o teste. Reabra o tradutor em uma aba e tente novamente.";
    });
  });

  function falarSinal(frase) {
    const anterior = texto.value.trimEnd();
    const proximo = anterior ? `${anterior} ${frase}` : frase;
    texto.value = proximo.slice(-texto.maxLength);
    enfileirar(frase).catch((erro) => {
      console.warn("Voz de sinal indisponível:", erro?.message);
      estado.textContent = "A voz do sinal falhou. Use Falar mensagem para tentar novamente.";
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
      estado.textContent = "Não foi possível gerar a voz. Recarregue a extensão e tente novamente.";
    });
  });
  document.querySelector("#limpar-camera").addEventListener("click", () => {
    parar();
    texto.value = "";
  });
  return { preparar, falarSinal, parar };
}
