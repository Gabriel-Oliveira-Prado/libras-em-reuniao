import { reamostrarSinal, sinalEmCurso } from "./atributos-sinais.mjs";

export const MAX_SINAIS_PESSOAIS = 30;
const PASSOS = 32, ATRIBUTOS = 228;
export const chaveNome = (nome) => nome.normalize("NFKD").replace(/\p{M}/gu, "").toLocaleLowerCase("pt-BR").trim().replace(/\s+/g, " ");

export function prepararExemplo(quadros) {
  if (!Array.isArray(quadros) || quadros.length < 4 || quadros.length > 360 ||
      quadros.some((v) => !(Array.isArray(v) || ArrayBuffer.isView(v)) || v.length !== ATRIBUTOS || !Array.from(v).every((n) => Number.isFinite(n) && Math.abs(n) <= 5))) {
    throw new Error("Gravação inválida. Faça o gesto inteiro com as mãos dentro do quadro.");
  }
  const superiores = quadros.map((v, i) => sinalEmCurso(v) ? i : -1).filter((i) => i >= 0);
  const ativos = superiores.length >= 4 ? superiores : quadros.map((v, i) => [36, 102].some((b) => v[b] > 0.5 && Math.abs(v[b + 1]) < 3.5 && v[b + 2] < 2.8) ? i : -1).filter((i) => i >= 0);
  if (ativos.length < 4) throw new Error("Poucos quadros de mãos. Mantenha os dedos visíveis durante o gesto completo.");
  const recorte = quadros.slice(ativos[0], ativos.at(-1) + 1);
  return reamostrarSinal(recorte, PASSOS).map((v) => Array.from(v, (n) => Math.round(n * 10000) / 10000));
}

function custoQuadro(a, b) {
  let custo = 0;
  for (const inicio of [36, 102]) {
    const presenteA = a[inicio] > 0.5, presenteB = b[inicio] > 0.5;
    if (presenteA !== presenteB) { custo += 1; continue; }
    if (!presenteA) continue;
    custo += 0.3 * ((a[inicio + 1] - b[inicio + 1]) ** 2 + (a[inicio + 2] - b[inicio + 2]) ** 2) / 2;
    let forma = 0;
    for (let j = inicio + 3; j < inicio + 66; j++) forma += (a[j] - b[j]) ** 2;
    custo += 0.6 * forma / 63;
  }
  let corpo = 0, rosto = 0;
  for (const inicio of [0, 12, 16, 20, 24]) {
    for (let j = inicio; j < inicio + 3; j++) corpo += (a[j] - b[j]) ** 2;
  }
  for (let j = 168; j < 228; j++) rosto += (a[j] - b[j]) ** 2;
  return custo / 2 + 0.08 * corpo / 15 + 0.02 * rosto / 60;
}

// Alinha velocidades diferentes; preserva a ordem e o lado das mãos.
export function distanciaGestos(a, b) {
  const n = a.length, m = b.length, faixa = 8;
  let anterior = new Float64Array(m + 1).fill(Infinity), passosAnteriores = new Uint16Array(m + 1);
  anterior[0] = 0;
  for (let i = 1; i <= n; i++) {
    const atual = new Float64Array(m + 1).fill(Infinity), passos = new Uint16Array(m + 1);
    for (let j = Math.max(1, i - faixa); j <= Math.min(m, i + faixa); j++) {
      let custo = anterior[j - 1], comprimento = passosAnteriores[j - 1];
      if (anterior[j] < custo) { custo = anterior[j]; comprimento = passosAnteriores[j]; }
      if (atual[j - 1] < custo) { custo = atual[j - 1]; comprimento = passos[j - 1]; }
      atual[j] = custo + custoQuadro(a[i - 1], b[j - 1]);
      passos[j] = comprimento + 1;
    }
    anterior = atual;
    passosAnteriores = passos;
  }
  return Math.sqrt(anterior[m] / passosAnteriores[m]);
}

function distanciaRegistro(exemplo, registro) {
  const ordem = registro.exemplos.map((ref) => distanciaGestos(exemplo, ref)).sort((a, b) => a - b);
  return (ordem[0] + ordem[1]) / 2;
}

