# EQT-Libras: candidato de pesquisa reprovado · 0.8.1

**Este candidato não foi aprovado nem integrado à câmera.** O experimento avaliou 48 classes selecionadas; os resultados não permitem anunciar essas classes como vocabulário funcional da extensão. O modelo distribuído anteriormente foi preservado. Relatório: [resultado-eqt-081.json](resultado-eqt-081.json).

## Origem e licença

Dados: **LIBRAS-EQT-UECE**, de João M. M. Moraes e colaboradores, UECE/Equatorial, revisão fixada no [registro Zenodo 21398895](https://zenodo.org/records/21398895). A [publicação dos autores](https://doi.org/10.1109/ACCESS.2026.3715086) descreve 55 sinais isolados e 123 sequências. O pacote contém ambos os tipos; uma pasta com uma frase não foi transformada em uma palavra de treino.

A licença da revisão consultada é **[CC BY-NC 4.0](https://creativecommons.org/licenses/by-nc/4.0/)**, conforme o [LICENSE.txt da fonte](https://zenodo.org/records/21398895/files/LICENSE.txt?download=1). Exige atribuição, indicação de modificações e uso não comercial. Os dados e o candidato desta pesquisa ficam fora da extensão, na pasta temporária. Treinar ou gerar os arquivos não autoriza sua publicação automática ou uso comercial.

Arquivo fixado:

| Item | Valor |
| --- | --- |
| Pacote | `Landmarks.zip` |
| Tamanho | 773.596.409 bytes |
| MD5 publicado e conferido | `415a18d9be6d65468bcf92db5e940df8` |
| Ramo usado | `Landmarks/Libras-EQT-UECE (Landmarks)/` |
| Inventário desse ramo | 5.335 arquivos NPY, 178 rótulos |
| Ramo de mãos separado | Usado somente para conferir equivalência; não duplicado no treino |

## Seleção e divisão dos dados

A lista de 48 IDs foi fixada antes de avaliar o candidato, usando `ISOLATED_ITEM_IDS` do pacote **datasets-islr-libras 0.1.0**, publicado por Giovanne Mariano: [código de origem](https://github.com/giolucasd/datasets-islr-libras), [documentação do pacote](https://pypi.org/project/datasets-islr-libras/). Essa curadoria considera alguns rótulos com mais de uma palavra como um sinal isolado e difere dos 55 sinais do artigo. Não houve seleção de classes por acurácia deste experimento.

O preparo gerou **1.439 amostras de 48 classes**. URGÊNCIA possui cinco gravações do informante local 5, em vez de seis. As outras combinações selecionadas possuem seis gravações por item/informante.

| Divisão | Rótulos locais de informante | Gravações |
| --- | --- | ---: |
| Treino | 1, 2 e 3 | 864 |
| Validação e escolha de época | 4 | 288 |
| Teste, consultado após escolher a época | 5 | 287 |

**Os números de informante são locais a cada item.** Um número pode designar pessoas físicas diferentes entre itens, e uma pessoa pode aparecer com números diferentes. Essa divisão mantém as execuções do mesmo item/informante separadas; não garante pessoas físicas inteiramente inéditas no teste. Quadros do mesmo arquivo não são separados entre divisões. A deduplicação exata por hash dos vetores não encontrou arquivos repetidos entre as 1.439 amostras; ela não identifica toda duplicação visual ou identidade compartilhada.

Classes selecionadas, preservando os rótulos da fonte:

AINDA; ANTERIOR; AVANÇAR; Alguns; COMUM; Cadastrar; Cair; Casa toda; Cômodo; Data; Digital; Energia; Está errado; Faltar; HAVER; Informar; Instável; Intervenção; Ir para o fim; JÁ; Luz; Luz oscilando; Mais; Menos; Mesmo; Motivo; Não quero; Não sei; Oscilar; PAGO; PRÓXIMA; Poste; PÁGINA; Página anterior; Quero; Raio; Religar; Rua; Serviço; Sim; Solicitar; Terceiros; Toda; URGÊNCIA; Vencimento; e-mail; whatsapp; Árvore.

## Conversão de 318 para 156 atributos

O contrato foi identificado nos NPY, conferindo valores, posições de punhos e os arquivos correspondentes de mãos. Os intervalos abaixo são índices de colunas, com início incluído e fim excluído:

| Colunas de origem | Conteúdo | Uso no candidato |
| --- | --- | --- |
| `[0, 168)` | Coordenadas faciais reduzidas | Excluídas |
| `[168, 192)` | Ombros, cotovelos e punhos: índices MediaPipe 11–16, com x/y/z/visibilidade | 24 atributos normalizados |
| `[192, 318)` | Duas mãos, 21 pontos x/y/z por mão | 132 atributos após transformação |

Por mão, o perfil usa presença (1), punho relativo aos ombros (2) e forma dos 21 pontos relativa ao punho (63), totalizando 66 atributos. O centro é o meio dos ombros; a escala é sua distância, com mínimo 0,05. A forma da mão usa a distância punho–ponto 9, com mínimo 0,02. O z do corpo recebe fator 0,2; o z da forma da mão recebe fator 0,3. Valores são limitados a `[-5, 5]`, como no contrato existente. Mãos ausentes continuam ausentes. Nariz, quadris e pontos faciais não são completados.

O perfil é **`eqt-maos-bracos-v1`**, com 156 atributos. A transformação equivalente sobre os 228 atributos existentes é:

```javascript
[...atributos.slice(4, 28), ...atributos.slice(36, 168)]
```

Em uma amostra de 119 quadros, a conversão Python foi comparada ao resultado da função JavaScript `extrairAtributos` com esse recorte: **erro máximo 0**. Em um exemplar por classe, as 126 coordenadas finais do arquivo completo foram idênticas às do NPY de mãos correspondente: **48/48 comparações**. Isso verifica a transformação e a correspondência dos arquivos; não mede rastreamento da webcam ou equivalência entre versões do detector.

### FPS e proporção

Foi obtido por HTTP Range somente um vídeo RGB correspondente: `100_Cair/INFORMANTE 1/IMG_4868.mp4`. O OpenCV informou **1920 × 1080, 30 fps e 119 quadros**, coincidindo com os 119 quadros do NPY.

**Somente esse vídeo teve FPS e dimensões medidos.** Os parâmetros 30 fps e 16:9 foram aplicados às outras amostras como hipótese de captura comum, registrada no manifesto. Não foram conferidos individualmente. A correção geométrica mantém a mesma referência 16:9 usada pelo projeto.

## Treino e critérios fixados

O script [treinar_eqt.py](treinar_eqt.py) usa TCN causal com 48 canais, dilatações 1/2/4/8, entrada de 156 atributos e 32 passos. Foram gerados **48 rótulos mais “Sem sinal”**, com 37.777 parâmetros. Trechos reais de repouso permanecem na divisão da gravação original.

Protocolo fixado antes de consultar o teste:

- Semente `20261113`, CPU com quatro threads e operações determinísticas.
- Até 240 épocas; parada após 40 épocas sem melhora da perda de validação.
- Melhor época escolhida somente pela menor perda de validação.
- Confiança mínima **0,95** e margem entre as duas primeiras hipóteses **0,40**; não foram reduzidas para aceitar mais palavras.
- Ruído pequeno somente no treino; sem espelhar sinais.
- Uma tentativa de candidato; nenhuma promoção automática para o painel.

O ensaio de fluxo usa o `SegmentadorDeSinais` do projeto sobre os vetores previamente extraídos, reconstituindo apenas os seis pontos de braços e as mãos nos campos necessários. Não executa captura de pixels ou confirmação antecipada de Oi/sinais pessoais. O recorte temporal da TCN é comparável ao já existente.

## Resultado: rejeitado

A época 73 foi escolhida pela validação; foram executadas 113 épocas, em aproximadamente **207,34 segundos de treino** neste computador. O teste bruto acertou **151/287** sinais antes dos critérios de aceitação. Com os limites fixados, aceitou **6 respostas corretas**, recusou **281** e não aceitou palavras erradas nesse teste recortado.

Na simulação de segmentação, os 287 vídeos EQT de teste produziram **8 respostas corretas**, **279 recusas** e nenhuma palavra errada ou repetida. Os três exemplos externos de Sim foram recusados; por isso, o total de vídeos conhecidos do ensaio de fluxo é 290, com 8 acertos e 282 recusas.

Nos **62 exemplos externos sem rótulo compartilhado**, ocorreu **uma fala indevida**: um vídeo MINDS de Espelho foi classificado como COMUM. Os três vídeos de Sim, cujo rótulo está no vocabulário EQT, foram separados dos negativos. Esses caches externos já tinham sido usados no desenvolvimento de outras partes do projeto; não constituem um novo conjunto independente.

**A cobertura aceita foi baixa e houve uma fala indevida fora do vocabulário. O candidato foi reprovado e permanece sem integração à extensão.** Não representa uma ampliação funcional de 20 para 48/68 sinais na câmera. O [relatório integral](resultado-eqt-081.json) registra previsões, recusas, negativos, classes, protocolo e hashes.

## Reprodução local

Execute os comandos na raiz do repositório. O ambiente usado já existia em `%TEMP%/libras-test-venv`: Python 3.12.10, NumPy 2.5.4 e PyTorch 2.15.0+cpu. A conferência do único RGB usou OpenCV contrib 5.0.0.93. O preparo dos NPY requer NumPy; o treino requer NumPy, PyTorch e Node.js. Os comandos abaixo reutilizam esse ambiente; não instalam dependências nem modificam o modelo distribuído.

```powershell
$eqtRaiz = Join-Path $env:TEMP 'libras-eqt-081'
$eqtPython = Join-Path $env:TEMP 'libras-test-venv/Scripts/python.exe'
New-Item -ItemType Directory -Path $eqtRaiz -Force | Out-Null

# Execute os downloads somente se os arquivos ainda não existirem.
curl.exe --location --fail --output "$eqtRaiz/Landmarks.zip" 'https://zenodo.org/records/21398895/files/Landmarks.zip?download=1'
curl.exe --location --fail --output "$eqtRaiz/LICENSE.txt" 'https://zenodo.org/records/21398895/files/LICENSE.txt?download=1'

$eqtMd5 = (Get-FileHash -LiteralPath "$eqtRaiz/Landmarks.zip" -Algorithm MD5).Hash.ToLowerInvariant()
if ($eqtMd5 -ne '415a18d9be6d65468bcf92db5e940df8') { throw 'Pacote diferente da revisão fixada.' }

& $eqtPython treinamento/preparar_eqt.py --zip "$eqtRaiz/Landmarks.zip" --saida "$eqtRaiz/dados156" --fps 30 --proporcao 1.7777777777777777

& $eqtPython treinamento/treinar_eqt.py --pasta "$eqtRaiz/dados156" --saida "$env:TEMP/libras-eqt-tcn-081" --externos "$env:TEMP"
```

O preparo grava NPZ e `manifesto.json` em `dados156`, incluindo caminhos de origem no ZIP, hashes e divisões. O treino grava candidato JSON, checkpoint PyTorch e arquivo de paridade em `%TEMP%/libras-eqt-tcn-081`; o relatório padrão é `treinamento/resultado-eqt-081.json`. Nenhum desses comandos habilita o candidato na extensão.

A avaliação externa completa também exige os caches históricos: `libras-tcn-holistic/fluxo.json`, `libras-oi/fluxo-oi.json`, `libras-oi/ines-camera.json` e `libras-oi/acenar.json`. Eles não acompanham o GitHub. Arquivos ausentes são registrados pelo script, e uma execução incompleta não reproduz o total de negativos informado acima. Não reutilize o relatório original como se os caches ausentes tivessem sido avaliados.

## Limites da conclusão

- O experimento mede reconhecimento de sinais isolados selecionados; não demonstra compreensão de frases livres.
- Rótulos locais de informante, detecção prévia de landmarks e FPS/proporção parcialmente conferidos limitam a comparação com uma webcam nova.
- Os exemplos externos foram extraídos por outro fluxo de rastreamento; a mudança de domínio pode afetar os resultados.
- O preparo exclui face, nariz e quadris; não mede contribuição de expressões faciais para o reconhecimento.
- Não houve validação com o usuário, webcam ao vivo, áudio reproduzido, interface do Chrome, avatar ou chamada do Meet neste experimento.
- Dados e candidato permanecem sujeitos à licença não comercial da fonte. O envio de alterações ao GitHub depende de solicitação explícita do proprietário.
