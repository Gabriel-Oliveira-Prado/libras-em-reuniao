# Libras em Reunião

Protótipo de extensão para converter sinais em Libras em português falado durante reuniões online. O dicionário personalizado é parte do projeto e permitirá cadastrar nomes, apelidos e termos técnicos.

Nesta versão, o ícone da extensão abre um painel lateral em português. A captura pela webcam, o reconhecimento de sinais, o dicionário e o envio da voz para a reunião são etapas futuras.

## Testar no Chrome

1. Abra `chrome://extensions` e ative o **Modo do desenvolvedor**.
2. Clique em **Carregar sem compactação** e selecione a pasta `libras-em-reuniao`, que contém o `manifest.json`.
3. Abra a extensão **Libras em Reunião** pelo menu de extensões. O painel lateral também pode ser aberto ao lado de uma aba do Meet.

## Estrutura

- `manifest.json` define o nome, a versão e as permissões da extensão.
- `service-worker.js` configura o clique no ícone para abrir o painel.
- `painel/` contém o HTML e os estilos da interface.
- `assets/logo.svg` contém a marca circular. Os ícones PNG da extensão ficam em `assets/icones/`.

As duas mãos e as linhas de movimento da marca foram adaptadas do [símbolo Acessível em Libras, criado pelo Centro de Comunicação da UFMG](https://www.ufmg.br/marca/libras/). A adaptação usa as cores e o monograma do projeto.

Adaptado do exemplo oficial [Global Side Panel](https://github.com/GoogleChrome/chrome-extensions-samples/tree/main/functional-samples/cookbook.sidepanel-global), licenciado sob a [Apache License 2.0](LICENSE).
