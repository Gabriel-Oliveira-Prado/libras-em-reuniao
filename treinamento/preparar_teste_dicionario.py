"""Ensaio de cadastro pessoal: mesma pessoa, repetições separadas.

Repetições 1–3: cadastro; 4: confirmação; 5: teste. As 14 outras classes
da mesma pessoa são negativas. Nenhum vídeo é incluído na extensão.
"""
import argparse
import concurrent.futures
import hashlib
import json
from pathlib import Path
import urllib.request
import numpy as np
from preparar_holistic import extrair, obter_json

CLASSES = ["Acontecer", "Amarelo", "Banheiro", "Conhecer", "Maca", "Vontade"]

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--minds", type=Path, required=True)
    parser.add_argument("--saida", type=Path, required=True)
    parser.add_argument("--pessoa", type=int, default=1)
    args = parser.parse_args()
    args.saida.mkdir(parents=True, exist_ok=True)
    base = json.loads((args.minds / "manifesto.json").read_text(encoding="utf-8"))
    repo, revisao = base["origem"], base["revisao"]
    arvore = obter_json(f"https://huggingface.co/api/datasets/{repo}/tree/{revisao}/videos?limit=1000")
    registros = []
    for item in base["amostras"]:
        if item["pessoa"] == args.pessoa:
            registros.append({**item, "local": str(args.minds / item["arquivo"])})
    for classe in CLASSES:
        exemplo = next(i for i in registros if i["classe"] == classe)
        for repeticao in (3, 4, 5):
            nome = exemplo["arquivo"].rsplit("-", 1)[0] + f"-{repeticao}.mp4"
            item = next(i for i in arvore if Path(i["path"]).name == nome)
            registros.append(dict(arquivo=nome, classe=classe, pessoa=args.pessoa, bytes=item["size"],
                                  url=f"https://huggingface.co/datasets/{repo}/resolve/{revisao}/{item['path']}", local=str(args.saida / nome)))
    def baixar(item):
        p = Path(item["local"])
        if not p.exists():
            urllib.request.urlretrieve(item["url"], p)
        if p.stat().st_size != item["bytes"]:
            raise ValueError(f"Tamanho divergente: {p.name}")
        item["sha256"] = hashlib.sha256(p.read_bytes()).hexdigest()
        return item
    saida = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as executor:
        for n, item in enumerate(executor.map(baixar, registros), 1):
            p = Path(item["local"])
            cache = p.with_suffix(".holistic-v1.npz")
            extrair(p, cache)
            with np.load(cache) as dados:
                saida.append(dict(arquivo=p.name, classe=item["classe"], repeticao=int(p.stem.rsplit("-", 1)[1]),
                                  fps=float(dados["fps"]), vetores=dados["vetores"].tolist(), sha256=item["sha256"]))
            print(f"Preparados {n}/{len(registros)}", flush=True)
    (args.saida / "amostras.json").write_text(json.dumps(dict(origem=repo, revisao=revisao, pessoa=args.pessoa, classes=CLASSES, amostras=saida)), encoding="utf-8")

if __name__ == "__main__":
    main()
