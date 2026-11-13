"""Prepara um candidato de pesquisa EQT, sem alterar o modelo da extensão.

Fonte CC BY-NC 4.0. Usa somente o ramo full do ZIP; não duplica suas mãos.
Os IDs de informante são locais ao item e não identidades físicas globais.
"""
import argparse
from collections import Counter
import hashlib
import io
import json
from pathlib import Path
import re
import zipfile

import numpy as np

ORIGEM = "https://zenodo.org/records/21398895"
MD5 = "415a18d9be6d65468bcf92db5e940df8"
PERFIL = "eqt-maos-bracos-v1"
RAMO = "Landmarks/Libras-EQT-UECE (Landmarks)/"
# Curadoria publicada antes deste experimento, sem seleção por acurácia.
# Fonte: datasets-islr-libras 0.1.0, item_mapping.ISOLATED_ITEM_IDS.
IDS_ISOLADOS = {
    2, 7, 23, 24, 91, 92, 93, 94, 95, 96, 97, 98, 99, 100, 101, 102,
    103, 104, 105, 106, 107, 108, 109, 110, 111, 112, 113, 115, 132,
    140, 146, 147, 148, 149, 150, 151, 152, 153, 154, 155, 165, 167,
    180, 181, 202, 204, 205, 233,
}


