# Experimento de palavras em Libras

Foram usados 18 vídeos públicos do [V-Librasil / IBMEC SP](https://huggingface.co/datasets/ibmectech/v-librasil-raw), três pessoas para cada sinal: Ajudar, Desculpa, Não, Obrigado, Por favor e Sim. Os MP4 e os vetores extraídos estão na pasta temporária `libras-treino-palavras` do Windows. Os vídeos não são redistribuídos neste repositório; a página da base consultada não apresenta uma licença clara para redistribuição.

`avaliar_palavras.py` extrai a forma e a posição das duas mãos com MediaPipe, reduz cada vídeo a 24 passos e compara sequências por alinhamento temporal (DTW). Em cada teste, todos os vídeos da pessoa testada são excluídos das referências de treino. Não há mistura de quadros de um mesmo vídeo entre treino e teste.

Resultado: **9/18 (50%)**. A lista completa das previsões está em `resultado-palavras.json`. Este resultado ainda é insuficiente para falar automaticamente pela pessoa. O experimento não foi integrado ao painel. A amostra não mede sinais desconhecidos, transições de uma conversa, variações regionais nem a câmera do usuário.

Para repetir com os mesmos nomes de arquivos (`Sinal_Articulador1.mp4`, etc.), use um ambiente Python com mediapipe, numpy e opencv-python:

```powershell
python treinamento/avaliar_palavras.py --videos "$env:TEMP/libras-treino-palavras" --saida treinamento/resultado-palavras.json
```

O próximo treinamento precisa de mais pessoas, repetições e exemplos de ausência de sinal, além de informação de corpo e rosto para sinais que dependem do lugar de articulação. O conjunto final de teste deve permanecer separado de ajustes do modelo. Este experimento é local e não utiliza o site do Teachable Machine.

## Teste local de capacidade com TCN

Em 12/11/2026, `testar_tcn_local.py` treinou uma TCN causal pequena, com 13.766 parâmetros, usando os vetores reais dos mesmos 18 vídeos. Computador: Intel Core i5-13420H (8 núcleos / 12 processadores lógicos), 15,7 GB de RAM utilizável e Intel UHD integrada. Havia cerca de 2,3 GB de RAM livre antes do teste. O PyTorch CPU foi instalado apenas no ambiente temporário `libras-test-venv`; o teste limitou o processamento a quatro threads.

Configuração fixada antes da execução: três blocos temporais com dilatações 1, 2 e 4, 32 canais, Adam com taxa 0,001 e 120 épocas por rodada. Cada rodada treinou com 12 vídeos de duas pessoas e avaliou seis vídeos da terceira pessoa. As três rodadas duraram aproximadamente 0,30, 0,26 e 0,28 segundo, com pico de memória residente do processo de 285,3 MB. A mediana de 200 inferências após aquecimento foi 0,209 ms; o percentil 95 foi 0,379 ms. Esses números medem apenas a rede sobre movimentos previamente extraídos: excluem instalação/importação, câmera, extração MediaPipe, espera pelo sinal, execução no navegador e síntese de voz.

Resultado exploratório: **9/18 (50%)**. Não houve ajuste posterior de hiperparâmetros com base no resultado. Como os mesmos vídeos já foram usados no experimento DTW, esta comparação não é uma validação final independente. Os detalhes, previsões e hashes dos dados estão em `resultado-tcn-local.json`.

Conclusão: o computador suporta treino e inferência desse modelo pequeno na CPU. Isso não comprova capacidade para treinamento de modelos grandes, funcionamento do Holistic completo em paralelo com o Meet ou tradução de conversas. O modelo não foi habilitado na extensão. A amostra é pequena demais para justificar fala automática confiável.

Para repetir no ambiente de teste existente:

```powershell
& "$env:TEMP/libras-test-venv/Scripts/python.exe" treinamento/testar_tcn_local.py --dados "$env:TEMP/libras-treino-palavras" --saida treinamento/resultado-tcn-local.json
```

Versões usadas: Python 3.12.10 e PyTorch 2.15.0+cpu. O script também precisa de NumPy e dos arquivos `.maos-v1.npz` gerados pelo experimento anterior. Não carrega dados de câmera ou microfone nem contrata serviços externos.

## Novo modelo: mãos, corpo e rosto (0.4.0)

`preparar_holistic.py` baixa as duas primeiras repetições de 20 sinais de oito pessoas do [espelho MINDS-Libras do IBMEC SP](https://huggingface.co/datasets/ibmectech/minds-libras-raw), cuja fonte é o [MINDS-Libras dos autores no Zenodo](https://zenodo.org/records/2667329). São 320 vídeos, mantidos em `%TEMP%/libras-minds-holistic`. A revisão da fonte, URLs, tamanhos e hashes ficam no `manifesto.json` desse diretório; os vídeos não são redistribuídos aqui. O script extrai a aproximadamente 15 quadros/s nos vídeos de 30 fps, preservando a proporção da imagem com largura de 640 px. O Holistic retorna ambas as mãos, corpo e rosto. O vetor final tem 228 atributos normalizados pela largura dos ombros e pelo tamanho da mão/rosto; o JavaScript usa o mesmo contrato.

`treinar_holistic.py` usa as pessoas 01, 02, 05, 06, 08 e 10 para treino, a pessoa 11 para validação e a pessoa 12 para teste. Repousos retirados dos vídeos ficam na mesma divisão da pessoa original. A rede tem 39.861 parâmetros, 48 canais e quatro blocos causais com dilatações 1, 2, 4 e 8. Usa 32 passos por sequência, AdamW, taxa 0,001, 240 épocas, suavização de rótulo 0,05 e perturbação de coordenadas 0,015 apenas no treino. A época 202 foi escolhida pela menor perda de validação. Não houve ajuste de hiperparâmetros após observar o teste.

O treino e avaliação levaram 34,27 s; pico de memória 351,2 MB. A mediana de detecção Holistic foi 39,08 ms por quadro, p95 de 49,27 ms (Python/CPU, excluindo decodificação). Inferência PyTorch mediana: 0,55 ms. A primeira inferência JavaScript no Node levou aproximadamente 8 ms e diferiu da referência PyTorch por no máximo 0,000000214 em probabilidade. Esses números não são latência ponta a ponta do Chrome/Meet.

Resultados em `resultado-holistic.json`: 35/40 acertos nos sinais da pessoa de teste. Com o critério fixo de confiança 0,85 e margem 0,30, foram aceitos 20/40 sinais, todos corretos; nenhum dos 75 recortes de repouso de teste gerou fala. São 50% de cobertura e 100% de precisão **nesta pequena amostra de falas aceitas**, sem garantia fora dela. A comparação não mede melhora percentual sobre o antigo experimento de seis sinais, pois a base mudou.

`preparar_verificacao_fluxo.py` e `tests/verificar_fluxo_tcn.mjs` avaliam a segmentação efetivamente usada no painel, sem ajustar o teste: 20 respostas corretas, 20 abstenções, nenhuma fala errada/repetida nos 40 vídeos conhecidos; nenhuma fala nos 18 vídeos de seis sinais fora do vocabulário do antigo experimento. É acrescentado um segundo neutro ao final de cada vídeo. Veja `resultado-fluxo-tcn.json`. Isto não substitui testes ao vivo ou um conjunto maior de sinais desconhecidos e gestos cotidianos.

Após essa verificação, o candidato foi copiado para `modelos/sinais/tcn.json` e habilitado como **experimental** em `modelos/sinais/estado.json`. O campo `fala_automatica_habilitada: false` no relatório bruto registra o estado no momento em que o treino terminou, antes da verificação do fluxo; o estado de publicação é o arquivo `estado.json`. Os checkpoints PyTorch e dados de comparação permanecem em `%TEMP%/libras-tcn-holistic`. Não foi implementado filtro lexical de palavrões. A ausência de um sinal no vocabulário não implica censura.

Comandos para repetir (dependências: mediapipe, opencv-python, numpy e torch):

```powershell
& "$env:TEMP/libras-test-venv/Scripts/python.exe" treinamento/preparar_holistic.py --pasta "$env:TEMP/libras-minds-holistic"
& "$env:TEMP/libras-test-venv/Scripts/python.exe" treinamento/treinar_holistic.py --pasta "$env:TEMP/libras-minds-holistic" --saida "$env:TEMP/libras-tcn-holistic"
node tests/verificar_paridade_tcn.mjs "$env:TEMP/libras-tcn-holistic"
& "$env:TEMP/libras-test-venv/Scripts/python.exe" treinamento/preparar_verificacao_fluxo.py --minds "$env:TEMP/libras-minds-holistic" --outros "$env:TEMP/libras-treino-palavras" --saida "$env:TEMP/libras-tcn-holistic/fluxo.json"
node tests/verificar_fluxo_tcn.mjs "$env:TEMP/libras-tcn-holistic"
```

O script não publica o candidato automaticamente após um novo treino. O conjunto de teste não deve ser usado para ajustes nas próximas rodadas; será necessário reservar novas pessoas para uma avaliação final independente.

Modelos externos utilizados:

- [MediaPipe Holistic](https://storage.googleapis.com/mediapipe-models/holistic_landmarker/holistic_landmarker/float16/latest/holistic_landmarker.task), SHA-256 `e2dab61191e2dcd0a15f943d8e3ed1dce13c82dfa597b9dd39f562975a50c3f8`.
- [Silero VAD v6.2](https://github.com/snakers4/silero-vad/tree/v6.2), SHA-256 `1a153a22f4509e292a94e67d6f9b85e8deb25b4988682b7e174c65279d8788e3`.

Os testes reais de áudio estão em `resultado-audio.json` e `resultado-audio-wasm.json`: Silero e Whisper reconhecem duas frases sintetizadas e não disparam transcrição nos dez segundos de ruído artificial usados no teste. Não há teste de identificação da voz de uma pessoa específica.

## Tentativa de acrescentar Oi (0.4.1, reprovada)

`preparar_oi.py` acrescenta três vídeos rotulados de [Oi no V-Librasil](https://libras.cin.ufpe.br/sign/798), obtidos do espelho IBMEC na revisão `d2d3e5e95574c4e0c5c20a7d82a24d52063e12d5`. Os hashes estão no script e no relatório. Pessoa 1: treino; 2: validação; 3: teste. Os 320 vídeos MINDS mantêm a divisão anterior. Foi usado o mesmo protocolo de treino TCN, com uma classe adicional, sem relaxar confiança/margem. A época 154 foi escolhida pela perda de validação.

Oi foi aceito na validação (confiança 0,8934), mas a pessoa de teste recebeu a hipótese Amarelo com confiança 0,3503, recusada. Na simulação com 41 vídeos conhecidos houve 19 respostas corretas e 22 recusas; nos 18 vídeos fora do vocabulário houve uma fala indevida. O candidato foi **reprovado**, está apenas na pasta temporária e não é carregado pelo painel. Relatório completo: `resultado-oi-reprovado.json`. Os testes MINDS e os 18 negativos já haviam sido examinados em rodadas anteriores; são regressão, não nova validação independente.

Também foi experimentado recortar o início/fim de cada segmento na inferência e incluir dois quadros anteriores ao movimento. O modelo original passou de 20 respostas corretas/nenhuma errada para 19 corretas/uma errada. A mudança foi revertida. O relatório `resultado-fluxo-tcn-0401.json` está marcado como não adotado. A implementação final 0.4.1 reproduziu os 20 acertos/20 recusas/zero falas indevidas originais.

Para reproduzir o candidato sem habilitá-lo:

```powershell
python treinamento/preparar_oi.py --minds "$env:TEMP/libras-minds-holistic" --oi "$env:TEMP/libras-oi" --saida "$env:TEMP/libras-tcn-oi"
python treinamento/treinar_holistic.py --pasta "$env:TEMP/libras-tcn-oi" --saida "$env:TEMP/libras-tcn-oi"
python treinamento/preparar_verificacao_fluxo.py --minds "$env:TEMP/libras-tcn-oi" --outros "$env:TEMP/libras-treino-palavras" --saida "$env:TEMP/libras-tcn-oi/fluxo.json"
node tests/verificar_fluxo_tcn.mjs "$env:TEMP/libras-tcn-oi"
```

Para áudio real sintetizado e inferência inteiramente WASM, veja `tests/testar_sintese_local.mjs`, `tests/testar_transcricao_wasm.mjs` e seus relatórios. Os testes rodam bibliotecas reais no Node, sem automatizar Chrome, câmera, alto-falantes ou Meet. A comparação da fila/serviço rápido usa APIs simuladas, explicitamente separadas desses testes de modelos.

## Dicionário pessoal (0.5.0)

`preparar_teste_dicionario.py` usa as duas repetições já disponíveis e baixa as repetições 3–5 de seis classes: Acontecer, Amarelo, Banheiro, Conhecer, Maca e Vontade. Os 14 outros sinais da mesma pessoa, nas repetições 1–2, servem como exemplos fora do cadastro. Os vídeos permanecem em TEMP, com a revisão da fonte fixada e os hashes em `amostras.json`. Nomes de classes simulam rótulos pessoais; o ensaio não atribui sinais a pessoas reais.

`tests/testar_dicionario_videos.mjs` reproduz a segmentação do painel e usa repetições 1–3 no cadastro, 4 na confirmação e 5 no teste. A comparação DTW usa posição e forma das duas mãos, corpo e rosto com pesos menores, 32 passos, faixa de alinhamento 8, média das duas referências mais próximas e recusa de ambiguidade. O limiar adaptado ao cadastro tem teto 0,22 e piso 0,06. Gravações muito diferentes e confirmações distantes são recusadas. Não há afrouxamento automático para fazer um cadastro passar.

O primeiro ensaio com a pessoa 01 tinha teto 0,45 e produziu sete falsos positivos em 28 negativos, apesar de acertar os três cadastros aceitos. Foi reprovado; veja `resultado-dicionario-exploratorio.json`. Após tornar a regra mais conservadora, a pessoa 01 serviu apenas como desenvolvimento/regressão: três cadastros aceitos, dois acertos e uma recusa no teste; zero falas nos 28 negativos. Essa repetição não é uma avaliação independente.

As regras foram então fixadas antes de executar o ensaio com a pessoa 02. Cinco dos seis cadastros passaram pela confirmação. Na quinta repetição houve quatro acertos e uma recusa; zero nomes errados. Nos 28 negativos, zero correspondências aceitas; um vídeo não produziu segmento válido. `resultado-dicionario-pessoal.json` resume esse ensaio final e `resultado-dicionario-pessoa02.json` preserva os casos. É uma amostra pequena e controlada, sem validação na webcam do usuário ou em conversa contínua.

Comandos de reprodução, usando o ambiente Python já preparado:

```powershell
python treinamento/preparar_teste_dicionario.py --minds "$env:TEMP/libras-minds-holistic" --saida "$env:TEMP/libras-dicionario-pessoa02" --pessoa 2
node tests/testar_dicionario_videos.mjs "$env:TEMP/libras-dicionario-pessoa02/amostras.json" "$env:TEMP/libras-dicionario-pessoa02/resultado.json"
node --test tests/*.test.mjs
node tests/testar_armazenamento.mjs "$env:TEMP/libras-asr-verificacao"
```

O último comando precisa de `fake-indexeddb@6.2.8` em `node_modules` na pasta informada, instalado apenas para teste. A extensão não depende desse pacote. O armazenamento em produção usa IndexedDB do próprio Chrome. Testes de interface usam objetos simulados, separados do ensaio com vetores reais e da síntese WASM real.
