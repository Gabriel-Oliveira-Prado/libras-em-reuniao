import { carregarReconhecedor } from "./reconhecimento.js";

export function montarCamera() {
  const video = document.querySelector("#camera");
  const inativa = document.querySelector("#camera-inativa");
  const alternar = document.querySelector("#alternar-camera");
  const estado = document.querySelector("#estado-camera");
  const letraAtual = document.querySelector("#letra-atual");
  const texto = document.querySelector("#texto-camera");
  let sessao;

  function parar(mensagem = "Câmera desligada.") {
    const anterior = sessao;
    sessao = null;
    if (anterior) {
      cancelAnimationFrame(anterior.animacao);
      anterior.stream?.getTracks().forEach((track) => track.stop());
    }
    video.srcObject = null;
    video.hidden = true;
    letraAtual.hidden = true;
    inativa.hidden = false;
    alternar.textContent = "Ligar câmera";
    alternar.disabled = false;
    if (anterior) estado.textContent = mensagem;
  }

  async function ligar() {
    const atual = { instante: -Infinity, ultimoQuadro: -1, leituras: 0, semMao: 0 };
    sessao = atual;
    alternar.disabled = true;
    estado.textContent = "Abrindo a câmera…";
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false,
      });
      if (sessao !== atual) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      atual.stream = stream;
      stream.getVideoTracks()[0].addEventListener("ended", () => {
        if (sessao === atual) parar("A câmera foi desconectada.");
      }, { once: true });
      estado.textContent = "Carregando o modelo de Libras…";
      video.srcObject = stream;
      await video.play();
      if (sessao !== atual) return;
      video.hidden = false;
      inativa.hidden = true;
      const reconhecer = await carregarReconhecedor();
      if (sessao !== atual) return;
      alternar.textContent = "Desligar câmera";
      alternar.disabled = false;
      estado.textContent = "Câmera ativa. Mostre uma letra com uma mão.";
      const atualizar = (instante) => {
        if (sessao !== atual) return;
        try {
          if (instante - atual.instante >= 120 && video.readyState >= 2 && video.currentTime !== atual.ultimoQuadro) {
            atual.instante = instante;
            atual.ultimoQuadro = video.currentTime;
            processar(atual, reconhecer(video, instante));
          }
          atual.animacao = requestAnimationFrame(atualizar);
        } catch (erro) {
          console.error(erro);
          parar("A leitura da câmera falhou. Desligue e tente ligar novamente.");
        }
      };
      atual.animacao = requestAnimationFrame(atualizar);
    } catch (erro) {
      if (sessao !== atual) return;
      const mensagem = {
        NotAllowedError: "Acesso à câmera indisponível. Tente abrir em uma aba e confira a permissão no Chrome.",
        NotFoundError: "Nenhuma câmera foi encontrada.",
        NotReadableError: "A câmera está ocupada ou indisponível. Feche outro app que esteja usando a câmera e tente novamente.",
      }[erro.name];
      console.error(erro);
      parar(mensagem ?? "Falha ao iniciar o reconhecedor. Recarregue a extensão e tente novamente.");
    }
  }

  function processar(atual, resultado) {
    const confiavel = resultado?.confianca >= 0.65 && resultado.margem >= 0.12;
    letraAtual.hidden = !confiavel;
    if (!confiavel) {
      atual.candidata = null;
      atual.leituras = 0;
      atual.semMao = resultado ? 0 : atual.semMao + 1;
      if (atual.semMao >= 3) atual.confirmada = null;
      return;
    }
    atual.semMao = 0;
    letraAtual.textContent = resultado.letra;
    atual.leituras = atual.candidata === resultado.letra ? atual.leituras + 1 : 1;
    atual.candidata = resultado.letra;
    if (atual.leituras === 4 && atual.confirmada !== resultado.letra) {
      acrescentar(resultado.letra);
      atual.confirmada = resultado.letra;
      estado.textContent = `Letra ${resultado.letra} adicionada.`;
    }
  }

  function acrescentar(caractere) {
    if (texto.value.length < texto.maxLength) texto.value += caractere;
  }

  alternar.addEventListener("click", () => sessao ? parar() : ligar());
  document.querySelector("#adicionar-espaco").addEventListener("click", () => {
    if (texto.value && !texto.value.endsWith(" ")) acrescentar(" ");
  });
  document.querySelector("#apagar-letra").addEventListener("click", () => {
    texto.value = texto.value.slice(0, -1);
  });
  document.querySelector("#limpar-camera").addEventListener("click", () => {
    texto.value = "";
  });

  return parar;
}
