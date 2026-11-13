import { configuracao, glosaValida, ehMeet } from "../meet/protocolo.mjs";

export function montarIntegracaoMeet({ aoConexao, aoTesteVoz } = {}) {
  const seletor = document.querySelector("#reuniao-meet");
  const estado = document.querySelector("#estado-meet");
  const conectar = document.querySelector("#conectar-meet");
  const desconectar = document.querySelector("#desconectar-meet");
  const posicao = document.querySelector("#posicao-meet"), tamanho = document.querySelector("#tamanho-meet");
  const vozMeet = document.querySelector("#voz-no-meet");
  const testar = document.querySelector("#testar-voz-meet");
  let porta, ligado = false, modo = "sinais", idAudio = 0, destruido = false, destino = -1;
  let ultimaMidia, statusAvatar = "", ultimaConfiguracao = "", reunioes = [];
  const pendentes = new Map();
  let timerLista, timerConexao, timerReconexao, tentativas = 0, pedidoLista = 0, listaConcluida = 0;
  let aguardandoConexao = false, guiaPreparada = false;
  const avisoRecarregar = "Recarregue a extensão em chrome://extensions e reabra o painel para conectar ao Meet.";
  function opcaoVazia(texto) {
    const o = document.createElement("option"); o.value = ""; o.textContent = texto;
    seletor.replaceChildren(o); seletor.value = "";
  }
  function mostrarReunioes(tabs, pedido = pedidoLista) {
    if (destruido || pedido !== pedidoLista) return;
    clearTimeout(timerLista); timerLista = undefined; listaConcluida = pedido;
    reunioes = (Array.isArray(tabs) ? tabs : []).filter(t => Number.isInteger(t.id));
    const anterior = seletor.value;
    const itens = reunioes.map(t => {
      const o = document.createElement("option"); o.value = String(t.id);
      o.textContent = String(t.titulo || t.title || "Google Meet").slice(0, 160); return o;
    });
    if (itens.length) seletor.replaceChildren(...itens);
    else opcaoVazia("Nenhuma guia do Meet aberta");
    const escolhido = reunioes.find(t => String(t.id) === anterior) || reunioes.find(t => t.ativa || t.active) || reunioes[0];
    seletor.value = escolhido ? String(escolhido.id) : "";
    if (!ligado && !aguardandoConexao) estado.textContent = !porta && tentativas >= 2 ? avisoRecarregar : reunioes.length
      ? "Escolha a reunião e clique em Conectar ao Meet."
      : "Abra uma guia do Google Meet e use Atualizar reuniões.";
  }
  function listarReunioes() {
    if (destruido) return;
    clearTimeout(timerLista);
    const pedido = ++pedidoLista;
    if (!reunioes.length) opcaoVazia("Buscando reuniões…");
    if (!ligado && !aguardandoConexao) estado.textContent = "Buscando guias do Google Meet…";
    timerLista = setTimeout(() => {
      timerLista = undefined;
      if (destruido || pedido !== pedidoLista || listaConcluida === pedido) return;
      if (!reunioes.length) opcaoVazia("Não foi possível carregar as reuniões");
      if (!ligado && !aguardandoConexao) estado.textContent = avisoRecarregar;
    }, 5000);
    abrirPorta(); enviar({ tipo: "listar", pedido });
    // A lista não depende de o service worker já ter iniciado ou respondido.
    try {
      const consulta = chrome.tabs?.query({ url: "https://meet.google.com/*" });
      if (consulta) Promise.resolve(consulta).then(tabs => {
        if (destruido || pedido !== pedidoLista) return;
        mostrarReunioes(tabs.filter(t => ehMeet(t.url)), pedido);
      }).catch(() => {
        if (destruido || pedido !== pedidoLista || listaConcluida === pedido) return;
        clearTimeout(timerLista); timerLista = undefined;
        if (!reunioes.length) opcaoVazia("Não foi possível carregar as reuniões");
        if (!ligado && !aguardandoConexao) estado.textContent = avisoRecarregar;
      });
    } catch {
      // O timeout ou a resposta do serviço encerra o estado de busca.
    }
  }
  function recuperarPorta() {
    if (destruido || timerReconexao !== undefined) return;
    if (tentativas >= 2) {
      if (!reunioes.length) opcaoVazia("Atualize a extensão para conectar");
      estado.textContent = avisoRecarregar; return;
    }
    tentativas++;
    estado.textContent = "Restabelecendo a conexão com a extensão…";
    timerReconexao = setTimeout(() => { timerReconexao = undefined; listarReunioes(); }, 500);
  }
  try {
    const salvo = JSON.parse(localStorage.getItem("libras-meet-config") || "{}");
    const c = configuracao(salvo);
    posicao.value = c.posicao; tamanho.value = c.tamanho; vozMeet.checked = c.vozNoMeet;
  } catch {}
  const config = () => configuracao({ modo, posicao: posicao.value, tamanho: tamanho.value, vozNoMeet: vozMeet.checked });
  function enviar(d) { try { porta?.postMessage(d); return Boolean(porta); } catch { return false; } }
  function cancelarPendentes(mensagem) {
    for (const p of pendentes.values()) {
      clearTimeout(p.timer);
      const erro = new Error(mensagem); erro.name = "AbortError"; p.reject(erro);
    }
    pendentes.clear();
  }
  function erroMeet(mensagem) { const e = new Error(mensagem); e.name = "ConexaoMeetError"; return e; }
  function informar() {
    if (!ligado) return;
    if (!guiaPreparada) {
      estado.textContent = "Guia selecionada. Recarregue esta guia do Meet uma vez, mantendo o painel aberto, para ativar a integração da câmera.";
      return;
    }
    if (!ultimaMidia) {
      estado.textContent = modo === "fala"
        ? ["Conectado. Ligue a câmera do Meet; o avatar entra no vídeo assim que carregar.", statusAvatar].filter(Boolean).join(" ")
        : "Conectado. Para mostrar o avatar na câmera do Meet, selecione Voz → Libras.";
      return;
    }
    const partes = [];
    if (modo === "fala") partes.push(ultimaMidia.camera && ultimaMidia.avatar
      ? "Avatar integrado à câmera."
      : ultimaMidia.camera ? "Câmera pronta. Aguardando o vídeo do avatar carregar."
        : "Ligue a câmera do Meet. Se atualizou a extensão com o Meet aberto, recarregue a guia uma vez.");
    else partes.push("Para mostrar o avatar na câmera, selecione Voz → Libras.");
    if (vozMeet.checked) partes.push(ultimaMidia.audio
      ? "Áudio integrado. O microfone do Meet precisa estar ligado."
      : "O áudio ainda não está integrado. Ative o microfone no Meet ou recarregue a guia.");
    if (ultimaMidia.ativarAudio) partes.push("Clique dentro do Meet para ativar o áudio do tradutor.");
    if (ultimaMidia.erro) partes.push(ultimaMidia.erro);
    if (modo === "fala" && statusAvatar) partes.push(statusAvatar);
    partes.push("Confira imagem e som com outro participante.");
    estado.textContent = partes.join(" ");
  }
  function encerrar(motivo) {
    clearTimeout(timerConexao); timerConexao = undefined; aguardandoConexao = false;
    const antes = ligado; ligado = false; ultimaMidia = undefined; statusAvatar = "";
    destino = -1; guiaPreparada = false;
    cancelarPendentes("A conexão com o Meet foi encerrada.");
    conectar.disabled = false; seletor.disabled = false; desconectar.hidden = true; testar.disabled = true;
    estado.textContent = motivo || "Integração desligada.";
    if (antes) aoConexao?.(false);
  }
  function abrirPorta() {
    if (destruido || porta) return;
    try {
      const atual = chrome.runtime.connect({ name: "libras-painel" }); porta = atual;
      atual.onMessage.addListener((d) => {
        if (destruido || porta !== atual) return;
        if (!d || typeof d !== "object") return;
        tentativas = 0;
        if (d.tipo === "reunioes") mostrarReunioes(d.reunioes, Number.isInteger(d.pedido) ? d.pedido : pedidoLista);
        if (d.tipo === "conectado") {
          if (!ligado && !aguardandoConexao) return;
          clearTimeout(timerConexao); timerConexao = undefined; aguardandoConexao = false;
          const novo = !ligado || destino !== d.tabId;
          ligado = true; destino = d.tabId; conectar.disabled = true; seletor.disabled = true;
          desconectar.hidden = false; testar.disabled = !vozMeet.checked;
          if (novo) { ultimaMidia = undefined; statusAvatar = ""; aoConexao?.(true); }
          guiaPreparada = d.disponivel !== false;
          if (!guiaPreparada) ultimaMidia = undefined;
          informar();
        }
        if (d.tipo === "aguardando-meet") { guiaPreparada = false; ultimaMidia = undefined; informar(); }
        if (d.tipo === "midia-status") { guiaPreparada = true; ultimaMidia = d; informar(); }
        if (["avatar-status", "captura-status"].includes(d.tipo)) { statusAvatar = d.erro || d.estado || ""; informar(); }
        if (d.tipo === "audio-recebido") {
          const p = pendentes.get(d.id); if (!p) return;
          clearTimeout(p.timer); pendentes.delete(d.id);
          if (d.aceito) p.resolve(true);
          else p.reject(erroMeet(d.erro || "O Meet não conseguiu receber esta fala. Confira o microfone da reunião."));
        }
        if (d.tipo === "desconectado") encerrar(d.motivo);
        if (d.tipo === "erro") {
          estado.textContent = d.erro;
          if (!ligado) { clearTimeout(timerConexao); timerConexao = undefined; aguardandoConexao = false; conectar.disabled = false; }
        }
      });
      atual.onDisconnect.addListener(() => {
        // lastError só pode ser lido durante este callback.
        const falha = chrome.runtime.lastError?.message || "";
        if (porta !== atual || destruido) return;
        porta = undefined;
        encerrar(falha ? avisoRecarregar : "Conexão interrompida. Atualizando reuniões…");
        recuperarPorta();
      });
    } catch { estado.textContent = avisoRecarregar; recuperarPorta(); }
  }
  function atualizarConfig() {
    const c = config();
    try { localStorage.setItem("libras-meet-config", JSON.stringify(c)); } catch {}
    testar.disabled = !ligado || !c.vozNoMeet;
    const serial = JSON.stringify(c);
    if (ligado && serial !== ultimaConfiguracao) { enviar({ tipo: "config", config: c }); ultimaConfiguracao = serial; }
    informar();
  }
  for (const s of [posicao, tamanho, vozMeet]) s.addEventListener("change", atualizarConfig);
  conectar.addEventListener("click", () => {
    const id = Number(seletor.value);
    if (!seletor.value || !Number.isInteger(id)) { estado.textContent = "Abra uma guia do Google Meet e atualize as reuniões."; return; }
    clearTimeout(timerReconexao); timerReconexao = undefined;
    abrirPorta(); conectar.disabled = true; aguardandoConexao = true;
    estado.textContent = "Conectando à reunião…";
    ultimaConfiguracao = JSON.stringify(config());
    clearTimeout(timerConexao);
    timerConexao = setTimeout(() => {
      timerConexao = undefined;
      if (destruido || !aguardandoConexao) return;
      enviar({ tipo: "desconectar" }); encerrar(avisoRecarregar);
    }, 6000);
    if (!enviar({ tipo: "conectar", tabId: id, config: config() })) { encerrar(avisoRecarregar); }
  });
  desconectar.addEventListener("click", () => { enviar({ tipo: "desconectar" }); encerrar(); });
  document.querySelector("#atualizar-meet").addEventListener("click", () => {
    tentativas = 0; clearTimeout(timerReconexao); timerReconexao = undefined; listarReunioes();
  });
  testar.addEventListener("click", () => aoTesteVoz?.());
  listarReunioes();
  const batida = setInterval(() => { if (ligado) enviar({ tipo: "ping" }); }, 20000);
  return {
    ativa: () => ligado,
    mudarModo(valor) { modo = valor === "fala" ? "fala" : "sinais"; atualizarConfig(); },
    adicionar(texto) { return ligado && modo === "fala" && typeof texto === "string" && texto.length <= 500 && enviar({ tipo: "avatar-texto", texto }); },
    mostrarSinal(glosa, rotulo) {
      return ligado && modo === "fala" && glosaValida(glosa) && typeof rotulo === "string" && rotulo.length <= 160 &&
        enviar({ tipo: "avatar-sinal", glosa, rotulo });
    },
    pararAvatar() { if (ligado) enviar({ tipo: "avatar-parar" }); },
    async encaminharAudio({ samples, sampleRate, frase, teste }) {
      if (!ligado || !vozMeet.checked || teste) return false;
      if (!ultimaMidia?.audio) throw erroMeet("O áudio do Meet ainda não foi integrado. Recarregue a guia e ligue o microfone da reunião.");
      const id = ++idAudio;
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => { pendentes.delete(id); reject(erroMeet("O Meet não confirmou o recebimento do áudio. Confira a reunião e tente novamente.")); }, 6000);
        pendentes.set(id, { resolve, reject, timer });
        if (!enviar({ tipo: "audio", id, sampleRate, samples: Array.from(samples), frase })) {
          clearTimeout(timer); pendentes.delete(id); reject(erroMeet("A conexão com o Meet foi perdida."));
        }
      });
    },
    pararAudio() { cancelarPendentes("A voz foi interrompida."); if (ligado) enviar({ tipo: "audio-parar" }); },
    destruir() {
      destruido = true; pedidoLista++;
      clearInterval(batida); clearTimeout(timerLista); clearTimeout(timerConexao); clearTimeout(timerReconexao);
      enviar({ tipo: "desconectar" }); encerrar(); porta?.disconnect(); porta = undefined;
    }
  };
}
