export const PERFIS_RASTREAMENTO = Object.freeze({
  full: { nome: "Full · experimental", arquivo: "../modelos/rastreamento/holistic_full.task" },
  heavy: { nome: "Heavy · experimental", arquivo: "../modelos/rastreamento/holistic_heavy.task" },
  lite: { nome: "Mais leve · Lite", arquivo: "../modelos/holistic_landmarker.task" },
});

export async function criarModeloComAceleracao(criar, { forcarCPU = false } = {}) {
  let modelo, aceleracao;
  if (!forcarCPU) {
    try {
      modelo = await criar("GPU");
      aceleracao = "aceleração gráfica";
    } catch { /* Driver indisponível: tenta o processador abaixo. */ }
  }
  if (!modelo) {
    modelo = await criar("CPU");
    aceleracao = "processador";
  }
  return { detectForVideo: (video, instante) => modelo.detectForVideo(video, instante),
    close: () => modelo.close(), aceleracao };
}

// Mantém uma instância por painel. A troca espera a criação anterior e libera
// seus recursos antes de carregar outro pacote; a câmera cancela a sessão velha.
export function criarCarregadorDeRastreamento(criarModelo) {
  let fila = Promise.resolve(), pedido, modeloAtivo;
  return function carregar(perfil = "lite", { forcarCPU = false } = {}) {
    if (!Object.hasOwn(PERFIS_RASTREAMENTO, perfil)) perfil = "lite";
    if (pedido?.perfil === perfil && pedido.forcarCPU === forcarCPU) return pedido.promessa;
    const atual = { perfil, forcarCPU };
    atual.promessa = fila.then(async () => {
      modeloAtivo?.close();
      modeloAtivo = undefined;
      let efetivo = perfil, aviso = "";
      try {
        modeloAtivo = await criarModelo(PERFIS_RASTREAMENTO[perfil], { forcarCPU });
      } catch (erro) {
        if (perfil === "lite") throw erro;
        efetivo = "lite";
        modeloAtivo = await criarModelo(PERFIS_RASTREAMENTO.lite, { forcarCPU });
        aviso = "O modelo escolhido não carregou. Usando a leitura mais leve; recarregue a extensão para tentar novamente.";
      }
      const modelo = modeloAtivo;
      const detectar = (video, instante) => modelo.detectForVideo(video, instante);
      return Object.assign(detectar, { perfil: efetivo, nome: PERFIS_RASTREAMENTO[efetivo].nome, aviso, aceleracao: modelo.aceleracao });
    }).catch((erro) => {
      if (pedido === atual) pedido = undefined;
      throw erro;
    });
    fila = atual.promessa.then(() => {}, () => {});
    pedido = atual;
    return atual.promessa;
  };
}
