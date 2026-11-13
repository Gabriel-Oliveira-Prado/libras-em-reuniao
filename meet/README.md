# Integração experimental com Google Meet · 0.8.0

## Usar na reunião

1. Recarregue a extensão em `chrome://extensions` e reabra o painel. Confira **0.8.4**.
2. Abra o Meet no mesmo perfil do Chrome. No painel, em **Conectar ao Google Meet**, escolha a guia e clique em **Conectar ao Meet**.
3. Depois de instalar ou atualizar a extensão, **recarregue a guia do Meet uma vez**, de preferência antes de entrar na chamada. O código precisa estar instalado antes do pedido de câmera. Na 0.8.3, conectar o painel depois de ligar a câmera também permite adicionar o avatar ao mesmo vídeo; não exige uma nova captura. Para o áudio gerado, um microfone aberto antes da conexão ainda precisa ser desativado e ativado no Meet.
4. Entre na chamada e permita os dispositivos solicitados pelo Meet.
5. Selecione **Voz → Libras**: clique em **Ligar microfone** para iniciar o microfone escolhido, mediante permissão; cada transcrição confirmada vai ao avatar visível no Meet. Clique em **Desligar microfone**, no mesmo botão, para encerrar e cancelar transcrições pendentes. Selecionar o modo ou reconectar não inicia a captura. Ligue a câmera do Meet: o personagem entra no vídeo quando carregar, mesmo antes da primeira fala. Os outros participantes não precisam instalar a extensão. Os sinais são enviados por trechos após as pausas; transcrição, tradução e animação continuam tendo atraso.
6. Selecione **Sinais → voz**: ligue a câmera do tradutor. Com **Enviar a voz dos sinais ao áudio do Meet** marcado e o microfone do Meet ligado, a voz aceita pela integração é misturada ao microfone da chamada. A cópia no alto-falante do tradutor fica silenciosa para evitar eco. **Testar som** continua sendo local; **Testar voz na reunião** envia uma frase ao Meet.
7. Escolha um dos quatro cantos e um dos três tamanhos no painel. O padrão é **inferior esquerdo**. A posição é calculada no vídeo enviado; a prévia espelhada do Meet pode mostrar o lado oposto.
8. Confira **imagem e som com outro participante**. Status de faixa/quadros recebidos não prova que a outra ponta viu ou ouviu.
9. Mantenha o painel e o avatar visível abertos. **Desconectar**, fechar o painel ou sair do Meet interrompe a mídia gerada; a câmera e o microfone originais da chamada continuam conforme os controles do Meet.

A escolha de câmera e microfone do Meet continua sendo feita nas configurações da própria reunião. Os seletores do tradutor controlam sua leitura/transcrição. Se trocar a guia escolhida, conecte novamente. Não compartilhe o áudio da aba do tradutor ao mesmo tempo que a integração envia essa voz ao microfone, para evitar reprodução duplicada.

## O que o código faz

- `service-worker.js` usa `meet/servico.mjs` para vincular **um painel a uma guia explicitamente escolhida**. Remetentes, guia, sessão, tipos, limites e tamanhos de mensagens são verificados. Só nomes de guias do domínio Meet são listados.
- `meet/conteudo.js` cria o avatar visível no Meet e liga a página ao mundo MAIN. O iframe da extensão tem o motor já usado por `painel/vlibras.js`; não são iniciados dois avatares para o mesmo fluxo.
- `meet/capturar-avatar.js` é injetado somente no iframe Unity do VLibras. Após handshake do pai com origem exata da extensão, captura **o canvas do avatar na sua própria origem**. Não captura a webcam, não fotografa a página do Meet nem tenta ler um iframe de outra origem diretamente.
- A captura aguarda a prontidão do player VLibras antes de iniciar; um canvas ainda no download inicial do Unity não consome o prazo de captura de 15 segundos. Trocar o iframe ou perder a prontidão encerra a captura anterior antes de tentar novamente.
- O caminho é canvas Unity → `captureStream(12)` → vídeo → `OffscreenCanvas` → `ImageBitmap`. Limite de 320×360 e até dez quadros por segundo, com resolução ajustada ao vídeo. Só existe **um quadro pendente**, liberado por ACK; os bitmaps são transferidos por `window.postMessage` e fechados depois de consumidos/descartados. Frames não passam pelo canal JSON do Chrome.
- `meet/midia-main.js` é instalado no início da página. Chama `getUserMedia` original com as restrições solicitadas pelo Meet e preserva os prompts nativos. Prepara uma faixa de câmera por canvas no próprio pedido do Meet, inclusive antes de conectar o painel. Sem conexão ou no modo Sinais → voz, desenha apenas a câmera; em Voz → Libras, adiciona os quadros do avatar assim que chegam, sem trocar a faixa entregue ao Meet. O mixer de microfone continua condicionado à conexão e ao envio de voz habilitado; nenhum dispositivo é aberto por conta própria. Não acessa protocolos privados do Meet.
- Mute, stop, clones, término de dispositivo e restrições são acompanhados. Nenhuma mensagem desmuta a reunião. Falhas na preparação devolvem os dispositivos originais. O avatar desaparece da composição se não receber quadros recentes por 2,5 segundos; a câmera continua.
- Áudio é serializado como números finitos para o canal JSON da extensão. O MAIN aceita somente PCM válido, microfone habilitado e contexto de áudio em execução. A fila é limitada a 15 segundos, sem sobreposição; pausa/cancelamento descartam pendentes. O ACK confirma agendamento, não recepção externa.

