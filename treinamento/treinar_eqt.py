"""Candidato de pesquisa EQT 156: protocolo fixo, sem publicação automática.

Treino: informantes locais 1–3; validação 4; teste 5. Esses números locais
não comprovam identidade física global distinta entre sinais.
CC BY-NC 4.0: uso de pesquisa não comercial; modelo anterior não é alterado.
"""
import argparse
import copy
import hashlib
import json
import subprocess
import sys
import time
import unicodedata
from collections import Counter
from pathlib import Path

import numpy as np
import torch
from torch import nn
from testar_tcn_local import pico_memoria_mb

SEMENTE = 20261113
CONFIANCA, MARGEM = 0.95, 0.40
EPOCAS, PACIENCIA = 240, 40
PERFIL = "eqt-maos-bracos-v1"
RAIZ = Path(__file__).resolve().parents[1]


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
        self.entrada = nn.Conv1d(156, 48, 1)
        self.blocos = nn.ModuleList([Bloco(48, d) for d in (1, 2, 4, 8)])
        self.saida = nn.Linear(48, classes)

    def forward(self, x):
        x = torch.relu(self.entrada(x))
        for bloco in self.blocos:
            x = bloco(x)
        return self.saida(x.mean(dim=2))


def ativo(v):
    return ((v[:, 24] > 0.5) & (v[:, 26] < 1.5)) | ((v[:, 90] > 0.5) & (v[:, 92] < 1.5))


def recortar(v):
    indices = np.flatnonzero(ativo(v))
    return v[max(0, indices[0] - 2):min(len(v), indices[-1] + 3)] if len(indices) >= 4 else v


def reamostrar(v):
    pontos = np.linspace(0, len(v) - 1, 32)
    return np.stack([np.interp(pontos, np.arange(len(v)), v[:, j]) for j in range(156)]).astype(np.float32)


def hash_vetores(v):
    return hashlib.sha256(np.asarray(v, dtype="<f4").tobytes()).hexdigest()


def canonico(s):
    texto = "".join(c for c in unicodedata.normalize("NFD", s) if not unicodedata.combining(c))
    chave = "".join(c for c in texto.casefold() if c.isalnum())
    return {"ola": "oi"}.get(chave, chave)


def carregar(pasta):
    manifesto_bytes = (pasta / "manifesto.json").read_bytes()
    manifesto = json.loads(manifesto_bytes.decode("utf-8-sig"))
    classes = ["Sem sinal"] + sorted({a["classe"] for a in manifesto["amostras"]})
    if len(classes) != 49:
        raise ValueError("O protocolo exige exatamente 48 rótulos de sinal, mais repouso.")
    conjuntos = {nome: [] for nome in ["treino", "validacao", "teste"]}
    videos, duplicados, hashes = [], [], {}
    itens = sorted(manifesto["amostras"], key=lambda a: (int(a["pessoa"]), a["arquivo"]))
    for item in itens:
        pessoa = int(item["pessoa"])
        divisao = "treino" if pessoa in (1, 2, 3) else "validacao" if pessoa == 4 else "teste" if pessoa == 5 else None
        if not divisao or item["divisao"] != divisao:
            raise ValueError("Divisão incompatível com informante local: " + item["arquivo"])
        with np.load(pasta / item["arquivo"], allow_pickle=False) as dados:
            v = np.asarray(dados["vetores"], dtype=np.float32)
            fps = float(dados["fps"])
        if v.ndim != 2 or v.shape[1] != 156 or len(v) < 4 or not np.isfinite(v).all() or not 1 <= fps <= 120:
            raise ValueError("Vetores/fps inválidos: " + item["arquivo"])
        digest = hash_vetores(v)
        if digest in hashes:
            anterior = hashes[digest]
            if anterior["classe"] != item["classe"]:
                raise ValueError("Conteúdo idêntico com rótulos distintos: " + item["arquivo"])
            duplicados.append(dict(arquivo=item["arquivo"], mantido=anterior["arquivo"], divisao=divisao, sha256=digest))
            continue
        hashes[digest] = item
        y = classes.index(item["classe"])
        conjuntos[divisao].append((reamostrar(recortar(v)), y, item["arquivo"]))
        videos.append(dict(arquivo=item["arquivo"], classe=item["classe"], divisao=divisao, pessoa=pessoa,
                           fps=fps, vetores=v, sha256=digest, origem_zip=item.get("origem_zip")))
        repouso = ~ativo(v)
        inicio = 0
        for fim in range(len(v) + 1):
            if fim == len(v) or not repouso[fim]:
                if fim - inicio >= 8:
                    conjuntos[divisao].append((reamostrar(v[inicio:fim]), 0, item["arquivo"] + ":repouso"))
                inicio = fim + 1
    for grupo, itens_grupo in conjuntos.items():
        if not itens_grupo:
            raise ValueError("Divisão vazia: " + grupo)
    return manifesto, classes, conjuntos, videos, duplicados, hashlib.sha256(manifesto_bytes).hexdigest()


