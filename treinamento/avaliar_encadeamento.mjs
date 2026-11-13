// Regressão do fluxo incremental com landmarks reais e sequências montadas.
// Não usa webcam, navegador, alto-falantes nem o cadastro privado do usuário.
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { resolve, join } from "node:path";
import { SegmentadorDeSinais } from "../painel/segmentacao-sinais.mjs";
import { FluxoSequencialDeSinais, lerSinalConhecido } from "../painel/encadeamento-sinais.mjs";
import { reconhecerSaudacao } from "../painel/saudacoes.mjs";
import { sinalEmCurso } from "../painel/atributos-sinais.mjs";
import { criarRegistro, reconhecerPessoal } from "../painel/dicionario-pessoal.mjs";

const cache = resolve(process.argv[2] ?? "C:/Users/Gabri/AppData/Local/Temp");
const fontes = [];
function carregar(relativo) {
  const conteudo = readFileSync(join(cache, relativo));
  fontes.push({ arquivo: relativo.replaceAll("\\", "/"), sha256: createHash("sha256").update(conteudo).digest("hex") });
  return JSON.parse(conteudo);
}
const saudacao = JSON.parse(readFileSync(new URL("../modelos/sinais/saudacao.json", import.meta.url), "utf8"));
const videosOi = carregar("libras-oi/fluxo-treino-todos.json");
const ines = { ...carregar("libras-oi/ines-camera.json"), arquivo: "INES-Oi.mp4", positivo: true };
videosOi.push(ines, ...carregar("libras-oi/acenar.json"));
const dadosPessoais = carregar("libras-dicionario-pessoa02/amostras.json");
const vazio = () => Array(228).fill(0);
const visivel = (v) => [36, 102].some((b) => v[b] > 0.5 && Math.abs(v[b + 1]) < 3.5 && v[b + 2] < 2.8);
const leituraCom = (registros = [], usarOi = true) => (sequencia) => lerSinalConhecido(sequencia, {
  pessoais: registros.length ? { reconhecer: (s) => reconhecerPessoal(s, registros) } : undefined,
  saudacao: usarOi ? saudacao : undefined, reconhecerSaudacao,
});

function avaliar(quadros, lerConhecido) {
  const fluxo = new FluxoSequencialDeSinais(lerConhecido), eventos = [], falas = [];
  for (const { v, instante } of quadros) {
    const evento = fluxo.receber(v, instante);
    if (!evento) continue;
    const leitura = evento.tipo === "conhecido" ? evento.leitura : lerConhecido(evento.sequencia);
    const registro = { instanteMs: Math.round(instante), caminho: evento.tipo, quadros: evento.sequencia.length,
      palavra: leitura?.palavra ?? null, ambiguo: Boolean(leitura?.ambiguo) };
    eventos.push(registro);
    if (leitura?.palavra) falas.push(leitura.palavra);
  }
  return { falas, eventos };
}
function cronologia(item, caudaMs = 1800) {
  const dt = 1000 / item.fps;
  return [...item.vetores.map((v, i) => ({ v, instante: i * dt })),
    ...Array.from({ length: Math.ceil(caudaMs / dt) }, (_, i) => ({ v: vazio(), instante: (item.vetores.length + i) * dt }))];
}
function segmentarCadastro(item) {
  const segmentador = new SegmentadorDeSinais();
  for (const { v, instante } of cronologia(item)) {
    const sequencia = segmentador.receber(v, instante);
    if (sequencia) return sequencia;
  }
  throw new Error(`Sem segmento de cadastro: ${item.arquivo}`);
}
const registros = [], cadastros = [];
for (const classe of dadosPessoais.classes) {
  const amostras = dadosPessoais.amostras.filter((a) => a.classe === classe).sort((a, b) => a.repeticao - b.repeticao);
  try {
    const registro = criarRegistro({ id: `fixture-${classe}`, nome: classe,
      exemplos: amostras.slice(0, 3).map(segmentarCadastro), confirmacao: segmentarCadastro(amostras[3]) }, registros);
    registros.push(registro);
    cadastros.push({ classe, aprovado: true, limite: registro.limite });
  } catch (erro) { cadastros.push({ classe, aprovado: false, motivo: erro.message }); }
}
const resultadosOi = videosOi.map((item) => ({ arquivo: item.arquivo, esperado: item.positivo ? "Oi" : null,
  ...avaliar(cronologia(item), leituraCom()) }));
const resultadosPessoais = dadosPessoais.amostras.filter((a) => a.repeticao === 5 || !dadosPessoais.classes.includes(a.classe)).map((item) => ({
  arquivo: item.arquivo, classe: item.classe, esperado: registros.some((r) => r.nome === item.classe) ? item.classe : null,
  classeForaDoCadastro: !dadosPessoais.classes.includes(item.classe),
  ...avaliar(cronologia(item), leituraCom(registros)),
}));

