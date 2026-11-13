import { extrairAtributos, reamostrarSinal } from "./atributos-sinais.mjs";
import { ReconhecedorTemporal } from "./tcn.mjs";
import { SegmentadorDeSinais } from "./segmentacao-sinais.mjs";

export function montarSinais({ falarSinal, pessoais }) {
  const estado = document.querySelector("#estado-modelo");
  const sinalAtual = document.querySelector("#sinal-atual");
  const legenda = document.querySelector("#legenda-camera");
  const areaLegenda = document.querySelector("#area-legenda");
  const orientacaoCamera = document.querySelector("#orientacao-camera");
  let modelo, dados, frase = "";
  let aviso = "", avisoAte = -Infinity, problema = "", problemaDesde = 0;
  const segmentador = new SegmentadorDeSinais();
  const semLegenda = "Os sinais reconhecidos aparecem aqui.";
  legenda.textContent = semLegenda;

  function orientar(mensagem, instante, duracao = 0) {
    if (duracao) { aviso = mensagem; avisoAte = instante + duracao; }
    const proxima = instante < avisoAte && !duracao ? aviso : mensagem;
    if (orientacaoCamera.textContent !== proxima) orientacaoCamera.textContent = proxima;
  }

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

  function concluir(sequencia, instante) {
    if (sequencia.length < 8) return;
    const pessoal = pessoais?.reconhecer(sequencia);
    if (pessoal?.registro) { falarReconhecido(pessoal.registro.nome); return; }
    if (pessoal?.ambiguo) {
      sinalAtual.hidden = true;
      orientar("Não deu para escolher entre dois sinais pessoais. Repita o sinal completo.", instante, 2500);
      return;
    }
    if (!modelo) { orientar("Este sinal não foi reconhecido. Repita ou confira Meus sinais.", instante, 2500); return; }
    const [primeira, segunda] = modelo.prever(reamostrarSinal(sequencia));
    if (primeira.className === "Sem sinal" || primeira.probability < dados.confianca || primeira.probability - segunda.probability < dados.margem) {
      sinalAtual.hidden = true;
      orientar("Não reconheci com segurança. Repita o sinal completo ou confira os sinais disponíveis.", instante, 2500);
      return;
    }
    const palavra = ({ Maca: "Maçã", America: "América" })[primeira.className] ?? primeira.className;
    falarReconhecido(palavra);
  }

  function falarReconhecido(palavra) {
    avisoAte = -Infinity;
    orientacaoCamera.textContent = "Sinal reconhecido. A legenda e a voz acompanham os sinais aceitos.";
    frase = `${frase} ${palavra}`.trim().slice(-160);
    legenda.textContent = frase;
    sinalAtual.textContent = palavra;
    sinalAtual.hidden = false;
    legenda.scrollTop = legenda.scrollHeight;
    falarSinal(palavra);
  }

  function receber(resultado, instante, proporcao) {
    const v = extrairAtributos(resultado, proporcao);
    const maos = v[36] > 0 || v[102] > 0;
    const corpo = resultado.poseLandmarks;
    const pontos = [...(resultado.leftHandLandmarks ?? []), ...(resultado.rightHandLandmarks ?? [])];
    const orientacao = !corpo?.[12] || corpo[11].visibility < 0.5 || corpo[12].visibility < 0.5 || (resultado.faceLandmarks?.length ?? 0) < 387
      ? "Enquadre também o rosto e os ombros"
      : pontos.some((p) => p.x < 0.015 || p.x > 0.985 || p.y < 0.015 || p.y > 0.985)
        ? "Mão saindo do quadro. Afaste um pouco a câmera." : "";
    if (pessoais?.receber(v, instante, orientacao)) {
      segmentador.reiniciar();
      sinalAtual.hidden = true;
      areaLegenda.hidden = true;
      orientar("Cadastro em andamento. Siga a contagem e as instruções na imagem da câmera.", instante);
      return;
    }
    areaLegenda.hidden = false;
    if (!modelo && !pessoais?.temSinais()) {
      orientar(maos ? "Rastreamento ativo. Reconhecimento em validação: cadastre um sinal em Meus sinais." : "Mostre as mãos dentro do quadro.", instante);
      return;
    }
    if (orientacao) {
      segmentador.reiniciar();
      sinalAtual.hidden = true;
      if (problema !== orientacao) { problema = orientacao; problemaDesde = instante; }
      if (instante - problemaDesde >= 600) orientar(orientacao, instante);
      return;
    }
    problema = "";
    const sequencia = segmentador.receber(v, instante);
    if (sequencia) concluir(sequencia, instante);
    else orientar(segmentador.quadros.length ? "Lendo seu sinal. Ao terminar, abaixe as mãos." : "Pronto para o próximo sinal de Libras.", instante);
  }

  function parar() {
    pessoais?.cancelar();
    segmentador.reiniciar();
    frase = "";
    avisoAte = -Infinity; problema = "";
    sinalAtual.hidden = true;
    legenda.textContent = semLegenda;
    areaLegenda.hidden = false;
    orientacaoCamera.textContent = "Ligue a câmera para começar.";
  }
  return { pronto, receber, parar, falarReconhecido, temModelo: () => Boolean(modelo || pessoais?.temSinais()) };
}
