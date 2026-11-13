# Transcrição local · 0.7.0

No modo Navegador, a extensão executa Whisper q8 com Transformers.js e ONNX WASM, em um worker separado. O modo opcional Acelerado neste computador usa ONNX CPU nativo por um serviço local. O áudio permanece no computador no modo **Local**. O modo **Resposta rápida** é um serviço diferente, oferecido pelo Chrome, que pode enviar áudio pela internet.

## Modelos

| Opção | Arquivos | Distribuição |
| --- | --- | --- |
| Tiny | `whisper-tiny/` | Já incluído; menor processamento |
| Base | `whisper-base/` | Já incluído nesta versão; padrão |
| Small | `whisper-small/` | Opcional; aproximadamente 249 MB mais configurações/tokenizador |

O Base usa o encoder de 23.201.314 bytes e o decoder mesclado de 53.693.315 bytes. A pasta tem um `ORIGEM.json` com revisão, tamanho e SHA-256 dos arquivos. O Small usa 92.326.160 e 156.750.845 bytes, respectivamente.

As conversões ONNX são de [onnx-community/whisper-base](https://huggingface.co/onnx-community/whisper-base/tree/27a07b4b52b3a4c5886134bb4320e93e1a4bbc7c) e [onnx-community/whisper-small](https://huggingface.co/onnx-community/whisper-small/tree/36050c46d777d46dc4b5f43f6d90574fc38f8732). Essas fichas declaram Apache-2.0. O [Whisper original](https://github.com/openai/whisper) publica código e pesos sob MIT. Os avisos MIT e Apache-2.0 acompanham o Base; preserve os avisos ao redistribuir.

## Instalar Small no Windows

Abra PowerShell na raiz do projeto:

```powershell
.\scripts\instalar-transcricao.ps1 -Modelo small
```

O script baixa da revisão fixada, confere os hashes dos pesos e grava a origem. Recarregue a extensão e reabra o painel. Em **Voz → Libras → Modelo da transcrição local**, escolha **Small**. A opção fica desativada enquanto a configuração local não é encontrada. Se a instalação foi interrompida e faltarem pesos, execute o instalador novamente.

A pasta Small fica no `.gitignore`: seus pesos não acompanham um clone comum. O instalador acompanha o código. O Base acompanha a distribuição completa e pode ser reinstalado com `-Modelo base`. O usuário final não precisa de Python ou Ollama para transcrição.

## Executar em Navegador ou Acelerado neste computador

**Navegador** é o padrão e usa o worker WASM incluído. Não exige Node.js, Python ou Ollama. Em **Voz → Libras**, escolha **Local**, o local de execução e o modelo. **Ouvir guia** também respeita essas escolhas locais.

**Acelerado neste computador** executa o mesmo Whisper q8 em ONNX CPU nativo, com quatro threads, por um serviço opcional no próprio PC. O áudio PCM vai apenas para `127.0.0.1:18271`; o serviço não consulta modelos remotos durante a inferência. Não envolve Qwen ou Ollama. Para instalar/iniciar:

1. Instale [Node.js com npm](https://nodejs.org/en/download). Abra um novo PowerShell na raiz do projeto.
2. Se quiser Small, execute o instalador descrito acima.
3. Copie o ID de 32 letras mostrado em `chrome://extensions` e substitua o marcador:

   ```powershell
   .\scripts\iniciar-transcricao-local.ps1 -IdDaExtensao COLE_O_ID_DA_EXTENSAO
   ```

4. O script instala `@huggingface/transformers@3.8.1` em `%LOCALAPPDATA%\LibrasEmReuniao\transcricao` e inicia Node em segundo plano, com janela oculta. A primeira instalação precisa de internet. O processo precisa continuar aberto; execute novamente quando precisar iniciar o serviço em outra sessão.
5. Recarregue a extensão, reabra o painel e escolha **Local → Acelerado neste computador**. Escolha Base, Tiny ou Small instalado e ligue o microfone ou **Ouvir guia**.

O serviço aceita somente o cabeçalho `Origin: chrome-extension://ID_INFORMADO`, sem curinga, e escuta apenas em `127.0.0.1`. Isso restringe o acesso da origem do navegador; não é autenticação contra outros programas do próprio computador. O ID pode mudar em outra instalação. Se mudar, inicie o serviço com o novo ID. O manifesto inclui o acesso ao endereço local.

O instalador informa PID e pasta dos logs. Os arquivos `servico.log`, `servico-erros.log` e `servico.pid` ficam na pasta de dependências acima. Se houver aviso de porta 18271 ocupada, já existe um processo nessa porta; confira o serviço aberto e seus logs antes de tentar outro. Se o serviço falhar, a extensão informa a falha; selecione **Navegador** para voltar ao processamento sem serviço adicional.

Para encerrar o serviço quando terminar:

```powershell
.\scripts\parar-transcricao-local.ps1
```

O comando confere o PID registrado e a linha de comando do processo antes de encerrá-lo. Para trocar o ID autorizado, encerre e inicie novamente com o novo ID. Os logs do serviço não registram o texto transcrito nem o áudio.

Neste computador, a instalação estável em LOCALAPPDATA foi concluída e o serviço foi iniciado com Small para o ID da extensão local. Isso não comprova a conexão pelo Chrome; em outro computador, siga a instalação e use o próprio ID.

O código do servidor/inicializador acompanha a versão local 0.7.0 e acompanhará o clone quando publicado. As dependências instaladas em LOCALAPPDATA e os pesos Small não acompanham o GitHub. Base/Tiny já incluídos atendem o uso no navegador. Veja a [documentação oficial do Transformers.js](https://huggingface.co/docs/transformers.js/index).

### Medição do processamento acelerado

Com os mesmos três WAV sintetizados em Maria Desktop — “Olá, tudo bem?”, “Onde é?” e “Gabriel, você pode repetir o que acabou de falar?” — o Small nativo teve:

| Medida | Resultado |
| --- | ---: |
| Frases com as mesmas palavras | 3/3 |
| Mediana de inferência CPU, quatro threads | 1,141 s |
| Mediana WASM, uma thread, mesmos arquivos | 11,791 s |
| Carregamento nativo | 2,152 s |
| Memória residente final do processo | 1,43 GiB |

A última frase perdeu a interrogação, mas manteve as palavras. O relatório [resultado-asr-nativo.json](../treinamento/resultado-asr-nativo.json) registra Transformers.js 3.8.1/ONNX Runtime Node 1.21.0 e os tempos individuais. A medição foi de inferência em processo independente; **não mede o acesso HTTP pelo Chrome, microfone, VAD, fila, avatar, Meet ou latência ponta a ponta**. Não garante o mesmo tempo para fala humana ou frases longas.

### Ensaio do serviço HTTP real

O adaptador HTTP da extensão e o servidor nativo foram executados de fato, pelo Node, nos mesmos três WAV. Em [resultado-servico-transcricao.json](../treinamento/resultado-servico-transcricao.json), as três respostas mantiveram as palavras:

| Frase | Inferência | Total HTTP |
| --- | ---: | ---: |
| Olá, tudo bem? | 2,032 s | 2,047 s |
| Onde é? | 1,694 s | 1,703 s |
| Gabriel, você pode repetir o que acabou de falar? | 2,068 s | 2,082 s |

O carregamento levou 3,416 s. Uma requisição com origem diferente foi recusada com HTTP 403. Esse ensaio do serviço levou aproximadamente dois segundos por trecho; é separado do benchmark direto de 1,141 s e não representa a latência total da conversa. Não executou Chrome, permissões, AudioWorklet real, microfone, avatar ou Meet.

## Resultado e limites

Em 16 frases sintetizadas por duas vozes do Windows, com as oito frases fixadas antes da comparação:

| Modelo | Frases sem diferença de palavras | Erros de palavras / total | WER | Mediana de inferência |
| --- | ---: | ---: | ---: | ---: |
| Tiny | 13/16 | 5/68 | 7,35% | 3,40 s |
| Base | 14/16 | 4/68 | 5,88% | 4,25 s |
| Small | 14/16 | 2/68 | 2,94% | 15,08 s |

Comparação ignora acentos, maiúsculas e pontuação. O Small acertou “Onde é?” nas duas vozes; acrescentou “o” em “Qual seu nome?” nas duas. Não é transcrição perfeita. Os testes usaram o WASM real, uma thread, Node e este computador; ocorreram durante desenvolvimento, sem isolamento completo de carga. Não são medições de microfone, sotaques humanos, Chrome ou Meet.

O Base é o padrão por compromisso entre fidelidade e atraso. O Small teve menor WER neste ensaio, mas não é instantâneo no WASM. A alternativa nativa acima reduz o tempo de inferência neste computador, sem mudar o modelo. O usuário pode escolher Tiny ou Resposta rápida se houver atraso.

A captura espera cerca de 480 ms de pausa. Depois de seis segundos, aceita uma pausa de 160 ms para preservar limites entre palavras. O limite duro é 12 segundos: fala ininterrupta além disso ainda pode ser dividida. O limite de fila interrompe captura atrasada, preservando trechos já recebidos; não descarta textos silenciosamente.

O texto confirmado é enviado diretamente ao VLibras, sem reescrita automática pelo Qwen. A sinalização do VLibras tem estrutura própria; sua correção linguística precisa ser avaliada por pessoas fluentes em Libras.
