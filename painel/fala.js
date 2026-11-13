import { reamostrar } from "./segmentacao-audio.mjs";
import { criarEscutaRapida } from "./fala-rapida.mjs";

export function montarFala({ aoTexto, prepararAvatar } = {}) {
  const microfone = document.querySelector("#ouvir-microfone");
  const guia = document.querySelector("#ouvir-guia");
  const pararBotao = document.querySelector("#parar-fala");
  const estado = document.querySelector("#estado-fala");
  const texto = document.querySelector("#texto-fala");
  const tipo = document.querySelector("#tipo-escuta");
  const parcial = document.querySelector("#fala-parcial");
  let sessao, worker, modeloPronto = false, proximoId = 0;

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
    microfone.disabled = false;
    guia.disabled = false;
    pararBotao.hidden = true;
    tipo.disabled = false;
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
    worker.postMessage({ tipo: "transcrever", id: atual.trabalho, amostras }, [amostras.buffer]);
  }

  function obterWorker() {
    if (worker) return worker;
    const iniciado = new Worker(new URL("./transcricao-worker.js", import.meta.url), { type: "module" });
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
        encerrar("Não foi possível transcrever. Recarregue a extensão e tente novamente.");
        return;
      }
      const atual = sessao;
      if (!atual || data.id !== atual.trabalho || data.tipo !== "texto") return;
      if (Number.isFinite(data.inferenciaMs)) console.debug("Transcrição local (ms):", Math.round(data.inferenciaMs));
      atual.trabalho = null;
      const frase = data.texto?.trim();
      if (frase) {
        texto.value = [texto.value.trim(), frase].filter(Boolean).join(" ").slice(-texto.maxLength);
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
    pararBotao.textContent = "Cancelar pendentes";
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
    if (sessao) return;
    if (fonte === "microfone" && tipo.value === "rapida") {
      const atual = { fila: [], trabalho: null, online: true };
      sessao = atual;
      microfone.disabled = guia.disabled = tipo.disabled = true;
      pararBotao.hidden = false;
      pararBotao.textContent = "Parar escuta";
      estado.textContent = "Abrindo o serviço de voz do Chrome…";
      prepararAvatar?.();
      try {
        atual.rapida = criarEscutaRapida({
          aoTexto(frase) {
            if (sessao !== atual) return false;
            texto.value = [texto.value.trim(), frase].filter(Boolean).join(" ").slice(-texto.maxLength);
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
      } catch (erro) { encerrar(erro.message); }
      return;
    }
    if (!navigator.mediaDevices || !window.AudioWorkletNode) {
      estado.textContent = "Abra o tradutor em uma aba do Google Chrome ou digite a frase.";
      return;
    }
    const atual = { fila: [], trabalho: null, escutando: false, parando: false };
    sessao = atual;
    microfone.disabled = true;
    guia.disabled = true;
    tipo.disabled = true;
    pararBotao.hidden = false;
    pararBotao.textContent = "Parar escuta";
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
      obterWorker().postMessage({ tipo: "carregar" });
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
        : await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: false, channelCount: 1 } });
      if (sessao !== atual) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      atual.stream = stream;
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
      encerrar(erro.name === "NotAllowedError" || erro.name === "AbortError"
        ? "A captura foi cancelada ou bloqueada. Abra em aba e permita o microfone."
        : "Não foi possível iniciar a escuta. Tente em uma aba do Chrome ou digite a frase.");
    }
  }

  microfone.addEventListener("click", () => iniciar("microfone"));
  guia.addEventListener("click", () => iniciar("guia"));
  pararBotao.addEventListener("click", () => {
    if (!sessao) return;
    if (sessao.parando) encerrar("Escuta e transcrições pendentes canceladas.");
    else finalizarEscuta(sessao);
  });
  const parar = () => encerrar("");
  parar.preparar = () => {
    if (tipo.value !== "rapida") obterWorker().postMessage({ tipo: "carregar" });
  };
  tipo.addEventListener("change", () => {
    if (sessao) return;
    if (tipo.value === "rapida") {
      worker?.terminate();
      worker = undefined;
      modeloPronto = false;
    } else parar.preparar();
  });
  return parar;
}
