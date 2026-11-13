// Exporta a matriz SVG editável para PNGs da extensão e favicon ICO.
// Sharp é uma ferramenta de desenvolvimento; a extensão não depende de Node.
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const sharp = require("sharp");
const destino = new URL("../assets/", import.meta.url);
const svg = await readFile(new URL("logo.svg", destino));
const icones = new Map();
await mkdir(new URL("icones/", destino), { recursive: true });
for (const tamanho of [16, 32, 48, 128, 256, 512, 1024]) {
  const png = await sharp(svg, { density: 144 }).resize(tamanho, tamanho).png({ compressionLevel: 9 }).toBuffer();
  const arquivo = tamanho === 1024 ? "logo.png" : `icones/icon-${tamanho}.png`;
  await writeFile(new URL(arquivo, destino), png);
  icones.set(tamanho, png);
}

// ICO com entradas PNG RGBA de 16, 32 e 48 px, preservando a transparência.
const tamanhos = [16, 32, 48];
const cabecalho = Buffer.alloc(6 + tamanhos.length * 16);
cabecalho.writeUInt16LE(1, 2);
cabecalho.writeUInt16LE(tamanhos.length, 4);
let offset = cabecalho.length;
const imagens = tamanhos.map((tamanho, i) => {
  const png = icones.get(tamanho), entrada = 6 + i * 16;
  cabecalho[entrada] = tamanho;
  cabecalho[entrada + 1] = tamanho;
  cabecalho.writeUInt16LE(1, entrada + 4);
  cabecalho.writeUInt16LE(32, entrada + 6);
  cabecalho.writeUInt32LE(png.length, entrada + 8);
  cabecalho.writeUInt32LE(offset, entrada + 12);
  offset += png.length;
  return png;
});
await writeFile(new URL("favicon.ico", destino), Buffer.concat([cabecalho, ...imagens]));
console.log("Marca exportada: logo.png (1024 px), ícones 16/32/48/128/256/512 px e favicon.ico.");