## Permissões e privacidade

Foram acrescentados acesso a `https://meet.google.com/*` e ao caminho Unity `https://vlibras.gov.br/app/unity/*`, dois content scripts no Meet (isolado e MAIN) e o capturador nos iframes Unity. A página do avatar é um recurso acessível somente ao Meet. Não foi acrescentada permissão para gravar a tela, acessar todas as páginas ou capturar abas.

A câmera composta e a voz gerada são entregues ao Meet quando o usuário conecta e mantém os dispositivos da reunião habilitados. O transporte aos participantes é feito pelo próprio Meet. O texto confirmado continua indo ao serviço VLibras para tradução, como antes. A composição não envia a webcam ao VLibras, Ollama ou outro servidor do projeto, e não grava vídeos. Não há chave secreta no canal MAIN; a própria página pode observar a ponte. Por isso o serviço da extensão nunca expõe operações genéricas de rede/arquivo por ela.

## Limites e verificação real pendente

Esta é uma integração experimental que depende do navegador e do comportamento de captura do Meet. Atualizações do Meet podem exigir adaptação. Não é uma integração oficial da Google nem uma garantia de compatibilidade. Chrome 122 ou posterior é exigido pelo manifesto; hardware e desempenho continuam relevantes.

WebGL do Unity, transferência entre processos do Chrome, política de autoplay, iframe e cadência em segundo plano precisam de verificação real. O avatar deve permanecer visível para o navegador continuar pintando os quadros. Minimizar/ocultar a guia ou o sistema sob carga pode reduzir a cadência. Se o navegador bloquear o áudio, siga a instrução de clicar no Meet e reabrir o microfone; a integração informa a necessidade sem afirmar entrega.

Os testes usam APIs simuladas e verificam contratos, câmera composta, cantos/tamanhos, ACK, limite de filas, expiração, stop/clone, permissões, troca de modos e resultados tardios. **Não houve teste real em Chrome, webcam, microfone, build Unity do VLibras ou reunião entre dois participantes nesta rodada.**

```powershell
node --test tests/*.test.mjs
```

Para o teste real, confira: vídeo recebido nos quatro cantos; animação de duas frases distintas; voz de Oi e de um sinal pessoal; silenciar/desmutar o microfone; parar a câmera; trocar dispositivos; fechar o painel; reconectar e testar com a guia em segundo plano. Se faltar mídia, o painel deve mostrar o estado pendente/erro. A alternativa anterior de apresentar a aba com áudio continua disponível com a integração desligada.

## Referências técnicas

- [Chrome: mundos isolados e mensagens com a página](https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts#communication-with-the-embedding-page).
- [Chrome: mensagens de extensão usam serialização JSON](https://developer.chrome.com/docs/extensions/develop/concepts/messaging#serialization).
- [HTML: ImageBitmap transferível e restrições de origem](https://html.spec.whatwg.org/multipage/imagebitmap-and-animations.html#the-imagebitmap-interface).
- [WebRTC: captura de um canvas WebGL](https://webrtc.github.io/samples/src/content/capture/canvas-video/).
- [Web Audio: destino de áudio para MediaStream](https://www.w3.org/TR/webaudio-1.0/#MediaStreamAudioDestinationNode).
- [Chrome: política de autoplay](https://developer.chrome.com/blog/autoplay/).
