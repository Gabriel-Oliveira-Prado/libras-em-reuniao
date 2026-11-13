// Este script clássico é independente dos imports do intérprete.
(() => {
  "use strict";
  const estado = document.querySelector("#estado-vlibras");
  const reconectar = document.querySelector("#reconectar-avatar");
  let confirmado = false, encerrado = false;
  let prazo = setTimeout(() => falhar(), 8000);

  function limparPrazo() { clearTimeout(prazo); prazo = undefined; }
  function confirmar() {
    if (encerrado) return;
    confirmado = true;
    limparPrazo();
    reconectar.hidden = true;
  }
  function falhar(mensagem = "Não foi possível conectar ao Meet. Confira a conexão no painel e clique em Reconectar intérprete.") {
    if (encerrado) return;
    limparPrazo();
    estado.textContent = mensagem;
    reconectar.hidden = false;
    const pausar = document.querySelector("#pausar-avatar");
    if (pausar) pausar.disabled = true;
    const tentar = document.querySelector("#tentar-avatar");
    if (tentar) tentar.hidden = true;
  }
  function recarregar() { window.location.reload(); }
  function erroInicial(evento) {
    if (confirmado || encerrado) return;
    const modulo = document.querySelector("#modulo-avatar");
    let origemDaExtensao = false;
    try { origemDaExtensao = Boolean(evento.filename) &&
      new URL(evento.filename).protocol === "chrome-extension:" &&
      new URL(evento.filename).host === window.location.host; } catch { /* Erros sem URL usam o elemento do módulo. */ }
    if (evento.target === modulo || origemDaExtensao)
      falhar("O intérprete não conseguiu iniciar. Recarregue a extensão e clique em Reconectar intérprete.");
  }
  function cancelar() {
    if (encerrado) return;
    encerrado = true;
    limparPrazo();
    window.removeEventListener("error", erroInicial, true);
    window.removeEventListener("pagehide", cancelar);
    reconectar.removeEventListener("click", recarregar);
  }
  Object.defineProperty(window, "__librasMeetAvatar", {
    value: Object.freeze({ confirmar, falhar, cancelar }), configurable: true
  });
  reconectar.addEventListener("click", recarregar);
  window.addEventListener("error", erroInicial, true);
  window.addEventListener("pagehide", cancelar);
})();
