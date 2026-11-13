"""Verifica um Qwen instalado no Ollama local e mede respostas em português.

Não conecta o modelo à extensão e não avalia tradução de Libras.
Somente localhost; nenhum áudio, vídeo ou dado de reunião é enviado.
"""
import argparse
import datetime
import json
import time
import urllib.request
from pathlib import Path

API = "http://127.0.0.1:11434"


def consultar(caminho, pedido=None):
    corpo = None if pedido is None else json.dumps(pedido).encode("utf-8")
    req = urllib.request.Request(API + caminho, data=corpo, headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=180) as resposta:
        return json.load(resposta)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--modelo", default="qwen3.5:4b-q4_K_M")
    parser.add_argument("--saida", type=Path, default=Path(__file__).with_name("resultado-ollama-local.json"))
    args = parser.parse_args()
    versao = consultar("/api/version")["version"]
    instalado = next((m for m in consultar("/api/tags")["models"] if m["name"] == args.modelo), None)
    if not instalado:
        raise ValueError(f"Modelo ausente; execute: ollama pull {args.modelo}")
    info = consultar("/api/show", {"model": args.modelo})
    resultados = []
    try:
        for nome, texto in (("primeira_resposta", "Responda apenas: Teste local concluído."),
                            ("modelo_carregado", "Repita exatamente esta mensagem, sem acrescentar nada: Oi, Gabriel! Tudo bem?")):
            pedido = {"model": args.modelo, "messages": [{"role": "user", "content": texto}],
                      "think": False, "stream": True, "keep_alive": "2m",
                      "options": {"num_ctx": 2048, "num_predict": 64, "num_thread": 4, "temperature": 0}}
            req = urllib.request.Request(API + "/api/chat", data=json.dumps(pedido).encode("utf-8"), headers={"Content-Type": "application/json"})
            inicio, primeiro = time.perf_counter(), None
            conteudo, final = [], None
            with urllib.request.urlopen(req, timeout=180) as resposta:
                for linha in resposta:
                    evento = json.loads(linha)
                    if "error" in evento:
                        raise RuntimeError(evento["error"])
                    trecho = evento.get("message", {}).get("content", "")
                    if trecho:
                        primeiro = primeiro if primeiro is not None else time.perf_counter() - inicio
                        conteudo.append(trecho)
                    if evento.get("done"):
                        final = evento
            if not final or not conteudo:
                raise ValueError("O modelo não concluiu uma resposta de texto.")
            item = {"teste": nome, "texto": "".join(conteudo), "primeiro_texto_s": round(primeiro, 3),
                    "total_s": round(time.perf_counter() - inicio, 3),
                    "carregamento_s": round(final.get("load_duration", 0) / 1e9, 3),
                    "tokens_gerados": final.get("eval_count"),
                    "tokens_por_s": round(final.get("eval_count", 0) / (final.get("eval_duration", 1) / 1e9), 2)}
            resultados.append(item)
            print(json.dumps(item, ensure_ascii=False), flush=True)
        carregados = consultar("/api/ps").get("models", [])
        relatorio = {"data_utc": datetime.datetime.now(datetime.timezone.utc).isoformat(),
                     "ollama": versao, "modelo": args.modelo, "bytes_download": instalado["size"], "digest": instalado["digest"],
                     "capacidades_declaradas": info.get("capabilities", []),
                     "configuracao": {"contexto": 2048, "threads": 4, "pensamento": False},
                     "modelos_carregados": [{k: m.get(k) for k in ("name", "size", "size_vram", "context_length")} for m in carregados],
                     "resultados": resultados,
                     "limites": "Teste de texto na API local, fora do navegador e sem Meet. Não mede Libras, webcam, concorrência com os modelos da extensão ou qualidade de tradução. A extensão ainda não usa Qwen."}
        args.saida.write_text(json.dumps(relatorio, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    finally:
        # Deixa o aplicativo aberto, liberando a RAM usada neste ensaio.
        consultar("/api/generate", {"model": args.modelo, "keep_alive": 0})


if __name__ == "__main__":
    main()
