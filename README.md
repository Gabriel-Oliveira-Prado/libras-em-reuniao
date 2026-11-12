# Libras em Reunião

Protótipo de extensão para comunicação em reuniões online. A câmera reconhece 21 formas de mão do alfabeto manual da Libras, e a extensão lê em voz alta o texto composto. No outro sentido, o Whisper transcreve trechos de áudio em português no dispositivo e o VLibras apresenta a tradução com um avatar.

## Testar no Chrome

1. No Google Chrome atualizado, abra `chrome://extensions` e ative o **Modo do desenvolvedor**.
2. Clique em **Carregar sem compactação** e selecione a pasta `libras-em-reuniao`, que contém o `manifest.json`. Se ela já estiver carregada, use **Recarregar**.
3. Abra a extensão **Libras em Reunião**. Use **Abrir em aba** se precisar dar permissão à câmera ou ao microfone, compartilhar áudio da reunião ou apresentar a voz gerada.

### Libras para voz

1. Clique em **Ligar câmera**. Faça uma letra com uma mão, em boa iluminação, e aguarde a confirmação. Para repetir uma letra, retire a mão do quadro e reapresente o sinal.
2. Use **Espaço** ou edite o texto para compor a frase. Clique em **Falar em português** para ouvi-la.
3. Para os participantes do Meet ouvirem, abra o tradutor em uma aba. No Meet, use **Apresentar agora → Uma guia**, selecione a aba do tradutor e marque **Compartilhar áudio da guia**. Depois use **Falar em português** no tradutor.

A leitura da webcam é soletração, letra a letra. A lista de letras aparece no painel. Tradução de frases sinalizadas em Libras e cadastro de sinais personalizados são etapas futuras. Se a câmera estiver ocupada pelo Meet, teste primeiro com a câmera da reunião desligada.

### Voz para Libras

1. No modo **Voz para Libras**, use **Usar microfone** para fala no ambiente ou **Ouvir guia** para áudio remoto. Ao ouvir o Meet, selecione a guia da reunião no seletor do Chrome e marque **Compartilhar áudio da guia**.
2. Clique em **Transcrever trecho** ou aguarde o limite de 20 segundos. Revise a transcrição e clique em **Mostrar em Libras**. Também é possível digitar uma frase. O primeiro carregamento do avatar pode levar alguns segundos.

A webcam, a transcrição e a síntese de voz são processadas no dispositivo. O texto é enviado ao VLibras ao clicar em **Mostrar em Libras**, o que exige conexão. A versão atual alterna entre os dois modos e reproduz a voz pelo áudio compartilhado da guia.

## Estrutura

- `manifest.json` define o nome, a versão e as permissões da extensão.
- `service-worker.js` configura o clique no ícone para abrir o painel.
- `painel/` contém a interface, os controles de mídia e a integração com o VLibras.
- `modelos/` contém o detector de mãos, o classificador de letras e o modelo de transcrição.
- `vendor/` contém as dependências locais de visão, transcrição e síntese de voz.
- `assets/logo.svg` contém a marca circular. Os ícones PNG da extensão ficam em `assets/icones/`.

As duas mãos e as linhas de movimento da marca foram adaptadas do [símbolo Acessível em Libras, criado pelo Centro de Comunicação da UFMG](https://www.ufmg.br/marca/libras/). Na marca do projeto, as mãos aparecem dentro de uma câmera de vídeo e o monograma LR lembra a identificação de um participante da chamada.

Adaptado do exemplo oficial [Global Side Panel](https://github.com/GoogleChrome/chrome-extensions-samples/tree/main/functional-samples/cookbook.sidepanel-global), licenciado sob a [Apache License 2.0](LICENSE).

O reconhecimento visual usa [MediaPipe Hand Landmarker](https://developers.google.com/edge/mediapipe/solutions/vision/hand_landmarker) e uma exportação do classificador do [LibrAI, revisão 364c784](https://github.com/cardosodan/LibrAI/tree/364c784835dea121d0d85f46a3fd78add1d52239), sob a [licença MIT do LibrAI](modelos/LICENSE-LibrAI.txt). A transcrição usa [Whisper Tiny quantizado](https://huggingface.co/onnx-community/whisper-tiny/tree/ff4177021cc41f7db950912b73ea4fdf7d01d8e7) com [Transformers.js 3.8.1](https://github.com/huggingface/transformers.js/tree/3.8.1). A voz usa [Spellophone 0.2.1 com eSpeak NG](https://github.com/Spelling-Creator/spellophone), sob a [licença GPL-3.0-or-later da dependência](vendor/spellophone/LICENSE). A tradução e o avatar são serviços do [VLibras](https://www.gov.br/governodigital/pt-br/acessibilidade-e-usuario/vlibras).
