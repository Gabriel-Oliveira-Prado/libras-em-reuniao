# Libras em Reunião

Extensão experimental do Chrome para comunicação no Google Meet usando **Libras, a Língua Brasileira de Sinais**. Versão **0.5.2**.

- **Sinais → voz:** MediaPipe Holistic acompanha mãos, corpo e rosto. Uma TCN local reconhece um vocabulário experimental de 20 sinais isolados. O sinal aceito aparece na legenda da câmera e é falado em português.
- **Meus sinais:** cadastro local de sinais pessoais para pessoas, apelidos e termos. Três exemplos e uma confirmação permitem comparar novas sequências de movimento com o cadastro; quando a leitura é aceita, o nome associado aparece na legenda e é falado. Inclui teste, renomeação, pausa, exclusão e backup.
- **Voz → Libras:** escuta contínua, detector de fala Silero e transcrição local com Whisper Tiny. O microfone também oferece a opção **Resposta rápida**, pelo serviço de voz do Chrome, mediante escolha do usuário. Cada trecho de texto confirmado é enviado ao VLibras automaticamente. O avatar aparece somente neste modo e permanece visível entre as falas.

## Abrir e testar

1. Em `chrome://extensions`, carregue sem compactação a pasta `C:\Users\Gabri\source\repos\libras-em-reuniao` ou clique em **Recarregar** na extensão existente. Confira a versão 0.5.2 e feche/reabra o painel.
2. Em **Sinais → voz**, use **Abrir em aba**, clique em **Ligar câmera** e permita o acesso. Enquadre rosto, tronco e ambas as mãos.
3. Faça um dos sinais disponíveis e abaixe as mãos por um instante entre os sinais. Uma previsão aceita atualiza a legenda e gera voz automaticamente. Ao manter as mãos levantadas, a leitura tem limite de quatro segundos; ainda não há segmentação de frases contínuas.
4. Use **Testar som** para ouvir uma frase de teste sem depender do reconhecimento. Também é possível digitar e clicar em **Falar mensagem**. Se o teste não for audível, confira o volume do Windows, a saída selecionada e se a aba está silenciada.
5. Em **Voz → Libras**, escolha **Local** ou **Resposta rápida** e clique em **Ligar microfone**. Resposta rápida pode enviar áudio ao serviço de voz do Chrome e depende de internet e disponibilidade no navegador; os parciais aparecem na tela e só os textos confirmados são enviados ao avatar. **Ouvir guia** sempre usa transcrição local.
6. Para outras pessoas ouvirem a voz gerada, apresente a aba do tradutor no Meet com **Compartilhar áudio da guia** ativado. É preciso confirmar o áudio com outro participante.

## Cadastrar um sinal para uma pessoa

1. Em **Sinais → voz**, ligue a câmera e abra **Meus sinais em Libras · pessoas e termos**.
2. Clique em **Cadastrar um sinal**. Digite, por exemplo, “Gabriel” e escolha **Uma pessoa**. O nome será a legenda e o texto da voz.
3. Clique em **Começar gravação 1 de 3**. A câmera mostra **3 → 2 → 1 → Sinalize agora**. Espere o aviso, faça o sinal inteiro e abaixe as mãos ao terminar. O botão sobre a câmera permite começar a repetição seguinte; faça sempre o **mesmo sinal**, com o mesmo enquadramento.
4. Depois das três gravações, clique em **Confirmar e salvar · mesmo sinal** e repita esse **mesmo sinal** mais uma vez. O cadastro só é salvo e ativado se essa tentativa for reconhecida e suficientemente distinta dos outros cadastros. Use **Regravar exemplos** se as gravações ficaram diferentes.
5. Use o gesto normalmente na câmera. Uma correspondência aceita mostra e fala “Gabriel”. Gestos ambíguos entre cadastros são recusados. **Testar gesto** permite verificar um cadastro sem misturar a gravação com o modelo geral.

Escolha **Um termo ou expressão** para cadastrar apelidos, gírias ou nomes de projetos. Não há filtro lexical no dicionário. O cadastro pessoal atua em **Sinais → voz**; a animação de **Voz → Libras** é fornecida pelo dicionário do VLibras.

