// Alternativa opcional. O serviço de reconhecimento do Chrome pode enviar
// áudio aos seus servidores; a interface exige a escolha explícita deste modo.
export function criarEscutaRapida({ aoTexto, aoParcial, aoEstado, aoFim }, Reconhecimento = globalThis.SpeechRecognition ?? globalThis.webkitSpeechRecognition) {
  if (!Reconhecimento) throw new Error("Este Chrome não oferece reconhecimento de voz rápido. Selecione Local.");
  let reconhecedor, encerrado = false, parando = false, reinicio, prazo, falhas = 0;
  function concluir(mensagem) {
    if (encerrado) return;
    encerrado = true;
    clearTimeout(reinicio);
    clearTimeout(prazo);
    reconhecedor?.abort();
    aoParcial("");
    aoFim(mensagem);
  }
  function iniciarRodada() {
    if (encerrado || parando) return;
    const atual = new Reconhecimento();
    reconhecedor = atual;
    atual.lang = "pt-BR";
    atual.continuous = true;
    atual.interimResults = true;
    atual.maxAlternatives = 1;
    const recebidos = new Set();
    const vigente = () => !encerrado && reconhecedor === atual;
    atual.onstart = () => { if (vigente()) aoEstado("Ouvindo pelo serviço de voz do Chrome…"); };
    atual.onresult = ({ resultIndex, results }) => {
      if (!vigente()) return;
      falhas = 0;
      const parciais = [];
      for (let i = resultIndex; i < results.length; i++) {
        const resultado = results[i], texto = resultado[0]?.transcript?.trim();
        if (!texto) continue;
        if (resultado.isFinal) {
          if (recebidos.has(i)) continue;
          recebidos.add(i);
          if (aoTexto(texto) === false) {
            concluir("A fila do avatar está cheia. A escuta foi pausada; o texto permanece disponível.");
            return;
          }
        } else parciais.push(texto);
      }
      aoParcial(parciais.join(" "));
    };
    atual.onerror = ({ error }) => {
      if (!vigente() || parando) return;
      if (error === "no-speech") return;
      const mensagem = {
        "not-allowed": "O Chrome bloqueou o microfone ou o serviço de voz. Abra em aba e confira a permissão.",
        "service-not-allowed": "O serviço de voz está indisponível neste Chrome. Selecione Local.",
        network: "O serviço de voz não respondeu. Confira a conexão ou selecione Local.",
        "audio-capture": "Não foi possível acessar o microfone. Confira o dispositivo selecionado no Chrome.",
      }[error] ?? "A escuta rápida foi interrompida. Tente novamente ou selecione Local.";
      concluir(mensagem);
    };
    atual.onend = () => {
      if (!vigente()) return;
      if (parando) { concluir("Escuta encerrada. As falas confirmadas foram enviadas ao avatar."); return; }
      falhas++;
      if (falhas >= 3) { concluir("O serviço de voz encerrou a escuta. Tente novamente ou selecione Local."); return; }
      reinicio = setTimeout(iniciarRodada, 200 * falhas);
    };
    try { atual.start(); }
    catch { concluir("Não foi possível iniciar o serviço de voz. Tente novamente ou selecione Local."); }
  }
  return {
    iniciar: iniciarRodada,
    parar() {
      if (encerrado || parando) return;
      parando = true;
      clearTimeout(reinicio);
      prazo = setTimeout(() => concluir("Escuta encerrada. O texto ainda provisório não foi enviado ao avatar."), 2000);
      try { reconhecedor?.stop(); } catch { concluir("Escuta encerrada."); }
    },
    abortar() {
      encerrado = true;
      clearTimeout(reinicio);
      clearTimeout(prazo);
      reconhecedor?.abort();
    },
  };
}
