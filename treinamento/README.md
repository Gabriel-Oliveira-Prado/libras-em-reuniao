# Experimento de palavras em Libras

## Candidato EQT-Libras de 48 classes · 0.8.1

Foi preparado e treinado um candidato separado com 1.439 amostras brasileiras, 48 classes e perfil de 156 atributos de mãos e braços. **Reprovado e sem integração à câmera:** a cobertura aceita foi baixa e houve uma fala indevida em 62 negativos externos. O modelo anterior continua distribuído; a câmera não ganhou 48 classes funcionais.

[Protocolo, conversão, licença CC BY-NC 4.0, resultados e reprodução](EQT-LIBRAS.md) · [Relatório completo](resultado-eqt-081.json). A divisão usa informantes locais por item e não comprova pessoas físicas inteiramente inéditas no teste.


<a id="sinais-em-sequencia-071"></a>

## Sinais em sequência · 0.7.1

`FluxoSequencialDeSinais` consulta somente Oi e o dicionário pessoal durante uma pausa visível de pelo menos 220 ms, com duração total mínima de 350 ms. Exige duas leituras iguais, separadas por pelo menos 100 ms e com um novo quadro processado. Ao confirmar, consome o trecho e espera novo movimento sustentado por 60 ms antes de começar o seguinte. Uma mão nova visível também permite esse início; mera ausência não conta como movimento. Há até 160 ms de quadros anteriores para preservar o começo do próximo sinal.

A pausa não aumenta o peso da pose final: a consulta termina no último quadro de movimento. A sequência completa permanece disponível se a leitura curta for incerta ou ambígua. A TCN geral só recebe segmentos completos; o fluxo do cadastro mantém o segmentador original. Não foram baixados limites de confiança nem adicionados sinais nesta rodada.

### Regressão e reprodução

`avaliar_encadeamento.mjs` exige os caches locais usados nos experimentos anteriores: `libras-oi/fluxo-treino-todos.json`, `libras-oi/ines-camera.json`, `libras-oi/acenar.json` e `libras-dicionario-pessoa02/amostras.json`. O relatório registra seus hashes; vídeos e caches não acompanham o repositório.

```powershell
node treinamento/avaliar_encadeamento.mjs "C:/Users/Gabri/AppData/Local/Temp"
node --test tests/encadeamento-sinais.test.mjs tests/voz.test.mjs tests/sinais.test.mjs
```

O ensaio percorre o fluxo incremental real de segmentação, consulta curta, confirmação e rearme, sem executar a TCN geral. Resultado: Oi 4/4, zero falas em 341 negativos; cinco cadastros aceitos, quatro acertos e uma recusa na quinta repetição, zero nomes errados e zero falas em 28 negativos de outras classes.

As quatro montagens passaram: Oi → Gabriel, Gabriel → Gabriel e as duas poses mantidas por 3,2 s sem repetição. O recorte é independente da resposta do reconhecedor: primeiro até último quadro ativo por `sinalEmCurso`, preservando o intervalo integral entre eles. Os sinais são unidos por uma pausa artificial de 500 ms com a última pose visível; a espera final é 3,2 s. “Gabriel” é apenas alias de teste para um cadastro de Amarelo da base MINDS, não é o sinal-nome do usuário. Oi vem do INES e o cadastro de outra pessoa; a repetição 4 já foi usada como confirmação. Não é avaliação independente nem gravação natural da frase.

Os testes automatizados cobrem preservação do início, repetição com execuções distintas, pose mantida, troca de mão, mão fugaz, ambiguidade, reinício e fila PCM em ordem sem sobreposição/cancelamento. DOM, saída de áudio e relógios desses testes são simulados. O relatório `resultado-encadeamento.json` não verifica webcam, cadastro privado, alto-falantes, Chrome ou Meet.


<a id="captura-transcricao-e-revisao-local-070"></a>

## Captura, transcrição e revisão local · 0.7.0

### Segmentação e regressão de movimentos

`painel/segmentacao-sinais.mjs` considera deslocamento dos punhos e forma dos dedos, aceitando uma ou duas mãos e movimento abaixo da região antes usada como início obrigatório. Mínimo de quatro quadros/160 ms, máximo de dez segundos. Ao ultrapassar o máximo, descarta o movimento e espera repouso antes de aceitar outro, evitando classificar sua cauda. A graça de perda parcial é de até 800 ms, sem inventar pontos ausentes; o fim por ausência completa continua usando a pausa normal. A posição das mãos em relação ao corpo não é transladada para esconder diferenças de significado.

