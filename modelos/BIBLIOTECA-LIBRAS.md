# Biblioteca oficial do VLibras

## Conteúdo e uso

A extensão inclui um índice de **22.498 glosas** na versão local 0.8.1. Glosas são identificadores de sinais e suas variações; esse número não corresponde a 22.498 palavras únicas nem a classes reconhecidas pela câmera.

Abra **Biblioteca de sinais do avatar**, procure uma palavra (acentos e espaços/underscores não precisam coincidir) e use **Ver sinal**. O painel muda para Voz → Libras e envia a glosa exata ao player, sem fazer uma nova tradução HTTP. Isso também funciona com o avatar conectado ao Meet. O microfone só liga pelo seu botão.

A lista de nomes está incluída em `modelos/biblioteca-vlibras.json`; as animações são carregadas do serviço VLibras conforme o uso. A consulta local à lista não envia texto da conversa. Para atualizar pelo painel, clique em **Atualizar biblioteca**: a consulta usa URL fixa, sem credenciais, com prazo e limites de tamanho; resultados inválidos mantêm a lista anterior. A atualização do painel vale para a sessão aberta.

## Origem verificada

- Fonte: `https://dicionario2.vlibras.gov.br/signs?version=2018.3.1`.
- O servidor redireciona para `https://dicionario2.vlibras.gov.br/static/TREES/2018.3.1.json`.
- Resposta: trie JSON; glosas são os caminhos até nós com `end=true`.
- Snapshot registra origem, versão, data, total e SHA-256 dos bytes recebidos. Não contém vídeos nem bundles Unity.
- A animação de Oi foi verificada por HTTP em `https://dicionario2.vlibras.gov.br/2018.3.1/WEBGL/OI`: resposta 200, assinatura UnityFS. Isso confirma a disponibilidade do arquivo; não verifica sua animação no navegador.

O [manual oficial](https://www.vlibras.gov.br/doc/widget/functionalities/dictionary.html) descreve o dicionário de animações. O [player oficial](https://github.com/spbgovbr-vlibras/vlibras-player-webjs/blob/master/src/config.js) define os serviços utilizados. Consulte o [projeto VLibras](https://www.gov.br/governodigital/pt-br/acessibilidade-e-usuario/vlibras/vlibras) para autoria, distribuição e documentação da suíte.

## Atualizar o snapshot do projeto

```powershell
node scripts/atualizar-biblioteca.mjs
```

O script recebe apenas o catálogo da origem oficial, valida sua estrutura e grava o snapshot de forma atômica. Glosas preservam os caracteres originais, inclusive acentos combinados; os rótulos de busca/visualização são separados. Limites: 5 MiB, 50 mil entradas, um milhão de nós e profundidade/comprimento máximos de 128; o catálogo examinado possui glosas de até 105 caracteres.

## Limites

A biblioteca é de animações para Português → Libras e consulta de sinais. Não oferece uma API de reconhecimento de webcam. Bases de sinais, pesos treinados e validação do reconhecedor são tratados separadamente.

A reprodução depende da disponibilidade da animação e do VLibras. O projeto mantém avisos de carregamento, falha e fila. A tradução automática e a execução dos sinais precisam ser avaliadas por pessoas fluentes em Libras.

`tests/biblioteca.test.mjs` verifica consulta, paginação, atualização, limites e cancelamentos; `tests/biblioteca-avatar.test.mjs` e os testes do Meet verificam reprodução direta e roteamento. Interface, Unity, áudio e APIs do Chrome são simulados nesses testes. A obtenção do catálogo e de um bundle foi testada por HTTP real, fora do navegador.
