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
  let contexto, atual;

  function parar() {
    const anterior = atual;
    atual = undefined;
    anterior?.fonte?.stop();
    botao.disabled = false;
    estado.textContent = "";
  }

  botao.addEventListener("click", async () => {
    const frase = texto.value.trim();
    if (!frase) {
      estado.textContent = "Escreva ou soletre uma frase primeiro.";
      return;
    }
    parar();
    const sessao = {};
    atual = sessao;
    botao.disabled = true;
    estado.textContent = "Preparando a voz em português…";
    try {
      contexto ??= new AudioContext();
      const [motor] = await Promise.all([carregarSintetizador(), contexto.resume()]);
      if (atual !== sessao) return;
      const { samples, sampleRate } = motor.synthesize(frase);
      if (!samples.length) throw new Error("A síntese retornou um áudio vazio.");
      const audio = contexto.createBuffer(1, samples.length, sampleRate);
      audio.copyToChannel(toFloat32(samples), 0);
      const fonte = contexto.createBufferSource();
      sessao.fonte = fonte;
      fonte.buffer = audio;
      fonte.connect(contexto.destination);
      fonte.onended = () => {
        fonte.disconnect();
        if (atual !== sessao) return;
        atual = undefined;
        botao.disabled = false;
        estado.textContent = "Leitura concluída.";
      };
      fonte.start();
      estado.textContent = "Reproduzindo o áudio em português nesta aba…";
    } catch (erro) {
      if (atual !== sessao) return;
      console.error(erro);
      atual = undefined;
      botao.disabled = false;
      estado.textContent = "Não foi possível gerar a voz em português. Recarregue a extensão e tente novamente.";
    }
  });
  document.querySelector("#limpar-camera").addEventListener("click", parar);
  return parar;
}