`avaliar_robustez.mjs` compara o fluxo distribuído com o código do commit `b2c848bb4261e81e1bbc13284c1050889e96570b`. Reusa os 40 vídeos conhecidos e 18 desconhecidos em `%TEMP%/libras-tcn-holistic/fluxo.json`: velocidades 0,65×, 1× e 1,7×, combinadas com alturas 0, −0,1 e +0,1 largura dos ombros. São nove cenários; a interpolação temporal mantém a presença discreta das mãos. A TCN e os critérios de confiança/margem são os mesmos nos dois fluxos.

Em `resultado-robustez-070.json`, original e rápido dão 20 acertos e 20 recusas em cada altura, sem palavras erradas/repetidas. No lento, o atual dá 19/20/21 acertos contra 18/18/19 anteriores. As cinco falas erradas/repetidas somadas dos três casos lentos passaram a zero. Em 18 × 9 = 162 variantes desconhecidas, nenhuma fala. Houve mudança de decisões individuais, incluindo uma recusa de Amarelo antes aceito; a melhora agregada não significa melhora em todo vídeo.

**Limite:** os vídeos já foram examinados no desenvolvimento e as variações são sintéticas, sobre landmarks previamente extraídos. O ensaio não mede novos pixels, outras pessoas, precisão do MediaPipe na webcam, conversa livre, Chrome ou Meet. Para executar novamente, prepare os caches descritos nas seções históricas e mantenha o commit de referência disponível:

```powershell
node treinamento/avaliar_robustez.mjs
node --test tests/*.test.mjs
```

O dicionário pessoal da pessoa 02 foi reavaliado: cinco cadastros confirmados, quatro acertos e uma recusa na repetição de teste, zero nomes errados e zero falas nos 28 negativos. Trata-se da mesma amostra de regressão, não outra pessoa independente.

### Novo treino robusto: candidato reprovado

`treinar_holistic.py --robusto` acrescenta variações de ritmo e pequenas diferenças de execução **somente ao conjunto de treino**. Mantém as divisões por pessoa: 01/02/05/06/08/10 para treino, 11 para validação/escolha de época, 12 para teste. Não foi criado vocabulário novo.

A execução levou 89,76 s; a época 231 foi escolhida pela validação. No teste bruto, 33/40 acertos; foram aceitas 23 falas, 22 corretas e uma errada. **Reprovado: não foi copiado para `modelos/sinais/tcn.json`.** O modelo anterior continua distribuído. O teste da pessoa 12 já era conhecido de experimentos anteriores; uma próxima avaliação final precisa reservar pessoas novas.

```powershell
& "$env:TEMP/libras-test-venv/Scripts/python.exe" treinamento/treinar_holistic.py --pasta "$env:TEMP/libras-minds-holistic" --saida "$env:TEMP/libras-tcn-robusto" --robusto
```

O comando grava candidato, checkpoint, paridade e relatório na pasta de saída; não publica o modelo. O registro desta execução está em `resultado-treino-robusto.json`.

### Comparação de transcrição e serviço acelerado

`gerar_frases_transcricao.ps1` sintetiza oito frases fixadas previamente com Microsoft Maria Desktop e Microsoft Daniel: “Olá, tudo bem?”, “Como você está?”, “Onde é?”, “Qual seu nome?”, “Quem é você?”, “Quero te conhecer.” e duas frases maiores. Exige essas vozes do Windows e Windows PowerShell com `System.Speech`; não grava áudio humano.

`comparar_transcricao.mjs` executa o bundle WASM da extensão em Node, uma thread, com Whisper q8. Os relatórios `resultado-transcricao-070.json` e `resultado-transcricao-small-070.json` registram Tiny/Base/Small: 13/16, 14/16 e 14/16 frases sem diferença de palavras; WER de 7,35%, 5,88% e 2,94%. A comparação ignora acentos, pontuação e caixa. Small acrescentou “o” a “Qual seu nome?” nas duas vozes; os resultados não demonstram transcrição perfeita.

```powershell
powershell.exe -NoProfile -File treinamento/gerar_frases_transcricao.ps1
node treinamento/comparar_transcricao.mjs "$env:TEMP/libras-asr-070" treinamento/resultado-transcricao-070.json whisper-tiny,whisper-base
.\scripts\instalar-transcricao.ps1 -Modelo small
node treinamento/comparar_transcricao.mjs "$env:TEMP/libras-asr-070" treinamento/resultado-transcricao-small-070.json whisper-small
```

