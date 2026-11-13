import { montarCamera } from "./camera.js";
import { montarFala } from "./fala.js";
import { montarVLibras } from "./vlibras.js";
import { montarVoz } from "./voz.js";
import { montarSinais } from "./sinais.js";
import { montarDicionario } from "./sinais-pessoais.js";
import { montarDispositivos } from "./dispositivos.js";

const dispositivos = montarDispositivos();
const voz = montarVoz({ dispositivos });
const pessoais = montarDicionario({ prepararVoz: voz.preparar, aoCapturar: voz.parar, aoTeste: (nome) => sinais.falarReconhecido(nome) });
const sinais = montarSinais({ falarSinal: voz.falarSinal, pessoais });
const pararCamera = montarCamera({ dispositivos, prepararVoz: voz.preparar, aoDetectar: sinais.receber, aoParar: sinais.parar, temModelo: sinais.temModelo });
const avatar = montarVLibras();
const pararFala = montarFala({ dispositivos, aoTexto: avatar.adicionar, prepararAvatar: avatar.abrir });
const botoesModo = [...document.querySelectorAll(".modos button")];

function pararCameraEVoz() {
  pararCamera();
  sinais.parar();
  voz.parar();
}

for (const botao of botoesModo) {
  botao.addEventListener("click", () => {
    if (botao.getAttribute("aria-pressed") === "true") return;
    if (botao.getAttribute("aria-controls") === "modo-fala") {
      pararCameraEVoz();
      document.querySelector("#interprete").hidden = false;
      avatar.abrir();
      pararFala.preparar();
    } else {
      pararFala();
      avatar.parar();
      document.querySelector("#interprete").hidden = true;
    }
    for (const item of botoesModo) {
      item.setAttribute("aria-pressed", String(item === botao));
      document.getElementById(item.getAttribute("aria-controls")).hidden = item !== botao;
    }
  });
}

window.addEventListener("pagehide", () => {
  pararCameraEVoz();
  pararFala();
  avatar.destruir();
  pessoais.destruir();
  dispositivos.destruir();
});

document.querySelector("#limpar-fala").addEventListener("click", pararFala);
document.querySelector("#limpar-camera").addEventListener("click", sinais.parar);