def converter(v, proporcao):
    """318 publicados -> 156 compartilhados com o perfil JS da extensão.

    Empírico: 168 coordenadas faciais, 6 poses xyzw e 42 mãos xyz. O bloco
    final de 126 coordenadas é idêntico ao NPY Hand Landmarks correspondente.
    Face, nariz e quadris não são inferidos nem completados.
    """
    if v.ndim != 2 or v.shape[1] != 318 or len(v) < 4 or not np.isfinite(v).all():
        raise ValueError(f"NPY inválido: shape={v.shape}")
    pose = v[:, 168:192].astype(np.float64).reshape(-1, 6, 4).copy()
    maos = v[:, 192:318].astype(np.float64).reshape(-1, 2, 21, 3).copy()
    presentes = np.any(maos != 0, axis=(2, 3))
    fator_y = (16 / 9) / proporcao
    pose[:, :, 1] = (pose[:, :, 1] - 0.5) * fator_y + 0.5
    maos[:, :, :, 1] = (maos[:, :, :, 1] - 0.5) * fator_y + 0.5
    centro = pose[:, :2, :2].mean(axis=1)
    escala = np.maximum(np.linalg.norm(pose[:, 0, :2] - pose[:, 1, :2], axis=1), 0.05)
    saida_pose = pose.copy()
    saida_pose[:, :, :2] = (pose[:, :, :2] - centro[:, None, :]) / escala[:, None, None]
    saida_pose[:, :, 2] = pose[:, :, 2] * 0.2 / escala[:, None]
    partes = [saida_pose.reshape(-1, 24)]
    for lado in range(2):
        mao = maos[:, lado]
        origem = mao[:, 0]
        tamanho = np.maximum(np.linalg.norm(mao[:, 9, :2] - origem[:, :2], axis=1), 0.02)
        forma = (mao - origem[:, None, :]) / tamanho[:, None, None]
        forma[:, :, 2] *= 0.3
        punho = (origem[:, :2] - centro) / escala[:, None]
        parte = np.concatenate([presentes[:, lado, None].astype(np.float64), punho, forma.reshape(-1, 63)], axis=1)
        parte[~presentes[:, lado]] = 0
        partes.append(parte)
    saida = np.concatenate(partes, axis=1)
    return np.clip(saida, -5, 5).astype(np.float32)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--zip", type=Path, required=True)
    parser.add_argument("--saida", type=Path, required=True)
    parser.add_argument("--fps", type=float, required=True, help="FPS da fonte; a amostra RGB correspondente foi verificada em 30 fps")
    parser.add_argument("--proporcao", type=float, required=True, help="Largura/altura da fonte; amostra RGB correspondente 1920/1080")
    args = parser.parse_args()
    if args.fps <= 0 or args.proporcao <= 0:
        raise ValueError("FPS e proporção devem ser positivos")
    digest = hashlib.file_digest(args.zip.open("rb"), "md5").hexdigest()
    if digest != MD5:
        raise ValueError("O ZIP não corresponde à revisão fixada")
    args.saida.mkdir(parents=True, exist_ok=True)
    amostras, inventario, erros, equivalencias_maos = [], [], [], []
    with zipfile.ZipFile(args.zip) as arquivo_zip:
        nomes = set(arquivo_zip.namelist())
        arquivos = sorted((a for a in arquivo_zip.infolist() if a.filename.startswith(RAMO) and a.filename.endswith(".npy")), key=lambda a: a.filename)
        for item in arquivos:
            partes = item.filename[len(RAMO):].split("/")
            if len(partes) != 3:
                raise ValueError(f"Nome inesperado: {item.filename}")
            pasta, informante, nome = partes
            identificador, classe = pasta.split("_", 1)
            identificador = int(identificador)
            pessoa_match = re.fullmatch(r"INFORMANTE (\d+)", informante)
            stem = Path(nome).stem
            if not pessoa_match or not re.fullmatch(r"IMG_\d+", stem):
                raise ValueError(f"Metadados inesperados: {item.filename}")
            pessoa = int(pessoa_match[1])
            inventario.append(dict(classe_id=identificador, classe=classe, pessoa=pessoa, origem_zip=item.filename))
            if identificador not in IDS_ISOLADOS:
                continue
            if pessoa not in (1, 2, 3, 4, 5):
                raise ValueError(f"Informante não previsto: {item.filename}")
            bruto = arquivo_zip.read(item)
            v = np.load(io.BytesIO(bruto), allow_pickle=False)
            try:
                convertido = converter(v, args.proporcao)
            except ValueError as erro:
                erros.append(dict(arquivo=item.filename, motivo=str(erro)))
                continue
            relativo = f"eqt-{identificador}-informante-{pessoa}-{stem}.npz"
            np.savez_compressed(args.saida / relativo, vetores=convertido, fps=args.fps)
            # Compara apenas um exemplar por classe, sem afetar a inclusão.
            if identificador not in {a["classe_id"] for a in equivalencias_maos}:
                nome_maos = item.filename.replace("Libras-EQT-UECE (Landmarks)", "Libras-EQT-UECE (Hand Landmarks)")
                if nome_maos in nomes:
                    mao_publicada = np.load(io.BytesIO(arquivo_zip.read(nome_maos)), allow_pickle=False)
                    equivalencias_maos.append(dict(classe_id=identificador, igual=bool(np.array_equal(v[:, 192:], mao_publicada)),
                                                    quadros=len(v), shape_full=list(v.shape), shape_maos=list(mao_publicada.shape)))
            amostras.append(dict(arquivo=relativo, cache=relativo, classe=classe, classe_id=identificador,
                                  pessoa=pessoa, divisao="treino" if pessoa <= 3 else "validacao" if pessoa == 4 else "teste",
                                  origem_zip=item.filename, sha256_origem=hashlib.sha256(bruto).hexdigest(),
                                  quadros=len(v), deteccao_maos=float(np.any(convertido[:, [24, 90]] > 0.5, axis=1).mean())))
    classes = sorted({a["classe"] for a in amostras})
    classes_inventario = sorted({a["classe_id"] for a in inventario})
    manifesto = dict(schema=1, origem=ORIGEM, revisao="21398895", licenca="CC-BY-NC-4.0", uso_comercial=False,
                      arquivo_origem=args.zip.name, md5_origem=digest, perfil=PERFIL, entradas=156,
                      fonte_selecao="https://github.com/giolucasd/datasets-islr-libras — datasets-islr-libras 0.1.0, item_mapping.ISOLATED_ITEM_IDS (48 IDs)",
                      ids_selecionados=sorted(IDS_ISOLADOS), classes=classes,
                      contrato=dict(face_origem=[0, 168], pose_origem=[168, 192], maos_origem=[192, 318],
                                    indices_pose=[11, 12, 13, 14, 15, 16],
                                    runtime_228="concat(atributos.slice(4,28), atributos.slice(36,168))",
                                    esquerda_primeiro=True, face_excluida=True, nariz_quadris_excluidos=True,
                                    escala="distância entre ombros, mínimo 0.05; mãos normalizadas pelo punho e ponto 9, mínimo 0.02",
                                    fps=args.fps, proporcao=args.proporcao,
                                    verificacao_rgb="Amostra Cair/INFORMANTE 1/IMG_4868: 1920×1080,30fps,119frames; NPY119frames. Demais FPS/proporções assumidos iguais à captura, não medidos individualmente."),
                      protocolo="IDs locais 1,2,3 no treino; 4 na validação; 5 no teste. Os IDs são locais por item e não garantem identidades físicas globalmente inéditas.",
                      comparacoes_maos=equivalencias_maos, erros=erros,
                      inventario=dict(ramo_utilizado=RAMO, arquivos_full=len(inventario), rotulos_no_pacote=len(classes_inventario),
                                      rotulos_selecionados=len(classes), amostras_selecionadas=len(amostras),
                                      divisoes=dict(Counter(a["divisao"] for a in amostras)),
                                      por_classe=dict(sorted(Counter(a["classe"] for a in amostras).items())),
                                      por_pessoa=dict(Counter(a["pessoa"] for a in amostras))),
                      limites=["Somente o ramo full é usado; o ramo Hand Landmarks não é duplicado no treino.",
                               "Inventário contém sinais e frases; apenas os 48 IDs fixados antes da avaliação foram selecionados.",
                               "A curadoria de 48 itens é do pacote citado e difere dos 55 sinais mencionados no artigo original.",
                               "Este preparo não treina, publica ou habilita reconhecimento no painel.",
                               "A licença não comercial da fonte acompanha a pesquisa e precisa ser respeitada na distribuição e uso."],
                      amostras=amostras)
    (args.saida / "manifesto.json").write_text(json.dumps(manifesto, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"perfil": PERFIL, "classes": len(classes), "amostras": len(amostras), "divisoes": manifesto["inventario"]["divisoes"],
                      "erros": len(erros), "comparacoes_maos": len(equivalencias_maos), "maos_iguais": all(a["igual"] for a in equivalencias_maos)}, ensure_ascii=True), flush=True)
    if erros or not all(a["igual"] for a in equivalencias_maos):
        raise SystemExit("Há inconsistências; examine o manifesto antes de treinar.")


if __name__ == "__main__":
    main()