// O alias abaixo serve exclusivamente para exercitar o encadeamento do nome.
// Não afirma que o sinal original Amarelo seja um sinal-nome de Gabriel.
const amarelo = registros.find((r) => r.nome === "Amarelo");
if (!amarelo) throw new Error("A fixture Amarelo não passou pela confirmação; o ensaio de sequência não pode ser montado.");
const gabriel = { ...amarelo, id: "fixture-Gabriel", nome: "Gabriel" };
const lerFixture = leituraCom([gabriel]);
const amostrasAmarelo = dadosPessoais.amostras.filter((a) => a.classe === "Amarelo");

// Recorte fixado antes da classificação: primeiro ao último quadro em que
// sinalEmCurso detecta mão ativa. Preserva todos os quadros nesse intervalo,
// inclusive pausas internas e perdas naturais; não consulta o reconhecedor.
function recortarMovimento(item) {
  const inicio = item.vetores.findIndex(sinalEmCurso);
  const fim = item.vetores.findLastIndex(sinalEmCurso);
  if (inicio < 0 || fim - inicio < 3) throw new Error(`Recorte ativo insuficiente: ${item.arquivo}`);
  const vetores = item.vetores.slice(inicio, fim + 1);
  if (!visivel(vetores.at(-1))) throw new Error(`Recorte sem mão final visível: ${item.arquivo}`);
  return { arquivo: item.arquivo, fps: item.fps, vetores,
    recorte: { criterio: "primeiro ao último quadro com sinalEmCurso, independente do resultado", primeiroQuadro: inicio, ultimoQuadro: fim, pontosAlterados: false } };
}
const oiRecortado = recortarMovimento(ines);
const gabrielA = recortarMovimento(amostrasAmarelo.find((a) => a.repeticao === 5));
const gabrielB = recortarMovimento(amostrasAmarelo.find((a) => a.repeticao === 4));
function montarSequencia(partes, pausaMs = 500, esperaFinalMs = 3200) {
  let instante = 0;
  const quadros = [], fronteiras = [];
  for (const [i, parte] of partes.entries()) {
    const dt = 1000 / parte.fps;
    const inicio = instante;
    for (const v of parte.vetores) { quadros.push({ v, instante }); instante += dt; }
    const pausa = i === partes.length - 1 ? esperaFinalMs : pausaMs;
    const inicioPausa = instante;
    for (let ms = 0; ms < pausa; ms += 50) quadros.push({ v: parte.vetores.at(-1), instante: inicioPausa + ms });
    instante = inicioPausa + pausa;
    fronteiras.push({ arquivo: parte.arquivo, inicioMs: Math.round(inicio), inicioPausaMs: Math.round(inicioPausa),
      pausaRealMs: pausa, intervaloDosQuadrosDaPausaMs: 50, maoVisivelNaPausa: visivel(parte.vetores.at(-1)) });
  }
  return { quadros, fronteiras };
}
const casos = [
  { nome: "Oi seguido de Gabriel", partes: [oiRecortado, gabrielA], esperado: ["Oi", "Gabriel"] },
  { nome: "Gabriel repetido com execuções distintas", partes: [gabrielA, gabrielB], esperado: ["Gabriel", "Gabriel"] },
  { nome: "Oi e pose mantida por 3,2 s", partes: [oiRecortado], esperado: ["Oi"] },
  { nome: "Gabriel e pose mantida por 3,2 s", partes: [gabrielA], esperado: ["Gabriel"] },
];
const sequencias = casos.map(({ nome, partes, esperado }) => {
  const montagem = montarSequencia(partes);
  const leitura = avaliar(montagem.quadros, lerFixture);
  return { nome, esperado, correto: JSON.stringify(leitura.falas) === JSON.stringify(esperado),
    ...leitura, fronteiras: montagem.fronteiras, maosVisiveisNasFronteiras: partes.every((p) => visivel(p.vetores[0]) && visivel(p.vetores.at(-1))), semQuadrosAusentesDuranteTodaAMontagem: montagem.quadros.every(({ v }) => visivel(v)),
    recortes: partes.map(({ arquivo, recorte }) => ({ arquivo, ...recorte })) };
});
const positivosOi = resultadosOi.filter((r) => r.esperado), negativosOi = resultadosOi.filter((r) => !r.esperado);
const conhecidos = resultadosPessoais.filter((r) => r.esperado), desconhecidos = resultadosPessoais.filter((r) => !r.esperado);
const resumo = {
  saudacao: { positivos: positivosOi.length, corretos: positivosOi.filter((r) => r.falas.length === 1 && r.falas[0] === "Oi").length,
    negativos: negativosOi.length, negativosComFala: negativosOi.filter((r) => r.falas.length).length,
    repeticoesExtras: positivosOi.reduce((s, r) => s + Math.max(0, r.falas.length - 1), 0) },
  pessoais: { cadastrosAceitos: registros.length, conhecidos: conhecidos.length,
    corretos: conhecidos.filter((r) => r.falas.length === 1 && r.falas[0] === r.esperado).length,
    recusas: conhecidos.filter((r) => !r.falas.length).length,
    conhecidosComFalaErradaOuExtra: conhecidos.filter((r) => r.falas.some((f) => f !== r.esperado) || r.falas.length > 1).length,
    negativosDeOutrasClasses: desconhecidos.filter((r) => r.classeForaDoCadastro).length,
    testesDeCadastroReprovado: desconhecidos.filter((r) => !r.classeForaDoCadastro).length,
    negativosComFala: desconhecidos.filter((r) => r.falas.length).length },
  encadeamento: { casos: sequencias.length, corretos: sequencias.filter((r) => r.correto).length },
};
const verificacoes = {
  quatroOiPreservados: resumo.saudacao.positivos === 4 && resumo.saudacao.corretos === 4,
  negativosOiSemFala: resumo.saudacao.negativos === 341 && resumo.saudacao.negativosComFala === 0,
  pessoaisSemPalavrasErradasOuExtras: resumo.pessoais.conhecidosComFalaErradaOuExtra === 0 && resumo.pessoais.negativosComFala === 0,
  encadeamentosEPoseSemDuplicacao: sequencias.every((r) => r.correto),
};
const relatorio = {
  schema: 1, protocolo: "Regressão exploratória do fluxo incremental completo: pausas curtas, confirmação, consumo e rearme reais. O caminho final também consulta os reconhecedores de Oi/pessoais. A TCN geral não é executada neste ensaio específico.",
  fontes, modeloOiSha256: createHash("sha256").update(JSON.stringify(saudacao)).digest("hex"),
  cadastroPessoal: { pessoa: dadosPessoais.pessoa, origem: dadosPessoais.origem, revisao: dadosPessoais.revisao,
    divisao: "Repetições 1–3 para cadastro, 4 para confirmação e 5 para teste; outras 14 classes nas repetições 1–2 são desconhecidas.", cadastros },
  fixtureGabriel: { significadoOriginal: "Amarelo", rotuloDeTeste: "Gabriel", cadastroRealDoUsuario: false,
    observacao: "Alias apenas para verificar a ordem de sinais reconhecidos; não atribui este sinal a uma pessoa. Oi usa vídeo INES e o nome usa vídeos MINDS da pessoa 02, com montagem de landmarks de pessoas distintas. A repetição 4 usada no encadeamento já fez parte da confirmação de cadastro." },
  resumo, verificacoes, aprovado: Object.values(verificacoes).every(Boolean), resultadosOi, resultadosPessoais, sequencias,
  limites: [
    "Os vídeos isolados já foram usados no desenvolvimento. Esta execução é regressão e não mede generalização para pessoas novas.",
    "As sequências combinam recortes de landmarks reais, pausa estável de 500 ms entre sinais e espera final de 3200 ms, com a pose final congelada em quadros a cada 50 ms. O caso de repetição usa duas execuções distintas do sinal pessoal. Não são vídeos de uma conversa real.",
    "Os recortes usam do primeiro ao último quadro com sinalEmCurso, preservando os quadros internos e sem consultar a classificação. Os resultados das gravações inteiras também são registrados para expor recusas, falas extras e erros.",
    "Nenhum landmark é zerado entre os recortes; pontos de mão naturalmente ausentes nos vídeos continuam ausentes e são informados pela checagem da montagem.",
    "Não verifica o cadastro Gabriel do usuário, sua webcam, a captura de novos pixels, síntese de voz, reprodução sonora, interface do Chrome ou Google Meet.",
    "Não testa tradução livre ou outros vocábulos. A ausência de fala nos negativos vale para Oi e os cadastros deste ensaio, sem a TCN geral.",
  ],
};
writeFileSync(new URL("./resultado-encadeamento.json", import.meta.url), JSON.stringify(relatorio, null, 2) + "\n");
console.log(JSON.stringify({ resumo, verificacoes, aprovado: relatorio.aprovado, sequencias: sequencias.map(({ nome, esperado, falas, correto }) => ({ nome, esperado, falas, correto })) }));
if (!relatorio.aprovado) process.exitCode = 1;