Até **30 sinais** ficam no IndexedDB do perfil local do Chrome, com nomes e coordenadas normalizadas de movimento, sem vídeo ou áudio. Cadastre com a pessoa que vai sinalizar; quatro exemplos próprios não garantem reconhecimento de outras pessoas, variações regionais ou frases contínuas. Os exemplos são comparados por alinhamento temporal (DTW), com limite de distância e recusa de ambiguidade. O modelo geral de 20 sinais continua separado desse cadastro.

**Salvar cópia** exporta um JSON para restaurar em outro computador. **Importar cópia** acrescenta registros válidos, preservando os nomes/IDs já existentes. A importação é atômica: uma falha de validação não deixa parte do arquivo salva. As alterações são compartilhadas entre abas do mesmo perfil. Remover a extensão ou apagar os dados do navegador pode apagar o cadastro; use o backup antes. Os arquivos pessoais não fazem parte do repositório; o nome padrão de backup está no `.gitignore`.

No ensaio final de cadastro pessoal, foram usadas cinco repetições de seis sinais da mesma pessoa de uma base pública: três exemplos, uma confirmação e um teste separado. **Cinco cadastros passaram pela confirmação; quatro foram reconhecidos no teste seguinte e um foi recusado.** Nos outros 28 vídeos de sinais diferentes houve **zero correspondências aceitas**, sendo que um deles não produziu segmento válido. As regras foram fixadas após um ensaio com outra pessoa, cujo resultado inicial mostrou sete confusões e levou à redução do limite de aceitação. Esses dados são pequenos e controlados; não avaliam o usuário ao vivo. Veja `treinamento/resultado-dicionario-pessoal.json` e os relatórios de desenvolvimento.

## Reconhecimento de sinais: alcance e resultados

Vocabulário treinado: acontecer, aluno, amarelo, América, aproveitar, bala, banco, banheiro, barulho, cinco, conhecer, espelho, esquina, filho, maçã, medo, ruim, sapo, vacina e vontade. Há também uma classe de repouso. O painel não pede arquivos ou treinamento no Teachable Machine.

**“Oi” ainda não está no modelo geral.** Foi treinado um candidato com três vídeos rotulados do V-Librasil, usando pessoas diferentes para treino, validação e teste. Acertou a validação, mas não reconheceu a pessoa de teste; a simulação também teve um falso positivo nos 18 vídeos fora do vocabulário. Esse candidato foi reprovado e não substituiu o modelo atual. Veja `treinamento/resultado-oi-reprovado.json`. É possível tentar cadastrar “Oi” como termo pessoal, com os próprios exemplos e a confirmação; isso não equivale a habilitar seu reconhecimento para qualquer pessoa.

Na 0.4.1 a geometria dos landmarks é corrigida para a proporção 16:9 usada no treino, mesmo quando a webcam fornece 4:3. A câmera pede 1280×720 e orienta quando a mão sai do quadro. Leitura incerta não gera voz. Isso corrige a entrada do modelo, sem demonstrar por si só melhora de acurácia ao vivo.

