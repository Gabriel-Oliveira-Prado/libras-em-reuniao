"""Mede treino/inferência de uma TCN pequena sobre dados reais já extraídos.

Experimento de capacidade, sem publicar um reconhecedor na extensão.
Configuração fixa; teste por pessoa, sem ajuste de hiperparâmetros no teste.
"""
import argparse
import ctypes
import hashlib
import json
import platform
import time
from pathlib import Path

import numpy as np
import torch
from torch import nn

CLASSES = ["Ajudar", "Desculpa", "Não", "Obrigado", "Por favor", "Sim"]


class BlocoTemporal(nn.Module):
    def __init__(self, canais, dilatacao):
        super().__init__()
        self.padding = 2 * dilatacao
        self.conv = nn.Conv1d(canais, canais, 3, dilation=dilatacao)

    def forward(self, x):
        return torch.relu(x + self.conv(nn.functional.pad(x, (self.padding, 0))))


class TCN(nn.Module):
    def __init__(self, entradas=132):
        super().__init__()
        self.rede = nn.Sequential(
            nn.Conv1d(entradas, 32, 1), nn.ReLU(),
            BlocoTemporal(32, 1), BlocoTemporal(32, 2), BlocoTemporal(32, 4),
            nn.AdaptiveAvgPool1d(1), nn.Flatten(), nn.Linear(32, len(CLASSES)),
        )

    def forward(self, x):
        return self.rede(x)


def pico_memoria_mb():
    if platform.system() != "Windows":
        return None

    class Contadores(ctypes.Structure):
        _fields_ = [("cb", ctypes.c_ulong), ("PageFaultCount", ctypes.c_ulong)] + [
            (nome, ctypes.c_size_t) for nome in (
                "PeakWorkingSetSize", "WorkingSetSize", "QuotaPeakPagedPoolUsage",
                "QuotaPagedPoolUsage", "QuotaPeakNonPagedPoolUsage",
                "QuotaNonPagedPoolUsage", "PagefileUsage", "PeakPagefileUsage",
            )
        ]

    kernel = ctypes.WinDLL("kernel32", use_last_error=True)
    kernel.GetCurrentProcess.restype = ctypes.c_void_p
    psapi = ctypes.WinDLL("psapi", use_last_error=True)
    psapi.GetProcessMemoryInfo.argtypes = [ctypes.c_void_p, ctypes.POINTER(Contadores), ctypes.c_ulong]
    contadores = Contadores()
    contadores.cb = ctypes.sizeof(contadores)
    if not psapi.GetProcessMemoryInfo(kernel.GetCurrentProcess(), ctypes.byref(contadores), contadores.cb):
        raise ctypes.WinError(ctypes.get_last_error())
    return round(contadores.PeakWorkingSetSize / 1024**2, 1)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--dados", type=Path, required=True)
    parser.add_argument("--saida", type=Path, required=True)
    args = parser.parse_args()
    torch.set_num_threads(4)
    torch.set_num_interop_threads(1)
    torch.use_deterministic_algorithms(True)
    vetores, rotulos, pessoas, arquivos = [], [], [], []
    for classe, nome in enumerate(CLASSES):
        for pessoa in range(1, 4):
            arquivo = args.dados / f"{nome}_Articulador{pessoa}.maos-v1.npz"
            with np.load(arquivo) as dados:
                vetor = dados["vetores"].astype(np.float32)
            if vetor.shape != (24, 132) or not np.isfinite(vetor).all():
                raise ValueError(f"Dados inválidos: {arquivo}")
            vetores.append(vetor.T)
            rotulos.append(classe)
            pessoas.append(pessoa)
            arquivos.append({"arquivo": arquivo.name, "sha256": hashlib.sha256(arquivo.read_bytes()).hexdigest()})
    x = torch.from_numpy(np.stack(vetores))
    y = torch.tensor(rotulos, dtype=torch.long)
    pessoas = np.array(pessoas)
    resultados, tempos = [], []
    inicio_total = time.perf_counter()
    for pessoa in range(1, 4):
        torch.manual_seed(20261112)
        modelo = TCN()
        otimizador = torch.optim.Adam(modelo.parameters(), lr=0.001)
        treino = torch.from_numpy(pessoas != pessoa)
        teste = torch.from_numpy(pessoas == pessoa)
        inicio = time.perf_counter()
        modelo.train()
        for _ in range(120):
            otimizador.zero_grad(set_to_none=True)
            perda = nn.functional.cross_entropy(modelo(x[treino]), y[treino])
            if not torch.isfinite(perda):
                raise RuntimeError("Treino divergiu")
            perda.backward()
            otimizador.step()
        segundos = time.perf_counter() - inicio
        modelo.eval()
        with torch.inference_mode():
            previsoes = modelo(x[teste]).argmax(1)
            acertos = int((previsoes == y[teste]).sum())
            acertos_treino = int((modelo(x[treino]).argmax(1) == y[treino]).sum())
        resultados.append({
            "pessoa_teste": pessoa, "treino_segundos": round(segundos, 3),
            "epocas": 120, "videos_treino": 12, "acertos_treino": acertos_treino,
            "videos_teste": 6, "acertos_teste": acertos,
            "perda_final_treino": float(perda.detach()),
            "previsoes": [{"esperado": CLASSES[a], "previsto": CLASSES[b]} for a, b in zip(y[teste].tolist(), previsoes.tolist())],
        })
        print(f"Pessoa {pessoa}: treino {segundos:.2f}s; teste {acertos}/6", flush=True)
    with torch.inference_mode():
        for _ in range(20):
            modelo(x[:1])
        for _ in range(200):
            inicio = time.perf_counter()
            modelo(x[:1])
            tempos.append((time.perf_counter() - inicio) * 1000)
    relatorio = {
        "torch": torch.__version__, "python": platform.python_version(),
        "dispositivo": "CPU", "threads": 4,
        "parametros": sum(p.numel() for p in modelo.parameters()),
        "entrada": "24 passos x 132 atributos das duas mãos, previamente extraídos com MediaPipe",
        "tempo_total_segundos": round(time.perf_counter() - inicio_total, 3),
        "pico_memoria_processo_mb": pico_memoria_mb(),
        "inferencia_mediana_ms": round(float(np.median(tempos)), 3),
        "inferencia_p95_ms": round(float(np.percentile(tempos, 95)), 3),
        "acertos": sum(r["acertos_teste"] for r in resultados), "videos": 18,
        "habilitado_na_extensao": False,
        "limites": [
            "Tempos excluem câmera, extração MediaPipe, espera pelo movimento, navegador e síntese de voz.",
            "Usa apenas mãos; não mede o pipeline Holistic completo com corpo e rosto.",
            "18 vídeos / 6 classes são insuficientes para validar conversação ou vocabulário amplo.",
            "Avaliação exploratória: estas pessoas já foram usadas no experimento DTW anterior; não constitui teste final independente.",
            "Nenhum hiperparâmetro foi selecionado com base nestes resultados.",
        ],
        "resultados": resultados, "dados": arquivos,
    }
    args.saida.parent.mkdir(parents=True, exist_ok=True)
    args.saida.write_text(json.dumps(relatorio, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({k: v for k, v in relatorio.items() if k not in ("dados", "resultados")}, ensure_ascii=False), flush=True)


if __name__ == "__main__":
    main()
