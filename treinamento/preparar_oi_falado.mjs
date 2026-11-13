// O Kokoro é instável em enunciados muito curtos. Gera Oi em contexto e
// recorta somente a primeira palavra, na pausa. Nenhuma palavra extra é falada.
import { readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { createEspeak } from "../vendor/spellophone/dist/browser.js";
import { criarMotorKokoro } from "../vozes/kokoro.mjs";
const require = createRequire(process.env.TEMP + "/libras-asr-verificacao/package.json"), ort = require("onnxruntime-node");
const motor = criarMotorKokoro({ ort, opcoesSessao: { executionProviders: ["cpu"], intraOpNumThreads: 4 },
  motorFonemas: async () => {
    const f = await createEspeak({ dataUrl: new URL("../vendor/spellophone/espeak-ng-data/", import.meta.url), languages: ["pt"], fetch: async (url) => new Response(await readFile(url)) });
    await f.loadVoice("pt-br"); return f;
  }, lerJson: async (url) => JSON.parse(await readFile(url, "utf8")), lerBytes: async (url) => new Uint8Array(await readFile(url)),
});
for (const perfil of ["pf_dora", "pm_alex"]) {
  const { samples } = await motor.sintetizar("Oi", perfil);
  await writeFile(new URL(`../vozes/falas/${perfil}/oi.pcm`, import.meta.url), new Uint8Array(samples.buffer));
  console.log(JSON.stringify({ perfil, contexto: "Oi! Tudo bem?", palavraReproduzida: "Oi", fim: samples.length / 24000 }));
}
