import { consultarAuxiliar } from "../painel/auxiliar-local.mjs";
import { writeFile } from "node:fs/promises";
const resultados = [];
try {
  await consultarAuxiliar({ verificar: true });
  for (const texto of ["ola tudo bem como voce esta", "Gabriel eu nao quero essa merda 42 vezes"]) {
    const inicio = performance.now();
    try { resultados.push({ original: texto, ...await consultarAuxiliar({ texto }), ms: performance.now() - inicio }); }
    catch (erro) { resultados.push({ original: texto, recusado: true, erro: erro.message, ms: performance.now() - inicio }); }
    console.log(JSON.stringify(resultados.at(-1)));
  }
  await writeFile(new URL("resultado-auxiliar-local.json", import.meta.url), JSON.stringify({ backend: "Adaptador real da extensão, API Ollama local pelo Node", resultados,
    limites: "Não verifica acesso do Chrome, configuração de origem ou qualidade de interpretação de Libras. Sugestões são manuais; não recebem áudio nem câmera." }, null, 2) + "\n");
} finally {
  await fetch("http://127.0.0.1:11434/api/generate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ model: "qwen3.5:4b-q4_K_M", keep_alive: 0 }) }).catch(() => {});
}
