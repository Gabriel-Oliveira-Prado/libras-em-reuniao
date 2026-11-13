"""Experimento local de sinais isolados por sequências de mãos e DTW.

Separa pessoas inteiras entre treino e teste. Não publica um modelo para a
extensão e não chama o Teachable Machine. Vídeos ficam fora do repositório.
"""
import argparse
import json
from pathlib import Path

import cv2
import mediapipe as mp
import numpy as np

RAIZ = Path(__file__).resolve().parents[1]
CLASSES = ["Ajudar", "Desculpa", "Não", "Obrigado", "Por favor", "Sim"]


def extrair(caminho):
    cache = caminho.with_suffix(".maos-v1.npz")
    if cache.exists():
        dados = np.load(cache)
        return dados["vetores"], float(dados["deteccao"])
    opcoes = mp.tasks.vision.HandLandmarkerOptions(
        base_options=mp.tasks.BaseOptions(model_asset_path=str(RAIZ / "modelos/hand_landmarker.task")),
        running_mode=mp.tasks.vision.RunningMode.VIDEO,
        num_hands=2, min_hand_detection_confidence=0.5,
        min_hand_presence_confidence=0.5, min_tracking_confidence=0.5,
    )
    captura = cv2.VideoCapture(str(caminho))
    if not captura.isOpened():
        raise RuntimeError(f"Vídeo inválido: {caminho}")
    fps = captura.get(cv2.CAP_PROP_FPS) or 30
    passo = max(1, round(fps / 10))
    vetores = []
    detectados = 0
    numero = -1
    with mp.tasks.vision.HandLandmarker.create_from_options(opcoes) as detector:
        while True:
            ok, quadro = captura.read()
            if not ok:
                break
            numero += 1
            if numero % passo:
                continue
            altura, largura = quadro.shape[:2]
            quadro = cv2.resize(quadro, (640, round(altura * 640 / largura)))
            imagem = mp.Image(image_format=mp.ImageFormat.SRGB, data=np.ascontiguousarray(cv2.cvtColor(quadro, cv2.COLOR_BGR2RGB)))
            resultado = detector.detect_for_video(imagem, round(numero / fps * 1000))
            detectados += bool(resultado.hand_landmarks)
            vetor = np.zeros((2, 66), dtype=np.float32)
            for mao, lado in zip(resultado.hand_landmarks, resultado.handedness):
                indice = 0 if lado[0].category_name == "Left" else 1
                pontos = np.array([[p.x, p.y, p.z] for p in mao], dtype=np.float32)
                escala = max(float(np.linalg.norm(pontos[9] - pontos[0])), 1e-5)
                forma = np.clip((pontos - pontos[0]) / escala, -4, 4) / 4
                forma[:, 2] *= 0.3
                vetor[indice, 0] = 0.5
                vetor[indice, 1:3] = (pontos[0, :2] - 0.5) * 2
                vetor[indice, 3:] = forma.reshape(-1)
            vetores.append(vetor.reshape(-1))
    captura.release()
    if len(vetores) < 5:
        raise RuntimeError(f"Poucos quadros em {caminho}")
    dados = np.array(vetores)
    # Cada vídeo é uma sequência inteira; quadros nunca são divididos entre treino e teste.
    pontos = np.linspace(0, len(dados) - 1, 24)
    amostra = np.stack([np.interp(pontos, np.arange(len(dados)), dados[:, i]) for i in range(dados.shape[1])], axis=1)
    taxa = detectados / len(vetores)
    np.savez_compressed(cache, vetores=amostra, deteccao=taxa)
    return amostra, taxa


def distancia(a, b):
    custos = ((a[:, None, :] - b[None, :, :]) ** 2).mean(axis=2)
    tabela = np.full((len(a) + 1, len(b) + 1), np.inf)
    passos = np.zeros_like(tabela)
    tabela[0, 0] = 0
    for i in range(1, len(a) + 1):
        for j in range(max(1, i - 8), min(len(b), i + 8) + 1):
            anteriores = [(i - 1, j), (i, j - 1), (i - 1, j - 1)]
            origem = min(anteriores, key=lambda pos: tabela[pos])
            tabela[i, j] = custos[i - 1, j - 1] + tabela[origem]
            passos[i, j] = passos[origem] + 1
    return float(tabela[-1, -1] / passos[-1, -1])


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--videos", type=Path, required=True)
    parser.add_argument("--saida", type=Path, required=True)
    args = parser.parse_args()
    amostras = []
    for classe in CLASSES:
        for ator in range(1, 4):
            arquivo = args.videos / f"{classe}_Articulador{ator}.mp4"
            vetor, taxa = extrair(arquivo)
            amostras.append(dict(classe=classe, ator=ator, vetor=vetor, deteccao=taxa))
            print(f"Extraído: {arquivo.name}; mãos em {taxa:.0%} dos quadros", flush=True)
    resultados = []
    for teste in amostras:
        treino = [item for item in amostras if item["ator"] != teste["ator"]]
        scores = {classe: min(distancia(teste["vetor"], item["vetor"]) for item in treino if item["classe"] == classe) for classe in CLASSES}
        ordem = sorted(scores, key=scores.get)
        resultados.append(dict(esperado=teste["classe"], previsto=ordem[0], ator_teste=teste["ator"],
                               distancia=scores[ordem[0]], margem=1 - scores[ordem[0]] / scores[ordem[1]],
                               deteccao_maos=teste["deteccao"]))
    acertos = sum(item["esperado"] == item["previsto"] for item in resultados)
    relatorio = dict(
        metodo="DTW sobre sequências MediaPipe de duas mãos; 24 passos por vídeo",
        fonte="https://huggingface.co/datasets/ibmectech/v-librasil-raw",
        protocolo="Cada teste usa uma pessoa não vista; as outras duas pessoas compõem o treino. Sem ajuste de limiar nos testes.",
        classes=CLASSES, videos=len(amostras), acertos=acertos, acuracia=acertos / len(amostras),
        habilitado_na_extensao=False,
        limitacao="Amostra pequena de sinais isolados. Não avalia conversas, sinais desconhecidos nem câmera do usuário.",
        resultados=resultados,
    )
    args.saida.parent.mkdir(parents=True, exist_ok=True)
    args.saida.write_text(json.dumps(relatorio, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"RESULTADO: {acertos}/{len(amostras)} ({acertos / len(amostras):.1%})", flush=True)


if __name__ == "__main__":
    main()
