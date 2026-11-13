const TIPOS = { camera: "videoinput", microfone: "audioinput", saida: "audiooutput" };
const NOMES = { camera: "Câmera", microfone: "Microfone", saida: "Saída de som" };
const CHAVE = "libras-dispositivos-v1";

export function montarDispositivos() {
  const media = navigator.mediaDevices;
  const estado = document.querySelector("#estado-dispositivos");
  const atualizarBotao = document.querySelector("#atualizar-dispositivos");
  const permitir = document.querySelector("#permitir-dispositivos");
  const seletores = Object.fromEntries(Object.keys(TIPOS).map((tipo) => [tipo, document.querySelector(`#dispositivo-${tipo}`)]));
  const ouvintes = new Set(), autorizados = new Set(), indisponiveis = new Set();
  let escolhas = {}, revisao = 0, destruido = false;
  try { escolhas = JSON.parse(localStorage.getItem(CHAVE)) ?? {}; } catch { /* Usa os padrões se o armazenamento estiver indisponível. */ }
  escolhas = Object.fromEntries(Object.keys(TIPOS).map((tipo) => [tipo, typeof escolhas[tipo] === "string" ? escolhas[tipo] : ""]));
  const suportaSaida = typeof globalThis.AudioContext?.prototype?.setSinkId === "function";
  if (!suportaSaida) { escolhas.saida = ""; salvar(); }

  function avisar(tipo, removido = false) {
    for (const ouvinte of ouvintes) ouvinte({ tipo, id: escolhas[tipo], removido });
  }
  function salvar() {
    try { localStorage.setItem(CHAVE, JSON.stringify(escolhas)); } catch { /* A seleção continua válida nesta aba. */ }
  }
  function opcao(valor, nome, desabilitada = false) {
    const item = document.createElement("option");
    item.value = valor; item.textContent = nome; item.disabled = desabilitada;
    return item;
  }
  async function atualizar() {
    const token = ++revisao;
    if (!media?.enumerateDevices) {
      estado.textContent = "Abra o tradutor em uma aba do Chrome para escolher os dispositivos.";
      return;
    }
    try {
      const lista = await media.enumerateDevices();
      if (destruido || token !== revisao) return;
      for (const [tipo, kind] of Object.entries(TIPOS)) {
        const itens = lista.filter((item) => item.kind === kind && item.deviceId && item.deviceId !== "default");
        if (itens.some((item) => item.label)) autorizados.add(tipo);
        const seletor = seletores[tipo];
        const opcoes = [opcao("", "Padrão do sistema"), ...itens.map((item, i) => opcao(item.deviceId, item.label || `${NOMES[tipo]} ${i + 1}`))];
        const id = escolhas[tipo];
        if (id && !itens.some((item) => item.deviceId === id)) {
          const ausente = autorizados.has(tipo);
          opcoes.push(opcao(id, ausente ? "Dispositivo escolhido desconectado" : "Dispositivo salvo · permita o acesso para listar", ausente));
          if (ausente && !indisponiveis.has(tipo)) {
            indisponiveis.add(tipo); avisar(tipo, true);
          }
        } else if (indisponiveis.delete(tipo)) avisar(tipo);
        seletor.replaceChildren(...opcoes);
        seletor.value = id;
      }
      seletores.saida.disabled = !suportaSaida;
      permitir.hidden = autorizados.has("camera") && autorizados.has("microfone");
      estado.textContent = indisponiveis.size
        ? `${[...indisponiveis].map((tipo) => NOMES[tipo]).join(" e ")} desconectado. Escolha outro dispositivo para continuar.`
        : !suportaSaida ? "Este navegador usa a saída padrão do Windows. Atualize o Chrome para escolher outra saída aqui."
          : permitir.hidden ? "Dispositivos atualizados. Você pode trocar mesmo durante o uso."
            : "Se faltarem nomes ou dispositivos, clique em Permitir e listar e autorize o acesso no Chrome.";
    } catch {
      if (!destruido && token === revisao) estado.textContent = "Não foi possível listar os dispositivos. Abra em aba e confira as permissões do Chrome.";
    }
  }
  for (const [tipo, seletor] of Object.entries(seletores)) {
    seletor.append(opcao("", "Padrão do sistema"));
    seletor.value = escolhas[tipo];
    seletor.addEventListener("change", () => {
      escolhas[tipo] = seletor.value;
      indisponiveis.delete(tipo);
      salvar(); avisar(tipo);
      estado.textContent = `${NOMES[tipo]} selecionado. Use Testar som para conferir a saída de áudio.`;
    });
  }
  permitir.addEventListener("click", async () => {
    permitir.disabled = true;
    let falhou = false;
    // Solicita só a categoria ainda sem permissão, sem reabrir a câmera em uso.
    for (const tipo of ["camera", "microfone"]) {
      if (autorizados.has(tipo) || destruido) continue;
      try {
        const stream = await media.getUserMedia({ video: tipo === "camera", audio: tipo === "microfone" });
        if (!destruido) autorizados.add(tipo);
        stream.getTracks().forEach((faixa) => faixa.stop());
      } catch { falhou = true; }
    }
    if (destruido) return;
    await atualizar();
    permitir.disabled = false;
    if (falhou) estado.textContent = "Um acesso foi bloqueado ou o dispositivo está ocupado. Permita câmera e microfone nas configurações desta aba e atualize a lista.";
  });
  atualizarBotao.addEventListener("click", atualizar);
  media?.addEventListener("devicechange", atualizar);
  atualizar();
  return {
    selecionado: (tipo) => escolhas[tipo] || "", atualizar,
    observar(ouvinte) { ouvintes.add(ouvinte); return () => ouvintes.delete(ouvinte); },
    destruir() { destruido = true; revisao++; media?.removeEventListener("devicechange", atualizar); ouvintes.clear(); },
  };
}
