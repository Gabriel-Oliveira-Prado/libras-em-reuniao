# Vozes do Libras em Reunião

**Dora (feminina)** e **Alex (masculina)** são vozes neurais em português brasileiro, usando **Kokoro v1.0**. Escolha em **Voz do tradutor**, no modo Sinais → voz. A escolha fica salva no Chrome.

O áudio é reproduzido na aba com Web Audio e a saída escolhida no painel. Pode ser apresentado ao Meet com o áudio da guia. O eSpeak prepara os fonemas em português; sua antiga voz robótica não é usada na saída. A geração é local, sem serviço pago de voz ou envio do texto a um servidor de síntese.

## Adicionar uma voz sem editar código

1. Obtenha um **perfil brasileiro compatível com Kokoro-82M v1.0**, no formato `.bin`.
2. Copie-o com um **nome novo** para `vozes/perfis/`. Use `pf_nome.bin` para voz feminina ou `pm_nome.bin` para masculina. Exemplo: `pm_santa.bin`.
3. Recarregue a extensão, reabra o painel e clique em **Atualizar vozes**. A nova opção aparece automaticamente no Chrome 122+.

O leitor percorre todos os lotes da pasta da extensão com `chrome.runtime.getPackageDirectoryEntry`. Não é necessário editar uma lista em JavaScript. Em outro ambiente, `catalogo.json` contém as vozes distribuídas. MP3/WAV, modelos de outros motores e perfis de outros idiomas não são tratados como vozes brasileiras. Um áudio comum não ensina uma voz ao modelo. Use um identificador novo para evitar misturar um perfil substituído com as falas já preparadas.

## Organização

```text
vozes/
  perfis/                   # Novos perfis brasileiros .bin aqui
    pf_dora.bin
    pm_alex.bin
  modelos/
    kokoro-q8.onnx           # Modelo compartilhado entre as vozes
    tokenizer.json
    proveniencia.json       # Fontes e hashes
  falas/
    pf_dora/*.pcm            # Falas básicas prontas
    pm_alex/*.pcm
    catalogo.json
    proveniencia.json
  catalogo.mjs               # Descoberta dos perfis
  cliente.mjs                # Falas prontas e comunicação com o worker
  worker.js                  # Inferência fora da interface
  kokoro.mjs                  # Fonemas pt-br, tokens e ONNX
  recorte-oi.mjs              # Saudação curta sem falar palavras extras
```

PCM: mono Float32 little-endian, 24 kHz. Perfis: matrizes Float32 do Kokoro, não áudios. Não copie o modelo de 92 MB para cada voz: ele é compartilhado.

## Resposta e geração

As duas vozes incluídas têm **25 falas prontas**, cobrindo o vocabulário, Oi e a frase de teste. Elas são carregadas diretamente. Textos novos usam inferência no worker e cache da sessão de até 16 MB/80 textos. O cadastro prepara o nome nas duas vozes incluídas durante as gravações. Repetir um nome não é bloqueado por já ter sido falado.

A primeira síntese de um nome novo levou cerca de cinco segundos no ensaio WASM de uma thread; uma frase maior levou cerca de 13–14 s. A saudação atual levou cerca de 2,8–3,5 s sem cache e menos de 1 ms ao repetir. Os arquivos de fala pronta evitam essa inferência para o vocabulário incluído. Vozes adicionadas sem falas prontas podem demorar na primeira geração. Esses tempos foram medidos no Node, não no Chrome ou Meet. Não há substituição silenciosa pela voz robótica.

Enunciados extremamente curtos são uma limitação conhecida do Kokoro. Para Oi, o motor gera contexto e recorta **somente Oi** na primeira pausa. Sem uma pausa segura, apresenta erro em vez de falar a frase inteira.

## Preparar arquivos no desenvolvimento

`treinamento/gerar_falas_basicas.mjs` gera os PCM usando o modelo e fonemizador da extensão, com ONNX CPU no ambiente temporário. Preserva arquivos existentes; use `--forcar` após mudar o motor. `treinamento/preparar_oi_falado.mjs` refaz só a saudação. A instalação final não precisa de Node, Python ou ONNX nativo. Falas geradas durante o uso ficam em memória, sem alterar a pasta do projeto.

## Fontes e verificações

- [Kokoro v1.0 ONNX](https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX/tree/1939ad2a8e416c0acfeecc08a694d14ef25f2231), revisão fixada `1939ad2a8e416c0acfeecc08a694d14ef25f2231`.
- [Vozes e idiomas oficiais](https://huggingface.co/hexgrad/Kokoro-82M/blob/main/VOICES.md): `pf_dora` e `pm_alex` são os perfis brasileiros incluídos.
- [Misaki EspeakG2P](https://github.com/hexgrad/misaki/blob/main/misaki/espeak.py): referência de conversão de fonemas, adaptada para o eSpeak WASM local.
- Licenças Apache-2.0 em `LICENSE-Kokoro.txt` e `LICENSE-Misaki.txt`. A licença do eSpeak/Spellophone está em `vendor/spellophone/`.

O ASR auxiliar acertou Oi e Gabriel nas duas vozes depois do recorte; errou palavras da frase maior na voz feminina. Isso não substitui avaliação humana de naturalidade/pronúncia, nem confirma reprodução no alto-falante ou Meet. Relatórios em `treinamento/resultado-pronuncia-neural.json`, `resultado-vozes-neurais.json` e `resultado-oi-voz-wasm.json`.
