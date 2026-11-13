import { reamostrar } from "./segmentacao-audio.mjs";
import { criarEscutaRapida } from "./fala-rapida.mjs";
import { modeloValido } from "./configuracao-transcricao.mjs";
import { criarTranscricaoAcelerada } from "./transcricao-acelerada.mjs";

export function montarFala({ aoTexto, prepararAvatar, dispositivos, aoAtualizarTexto } = {}) {
  const microfone = document.querySelector("#ouvir-microfone");
  const guia = document.querySelector("#ouvir-guia");
  const pararBotao = document.querySelector("#parar-fala");
  const estado = document.querySelector("#estado-fala");
  const texto = document.querySelector("#texto-fala");
  const tipo = document.querySelector("#tipo-escuta");
  const parcial = document.querySelector("#fala-parcial");
  const qualidade = document.querySelector("#modelo-transcricao");
  const motor = document.querySelector("#motor-transcricao");
  try { if (motor) motor.value = localStorage.getItem("libras-motor-transcricao") === "acelerado" ? "acelerado" : "navegador"; } catch { /* Mantém Navegador. */ }
  let preferido = "base";
  try { preferido = modeloValido(localStorage.getItem("libras-modelo-transcricao")); } catch { /* Usa Base sem armazenamento. */ }
  if (qualidade) qualidade.value = preferido === "small" ? "base" : preferido;
  let sessao, worker, modeloPronto = false, proximoId = 0;
  const opcaoSmall = document.querySelector("#opcao-small");
  if (opcaoSmall) fetch(new URL("../modelos/whisper-small/config.json", import.meta.url)).then((r) => {
    if (!r.ok) return;
    opcaoSmall.disabled = false;
    if (preferido === "small" && !sessao && qualidade.value === "base") {
      qualidade.value = "small";
      worker?.terminate(); worker = undefined; modeloPronto = false;
    }
    document.querySelector("#estado-modelo-transcricao").textContent = "Small instalado: prioriza fidelidade, com maior atraso. Base equilibra processamento e precisão; Tiny é mais leve.";
  }).catch(() => {});

  function atualizarControles() {
    const ligada = Boolean(sessao);
    microfone.disabled = guia.disabled = false;
    microfone.textContent = sessao?.fonte === "microfone" ? "Desligar microfone" : "Ligar microfone";
    guia.textContent = sessao?.fonte === "guia" ? "Parar áudio da guia" : "Ouvir guia";
    microfone.setAttribute?.("aria-pressed", String(sessao?.fonte === "microfone"));
    guia.setAttribute?.("aria-pressed", String(sessao?.fonte === "guia"));
    if (pararBotao) pararBotao.hidden = true;
    tipo.disabled = ligada;
    if (qualidade) qualidade.disabled = ligada;
    if (motor) motor.disabled = ligada;
  }

  function configuracaoMicrofone() {
    const id = dispositivos?.selecionado("microfone");
    return { echoCancellation: true, noiseSuppression: true, autoGainControl: false, channelCount: 1,
      ...(id ? { deviceId: { exact: id } } : {}) };
  }

  function liberarCaptura(atual) {
    if (atual.liberada) return;
    atual.liberada = true;
    atual.escutando = false;
    atual.rapida?.abortar();
    clearTimeout(atual.prazoParada);
    if (atual.captura) atual.captura.port.onmessage = null;
    atual.entrada?.disconnect();
    atual.captura?.disconnect();
    atual.vad?.terminate();
    atual.stream?.getTracks().forEach((track) => track.stop());
    atual.contexto?.close().catch(() => {});
  }

  function encerrar(mensagem = "Escuta encerrada.", cancelar = true) {
    const atual = sessao;
    sessao = null;
    if (atual) liberarCaptura(atual);
    if (cancelar && (atual?.trabalho || !modeloPronto)) {
      worker?.terminate();
      worker = undefined;
      modeloPronto = false;
    }
    atualizarControles();
    parcial.textContent = "";
    parcial.hidden = true;
    estado.textContent = mensagem;
  }

  function informar(atual) {
    if (sessao !== atual) return;
    if (atual.aviso) {
      estado.textContent = atual.aviso;
    } else if (!atual.escutando && !atual.parando) {
      estado.textContent = "Preparando a captura de áudio…";
    } else if (!modeloPronto) {
      estado.textContent = "Preparando a transcrição local. Você já pode falar…";
    } else if (atual.parando) {
      estado.textContent = "Microfone desligado. Concluindo as últimas falas…";
    } else if (atual.fila.length > 1) {
      estado.textContent = `Ouvindo. Processando ${atual.fila.length + (atual.trabalho ? 1 : 0)} trechos pendentes…`;
    } else {
      estado.textContent = atual.trabalho ? "Ouvindo e transcrevendo…" : "Ouvindo. Fale naturalmente; o avatar recebe cada trecho automaticamente.";
    }
  }

  function processarFila(atual) {
    if (sessao !== atual || atual.trabalho) return;
    if (!atual.fila.length) {
      if (atual.parando && !atual.escutando) encerrar(atual.aviso || "Escuta encerrada. As falas já foram enviadas ao avatar.", false);
      else informar(atual);
      return;
    }
    if (!modeloPronto) return;
    const amostras = atual.fila.shift();
    atual.trabalho = ++proximoId;
    informar(atual);
    worker.postMessage({ tipo: "transcrever", id: atual.trabalho, amostras, modelo: qualidade?.value || "base" }, [amostras.buffer]);
  }

  function obterWorker() {
    if (worker) return worker;
    const iniciado = motor?.value === "acelerado" ? criarTranscricaoAcelerada() : new Worker(new URL("./transcricao-worker.js", import.meta.url), { type: "module" });
    worker = iniciado;
    iniciado.onmessage = ({ data }) => {
      if (worker !== iniciado) return;
      if (data.tipo === "carregado") {
        modeloPronto = true;
        if (sessao) processarFila(sessao);
        return;
      }
      if (data.tipo === "erro") {
        console.warn("Transcrição local:", data.erro);
        iniciado.terminate();
        worker = undefined;
        modeloPronto = false;
        encerrar(motor?.value === "acelerado" ? "A transcrição acelerada não respondeu. Inicie o serviço local com o ID desta extensão ou escolha Navegador." : "Não foi possível transcrever. Recarregue a extensão e tente novamente.");
        return;
      }
      const atual = sessao;
      if (!atual || data.id !== atual.trabalho || data.tipo !== "texto") return;
      if (Number.isFinite(data.inferenciaMs)) console.debug("Transcrição local (ms):", Math.round(data.inferenciaMs));
      atual.trabalho = null;
      const frase = data.texto?.trim();
      if (frase) {
        texto.value = [texto.value.trim(), frase].filter(Boolean).join(" ").slice(-texto.maxLength);
        aoAtualizarTexto?.();
        if (aoTexto?.(frase) === false) {
          atual.aviso = "A fila do avatar está cheia. A escuta foi pausada; o texto permanece disponível.";
          finalizarEscuta(atual);
        }
      }
      processarFila(atual);
    };
    iniciado.onerror = () => {
      if (worker !== iniciado) return;
      iniciado.terminate();
      worker = undefined;
      modeloPronto = false;
      encerrar("O modelo de voz não carregou. Recarregue a extensão e tente novamente.");
    };
    return iniciado;
  }

  function enfileirar(atual, audio) {
    if (!audio || sessao !== atual) return;
    atual.fila.push(audio);
    if (atual.fila.length >= 6 && !atual.parando) {
      atual.aviso = "A transcrição está atrasada neste computador. A escuta foi pausada para concluir os trechos capturados.";
      finalizarEscuta(atual);
    }
    processarFila(atual);
  }

  function concluirCaptura(atual) {
    if (sessao !== atual || !atual.escutando) return;
    liberarCaptura(atual);
    processarFila(atual);
  }

  function finalizarEscuta(atual) {
    if (sessao !== atual || atual.parando) return;
    atual.parando = true;
    if (pararBotao) pararBotao.textContent = "Cancelar pendentes";
    if (atual.rapida) {
      estado.textContent = "Concluindo a última fala…";
      atual.rapida.parar();
      return;
    }
    if (atual.captura) {
      atual.captura.port.postMessage("parar");
      atual.prazoParada = setTimeout(() => {
        atual.aviso = "Escuta encerrada. O último trecho não terminou de processar; tente repeti-lo.";
        concluirCaptura(atual);
      }, 3000);
    } else {
      encerrar("Escuta cancelada.");
      return;
    }
    informar(atual);
  }

  async function iniciar(fonte) {
    if (sessao) return sessao;
    if (fonte === "microfone" && tipo.value === "rapida") {
      const atual = { fila: [], trabalho: null, online: true, fonte };
      sessao = atual;
      atualizarControles();
      estado.textContent = "Abrindo o serviço de voz do Chrome…";
      prepararAvatar?.();
      try {
        let faixa;
        // A sobrecarga start(audioTrack) chegou ao Chrome desktop 135.
        // Versões anteriores ignoram argumentos: nunca simular uma seleção de microfone.
        const versao = Number(navigator.userAgent?.match(/(?:Chrome|Chromium)\/(\d+)/)?.[1] || 0);
        if (dispositivos?.selecionado("microfone") && versao < 135) {
          throw new Error("Para usar o microfone escolhido, atualize o Chrome (135 ou mais recente) ou selecione transcrição Local.");
        }
        if (versao >= 135) {
          const stream = await navigator.mediaDevices.getUserMedia({ audio: configuracaoMicrofone() });
          if (sessao !== atual) { stream.getTracks().forEach((track) => track.stop()); return; }
          atual.stream = stream;
          [faixa] = stream.getAudioTracks();
          if (!faixa) throw new Error("O microfone escolhido não retornou uma faixa de áudio.");
          faixa.addEventListener("ended", () => {
            if (sessao === atual) encerrar("O microfone foi desconectado. Escolha outro e ligue a escuta novamente.");
          }, { once: true });
          dispositivos?.atualizar();
        }
        atual.rapida = criarEscutaRapida({
          faixa,
          aoTexto(frase) {
            if (sessao !== atual) return false;
            texto.value = [texto.value.trim(), frase].filter(Boolean).join(" ").slice(-texto.maxLength);
            aoAtualizarTexto?.();
            return aoTexto?.(frase);
          },
          aoParcial(frase) {
            if (sessao !== atual) return;
            parcial.textContent = frase;
            parcial.hidden = !frase;
          },
          aoEstado(mensagem) { if (sessao === atual) estado.textContent = mensagem; },
          aoFim(mensagem) { if (sessao === atual) encerrar(mensagem); },
        });
        atual.rapida.iniciar();
      } catch (erro) {
        if (sessao === atual) encerrar(erro.name === "NotAllowedError"
          ? "O Chrome bloqueou o microfone escolhido. Abra em aba e permita o acesso."
          : erro.name === "NotFoundError" || erro.name === "OverconstrainedError"
            ? "O microfone escolhido não está disponível. Escolha outro nas opções de dispositivos."
            : erro.message);
      }
      return sessao === atual ? atual : undefined;
    }
    if (!navigator.mediaDevices || !window.AudioWorkletNode) {
      estado.textContent = "Abra o tradutor em uma aba do Google Chrome ou digite a frase.";
      if (qualidade) qualidade.disabled = false;
      if (motor) motor.disabled = false;
      return;
    }
    const atual = { fila: [], trabalho: null, escutando: false, parando: false, fonte };
    sessao = atual;
    atualizarControles();
    estado.textContent = fonte === "guia" ? "Selecione a guia e compartilhe o áudio." : "Abrindo o microfone…";
    prepararAvatar?.();
    try {
      try { atual.contexto = new AudioContext({ sampleRate: 16000 }); }
      catch (erro) {
        if (erro.name !== "NotSupportedError") throw erro;
        atual.contexto = new AudioContext();
      }
      await atual.contexto.resume();
      if (sessao !== atual) return;
      obterWorker().postMessage({ tipo: "carregar", modelo: qualidade?.value || "base" });
      atual.vad = new Worker(new URL("./vad-worker.js", import.meta.url), { type: "module" });
      atual.vad.onmessage = ({ data }) => {
        if (sessao !== atual) return;
        if (data.tipo === "trecho") enfileirar(atual, data.amostras);
        else if (data.tipo === "fim") concluirCaptura(atual);
        else if (data.tipo === "erro") encerrar("A detecção de voz falhou. Tente ligar o microfone novamente.");
      };
      atual.vad.onerror = () => {
        if (sessao === atual) encerrar("O detector de voz não carregou. Recarregue a extensão.");
      };
      atual.vad.postMessage({ tipo: "carregar" });
      const stream = fonte === "guia"
        ? await navigator.mediaDevices.getDisplayMedia({
          video: { displaySurface: "browser" }, audio: { suppressLocalAudioPlayback: false },
          selfBrowserSurface: "exclude", systemAudio: "exclude",
        })
        : await navigator.mediaDevices.getUserMedia({ audio: configuracaoMicrofone() });
      if (sessao !== atual) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      atual.stream = stream;
      if (fonte === "microfone") dispositivos?.atualizar();
      const [faixa] = stream.getAudioTracks();
      const superficie = stream.getVideoTracks()[0]?.getSettings().displaySurface;
      if (!faixa || (superficie && superficie !== "browser")) {
        encerrar("Selecione uma guia do Chrome e marque Compartilhar áudio da guia.");
        return;
      }
      await atual.contexto.audioWorklet.addModule(new URL("./captura-audio.js", import.meta.url));
      if (sessao !== atual) return;
      atual.entrada = atual.contexto.createMediaStreamSource(new MediaStream([faixa]));
      atual.captura = new AudioWorkletNode(atual.contexto, "captura-pcm");
      atual.escutando = true;
      atual.captura.port.onmessage = ({ data }) => {
        if (sessao !== atual) return;
        if (data.tipo === "audio") {
          const amostras = reamostrar(data.amostras, atual.contexto.sampleRate);
          atual.vad.postMessage({ tipo: "audio", amostras }, [amostras.buffer]);
        } else if (data.tipo === "fim") atual.vad.postMessage({ tipo: "parar" });
      };
      atual.captura.onprocessorerror = () => {
        if (sessao === atual) encerrar("A captura de áudio falhou. Tente ligar o microfone novamente.");
      };
      atual.entrada.connect(atual.captura);
      atual.captura.connect(atual.contexto.destination);
      faixa.addEventListener("ended", () => finalizarEscuta(atual), { once: true });
      stream.getVideoTracks()[0]?.addEventListener("ended", () => finalizarEscuta(atual), { once: true });
      informar(atual);
    } catch (erro) {
      if (sessao !== atual) return;
      console.warn("Captura de áudio:", erro?.name, erro?.message);
      encerrar(erro.name === "NotFoundError" || erro.name === "OverconstrainedError"
        ? "O microfone escolhido não está disponível. Escolha outro nas opções de dispositivos."
        : erro.name === "NotAllowedError" || erro.name === "AbortError"
        ? "A captura foi cancelada ou bloqueada. Abra em aba e permita o microfone."
        : "Não foi possível iniciar a escuta. Tente em uma aba do Chrome ou digite a frase.");
    }
    return sessao === atual ? atual : undefined;
  }

  function alternar(fonte) {
    if (sessao?.fonte === fonte) {
      encerrar(fonte === "microfone" ? "Microfone desligado." : "Áudio da guia desligado.");
      return;
    }
    if (sessao) encerrar("");
    return iniciar(fonte);
  }
  microfone.addEventListener("click", () => alternar("microfone"));
  guia.addEventListener("click", () => alternar("guia"));
  // Compatibilidade com páginas antigas; o botão separado não é necessário.
  pararBotao?.addEventListener("click", () => encerrar("Escuta desligada."));
  atualizarControles();
  const parar = () => encerrar("");
  parar.iniciar = () => iniciar("microfone");
  parar.preparar = () => {
    if (tipo.value !== "rapida") obterWorker().postMessage({ tipo: "carregar", modelo: qualidade?.value || "base" });
  };
  qualidade?.addEventListener("change", () => {
    if (sessao) return;
    preferido = modeloValido(qualidade.value);
    try { localStorage.setItem("libras-modelo-transcricao", preferido); } catch { /* Vale nesta sessão. */ }
    worker?.terminate(); worker = undefined; modeloPronto = false;
    parar.preparar();
  });
  motor?.addEventListener("change", () => {
    if (sessao) return;
    try { localStorage.setItem("libras-motor-transcricao", motor.value === "acelerado" ? "acelerado" : "navegador"); } catch { /* Vale na sessão. */ }
    worker?.terminate(); worker = undefined; modeloPronto = false;
    parar.preparar();
  });
  tipo.addEventListener("change", () => {
    if (sessao) return;
    if (tipo.value === "rapida") {
      worker?.terminate();
      worker = undefined;
      modeloPronto = false;
    } else parar.preparar();
  });
  dispositivos?.observar(({ tipo: dispositivo, removido }) => {
    if (dispositivo !== "microfone" || sessao?.fonte !== "microfone") return;
    encerrar(removido ? "O microfone escolhido foi desconectado. Escolha outro e ligue novamente." : "Microfone alterado. Clique em Ligar microfone quando quiser ouvir novamente.");
  });
  return parar;
}