def perturbar(x):
    exemplos = x.clone()
    for base in range(0, 24, 4):
        presente = x[:, base + 3:base + 4, :] > 0.5
        exemplos[:, base:base + 3, :] += torch.randn_like(x[:, base:base + 3, :]) * 0.01 * presente
    for base in (24, 90):
        presente = x[:, base:base + 1, :] > 0.5
        exemplos[:, base + 1:base + 66, :] += torch.randn_like(x[:, base + 1:base + 66, :]) * 0.01 * presente
    return exemplos.clamp(-5, 5)


def previsoes(modelo, exemplos, classes):
    if not exemplos:
        return []
    x = torch.tensor(np.stack([a[0] for a in exemplos]))
    with torch.inference_mode():
        probs = modelo(x).softmax(1)
    indices = probs.argmax(1)
    top2 = probs.topk(2).values
    saida = []
    for a, indice, p in zip(exemplos, indices, top2):
        i = int(indice)
        confianca, margem = float(p[0]), float(p[0] - p[1])
        esperado = classes[a[1]] if a[1] is not None else None
        saida.append(dict(arquivo=a[2], esperado=esperado, previsto=classes[i], confianca=confianca, margem=margem,
                          aceito=i != 0 and confianca >= CONFIANCA and margem >= MARGEM))
    return saida


def resumir(linhas, classes):
    sinais = [r for r in linhas if r["esperado"] not in (None, "Sem sinal")]
    repousos = [r for r in linhas if r["esperado"] == "Sem sinal"]
    aceitos = [r for r in linhas if r["aceito"]]
    por_classe = {}
    for classe in classes[1:]:
        recorte = [r for r in sinais if r["esperado"] == classe]
        por_classe[classe] = dict(exemplos=len(recorte), acertos_brutos=sum(r["previsto"] == classe for r in recorte),
                                 corretas_aceitas=sum(r["aceito"] and r["previsto"] == classe for r in recorte),
                                 erradas_aceitas=sum(r["aceito"] and r["previsto"] != classe for r in recorte),
                                 abstencoes=sum(not r["aceito"] for r in recorte))
    return dict(exemplos=len(linhas), sinais=len(sinais), acertos_brutos=sum(r["previsto"] == r["esperado"] for r in sinais),
                repousos=len(repousos), falsos_positivos_repouso=sum(r["aceito"] for r in repousos),
                falas_aceitas=len(aceitos), falas_corretas=sum(r["previsto"] == r["esperado"] for r in aceitos),
                falas_erradas=sum(r["previsto"] != r["esperado"] for r in aceitos),
                abstencoes=sum(not r["aceito"] for r in sinais), por_classe=por_classe, previsoes=linhas)


def externos(temp, classes):
    arquivos = [
        ("MINDS/V-Librasil", temp / "libras-tcn-holistic/fluxo.json", None),
        ("Oi V-Librasil", temp / "libras-oi/fluxo-oi.json", "Oi"),
        ("Oi INES", temp / "libras-oi/ines-camera.json", "Oi"),
        ("Acenar V-Librasil", temp / "libras-oi/acenar.json", "Acenar"),
    ]
    mapa = {canonico(c): c for c in classes[1:]}
    registros, ausentes, vistos = [], [], set()
    for fonte, caminho, rotulo in arquivos:
        if not caminho.exists():
            ausentes.append(str(caminho))
            continue
        conteudo = json.loads(caminho.read_text(encoding="utf-8-sig"))
        for i, item in enumerate(conteudo if isinstance(conteudo, list) else [conteudo]):
            v228 = np.asarray(item["vetores"], dtype=np.float32)
            if v228.ndim != 2 or v228.shape[1] != 228 or not np.isfinite(v228).all():
                raise ValueError("Cache externo inválido: " + str(caminho))
            v = np.concatenate([v228[:, 4:28], v228[:, 36:168]], axis=1)
            digest = hash_vetores(v)
            if digest in vistos:
                continue
            vistos.add(digest)
            nome = item.get("arquivo") or item.get("nome") or caminho.stem + "-" + str(i)
            etiqueta = rotulo or item.get("esperado") or nome.split("_Articulador")[0].replace("_", " ")
            compartilhada = mapa.get(canonico(etiqueta))
            registros.append(dict(arquivo=fonte + ":" + nome, classe=compartilhada, rotulo_origem=etiqueta,
                                  compartilhada=bool(compartilhada), fps=float(item["fps"]), vetores=v, sha256=digest))
    return registros, ausentes


