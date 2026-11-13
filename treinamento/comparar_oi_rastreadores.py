"""Regressão de quatro exemplos de Oi, com correção de proporção da câmera."""
import argparse
import json
import tempfile
from pathlib import Path
from comparar_rastreadores import extrair, RAIZ


def main():
    parser = argparse.ArgumentParser()
    temp = Path(tempfile.gettempdir())
    parser.add_argument("--oi", type=Path, default=temp / "libras-oi")
    parser.add_argument("--saida", type=Path, default=temp / "libras-comparacao-rastreadores")
    args = parser.parse_args()
    for variante in ("lite", "full", "heavy"):
        modelo = RAIZ / ("modelos/holistic_landmarker.task" if variante == "lite" else f"modelos/rastreamento/holistic_{variante}.task")
        amostras = []
        for nome in ("Oi_Articulador1.mp4", "Oi_Articulador2.mp4", "Oi_Articulador3.mp4", "Oi-INES.mp4"):
            dados = extrair(args.oi / nome, modelo, args.saida / variante / "oi" / Path(nome).with_suffix(".npz"),
                           corrigir_proporcao=True, largura_processamento=240 if nome == "Oi-INES.mp4" else 640)
            amostras.append(dict(arquivo=nome, esperado="Oi", fps=float(dados["fps"]), vetores=dados["vetores"].tolist()))
            print(f"{variante}: {nome}", flush=True)
        (args.saida / variante / "saudacoes.json").write_text(json.dumps(amostras), encoding="utf-8")


if __name__ == "__main__":
    main()