No ensaio separado `resultado-asr-nativo.json`, Transformers.js 3.8.1/ONNX Runtime Node 1.21.0, CPU e quatro threads executaram três desses WAV com Small: 3/3 preservaram as palavras, mediana de 1,141 s e carregamento de 2,152 s; memória residente final de aproximadamente 1,43 GiB. Nos mesmos três arquivos, o relatório WASM tem mediana de 11,791 s. Isso mede inferência de processo independente, sem servidor, captura/VAD, Chrome, avatar ou concorrência com Meet.

A opção **Acelerado neste computador** usa o serviço em `scripts/transcricao-local.mjs`, restrito a `127.0.0.1:18271` e ao `Origin` exato da extensão. Instalação, inicialização e localização dos logs: [Transcrição local](../modelos/TRANSCRICAO.md). Acesso desse serviço pelo Chrome ainda precisa de teste. A captura usa pausas de 480 ms, aceita 160 ms após seis segundos e limita fala contínua a 12 s; esse limite ainda pode cortar uma palavra.

O serviço HTTP real também foi testado pelo adaptador da extensão no Node: três respostas com as mesmas palavras, inferências de 2,032/1,694/2,068 s e totais HTTP de 2,047/1,703/2,082 s. O carregamento levou 3,416 s; uma origem diferente recebeu HTTP 403. Esse resultado separado do benchmark direto está em `resultado-servico-transcricao.json`; não verifica Chrome, microfone, AudioWorklet real, avatar ou Meet. O serviço instalado usa SDK 3.8.1 em LOCALAPPDATA, com logs que não registram texto ou áudio. O comando `.\scripts\parar-transcricao-local.ps1` confere PID e linha de comando antes de encerrá-lo.

### Qwen manual integrado

`testar_auxiliar_local.mjs` usa o mesmo adaptador de revisão da extensão, chamando Ollama/Qwen local pelo Node. Duas sugestões levaram 13,25 s e 5,67 s e mantiveram as palavras, inclusive nome, negação, palavrão e número. `resultado-auxiliar-local.json` guarda os resultados. O teste descarrega o modelo da RAM ao terminar.

```powershell
node treinamento/testar_auxiliar_local.mjs
```

