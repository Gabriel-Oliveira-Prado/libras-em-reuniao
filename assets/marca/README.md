# Marca Libras em Reunião

## Arquivos de uso

- **Matriz editável:** [../logo.svg](../logo.svg), com camadas separadas para câmera, lente, balão, mãos e monograma LR.
- **PNG transparente:** [../logo.png](../logo.png), 1024 × 1024 px.
- **Ícones do Chrome:** [../icones/](../icones/), nos tamanhos 16, 32, 48, 128, 256 e 512 px.
- **Favicon:** [../favicon.ico](../favicon.ico), com imagens de 16, 32 e 48 px. O painel oferece também SVG e PNG de 32 px.

Só a área externa ao círculo é transparente. As mãos e as letras LR permanecem brancas. O SVG usa cores sólidas e pode ser aberto em editores vetoriais, como Inkscape.

| Elemento | Cor |
| --- | --- |
| Círculo / azul-marinho | `#11114E` |
| Corpo da câmera / roxo | `#846DC2` |
| Lente lateral / roxo escuro | `#5F4888` |
| Balão LR / lavanda | `#9D9FE6` |
| Mãos, movimento e LR / branco | `#FFFFFF` |

O painel mantém o branco predominante. Botões com texto branco usam roxo escuro (contraste aproximado de 7,58:1); o roxo médio fica principalmente nos detalhes. Os textos, estados e controles continuam identificados por palavras, além da cor.

## Editar e exportar

Edite `assets/logo.svg`. As camadas têm os IDs `lente`, `camera`, `balao`, `maos-e-movimento` e `monograma-lr`. Depois execute o exportador para atualizar os PNGs e o ICO a partir da mesma matriz.

As ferramentas abaixo são usadas apenas no desenvolvimento. A extensão não precisa de Node, Sharp ou Potrace para funcionar.

No PowerShell, a partir da raiz do projeto:

```powershell
npm install --prefix "$env:TEMP/libras-marca" --no-save --no-package-lock sharp@0.34.5 potrace@2.1.8
$env:NODE_PATH = Join-Path $env:TEMP 'libras-marca/node_modules'
node scripts/exportar-marca.mjs
```

O exportador grava `logo.png`, os seis ícones e `favicon.ico`. As dimensões são quadradas, com transparência preservada.

Para refazer a vetorização desde a imagem original:

```powershell
node scripts/vetorizar-logo.mjs
node scripts/exportar-marca.mjs
```

**Refazer a vetorização substitui alterações manuais no SVG.** Para mudar apenas cores ou caminhos já editados, use somente o exportador. O script de vetorização foi ajustado à composição desta referência, incluindo a posição das mãos e das letras; outra composição exige adaptar o script.

## Referências e preparação

- [referencia-original.png](referencia-original.png): imagem enviada pelo usuário, preservada como fonte. Seus contornos foram vetorizados com Sharp e [Potrace](https://github.com/tooolbox/node-potrace), mantendo as mãos e o LR e normalizando as cinco cores informadas.
- [referencia-recortada.png](referencia-recortada.png): rascunho de recorte feito com `image_gen.imagegen`. Não é carregado pela extensão. A versão final usa o SVG vetorizado da referência original, com cores sólidas exatas.

O fundo externo é removido a partir das bordas, preservando o branco interno. A matriz usa um círculo vetorial regular e caminhos separados para os demais elementos.

### Prompt do rascunho de recorte

Ferramenta: `image_gen.imagegen`, com a imagem original como referência e `transparent_background: true`.

```text
Use case: background-extraction. Edit target: the supplied Libras em Reunião logo. Prepare a clean production logo PNG with genuine alpha transparency only outside the circular navy badge. Preserve the provided logo design and layout exactly: circular navy badge, purple video camera body, darker purple right camera lens, the two white Libras hands and white motion marks, lavender lower caption balloon, and the white handwritten monogram LR. Keep both letters exactly 'LR'. Remove ONLY the off-white square background outside the navy circle. Make the badge a clean perfect circle, centered on a square canvas, with minimal transparent padding. Keep flat, solid fills, no shadows, no gradients, no mockups, no added border, no extra text. Exact palette: circular badge #11114E, camera body #846DC2, right lens #5F4888, LR caption balloon #9D9FE6, hands/motion marks/LR #FFFFFF. Preserve the contours of the two hands and their orientation. Deliver the standalone logo, not a sheet or presentation.
```
