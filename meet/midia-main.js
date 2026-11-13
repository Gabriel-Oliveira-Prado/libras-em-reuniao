(() => {
  "use strict";
  const CANAL = "libras-em-reuniao-meet-v1";
  if (location.hostname !== "meet.google.com" || location.protocol !== "https:" ||
      !navigator.mediaDevices?.getUserMedia || window.__librasMeetMidiaInstalada) return;
  Object.defineProperty(window, "__librasMeetMidiaInstalada", { value: true });
  const original = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
  const videos = new Set(), audios = new Set(), fontesPcm = new Set(), esperasCamera = new Set();
  let sessao = null;
  let config = { conectado: false, modo: "fala", posicao: "inferior-esquerdo", tamanho: "medio", vozNoMeet: true };
  let contextoAudio = null, fimPcm = 0, geracaoPcm = 0, preparacaoAudio = false;
  let quadroAvatar = null, ultimaImagem = -Infinity, desenhadoAvatar = false;
  let ultimoErro = "", ultimoStatus = "";
  const agora = () => performance.now();
  const aoMeet = mensagem => window.postMessage({ canal: CANAL, sessao, ...mensagem }, location.origin);
  const vivo = controlador => !controlador.fechado && controlador.original.readyState !== "ended" &&
    [...controlador.faixas.keys()].some(faixa => faixa.readyState !== "ended");
  const habilitado = controlador => vivo(controlador) && !controlador.original.muted &&
    [...controlador.faixas.keys()].some(faixa => faixa.readyState !== "ended" && faixa.enabled);
  function status(erro) {
    if (erro !== undefined) ultimoErro = erro;
    if (!sessao) return;
    const camera = [...videos].some(vivo), audio = [...audios].some(vivo);
    const erroPreparacao = preparacaoAudio && config.conectado && config.vozNoMeet
      ? contextoAudio?.state === "running"
        ? "Áudio liberado. Desative e ative o microfone no Meet para integrar a voz. O microfone original foi preservado."
        : "O microfone original foi preservado. Clique no Meet e depois desative e ative o microfone para integrar a voz."
      : "";
    const mensagem = {
      tipo: "midia-status", camera, audio,
      avatar: !!(config.conectado && config.modo === "fala" && desenhadoAvatar &&
        quadroAvatar && agora() - ultimaImagem <= 2500 && [...videos].some(habilitado)),
      ativarAudio: !!(config.conectado && (audio || preparacaoAudio) && contextoAudio?.state === "suspended"),
      ...((ultimoErro || erroPreparacao) ? { erro: ultimoErro || erroPreparacao } : {})
    };
    const serializado = JSON.stringify({ sessao, ...mensagem });
    if (serializado !== ultimoStatus) {
      ultimoStatus = serializado;
      aoMeet(mensagem);
    }
  }
  function limparAvatar() {
    quadroAvatar = null;
    ultimaImagem = -Infinity;
    desenhadoAvatar = false;
  }
  function cancelarPcm() {
    geracaoPcm++;
    for (const entrada of fontesPcm) {
      try { entrada.fonte.stop(); } catch {}
      try { entrada.fonte.disconnect(); } catch {}
    }
    fontesPcm.clear();
    fimPcm = contextoAudio?.currentTime ?? 0;
  }
  function contexto() {
    if (contextoAudio && contextoAudio.state !== "closed") return contextoAudio;
    const Classe = window.AudioContext || window.webkitAudioContext;
    if (!Classe) throw new Error("Este navegador não disponibilizou o mixer de áudio.");
    const criado = new Classe({ latencyHint: "interactive" });
    contextoAudio = criado;
    criado.onstatechange = () => { if (contextoAudio === criado) status(); };
    fimPcm = criado.currentTime;
    return criado;
  }
  function liberarContextoSemMicrofone() {
    if (audios.size || !contextoAudio || (preparacaoAudio && config.conectado && config.vozNoMeet)) return;
    cancelarPcm();
    const anterior = contextoAudio;
    contextoAudio = null;
    anterior.onstatechange = null;
    try { anterior.close()?.catch?.(() => {}); } catch {}
  }
  function limparPreparacaoAudio() {
    preparacaoAudio = false;
    liberarContextoSemMicrofone();
  }
  // Somente um clique verdadeiro na página, ou a ativação já concedida pelo
  // navegador, tenta liberar o contexto. A política de autoplay continua válida.
  // Nenhum áudio do mixer é conectado a contexto.destination.
  document.addEventListener("click", evento => {
    if (!evento.isTrusted || !config.conectado || (!audios.size && !preparacaoAudio) ||
        contextoAudio?.state !== "suspended") return;
    const alvo = contextoAudio;
    alvo.resume().then(() => { if (contextoAudio === alvo) status(""); })
      .catch(() => status("Clique no Meet para permitir o áudio da extensão."));
  }, true);

  function descritorHabilitado(faixa) {
    let prototipo = faixa;
    while (prototipo) {
      const descritor = Object.getOwnPropertyDescriptor(prototipo, "enabled");
      if (descritor?.get && descritor?.set) return descritor;
      prototipo = Object.getPrototypeOf(prototipo);
    }
    throw new Error("Não foi possível preservar o controle do microfone e da câmera.");
  }
  function controladorFaixas(faixaOriginal, faixaSaida, recursos, conjunto) {
    const controlador = {
      original: faixaOriginal, faixas: new Map(), fechado: false,
      destino: recursos.destino,
      liberar(pararOriginal = true) {
        if (this.fechado) return;
        this.fechado = true;
        conjunto.delete(this);
        faixaOriginal.removeEventListener("ended", terminouOriginal);
        faixaOriginal.removeEventListener("mute", mudouMute);
        faixaOriginal.removeEventListener("unmute", mudouMute);
        for (const [faixa, metodos] of this.faixas) {
          faixa.removeEventListener("ended", metodos.terminou);
          try { metodos.stop(); } catch {}
        }
        this.faixas.clear();
        try { recursos.liberar(); } catch {}
        if (pararOriginal && faixaOriginal.readyState !== "ended") faixaOriginal.stop();
        if (conjunto === audios) liberarContextoSemMicrofone();
        status();
      }
    };
    const sincronizarHabilitado = () => {
      faixaOriginal.enabled = [...controlador.faixas.keys()]
        .some(faixa => faixa.readyState !== "ended" && faixa.enabled);
      if (conjunto === audios && ![...audios].some(habilitado)) cancelarPcm();
      status();
    };
    const terminouOriginal = () => {
      const faixas = [...controlador.faixas.keys()];
      controlador.liberar(false);
      for (const faixa of faixas) faixa.dispatchEvent(new Event("ended"));
    };
    const mudouMute = evento => {
      for (const faixa of controlador.faixas.keys()) faixa.dispatchEvent(new Event(evento.type));
      if (conjunto === audios && ![...audios].some(habilitado)) cancelarPcm();
      status();
    };
    function acompanhar(faixa, primeira = false) {
      const pararNativo = faixa.stop.bind(faixa);
      const clonarNativo = faixa.clone.bind(faixa);
      const settingsNativo = faixa.getSettings.bind(faixa);
      const habilitarNativo = descritorHabilitado(faixa);
      if (primeira) habilitarNativo.set.call(faixa, faixaOriginal.enabled);
      const terminou = () => {
        const metodos = controlador.faixas.get(faixa);
        if (!metodos) return;
        faixa.removeEventListener("ended", terminou);
        controlador.faixas.delete(faixa);
        if (!controlador.faixas.size) controlador.liberar();
        else sincronizarHabilitado();
      };
      // As cópias mantêm o mesmo processamento. A fonte só é encerrada quando
      // a última faixa retornada/copied for encerrada pelo Meet.
      Object.defineProperties(faixa, {
        enabled: {
          configurable: true,
          get: () => habilitarNativo.get.call(faixa),
          set: valor => { habilitarNativo.set.call(faixa, valor); sincronizarHabilitado(); }
        },
        stop: { configurable: true, value: () => { pararNativo(); terminou(); } },
        clone: { configurable: true, value: () => {
          const copia = clonarNativo();
          if (controlador.fechado) return copia;
          try { return acompanhar(copia); }
          catch (erro) { copia.stop(); throw erro; }
        } },
        getSettings: { configurable: true, value: () => ({
          ...faixaOriginal.getSettings(), ...settingsNativo(),
          deviceId: faixaOriginal.getSettings().deviceId,
          groupId: faixaOriginal.getSettings().groupId
        }) },
        getConstraints: { configurable: true, value: () => faixaOriginal.getConstraints() },
        getCapabilities: { configurable: true, value: () => faixaOriginal.getCapabilities?.() ?? {} },
        applyConstraints: { configurable: true, value: restricoes => faixaOriginal.applyConstraints(restricoes) },
        label: { configurable: true, get: () => faixaOriginal.label },
        muted: { configurable: true, get: () => faixaOriginal.muted }
      });
      controlador.faixas.set(faixa, { stop: pararNativo, terminou });
      faixa.addEventListener("ended", terminou);
      return faixa;
    }
    faixaOriginal.addEventListener("ended", terminouOriginal);
    faixaOriginal.addEventListener("mute", mudouMute);
    faixaOriginal.addEventListener("unmute", mudouMute);
    try {
      acompanhar(faixaSaida, true);
      conjunto.add(controlador);
      return controlador;
    } catch (erro) {
      controlador.liberar(false);
      throw erro;
    }
  }
  function cancelarEsperasCamera() {
    for (const cancelar of [...esperasCamera]) cancelar();
  }
  function esperarVideo(video, faixaOriginal) {
    return new Promise((resolver, rejeitar) => {
      let encerrada = false, prazo;
      const limpar = () => {
        encerrada = true;
        clearTimeout(prazo);
        esperasCamera.delete(cancelar);
        faixaOriginal.removeEventListener("ended", cancelar);
      };
      const cancelar = () => {
        if (encerrada) return;
        limpar();
        rejeitar(new Error("A abertura da câmera foi cancelada ou excedeu 15 segundos."));
      };
      esperasCamera.add(cancelar);
      faixaOriginal.addEventListener("ended", cancelar);
      prazo = setTimeout(cancelar, 15000);
      try {
        Promise.resolve(video.play()).then(() => {
          if (encerrada) return;
          limpar();
          resolver();
        }, erro => {
          if (encerrada) return;
          limpar();
          rejeitar(erro);
        });
      } catch (erro) {
        limpar();
        rejeitar(erro);
      }
    });
  }
  async function comporCamera(faixaOriginal) {
    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.srcObject = new MediaStream([faixaOriginal]);
    const canvas = document.createElement("canvas");
    const desenho = canvas.getContext("2d", { alpha: false, desynchronized: true });
    if (!desenho || !canvas.captureStream) {
      video.pause();
      video.srcObject = null;
      throw new Error("Composição da câmera indisponível.");
    }
    let pedido = null, ativo = true, controle = null, ultimoDesenho = -Infinity;
    const ajustar = () => {
      const dados = faixaOriginal.getSettings();
      const largura = video.videoWidth || dados.width || 640;
      const altura = video.videoHeight || dados.height || 480;
      // Não distorce a câmera nem altera a proporção quando limita a resolução.
      const escala = Math.min(1, 3840 / largura, 2160 / altura);
      const w = Math.max(16, Math.round(largura * escala));
      const h = Math.max(16, Math.round(altura * escala));
      if (canvas.width !== w) canvas.width = w;
      if (canvas.height !== h) canvas.height = h;
    };
    const desenhar = instante => {
      if (!ativo) return;
      if (instante - ultimoDesenho >= 40) {
        ultimoDesenho = instante;
        ajustar();
        let desenhouAvatar = false;
        try {
          desenho.fillStyle = "#000000";
          desenho.fillRect(0, 0, canvas.width, canvas.height);
          desenho.drawImage(video, 0, 0, canvas.width, canvas.height);
          if (config.conectado && config.modo === "fala" && quadroAvatar &&
              agora() - ultimaImagem <= 2500 && (!controle || habilitado(controle))) {
            const proporcao = quadroAvatar.width / quadroAvatar.height;
            const alturaMaxima = canvas.height * ({ pequeno: 0.22, medio: 0.28, grande: 0.35 }[config.tamanho]);
            const largura = Math.min(alturaMaxima * proporcao, canvas.width * 0.45);
            const altura = largura / proporcao;
            const margem = Math.max(8, Math.round(canvas.height * 0.025));
            const x = config.posicao.endsWith("esquerdo") ? margem : canvas.width - largura - margem;
            const y = config.posicao.startsWith("superior") ? margem : canvas.height - altura - margem;
            desenho.drawImage(quadroAvatar, x, y, largura, altura);
            desenhouAvatar = true;
          }
          if (desenhouAvatar) desenhadoAvatar = true;
          else if (![...videos].some(outro => outro !== controle && habilitado(outro))) desenhadoAvatar = false;
        } catch {
          desenhadoAvatar = false;
          status("Não foi possível compor a imagem da câmera. Reconecte a câmera no Meet.");
        }
        status();
      }
    };
    const liberar = () => {
      ativo = false;
      if (pedido !== null) clearInterval(pedido);
      video.pause();
      video.srcObject = null;
      canvas.width = canvas.height = 1;
    };
    try {
      await esperarVideo(video, faixaOriginal);
      ajustar();
      desenho.drawImage(video, 0, 0, canvas.width, canvas.height);
      const saida = canvas.captureStream(25);
      const faixa = saida.getVideoTracks()[0];
      if (!faixa) throw new Error("O navegador não criou a câmera com avatar.");
      try { controle = controladorFaixas(faixaOriginal, faixa, { liberar }, videos); }
      catch (erro) { faixa.stop(); throw erro; }
      // Timers continuam produzindo quadros quando a aba não está visível;
      // requestAnimationFrame para completamente nas abas em segundo plano.
      pedido = setInterval(() => desenhar(agora()), 40);
      return { faixa, controle };
    } catch (erro) {
      liberar();
      throw erro;
    }
  }
  async function misturarMicrofone(faixaOriginal, permitido) {
    if (!permitido()) return null;
    const ctx = contexto();
    if (ctx.state !== "running" && navigator.userActivation?.hasBeenActive === true) {
      // Não aguarda indefinidamente uma promessa de autoplay. O retorno nativo
      // continua disponível se a tentativa não liberar áudio imediatamente.
      try { ctx.resume().catch(() => {}); } catch {}
      await Promise.resolve();
    }
    if (!permitido() || ctx !== contextoAudio) return null;
    if (ctx.state !== "running") {
      preparacaoAudio = true;
      status("");
      return null;
    }
    preparacaoAudio = false;
    let entrada, destino, faixa;
    try {
      entrada = ctx.createMediaStreamSource(new MediaStream([faixaOriginal]));
      destino = ctx.createMediaStreamDestination();
      faixa = destino.stream.getAudioTracks()[0];
      if (!faixa) throw new Error("O navegador não criou o microfone da extensão.");
      entrada.connect(destino);
      const liberar = () => {
        entrada.disconnect();
        for (const item of fontesPcm) {
          try { item.fonte.disconnect(destino); } catch {}
        }
      };
      const controle = controladorFaixas(faixaOriginal, faixa, { liberar, destino }, audios);
      return { faixa, controle };
    } catch (erro) {
      try { entrada?.disconnect(); } catch {}
      try { faixa?.stop(); } catch {}
      liberarContextoSemMicrofone();
      throw erro;
    }
  }
  navigator.mediaDevices.getUserMedia = async function (restricoes) {
    const sessaoNaSolicitacao = sessao;
    const integrar = config.conectado;
    const integrarAudio = integrar && config.vozNoMeet;
    const audioPermitido = () => integrarAudio && config.conectado && config.vozNoMeet && sessao === sessaoNaSolicitacao;
    let capturado;
    try { capturado = await original(restricoes); }
    catch (erro) {
      if (integrar) status("O Meet não conseguiu abrir os dispositivos. Confira as permissões de câmera e microfone.");
      throw erro;
    }
    const alteradas = [], controles = [];
    try {
      for (const faixa of capturado.getTracks()) {
        // O Meet pode pedir a câmera antes de o painel terminar a conexão.
        // A mesma faixa composta recebe o avatar quando a configuração chega,
        // sem recapturar dispositivos nem substituir a faixa já enviada.
        const resultado = faixa.kind === "video" ? await comporCamera(faixa) :
          faixa.kind === "audio" && audioPermitido() ? await misturarMicrofone(faixa, audioPermitido) : null;
        if (resultado) {
          controles.push(resultado.controle);
          alteradas.push(resultado.faixa);
        } else alteradas.push(faixa);
      }
      // A câmera independe da sessão. Áudio só pode ser integrado quando o
      // pedido começou conectado e essa mesma autorização ainda está ativa.
      if (!audioPermitido()) {
        for (const controle of controles) {
          if (controle.original.kind !== "audio") continue;
          const indice = alteradas.findIndex(faixa => controle.faixas.has(faixa));
          if (indice !== -1) alteradas[indice] = controle.original;
          controle.liberar(false);
        }
        if (integrarAudio) limparPreparacaoAudio();
      }
      const houveMudanca = alteradas.some((faixa, indice) => faixa !== capturado.getTracks()[indice]);
      const composto = houveMudanca ? new MediaStream(alteradas) : capturado;
      status("");
      return composto;
    } catch {
      for (const controle of controles) controle.liberar(false);
      status("Integração de mídia indisponível. O Meet recebeu a câmera e o microfone originais.");
      return capturado;
    }
  };

  const idValido = id => Number.isSafeInteger(id) && id >= 1;
  function receberAudio(dados) {
    const id = dados.id;
    const responder = (aceito, erro) => {
      if (idValido(id)) aoMeet({ tipo: "audio-recebido", id, aceito, ...(erro ? { erro } : {}) });
      if (erro) status(erro);
    };
    if (!idValido(id)) return;
    const amostras = dados.samples, taxa = dados.sampleRate;
    if (!Array.isArray(amostras) || !amostras.length || !Number.isInteger(taxa) ||
        taxa < 8000 || taxa > 48000 || amostras.length > taxa * 20 ||
        (dados.frase !== undefined && (typeof dados.frase !== "string" || dados.frase.length > 500)) ||
        amostras.some(n => typeof n !== "number" || !Number.isFinite(n) || n < -1 || n > 1)) {
      responder(false, "O áudio recebido pela integração é inválido.");
      return;
    }
    if (!config.conectado || !config.vozNoMeet) {
      responder(false, "Ative a voz no Meet nas opções da extensão.");
      return;
    }
    if (![...audios].some(vivo)) {
      responder(false, "Reconecte o microfone no Meet depois de conectar a extensão.");
      return;
    }
    if (![...audios].some(habilitado)) {
      responder(false, "O microfone do Meet está desligado. Ative-o para enviar a voz.");
      return;
    }
    const ctx = contextoAudio;
    if (!ctx || ctx.state !== "running") {
      responder(false, "Clique na página do Meet para liberar o áudio da extensão e repita o sinal.");
      return;
    }
    const inicio = Math.max(ctx.currentTime + 0.02, fimPcm);
    const duracao = amostras.length / taxa;
    if (inicio + duracao - ctx.currentTime > 15) {
      responder(false, "A fila de voz no Meet está cheia. Aguarde e repita o sinal.");
      return;
    }
    let fonte;
    try {
      const buffer = ctx.createBuffer(1, amostras.length, taxa);
      buffer.getChannelData(0).set(amostras);
      fonte = ctx.createBufferSource();
      fonte.buffer = buffer;
      for (const controle of audios) if (habilitado(controle)) fonte.connect(controle.destino);
      const entrada = { fonte, geracao: geracaoPcm };
      fontesPcm.add(entrada);
      fonte.onended = () => {
        fontesPcm.delete(entrada);
        try { fonte.disconnect(); } catch {}
      };
      fonte.start(inicio);
      fimPcm = inicio + duracao + 0.04;
      responder(true);
      status("");
    } catch {
      if (fonte) {
        for (const entrada of fontesPcm) if (entrada.fonte === fonte) fontesPcm.delete(entrada);
        try { fonte.stop(); } catch {}
        try { fonte.disconnect(); } catch {}
      }
      responder(false, "Não foi possível enviar a voz ao microfone do Meet.");
    }
  }
  function receberQuadro(dados) {
    const bitmap = dados.bitmap;
    const imagemValida = typeof window.ImageBitmap === "function" && bitmap instanceof window.ImageBitmap;
    const quadroValido = Number.isSafeInteger(dados.quadro) && dados.quadro >= 0;
    try {
      if (!quadroValido || !imagemValida || !config.conectado || config.modo !== "fala") return;
      if (bitmap.width < 1 || bitmap.height < 1 || bitmap.width > 320 || bitmap.height > 360) {
        status("O quadro do avatar excedeu o tamanho permitido.");
        return;
      }
      const canvas = quadroAvatar || document.createElement("canvas");
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const desenho = canvas.getContext("2d");
      if (!desenho) throw new Error("Avatar sem contexto de imagem.");
      desenho.clearRect(0, 0, canvas.width, canvas.height);
      desenho.drawImage(bitmap, 0, 0);
      quadroAvatar = canvas;
      ultimaImagem = agora();
      status("");
    } catch {
      limparAvatar();
      status("Não foi possível receber a imagem do avatar.");
    } finally {
      if (imagemValida) bitmap.close();
      if (quadroValido) aoMeet({ tipo: "avatar-frame-ack", quadro: dados.quadro });
    }
  }
  window.addEventListener("message", evento => {
    const dados = evento.data;
    if (evento.source !== window || evento.origin !== location.origin ||
        !dados || dados.canal !== CANAL) return;
    if (dados.tipo === "config") {
      const proposta = dados.config;
      if (typeof dados.sessao !== "string" || !dados.sessao || dados.sessao.length > 120 ||
          !proposta || typeof proposta.conectado !== "boolean" ||
          !["fala", "sinais"].includes(proposta.modo) ||
          !["inferior-esquerdo", "inferior-direito", "superior-esquerdo", "superior-direito"].includes(proposta.posicao) ||
          !["pequeno", "medio", "grande"].includes(proposta.tamanho) ||
          typeof proposta.vozNoMeet !== "boolean") return;
      if (!proposta.conectado) cancelarEsperasCamera();
      if (sessao !== dados.sessao || !proposta.conectado) {
        limparPreparacaoAudio();
      }
      if (sessao !== dados.sessao || proposta.modo !== config.modo || !proposta.conectado) {
        cancelarPcm();
        limparAvatar();
      }
      sessao = dados.sessao;
      config = { ...proposta };
      if (!config.vozNoMeet) { cancelarPcm(); limparPreparacaoAudio(); }
      status("");
      return;
    }
    if (!sessao || dados.sessao !== sessao) return;
    if (dados.tipo === "audio") receberAudio(dados);
    else if (dados.tipo === "audio-parar") cancelarPcm();
    else if (dados.tipo === "avatar-frame") receberQuadro(dados);
    else if (dados.tipo === "desconectar") {
      config = { ...config, conectado: false };
      cancelarEsperasCamera();
      cancelarPcm();
      limparPreparacaoAudio();
      limparAvatar();
      status("");
    }
  });
  setInterval(() => {
    // stop() chamado diretamente no protótipo nativo não dispara ended.
    // Remove também essas faixas para não manter dispositivos sem consumidor.
    for (const controle of [...videos, ...audios]) {
      for (const [faixa, metodos] of [...controle.faixas]) {
        if (faixa.readyState === "ended") metodos.terminou();
      }
    }
    if (quadroAvatar && agora() - ultimaImagem > 2500) {
      limparAvatar();
      status("O avatar parou de enviar imagens. A câmera continua sem ele.");
    }
  }, 250);
})();