"""Verifica o detector de duas mãos em vídeos reais, sem classificar o significado.

Uso: python tests/testar_video_maos.py caminho1.mp4 [caminho2.mp4 ...]
Requer mediapipe, numpy e opencv-python. Não redistribui os vídeos.
"""

import os
import sys
from pathlib import Path

import cv2
import mediapipe as mp
import numpy as np

RAIZ = Path(__file__).resolve().parents[1]


def testar(detector, caminho):
    captura = cv2.VideoCapture(str(caminho))
    if not captura.isOpened():
        raise RuntimeError(f"Não foi possível abrir {caminho}")
    quadros = 0
    com_mao = 0
    com_duas = 0
    instante = -1
    fps = captura.get(cv2.CAP_PROP_FPS) or 30
    passo = max(1, round(fps / 10))
    numero = -1
    previa = os.environ.get("LIBRAS_PREVIA")
    while True:
        ok, quadro = captura.read()
        if not ok:
            break
        numero += 1
        if numero % passo:
            continue
        instante = max(instante + 1, round(numero / fps * 1000))
        rgb = np.ascontiguousarray(cv2.cvtColor(quadro, cv2.COLOR_BGR2RGB))
        imagem = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)
        resultado = detector.detect_for_video(imagem, instante)
        quadros += 1
        com_mao += bool(resultado.hand_landmarks)
        com_duas += len(resultado.hand_landmarks) == 2
        if resultado.hand_landmarks:
            assert all(len(mao) == 21 for mao in resultado.hand_landmarks)
            if previa and not Path(previa).exists():
                altura, largura = quadro.shape[:2]
                for mao in resultado.hand_landmarks:
                    xs = [round(p.x * largura) for p in mao]
                    ys = [round(p.y * altura) for p in mao]
                    cv2.rectangle(quadro, (min(xs) - 10, min(ys) - 10),
                                  (max(xs) + 10, max(ys) + 10), (58, 35, 171), 3)
                    for x, y in zip(xs, ys):
                        cv2.circle(quadro, (x, y), 5, (255, 255, 255), -1)
                        cv2.circle(quadro, (x, y), 4, (58, 35, 171), -1)
                cv2.imwrite(previa, quadro)
    captura.release()
    if not quadros:
        raise RuntimeError(f"Vídeo sem quadros: {caminho}")
    taxa = com_mao / quadros
    print(f"{caminho.name}: {quadros} quadros, mãos em {com_mao} ({taxa:.0%}), duas mãos em {com_duas}")
    if taxa < 0.3:
        raise RuntimeError(f"Detector não localizou mãos de modo consistente em {caminho.name}")


def main():
    if len(sys.argv) < 2:
        raise SystemExit("Informe pelo menos um vídeo de sinal em Libras.")
    opcoes = mp.tasks.vision.HandLandmarkerOptions(
        base_options=mp.tasks.BaseOptions(model_asset_path=str(RAIZ / "modelos/hand_landmarker.task")),
        running_mode=mp.tasks.vision.RunningMode.VIDEO,
        num_hands=2,
        min_hand_detection_confidence=0.5,
        min_hand_presence_confidence=0.5,
        min_tracking_confidence=0.5,
    )
    for argumento in sys.argv[1:]:
        with mp.tasks.vision.HandLandmarker.create_from_options(opcoes) as detector:
            testar(detector, Path(argumento))


if __name__ == "__main__":
    main()
