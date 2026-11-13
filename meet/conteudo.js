(() => {
  "use strict";
  const canal = "libras-em-reuniao-meet-v1", origem = location.origin;
  const origemExtensao = "chrome-extension://" + chrome.runtime.id;
  let porta, sessao, config, quadro, caixa, rotulo, ativa = true, reconectar;
  const enviarMain = (d, transfer = []) => window.postMessage({ canal, sessao, ...d }, origem, transfer);
  function removerAvatar() { caixa?.remove(); caixa = quadro = rotulo = undefined; }
  function atualizarAvatar() {
    if (!config?.conectado || config.modo !== "fala") { removerAvatar(); return; }
    if (!caixa) {
      caixa = document.createElement("div");
      caixa.id = "libras-em-reuniao-meet";
      Object.assign(caixa.style, { position: "fixed", zIndex: "2147483646", background: "#fff", color: "#11114e",
        border: "2px solid #846dc2", borderRadius: "12px", boxShadow: "0 4px 24px #11114e40", overflow: "hidden",
        font: "12px system-ui", display: "flex", flexDirection: "column" });
      rotulo = document.createElement("div");
      rotulo.textContent = "Libras em Reunião · preparando câmera";
      Object.assign(rotulo.style, { padding: "5px 8px", background: "#f7f7fc" });
      quadro = document.createElement("iframe");
      quadro.title = "Intérprete de Libras da reunião";
      quadro.src = chrome.runtime.getURL("meet/avatar.html");
      quadro.allow = "autoplay";
      Object.assign(quadro.style, { width: "100%", height: "100%", border: "0", flex: "1", minHeight: "0" });
      caixa.append(rotulo, quadro);
      (document.body || document.documentElement).append(caixa);
    }
    const tamanhos = { pequeno: [190, 265], medio: [230, 320], grande: [285, 390] };
    const [w, h] = tamanhos[config.tamanho] || tamanhos.medio;
    caixa.style.width = "min(" + w + "px, 35vw)";
    caixa.style.height = "min(" + h + "px, 65vh)";
    caixa.style.left = config.posicao.endsWith("esquerdo") ? "16px" : "auto";
    caixa.style.right = config.posicao.endsWith("direito") ? "16px" : "auto";
    caixa.style.top = config.posicao.startsWith("superior") ? "16px" : "auto";
    caixa.style.bottom = config.posicao.startsWith("inferior") ? "88px" : "auto";
  }
  function ligar() {
    if (!ativa) return;
    try {
      porta = chrome.runtime.connect({ name: "libras-meet" });
      const atual = porta;
      atual.onMessage.addListener((d) => {
        if (porta !== atual) return;
        if (d?.tipo === "config" && typeof d.sessao === "string") {
          sessao = d.sessao; config = d.config;
          enviarMain({ tipo: "config", config });
          atualizarAvatar();
        } else if (d?.sessao === sessao && ["audio", "audio-parar"].includes(d.tipo)) enviarMain(d);
        else if (d?.tipo === "desconectar" && d.sessao === sessao) {
          enviarMain({ tipo: "desconectar" }); removerAvatar(); config = undefined; sessao = undefined;
        }
      });
      atual.onDisconnect.addListener(() => {
        if (porta !== atual) return;
        enviarMain({ tipo: "desconectar" }); removerAvatar(); sessao = config = undefined; porta = undefined;
        try { if (chrome.runtime.id && ativa) reconectar = setTimeout(ligar, 1000); } catch {}
      });
    } catch { removerAvatar(); }
  }
  const escutar = (e) => {
    const d = e.data;
    if (!d || d.canal !== canal) return;
    if (e.source === quadro?.contentWindow && e.origin === origemExtensao) {
      if (d.tipo === "avatar-frame" && d.bitmap instanceof ImageBitmap) {
        if (d.sessao !== sessao || config?.modo !== "fala" || !Number.isSafeInteger(d.quadro) ||
            d.bitmap.width < 1 || d.bitmap.height < 1 || d.bitmap.width > 320 || d.bitmap.height > 360) {
          d.bitmap.close();
          quadro?.contentWindow?.postMessage({ canal, tipo: "avatar-frame-ack", sessao: d.sessao, quadro: d.quadro }, origemExtensao);
          return;
        }
        try { enviarMain({ tipo: d.tipo, quadro: d.quadro, bitmap: d.bitmap }, [d.bitmap]); }
        catch {
          d.bitmap.close();
          quadro?.contentWindow?.postMessage({ canal, tipo: "avatar-frame-ack", sessao, quadro: d.quadro }, origemExtensao);
        }
      } else if (d.tipo === "captura-status" && d.sessao === sessao) {
        try { porta?.postMessage({ tipo: d.tipo, sessao, estado: String(d.estado || "").slice(0, 250) }); } catch {}
      }
      return;
    }
    if (e.source !== window || e.origin !== origem || d.sessao !== sessao || !sessao) return;
    if (d.tipo === "avatar-frame-ack") quadro?.contentWindow?.postMessage(d, origemExtensao);
    if (["midia-status", "audio-recebido"].includes(d.tipo)) {
      if (d.tipo === "midia-status" && rotulo) rotulo.textContent = d.camera && d.avatar
        ? "Avatar integrado à câmera · confira com outro participante"
        : "Avatar local · aguardando câmera e quadros";
      try { porta?.postMessage(d); } catch {}
    }
  };
  window.addEventListener("message", escutar);
  const batida = setInterval(() => { try { porta?.postMessage({ tipo: "ping", sessao }); } catch {} }, 20000);
  window.addEventListener("pagehide", () => {
    ativa = false; clearInterval(batida); clearTimeout(reconectar);
    enviarMain({ tipo: "desconectar" }); removerAvatar(); porta?.disconnect();
    window.removeEventListener("message", escutar);
  }, { once: true });
  ligar();
})();
