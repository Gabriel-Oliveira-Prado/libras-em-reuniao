import { montarCamera } from "./camera.js";
import { montarFala } from "./fala.js";
import { montarVLibras } from "./vlibras.js";
import { montarVoz } from "./voz.js";

const pararCamera = montarCamera();
const pararFala = montarFala();
const pararAvatar = montarVLibras();
const pararVoz = montarVoz();
const botoesModo = [...document.querySelectorAll(".modos button")];

function pararCameraEVoz() {
  pararCamera();
  pararVoz();
}

for (const botao of botoesModo) {
  botao.addEventListener("click", () => {
    if (botao.getAttribute("aria-pressed") === "true") return;
    if (botao.getAttribute("aria-controls") === "modo-fala") {
      pararCameraEVoz();
    } else {
      pararFala();
      pararAvatar();
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
  pararAvatar();
});
