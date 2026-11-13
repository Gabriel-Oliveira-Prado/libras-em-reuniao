import { montarCamera } from "./camera.js";
import { montarFala } from "./fala.js";
import { montarVLibras } from "./vlibras.js";
import { montarVoz } from "./voz.js";
import { montarSinais } from "./sinais.js";
import { montarDicionario } from "./sinais-pessoais.js";
import { montarDispositivos } from "./dispositivos.js";
import { montarAuxiliarLocal } from "./auxiliar-local.mjs";
import { montarIntegracaoMeet } from "./integracao-meet.mjs";
import { montarBiblioteca } from "./biblioteca.mjs";

let modoAtual = "sinais", encerrando = false;
const dispositivos = montarDispositivos();
const meet = montarIntegracaoMeet({
  aoConexao(ativa) {
    if (encerrando) return;
    voz.parar();
    avatar.mudarDestino();
    document.querySelector("#interprete").hidden = modoAtual !== "fala" || ativa;
    if (modoAtual === "fala") {
      pararFala();
      if (!ativa) avatar.abrir();
    }
  },
  aoTesteVoz: () => voz.falarSinal("Oi. Este é um teste de voz do tradutor.")
});
const voz = montarVoz({ dispositivos, encaminharAudio: meet.encaminharAudio, aoPararAudio: meet.pararAudio });
const pessoais = montarDicionario({ prepararVoz: voz.preparar, aoCapturar: voz.parar, aoTeste: (nome) => sinais.falarReconhecido(nome) });
const sinais = montarSinais({ falarSinal: voz.falarSinal, pessoais });
const pararCamera = montarCamera({ dispositivos, prepararVoz: voz.preparar, aoDetectar: sinais.receber, aoParar: sinais.parar, temModelo: sinais.temModelo });
const avatar = montarVLibras({ remoto: meet });
const auxiliar = montarAuxiliarLocal();
const pararFala = montarFala({ dispositivos, aoTexto: avatar.adicionar, prepararAvatar: avatar.abrir, aoAtualizarTexto: auxiliar.invalidar });
const botoesModo = [...document.querySelectorAll(".modos button")];

function pararCameraEVoz() { pararCamera(); sinais.parar(); voz.parar(); }

for (const botao of botoesModo) {
  botao.addEventListener("click", () => {
    if (botao.getAttribute("aria-pressed") === "true") return;
    modoAtual = botao.getAttribute("aria-controls") === "modo-fala" ? "fala" : "sinais";
    meet.mudarModo(modoAtual);
    if (modoAtual === "fala") {
      pararCameraEVoz();
      document.querySelector("#interprete").hidden = meet.ativa();
      avatar.abrir();
      pararFala.preparar();
    } else {
      auxiliar.invalidar(); pararFala(); avatar.parar();
      document.querySelector("#interprete").hidden = true;
    }
    for (const item of botoesModo) {
      item.setAttribute("aria-pressed", String(item === botao));
      document.getElementById(item.getAttribute("aria-controls")).hidden = item !== botao;
    }
  });
}
const biblioteca = montarBiblioteca({ aoMostrar(glosa, rotulo) {
  // Abrir a biblioteca não inicia a escuta. Somente o botão do microfone liga a captura.
  const botao = botoesModo.find((b) => b.getAttribute("aria-controls") === "modo-fala");
  if (botao.getAttribute("aria-pressed") !== "true") botao.click();
  return avatar.mostrarSinal(glosa, rotulo);
} });
window.addEventListener("pagehide", () => {
  encerrando = true;
  pararCameraEVoz(); pararFala(); avatar.destruir(); pessoais.destruir();
  dispositivos.destruir(); voz.destruir(); auxiliar.destruir(); meet.destruir(); biblioteca.destruir();
});
document.querySelector("#limpar-fala").addEventListener("click", pararFala);
document.querySelector("#limpar-camera").addEventListener("click", sinais.parar);
