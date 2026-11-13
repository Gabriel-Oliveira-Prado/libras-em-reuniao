"""Extrai exemplos MINDS-Libras de 8 pessoas, sem misturar treino/teste.

Dados ficam em --pasta, fora da extensão. Vídeos públicos são baixados para
pesquisa local; metadados incluem revisão de origem e hashes.
"""
import argparse
import concurrent.futures
import hashlib
import json
import re
import time
import urllib.request
from pathlib import Path

import cv2
import mediapipe as mp
import numpy as np

RAIZ = Path(__file__).resolve().parents[1]
POSE = [0, 11, 12, 13, 14, 15, 16, 23, 24]
ROSTO = [1, 4, 10, 33, 133, 159, 145, 263, 362, 386, 374, 61, 291, 13, 14, 70, 105, 300, 334, 152]


def vetor(resultado):
    pose = resultado.pose_landmarks
    saida = []
    centro = np.array([0.5, 0.5, 0], dtype=np.float32)
    escala = 0.3
    if len(pose) >= 25:
        a, b = pose[11], pose[12]
        centro = np.array([(a.x + b.x) / 2, (a.y + b.y) / 2, 0])
        escala = max(np.hypot(a.x - b.x, a.y - b.y), 0.05)
    for indice in POSE:
        if len(pose) > indice:
            p = pose[indice]
            saida.extend([(p.x - centro[0]) / escala, (p.y - centro[1]) / escala, p.z * 0.2 / escala, p.visibility])
        else:
            saida.extend([0] * 4)
    for mao in [resultado.left_hand_landmarks, resultado.right_hand_landmarks]:
        if len(mao) == 21:
            pontos = np.array([[p.x, p.y, p.z] for p in mao])
            saida.extend([1, (pontos[0, 0] - centro[0]) / escala, (pontos[0, 1] - centro[1]) / escala])
            tamanho = max(np.linalg.norm(pontos[9, :2] - pontos[0, :2]), 0.02)
            forma = (pontos - pontos[0]) / tamanho
            forma[:, 2] *= 0.3
            saida.extend(forma.reshape(-1))
        else:
            saida.extend([0] * 66)
    face = resultado.face_landmarks
    if len(face) >= 387:
        referencia = np.array([face[1].x, face[1].y, face[1].z])
        tamanho = max(np.hypot(face[33].x - face[263].x, face[33].y - face[263].y), 0.02)
        for indice in ROSTO:
            p = face[indice]
            saida.extend((np.array([p.x, p.y, p.z]) - referencia) / tamanho * [1, 1, 0.3])
    else:
        saida.extend([0] * (3 * len(ROSTO)))
    return np.clip(saida, -5, 5).astype(np.float32)


def extrair(arquivo, destino):
    if destino.exists():
        return
    opcoes = mp.tasks.vision.HolisticLandmarkerOptions(
        base_options=mp.tasks.BaseOptions(model_asset_path=str(RAIZ / "modelos/holistic_landmarker.task")),
        running_mode=mp.tasks.vision.RunningMode.VIDEO,
        min_hand_landmarks_confidence=0.5,
    )
    captura = cv2.VideoCapture(str(arquivo))
    if not captura.isOpened():
        raise RuntimeError(f"Vídeo inválido: {arquivo}")
    fps = captura.get(cv2.CAP_PROP_FPS) or 30
    passo = max(1, round(fps / 12))
    sequencia, tempos = [], []
    indice, com_maos = -1, 0
    with mp.tasks.vision.HolisticLandmarker.create_from_options(opcoes) as detector:
        while captura.grab():
            indice += 1
            if indice % passo:
                continue
            ok, quadro = captura.retrieve()
            if not ok:
                raise RuntimeError(f"Quadro inválido em {arquivo}")
            altura, largura = quadro.shape[:2]
            quadro = cv2.resize(quadro, (640, round(altura * 640 / largura)))
            imagem = mp.Image(image_format=mp.ImageFormat.SRGB, data=np.ascontiguousarray(cv2.cvtColor(quadro, cv2.COLOR_BGR2RGB)))
            inicio = time.perf_counter()
            resultado = detector.detect_for_video(imagem, round(indice / fps * 1000))
            tempos.append((time.perf_counter() - inicio) * 1000)
            sequencia.append(vetor(resultado))
            com_maos += bool(resultado.left_hand_landmarks or resultado.right_hand_landmarks)
    captura.release()
    if len(sequencia) < 8:
        raise RuntimeError(f"Poucos quadros em {arquivo}")
    np.savez_compressed(destino, vetores=np.array(sequencia), fps=fps / passo,
                        deteccao=com_maos / len(sequencia), tempos_ms=tempos)


