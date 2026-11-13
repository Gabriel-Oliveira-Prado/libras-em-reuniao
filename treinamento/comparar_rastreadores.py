"""Regressão dos rastreadores em vídeos existentes, sem reentreinar a TCN.

Os exemplos já foram usados em avaliações anteriores: isto é uma comparação
exploratória de compatibilidade, não uma nova validação independente.
"""
import argparse
import hashlib
import json
import tempfile
import time
from pathlib import Path
from types import SimpleNamespace

import cv2
import mediapipe as mp
import numpy as np

from preparar_holistic import RAIZ, vetor


def extrair(arquivo, modelo, cache, corrigir_proporcao=False, largura_processamento=640):
    assinatura = hashlib.sha256(modelo.read_bytes()).hexdigest()
    if cache.exists():
        with np.load(cache) as dados:
            if (str(dados["modelo_sha256"]) == assinatura
                    and bool(dados.get("corrigir_proporcao", False)) == corrigir_proporcao
                    and int(dados.get("largura_processamento", 640)) == largura_processamento):
                return {k: dados[k] for k in dados.files}
    opcoes = mp.tasks.vision.HolisticLandmarkerOptions(
        base_options=mp.tasks.BaseOptions(model_asset_path=str(modelo)),
        running_mode=mp.tasks.vision.RunningMode.VIDEO,
        min_hand_landmarks_confidence=0.5,
        min_pose_detection_confidence=0.5,
        min_pose_presence_confidence=0.5,
        min_face_detection_confidence=0.5,
    )
    captura = cv2.VideoCapture(str(arquivo))
    if not captura.isOpened():
        raise ValueError(f"Vídeo indisponível: {arquivo}")
    fps = captura.get(cv2.CAP_PROP_FPS) or 30
    passo = max(1, round(fps / 12))
    vetores, tempos, visibilidade, maos = [], [], [], []
    indice = -1
    try:
        with mp.tasks.vision.HolisticLandmarker.create_from_options(opcoes) as detector:
            while captura.grab():
                indice += 1
                if indice % passo:
                    continue
                ok, quadro = captura.retrieve()
                if not ok:
                    raise ValueError(f"Quadro inválido: {arquivo}")
                altura, largura = quadro.shape[:2]
                quadro = cv2.resize(quadro, (largura_processamento, round(altura * largura_processamento / largura)))
                imagem = mp.Image(image_format=mp.ImageFormat.SRGB, data=np.ascontiguousarray(cv2.cvtColor(quadro, cv2.COLOR_BGR2RGB)))
                inicio = time.perf_counter()
                resultado = detector.detect_for_video(imagem, round(indice / fps * 1000))
                tempos.append((time.perf_counter() - inicio) * 1000)
                entrada = resultado
                if corrigir_proporcao:
                    fator_y = (16 / 9) / (largura / altura)
                    entrada = SimpleNamespace(**{campo: [SimpleNamespace(x=p.x, y=(p.y - 0.5) * fator_y + 0.5, z=p.z, visibility=p.visibility)
                                                        for p in getattr(resultado, campo)]
                                               for campo in ("pose_landmarks", "face_landmarks", "left_hand_landmarks", "right_hand_landmarks")})
                v = vetor(entrada)
                if len(v) != 228 or not np.isfinite(v).all():
                    raise ValueError("Contrato de atributos inválido")
                vetores.append(v)
                maos.append(len(resultado.left_hand_landmarks) == 21 or len(resultado.right_hand_landmarks) == 21)
                p = resultado.pose_landmarks
                visibilidade.append(float(np.mean([p[j].visibility for j in (11, 12, 13, 14, 15, 16)])) if p else 0)
    finally:
        captura.release()
    if len(vetores) < 8:
        raise ValueError(f"Poucos quadros: {arquivo}")
    dados = dict(vetores=np.array(vetores), tempos_ms=np.array(tempos), fps=fps / passo,
                 deteccao=np.mean(maos), visibilidade=np.array(visibilidade), modelo_sha256=assinatura,
                 corrigir_proporcao=corrigir_proporcao, largura_processamento=largura_processamento)
    cache.parent.mkdir(parents=True, exist_ok=True)
    np.savez_compressed(cache, **dados)
    return dados


def main():
    parser = argparse.ArgumentParser()
    temporario = Path(tempfile.gettempdir())
    parser.add_argument("--minds", type=Path, default=temporario / "libras-minds-holistic")
    parser.add_argument("--outros", type=Path, default=temporario / "libras-treino-palavras")
    parser.add_argument("--saida", type=Path, default=temporario / "libras-comparacao-rastreadores")
    parser.add_argument("--limite", type=int)
    args = parser.parse_args()
    manifesto = json.loads((args.minds / "manifesto.json").read_text(encoding="utf-8"))
    amostras = [(args.minds / a["arquivo"], a["classe"]) for a in manifesto["amostras"] if a["divisao"] == "teste"]
    if args.limite:
        amostras = amostras[:args.limite]
    else:
        for nome in ("Ajudar", "Desculpa", "Não", "Obrigado", "Por favor", "Sim"):
            for pessoa in range(1, 4):
                amostras.append((args.outros / f"{nome}_Articulador{pessoa}.mp4", None))
    args.saida.mkdir(parents=True, exist_ok=True)
    medicao = {"ambiente": f"MediaPipe {mp.__version__}, Python CPU, vídeos 640 px, aproximadamente 15 quadros/s",
               "protocolo": "40 vídeos conhecidos da pessoa 12 e 18 vídeos de sinais fora do vocabulário, já examinados anteriormente. Sem reentreino ou alteração dos limites da TCN. Os resultados não medem acurácia real dos landmarks nem Chrome/Meet.", "variantes": {}}
    for variante in ("lite", "full", "heavy"):
        modelo = RAIZ / ("modelos/holistic_landmarker.task" if variante == "lite" else f"modelos/rastreamento/holistic_{variante}.task")
        destino = args.saida / variante
        destino.mkdir(exist_ok=True)
        (destino / "candidato-tcn.json").write_bytes((RAIZ / "modelos/sinais/tcn.json").read_bytes())
        amostras_fluxo, tempos, coberturas = [], [], []
        for i, (arquivo, classe) in enumerate(amostras):
            dados = extrair(arquivo, modelo, destino / arquivo.with_suffix(".npz").name)
            tempos.extend(dados["tempos_ms"].tolist())
            coberturas.append(float(dados["deteccao"]))
            amostras_fluxo.append(dict(arquivo=arquivo.name, esperado=classe, fps=float(dados["fps"]), vetores=dados["vetores"].tolist()))
            if i % 5 == 0 or i == len(amostras) - 1:
                print(f"{variante}: {i + 1}/{len(amostras)} vídeos", flush=True)
        (destino / "fluxo.json").write_text(json.dumps(amostras_fluxo), encoding="utf-8")
        medicao["variantes"][variante] = {"videos": len(amostras), "quadros": len(tempos),
                                          "mediana_ms": round(float(np.median(tempos)), 2),
                                          "p95_ms": round(float(np.percentile(tempos, 95)), 2),
                                          "media_fracao_quadros_com_maos": round(float(np.mean(coberturas)), 4),
                                          "modelo_sha256": hashlib.sha256(modelo.read_bytes()).hexdigest()}
        (args.saida / "medicao.json").write_text(json.dumps(medicao, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(medicao, ensure_ascii=False), flush=True)


if __name__ == "__main__":
    main()
