import { extrairAtributos, reamostrarSinal } from "./atributos-sinais.mjs";
import { ReconhecedorTemporal } from "./tcn.mjs";
import { SegmentadorDeSinais } from "./segmentacao-sinais.mjs";

export function montarSinais({ falarSinal }) {
  const estado = document.querySelector("#estado-modelo");
  const sinalAtual = document.querySelector("#sinal-atual");
  const legenda = document.querySelector("#legenda-camera");
  let modelo, dados, frase = "";
  const segmentador = new SegmentadorDeSinais();

  const pronto = (async () => {
    try {
      const resposta = await fetch(new URL("../modelos/sinais/estado.json", import.meta.url));
      if (!resposta.ok) throw new Error("Estado do modelo indisponível");
      const status = await resposta.json();
      estado.textContent = status.mensagem;
      if (!status.habilitado) return;
      const arquivo = await fetch(new URL("../modelos/sinais/tcn.json", import.meta.url));
      if (!arquivo.ok) throw new Error("Modelo indisponível");
      dados = await arquivo.json();
      modelo = new ReconhecedorTemporal(dados);
    } catch {
      estado.textContent = "Reconhecimento de sinais indisponível. Você pode acompanhar as mãos ou digitar uma mensagem para falar.";
    }
  })();

  function concluir(sequencia) {
    if (sequencia.length < 8 || !modelo) return;
    const [primeira, segunda] = modelo.prever(reamostrarSinal(sequencia));
    if (primeira.className === "Sem sinal" || primeira.probability < dados.confianca || primeira.probability - segunda.probability < dados.margem) {
      sinalAtual.hidden = true;
      legenda.textContent = primeira.className !== "Sem sinal" && primeira.probability >= 0.45
        ? `Leitura incerta: pode ser ${primeira.className.toLocaleLowerCase("pt-BR")}. Refaça o movimento completo.`
        : "Não consegui identificar. Confira os sinais disponíveis e refaça o movimento completo.";
      return;
    }
    const palavra = ({ Maca: "Maçã", America: "América" })[primeira.className] ?? primeira.className;
    frase = `${frase} ${palavra}`.trim().slice(-160);
    legenda.textContent = frase;
    sinalAtual.textContent = palavra;
    sinalAtual.hidden = false;
    falarSinal(palavra);
  }

  function receber(resultado, instante, proporcao) {
    const v = extrairAtributos(resultado, proporcao);
    const maos = v[36] > 0 || v[102] > 0;
    if (!modelo) {
      legenda.textContent = maos ? "Mãos detectadas · tradução em validação" : "Mostre as mãos no quadro";
      return;
    }
    const corpo = resultado.poseLandmarks;
    if (!corpo?.[12] || corpo[11].visibility < 0.5 || corpo[12].visibility < 0.5 || (resultado.faceLandmarks?.length ?? 0) < 387) {
      segmentador.reiniciar();
      if (!frase) legenda.textContent = "Enquadre também o rosto e os ombros";
      return;
    }
    const pontos = [...(resultado.leftHandLandmarks ?? []), ...(resultado.rightHandLandmarks ?? [])];
    if (pontos.some((p) => p.x < 0.015 || p.x > 0.985 || p.y < 0.015 || p.y > 0.985)) {
      segmentador.reiniciar();
      legenda.textContent = "Mão saindo do quadro. Afaste um pouco a câmera.";
      return;
    }
    const sequencia = segmentador.receber(v, instante);
    if (sequencia) concluir(sequencia);
    else if (segmentador.quadros.length && !frase) legenda.textContent = "Lendo o movimento…";
  }

  function parar() {
    segmentador.reiniciar();
    frase = "";
    sinalAtual.hidden = true;
    legenda.textContent = "Aguardando a câmera";
  }
  return { pronto, receber, parar, temModelo: () => Boolean(modelo) };
}
