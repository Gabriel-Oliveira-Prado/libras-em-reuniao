import { montarVLibras } from "../painel/vlibras.js";
import { glosaValida } from "./protocolo.mjs";

const CANAL = "libras-em-reuniao-meet-v1";
const ORIGEM_AVATAR = "https://vlibras.gov.br";
const ORIGEM_MEET = "https://meet.google.com";
const sessaoValida = valor => typeof valor === "string" && /^[a-zA-Z0-9._:-]{1,160}$/.test(valor);
const inicializacao = window.__librasMeetAvatar;
const avatar = montarVLibras();
const area = document.querySelector("#avatar");
const estado = document.querySelector("#estado-vlibras");
const estadoCaptura = document.querySelector("#estado-captura");
const port = chrome.runtime.connect({ name: "libras-avatar" });
let sessao, ativo = false, encerrado = false, iframe, handshake, pendente, prazoAck;
let capturando = false;
let ultimoEstado = "", ultimoEstadoCaptura = "";
let prazoConexao = setTimeout(() => falharConexao("O Meet não confirmou a conexão. Confira a conexão no painel e clique em Reconectar intérprete."), 8000);

function falharConexao(mensagem = "Conexão encerrada. Confira a conexão no painel e clique em Reconectar intérprete.") {
  if (encerrado) return;
  destruir();
  estado.textContent = mensagem;
  estadoCaptura.textContent = "";
  inicializacao?.falhar(mensagem);
}
function portaDesconectada() { falharConexao(); }

