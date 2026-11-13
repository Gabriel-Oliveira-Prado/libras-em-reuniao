import { carregarDetectorDeMaos } from "./reconhecimento.js";
import { desenharMaos } from "./maos.mjs";

export function montarCamera({ aoDetectar, aoParar, temModelo, prepararVoz } = {}) {
  const video = document.querySelector("#camera");
  const desenho = document.querySelector("#desenho-maos");
  const inativa = document.querySelector("#camera-inativa");
  const alternar = document.querySelector("#alternar-camera");
  const estado = document.querySelector("#estado-camera");
  const detectadas = document.querySelector("#maos-detectadas");
  let sessao;

  function parar(mensagem = "Câmera desligada.") {
    const anterior = sessao;
    sessao = null;
    if (anterior) {
      cancelAnimationFrame(anterior.animacao);
      anterior.stream?.getTracks().forEach((track) => track.stop());
    }
    desenho.getContext("2d").clearRect(0, 0, desenho.width, desenho.height);
    desenho.hidden = true;
    video.pause();
    video.srcObject = null;
    video.hidden = true;
    inativa.hidden = false;
    detectadas.hidden = true;
    alternar.textContent = "Ligar câmera";
    alternar.disabled = false;
    if (anterior) estado.textContent = mensagem;
    aoParar?.();
  }

  async function ligar() {
    if (!navigator.mediaDevices?.getUserMedia) {
      estado.textContent = "Câmera indisponível nesta janela. Abra o tradutor em uma aba do Chrome.";
      return;
    }
    const atual = { instante: -Infinity, ultimoQuadro: -1 };
    sessao = atual;
    alternar.disabled = true;
    estado.textContent = "Abrindo a câmera…";
    let etapa = "camera";
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } },
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
      video.srcObject = stream;
      etapa = "video";
      await video.play();
      if (sessao !== atual) return;
      if (!video.videoWidth || !video.videoHeight) {
        await new Promise((resolve) => video.addEventListener("loadedmetadata", resolve, { once: true }));
        if (sessao !== atual) return;
      }
      desenho.width = video.videoWidth;
      desenho.height = video.videoHeight;
      video.hidden = false;
      desenho.hidden = false;
      inativa.hidden = true;
      estado.textContent = "Preparando mãos, corpo e rosto…";
      etapa = "modelo";
      const detectar = await carregarDetectorDeMaos();
      if (sessao !== atual) return;
      alternar.textContent = "Desligar câmera";
      alternar.disabled = false;
      const atualizar = (instante) => {
        if (sessao !== atual) return;
        try {
          if (instante - atual.instante >= 66 && video.readyState >= 2 && video.currentTime !== atual.ultimoQuadro) {
            atual.instante = instante;
            atual.ultimoQuadro = video.currentTime;
            const resultado = detectar(video, instante);
            // Algumas versões da API Web agrupam landmarks em um array de pessoas.
            for (const campo of ["leftHandLandmarks", "rightHandLandmarks", "poseLandmarks", "faceLandmarks"]) {
              if (Array.isArray(resultado[campo]?.[0])) resultado[campo] = resultado[campo][0];
            }
            const maos = [resultado.leftHandLandmarks, resultado.rightHandLandmarks].filter((mao) => mao?.length);
            desenharMaos(desenho, maos, resultado.poseLandmarks);
            detectadas.hidden = maos.length === 0;
            if (maos.length) detectadas.textContent = `${maos.length} ${maos.length === 1 ? "mão localizada" : "mãos localizadas"}`;
            estado.textContent = maos.length
              ? (temModelo?.() ? "Acompanhando seus movimentos." : "Rastreamento ativo. A tradução automática ainda está em validação.")
              : "Enquadre rosto, tronco e mãos, com boa iluminação.";
            aoDetectar?.(resultado, instante, video.videoWidth / video.videoHeight);
          }
          atual.animacao = requestAnimationFrame(atualizar);
        } catch (erro) {
          console.warn("Falha no rastreamento das mãos:", erro?.name, erro?.message);
          parar("A leitura da câmera falhou. Desligue e tente ligar novamente.");
        }
      };
      atual.animacao = requestAnimationFrame(atualizar);
    } catch (erro) {
      if (sessao !== atual) return;
      const mensagem = etapa === "modelo"
        ? "O detector de mãos não carregou. Recarregue a extensão e tente novamente."
        : {
          NotAllowedError: "O Chrome bloqueou a câmera. Abra em aba, clique em Ligar câmera e permita o acesso quando solicitado.",
          SecurityError: "O Chrome bloqueou a câmera nesta janela. Abra o tradutor em uma aba.",
          NotFoundError: "Nenhuma câmera foi encontrada neste computador.",
          NotReadableError: "A câmera está ocupada. Feche outro app que esteja usando a câmera e tente novamente.",
          OverconstrainedError: "A câmera não atende à configuração solicitada. Tente outra câmera.",
          AbortError: "A câmera foi interrompida. Tente ligar novamente.",
        }[erro?.name] ?? "Não foi possível iniciar a câmera. Abra o tradutor em uma aba e tente novamente.";
      if (erro?.name !== "NotAllowedError" && erro?.name !== "SecurityError") {
        console.warn("Falha ao iniciar câmera:", etapa, erro?.name, erro?.message);
      }
      parar(mensagem);
    }
  }

  alternar.addEventListener("click", () => {
    if (sessao) parar();
    else {
      prepararVoz?.();
      ligar();
    }
  });

  return parar;
}
