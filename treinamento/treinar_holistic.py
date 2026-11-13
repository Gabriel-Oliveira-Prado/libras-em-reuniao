"""TCN de sinais isolados: treino/validação/teste separados por pessoa.

Um único protocolo fixado antes do teste. A melhor época usa apenas validação.
Exportação JSON permite inferência local sem biblioteca remota na extensão.
"""
import argparse
import copy
import json
import time
from pathlib import Path

import numpy as np
import torch
from torch import nn

from testar_tcn_local import pico_memoria_mb


class Bloco(nn.Module):
    def __init__(self, canais, dilatacao):
        super().__init__()
        self.dilatacao = dilatacao
        self.conv = nn.Conv1d(canais, canais, 3, dilation=dilatacao)

    def forward(self, x):
        return torch.relu(x + self.conv(nn.functional.pad(x, (2 * self.dilatacao, 0))))


class Rede(nn.Module):
    def __init__(self, classes):
        super().__init__()
        self.entrada = nn.Conv1d(228, 48, 1)
        self.blocos = nn.ModuleList([Bloco(48, d) for d in (1, 2, 4, 8)])
        self.saida = nn.Linear(48, classes)

    def forward(self, x):
        x = torch.relu(self.entrada(x))
        for bloco in self.blocos:
            x = bloco(x)
        return self.saida(x.mean(dim=2))


def ativo(v):
    return (v[:, 36] > 0.5) & (v[:, 38] < 1.5) | (v[:, 102] > 0.5) & (v[:, 104] < 1.5)


def reamostrar(v):
    pontos = np.linspace(0, len(v) - 1, 32)
    return np.stack([np.interp(pontos, np.arange(len(v)), v[:, i]) for i in range(v.shape[1])], axis=0).astype(np.float32)