function enviarPort(mensagem) {
  if (encerrado) return;
  try { port.postMessage(mensagem); } catch { falharConexao(); }
}
function informarCaptura(mensagem, erro) {
  if (!sessao || mensagem === ultimoEstadoCaptura) return;
  ultimoEstadoCaptura = mensagem;
  estadoCaptura.textContent = mensagem;
  const aviso = { canal: CANAL, tipo: "captura-status", sessao, estado: mensagem, ...(erro ? { erro } : {}) };
  enviarPort(aviso);
  if (window.parent !== window) window.parent.postMessage(aviso, ORIGEM_MEET);
}
function enviarCaptura(destino, ligada) {
  destino?.contentWindow?.postMessage({
    canal: CANAL, tipo: "capturar-avatar", sessao, ativo: ligada
  }, ORIGEM_AVATAR);
}
function limparPendente() {
  clearTimeout(prazoAck);
  prazoAck = undefined;
  pendente = undefined;
}
function conferirIframe() {
  if (!ativo || encerrado) return;
  const proximo = area.querySelector("iframe");
  if (iframe !== proximo) {
    enviarCaptura(iframe, false);
    capturando = false;
    iframe = proximo;
    limparPendente();
  }
  // O canvas existe durante o download do Unity, antes de produzir imagens.
  // Só iniciar o prazo de quadros depois de o personagem estar preparado.
  if (!iframe || !avatar.pronta()) {
    if (capturando) {
      enviarCaptura(iframe, false);
      capturando = false;
      limparPendente();
    }
    informarCaptura("Carregando o intérprete. Ele aparecerá na câmera quando estiver pronto.");
    return;
  }
  capturando = true;
  enviarCaptura(iframe, true);
}
function pararCaptura() {
  clearInterval(handshake);
  handshake = undefined;
  capturando = false;
  enviarCaptura(iframe, false);
  iframe = undefined;
  limparPendente();
}
function configurar(mensagem) {
  if (!sessaoValida(mensagem.sessao) || !["fala", "sinais"].includes(mensagem.config?.modo)) return;
  clearTimeout(prazoConexao);
  prazoConexao = undefined;
  inicializacao?.confirmar();
  const mudou = sessao !== mensagem.sessao;
  if (mudou || mensagem.config.modo !== "fala") pararCaptura();
  if (mudou) {
    avatar.parar();
    ultimoEstado = "";
    ultimoEstadoCaptura = "";
  }
  sessao = mensagem.sessao;
  ativo = mensagem.config.modo === "fala";
  if (!ativo) { avatar.parar(); estado.textContent = "Conectado ao Meet. Intérprete em espera."; return; }
  if (mudou) estado.textContent = "Conectado ao Meet. Carregando o intérprete…";
  avatar.abrir();
  conferirIframe();
  if (!handshake) handshake = setInterval(conferirIframe, 1000);
}
function receberPort(mensagem) {
  if (encerrado || !mensagem || typeof mensagem !== "object") return;
  if (mensagem.tipo === "config") { configurar(mensagem); return; }
  if (!sessao || mensagem.sessao !== sessao) return;
  if (mensagem.tipo === "desconectar") { falharConexao(); return; }
  if (mensagem.tipo === "avatar-parar") { avatar.parar(); return; }
  if (mensagem.tipo === "avatar-sinal" && ativo && glosaValida(mensagem.glosa) &&
      typeof mensagem.rotulo === "string" && mensagem.rotulo.length <= 160) {
    if (!avatar.mostrarSinal(mensagem.glosa, mensagem.rotulo)) informarCaptura("O intérprete está com trechos pendentes. Aguarde a sinalização.");
    return;
  }
  if (mensagem.tipo === "avatar-texto" && ativo && typeof mensagem.texto === "string" &&
      mensagem.texto.trim() && mensagem.texto.length <= 2000) {
    if (!avatar.adicionar(mensagem.texto)) informarCaptura("O intérprete está com trechos pendentes. Aguarde a sinalização.");
  }
}
function receberJanela(evento) {
  const { source, origin, data } = evento;
  if (encerrado || data?.canal !== CANAL) return;
  if (source === window.parent && origin === ORIGEM_MEET && data.tipo === "avatar-frame-ack") {
    if (!ativo || pendente === undefined || !Number.isSafeInteger(data.quadro) || data.sessao !== sessao || data.quadro !== pendente) return;
    limparPendente();
    informarCaptura("Quadros do intérprete recebidos. Confira a câmera no Meet.");
    iframe?.contentWindow?.postMessage({ canal: CANAL, tipo: "avatar-frame-ack", sessao, quadro: data.quadro }, ORIGEM_AVATAR);
    return;
  }
  if (source !== iframe?.contentWindow || origin !== ORIGEM_AVATAR) return;
  if (data.tipo === "captura-status") {
    if (ativo && data.sessao === sessao && typeof data.estado === "string") {
      informarCaptura(data.estado.slice(0, 400), typeof data.erro === "string" ? data.erro.slice(0, 80) : undefined);
    }
    return;
  }
  if (data.tipo !== "avatar-frame") return;
  const bitmap = data.bitmap;
  if (!(bitmap instanceof ImageBitmap)) return;
  if (!ativo || !capturando || !avatar.pronta() || data.sessao !== sessao || !Number.isSafeInteger(data.quadro) || data.quadro < 1 ||
      bitmap.width < 1 || bitmap.height < 1 || bitmap.width > 320 || bitmap.height > 360 ||
      window.parent === window || pendente !== undefined) {
    bitmap.close();
    return;
  }
  pendente = data.quadro;
  try {
    window.parent.postMessage({ canal: CANAL, tipo: "avatar-frame", sessao, quadro: data.quadro, bitmap }, ORIGEM_MEET, [bitmap]);
    // O Meet confirma quando o quadro já foi desenhado/descartado. Sem ACK,
    // não se acumulam ImageBitmaps no outro processo.
    prazoAck = setTimeout(() => {
      if (pendente !== undefined) informarCaptura("O Meet não confirmou o vídeo do intérprete. Reconecte o Meet.", "AckTimeout");
    }, 3000);
  } catch (erro) {
    bitmap.close();
    limparPendente();
    informarCaptura("Não foi possível compartilhar o vídeo do intérprete.", erro?.name || "PostMessageError");
  }
}
function destruir() {
  if (encerrado) return;
  pararCaptura();
  clearTimeout(prazoConexao);
  prazoConexao = undefined;
  ativo = false;
  encerrado = true;
  observadorEstado.disconnect();
  observadorAvatar.disconnect();
  window.removeEventListener("message", receberJanela);
  window.removeEventListener("pagehide", destruir);
  avatar.destruir();
  try { port.disconnect(); } catch { /* A porta pode já ter sido fechada. */ }
}
const observadorEstado = new MutationObserver(() => {
  if (!sessao || encerrado) return;
  const mensagem = estado.textContent.trim().slice(0, 400);
  if (!mensagem || mensagem === ultimoEstado) return;
  ultimoEstado = mensagem;
  enviarPort({ tipo: "avatar-status", sessao, estado: mensagem });
});
observadorEstado.observe(estado, { childList: true, characterData: true, subtree: true });
const observadorAvatar = new MutationObserver(conferirIframe);
observadorAvatar.observe(area, { childList: true });
port.onMessage.addListener(receberPort);
port.onDisconnect.addListener(portaDesconectada);
window.addEventListener("message", receberJanela);
window.addEventListener("pagehide", destruir);
enviarPort({ tipo: "avatar-pronto" });
