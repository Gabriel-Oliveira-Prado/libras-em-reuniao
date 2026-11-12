const LIMITE_GRAVACAO = 20000;
const TAXA_AMOSTRAGEM = 16000;

async function decodificar(blob) {
  const contexto = new OfflineAudioContext(1, 1, TAXA_AMOSTRAGEM);
  const audio = await contexto.decodeAudioData(await blob.arrayBuffer());
  const canais = Array.from({ length: audio.numberOfChannels }, (_, i) => audio.getChannelData(i));
  const amostras = new Float32Array(audio.length);
  let energia = 0;
  for (let i = 0; i < amostras.length; i += 1) {
    for (const canal of canais) amostras[i] += canal[i] / canais.length;
    energia += amostras[i] ** 2;
  }
  return Math.sqrt(energia / amostras.length) >= 0.004 ? amostras : null;
}

export function montarFala() {
  const microfone = document.querySelector("#ouvir-microfone");
  const guia = document.querySelector("#ouvir-guia");
  const pararBotao = document.querySelector("#parar-fala");
  const estado = document.querySelector("#estado-fala");
  const texto = document.querySelector("#texto-fala");
  let sessao, worker;
  let proximoId = 0;

  function encerrar(atual, mensagem, cancelar = false) {
    if (sessao !== atual) return;
    sessao = null;
    clearTimeout(atual.limite);
    if (atual.gravador?.state === "recording") atual.gravador.stop();
    atual.stream?.getTracks().forEach((track) => track.stop());
    if (cancelar && atual.transcrevendo) {
      worker?.terminate();
      worker = undefined;
    }
    microfone.disabled = false;
    guia.disabled = false;
    pararBotao.hidden = true;
    estado.textContent = mensagem;
  }

  function obterWorker() {
    if (worker) return worker;
    const iniciado = new Worker(new URL("./transcricao-worker.js", import.meta.url), { type: "module" });
    worker = iniciado;
    worker.onmessage = ({ data }) => {
      const atual = sessao;
      if (!atual || data.id !== atual.id) return;
      if (data.tipo === "pronto") {
        estado.textContent = "Transcrevendo o trecho em português…";
        return;
      }
      if (data.tipo === "erro") {
        console.error(data.erro);
        worker.terminate();
        worker = undefined;
        encerrar(atual, "Não foi possível transcrever. Recarregue a extensão e tente novamente.");
        return;
      }
      if (data.tipo === "texto") {
        if (!data.texto) {
          encerrar(atual, "Nenhuma fala foi reconhecida. Tente outro trecho ou digite a frase.");
          return;
        }
        texto.value = [texto.value.trim(), data.texto].filter(Boolean).join(" ").slice(0, texto.maxLength);
        encerrar(atual, "Trecho transcrito. Revise o texto e clique em Mostrar em Libras.");
      }
    };
    worker.onerror = (erro) => {
      if (worker !== iniciado) return;
      console.error(erro);
      iniciado.terminate();
      worker = undefined;
      if (sessao?.transcrevendo) {
        encerrar(sessao, "O modelo de voz não carregou. Recarregue a extensão e tente novamente.");
      }
    };
    return worker;
  }

  async function transcrever(atual) {
    if (sessao !== atual) return;
    clearTimeout(atual.limite);
    atual.stream.getTracks().forEach((track) => track.stop());
    pararBotao.hidden = true;
    estado.textContent = "Preparando o áudio para transcrever…";
    try {
      if (!atual.partes.length) {
        encerrar(atual, "O trecho ficou vazio. Tente novamente.");
        return;
      }
      const audio = new Blob(atual.partes, { type: atual.gravador.mimeType });
      const amostras = await decodificar(audio);
      if (sessao !== atual) return;
      if (!amostras) {
        encerrar(atual, "O trecho está sem áudio audível. Confira a fonte e tente novamente.");
        return;
      }
      atual.transcrevendo = true;
      estado.textContent = "Carregando o modelo local de voz…";
      obterWorker().postMessage({ id: atual.id, amostras }, [amostras.buffer]);
    } catch (erro) {
      if (sessao !== atual) return;
      console.error(erro);
      encerrar(atual, "Não foi possível ler o áudio capturado. Tente novamente.");
    }
  }

  function finalizar(atual) {
    if (sessao === atual && atual.gravador?.state === "recording") {
      clearTimeout(atual.limite);
      atual.gravador.stop();
    }
  }

  async function iniciar(fonte) {
    if (sessao) return;
    if (!navigator.mediaDevices || !window.MediaRecorder) {
      estado.textContent = "Abra o tradutor em uma aba do Google Chrome ou digite a frase.";
      return;
    }
    const atual = { id: ++proximoId, partes: [] };
    sessao = atual;
    microfone.disabled = true;
    guia.disabled = true;
    pararBotao.hidden = false;
    estado.textContent = fonte === "guia" ? "Selecione a guia e compartilhe o áudio." : "Abrindo o microfone…";
    try {
      const stream = fonte === "guia"
        ? await navigator.mediaDevices.getDisplayMedia({
          video: { displaySurface: "browser" },
          audio: { suppressLocalAudioPlayback: false },
          selfBrowserSurface: "exclude",
          systemAudio: "exclude",
        })
        : await navigator.mediaDevices.getUserMedia({ audio: true });
      if (sessao !== atual) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      atual.stream = stream;
      const [faixa] = stream.getAudioTracks();
      const superficie = stream.getVideoTracks()[0]?.getSettings().displaySurface;
      if (!faixa || (superficie && superficie !== "browser")) {
        encerrar(atual, "Selecione uma guia do Chrome e marque Compartilhar áudio da guia.");
        return;
      }
      const gravador = new MediaRecorder(new MediaStream([faixa]));
      atual.gravador = gravador;
      gravador.ondataavailable = ({ data }) => { if (data.size) atual.partes.push(data); };
      gravador.onstop = () => transcrever(atual);
      gravador.onerror = () => encerrar(atual, "A captura de áudio falhou. Tente novamente.");
      faixa.addEventListener("ended", () => finalizar(atual), { once: true });
      gravador.start();
      atual.limite = setTimeout(() => finalizar(atual), LIMITE_GRAVACAO);
      estado.textContent = fonte === "guia"
        ? "Capturando até 20 segundos da guia…"
        : "Escutando o microfone por até 20 segundos…";
    } catch (erro) {
      if (sessao !== atual) return;
      if (erro.name === "NotAllowedError" || erro.name === "AbortError") {
        encerrar(atual, "A captura de áudio foi cancelada ou bloqueada. Tente em uma aba do Chrome.");
      } else {
        console.error(erro);
        encerrar(atual, "Não foi possível iniciar a escuta. Tente em uma aba do Chrome ou digite a frase.");
      }
    }
  }

  microfone.addEventListener("click", () => iniciar("microfone"));
  guia.addEventListener("click", () => iniciar("guia"));
  pararBotao.addEventListener("click", () => {
    if (!sessao) return;
    if (sessao.gravador) finalizar(sessao);
    else encerrar(sessao, "Escuta cancelada.");
  });
  return () => { if (sessao) encerrar(sessao, "", true); };
}
