# Reconhecimento experimental incluído

`tcn.json` é o candidato treinado por `treinamento/treinar_holistic.py`, selecionado somente por validação e depois testado. `estado.json` habilita sua execução local no painel. Não há arquivos de vídeo neste diretório.

Proveniência: 320 vídeos do MINDS-Libras, espelhados pelo IBMEC SP. Autores da base: Sílvia G. M. Almeida, Tamires M. Rezende, Gabriela T. B. Almeida, Andreia C. R. Toffolo e Frederico G. Guimarães. Fonte: https://doi.org/10.5281/zenodo.2667329. Revisão do espelho e protocolo estão em `treinamento/resultado-holistic.json`. Os arquivos públicos foram usados para este experimento local; o projeto não redistribui os vídeos.

São 20 sinais e uma classe de repouso. Os valores de saída são escores do modelo, não uma probabilidade calibrada de acerto. O painel exige escore ≥ 0,85 e diferença para a segunda classe ≥ 0,30, além de rosto/ombros enquadrados. Esses limites não são filtro de conteúdo.

A habilitação ocorreu após a simulação do fluxo real de segmentação: 20 respostas corretas e 20 abstenções nos 40 vídeos conhecidos da pessoa reservada, sem respostas nos 18 vídeos de seis sinais não treinados. `treinamento/resultado-fluxo-tcn.json` preserva todos os casos. Isso não garante o desempenho em novas pessoas, gestos cotidianos, fundos, variações regionais ou conversações. O modelo não foi validado em uma chamada real do Meet.