Foi treinada uma TCN de 39.861 parâmetros em 320 vídeos do [MINDS-Libras](https://zenodo.org/records/2667329), usando o [espelho do IBMEC SP](https://huggingface.co/datasets/ibmectech/minds-libras-raw). Pessoas 01, 02, 05, 06, 08 e 10 compõem o treino; 11 é usada para validação/escolha da época; 12 é reservada ao teste. As duas primeiras repetições de cada sinal foram usadas. Frames de uma pessoa não aparecem em outra divisão.

No teste com 40 vídeos de sinais da pessoa reservada, a classificação acertou **35/40 (87,5%)**. O critério fixo de confiança ≥ 0,85 e margem ≥ 0,30 aceitou **20 previsões, todas corretas**, deixando 20 sem fala. A simulação da segmentação usada no painel reproduziu 20 respostas corretas e 20 abstenções. Em outros 18 vídeos de seis sinais fora do vocabulário, não houve fala. Esses números não garantem acurácia semelhante na webcam: só há uma pessoa no teste principal, fundo controlado e poucos exemplos de sinais desconhecidos. A recusa de previsões pode atingir sinais treinados, dependendo da pessoa. O resultado não é comparável diretamente ao antigo teste de 18 vídeos, pois a base e o vocabulário mudaram.

O modelo está incluído e habilitado como **experimental**, com esse alcance visível no painel. Não traduz conversa contínua. Pode confundir sinais; a confiança do modelo não é garantia de correção. Nenhum filtro de palavrões foi adicionado: a limitação é o vocabulário e a precisão do reconhecimento. Palavras digitadas são passadas diretamente à voz.

Relatórios: `treinamento/resultado-holistic.json` (treino e teste por vídeo), `treinamento/resultado-fluxo-tcn.json` (segmentação e sinais desconhecidos). Os vídeos e checkpoints de pesquisa ficaram na pasta temporária do computador. A extensão contém apenas modelos e código; não contém os vídeos de treinamento.

## Áudio e privacidade

A captura usa PCM mono via AudioWorklet. O Silero VAD analisa blocos de 32 ms e envia a fala após cerca de **320 ms de pausa**, limitando trechos contínuos a aproximadamente **3,5 segundos**. O Whisper começa a carregar ao entrar no modo de voz. Isso reduz esperas do fluxo anterior, mas a latência final inclui inferência, rede e animação do VLibras.

O microfone solicita cancelamento de eco e supressão de ruído do Chrome, com ganho automático desligado para não amplificar sons distantes. O VAD distingue atividade de fala de parte dos ruídos; **não identifica a voz do usuário nem separa pessoas falando ao fundo**. Fale perto do microfone. A captura da guia inclui as vozes presentes nela.

**Parar escuta** conclui os trechos já capturados. **Cancelar pendentes**, **Limpar** ou trocar para a câmera cancelam a escuta pendente. O avatar sinaliza em ordem, sem cortar uma frase para iniciar outra. Filas excessivas pausam a captura e mostram aviso. Os campos guardam os últimos 500 caracteres.

Câmera, detecção de fala e síntese de voz rodam localmente. A transcrição **Local**, selecionada por padrão, também roda no computador. A opção **Resposta rápida** usa a API SpeechRecognition do Chrome e pode enviar áudio aos servidores do serviço; ela só é iniciada depois de o usuário selecionar essa opção e ligar o microfone. O código não filtra palavras; a transcrição recebida depende do motor escolhido. Enquanto a escuta estiver ligada, **cada trecho de texto confirmado é enviado ao serviço VLibras**. O avatar é carregado do site VLibras. Os vídeos da câmera não são enviados pelo código da extensão.

Foi corrigida a leitura do evento Unity do avatar: o iframe envia cinco campos, incluindo animação de intervalo no terceiro e carregamento no quarto. O painel aceita também o evento antigo de três campos. A fila respeita pausas/carregamentos e avança ao fim do trecho. Até 100 traduções de textos idênticos ficam em memória durante a sessão. O console registra somente tempos de transcrição e de início da animação para diagnóstico, sem incluir o texto dessas mensagens.

Na 0.5.0, **Tentar novamente** após falha apenas de tradução mantém o Unity carregado e o trecho atual em andamento. O avatar tem **Pausar/Retomar** e velocidades 0,5×, 1×, 1,5× e 2×, usando os comandos documentados no [adaptador oficial do VLibras](https://github.com/spbgovbr-vlibras/vlibras-player-webjs/blob/master/src/PlayerManagerAdapter.js). A velocidade altera a duração da animação; não acelera o Whisper ou a API. **Parar voz** interrompe o áudio local e mantém a mensagem. Os parciais do modo rápido preservam trechos anteriores ao índice alterado. A câmera ajusta a sobreposição ao mudar a resolução, destaca as pontas dos dedos e orienta quando as mãos estão pequenas no quadro.

## Dispositivos e avatar · 0.5.1

Abra **Câmera, microfone e saída de som** no início do painel. Escolha a câmera, a entrada de áudio e o fone/alto-falante. Se a lista estiver incompleta, use **Permitir e listar**, autorize o acesso e depois **Atualizar lista**. As permissões temporárias usadas para listar são liberadas imediatamente. A escolha fica salva neste perfil; a câmera e o microfone são trocados ao vivo, encerrando a captura anterior. A seleção controla o tradutor; o Meet tem suas próprias configurações. **Ouvir guia** continua usando o áudio da guia escolhida.

A saída da voz local usa `AudioContext.setSinkId`. Se a saída escolhida falhar, o painel avisa e não inicia a voz em outro dispositivo. Trocar ou desconectar a saída interrompe o áudio em andamento; use **Testar som** para conferir a nova escolha. Um navegador sem essa API usa a saída padrão do Windows e mostra essa limitação. A transcrição rápida usa a faixa do microfone escolhido no Chrome desktop 135 ou posterior; versões anteriores precisam da transcrição **Local** para usar uma entrada específica. Câmera/microfone desconectados não são substituídos silenciosamente por outro dispositivo.

O avatar agora seleciona explicitamente o personagem com `Change("icaro")`, após os mesmos 500 ms usados na inicialização do [widget oficial 7.12.2](https://vlibras.gov.br/app/vlibras-initial-CMx6VRWn.js). A fila também aceita `playing` enquanto o próximo sinal está carregando e acompanha `counter_gloss`. Após 15 s sem confirmação de início, mostra uma falha recuperável em vez de manter “Preparando…” indefinidamente. **Tentar novamente** preserva o trecho. **Testar “Tudo bem?”**, em Voz → Libras, verifica o caminho texto → tradução → avatar sem depender do microfone. A escolha do personagem e os eventos foram verificados por testes simulados; a animação real no Chrome continua pendente.

## Cadastro e legendas · 0.5.2

O cadastro mostra três etapas: **Nome**, **Três gravações** e **Teste final**. A contagem regressiva funciona por relógio, sem depender de receber um novo quadro do detector. A imagem fica livre para acompanhar as mãos durante a gravação; uma faixa informa quando sinalizar e quanto tempo ainda há. Depois de cada tentativa, o botão sobre a câmera permite continuar sem voltar ao formulário. Cancelar, trocar de câmera ou sair do modo encerra a captura e a contagem.

A legenda em português conserva apenas as palavras ou nomes reconhecidos. Avisos de enquadramento e de leitura incerta aparecem abaixo da câmera; não são acrescentados à fala ou à legenda. Leituras incertas também não mostram sugestões de palavras como se fossem uma tradução. O indicador **Falando: …** acompanha o início agendado do áudio local e a confirmação de término de cada áudio; não estima palavras faladas. Continua sendo necessário conferir a saída com **Testar som**.

O projeto usa **Libras, a Língua Brasileira de Sinais**, incluindo cadastros pessoais usados nesse contexto. O modelo geral continua baseado nos vídeos de Libras citados acima; esta atualização de interface não adiciona vocabulário nem valida linguisticamente os sinais cadastrados. A confirmação testa a correspondência do movimento com os exemplos.

## Verificações

- `node --test tests/*.test.mjs`: fluxo de modos, legenda/voz sem censura, silêncio, filas, cancelamento e descarregamento de áudio. Os testes de interface usam objetos simulados.
- `tests/testar_vad_local.mjs`: Silero real em ONNX CPU e também no WASM distribuído com a extensão, executados no Node. Dez segundos de ruído artificial não geraram transcrição; duas frases sintetizadas foram transcritas como “Bom dia, tudo bem.” e “Eu preciso de ajuda.”. Isso não mede microfone real ou desempenho no Chrome.
- `tests/verificar_paridade_tcn.mjs`: compara as probabilidades da implementação JavaScript com a referência PyTorch, com tolerância de 0,00001.
- `tests/verificar_fluxo_tcn.mjs`: simula os landmarks dos vídeos pela mesma segmentação e rede usadas no painel. Não é uma chamada no Meet.
- `tests/testar_sintese_local.mjs`: usa o motor de voz WASM real e verifica duração, amostras finitas e áudio não silencioso para “Oi”, frase de teste, um palavrão, “Gabriel”, “João” e “Ana Clara”. Os nomes foram sintetizados em cerca de 2–4 ms; a verificação não comprova som nos alto-falantes. Relatório `treinamento/resultado-sintese.json`.
- `tests/testar_transcricao_wasm.mjs`: roda Silero, bundle Transformers.js e Whisper WASM da extensão no Node, com uma thread. As duas frases levaram aproximadamente 1,95 e 1,79 s para transcrever, mais 1,69 s de carregamento inicial. Isso explica parte da espera local e não mede desempenho no Chrome/Meet. Relatório `treinamento/resultado-whisper-wasm.json`.
- 29 testes automatizados passaram, incluindo cadastro pessoal completo, contagem independente de quadros, cancelamento do relógio, confirmação do mesmo sinal, separação de instruções e legenda, indicador de voz, pausa, reabertura, ambiguidade, backup inválido, troca de dispositivos, saída de áudio e fila do avatar. A interface, câmera e serviço rápido usam APIs simuladas nesses testes.
- `tests/testar_armazenamento.mjs`: persistência entre clientes, renomeação, pausa, exclusão, importação atômica e concorrência com fake-indexeddb 6.2.8 no ambiente temporário. É uma implementação de teste da API, não o armazenamento de um Chrome em uso.
- `tests/testar_dicionario_videos.mjs`: usa vetores reais MediaPipe e as mesmas regras de cadastro, segmentação e comparação da extensão. Relatórios separam desenvolvimento e a segunda pessoa usada no ensaio final.
- `node tests/testar_servico_vlibras.mjs`: consulta a API real com “Tudo bem?”, “Como você está?” e “Bom dia, tudo bem?” e verifica os bundles Unity correspondentes, incluindo o cabeçalho CORS para o iframe. Relatório `treinamento/resultado-vlibras.json`. Não executa o avatar; a tradução de “Como você está?” devolvida pelo serviço foi `COMO VOCÊ BOM [INTERROGAÇÃO]`, sem revisão linguística neste teste.
- **Pendente:** teste visual no Chrome, câmera/microfone reais e chamada com outro participante. O controle automatizado do navegador foi bloqueado nesta sessão; esses testes não foram declarados como realizados.

## Estrutura e créditos

### Como outras pessoas usam a IA

Os modelos usados pela extensão são arquivos em `modelos/`, acompanhados pelas bibliotecas em `vendor/`. Eles acompanham o código do projeto no GitHub. A instalação de outra pessoa precisa incluir essas pastas completas e manter os avisos e licenças dos componentes.

Quem recebe o projeto completo carrega a extensão no Chrome e executa os modelos no próprio computador. Não precisa de Python, PyTorch, Ollama, vídeos de treino ou novo treinamento. As ferramentas Python são usadas apenas no desenvolvimento. O VLibras e a opção de voz rápida dependem de internet; o desempenho local varia conforme o computador. Um repositório privado exige acesso concedido pelo proprietário, ou distribuição de um ZIP completo. Os vídeos e checkpoints experimentais da pasta temporária não são incluídos automaticamente no GitHub.

- `painel/`: interface, rastreamento, TCN, legenda, voz, VAD, transcrição e avatar.
- `modelos/`: MediaPipe Holistic, Silero VAD v6.2, TCN treinada e Whisper Tiny. Os arquivos antigos de letras não são usados pelo painel.
- `treinamento/`: extração, treino reproduzível e relatórios. Veja seu README para comandos.
- `vendor/`: bibliotecas locais. As bibliotecas antigas do Teachable Machine permanecem no disco, mas não são carregadas pela interface.
- `assets/`: logo circular aprovada e ícones.

O rastreamento usa [MediaPipe Holistic](https://developers.google.com/edge/mediapipe/solutions/vision/holistic_landmarker). O detector de voz é [Silero VAD](https://github.com/snakers4/silero-vad/tree/v6.2), sob MIT; o ONNX Runtime local é a versão `1.22.0-dev.20250409-89f8206ba4`, sob MIT. A voz usa [Spellophone/eSpeak NG](https://github.com/Spelling-Creator/spellophone), sob GPL-3.0-or-later. A transcrição usa [Whisper Tiny quantizado](https://huggingface.co/onnx-community/whisper-tiny/tree/ff4177021cc41f7db950912b73ea4fdf7d01d8e7) com Transformers.js.

As mãos da marca foram adaptadas do [símbolo Acessível em Libras da UFMG](https://www.ufmg.br/marca/libras/). O projeto original foi adaptado do exemplo [Global Side Panel](https://github.com/GoogleChrome/chrome-extensions-samples/tree/main/functional-samples/cookbook.sidepanel-global). O VLibras faz tradução de português para Libras; o reconhecimento de sinais da câmera é um componente separado.
