import { criarArmazenamento } from "./armazenamento-sinais.mjs";
import { criarRegistro, reconhecerPessoal, prepararExemplo, validarBackup, chaveNome, MAX_SINAIS_PESSOAIS } from "./dicionario-pessoal.mjs";
import { SegmentadorDeSinais } from "./segmentacao-sinais.mjs";

export function montarDicionario({ prepararVoz, aoCapturar, aoTeste, armazenamento = criarArmazenamento(), agora = () => performance.now() } = {}) {
  const el = (id) => document.querySelector(`#${id}`);
  const estado = el("estado-pessoais"), lista = el("lista-pessoais"), formulario = el("cadastro-pessoal");
  const nome = el("nome-pessoal"), tipo = el("tipo-pessoal"), gravar = el("gravar-pessoal"), cancelar = el("cancelar-pessoal");
  const novo = el("novo-pessoal"), progresso = el("progresso-pessoal");
  const guia = el("guia-cadastro-camera"), continuar = el("continuar-cadastro-camera");
  let registros = [], rascunho, captura, prazo, relogio, ultimoQuadro = -Infinity, disponivel = false, consulta = 0, destruido = false;
  let canal;
  try { canal = new BroadcastChannel("libras-sinais-pessoais"); } catch { /* Sincroniza ao reabrir. */ }

  function avisar(mensagem) { if (estado.textContent !== mensagem) estado.textContent = mensagem; }
  function texto(id, valor) { const destino = el(id), proximo = String(valor); if (destino.textContent !== proximo) destino.textContent = proximo; }
  function tituloEtapa() {
    if (rascunho?.teste) return `Teste de ${rascunho.teste.nome}`;
    if (rascunho?.exemplos?.length >= 3) return `${rascunho.nome} · teste final`;
    return `${rascunho?.nome ?? "Seu sinal"} · gravação ${(rascunho?.exemplos?.length ?? 0) + 1} de 3`;
  }
  function mostrarGuia(fase, mensagem, { contagem, proxima = false, segundos } = {}) {
    guia.hidden = false; if (guia.dataset.fase !== fase) guia.dataset.fase = fase;
    el("area-legenda").hidden = true;
    texto("etapa-cadastro-camera", tituloEtapa());
    el("contagem-cadastro").hidden = contagem === undefined;
    texto("contagem-cadastro", contagem ?? "");
    texto("instrucao-cadastro-camera", mensagem);
    el("tempo-cadastro").hidden = segundos === undefined;
    texto("tempo-cadastro", segundos === undefined ? "" : `Até ${segundos} s para terminar`);
    continuar.hidden = !proxima;
    if (continuar.textContent !== gravar.textContent) continuar.textContent = gravar.textContent;
    el("cancelar-cadastro-camera").disabled = Boolean(rascunho?.salvando);
    avisar(contagem === undefined ? mensagem : `Prepare-se: ${contagem}. Espere “Sinalize agora”.`);
  }
  function ocultarGuia() {
    guia.hidden = true;
    el("area-legenda").hidden = false;
  }
  function liberarRelogios() { clearTimeout(prazo); clearTimeout(relogio); }
  function atualizarContagem() {
    if (!captura || destruido) return;
    const faltam = captura.inicio - agora();
    if (faltam > 0) {
      mostrarGuia("preparando", "Prepare-se. Ainda não faça o sinal.", { contagem: Math.ceil(faltam / 1000) });
    } else {
      mostrarGuia("gravando", captura.instrucao ?? "Sinalize agora. Ao terminar, abaixe as mãos.", { segundos: Math.max(0, Math.ceil((captura.inicio + 12000 - agora()) / 1000)) });
    }
  }
  function contar() {
    atualizarContagem();
    if (captura && !destruido) relogio = setTimeout(contar, 100);
  }
  function botao(rotulo, acao) {
    const b = document.createElement("button"); b.type = "button"; b.className = "secundario"; b.textContent = rotulo;
    b.addEventListener("click", acao); return b;
  }
  function desenharLista() {
    lista.replaceChildren();
    const quantidade = registros.length, ativos = registros.filter((r) => r.ativo).length;
    el("quantidade-pessoais").textContent = `${quantidade} ${quantidade === 1 ? "sinal salvo" : "sinais salvos"} · ${ativos} ${ativos === 1 ? "ativo" : "ativos"}`;
    el("exportar-pessoais").disabled = !registros.length;
    for (const registro of registros.toSorted((a, b) => a.nome.localeCompare(b.nome, "pt-BR"))) {
      const item = document.createElement("li"), detalhes = document.createElement("details"), resumo = document.createElement("summary");
      resumo.textContent = `${registro.nome} · ${registro.tipo === "pessoa" ? "Pessoa" : "Termo"}${registro.ativo ? "" : " · pausado"}`;
      const acoes = document.createElement("div"); acoes.className = "acoes";
      acoes.append(botao("Testar gesto", () => testar(registro)), botao("Renomear", () => {
        if (captura) { avisar("Conclua ou cancele a gravação primeiro."); return; }
        cancelarCadastro("");
        rascunho = { editar: registro }; formulario.hidden = false;
        nome.value = registro.nome; tipo.value = registro.tipo; tipo.disabled = false;
        atualizarEtapa(); nome.focus();
        avisar("Altere o nome ou o termo que será mostrado e falado.");
      }), botao(registro.ativo ? "Pausar" : "Ativar", async () => {
        try { await armazenamento.salvar({ ...registro, ativo: !registro.ativo }); await recarregar(); avisar(registro.ativo ? "Sinal pausado." : "Sinal ativado."); notificar(); }
        catch { avisar("Não foi possível alterar o sinal. Tente novamente."); }
      }), botao("Excluir", () => {
        const confirmar = botao(`Confirmar exclusão de ${registro.nome}`, async () => {
          try { await armazenamento.excluir(registro.id); if (rascunho?.editar?.id === registro.id || rascunho?.teste?.id === registro.id) cancelarCadastro(); await recarregar(); avisar("Sinal excluído deste navegador."); notificar(); }
          catch { avisar("Não foi possível excluir. Tente novamente."); }
        });
        acoes.replaceChildren(confirmar, botao("Manter sinal", desenharLista));
      }));
      detalhes.append(resumo, acoes); item.append(detalhes); lista.append(item);
    }
  }
  async function recarregar() {
    const token = ++consulta;
    const dados = await armazenamento.listar();
    // Revalida o contrato ao abrir dados gravados/importados, sem confiar em limites externos.
    const validos = dados.map((item) => criarRegistro(item));
    if (token !== consulta) return;
    registros = validos; disponivel = true; novo.disabled = false; desenharLista();
  }
  const notificar = () => { try { canal?.postMessage("alterado"); } catch { /* O registro já foi salvo; a aba pode estar fechando. */ } };
  if (canal) canal.onmessage = () => recarregar().catch(() => avisar("Não foi possível atualizar os sinais de outra aba."));
  const pronto = recarregar().then(() => avisar(registros.length ? "Seus sinais estão prontos para usar." : "Nenhum sinal pessoal cadastrado. Comece pelo nome de uma pessoa.")).catch(() => {
    novo.disabled = true; avisar("O armazenamento dos sinais pessoais está indisponível. Abra o tradutor em uma aba e tente novamente.");
  });

  function atualizarEtapa() {
    if (!rascunho) return;
    gravar.disabled = Boolean(captura || rascunho.salvando); cancelar.disabled = Boolean(rascunho.salvando);
    nome.disabled = tipo.disabled = Boolean(rascunho.exemplos?.length || rascunho.teste);
    el("dados-pessoal").hidden = Boolean(rascunho.nome || rascunho.teste);
    el("resumo-pessoal").textContent = rascunho.nome || rascunho.teste ? `Sinal de ${rascunho.nome ?? rascunho.teste.nome}` : "Primeiro, escolha o que este sinal vai dizer.";
    el("etapas-pessoal").hidden = Boolean(rascunho.editar || rascunho.teste);
    el("ajuda-gravacao").hidden = Boolean(rascunho.editar);
    const etapa = !rascunho.nome ? 0 : (rascunho.exemplos?.length ?? 0) < 3 ? 1 : 2;
    ["passo-nome", "passo-gravacoes", "passo-confirmacao"].forEach((id, i) => {
      if (i === etapa) el(id).setAttribute("aria-current", "step");
      else el(id).removeAttribute("aria-current");
    });
    progresso.hidden = Boolean(rascunho.editar || rascunho.teste);
    progresso.value = rascunho.exemplos?.length ?? 0;
    el("regravar-pessoal").hidden = !rascunho.exemplos?.length;
    el("regravar-pessoal").disabled = Boolean(captura || rascunho.salvando);
    gravar.textContent = rascunho.editar ? "Salvar nome" : rascunho.teste ? "Começar teste" :
      rascunho.exemplos.length < 3 ? `Começar gravação ${rascunho.exemplos.length + 1} de 3` : "Confirmar e salvar · mesmo sinal";
    el("etapa-pessoal").textContent = rascunho.editar ? "Altere o nome e salve." : rascunho.teste ? "Repita o sinal que você cadastrou." :
      rascunho.exemplos.length < 3 ? `${rascunho.exemplos.length} de 3 gravações prontas. Espere 3, 2, 1 e repita o mesmo sinal.` : "Teste final: repita o MESMO sinal. Se for reconhecido, o cadastro será salvo.";
  }
  function cancelarCadastro(mensagem = "Cadastro encerrado. Os sinais já salvos foram mantidos.") {
    liberarRelogios(); captura = undefined; rascunho = undefined; formulario.hidden = true;
    ocultarGuia();
    nome.disabled = tipo.disabled = false; gravar.disabled = cancelar.disabled = false;
    avisar(mensagem);
  }
  function iniciarCadastro(sugestao) {
    if (!disponivel) return;
    if (registros.length >= MAX_SINAIS_PESSOAIS) { avisar(`O limite é de ${MAX_SINAIS_PESSOAIS} sinais. Exclua um para cadastrar outro.`); return; }
    cancelarCadastro(""); rascunho = { exemplos: [], substituir: sugestao?.nome ? registros.find((r) => chaveNome(r.nome) === chaveNome(sugestao.nome)) : undefined }; formulario.hidden = false;
    nome.value = sugestao?.nome ?? ""; tipo.value = sugestao?.tipo ?? "pessoa"; atualizarEtapa(); nome.focus();
    avisar("1. Digite o nome. 2. Grave o mesmo sinal três vezes. 3. Repita esse sinal no teste final.");
  }
  function testar(registro) {
    cancelarCadastro(""); rascunho = { teste: registro }; formulario.hidden = false;
    nome.value = registro.nome; tipo.value = registro.tipo; atualizarEtapa();
    avisar(`Teste de ${registro.nome}. Ligue a câmera e clique em Começar teste.`);
  }
  async function concluir(sequencia) {
    const atual = rascunho;
    liberarRelogios(); captura = undefined;
    if (!atual) return;
    let mensagem, falhou = false;
    try {
      const exemplo = prepararExemplo(sequencia);
      if (atual.teste) {
        const leitura = reconhecerPessoal(exemplo, registros.map((r) => r.id === atual.teste.id ? { ...r, ativo: true } : r), true);
        if (leitura.registro?.id === atual.teste.id) { mensagem = `Reconhecido: ${leitura.registro.nome}. A voz vai falar esse nome.`; aoTeste?.(leitura.registro.nome); }
        else { falhou = true; mensagem = leitura.ambiguo ? "Pareceu com mais de um sinal. Tente novamente." : "Não reconheci este sinal. Repita o mesmo movimento completo."; }
      } else if (atual.exemplos.length < 3) {
        atual.exemplos.push(exemplo);
        mensagem = atual.exemplos.length === 3 ? "Três gravações prontas! No teste final, repita o MESMO sinal mais uma vez." : `Gravação ${atual.exemplos.length} de 3 salva. Abaixe as mãos e clique para repetir o MESMO sinal.`;
      } else {
        const registro = criarRegistro({ id: atual.substituir?.id, nome: atual.nome, tipo: atual.tipo, exemplos: atual.exemplos, confirmacao: exemplo }, registros);
        atual.salvando = true;
        gravar.disabled = cancelar.disabled = true;
        progresso.value = 4;
        mostrarGuia("salvando", "Sinal reconhecido. Salvando…");
        await armazenamento.salvar(registro);
        await recarregar(); notificar();
        if (rascunho === atual) cancelarCadastro(`Sinal de ${registro.nome} salvo e ativo. Agora ele pode gerar legenda e voz automaticamente.`);
        return;
      }
    } catch (erro) { if (rascunho === atual) { atual.salvando = false; falhou = true; mensagem = erro.name === "QuotaExceededError" ? "O navegador ficou sem espaço. Salve uma cópia e exclua sinais antigos antes de tentar novamente." : erro.message ?? "Não foi possível salvar. Tente novamente."; } }
    if (rascunho === atual) {
      atualizarEtapa();
      mostrarGuia(falhou ? "erro" : "pronto", mensagem, { proxima: true });
    }
  }
  gravar.addEventListener("click", async () => {
    if (!rascunho || captura) return;
    if (rascunho.editar) {
      try {
        const registro = criarRegistro({ ...rascunho.editar, nome: nome.value, tipo: tipo.value }, registros);
        await armazenamento.salvar(registro); await recarregar(); notificar(); cancelarCadastro("Nome atualizado.");
      } catch (erro) { avisar(erro.message); }
      return;
    }
    if (agora() - ultimoQuadro > 1500) { avisar("Ligue a câmera e enquadre rosto, ombros e mãos antes de gravar."); return; }
    if (!rascunho.teste && !rascunho.exemplos.length) {
      const valor = nome.value.trim().replace(/\s+/g, " ");
      if (!valor || valor.length > 60) { avisar("Escreva um nome ou termo de até 60 caracteres."); nome.focus(); return; }
      if (registros.some((r) => r.id !== rascunho.substituir?.id && chaveNome(r.nome) === chaveNome(valor))) { avisar("Este nome já tem um sinal. Use Renomear ou escolha outro nome."); return; }
      rascunho.nome = valor; rascunho.tipo = tipo.value;
    }
    aoCapturar?.(); prepararVoz?.(rascunho.nome ?? rascunho.teste?.nome);
    captura = { inicio: agora() + 3000, segmentador: new SegmentadorDeSinais() };
    atualizarEtapa(); nome.disabled = tipo.disabled = true;
    contar();
    el("camera").closest?.(".quadro-camera")?.scrollIntoView({ block: "center", behavior: "instant" });
    prazo = setTimeout(() => {
      liberarRelogios(); captura = undefined; atualizarEtapa();
      mostrarGuia("erro", "Não captei um sinal completo. Mantenha rosto e mãos no quadro, faça o mesmo sinal um pouco mais devagar e abaixe as mãos ao terminar.", { proxima: true });
    }, 15000);
  });
  novo.addEventListener("click", () => iniciarCadastro());
  el("ajustar-oi")?.addEventListener("click", () => {
    el("meus-sinais").open = true;
    iniciarCadastro({ nome: "Oi", tipo: "termo" });
    avisar("Vamos ajustar o Oi à sua forma de sinalizar. Grave o mesmo sinal três vezes e faça o teste final.");
  });
  el("regravar-pessoal").addEventListener("click", () => {
    if (!rascunho?.exemplos) return;
    liberarRelogios(); captura = undefined; rascunho.exemplos = []; atualizarEtapa(); ocultarGuia();
    avisar("Vamos recomeçar. Grave novamente o MESMO sinal três vezes.");
  });
  cancelar.addEventListener("click", () => cancelarCadastro());
  continuar.addEventListener("click", () => gravar.click());
  el("cancelar-cadastro-camera").addEventListener("click", () => cancelarCadastro());
  el("exportar-pessoais").addEventListener("click", () => {
    const arquivo = new Blob([JSON.stringify({ schema: 1, sinais: registros })], { type: "application/json" });
    const url = URL.createObjectURL(arquivo), link = document.createElement("a");
    link.href = url; link.download = "meus-sinais-libras.json"; document.body.append(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    avisar("Cópia dos sinais preparada. Guarde o arquivo para restaurar neste ou em outro computador.");
  });
  el("importar-pessoais").addEventListener("click", () => el("arquivo-pessoais").click());
  el("arquivo-pessoais").addEventListener("change", async ({ target }) => {
    const [arquivo] = target.files ?? [];
    if (!arquivo) return;
    try {
      if (arquivo.size > 10 * 1024 * 1024) throw new Error("O arquivo deve ter no máximo 10 MB.");
      const novos = validarBackup(JSON.parse(await arquivo.text()), registros);
      await armazenamento.importar(novos); await recarregar(); notificar(); avisar(`${novos.length} ${novos.length === 1 ? "sinal importado" : "sinais importados"}. Cadastros já existentes foram mantidos.`);
    } catch (erro) { avisar(erro instanceof SyntaxError ? "O arquivo não é uma cópia válida dos sinais pessoais." : erro.message ?? "Não foi possível importar este arquivo."); }
    finally { target.value = ""; }
  });
  return {
    pronto,
    receber(v, instante, orientacao) {
      ultimoQuadro = agora();
      if (!rascunho) return false;
      if (!captura) return true;
      if (agora() < captura.inicio) { atualizarContagem(); return true; }
      if (orientacao) {
        captura.orientacaoDesde ??= instante;
        if (instante - captura.orientacaoDesde >= 250) captura.segmentador.reiniciar();
        captura.instrucao = orientacao; atualizarContagem(); return true;
      }
      captura.orientacaoDesde = undefined;
      const sequencia = captura.segmentador.receber(v, instante);
      captura.instrucao = captura.segmentador.quadros.length ? "Gravando seu sinal. Ao terminar, faça uma breve pausa." : "Sinalize agora. Mantenha as mãos dentro do quadro.";
      atualizarContagem();
      if (sequencia) concluir(sequencia);
      return true;
    },
    reconhecer: (seq) => reconhecerPessoal(seq, registros),
    mensagemCaptura: () => estado.textContent,
    temSinais: () => registros.some((r) => r.ativo),
    cancelar() {
      ultimoQuadro = -Infinity;
      if (rascunho?.salvando) { formulario.hidden = true; ocultarGuia(); return; }
      if (rascunho) cancelarCadastro("Gravação cancelada. Os sinais salvos continuam disponíveis.");
    },
    destruir() { destruido = true; liberarRelogios(); canal?.close(); },
  };
}