Instale e configure Ollama/Qwen pelo [README principal](../README.md#instalar-e-testar-ollama-com-qwen-no-windows). A origem exata foi configurada neste computador em OLLAMA_ORIGINS no escopo User, com reinício do Ollama ocioso; /api/tags retornou HTTP 200 em uma chamada com essa origem. Isso não comprova a chamada feita pelo Chrome. O auxiliar recebe só texto solicitado e devolve sugestão separada de pontuação/acentos/caixa, com validação da sequência de palavras e aplicação manual. Não recebe vídeo/áudio e não muda automaticamente o avatar ou a voz.

Os ensaios desta seção são de desenvolvimento/regressão. Não substituem avaliação linguística por pessoas fluentes em Libras nem testes com voz humana, webcam, Chrome e reunião real.


## Comparar modelos de rastreamento e testar Qwen

A versão local 0.6.1 acrescenta pacotes Holistic personalizados com pose BlazePose Full/Heavy, preservando os modelos de mãos e rosto. Veja [composição, licença e limites](../modelos/rastreamento/README.md). Não são lançamentos oficiais de Holistic Full/Heavy. O vocabulário de Libras não aumenta ao trocar a pose.

```powershell
python treinamento/preparar_rastreadores.py
& "$env:TEMP/libras-test-venv/Scripts/python.exe" treinamento/comparar_rastreadores.py
& "$env:TEMP/libras-test-venv/Scripts/python.exe" treinamento/comparar_oi_rastreadores.py
node treinamento/avaliar_rastreadores.mjs
```

Os dois comparadores usam o ambiente com MediaPipe, OpenCV e NumPy já descrito neste arquivo. Vídeos e vetores ficam em `%TEMP%/libras-comparacao-rastreadores`; o resumo fica em `resultado-rastreamento.json`. Os 40 exemplos conhecidos, 18 fora do vocabulário e quatro exemplos de Oi já foram examinados anteriormente. O ensaio não é validação independente nem teste de Chrome, áudio ou Meet. A medição Python usa CPU; o navegador tenta GPU e retorna a CPU se a criação falhar.

Com o Ollama aberto e o Qwen instalado conforme o [README principal](../README.md#instalar-e-testar-ollama-com-qwen-no-windows), é possível testar a API local:

```powershell
python treinamento/testar_ollama.py
```

Esse teste usa somente a biblioteca padrão do Python e duas mensagens de texto de exemplo. Registra versão, digest, memória e tempos em `resultado-ollama-local.json`, depois descarrega o modelo da RAM. Não envia câmera, microfone ou reunião. Esse teste histórico não integra Qwen ao painel; o adaptador manual da 0.7.0 é descrito na seção inicial. Não é teste de tradução de Libras.

## Experimento inicial de seis palavras

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

## Oi e vozes neurais (0.6.0)

`avaliar_saudacao.mjs` extrai 42 atributos de forma dos dedos e deslocamento dos vetores MediaPipe já mantidos em `%TEMP%/libras-oi/fluxo-treino-todos.json`. `treinar_saudacao.py` treina um classificador binário linear: Oi da pessoa 1 do V-Librasil no treino; pessoa 2 e negativos MINDS da divisão de validação para escolher a época. A pessoa 3 já havia sido examinada no candidato TCN anterior e serve como regressão. A representação considera a mão que aparece por mais tempo na região ativa. Há regras adicionais de proximidade polegar/indicador, curvatura e extensão do mínimo, mais deslocamento; não basta manter uma pose.

As regras geométricas e o limiar foram ajustados depois de examinar os exemplos de desenvolvimento, incluindo o vídeo público do INES referenciado no [Goiás Libras](https://goiaslibras.educacao.go.gov.br/sinal/oi). Esse vídeo tem 240×176; sua extração final corrige a proporção como `extrairAtributos` no painel. Não foi tratado como um teste independente depois desses ajustes. O candidato anterior, sem regras, aceitava dois negativos no limiar 0,7. A versão com regras aceita os quatro Oi do ensaio e nenhum dos 341 outros vídeos; 338 negativos geraram segmentos. São poucos positivos e os negativos incluem material de treino: **não estima acurácia de uso real**. O aceno aberto não é rotulado como Oi.

`tests/testar_saudacao_videos.mjs` usa os caches de desenvolvimento, a segmentação e o classificador distribuídos. `tests/testar_oi_integrado.mjs` usa os landmarks reais do INES com a proporção original, passando por `montarSinais`, `montarVoz` e o cliente real das falas PCM. Produziu Oi duas vezes, uma por voz, com DOM e Web Audio simulados. Isso não é captura de câmera nem reprodução no Chrome. Vídeos e caches continuam em TEMP; `resultado-saudacao-oi.json` guarda somente fontes, protocolo e resultados por arquivo.

As vozes são modelos prontos do Kokoro v1.0, sem treinamento de novas vozes nesta atualização. O eSpeak prepara fonemas, a rede produz PCM e o cliente reproduz no Web Audio. `gerar_falas_basicas.mjs` prepara 25 falas por voz usando ONNX CPU do ambiente temporário. Usa os mesmos pesos e fonemização distribuídos; `--forcar` refaz os arquivos. A inferência da extensão usa o ONNX WASM já incluído, com uma thread. Os dois caminhos foram executados; não dependem de Python na instalação final.

O Kokoro foi instável com Oi isolado. O tratamento gera contexto e recorta só a primeira palavra na pausa de 40 ms, recusando um recorte com mais de 0,8 s. O Whisper auxiliar transcreveu Oi e Gabriel nas duas vozes após esse tratamento. A frase maior teve erros na voz feminina; avaliação humana de naturalidade e pronúncia permanece necessária. `resultado-pronuncia-neural.json` preserva os resultados, incluindo os erros.

```powershell
node treinamento/gerar_falas_basicas.mjs
node tests/testar_vozes_neurais.mjs --somente-oi
node tests/testar_pronuncia_neural.mjs
node tests/testar_saudacao_videos.mjs
node tests/testar_oi_integrado.mjs
```

Os três últimos testes exigem os respectivos modelos/caches locais descritos acima; os scripts de desenvolvimento que usam ONNX nativo procuram as dependências em `%TEMP%/libras-asr-verificacao`. O relatório de voz inicial documenta o caminho anterior ao recorte; a saudação atual é verificada separadamente em `resultado-oi-voz-wasm.json`. Organização e inclusão de perfis: `vozes/README.md`.