def recortar(v):
    indices = np.flatnonzero(ativo(v))
    if len(indices) >= 4:
        return v[max(0, indices[0] - 2):min(len(v), indices[-1] + 3)]
    return v


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--pasta", type=Path, required=True)
    parser.add_argument("--saida", type=Path, required=True)
    parser.add_argument("--robusto", action="store_true", help="Varia ritmo e pequenas diferenças de execução só no treino")
    args = parser.parse_args()
    manifesto = json.loads((args.pasta / "manifesto.json").read_text(encoding="utf-8"))
    classes = ["Sem sinal"] + sorted({a["classe"] for a in manifesto["amostras"]})
    conjuntos = {nome: [] for nome in ["treino", "validacao", "teste"]}
    tempos = []
    for item in manifesto["amostras"]:
        arquivo = args.pasta / Path(item["arquivo"]).with_suffix(".holistic-v1.npz")
        with np.load(arquivo) as dados:
            v = dados["vetores"]
            tempos.extend(dados["tempos_ms"].tolist())
        if v.shape[1] != 228 or not np.isfinite(v).all():
            raise ValueError(f"Atributos inválidos: {arquivo}")
        grupo = conjuntos[item["divisao"]]
        grupo.append((reamostrar(recortar(v)), classes.index(item["classe"]), item["arquivo"]))
        # Trechos reais de repouso; nunca misturados entre pessoas/divisões.
        repouso = ~ativo(v)
        inicio = 0
        for fim in range(len(v) + 1):
            if fim == len(v) or not repouso[fim]:
                if fim - inicio >= 8:
                    grupo.append((reamostrar(v[inicio:fim]), 0, item["arquivo"] + ":repouso"))
                inicio = fim + 1
    torch.set_num_threads(4)
    torch.set_num_interop_threads(1)
    torch.manual_seed(20261113)
    torch.use_deterministic_algorithms(True)
    tensores = {nome: (torch.tensor(np.stack([a[0] for a in dados])), torch.tensor([a[1] for a in dados])) for nome, dados in conjuntos.items()}
    modelo = Rede(len(classes))
    otim = torch.optim.AdamW(modelo.parameters(), lr=0.001, weight_decay=0.005)
    x, y = tensores["treino"]
    xval, yval = tensores["validacao"]
    pesos = 1 / torch.bincount(y, minlength=len(classes)).float().clamp(min=1).sqrt()
    pesos /= pesos.mean()
    melhor, melhor_epoca, historico = float("inf"), 0, []
    inicio = time.perf_counter()
    for epoca in range(1, 241):
        modelo.train()
        ordem = torch.randperm(len(y))
        for lote in ordem.split(32):
            # Pequeno ruído de localização, sem espelhar sinais nem mudar o rótulo.
            exemplos = x[lote] + torch.randn_like(x[lote]) * 0.015
            if args.robusto:
                exemplos = x[lote].clone()
                # Variação temporal monotônica: não inverte nem troca a ordem do sinal.
                potencia = torch.empty(len(lote), 1).uniform_(0.75, 1.3)
                pontos = torch.linspace(0, 1, 32)[None, :].pow(potencia) * 31
                a = pontos.floor().long()
                b = (a + 1).clamp(max=31)
                peso = (pontos - a)[:, None, :]
                aa = a[:, None, :].expand(-1, 228, -1)
                bb = b[:, None, :].expand(-1, 228, -1)
                exemplos = exemplos.gather(2, aa) * (1 - peso) + exemplos.gather(2, bb) * peso
                for base in [36, 102]:
                    presente = exemplos[:, base:base+1, :] > 0.5
                    # Até 0,10 largura de ombros; não apaga o local linguístico do sinal.
                    deslocamento = torch.empty(len(lote), 2, 1).uniform_(-0.10, 0.10)
                    exemplos[:, base+1:base+3, :] += deslocamento * presente
                    forma = exemplos[:, base+3:base+66, :].reshape(len(lote), 21, 3, 32)
                    angulo = torch.empty(len(lote), 1, 1).uniform_(-0.07, 0.07)
                    xx, yy = forma[:, :, 0, :].clone(), forma[:, :, 1, :].clone()
                    forma[:, :, 0, :] = xx * angulo.cos() - yy * angulo.sin()
                    forma[:, :, 1, :] = xx * angulo.sin() + yy * angulo.cos()
                    forma += torch.randn_like(forma) * 0.008 * presente[:, None, :, :]
                    exemplos[:, base+3:base+66, :] = forma.reshape(len(lote), 63, 32)
            otim.zero_grad(set_to_none=True)
            perda = nn.functional.cross_entropy(modelo(exemplos), y[lote], weight=pesos, label_smoothing=0.05)
            perda.backward()
            nn.utils.clip_grad_norm_(modelo.parameters(), 2)
            otim.step()
        modelo.eval()
        with torch.inference_mode():
            logits = modelo(xval)
            erro = nn.functional.cross_entropy(logits, yval).item()
            acuracia = (logits.argmax(1) == yval).float().mean().item()
        if erro < melhor:
            melhor, melhor_epoca, melhor_estado = erro, epoca, copy.deepcopy(modelo.state_dict())
        if epoca % 20 == 0:
            historico.append(dict(epoca=epoca, perda_validacao=erro, acuracia_validacao=acuracia))
            print(f"Época {epoca}: validação {acuracia:.1%}; melhor época {melhor_epoca}", flush=True)
    modelo.load_state_dict(melhor_estado)
    modelo.eval()
    resultados = {}
    for nome in ["validacao", "teste"]:
        xx, yy = tensores[nome]
        with torch.inference_mode():
            probs = modelo(xx).softmax(1)
        confianca, previsto = probs.max(1)
        segunda = probs.topk(2).values[:, 1]
        aceito = (previsto != 0) & (confianca >= 0.85) & (confianca - segunda >= 0.3)
        correto = previsto == yy
        sinais = yy != 0
        resultados[nome] = dict(
            exemplos=len(yy), sinais=int(sinais.sum()), acertos_sinais=int((correto & sinais).sum()),
            repousos=int((~sinais).sum()), falsos_positivos_repouso=int((aceito & ~sinais).sum()),
            falas_aceitas=int(aceito.sum()), falas_corretas=int((aceito & correto).sum()),
            previsoes=[dict(arquivo=a[2], esperado=classes[int(y0)], previsto=classes[int(p)], confianca=float(c), aceito=bool(ok))
                       for a, y0, p, c, ok in zip(conjuntos[nome], yy, previsto, confianca, aceito)],
        )
    args.saida.mkdir(parents=True, exist_ok=True)
    # Exporta pesos do candidato; publicação/fala automática são decisões separadas.
    exportado = dict(schema=1, entradas=228, passos=32, classes=classes, canais=48,
                     dilatacoes=[1, 2, 4, 8], confianca=0.85, margem=0.3,
                     estado={k: v.tolist() for k, v in modelo.state_dict().items()})
    (args.saida / "candidato-tcn.json").write_text(json.dumps(exportado, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    torch.save(modelo.state_dict(), args.saida / "candidato-tcn.pt")
    with torch.inference_mode():
        for _ in range(20):
            modelo(x[:1])
        latencias = []
        for _ in range(200):
            antes = time.perf_counter()
            modelo(x[:1])
            latencias.append((time.perf_counter() - antes) * 1000)
        referencia = modelo(x[:1]).softmax(1).tolist()[0]
    (args.saida / "paridade.json").write_text(json.dumps(dict(entrada=x[0].T.tolist(), probabilidades=referencia)), encoding="utf-8")
    relatorio = dict(
        origem="https://zenodo.org/records/2667329", espelho=manifesto["origem"], revisao=manifesto["revisao"],
        protocolo="MINDS: pessoas 01,02,05,06,08,10 no treino; 11 na validação/escolha de época; 12 no teste."
                  + (" Oi: pessoa 1 treino, 2 validação, 3 teste. Regressão MINDS reutilizada; não é novo teste independente." if manifesto.get("oi") else " Teste avaliado uma única vez nesta rodada."),
        origem_oi=manifesto.get("oi"),
        aumento_robusto=bool(args.robusto),
        videos=len(manifesto["amostras"]), classes=classes, parametros=sum(p.numel() for p in modelo.parameters()),
        melhor_epoca=melhor_epoca, segundos=round(time.perf_counter() - inicio, 2),
        pico_memoria_mb=pico_memoria_mb(), inferencia_mediana_ms=float(np.median(latencias)),
        holistic_mediana_ms=float(np.median(tempos)), holistic_p95_ms=float(np.percentile(tempos, 95)),
        fala_automatica_habilitada=False,
        limites=["Sinais isolados e fundo controlado; não avalia conversas contínuas.",
                 "Uma única pessoa de teste; não mede a câmera do usuário nem todos os sinais desconhecidos.",
                 "Trechos de repouso não substituem validação com gestos cotidianos e sinais fora do vocabulário.",
                 "Não existe filtro de palavrões; a cobertura depende das classes presentes no treinamento."],
        resultados=resultados, historico=historico,
    )
    (args.saida / "resultado-holistic.json").write_text(json.dumps(relatorio, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({k: {a: b for a, b in v.items() if a != "previsoes"} for k, v in resultados.items()}, ensure_ascii=False), flush=True)


if __name__ == "__main__":
    main()
