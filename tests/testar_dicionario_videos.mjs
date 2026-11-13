import { readFileSync, writeFileSync } from "node:fs";
import assert from "node:assert/strict";
import { criarRegistro, reconhecerPessoal } from "../painel/dicionario-pessoal.mjs";
import { SegmentadorDeSinais } from "../painel/segmentacao-sinais.mjs";
const dados = JSON.parse(readFileSync(process.argv[2], "utf8"));
function segmento(item) {
  const s = new SegmentadorDeSinais();
  const quadros = [...item.vetores, ...Array.from({ length: Math.ceil(item.fps) }, () => Array(228).fill(0))];
  for (let i = 0; i < quadros.length; i++) {
    const seq = s.receber(quadros[i], i * 1000 / item.fps);
    if (seq) return seq;
  }
  throw new Error(`Sem segmento válido: ${item.arquivo}`);
}
const registros = [], cadastros = [], resultados = [];
for (const classe of dados.classes) {
  const amostras = dados.amostras.filter((a) => a.classe === classe).sort((a, b) => a.repeticao - b.repeticao);
  try {
    const registro = criarRegistro({ nome: classe, exemplos: amostras.slice(0, 3).map(segmento), confirmacao: segmento(amostras[3]) }, registros);
    registros.push(registro);
    cadastros.push({ classe, aprovado: true, limite: registro.limite });
  } catch (erro) { cadastros.push({ classe, aprovado: false, motivo: erro.message }); }
}
assert.ok(registros.length, "ao menos um cadastro deve passar pela confirmação");
for (const item of dados.amostras.filter((a) => a.repeticao === 5 || !dados.classes.includes(a.classe))) {
  const antes = performance.now();
  let seq;
  try { seq = segmento(item); }
  catch { resultados.push({ arquivo: item.arquivo, esperado: dados.classes.includes(item.classe) ? item.classe : null,
    cadastro_ativo: registros.some((r) => r.nome === item.classe), reconhecido: null, sem_segmento: true }); continue; }
  const r = reconhecerPessoal(seq, registros);
  resultados.push({ arquivo: item.arquivo, esperado: dados.classes.includes(item.classe) ? item.classe : null,
    cadastro_ativo: registros.some((r) => r.nome === item.classe), reconhecido: r.registro?.nome ?? null,
    ambiguo: r.ambiguo, ms: performance.now() - antes });
}
const conhecidos = resultados.filter((r) => r.esperado && r.cadastro_ativo), negativos = resultados.filter((r) => !r.esperado);
const relatorio = { protocolo: `Mesma pessoa MINDS ${dados.pessoa ?? 1}. Repetições 1–3 cadastro; 4 confirmação; 5 teste. Outros 14 sinais, repetições 1–2, são desconhecidos.`,
  origem: dados.origem, revisao: dados.revisao, cadastros, resumo: { cadastros_aceitos: registros.length,
    testes_cadastrados: conhecidos.length, corretos: conhecidos.filter((r) => r.reconhecido === r.esperado).length,
    recusas: conhecidos.filter((r) => !r.reconhecido).length, errados: conhecidos.filter((r) => r.reconhecido && r.reconhecido !== r.esperado).length,
    negativos: negativos.length, negativos_sem_segmento: negativos.filter((r) => r.sem_segmento).length,
    negativos_com_fala: negativos.filter((r) => r.reconhecido).length }, resultados,
  limites: "Ensaio pessoal controlado, uma pessoa. Não mede cadastro real do usuário, gestos inéditos, navegador ou Meet. As classes originais simulam rótulos pessoais, sem atribuir sinais a pessoas reais." };
writeFileSync(process.argv[3] ?? new URL("../treinamento/resultado-dicionario-pessoal.json", import.meta.url), JSON.stringify(relatorio, null, 2) + "\n");
console.log(JSON.stringify({ cadastros, resumo: relatorio.resumo }));