def segmentar(videos):
    modulo = (RAIZ / "painel/segmentacao-sinais.mjs").as_uri()
    codigo = """
import {readFileSync} from "node:fs";
const {SegmentadorDeSinais} = await import(MODULO);
const dados=JSON.parse(readFileSync(0,"utf8")), saida=[];
for(const item of dados){
 const s=new SegmentadorDeSinais(), segmentos=[];
 for(let i=0;i<item.vetores.length+Math.ceil(item.fps*2);i++){
  const v=new Float32Array(228), origem=item.vetores[i];
  if(origem){v.set(origem.slice(0,24),4);v.set(origem.slice(24),36);}
  const seq=s.receber(v,i*1000/item.fps);
  if(seq)segmentos.push(seq.map(q=>[...q.slice(4,28),...q.slice(36,168)]));
 }
 saida.push({arquivo:item.arquivo,segmentos});
}
process.stdout.write(JSON.stringify(saida));
""".replace("MODULO", json.dumps(modulo))
    entrada = json.dumps([dict(arquivo=v["arquivo"], fps=v["fps"], vetores=v["vetores"].tolist()) for v in videos])
    r = subprocess.run(["node", "--input-type=module", "-e", codigo], input=entrada, text=True, encoding="utf-8",
                       capture_output=True, check=True, timeout=120)
    return json.loads(r.stdout)


def resumo_fluxo_videos(dados):
    conhecidos = [v for v in dados if v["esperado"]]
    negativos = [v for v in dados if not v["esperado"]]
    por_classe = {}
    for classe in sorted({v["esperado"] for v in conhecidos}):
        grupo = [v for v in conhecidos if v["esperado"] == classe]
        por_classe[classe] = dict(videos=len(grupo), corretos=sum(v["falas"] == [classe] for v in grupo),
                                 abstencoes=sum(not v["falas"] for v in grupo),
                                 erradas_ou_repetidas=sum(bool(v["falas"]) and v["falas"] != [classe] for v in grupo))
    return dict(videos=len(dados), conhecidos=len(conhecidos), corretos=sum(v["falas"] == [v["esperado"]] for v in conhecidos),
                abstencoes=sum(not v["falas"] for v in conhecidos),
                erradas_ou_repetidas=sum(bool(v["falas"]) and v["falas"] != [v["esperado"]] for v in conhecidos),
                negativos=len(negativos), negativos_com_fala=sum(bool(v["falas"]) for v in negativos),
                falas_negativas=sum(len(v["falas"]) for v in negativos), por_classe=por_classe)