def obter_json(url):
    with urllib.request.urlopen(url, timeout=60) as resposta:
        return json.load(resposta)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--pasta", type=Path, required=True)
    parser.add_argument("--repeticoes", type=int, default=2, choices=range(1, 6))
    args = parser.parse_args()
    args.pasta.mkdir(parents=True, exist_ok=True)
    manifesto = args.pasta / "manifesto.json"
    if manifesto.exists():
        dados = json.loads(manifesto.read_text(encoding="utf-8"))
        if dados["repeticoes"] != args.repeticoes:
            raise ValueError("Use outra pasta para um recorte diferente da base")
    else:
        repo = "ibmectech/minds-libras-raw"
        sha = obter_json(f"https://huggingface.co/api/datasets/{repo}")["sha"]
        arvore = obter_json(f"https://huggingface.co/api/datasets/{repo}/tree/{sha}/videos?limit=1000")
        amostras = []
        for item in arvore:
            nome = Path(item["path"]).name
            match = re.fullmatch(r"(\d{2})(.+)Sinalizador(\d{2})-(\d+)\.mp4", nome)
            if not match or int(match[4]) > args.repeticoes:
                continue
            pessoa = int(match[3])
            amostras.append(dict(arquivo=nome, classe=match[2], pessoa=pessoa,
                                divisao="teste" if pessoa == 12 else "validacao" if pessoa == 11 else "treino",
                                bytes=item["size"], url=f"https://huggingface.co/datasets/{repo}/resolve/{sha}/{item['path']}"))
        dados = dict(origem=repo, revisao=sha, repeticoes=args.repeticoes, amostras=amostras)
        manifesto.write_text(json.dumps(dados, ensure_ascii=False, indent=2), encoding="utf-8")
    arquivos = dados["amostras"]

    def baixar(item):
        video = args.pasta / item["arquivo"]
        cache = video.with_suffix(".holistic-v1.npz")
        if cache.exists():
            return item, video, cache
        if not video.exists() or video.stat().st_size != item["bytes"]:
            parcial = video.with_suffix(".download")
            for tentativa in range(3):
                try:
                    urllib.request.urlretrieve(item["url"], parcial)
                    if parcial.stat().st_size != item["bytes"]:
                        raise RuntimeError("Tamanho de download divergente")
                    parcial.replace(video)
                    break
                except Exception:
                    if tentativa == 2:
                        raise
                    time.sleep(2)
        item["sha256"] = hashlib.sha256(video.read_bytes()).hexdigest()
        return item, video, cache

    inicio = time.perf_counter()
    # Até três downloads em paralelo; apenas um detector em execução.
    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as executor:
        futuros = {executor.submit(baixar, item): item for item in arquivos}
        for numero, futuro in enumerate(concurrent.futures.as_completed(futuros), 1):
            item, video, cache = futuro.result()
            extrair(video, cache)
            if numero % 10 == 0 or numero == len(arquivos):
                manifesto.write_text(json.dumps(dados, ensure_ascii=False, indent=2), encoding="utf-8")
                print(f"Extraídos {numero}/{len(arquivos)}; {time.perf_counter() - inicio:.1f}s", flush=True)


if __name__ == "__main__":
    main()
