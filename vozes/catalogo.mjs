export function nomePerfil(id) {
  if (!/^p[fm]_[a-z0-9_-]{1,60}$/.test(id)) throw new Error("Perfil de voz brasileiro inválido.");
  const nome = id.slice(3).replaceAll("_", " ").replaceAll("-", " ");
  return `${nome[0].toLocaleUpperCase("pt-BR")}${nome.slice(1)} · ${id[1] === "f" ? "feminina" : "masculina"}`;
}

export async function listarVozes({ runtime = globalThis.chrome?.runtime, lerJson = async (url) => {
  const resposta = await fetch(url); if (!resposta.ok) throw new Error("Não foi possível listar as vozes."); return resposta.json();
} } = {}) {
  if (!runtime?.getPackageDirectoryEntry) return lerJson(new URL("./catalogo.json", import.meta.url));
  const raiz = await runtime.getPackageDirectoryEntry();
  const pasta = await new Promise((resolve, reject) => raiz.getDirectory("vozes/perfis", { create: false }, resolve, reject));
  const leitor = pasta.createReader(), entradas = [];
  for (;;) {
    const lote = await new Promise((resolve, reject) => leitor.readEntries(resolve, reject));
    if (!lote.length) break;
    entradas.push(...lote);
  }
  return entradas.filter((e) => e.isFile && /^p[fm]_[a-z0-9_-]{1,60}\.bin$/.test(e.name)).map((e) => {
    const id = e.name.slice(0, -4); return { id, nome: nomePerfil(id), idioma: "pt-BR" };
  }).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
}
