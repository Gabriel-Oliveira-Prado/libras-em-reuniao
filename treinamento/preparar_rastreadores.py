"""Monta variantes Holistic com BlazePose Full/Heavy, preservando mãos e rosto.

Pacotes personalizados: não são lançamentos oficiais de Holistic Full/Heavy.
Os modelos originais do Google têm licença Apache-2.0. Downloads de pesquisa
ficam no diretório temporário; somente os pacotes de execução ficam no projeto.
"""
import argparse
import hashlib
import io
import json
import tempfile
import urllib.request
import zipfile
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[1]
HASH_HOLISTIC = "e2dab61191e2dcd0a15f943d8e3ed1dce13c82dfa597b9dd39f562975a50c3f8"


def sha256(dados):
    return hashlib.sha256(dados).hexdigest()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--saida", type=Path, default=RAIZ / "modelos/rastreamento")
    args = parser.parse_args()
    original = (RAIZ / "modelos/holistic_landmarker.task").read_bytes()
    if sha256(original) != HASH_HOLISTIC:
        raise ValueError("O pacote Holistic de referência mudou; revisar a composição.")
    args.saida.mkdir(parents=True, exist_ok=True)
    cache = Path(tempfile.gettempdir()) / "libras-modelos-rastreamento"
    cache.mkdir(exist_ok=True)
    fontes = []
    for variante in ("full", "heavy"):
        url = f"https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_{variante}/float16/1/pose_landmarker_{variante}.task"
        arquivo = cache / f"pose_landmarker_{variante}.task"
        if not arquivo.exists():
            print(f"Baixando BlazePose {variante}: {url}", flush=True)
            with urllib.request.urlopen(url, timeout=120) as resposta:
                arquivo.write_bytes(resposta.read())
        dados_pose = arquivo.read_bytes()
        with zipfile.ZipFile(io.BytesIO(dados_pose)) as pose:
            pesos = pose.read("pose_landmarks_detector.tflite")
        destino = args.saida / f"holistic_{variante}.task"
        with zipfile.ZipFile(io.BytesIO(original)) as base, zipfile.ZipFile(destino, "w", compression=zipfile.ZIP_STORED) as pacote:
            for nome in base.namelist():
                info = zipfile.ZipInfo(nome, date_time=(2026, 11, 13, 0, 0, 0))
                pacote.writestr(info, pesos if nome == "pose_landmarks_detector.tflite" else base.read(nome))
        fontes.append({"variante": variante, "origem_pose": url, "sha256_pose": sha256(dados_pose),
                       "sha256_pesos_pose": sha256(pesos), "arquivo": destino.name,
                       "bytes": destino.stat().st_size, "sha256": sha256(destino.read_bytes())})
        print(f"Preparado {destino.name}: {destino.stat().st_size} bytes", flush=True)
    manifesto = {"schema": 1, "licenca": "Apache-2.0", "pacote_personalizado": True,
                 "base_holistic": {"origem": "https://storage.googleapis.com/mediapipe-models/holistic_landmarker/holistic_landmarker/float16/1/holistic_landmarker.task", "sha256": HASH_HOLISTIC},
                 "alteracao": "Somente pose_landmarks_detector.tflite foi substituído. Mãos, rosto, recorte e detector de pessoa são os mesmos do pacote original.",
                 "variantes": fontes}
    (args.saida / "manifesto.json").write_text(json.dumps(manifesto, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
