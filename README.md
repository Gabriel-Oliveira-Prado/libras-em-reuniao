# Libras em Reunião

Extensão experimental do Chrome para comunicação no Google Meet usando **Libras, a Língua Brasileira de Sinais**. Versão **0.8.4**.

## BMC e pitch

| Modelo de negócio | Apresentação do projeto |
| --- | --- |
| **[Abrir o BMC no Canva](https://www.canva.com/design/DAHazDROCsw/6qu2A1dF_SKvo0PKSNXtGg/edit)** | **[Abrir o pitch no Canva](https://www.canva.com/design/DAHazDROCsw/6qu2A1dF_SKvo0PKSNXtGg/edit)** |

## Funcionalidades

- **Sinais → voz:** MediaPipe Holistic acompanha mãos, corpo e rosto. Uma TCN local reconhece 20 sinais isolados; um reconhecedor separado trata Oi (O → I). O sinal aceito aparece na câmera e é falado com as vozes neurais brasileiras Dora (feminina) ou Alex (masculina).
- **Meus sinais:** cadastro local de sinais pessoais para pessoas, apelidos e termos. Três exemplos e uma confirmação permitem comparar novas sequências de movimento com o cadastro; quando a leitura é aceita, o nome associado aparece na legenda e é falado. Inclui teste, renomeação, pausa, exclusão e backup.
- **Voz → Libras:** escuta contínua, detector de fala Silero e transcrição local com Whisper Base (padrão), Tiny ou Small opcional. Pode executar no navegador ou no serviço acelerado deste computador. O microfone também oferece a opção **Resposta rápida**, pelo serviço de voz do Chrome, mediante escolha do usuário. Cada trecho de texto confirmado é enviado ao VLibras automaticamente. O avatar aparece somente neste modo e permanece visível entre as falas.

> **Documentação de IA:** [componentes usados e limites](#agentes-e-modelos-de-ia) · [instalar e testar Ollama/Qwen](#instalar-e-testar-ollama-com-qwen-no-windows) · [o que acompanha o clone](#o-que-acompanha-o-clone-do-github)

## Abrir e testar

1. Em `chrome://extensions`, carregue sem compactação a pasta `C:\Users\Gabri\source\repos\libras-em-reuniao` ou clique em **Recarregar** na extensão existente. Confira a versão 0.8.4 e feche/reabra o painel.
2. Em **Sinais → voz**, use **Abrir em aba**, clique em **Ligar câmera** e permita o acesso. Enquadre rosto, tronco e as mãos usadas no sinal.
3. Faça um dos sinais disponíveis. Para **Oi → sinal pessoal**, pause cerca de meio segundo entre eles; você pode manter as mãos no quadro. Os demais sinais gerais continuam dependendo do encerramento do movimento, por pausa mais longa ou mãos em repouso. Uma previsão aceita atualiza a legenda e gera voz automaticamente. A leitura aceita sinais isolados de uma ou duas mãos, com ritmos diferentes e limite de dez segundos; movimentos que ultrapassam esse limite são descartados até o repouso. Ainda não há tradução de frases sinalizadas contínuas.
4. Escolha **Dora · feminina** ou **Alex · masculina** em **Voz do tradutor** e use **Testar som**. Também é possível digitar e clicar em **Falar mensagem**. Se o teste não for audível, confira o volume do Windows, a saída selecionada e se a aba está silenciada.
5. Em **Voz → Libras**, escolha **Local** ou **Resposta rápida** e clique em **Ligar microfone**. Resposta rápida pode enviar áudio ao serviço de voz do Chrome e depende de internet e disponibilidade no navegador; os parciais aparecem na tela e só os textos confirmados são enviados ao avatar. **Ouvir guia** sempre usa transcrição local.
6. Para outras pessoas ouvirem a voz gerada, use a integração com o Meet descrita abaixo. Com a integração desligada, a alternativa continua sendo apresentar a aba do tradutor com **Compartilhar áudio da guia** ativado. Confirme o áudio com outro participante.

## Avatar ao ligar a câmera do Meet · 0.8.3

O vídeo da câmera agora é preparado no próprio pedido do Meet, mesmo quando a conexão com o painel acontece depois. Ao conectar em **Voz → Libras**, os quadros do avatar entram na mesma faixa de vídeo já entregue ao Meet, após o intérprete carregar. Não é preciso começar a falar nem desligar e religar a câmera para ativar o avatar. Em **Sinais → voz** ou desconectado, o vídeo mostra apenas a câmera.

A captura dos quadros agora espera a inicialização do player; o prazo de captura não começa durante o download inicial do Unity. Isso evita que uma carga lenta deixe o avatar sem vídeo na reunião.

Após instalar esta atualização, **recarregue a guia do Meet uma vez**, pois o código precisa ser instalado antes de o Meet abrir os dispositivos. O microfone continua separado e exige clique explícito. Os demais participantes recebem a composição pelo vídeo do Meet, sem instalar a extensão. A primeira carga do VLibras depende de internet; a exibição imediata do personagem ainda não pode ser prometida antes desse carregamento.

## Recuperação da conexão com o Meet · 0.8.2

A lista de reuniões também consulta as guias diretamente, sem depender da primeira resposta do serviço da extensão. Uma queda tenta recuperar o canal duas vezes; a busca e a conexão têm prazo e devolvem o controle com instruções, em vez de manter “Carregando reuniões…”. Recuperar o canal não conecta a reunião nem liga o microfone automaticamente.

Após atualizar, recarregue a extensão e a guia do Meet uma vez, reabra o painel e conecte à guia escolhida. A 0.8.3 prepara o vídeo no pedido de câmera do Meet e aceita a conexão do painel depois; o áudio gerado ainda exige reabrir um microfone que já estivesse capturado antes da configuração. **Os outros participantes não precisam instalar a extensão:** recebem o avatar composto no vídeo enviado pelo Meet. A entrega em uma chamada real ainda precisa ser validada.

## Microfone simples e biblioteca de Libras · 0.8.1

**Um botão para o microfone:** clique em **Ligar microfone** para ouvir e em **Desligar microfone**, no mesmo lugar, para encerrar imediatamente a captura e as transcrições ainda pendentes. O texto já confirmado permanece na tela. O botão continua disponível durante carregamento e pedido de permissão, permitindo cancelar. **Ouvir guia** também funciona como liga/desliga. Selecionar modo, conectar/reconectar ao Meet ou trocar dispositivo não liga a escuta automaticamente.

**Biblioteca de sinais do avatar:** são **22.498 entradas do dicionário oficial do VLibras**, incluindo variações de glosa. Abra a biblioteca, pesquise sem precisar digitar acentos e use **Ver sinal**. Há paginação para manter o painel leve. A lista acompanha a extensão; a animação usa o serviço VLibras e precisa de internet. **Atualizar biblioteca** consulta a fonte oficial para esta sessão, preservando a lista anterior se houver falha.

A seleção toca a glosa exata em vez de traduzi-la novamente; quando conectado, o sinal segue para o avatar do Meet. Abrir um sinal muda para Voz → Libras sem ligar o microfone automaticamente. O áudio já capturado e confirmado antes de desligar pode ter sido enviado ao avatar; desligar o microfone cancela novas transcrições, sem apagar a mensagem confirmada.

Esta biblioteca amplia a consulta e a reprodução pelo avatar. **Ela não faz a câmera reconhecer 22 mil sinais.** O reconhecimento da câmera tem modelo e avaliação próprios. [Funcionamento e atualização da biblioteca](modelos/BIBLIOTECA-LIBRAS.md). O [experimento com 48 classes EQT](treinamento/EQT-LIBRAS.md) foi reprovado por baixa cobertura e um falso reconhecimento; não substituiu o modelo atual.

## Google Meet: avatar no vídeo e voz na chamada · 0.8.0

A integração experimental compõe o avatar com sua câmera para enviar aos participantes e encaminha a voz dos sinais ao microfone da reunião. O padrão é **canto inferior esquerdo**, com quatro posições e três tamanhos disponíveis no painel.

1. Recarregue a extensão e reabra o painel. Abra o Meet no mesmo perfil, escolha a guia em **Conectar ao Google Meet** e clique em **Conectar ao Meet**.
2. Depois de atualizar a extensão, **recarregue a guia do Meet uma vez**, preferencialmente antes de entrar. Na 0.8.3, a câmera pode ser ligada antes ou depois da conexão com o painel. Para o áudio gerado, desative e ative o microfone do Meet se ele já estava capturado antes da conexão.
3. Em **Voz → Libras**, clique em **Ligar microfone** e permita o acesso. O mesmo botão passa a **Desligar microfone**; clique novamente para encerrar. As transcrições confirmadas vão ao avatar do Meet. Ligue a câmera da reunião para os outros receberem a composição.
4. Em **Sinais → voz**, ligue a câmera do tradutor e deixe o microfone do Meet ligado. Com **Enviar a voz dos sinais ao áudio do Meet** marcado, o áudio vai à chamada; a cópia no alto-falante local fica silenciosa para evitar eco. **Testar som** continua local; use **Testar voz na reunião** para conferir o encaminhamento.
5. Confira a recepção com outra pessoa. O canto vale para o vídeo enviado; sua prévia espelhada pode mostrar o lado oposto. Fechar o painel/desconectar interrompe a mídia gerada.

**Ainda exige teste real no Chrome e numa reunião entre participantes.** Os testes desta rodada usam DOM, mídia e APIs simuladas; não confirmam a animação Unity nem a entrega externa. A tradução continua por trechos após pausas, com o atraso de transcrição, rede e animação. [Configuração, funcionamento, permissões e limites](meet/README.md).

## Sinais em sequência · 0.7.1

Faça **Oi → pausa de cerca de meio segundo → sinal cadastrado de Gabriel**. Para Oi e cadastros reconhecidos, a pausa pode separar os movimentos sem baixar as mãos entre eles. Cada leitura aceita entra na legenda; a voz segue a mesma ordem, sem cortar a fala anterior. Fazer novamente o sinal de Gabriel gera outra fala; manter a mesma pose não repete o nome.

A confirmação curta exige duas leituras concordantes em quadros diferentes. Os quadros parados no fim não sobreponderam o movimento; o início do próximo gesto é preservado, incluindo a troca da mão ativa. A TCN dos 20 sinais gerais continua recebendo segmentos completos: esse ajuste não acrescenta vocabulário nem traduz conversa livre.

A regressão com landmarks reais passou nas quatro montagens: Oi → Gabriel, Gabriel → Gabriel e cada um seguido de pose mantida. “Gabriel” é um rótulo de teste sobre um cadastro da base pública, não o cadastro privado deste perfil. Os quatro vídeos de Oi continuaram aceitos; não houve fala de Oi nos 341 outros vídeos. Os cadastros de teste mantiveram quatro acertos e uma recusa, sem nomes errados nem falas nos 28 negativos. A fila de voz e a legenda também foram verificadas com APIs simuladas. **A sequência com seu sinal pessoal e o som real ainda precisam ser conferidos no Chrome.** [Protocolo](treinamento/README.md#sinais-em-sequencia-071) · [Relatório](treinamento/resultado-encadeamento.json).

## Captura e transcrição · 0.7.0

**Câmera:** o MediaPipe Holistic continua acompanhando mãos, corpo e rosto. A segmentação passou a considerar movimento dos dedos e punhos, uma ou duas mãos, sinais mais baixos e velocidades diferentes. O mínimo é quatro quadros e 160 ms; o limite é dez segundos. Uma perda parcial do rastreamento pode esperar 800 ms antes de encerrar o sinal, sem inventar pontos ausentes; ausência breve de rosto/ombros por até 250 ms não apaga imediatamente o movimento. A sobreposição inclui referências de rosto e tronco. Isso tolera pequenas variações de execução; a posição relativa ao corpo continua preservada porque pode mudar o significado em Libras.

**Transcrição:** selecione **Local → Navegador** para usar Whisper Base incluído, sem serviço adicional. Tiny continua disponível. O Small opcional foi instalado neste computador e pode ser instalado em outro com `.\scripts\instalar-transcricao.ps1 -Modelo small`. Para reduzir o tempo de inferência, há **Acelerado neste computador**, um serviço local opcional que usa os mesmos modelos em CPU. [Instalação, comparação de modelos e inicialização](modelos/TRANSCRICAO.md).

**Fidelidade:** cada transcrição confirmada vai ao VLibras sem reescrita automática. Confira separadamente **Últimas falas em português** e **Trecho do avatar**: erro no texto e tradução do VLibras são etapas diferentes. A estrutura da Libras não é uma cópia palavra por palavra do português; a qualidade da sinalização ainda precisa de avaliação por pessoas fluentes.

**Qwen:** abra **Revisão opcional com Qwen**, use **Verificar Qwen** e **Sugerir revisão**. A sugestão aparece separada; **Usar no campo de texto** só altera o campo. Para sinalizá-la, confira e clique em **Sinalizar texto editado**, que substitui a fila atual do avatar pelo texto do campo. A consulta envia somente o texto solicitado ao Ollama neste computador, sem câmera ou áudio. A transcrição que chega automaticamente ao avatar permanece original.

### O que foi medido nesta rodada

- Nas 16 frases sintetizadas em duas vozes, Tiny/Base/Small tiveram WER de 7,35%/5,88%/2,94%; Base foi o compromisso escolhido. Pontuação e acentos são ignorados nessa comparação. Não são gravações da voz do usuário. [Guia e relatórios](modelos/TRANSCRICAO.md#resultado-e-limites).
- Small nativo em CPU, quatro threads: mediana de **1,141 s**, contra **11,791 s** no WASM nos mesmos três WAV. As três transcrições mantiveram as palavras; a memória residente final do processo foi cerca de **1,43 GiB**. Isso mede inferência no Node, não o fluxo do Chrome ou a latência total do avatar. [Relatório](treinamento/resultado-asr-nativo.json).
- O serviço acelerado e seu adaptador HTTP também foram executados no Node: **3/3** respostas com as mesmas palavras, totais HTTP de **2,047/1,703/2,082 s**, com 3,416 s de carregamento. Uma origem diferente foi recusada com HTTP 403. Esse ensaio de aproximadamente dois segundos por trecho é separado do benchmark direto acima e não verifica Chrome/Meet. [Relatório do serviço](treinamento/resultado-servico-transcricao.json).
- Nos nove cenários de ritmo/altura sobre os mesmos 58 vídeos já examinados, na velocidade original houve 20/40 sinais conhecidos corretos, 20 abstenções e nenhuma fala errada; o rápido manteve esses números. No lento, houve 19/20/21 corretos conforme a altura, contra 18/18/19 no fluxo anterior; cinco falas erradas/repetidas somadas passaram a zero. As 162 variantes de sinais desconhecidos não geraram fala. Isso é regressão com alterações sintéticas de landmarks, não acurácia de webcam ou avaliação independente. [Protocolo](treinamento/README.md#captura-transcricao-e-revisao-local-070), [relatório](treinamento/resultado-robustez-070.json).
- Um novo candidato foi treinado com perturbações de ritmo/postura apenas no treino. Acertou 33/40 no teste bruto, mas aceitou 23 falas, das quais só 22 corretas. **Foi reprovado e não substituiu a TCN distribuída.** A cobertura continua sendo 20 sinais isolados, Oi experimental e sinais pessoais cadastrados. [Resultado do candidato](treinamento/resultado-treino-robusto.json).

Câmera e microfone reais, acesso dos serviços pelo Chrome, animação do avatar e reunião com outro participante continuam pendentes. Os resultados acima vêm de Node/Python e testes com APIs simuladas; não demonstram conversa livre ou ausência de atraso.

## Identidade visual · 0.6.2

A interface mantém **branco como cor principal**, com azul-marinho `#11114E`, roxo `#846DC2`, roxo escuro `#5F4888` e lavanda `#9D9FE6`. Botões, legendas, marcações das mãos e estados do painel seguem essa paleta.

A nova logo preserva as mãos e as letras LR da referência enviada, com fundo transparente fora do círculo. A matriz editável está em [assets/logo.svg](assets/logo.svg), e a versão PNG de 1024 px está em [assets/logo.png](assets/logo.png). Os ícones do Chrome e o favicon foram atualizados. Veja os [arquivos, cores e instruções para exportar a marca](assets/marca/README.md). Após atualizar a pasta, recarregue a extensão e reabra o painel.

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

**Oi (O → I) está disponível de forma experimental na 0.6.0.** O candidato TCN anterior continua reprovado em `treinamento/resultado-oi-reprovado.json`. O novo reconhecedor usa geometria dos dedos, movimento e um classificador binário, sem substituir a TCN dos 20 sinais. No ensaio exploratório, aceitou os três exemplos do V-Librasil e um exemplo do INES, corrigindo a proporção da imagem como na câmera. Em 341 outros vídeos, 338 com segmentos, não falou Oi. Os exemplos e regras foram examinados/ajustados no desenvolvimento: **isso não é validação independente nem estimativa de acurácia na webcam**. Veja `treinamento/resultado-saudacao-oi.json`.

O reconhecedor trata a forma com mão em O e abertura do mínimo durante o movimento. Não traduz aceno aberto como Oi, pois também pode significar despedida. **Ajustar meu “Oi”** abre o cadastro pessoal preenchido; permite adaptar ou substituir um cadastro existente depois das três gravações e da confirmação. Outras formas e variações regionais podem exigir esse ajuste. Sinais fora do vocabulário ainda precisam de treinamento ou cadastro.

Na 0.4.1 a geometria dos landmarks é corrigida para a proporção 16:9 usada no treino, mesmo quando a webcam fornece 4:3. A câmera pede 1280×720 e orienta quando a mão sai do quadro. Leitura incerta não gera voz. Isso corrige a entrada do modelo, sem demonstrar por si só melhora de acurácia ao vivo.

Foi treinada uma TCN de 39.861 parâmetros em 320 vídeos do [MINDS-Libras](https://zenodo.org/records/2667329), usando o [espelho do IBMEC SP](https://huggingface.co/datasets/ibmectech/minds-libras-raw). Pessoas 01, 02, 05, 06, 08 e 10 compõem o treino; 11 é usada para validação/escolha da época; 12 é reservada ao teste. As duas primeiras repetições de cada sinal foram usadas. Frames de uma pessoa não aparecem em outra divisão.

No teste com 40 vídeos de sinais da pessoa reservada, a classificação acertou **35/40 (87,5%)**. O critério fixo de confiança ≥ 0,85 e margem ≥ 0,30 aceitou **20 previsões, todas corretas**, deixando 20 sem fala. A simulação da segmentação usada no painel reproduziu 20 respostas corretas e 20 abstenções. Em outros 18 vídeos de seis sinais fora do vocabulário, não houve fala. Esses números não garantem acurácia semelhante na webcam: só há uma pessoa no teste principal, fundo controlado e poucos exemplos de sinais desconhecidos. A recusa de previsões pode atingir sinais treinados, dependendo da pessoa. O resultado não é comparável diretamente ao antigo teste de 18 vídeos, pois a base e o vocabulário mudaram.

O modelo está incluído e habilitado como **experimental**, com esse alcance visível no painel. Não traduz conversa contínua. Pode confundir sinais; a confiança do modelo não é garantia de correção. Nenhum filtro de palavrões foi adicionado: a limitação é o vocabulário e a precisão do reconhecimento. Palavras digitadas são passadas diretamente à voz.

Relatórios: `treinamento/resultado-holistic.json` (treino e teste por vídeo), `treinamento/resultado-fluxo-tcn.json` (segmentação e sinais desconhecidos). Os vídeos e checkpoints de pesquisa ficaram na pasta temporária do computador. A extensão contém apenas modelos e código; não contém os vídeos de treinamento.

## Áudio e privacidade

A captura usa PCM mono via AudioWorklet. O Silero VAD analisa blocos de 32 ms e envia a fala após cerca de **480 ms de pausa**. Depois de seis segundos de trecho, aceita uma pausa de 160 ms; o limite duro é **12 segundos**. Fala sem pausas além disso ainda pode ser dividida no meio de uma palavra. O Whisper começa a carregar ao entrar no modo de voz. Isso reduz esperas do fluxo anterior, mas a latência final inclui inferência, rede e animação do VLibras.

O microfone solicita cancelamento de eco e supressão de ruído do Chrome, com ganho automático desligado para não amplificar sons distantes. O VAD distingue atividade de fala de parte dos ruídos; **não identifica a voz do usuário nem separa pessoas falando ao fundo**. Fale perto do microfone. A captura da guia inclui as vozes presentes nela.

**Desligar microfone**, **Parar áudio da guia**, **Limpar** ou trocar para a câmera encerram a captura e cancelam as transcrições pendentes. O texto já confirmado é preservado ao desligar a captura. O avatar sinaliza em ordem, sem cortar uma frase para iniciar outra. Filas excessivas pausam a captura e mostram aviso. Os campos guardam os últimos 500 caracteres.

Câmera, detecção de fala e síntese de voz rodam localmente. A transcrição **Local**, selecionada por padrão, também roda no computador. A opção **Resposta rápida** usa a API SpeechRecognition do Chrome e pode enviar áudio aos servidores do serviço; ela só é iniciada depois de o usuário selecionar essa opção e ligar o microfone. O código não filtra palavras; a transcrição recebida depende do motor escolhido. Enquanto a escuta estiver ligada, **cada trecho de texto confirmado é enviado ao serviço VLibras**. O avatar é carregado do site VLibras. Os vídeos da câmera não são enviados pelo código da extensão.

Foi corrigida a leitura do evento Unity do avatar: o iframe envia cinco campos, incluindo animação de intervalo no terceiro e carregamento no quarto. O painel aceita também o evento antigo de três campos. A fila respeita pausas/carregamentos e avança ao fim do trecho. Até 100 traduções de textos idênticos ficam em memória durante a sessão. O console registra somente tempos de transcrição e de início da animação para diagnóstico, sem incluir o texto dessas mensagens.

Na 0.5.0, **Tentar novamente** após falha apenas de tradução mantém o Unity carregado e o trecho atual em andamento. O avatar tem **Pausar/Retomar** e velocidades 0,5×, 1×, 1,5× e 2×, usando os comandos documentados no [adaptador oficial do VLibras](https://github.com/spbgovbr-vlibras/vlibras-player-webjs/blob/master/src/PlayerManagerAdapter.js). A velocidade altera a duração da animação; não acelera o Whisper ou a API. **Parar voz** interrompe o áudio local e mantém a mensagem. Os parciais do modo rápido preservam trechos anteriores ao índice alterado. A câmera ajusta a sobreposição ao mudar a resolução, destaca as pontas dos dedos e orienta quando as mãos estão pequenas no quadro.

## Dispositivos e avatar · 0.5.1

Abra **Câmera, microfone e saída de som** no início do painel. Escolha a câmera, a entrada de áudio e o fone/alto-falante. Se a lista estiver incompleta, use **Permitir e listar**, autorize o acesso e depois **Atualizar lista**. As permissões temporárias usadas para listar são liberadas imediatamente. A escolha fica salva neste perfil; a câmera e o microfone são trocados ao vivo, encerrando a captura anterior. A seleção controla o tradutor; o Meet tem suas próprias configurações. **Ouvir guia** continua usando o áudio da guia escolhida.

A saída da voz local usa `AudioContext.setSinkId`. Se a saída escolhida falhar, o painel avisa e não inicia a voz em outro dispositivo. Trocar ou desconectar a saída interrompe o áudio em andamento; use **Testar som** para conferir a nova escolha. Um navegador sem essa API usa a saída padrão do Windows e mostra essa limitação. A transcrição rápida usa a faixa do microfone escolhido no Chrome desktop 135 ou posterior; versões anteriores precisam da transcrição **Local** para usar uma entrada específica. Câmera/microfone desconectados não são substituídos silenciosamente por outro dispositivo.

O avatar agora seleciona explicitamente o personagem com `Change("icaro")`, após os mesmos 500 ms usados na inicialização do [widget oficial 7.12.2](https://vlibras.gov.br/app/vlibras-initial-CMx6VRWn.js). A fila também aceita `playing` enquanto o próximo sinal está carregando e acompanha `counter_gloss`. Após 15 s sem confirmação de início, mostra uma falha recuperável em vez de manter “Preparando…” indefinidamente. **Tentar novamente** preserva o trecho. **Testar “Tudo bem?”**, em Voz → Libras, verifica o caminho texto → tradução → avatar sem depender do microfone. A escolha do personagem e os eventos foram verificados por testes simulados; a animação real no Chrome continua pendente.

## Cadastro e legendas · 0.5.2

O cadastro mostra três etapas: **Nome**, **Três gravações** e **Teste final**. A contagem regressiva funciona por relógio, sem depender de receber um novo quadro do detector. A imagem fica livre para acompanhar as mãos durante a gravação; uma faixa informa quando sinalizar e quanto tempo ainda há. Depois de cada tentativa, o botão sobre a câmera permite continuar sem voltar ao formulário. Cancelar, trocar de câmera ou sair do modo encerra a captura e a contagem.

A legenda conserva apenas as palavras ou nomes reconhecidos. Avisos de enquadramento e de leitura incerta aparecem abaixo da câmera. O indicador **Falando: …** aparece durante o áudio; depois desaparece, mantendo a conversa aberta. Não há título “Legenda em português” nem mensagem de conclusão sobre a imagem. Repetir o sinal de um nome gera outra fala após a pausa entre movimentos. Use **Testar som** para conferir a saída.

O projeto usa **Libras, a Língua Brasileira de Sinais**, incluindo cadastros pessoais usados nesse contexto. O modelo geral continua baseado nos vídeos de Libras citados acima; esta atualização de interface não adiciona vocabulário nem valida linguisticamente os sinais cadastrados. A confirmação testa a correspondência do movimento com os exemplos.

## Vozes neurais · 0.6.0

Escolha **Dora · feminina** ou **Alex · masculina**, vozes brasileiras do Kokoro v1.0. O antigo áudio robótico do eSpeak foi substituído; a biblioteca agora prepara apenas os fonemas. Há 25 falas prontas por voz para evitar a inferência inicial dos sinais básicos. Nomes novos são preparados durante o cadastro e guardados em cache na sessão. A primeira geração de texto novo pode levar alguns segundos; não se garante fala instantânea para qualquer texto.

Para adicionar outro perfil brasileiro compatível, copie um arquivo com nome novo `pf_nome.bin` ou `pm_nome.bin` para **`vozes/perfis/`**, recarregue a extensão e use **Atualizar vozes**. O Chrome 122+ descobre a pasta sem editar código. Estrutura, formatos, licenças e tempos medidos estão em [vozes/README.md](vozes/README.md). MP3/WAV e modelos de outro motor não são perfis Kokoro.

## Verificações

- Na 0.8.3, **150 testes passaram**: incluem câmera aberta antes da conexão, configuração durante permissão/carregamento do vídeo, isolamento de áudio de sessões antigas e espera da inicialização do Unity antes de capturar o avatar. Câmera, WebGL e transporte usam APIs simuladas; a recepção em chamada real continua pendente.

- Na 0.8.2, **141 testes passaram**, incluindo sete regressões da recuperação do Meet: consulta direta de guias, falha inicial, tentativas limitadas, respostas antigas, prazos e limpeza dos temporizadores. A composição da câmera continua verificada com mídia simulada; a recepção por outro participante ainda não foi validada em chamada real.

- Na 0.8.1, `node --test tests/*.test.mjs` passou nos **134 testes**, incluindo o botão de microfone, cancelamento durante permissão/carregamento, catálogo de 22.498 glosas e reprodução direta no avatar local e no roteamento do Meet. DOM, câmera, microfone e avatar usam APIs simuladas nessa suíte. As consultas HTTP ao índice e a um bundle oficial foram conferidas separadamente; não houve teste visual no Chrome nem chamada real.

- **Rastreamento 0.6.1:** Lite continua recomendado; Full e Heavy são opções experimentais em **Câmera, microfone e saída de som → Leitura da câmera**. Os pacotes personalizados substituem somente a pose Lite do Holistic por BlazePose Full/Heavy, mantendo os modelos de mãos e rosto. No ensaio, os modelos maiores perderam um exemplo de Oi; Heavy também gerou uma fala errada. [Resultados, origem e reprodução](modelos/rastreamento/README.md). O navegador tenta aceleração gráfica, com recuperação por CPU se a criação ou o primeiro quadro falhar; esse caminho foi testado com APIs simuladas. Trocar o rastreador não adiciona sinais de Libras; confira novamente os cadastros pessoais.

- `node --test tests/*.test.mjs`: fluxo de modos, legenda/voz sem censura, silêncio, filas, cancelamento e descarregamento de áudio. Os testes de interface usam objetos simulados.
- `tests/testar_vad_local.mjs`: Silero real em ONNX CPU e também no WASM distribuído com a extensão, executados no Node. Dez segundos de ruído artificial não geraram transcrição; duas frases sintetizadas foram transcritas como “Bom dia, tudo bem.” e “Eu preciso de ajuda.”. Isso não mede microfone real ou desempenho no Chrome.
- `tests/verificar_paridade_tcn.mjs`: compara as probabilidades da implementação JavaScript com a referência PyTorch, com tolerância de 0,00001.
- `tests/verificar_fluxo_tcn.mjs`: simula os landmarks dos vídeos pela mesma segmentação e rede usadas no painel. Não é uma chamada no Meet.
- `tests/testar_sintese_local.mjs`: usa o motor de voz WASM real e verifica duração, amostras finitas e áudio não silencioso para “Oi”, frase de teste, um palavrão, “Gabriel”, “João” e “Ana Clara”. Os nomes foram sintetizados em cerca de 2–4 ms; a verificação não comprova som nos alto-falantes. Relatório `treinamento/resultado-sintese.json`.
- `tests/testar_transcricao_wasm.mjs`: roda Silero, bundle Transformers.js e Whisper WASM da extensão no Node, com uma thread. As duas frases levaram aproximadamente 1,95 e 1,79 s para transcrever, mais 1,69 s de carregamento inicial. Isso explica parte da espera local e não mede desempenho no Chrome/Meet. Relatório `treinamento/resultado-whisper-wasm.json`.
- Na 0.7.0, `node --test tests/*.test.mjs` passou nos **49 testes**, incluindo perda parcial das mãos, sinais rápidos/lentos, descarte de movimentos longos, revisão manual do Qwen, cancelamento, validação de PCM e limite de fila do serviço local. Câmera, microfone e navegador usam APIs simuladas nessa suíte; os ensaios de modelos e HTTP reais estão documentados separadamente.
- No registro histórico da 0.6.1, 39 testes automatizados passaram, incluindo cadastro, contagem, repetição do mesmo nome, troca de voz, descoberta de arquivos, cancelamento antes da criação do worker, falas prontas, recorte sem palavras extras, troca de rastreador e recuperação de GPU/CPU no primeiro quadro. A interface, câmera e serviço rápido usam APIs simuladas nesses testes.
- `tests/testar_saudacao_videos.mjs`: ensaio do reconhecedor Oi com vetores reais dos vídeos; relatório exploratório em `treinamento/resultado-saudacao-oi.json`.
- `tests/testar_vozes_neurais.mjs`: Kokoro q8 real no mesmo ONNX WASM distribuído. O teste atualizado de Oi está em `treinamento/resultado-oi-voz-wasm.json`; os demais ensaios em `resultado-vozes-neurais.json`. Não verifica alto-falantes.
- `tests/testar_pronuncia_neural.mjs`: conferência auxiliar do PCM com Whisper. Acertou Oi e Gabriel nas duas vozes; houve erro na frase maior da voz feminina. Não substitui avaliação humana de naturalidade ou pronúncia. Relatório `treinamento/resultado-pronuncia-neural.json`.
- `tests/testar_armazenamento.mjs`: persistência entre clientes, renomeação, pausa, exclusão, importação atômica e concorrência com fake-indexeddb 6.2.8 no ambiente temporário. É uma implementação de teste da API, não o armazenamento de um Chrome em uso.
- `tests/testar_dicionario_videos.mjs`: usa vetores reais MediaPipe e as mesmas regras de cadastro, segmentação e comparação da extensão. Relatórios separam desenvolvimento e a segunda pessoa usada no ensaio final.
- `node tests/testar_servico_vlibras.mjs`: consulta a API real com “Tudo bem?”, “Como você está?” e “Bom dia, tudo bem?” e verifica os bundles Unity correspondentes, incluindo o cabeçalho CORS para o iframe. Relatório `treinamento/resultado-vlibras.json`. Não executa o avatar; a tradução de “Como você está?” devolvida pelo serviço foi `COMO VOCÊ BOM [INTERROGAÇÃO]`, sem revisão linguística neste teste.
- **Pendente:** teste visual no Chrome, câmera/microfone reais e chamada com outro participante. O controle automatizado do navegador foi bloqueado nesta sessão; esses testes não foram declarados como realizados.

## Agentes e modelos de IA

**Estado atual · 0.8.4:** a extensão usa modelos especializados e possui um **auxiliar Qwen opcional, integrado para revisão manual de texto**. Ele não conduz a conversa, não reconhece os sinais da câmera e não reescreve automaticamente o que chega ao avatar ou à voz.

### Componentes já usados

| Componente | Função no projeto | Onde funciona e como configurar |
| --- | --- | --- |
| **MediaPipe Tasks Vision · Holistic, com Full/Heavy opcionais** | Localiza mãos, dedos, corpo e rosto. Os pacotes personalizados ampliam o modelo de pose corporal; os modelos de mãos e rosto são os originais. Não traduz Libras sozinho. | Local. Lite é o padrão em `modelos/holistic_landmarker.task`; os experimentais ficam em `modelos/rastreamento/`. Escolha **Leitura da câmera**. [Resultados e limites](modelos/rastreamento/README.md), [integração](painel/reconhecimento.js), [documentação oficial](https://developers.google.com/edge/mediapipe/solutions/vision/holistic_landmarker). |
| **TCN de sinais de Libras** | Analisa sequências de movimento e reconhece o vocabulário experimental de 20 sinais isolados. Não traduz conversa livre. | Local, em `modelos/sinais/tcn.json`; já incluída. Veja [modelo e limites](modelos/sinais/README.md), [execução](painel/tcn.mjs) e [treinamento](treinamento/README.md). |
| **Dicionário pessoal com DTW** | Compara movimentos com os exemplos cadastrados para nomes e termos. É um algoritmo de comparação temporal, não um agente generativo. | Local, no perfil do Chrome. Configure em **Meus sinais**; [código](painel/dicionario-pessoal.mjs). Os cadastros pessoais não acompanham o GitHub. |
| **Silero VAD v6.2** | Detecta atividade de fala para separar trechos de áudio. Não identifica quem fala nem isola uma pessoa de outras vozes. | Local, em `modelos/silero_vad.onnx`; já incluído. [Integração](painel/detector-fala.mjs), [documentação oficial](https://github.com/snakers4/silero-vad/tree/v6.2). |
| **Whisper q8 · Base, Tiny e Small opcional** | Transcreve áudio em português. Base é o padrão; Tiny reduz processamento; Small exige mais recursos. | Local: Navegador/WASM ou serviço CPU acelerado opcional. Base/Tiny incluídos; Small instalado separadamente. [Instalação, comparação e limites](modelos/TRANSCRICAO.md), [worker](painel/transcricao-worker.js), [serviço](scripts/transcricao-local.mjs). |
| **Kokoro-82M v1.0 · Dora e Alex** | Gera voz neural em português brasileiro. Spellophone/eSpeak NG prepara os fonemas. | Local, em `vozes/`; escolha o perfil em **Voz do tradutor**. [Instalação e novos perfis](vozes/README.md), [integração](painel/voz.js). |
| **VLibras** | Traduz o texto em português e apresenta a sinalização pelo avatar. A biblioteca permite consultar 22.498 glosas oficiais e reproduzi-las diretamente. O reconhecimento da câmera é outro componente. | Serviço externo, com internet; já conectado no modo **Voz → Libras**. [Biblioteca e atualização](modelos/BIBLIOTECA-LIBRAS.md). [Integração](painel/vlibras.js), [projeto oficial](https://www.gov.br/governodigital/pt-br/acessibilidade-e-usuario/vlibras). |
| **SpeechRecognition do Chrome · Resposta rápida** | Alternativa de transcrição fornecida pelo navegador. | Opcional; selecione **Resposta rápida** e ligue o microfone. Pode enviar áudio ao serviço de voz do Chrome. [Integração](painel/fala-rapida.mjs). |
| **Ollama + Qwen3.5 4B** | Sugere pontuação, acentos e maiúsculas, somente quando solicitado. A validação rejeita mudanças na sequência de palavras normalizadas; sugestões podem errar e exigem revisão humana. | Adaptador incluído em [painel/auxiliar-local.mjs](painel/auxiliar-local.mjs); aplicativo e pesos instalados separadamente. Use **Revisão opcional com Qwen**, conforme o guia abaixo. |

Os modelos locais já incluídos funcionam ao carregar a pasta completa da extensão no Chrome. **Ollama e Python não são necessários para câmera, vozes e transcrição no navegador.** Ollama é exigido apenas pela revisão opcional; Node.js/npm, apenas pelo serviço acelerado e pelas ferramentas de desenvolvimento. As ferramentas de treinamento são para desenvolvimento. O desempenho varia conforme o computador; rastrear os dedos não demonstra compreensão da língua.

**Qwen instalado e testado no computador de desenvolvimento:** `qwen3.5:4b-q4_K_M`, Ollama 0.40.16, execução em CPU. Duas respostas curtas em português levaram 8,37 s no primeiro uso (7,13 s de carregamento) e 1,59 s com o modelo carregado; o primeiro texto apareceu em 7,76 s e 0,91 s, respectivamente. O Ollama informou aproximadamente 3,08 GB para o modelo carregado, sem VRAM; isso não é a memória total do processo. [Relatório e limites](treinamento/resultado-ollama-local.json), [reproduzir o teste](treinamento/testar_ollama.py). Não foi testada tradução de Libras por Qwen. Esse ensaio inicial é histórico. Na 0.7.0, o adaptador real de revisão foi executado no Node: 13,25 s na primeira solicitação e 5,67 s com o modelo carregado. Preservou nome, negação, palavrão e número no exemplo testado. [Relatório da revisão](treinamento/resultado-auxiliar-local.json), [reprodução](treinamento/testar_auxiliar_local.mjs). Não verifica acesso da extensão pelo Chrome; quem clona precisa instalar Ollama e Qwen.

### Instalar e testar Ollama com Qwen no Windows

Este procedimento instala o modelo usado pelo auxiliar de revisão da 0.7.0. O teste de terminal abaixo verifica uma resposta de texto; depois configure a origem da extensão e use os botões do painel. Não testa Libras, webcam ou Meet.

1. Baixe o instalador em [Ollama para Windows](https://ollama.com/download/windows), instale e abra o aplicativo. Depois abra um novo PowerShell. Consulte os [requisitos oficiais do Windows](https://docs.ollama.com/windows).
2. Confira a instalação:

   ```powershell
   ollama --version
   ```

3. Baixe a versão compactada escolhida e confira a lista:

   ```powershell
   ollama pull qwen3.5:4b-q4_K_M
   ollama list
   ```

   O download é de aproximadamente **3,3 GB** no [catálogo oficial](https://ollama.com/library/qwen3.5:4b-q4_K_M). O consumo de RAM durante o uso é maior e depende do contexto. O modelo tem licença Apache-2.0; executar essa versão local não exige chave nem tarifa de API. O primeiro download exige internet; o uso posterior do modelo baixado pode ser local. Não há medição de desempenho deste modelo junto com Meet e os outros modelos do projeto.

4. Para conversar pelo terminal:

   ```powershell
   ollama run qwen3.5:4b-q4_K_M
   ```

   Digite uma pergunta em português. Use `/bye` para sair e continuar com o teste da API.

5. Com o aplicativo Ollama aberto, teste a API local no PowerShell:

   ```powershell
   $pedidoIA = @{
       model = 'qwen3.5:4b-q4_K_M'
       messages = @(
           @{ role = 'user'; content = 'Responda apenas: teste local concluido.' }
       )
       stream = $false
       think = $false
       options = @{ num_ctx = 2048; num_predict = 80 }
   } | ConvertTo-Json -Depth 6

   $respostaIA = Invoke-RestMethod -Method Post -Uri 'http://127.0.0.1:11434/api/chat' -ContentType 'application/json; charset=utf-8' -Body ([System.Text.Encoding]::UTF8.GetBytes($pedidoIA)) -TimeoutSec 180
   $respostaIA.message.content
   ```

   Uma resposta de texto confirma que o serviço e o modelo estão acessíveis nesse computador. Não comprova reconhecimento de Libras. Referências: [instalação e uso](https://docs.ollama.com/quickstart), [API de conversa](https://docs.ollama.com/api/chat), [modelo e licença](https://huggingface.co/Qwen/Qwen3.5-4B).

**Se não funcionar:** se `ollama` não for encontrado, reabra o PowerShell depois de instalar. Se houver recusa de conexão na porta 11434, abra o aplicativo Ollama; para execução manual, use `ollama serve` em outro terminal somente quando o serviço não estiver rodando. Se o modelo estiver ausente, repita `ollama pull`. Para liberar a memória do modelo após o teste, use `ollama stop qwen3.5:4b-q4_K_M`.

### Conectar e usar Qwen na extensão

O adaptador já está em `painel/auxiliar-local.mjs`, com acesso a `http://127.0.0.1:11434/*` declarado no manifesto. Instalar o aplicativo e baixar os pesos continuam sendo etapas separadas em cada computador.

1. Copie o ID exibido em `chrome://extensions`.
2. Para permitir somente essa extensão, configure a origem exata no PowerShell, substituindo o marcador:

   ```powershell
   [Environment]::SetEnvironmentVariable('OLLAMA_ORIGINS', 'chrome-extension://COLE_O_ID_DA_EXTENSAO', 'User')
   ```

3. Feche o Ollama pela bandeja do Windows e abra novamente para ler a variável. Mantenha o serviço em seu endereço local padrão, `127.0.0.1:11434`. Alternativamente, com o aplicativo fechado, execute apenas nesse terminal:

   ```powershell
   $env:OLLAMA_ORIGINS = 'chrome-extension://COLE_O_ID_DA_EXTENSAO'
   ollama serve
   ```

4. Recarregue a extensão e reabra o painel. Em **Voz → Libras → Revisão opcional com Qwen**, clique em **Verificar Qwen**. Depois peça **Sugerir revisão**, confira a resposta e escolha se deseja usá-la no campo. Para enviá-la ao avatar, clique separadamente em **Sinalizar texto editado**.

A requisição tem limite de 45 segundos e usa `qwen3.5:4b-q4_K_M`, sem streaming, temperatura zero e contexto de 2.048 tokens. Limita o texto a 500 caracteres. A validação compara a sequência de palavras normalizadas, ignorando acentos e maiúsculas; troca, remoção ou acréscimo de palavras recusa a sugestão. Isso não garante que acentos/pontuação sugeridos preservem o sentido: a revisão humana continua necessária. Novo texto durante a consulta invalida a sugestão anterior. Não há censura lexical, nem envio automático da sugestão ao avatar ou à voz.

Neste computador, OLLAMA_ORIGINS foi configurado no escopo User com a origem exata e o serviço ocioso foi reiniciado. A API /api/tags respondeu HTTP 200 a uma requisição com essa origem. Outro perfil, pasta ou computador pode apresentar outro ID e exigir sua própria configuração. A chamada feita pelo Chrome ainda precisa de conferência real. Referências oficiais: [origens e rede](https://docs.ollama.com/faq), [API de conversa](https://docs.ollama.com/api/chat).

Qwen foi avaliado aqui somente como auxiliar de texto. Não foi validado para interpretar sinais de Libras, vídeos, transcrição de áudio ou tradução da reunião. A câmera continua dependendo do modelo temporal específico de Libras.

### O que acompanha o clone do GitHub

| Item | Acompanha o repositório? | O que outra pessoa precisa fazer |
| --- | --- | --- |
| Código da extensão, modelos atuais e bibliotecas locais versionadas | Sim | Clonar ou baixar o projeto completo e carregar a pasta com `manifest.json` no Chrome. Um repositório privado exige acesso concedido pelo proprietário. |
| Adaptador de revisão Qwen e scripts dos serviços locais | Incluídos no código local 0.7.0; acompanharão um clone após publicação | Instalar Ollama/Qwen para revisão; para transcrição acelerada, instalar Node.js/npm e iniciar o serviço com o ID da própria extensão. |
| Aplicativo Ollama e pesos do Qwen | Não | Cada pessoa instala e baixa no próprio computador seguindo o guia acima; configure sua origem exata. |
| Pesos Whisper Small e runtime Node acelerado | Não | Executar os instaladores opcionais descritos em [Transcrição local](modelos/TRANSCRICAO.md). Small está no `.gitignore`; o runtime é instalado fora do repositório. |
| Assistente de instalação automática do Ollama/Qwen | Ainda não existe | A preparação descrita aqui é manual. |
| Sinais pessoais e configurações do usuário | Não | Fazer o próprio cadastro ou importar um backup autorizado. |
| Chaves privadas de serviços de IA | Não | Na opção local descrita, não são necessárias. Uma futura API paga deve manter a chave no servidor, fora da extensão e do GitHub. |

Usar uma IA hospedada pode dispensar a instalação do modelo no computador do usuário, mas exige um serviço mantido por alguém e pode envolver custos e envio de dados pela internet. Essa modalidade também não está implementada.

**Ao adicionar ou trocar uma IA**, atualize este README com nome e versão, função, estado da integração, arquivos usados, instalação, configurações, licença, dados enviados, limites e testes realizados. Registre separadamente os resultados experimentais e o que foi validado no navegador.

## Estrutura e créditos

### Como outras pessoas usam a IA

Os modelos usados pela extensão ficam em `modelos/` e `vozes/`, acompanhados pelas bibliotecas em `vendor/`. Uma distribuição completa precisa incluir essas pastas e os avisos/licenças dos componentes. A versão local 0.7.0 inclui as funções descritas aqui; seu envio ao GitHub depende de solicitação do proprietário. Um clone contém apenas o que já foi publicado, não alterações locais pendentes.

Quem recebe o projeto completo carrega a extensão no Chrome e executa os modelos no próprio computador. As funções incluídas não exigem Python, PyTorch, vídeos de treino ou novo treinamento. Revisão Qwen e serviço de transcrição acelerada têm instalações opcionais separadas, descritas acima. As ferramentas Python são usadas apenas no desenvolvimento. O VLibras e a opção de voz rápida dependem de internet; o desempenho local varia conforme o computador. Um repositório privado exige acesso concedido pelo proprietário, ou distribuição de um ZIP completo. Os vídeos e checkpoints experimentais da pasta temporária não são incluídos automaticamente no GitHub.

- `painel/`: interface, rastreamento, TCN, legenda, voz, VAD, transcrição e avatar.
- `modelos/`: MediaPipe Holistic, Silero VAD v6.2, TCN treinada, Whisper Base/Tiny e guia do Small opcional. Os arquivos antigos de letras não são usados pelo painel.
- `vozes/`: modelo Kokoro, perfis brasileiros, falas preparadas, worker e documentação para incluir vozes.
- `treinamento/`: extração, treino reproduzível e relatórios. Veja seu README para comandos.
- `vendor/`: bibliotecas locais. As bibliotecas antigas do Teachable Machine permanecem no disco, mas não são carregadas pela interface.
- `assets/`: logo circular aprovada e ícones.

O rastreamento usa [MediaPipe Holistic](https://developers.google.com/edge/mediapipe/solutions/vision/holistic_landmarker). O detector de voz é [Silero VAD](https://github.com/snakers4/silero-vad/tree/v6.2), sob MIT; o ONNX Runtime local é a versão `1.22.0-dev.20250409-89f8206ba4`, sob MIT. O áudio de saída usa [Kokoro v1.0](https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX), sob Apache-2.0, com perfis brasileiros; [Spellophone/eSpeak NG](https://github.com/Spelling-Creator/spellophone), sob GPL-3.0-or-later, prepara os fonemas. A transcrição usa Whisper q8 com Transformers.js: Base padrão, [Tiny](https://huggingface.co/onnx-community/whisper-tiny/tree/ff4177021cc41f7db950912b73ea4fdf7d01d8e7) e Small opcional. [Origem, licenças e instalação](modelos/TRANSCRICAO.md).

As mãos da marca foram adaptadas do [símbolo Acessível em Libras da UFMG](https://www.ufmg.br/marca/libras/). O projeto original foi adaptado do exemplo [Global Side Panel](https://github.com/GoogleChrome/chrome-extensions-samples/tree/main/functional-samples/cookbook.sidepanel-global). O VLibras faz tradução de português para Libras; o reconhecimento de sinais da câmera é um componente separado.
