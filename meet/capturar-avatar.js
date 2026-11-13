(() => {
  "use strict";
  const CANAL = "libras-em-reuniao-meet-v1";
  const ORIGEM_EXTENSAO = typeof chrome !== "undefined" && /^[a-p]{32}$/.test(chrome.runtime?.id || "")
    ? "chrome-extension://" + chrome.runtime.id : null;
  const sessaoValida = valor => typeof valor === "string" && /^[a-zA-Z0-9._:-]{1,160}$/.test(valor);
  let sessao, origem, ativo = false, encerrado = false, falhou = false, geracao = 0;
  let procura, leitura, prazoAck, prazoPlay, stream, video, tela, contexto, pendente;
  let numeroQuadro = 0, ultimoEstado = "", inicioBusca, ultimoQuadro = 0, ultimoTempoVideo, ultimaAtualizacaoVideo = 0;
  function informar(estado, erro) {
    if (!origem || !sessao || estado === ultimoEstado) return;
    ultimoEstado = estado;
    window.parent.postMessage({
      canal: CANAL, tipo: "captura-status", sessao, estado, ...(erro ? { erro } : {})
    }, origem);
  }
  function limpar() {
    geracao += 1;
    clearTimeout(procura);
    clearInterval(leitura);
    clearTimeout(prazoAck);
    clearTimeout(prazoPlay);
    procura = leitura = prazoAck = prazoPlay = undefined;
    pendente = undefined;
    for (const track of stream?.getTracks() || []) track.stop();
    if (video) { video.pause(); video.srcObject = null; }
    stream = video = tela = contexto = undefined;
  }
  function falhar(estado, erro) {
    informar(estado, erro);
    ativo = false;
    falhou = true;
    limpar();
  }
  function enviarQuadro(token) {
    if (!ativo || token !== geracao || !video || !contexto) return;
    if (pendente !== undefined) return;
    if (video.readyState < 2 || !video.videoWidth || !video.videoHeight) {
      if (performance.now() - ultimoQuadro > 15000) falhar("O intérprete não está produzindo quadros de vídeo. Use Tentar novamente.", "NoFrames");
      return;
    }
    if (video.currentTime !== ultimoTempoVideo) {
      ultimoTempoVideo = video.currentTime;
      ultimaAtualizacaoVideo = performance.now();
    } else if (performance.now() - ultimaAtualizacaoVideo > 15000) {
      falhar("O vídeo do intérprete parou de atualizar. Use Tentar novamente.", "NoFrames");
      return;
    }
    let bitmap;
    try {
      // O Unity redimensiona o canvas depois de carregar e ao mudar o layout.
      const escala = Math.min(1, 320 / video.videoWidth, 360 / video.videoHeight);
      const w = Math.max(1, Math.round(video.videoWidth * escala));
      const h = Math.max(1, Math.round(video.videoHeight * escala));
      if (tela.width !== w) tela.width = w;
      if (tela.height !== h) tela.height = h;
      contexto.drawImage(video, 0, 0, tela.width, tela.height);
      bitmap = tela.transferToImageBitmap();
      pendente = ++numeroQuadro;
      window.parent.postMessage({ canal: CANAL, tipo: "avatar-frame", sessao, quadro: pendente, bitmap }, origem, [bitmap]);
      ultimoQuadro = performance.now();
      prazoAck = setTimeout(() => {
        if (ativo && token === geracao && pendente !== undefined) {
          informar("O Meet não confirmou os quadros do intérprete. Reconecte o Meet.", "AckTimeout");
        }
      }, 3000);
    } catch (erro) {
      bitmap?.close();
      falhar("O navegador não permitiu capturar o vídeo do intérprete. Use Tentar novamente.", erro?.name || "CaptureError");
    }
  }
  async function abrirCanvas(canvas, token) {
    try {
      if (typeof canvas.captureStream !== "function" || typeof OffscreenCanvas !== "function") {
        throw Object.assign(new Error("Captura de canvas indisponível."), { name: "NotSupportedError" });
      }
      stream = canvas.captureStream(12);
      video = document.createElement("video");
      video.muted = true;
      video.playsInline = true;
      video.srcObject = stream;
      const meuVideo = video;
      let prazoDestePlay;
      const esperandoQuadros = new Promise((_, reject) => {
        prazoDestePlay = setTimeout(() => reject(Object.assign(new Error("O canvas não produziu vídeo."), { name: "NoFrames" })), 15000);
        prazoPlay = prazoDestePlay;
      });
      try { await Promise.race([meuVideo.play(), esperandoQuadros]); }
      finally {
        clearTimeout(prazoDestePlay);
        if (prazoPlay === prazoDestePlay) prazoPlay = undefined;
      }
      if (!ativo || token !== geracao) {
        meuVideo.pause(); meuVideo.srcObject = null;
        return;
      }
      const largura = Math.max(1, canvas.width);
      const altura = Math.max(1, canvas.height);
      const escala = Math.min(1, 320 / largura, 360 / altura);
      tela = new OffscreenCanvas(Math.max(1, Math.round(largura * escala)), Math.max(1, Math.round(altura * escala)));
      contexto = tela.getContext("2d", { alpha: false, desynchronized: true });
      if (!contexto) throw Object.assign(new Error("Canvas 2D indisponível."), { name: "NotSupportedError" });
      ultimoQuadro = performance.now();
      ultimoTempoVideo = undefined;
      ultimaAtualizacaoVideo = ultimoQuadro;
      informar("Vídeo do intérprete pronto para o Meet.");
      leitura = setInterval(() => enviarQuadro(token), 100);
      enviarQuadro(token);
    } catch (erro) {
      if (ativo && token === geracao) falhar("Não foi possível capturar o intérprete. Use Tentar novamente.", erro?.name || "CaptureError");
    }
  }
  function procurarCanvas(token) {
    if (!ativo || token !== geracao) return;
    const canvases = Array.from(document.querySelectorAll("canvas"));
    const canvas = canvases.filter(item => item.width > 0 && item.height > 0)
      .sort((a, b) => b.width * b.height - a.width * a.height)[0];
    if (canvas) { abrirCanvas(canvas, token); return; }
    if (performance.now() - inicioBusca >= 60000) {
      falhar("O vídeo do intérprete não carregou. Use Tentar novamente.", "CanvasTimeout");
      return;
    }
    procura = setTimeout(() => procurarCanvas(token), 250);
  }
  function receber(evento) {
    const { source, origin, data } = evento;
    if (encerrado || window.parent === window || source !== window.parent ||
        !ORIGEM_EXTENSAO || origin !== ORIGEM_EXTENSAO || data?.canal !== CANAL ||
        !sessaoValida(data.sessao)) return;
    if (data.tipo === "avatar-frame-ack") {
      if (!ativo || pendente === undefined || !Number.isSafeInteger(data.quadro) || data.sessao !== sessao || data.quadro !== pendente) return;
      clearTimeout(prazoAck);
      prazoAck = undefined;
      pendente = undefined;
      return;
    }
    if (data.tipo !== "capturar-avatar" || typeof data.ativo !== "boolean") return;
    if (!data.ativo) {
      if (data.sessao === sessao) { ativo = false; falhou = false; limpar(); }
      return;
    }
    if ((ativo || falhou) && data.sessao === sessao && origem === origin) return;
    limpar();
    sessao = data.sessao;
    origem = origin;
    ativo = true;
    falhou = false;
    ultimoEstado = "";
    inicioBusca = performance.now();
    informar("Preparando o vídeo do intérprete para o Meet…");
    procurarCanvas(geracao);
  }
  function destruir() {
    if (encerrado) return;
    ativo = false;
    encerrado = true;
    limpar();
    window.removeEventListener("message", receber);
    window.removeEventListener("pagehide", destruir);
  }
  window.addEventListener("message", receber);
  window.addEventListener("pagehide", destruir);
})();