def avaliar_fluxo(modelo, videos, classes):
    por_nome = {v["arquivo"]: v for v in videos}
    entradas, indices = [], []
    for resultado in segmentar(videos):
        esperado = por_nome[resultado["arquivo"]]["classe"]
        y = classes.index(esperado) if esperado else None
        for i, seq in enumerate(resultado["segmentos"]):
            entradas.append((reamostrar(recortar(np.asarray(seq, dtype=np.float32))), y, resultado["arquivo"] + ":s" + str(i)))
            indices.append(resultado["arquivo"])
    linhas = previsoes(modelo, entradas, classes)
    por_video = {v["arquivo"]: dict(arquivo=v["arquivo"], esperado=v["classe"], segmentos=0, falas=[]) for v in videos}
    for nome, linha in zip(indices, linhas):
        por_video[nome]["segmentos"] += 1
        if linha["aceito"]:
            por_video[nome]["falas"].append(linha["previsto"])
    dados = list(por_video.values())
    conhecidos = [v for v in dados if v["esperado"]]
    negativos = [v for v in dados if not v["esperado"]]
    return dict(videos=len(dados), conhecidos=len(conhecidos),
                corretos=sum(v["falas"] == [v["esperado"]] for v in conhecidos),
                abstencoes=sum(not v["falas"] for v in conhecidos),
                erradas_ou_repetidas=sum(bool(v["falas"]) and v["falas"] != [v["esperado"]] for v in conhecidos),
                negativos=len(negativos), negativos_com_fala=sum(bool(v["falas"]) for v in negativos),
                falas_negativas=sum(len(v["falas"]) for v in negativos), resultados=dados, segmentos=linhas,
                teste_eqt=resumo_fluxo_videos([v for v in dados if por_nome[v["arquivo"]].get("divisao") == "teste"]),
                externos=resumo_fluxo_videos([v for v in dados if not por_nome[v["arquivo"]].get("divisao")]))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--pasta", type=Path, required=True)
    parser.add_argument("--saida", type=Path, required=True)
    parser.add_argument("--externos", type=Path)
    parser.add_argument("--relatorio", type=Path, default=Path(__file__).with_name("resultado-eqt-081.json"))
    args = parser.parse_args()
    inicio_total = time.perf_counter()
    manifesto, classes, conjuntos, videos, duplicados, sha_manifesto = carregar(args.pasta)
    torch.set_num_threads(4)
    torch.set_num_interop_threads(1)
    torch.manual_seed(SEMENTE)
    np.random.seed(SEMENTE)
    torch.use_deterministic_algorithms(True)
    tensores = {n: (torch.tensor(np.stack([a[0] for a in dados])), torch.tensor([a[1] for a in dados])) for n, dados in conjuntos.items()}
    modelo = Rede(len(classes))
    otimizador = torch.optim.AdamW(modelo.parameters(), lr=0.001, weight_decay=0.005)
    x, y = tensores["treino"]
    xv, yv = tensores["validacao"]
    pesos = 1 / torch.bincount(y, minlength=len(classes)).float().clamp(min=1).sqrt()
    pesos /= pesos.mean()
    melhor, melhor_epoca, historico = float("inf"), 0, []
    inicio_treino = time.perf_counter()
    for epoca in range(1, EPOCAS + 1):
        modelo.train()
        for lote in torch.randperm(len(y)).split(32):
            otimizador.zero_grad(set_to_none=True)
            perda = nn.functional.cross_entropy(modelo(perturbar(x[lote])), y[lote], weight=pesos, label_smoothing=0.05)
            perda.backward()
            nn.utils.clip_grad_norm_(modelo.parameters(), 2)
            otimizador.step()
        modelo.eval()
        with torch.inference_mode():
            logits = modelo(xv)
            erro = float(nn.functional.cross_entropy(logits, yv))
            acerto = float((logits.argmax(1) == yv).float().mean())
        historico.append(dict(epoca=epoca, perda_validacao=erro, acuracia_validacao=acerto))
        if erro < melhor:
            melhor, melhor_epoca, melhor_estado = erro, epoca, copy.deepcopy(modelo.state_dict())
        if epoca % 20 == 0:
            print(f"Época {epoca}: val loss {erro:.5f}; acerto {acerto:.1%}; melhor {melhor_epoca}", flush=True)
        if epoca - melhor_epoca >= PACIENCIA:
            break
    segundos_treino = time.perf_counter() - inicio_treino
    modelo.load_state_dict(melhor_estado)
    modelo.eval()
    # O teste só é consultado depois da escolha por perda de validação.
    resultados = {n: resumir(previsoes(modelo, conjuntos[n], classes), classes) for n in ["validacao", "teste"]}
    negativos, ausentes = externos(args.externos or args.pasta.parent.parent, classes)
    externos_raw = previsoes(modelo, [(reamostrar(recortar(v["vetores"])), classes.index(v["classe"]) if v["classe"] else None, v["arquivo"]) for v in negativos], classes)
    args.saida.mkdir(parents=True, exist_ok=True)
    candidato = dict(schema=1, entradas=156, passos=32, perfil=PERFIL, classes=classes, canais=48,
                     dilatacoes=[1, 2, 4, 8], confianca=CONFIANCA, margem=MARGEM,
                     licenca="CC-BY-NC-4.0", experimental=True,
                     estado={k: v.tolist() for k, v in modelo.state_dict().items()})
    (args.saida / "candidato-tcn.json").write_text(json.dumps(candidato, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    torch.save(modelo.state_dict(), args.saida / "candidato-tcn.pt")
    with torch.inference_mode():
        referencia = modelo(x[:1]).softmax(1).tolist()[0]
        for _ in range(20):
            modelo(x[:1])
        tempos = []
        for _ in range(200):
            antes = time.perf_counter()
            modelo(x[:1])
            tempos.append((time.perf_counter() - antes) * 1000)
    (args.saida / "paridade.json").write_text(json.dumps(dict(entrada=x[0].T.tolist(), probabilidades=referencia)), encoding="utf-8")
    fluxo = avaliar_fluxo(modelo, [v for v in videos if v["divisao"] == "teste"] + negativos, classes)
    relatorio = dict(
        protocolo=dict(seed=SEMENTE, informantes_locais_treino=[1, 2, 3], validacao=[4], teste=[5],
                       selecao="menor perda de validação; nunca pelo teste", maximo_epocas=EPOCAS, paciencia=PACIENCIA,
                       confianca=CONFIANCA, margem=MARGEM, ruido_treino=0.01, reflexao=False, candidato_unico=True),
        perfil=PERFIL, licenca="CC-BY-NC-4.0", uso="Pesquisa não comercial; nenhuma promoção automática",
        execucao=dict(python=sys.version, torch=torch.__version__, numpy=np.__version__, pasta=str(args.pasta.resolve()), saida=str(args.saida.resolve()), threads=4),
        estado="reprovado_para_fala_automatica",
        conclusao="Não promove o candidato: cobertura restrita e/ou falas indevidas exigem nova pesquisa independente. A produção permanece inalterada.",
        fonte={k: v for k, v in manifesto.items() if k != "amostras"}, sha256_manifesto=sha_manifesto,
        classes=classes, entradas=156, passos=32, parametros=sum(p.numel() for p in modelo.parameters()),
        videos_por_divisao=dict(Counter(v["divisao"] for v in videos)), exemplos_por_divisao={n: len(v) for n, v in conjuntos.items()},
        duplicados_removidos=duplicados, conteudos_unicos=len(videos), melhor_epoca=melhor_epoca, epocas_executadas=epoca,
        segundos_treino=segundos_treino, pico_memoria_mb=pico_memoria_mb(), inferencia_mediana_ms=float(np.median(tempos)),
        resultados=resultados, externos=dict(arquivos_ausentes=ausentes, anotacoes=[{k: v for k, v in a.items() if k != "vetores"} for a in negativos],
                                           negativos_sem_rotulo_compartilhado=sum(not a["compartilhada"] for a in negativos),
                                           rotulos_compartilhados_excluidos_dos_negativos=sum(a["compartilhada"] for a in negativos),
                                           raw=resumir(externos_raw, classes)),
        fluxo=fluxo, historico=historico, segundos_total=time.perf_counter() - inicio_total,
        fala_automatica_habilitada=False, modelo_distribuido_substituido=False,
        limites=[
            "IDs de informante são locais por item; números distintos não provam pessoas físicas inteiramente novas.",
            "FPS 30 é assumido na preparação após medir uma amostra RGB; não foi medido em todos os vídeos.",
            "48 rótulos isolados da curadoria dos autores; não demonstra compreensão de frases livres.",
            "Fonte e cache externos usam extrações diferentes; resultados externos podem refletir mudança de domínio.",
            "Deduplicação exata por hash de vetores; não detecta todas as cópias visuais ou identidades compartilhadas.",
            "Repousos vêm dos mesmos arquivos e permanecem na divisão do arquivo original.",
            "Inferência sobre landmarks pré-extraídos; não executa câmera, Chrome, áudio, avatar ou Meet.",
            "Fluxo usa Segmentador runtime com seis pontos de pose e mãos reconstituídos em 228, sem face, sem confirmação antecipada.",
            "Rótulos externos compartilhados são separados dos negativos por normalização de texto, não revisão semântica humana.",
            "CC BY-NC 4.0 limita uso comercial; candidato permanece em TEMP e não é habilitado na extensão.",
        ],
    )
    args.relatorio.write_text(json.dumps(relatorio, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(dict(melhor_epoca=melhor_epoca, segundos_treino=segundos_treino,
                          teste={k: v for k, v in resultados["teste"].items() if k not in ("previsoes", "por_classe")},
                          fluxo={k: v for k, v in fluxo.items() if k not in ("resultados", "segmentos")}), ensure_ascii=False), flush=True)


if __name__ == "__main__":
    main()