export function reconhecerPessoal(quadros, registros, preparado = false) {
  const ativos = registros.filter((r) => r.ativo);
  if (!ativos.length) return { registro: null, ambiguo: false };
  let exemplo;
  try { exemplo = preparado ? quadros : prepararExemplo(quadros); }
  catch { return { registro: null, ambiguo: false }; }
  const ordem = ativos.map((registro) => ({ registro, distancia: distanciaRegistro(exemplo, registro) })).sort((a, b) => a.distancia - b.distancia);
  const [a, b] = ordem;
  if (a.distancia > a.registro.limite) return { registro: null, ambiguo: false };
  if (b && (b.distancia - a.distancia < 0.025 || a.distancia > b.distancia * 0.8)) {
    return { registro: null, ambiguo: true, candidatos: [a.registro.nome, b.registro.nome] };
  }
  return { registro: a.registro, distancia: a.distancia, ambiguo: false };
}

export function criarRegistro({ id = crypto.randomUUID(), nome, tipo = "pessoa", exemplos, confirmacao, ativo = true }, existentes = []) {
  nome = typeof nome === "string" ? nome.trim().replace(/\s+/g, " ") : "";
  if (!nome || nome.length > 60) throw new Error("Escreva um nome ou termo de até 60 caracteres.");
  if (!["pessoa", "termo"].includes(tipo)) throw new Error("Tipo de sinal inválido.");
  if (typeof ativo !== "boolean") throw new Error("Estado de ativação do sinal inválido.");
  if (typeof id !== "string" || !/^[\w-]{1,80}$/.test(id)) throw new Error("Identificador de sinal inválido.");
  if (existentes.some((r) => r.id !== id && chaveNome(r.nome) === chaveNome(nome))) throw new Error("Este nome já tem um sinal. Renomeie ou exclua o cadastro anterior.");
  if (!Array.isArray(exemplos) || exemplos.length !== 3) throw new Error("Grave o mesmo gesto três vezes.");
  exemplos = exemplos.map(prepararExemplo);
  confirmacao = prepararExemplo(confirmacao);
  const distancias = exemplos.map((a, i) => exemplos.filter((_, j) => i !== j).map((b) => distanciaGestos(a, b)).reduce((s, d) => s + d, 0) / 2);
  const dispersao = Math.max(...distancias);
  if (dispersao > 0.3) throw new Error("As gravações ficaram diferentes. Cadastre novamente o mesmo gesto, na mesma posição.");
  const registro = { id, nome, tipo, ativo: Boolean(ativo), exemplos, confirmacao, limite: Math.max(0.06, Math.min(0.22, dispersao * 0.8 + 0.025)) };
  if (distanciaRegistro(confirmacao, registro) > registro.limite) throw new Error("O gesto de confirmação não foi reconhecido. Refaça a confirmação ou grave novos exemplos.");
  for (const outro of existentes.filter((r) => r.id !== id)) {
    const cruzada = exemplos.map((a) => distanciaRegistro(a, outro)).reduce((s, d) => s + d, 0) / 3;
    if (cruzada < Math.min(registro.limite, outro.limite) * 1.1) throw new Error(`Gesto muito parecido com o de ${outro.nome}. Use um gesto mais distinto.`);
  }
  const leitura = reconhecerPessoal(confirmacao, [...existentes.filter((r) => r.id !== id), { ...registro, ativo: true }], true);
  if (leitura.registro?.id !== id) throw new Error("A confirmação ficou ambígua com outro sinal. Use um gesto mais distinto.");
  return registro;
}

export function validarBackup(dados, existentes = []) {
  if (dados?.schema !== 1 || !Array.isArray(dados.sinais) || dados.sinais.length > MAX_SINAIS_PESSOAIS) throw new Error("Arquivo de sinais pessoais inválido.");
  const novos = [], ids = new Set(existentes.map((r) => r.id)), nomes = new Set(existentes.map((r) => chaveNome(r.nome)));
  for (const item of dados.sinais) {
    if (!item || typeof item !== "object" || Array.isArray(item)) throw new Error("Arquivo de sinais pessoais inválido.");
    if (ids.has(item.id) || (typeof item.nome === "string" && nomes.has(chaveNome(item.nome)))) continue;
    const registro = criarRegistro(item, [...existentes, ...novos]);
    novos.push(registro);
    ids.add(registro.id); nomes.add(chaveNome(registro.nome));
  }
  if (existentes.length + novos.length > MAX_SINAIS_PESSOAIS) throw new Error(`O limite é de ${MAX_SINAIS_PESSOAIS} sinais pessoais.`);
  return novos;
}
