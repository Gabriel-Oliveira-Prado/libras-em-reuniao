import argparse
import json
from pathlib import Path
import numpy as np
from preparar_holistic import extrair

parser = argparse.ArgumentParser()
parser.add_argument("--minds", type=Path, required=True)
parser.add_argument("--outros", type=Path, required=True)
parser.add_argument("--saida", type=Path, required=True)
args = parser.parse_args()
manifesto = json.loads((args.minds / "manifesto.json").read_text(encoding="utf-8"))
amostras = []
for item in manifesto["amostras"]:
    if item["divisao"] != "teste":
        continue
    with np.load(args.minds / Path(item["arquivo"]).with_suffix(".holistic-v1.npz")) as dados:
        amostras.append(dict(arquivo=item["arquivo"], esperado=item["classe"], fps=float(dados["fps"]), vetores=dados["vetores"].tolist()))
for nome in ["Ajudar", "Desculpa", "Não", "Obrigado", "Por favor", "Sim"]:
    for pessoa in range(1, 4):
        video = args.outros / f"{nome}_Articulador{pessoa}.mp4"
        cache = video.with_suffix(".holistic-v1.npz")
        extrair(video, cache)
        with np.load(cache) as dados:
            amostras.append(dict(arquivo=video.name, esperado=None, fps=float(dados["fps"]), vetores=dados["vetores"].tolist()))
args.saida.write_text(json.dumps(amostras), encoding="utf-8")
print(f"Preparados {len(amostras)} vídeos para simulação do fluxo", flush=True)
