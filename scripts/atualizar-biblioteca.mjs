import { writeFile, rename } from "node:fs/promises";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { baixarBiblioteca, URL_BIBLIOTECA_VLIBRAS, VERSAO_BIBLIOTECA_VLIBRAS } from "../painel/biblioteca.mjs";

const controle = new AbortController();
const tempo = setTimeout(() => controle.abort(), 20_000);
try {
  const { sinais, texto } = await baixarBiblioteca({ signal: controle.signal });
  sinais.sort();
  const catalogo = {
    origem: URL_BIBLIOTECA_VLIBRAS,
    versao: VERSAO_BIBLIOTECA_VLIBRAS,
    consulta: new Date().toISOString().slice(0, 10),
    sha256_resposta: createHash("sha256").update(texto, "utf8").digest("hex"),
    total: sinais.length,
    sinais
  };
  const destino = fileURLToPath(new URL("../modelos/biblioteca-vlibras.json", import.meta.url));
  const temporario = destino + ".tmp";
  await writeFile(temporario, JSON.stringify(catalogo) + "\n", "utf8");
  await rename(temporario, destino);
  console.log(`Biblioteca atualizada: ${sinais.length.toLocaleString("pt-BR")} entradas. Somente catálogo; sem animações.`);
} catch (erro) {
  console.error("A biblioteca não foi atualizada:", erro.message);
  process.exitCode = 1;
} finally { clearTimeout(tempo); }
