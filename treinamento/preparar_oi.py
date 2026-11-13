"""Acrescenta Oi ao manifesto MINDS, preservando a separação por pessoa.

Este experimento foi reprovado; gerar um candidato não o habilita no painel.
Vídeos e atributos devem ficar fora da extensão, por exemplo na pasta TEMP.
"""
import argparse
import hashlib
import json
import urllib.request
from pathlib import Path
from preparar_holistic import extrair

REVISAO = "d2d3e5e95574c4e0c5c20a7d82a24d52063e12d5"
HASHES = [
    "ea8df297957045dfef6e56d48823097a2fedf143d8934508d233fe34922803e5",
    "9a944feb13f8f11c79129771f274aa1c829f828ce6f0c65d924fb34a5fada5b9",
    "b3a8dcf209237994460f801b0c25b9e229217dd64eb64c31818726c7ae3a40c2",
]

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--minds", type=Path, required=True)
    parser.add_argument("--oi", type=Path, required=True)
    parser.add_argument("--saida", type=Path, required=True)
    args = parser.parse_args()
    args.oi.mkdir(parents=True, exist_ok=True)
    args.saida.mkdir(parents=True, exist_ok=True)
    manifesto = json.loads((args.minds / "manifesto.json").read_text(encoding="utf-8"))
    for item in manifesto["amostras"]:
        item["arquivo"] = str((args.minds / item["arquivo"]).resolve())
    amostras = []
    for pessoa, divisao in [(1, "treino"), (2, "validacao"), (3, "teste")]:
        video = (args.oi / f"Oi_Articulador{pessoa}.mp4").resolve()
        url = f"https://huggingface.co/datasets/ibmectech/v-librasil-raw/resolve/{REVISAO}/videos/{video.name}"
        if not video.exists():
            urllib.request.urlretrieve(url, video)
        sha = hashlib.sha256(video.read_bytes()).hexdigest()
        if sha != HASHES[pessoa - 1]:
            raise ValueError(f"Hash divergente: {video.name}")
        extrair(video, video.with_suffix(".holistic-v1.npz"))
        amostras.append(dict(arquivo=str(video), classe="Oi", pessoa=pessoa, divisao=divisao, sha256=sha, url=url))
    manifesto["amostras"] += amostras
    manifesto["oi"] = dict(origem="https://libras.cin.ufpe.br/sign/798", espelho="ibmectech/v-librasil-raw", revisao=REVISAO, amostras=amostras)
    (args.saida / "manifesto.json").write_text(json.dumps(manifesto, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Manifesto com {len(manifesto['amostras'])} vídeos. Nenhum modelo foi habilitado.")

if __name__ == "__main__":
    main()
