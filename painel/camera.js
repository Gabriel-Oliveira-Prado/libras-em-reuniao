import { carregarDetectorDeMaos } from "./reconhecimento.js";
import { desenharMaos } from "./maos.mjs";

export function montarCamera({ aoDetectar, aoParar, temModelo, prepararVoz, dispositivos } = {}) {
  const video = document.querySelector("#camera");
  const desenho = document.querySelector("#desenho-maos");
  const inativa = document.querySelector("#camera-inativa");
  const alternar = document.querySelector("#alternar-camera");
  const estado = document.querySelector("#estado-camera");
  const detectadas = document.querySelector("#maos-detectadas");
  const qualidade = document.querySelector("#qualidade-rastreamento");
  const estadoRastreamento = document.querySelector("#estado-rastreamento");
  try {
    const salvo = localStorage.getItem("libras-qualidade-rastreamento");
    if (qualidade && ["full", "heavy", "lite"].includes(salvo)) qualidade.value = salvo;
  } catch { /* Mantém Lite quando o armazenamento não está disponível. */ }
  let sessao;

  function parar(mensagem = "Câmera desligada.") {
    const anterior = sessao;
    sessao = null;
    if (anterior) {
      cancelAnimationFrame(anterior.animacao);
      anterior.cancelarMetadados?.();
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
    const atual = { instante: -Infinity, ultimoQuadro: -1, perfil: qualidade?.value || "lite" };
    sessao = atual;
    alternar.disabled = true;
    estado.textContent = "Abrindo a câmera…";
    let etapa = "camera";
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 },
          ...(dispositivos?.selecionado("camera") ? { deviceId: { exact: dispositivos.selecionado("camera") } } : {}) },
        audio: false,
      });
      if (sessao !== atual) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      atual.stream = stream;
      dispositivos?.atualizar();
      stream.getVideoTracks()[0].addEventListener("ended", () => {
        if (sessao === atual) parar("A câmera foi desconectada.");
      }, { once: true });
      video.srcObject = stream;
      etapa = "video";
      await video.play();
      if (sessao !== atual) return;
      if (!video.videoWidth || !video.videoHeight) {
        await new Promise((resolve, reject) => {
          const limpar = () => { clearTimeout(prazo); video.removeEventListener("loadedmetadata", carregou); atual.cancelarMetadados = undefined; };
          const carregou = () => { limpar(); resolve(); };
          const prazo = setTimeout(() => { limpar(); reject(new Error("A câmera não iniciou a prévia.")); }, 8000);
          atual.cancelarMetadados = carregou;
          video.addEventListener("loadedmetadata", carregou, { once: true });
        });
        if (sessao !== atual) return;
      }
      if (!video.videoWidth || !video.videoHeight) throw new Error("A câmera retornou dimensões vazias.");
      desenho.width = video.videoWidth;
      desenho.height = video.videoHeight;
      video.hidden = false;
      desenho.hidden = false;
      inativa.hidden = true;
      estado.textContent = "Preparando mãos, corpo e rosto…";
      etapa = "modelo";
      let detectar = await carregarDetectorDeMaos(atual.perfil);
      if (sessao !== atual) return;
      // Alguns drivers aceitam a criação GPU e falham só no primeiro quadro.
      // Verifica antes de encaminhar landmarks ao reconhecedor ou ao cadastro.
      if (detectar.aceleracao) {
        try { detectar(video, performance.now()); }
        catch (erro) {
          if (detectar.aceleracao !== "aceleração gráfica") throw erro;
          estado.textContent = "Ajustando a leitura para o processador…";
          detectar = await carregarDetectorDeMaos(detectar.perfil || atual.perfil, { forcarCPU: true });
          if (sessao !== atual) return;
          detectar(video, performance.now());
        }
      }
      if (estadoRastreamento) estadoRastreamento.textContent = detectar.aviso || `Leitura ativa: ${detectar.nome || "Lite"}${detectar.aceleracao ? ` · ${detectar.aceleracao}` : ""}. Lite é a opção recomendada pelos testes atuais. Full e Heavy são experimentais; confira seus sinais pessoais ao trocar.`;
      alternar.textContent = "Desligar câmera";
      alternar.disabled = false;
      const atualizar = (instante) => {
        if (sessao !== atual) return;
        try {
          if (instante - atual.instante >= 40 && video.readyState >= 2 && video.currentTime !== atual.ultimoQuadro) {
            atual.instante = instante;
            atual.ultimoQuadro = video.currentTime;
            if (desenho.width !== video.videoWidth || desenho.height !== video.videoHeight) {
              desenho.width = video.videoWidth; desenho.height = video.videoHeight;
            }
            const resultado = detectar(video, instante);
            // Algumas versões da API Web agrupam landmarks em um array de pessoas.
            for (const campo of ["leftHandLandmarks", "rightHandLandmarks", "poseLandmarks", "faceLandmarks"]) {
              if (Array.isArray(resultado[campo]?.[0])) resultado[campo] = resultado[campo][0];
            }
            const maos = [resultado.leftHandLandmarks, resultado.rightHandLandmarks].filter((mao) => mao?.length);
            const maoPequena = maos.some((mao) => Math.max(...mao.map((p) => p.x)) - Math.min(...mao.map((p) => p.x)) < 0.04 &&
              Math.max(...mao.map((p) => p.y)) - Math.min(...mao.map((p) => p.y)) < 0.05);
            desenharMaos(desenho, maos, resultado.poseLandmarks, resultado.faceLandmarks);
            detectadas.hidden = maos.length === 0;
            const contagem = `${maos.length} ${maos.length === 1 ? "mão localizada" : "mãos localizadas"}`;
            if (maos.length && detectadas.textContent !== contagem) detectadas.textContent = contagem;
            const mensagem = maoPequena ? "Aproxime um pouco as mãos, mantendo rosto e ombros no quadro." : "";
            if (estado.textContent !== mensagem) estado.textContent = mensagem;
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

  dispositivos?.observar(({ tipo, removido }) => {
    if (tipo !== "camera" || !sessao) return;
    parar(removido ? "A câmera escolhida foi desconectada. Escolha outra câmera e ligue novamente." : "Trocando de câmera…");
    if (!removido) ligar();
  });

  qualidade?.addEventListener("change", () => {
    try { localStorage.setItem("libras-qualidade-rastreamento", qualidade.value); } catch { /* Escolha vale para esta sessão. */ }
    if (estadoRastreamento) estadoRastreamento.textContent = "A escolha foi atualizada. Modelos maiores exigem mais do computador; confira seus sinais pessoais ao trocar.";
    if (!sessao) return;
    parar("Trocando a leitura da câmera…");
    ligar();
  });

  return parar;
}
