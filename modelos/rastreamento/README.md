# Rastreamento de mãos, corpo e rosto

Estes são **pacotes Holistic personalizados**, montados com pesos publicados pelo Google. Não são versões oficiais chamadas Holistic Full ou Holistic Heavy. O componente de pose Lite do pacote original foi substituído pelo **BlazePose GHUM Full** ou **Heavy**. Mãos, rosto, detector de pessoa e refinamento do recorte continuam iguais aos do Holistic original.

| Opção no painel | Pose corporal | Arquivo | Tamanho aproximado |
| --- | --- | --- | --- |
| Recomendada · Lite | Pose do Holistic original | `../holistic_landmarker.task` | 13,7 MB |
| Full · experimental | BlazePose Full | `holistic_full.task` | 17,3 MB |
| Heavy · experimental | BlazePose Heavy | `holistic_heavy.task` | 38,6 MB |

A escolha fica em **Câmera, microfone e saída de som → Leitura da câmera**. O componente fecha a instância anterior ao trocar de modelo. Se o pacote escolhido não carregar, usa Lite e avisa. A execução continua local; os vídeos da câmera não vão para Qwen ou outro serviço.

No navegador, a criação tenta o delegate **GPU** do MediaPipe; se essa etapa ou a primeira inferência falhar, tenta **CPU**. O painel informa qual caminho foi criado. A primeira inferência de verificação não gera legenda nem cadastro. Os testes de seleção e recuperação são simulados; a aceleração gráfica e a latência real no Chrome ainda precisam de validação no computador do usuário. As medições Python abaixo usam CPU.

O [modelo corporal do Google](https://storage.googleapis.com/mediapipe-assets/Model%20Card%20BlazePose%20GHUM%203D.pdf) descreve o equilíbrio entre custo e precisão das variantes. Essa avaliação original não é uma avaliação de Libras. Um corpo mais bem estimado pode ajudar o recorte das mãos, mas o modelo dos dedos não foi substituído por outro melhor. Não se promete melhora de tradução por aumentar o tamanho do rastreador.

O contrato de saída continua sendo o do [MediaPipe Tasks Holistic](https://developers.google.com/edge/mediapipe/solutions/vision/holistic_landmarker), com os mesmos 228 atributos de entrada da TCN. O vocabulário de Libras não aumenta ao trocar o rastreador. Cadastros pessoais devem ser conferidos novamente depois da troca, porque as coordenadas podem mudar.

## Origem, licença e reprodução

As URLs com versão `1`, tamanhos e SHA-256 estão em [manifesto.json](manifesto.json). O script confere o SHA-256 do pacote base e mantém seus outros componentes. Licença dos modelos originais: [Apache-2.0](LICENSE-Apache-2.0). Alteração feita pelo projeto: substituir somente `pose_landmarks_detector.tflite` dentro do pacote.

Para reproduzir com Python padrão:

```powershell
python treinamento/preparar_rastreadores.py
```

Os pacotes originais de pose são baixados em `%TEMP%/libras-modelos-rastreamento`. A extensão usa somente os pacotes finais em `modelos/rastreamento/`; não precisa de Python em execução.

## Avaliação

**Lite permanece como padrão.** Nos 40 vídeos conhecidos, Lite gerou 20 respostas corretas e nenhuma errada; Full gerou 19 corretas e nenhuma errada; Heavy gerou 21 corretas e uma errada. Os restantes ficaram sem fala. Nos quatro exemplos de Oi, Lite aceitou quatro e Full/Heavy aceitaram três. Nos 18 vídeos fora do vocabulário, nenhum dos três gerou fala.

| Modelo | Mediana por quadro em Python CPU | P95 por quadro | Fração média de quadros com alguma mão |
| --- | --- | --- | --- |
| Lite | 75,59 ms | 100,46 ms | 98,27% |
| Full | 82,09 ms | 120,63 ms | 95,81% |
| Heavy | 131,09 ms | 214,01 ms | 94,38% |

São 3.517 quadros por modelo no ensaio geral. Detectar mais mãos não prova que suas coordenadas estejam corretas. Os vídeos são processados integralmente, mesmo quando a execução fica mais lenta que a duração original; uma câmera ao vivo pode pular quadros. Os modelos maiores **não demonstraram melhora de Libras neste ensaio** e ficam disponíveis para experimentação, sem promoção automática. Relatório completo: [resultado-rastreamento.json](../../treinamento/resultado-rastreamento.json).

O script [comparar_rastreadores.py](../../treinamento/comparar_rastreadores.py) executa os três rastreadores em 40 vídeos conhecidos do MINDS-Libras e 18 vídeos fora do vocabulário já usados em ensaios anteriores. O comparador de Oi acrescenta os quatro exemplos. O fluxo JavaScript de segmentação, saudação e TCN é aplicado sem reentreinar nem mudar limites. Os vídeos são processados em Python/CPU; isso não é teste no Chrome, na webcam do usuário ou no Meet, nem uma medição da precisão das coordenadas contra anotações humanas.

```powershell
& "$env:TEMP/libras-test-venv/Scripts/python.exe" treinamento/comparar_rastreadores.py
& "$env:TEMP/libras-test-venv/Scripts/python.exe" treinamento/comparar_oi_rastreadores.py
node treinamento/avaliar_rastreadores.mjs
```

As ferramentas de avaliação exigem as dependências do [ambiente de treinamento](../../treinamento/README.md). As medições ficam em `%TEMP%/libras-comparacao-rastreadores`; o resumo revisado acompanha `treinamento/resultado-rastreamento.json`.
