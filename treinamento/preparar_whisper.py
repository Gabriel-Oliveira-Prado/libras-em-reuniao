"""Baixa somente o Whisper ONNX q8 necessário, com revisão e hashes fixos."""
import argparse
import concurrent.futures
import hashlib
import json
from pathlib import Path
import urllib.request

REVISOES = {
    "base": "27a07b4b52b3a4c5886134bb4320e93e1a4bbc7c",
    "small": "36050c46d777d46dc4b5f43f6d90574fc38f8732",
}

def main():
    p = argparse.ArgumentParser()
    p.add_argument("modelo", choices=REVISOES)
    p.add_argument("--destino", type=Path, required=True)
    args = p.parse_args()
    repo = "onnx-community/whisper-" + args.modelo
    revisao = REVISOES[args.modelo]
    with urllib.request.urlopen(f"https://huggingface.co/api/models/{repo}/tree/{revisao}/onnx", timeout=40) as r:
        pesos = {a["path"]: a for a in json.load(r)}
    arquivos = ["config.json", "generation_config.json", "preprocessor_config.json", "tokenizer.json", "tokenizer_config.json", "README.md",
                "onnx/encoder_model_quantized.onnx", "onnx/decoder_model_merged_quantized.onnx"]
    def baixar(nome):
        destino = args.destino / nome
        destino.parent.mkdir(parents=True, exist_ok=True)
        esperado = pesos.get(nome, {})
        sha = esperado.get("lfs", {}).get("oid")
        if not destino.exists() or (sha and hashlib.sha256(destino.read_bytes()).hexdigest() != sha):
            parcial = destino.with_suffix(destino.suffix + ".download")
            urllib.request.urlretrieve(f"https://huggingface.co/{repo}/resolve/{revisao}/{nome}", parcial)
            if sha and hashlib.sha256(parcial.read_bytes()).hexdigest() != sha:
                raise RuntimeError("Hash divergente: " + nome)
            parcial.replace(destino)
        print("Verificado " + nome, flush=True)
        return dict(arquivo=nome, bytes=destino.stat().st_size, sha256=hashlib.sha256(destino.read_bytes()).hexdigest())
    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as executor:
        verificados = list(executor.map(baixar, arquivos))
    (args.destino / "ORIGEM.json").write_text(json.dumps(dict(repositorio=repo, revisao=revisao, arquivos=verificados), indent=2) + "\n", encoding="utf-8")

if __name__ == "__main__":
    main()
