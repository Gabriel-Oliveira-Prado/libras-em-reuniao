import { configuracao, ehMeet, audioValido, glosaValida } from "./protocolo.mjs";

// Somente um painel dirige uma reunião; nenhuma mensagem escolhe URLs de rede.
export function instalarServicoMeet(api) {
  const meets = new Map(), avatares = new Map();
  let atual, pedidoConexao = 0;
  const pagina = (url, caminho) => {
    try { const u = new URL(url); return u.protocol === "chrome-extension:" && u.host === api.runtime.id && u.pathname === caminho; }
    catch { return false; }
  };
  const enviar = (porta, dado) => { try { porta?.postMessage(dado); return Boolean(porta); } catch { return false; } };
  function limpar(motivo = "Integração desligada.") {
    if (!atual) return;
    enviar(meets.get(atual.tabId), { tipo: "desconectar", sessao: atual.sessao });
    enviar(avatares.get(atual.tabId), { tipo: "desconectar", sessao: atual.sessao });
    enviar(atual.painel, { tipo: "desconectado", motivo });
    atual = undefined;
  }
  function informarConexao(disponivel) {
    if (!atual) return;
    enviar(atual.painel, { tipo: "conectado", sessao: atual.sessao, tabId: atual.tabId,
      disponivel, confirmado: atual.confirmado === true, config: atual.config });
  }
  function configurar() {
    if (!atual) return;
    const d = { tipo: "config", sessao: atual.sessao, config: atual.config };
    const disponivel = enviar(meets.get(atual.tabId), d);
    enviar(avatares.get(atual.tabId), d);
    informarConexao(disponivel);
  }
  function encaminharAvatar(d) {
    if (!atual) return false;
    const enviado = enviar(avatares.get(atual.tabId), { ...d, sessao: atual.sessao });
    if (!enviado && ["avatar-texto", "avatar-sinal"].includes(d.tipo)) {
      if (atual.textos.length >= 12) return false;
      atual.textos.push(d);
    }
    return true;
  }
  api.runtime.onConnect.addListener((porta) => {
    const remetente = porta.sender;
    if (remetente?.id !== api.runtime.id) { porta.disconnect(); return; }
    if (porta.name === "libras-painel" && pagina(remetente.url, "/painel/index.html")) {
      let aberta = true;
      porta.onMessage.addListener(async (d) => {
        if (!d || typeof d !== "object") return;
        if (d.tipo === "listar") {
          try {
            const tabs = await api.tabs.query({ url: "https://meet.google.com/*" });
            enviar(porta, { tipo: "reunioes", pedido: d.pedido, reunioes: tabs.filter((t) => Number.isInteger(t.id) && ehMeet(t.url))
              .map((t) => ({ id: t.id, titulo: String(t.title || "Google Meet").slice(0, 160), ativa: Boolean(t.active) })) });
          } catch { enviar(porta, { tipo: "erro", erro: "Não consegui listar as guias do Meet." }); }
          return;
        }
        if (d.tipo === "desconectar") {
          pedidoConexao++;
          if (atual?.painel === porta) limpar();
          return;
        }
        if (d.tipo === "conectar") {
          const pedido = ++pedidoConexao;
          try {
            const tab = Number.isInteger(d.tabId) ? await api.tabs.get(d.tabId) : null;
            if (!aberta || pedido !== pedidoConexao) return;
            if (!tab || !ehMeet(tab.url)) throw new Error("Escolha uma guia do Google Meet.");
            limpar("Outra conexão com o Meet foi iniciada.");
            atual = { painel: porta, tabId: tab.id, sessao: crypto.randomUUID(), config: configuracao(d.config), textos: [], confirmado: false };
            configurar();
          } catch (e) { if (aberta && pedido === pedidoConexao) enviar(porta, { tipo: "erro", erro: e.message || "Não consegui conectar ao Meet." }); }
          return;
        }
        if (!atual || atual.painel !== porta) return;
        if (d.tipo === "config") {
          atual.config = configuracao(d.config);
          if (atual.config.modo !== "fala") atual.textos.length = 0;
          configurar(); return;
        }
        if (d.tipo === "avatar-texto" && atual.config.modo === "fala" && typeof d.texto === "string" &&
            d.texto.trim() && d.texto.length <= 500) {
          if (!encaminharAvatar({ tipo: d.tipo, texto: d.texto }))
            enviar(porta, { tipo: "erro", erro: "O avatar do Meet está cheio. Aguarde os trechos pendentes." });
        }
        if (d.tipo === "avatar-sinal" && atual.config.modo === "fala" && glosaValida(d.glosa) &&
            typeof d.rotulo === "string" && d.rotulo.length <= 160) {
          if (!encaminharAvatar({ tipo: d.tipo, glosa: d.glosa, rotulo: d.rotulo }))
            enviar(porta, { tipo: "erro", erro: "O avatar está com muitos sinais pendentes. Aguarde a sinalização." });
        }
        if (d.tipo === "avatar-parar") { atual.textos.length = 0; encaminharAvatar({ tipo: d.tipo }); }
        if (d.tipo === "audio-parar") enviar(meets.get(atual.tabId), { tipo: d.tipo, sessao: atual.sessao });
        if (d.tipo === "audio" && (!atual.config.vozNoMeet || !audioValido(d))) {
          if (Number.isSafeInteger(d.id)) enviar(porta, { tipo: "audio-recebido", id: d.id, aceito: false, erro: "Áudio inválido ou envio de voz desligado." });
          return;
        }
        if (d.tipo === "audio" && atual.config.vozNoMeet && audioValido(d)) {
          if (!enviar(meets.get(atual.tabId), { ...d, sessao: atual.sessao }))
            enviar(porta, { tipo: "audio-recebido", id: d.id, aceito: false, erro: "Atualize a guia do Meet e confira o microfone integrado." });
        }
      });
      porta.onDisconnect.addListener(() => { aberta = false; if (atual?.painel === porta) limpar("Painel fechado. Integração desligada."); });
      return;
    }
    const id = remetente?.tab?.id;
    if (porta.name === "libras-meet" && Number.isInteger(id) && remetente.frameId === 0 && ehMeet(remetente.url)) {
      const anterior = meets.get(id);
      if (anterior && anterior !== porta) { try { anterior.disconnect(); } catch {} }
      meets.set(id, porta);
      if (atual?.tabId === id) { atual.confirmado = false; configurar(); }
      porta.onMessage.addListener((d) => {
        if (meets.get(id) !== porta || !atual || atual.tabId !== id ||
            (d?.tipo !== "meet-pronto" && d?.sessao !== atual.sessao)) return;
        if (d.tipo === "meet-pronto") {
          atual.confirmado = false;
          configurar();
          return;
        }
        if (d.tipo === "meet-confirmado") {
          if (!atual.confirmado) { atual.confirmado = true; informarConexao(true); }
          return;
        }
        if (d.tipo === "midia-status") enviar(atual.painel, { tipo: d.tipo, camera: d.camera === true,
          audio: d.audio === true, avatar: d.avatar === true, ativarAudio: d.ativarAudio === true,
          erro: typeof d.erro === "string" ? d.erro.slice(0, 250) : "" });
        if (d.tipo === "audio-recebido" && Number.isSafeInteger(d.id)) enviar(atual.painel,
          { tipo: d.tipo, id: d.id, aceito: d.aceito === true, erro: String(d.erro || "").slice(0, 250) });
        if (d.tipo === "captura-status") enviar(atual.painel, { tipo: d.tipo, estado: String(d.estado || "").slice(0, 250) });
      });
      porta.onDisconnect.addListener(() => {
        if (meets.get(id) !== porta) return;
        meets.delete(id);
        if (atual?.tabId === id) {
          atual.confirmado = false;
          enviar(atual.painel, { tipo: "aguardando-meet", confirmado: false });
        }
      });
      return;
    }
    if (porta.name === "libras-avatar" && Number.isInteger(id) && pagina(remetente.url, "/meet/avatar.html")) {
      if (!atual || atual.tabId !== id || atual.config.modo !== "fala") { porta.disconnect(); return; }
      const antigo = avatares.get(id);
      if (antigo && antigo !== porta) { try { antigo.disconnect(); } catch {} }
      avatares.set(id, porta);
      enviar(porta, { tipo: "config", sessao: atual.sessao, config: atual.config });
      for (const texto of atual.textos.splice(0)) enviar(porta, { ...texto, sessao: atual.sessao });
      porta.onMessage.addListener((d) => {
        if (avatares.get(id) !== porta || !atual || atual.tabId !== id || d?.sessao !== atual.sessao) return;
        if (["avatar-status", "captura-status"].includes(d.tipo))
          enviar(atual.painel, { tipo: d.tipo, estado: String(d.estado || "").slice(0, 250), erro: String(d.erro || "").slice(0, 250) });
      });
      porta.onDisconnect.addListener(() => { if (avatares.get(id) === porta) avatares.delete(id); });
      return;
    }
    porta.disconnect();
  });
  api.tabs.onRemoved.addListener((id) => { if (atual?.tabId === id) limpar("A guia da reunião foi fechada."); });
  api.tabs.onUpdated.addListener((id, alteracao, tab) => {
    if (atual?.tabId === id && alteracao.url && !ehMeet(tab.url)) limpar("A guia saiu do Google Meet.");
  });
  return { destruir: limpar };
}
