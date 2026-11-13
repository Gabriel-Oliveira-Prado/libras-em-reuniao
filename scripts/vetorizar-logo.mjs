// Converte os contornos da referência enviada em camadas SVG editáveis.
// Ferramenta de desenvolvimento, sem dependências adicionais na extensão.
import { readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const sharp = require("sharp"), potrace = require("potrace");
const arquivo = new URL("../assets/marca/referencia-original.png", import.meta.url);
const { data, info } = await sharp(await readFile(arquivo)).removeAlpha().raw().toBuffer({ resolveWithObject: true });
const { width: w, height: h } = info, n = w * h;
const cores = [
  { id: "fundo", cor: "#11114E", rgb: [17, 17, 78] },
  { id: "camera", cor: "#846DC2", rgb: [132, 109, 194] },
  { id: "lente", cor: "#5F4888", rgb: [95, 72, 136] },
  { id: "balao", cor: "#9D9FE6", rgb: [157, 159, 230] },
  { id: "branco", cor: "#FFFFFF", rgb: [255, 255, 255] },
];

function conectadoAsBordas(permitido) {
  const visitado = new Uint8Array(n), fila = new Int32Array(n);
  let inicio = 0, fim = 0;
  const incluir = (i) => { if (!visitado[i] && permitido(i)) { visitado[i] = 1; fila[fim++] = i; } };
  for (let x = 0; x < w; x++) { incluir(x); incluir((h - 1) * w + x); }
  for (let y = 0; y < h; y++) { incluir(y * w); incluir(y * w + w - 1); }
  while (inicio < fim) {
    const i = fila[inicio++], x = i % w;
    if (i >= w) incluir(i - w);
    if (i < n - w) incluir(i + w);
    if (x > 0) incluir(i - 1);
    if (x < w - 1) incluir(i + 1);
  }
  return visitado;
}

// Remove somente o branco conectado às bordas; mãos e letras ficam intactas.
const externo = conectadoAsBordas((i) => {
  const r = data[i * 3], g = data[i * 3 + 1], b = data[i * 3 + 2];
  return Math.min(r, g, b) > 225 && Math.max(r, g, b) - Math.min(r, g, b) < 20;
});
const classes = new Uint8Array(n);
classes.fill(255);
for (let i = 0; i < n; i++) {
  if (externo[i]) continue;
  let menor = Infinity;
  for (let c = 0; c < cores.length; c++) {
    const distancia = cores[c].rgb.reduce((s, v, k) => s + (data[i * 3 + k] - v) ** 2, 0);
    if (distancia < menor) { menor = distancia; classes[i] = c; }
  }
}

async function contorno(id, cor, escolher, preencher = false) {
  const mascara = new Uint8Array(n);
  for (let i = 0; i < n; i++) mascara[i] = escolher(i) ? 0 : 255;
  if (preencher) {
    const fora = conectadoAsBordas((i) => mascara[i] === 255);
    for (let i = 0; i < n; i++) if (!fora[i]) mascara[i] = 0;
  }
  const png = await sharp(mascara, { raw: { width: w, height: h, channels: 1 } }).png().toBuffer();
  const tag = await new Promise((resolve, reject) => potrace.trace(png,
    { color: cor, threshold: 128, turdSize: 5, optTolerance: 0.15 },
    (erro, _svg, instancia) => erro ? reject(erro) : resolve(instancia.getPathTag())));
  return `  <g id="${id}">${tag}</g>`;
}
const corte = Math.round(h * 0.618);
const camadas = [
  await contorno("lente", cores[2].cor, (i) => classes[i] === 2, true),
  await contorno("camera", cores[1].cor, (i) => classes[i] === 1, true),
  await contorno("balao", cores[3].cor, (i) => classes[i] === 3, true),
  await contorno("maos-e-movimento", cores[4].cor, (i) => classes[i] === 4 && i < corte * w),
  await contorno("monograma-lr", cores[4].cor, (i) => classes[i] === 4 && i >= corte * w),
];
const lado = Math.max(w, h) + 1, cx = w / 2, cy = h / 2;
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="${cx - lado / 2} ${cy - lado / 2} ${lado} ${lado}" role="img" aria-labelledby="titulo descricao">
  <title id="titulo">Libras em Reunião</title>
  <desc id="descricao">Logo circular azul-marinho, câmera roxa, duas mãos brancas de Libras e balão lavanda com as letras LR. Área externa transparente.</desc>
  <!-- Vetorização dos contornos da referência fornecida pelo proprietário. -->
  <circle id="fundo-circular" cx="${cx}" cy="${cy}" r="${lado / 2 - 2}" fill="#11114E"/>
${camadas.join("\n")}
</svg>
`;
await writeFile(new URL("../assets/logo.svg", import.meta.url), svg);
console.log("Logo vetorizada em cinco camadas, com paleta exata e área externa transparente.");
