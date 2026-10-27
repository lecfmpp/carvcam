# Vídeo do hero (site)

Mesmo formato do hero do Tá no Caixa: prints reais do app empilhados numa "câmera" com zoom,
cursor desenhado, ripple nos cliques e legendas numeradas. Abertura e fechamento com a marca
CarvCAM: o ícone se monta (quadrado → tábua → fresa descendo e abrindo o canal → cavacos) e o
nome entra **numa palavra só**, `Carv` (Geist 600) + `CAM` (Geist Mono 500) no mesmo `<text>`,
sem espaço. Transição: disco laranja cresce do centro, o grafite cobre e o app abre em íris; no
fim, laranja → branco e a chamada.

## Captura das telas

`capture/cap.cjs` abre o app (simulador, LongMill MK3 30×30 + AutoSpin), faz o fluxo inteiro
(texto "Welcome" em Pacifico, preparar, assistente de conexão, home, placa de toque, zero, corte
até o fim) e salva cada estado em `shots/*.jpg` (1440×900 @2x) + as coordenadas dos cliques em
`targets.json`. Duas edições só visuais: a barra de simulação de falhas fica oculta, e o cartão
"Simulator" do assistente aparece como a porta USB detectada (`STM32 (SuperLongBoard) · COM3`);
por baixo roda o simulador.

```
cd gsender-ui && npx vite --port 5173      # o app, em outro terminal
cd website/video/hero-demo/capture
node cap.cjs                               # usa o playwright instalado globalmente
cp shots/*.jpg ../assets/shots/
```

## Render

```
cd website/video/hero-demo
npx hyperframes@0.8.181 check
npx hyperframes@0.8.181 render -o renders/hero-demo.mp4 --fps 30 --crf 20
```

Versão do site (sem áudio, como no Tá no Caixa) e o pôster:

```
ffmpeg -i renders/hero-demo.mp4 -vf scale=1280:800 -c:v libx264 -preset slow -crf 25 -pix_fmt yuv420p -movflags +faststart -an ../../assets/video/hero-demo.mp4
ffmpeg -ss 30.6 -i renders/hero-demo.mp4 -frames:v 1 -vf scale=1280:800 ../../assets/video/hero-demo-poster.webp
```

## Trilha

`music/gen_saas.py` é o gerador da trilha do Tá no Caixa (light corporate, 18 compassos = 34,875 s,
loop sem emenda) com outra semente. `python3 gen_saas.py hero-saas.wav`, depois
`ffmpeg -i hero-saas.wav -c:a aac -b:a 160k hero-saas.m4a`. Para a versão com som (YouTube, redes):
`ffmpeg -i renders/hero-demo.mp4 -i music/hero-saas.m4a -map 0:v -map 1:a -c copy -shortest renders/hero-demo-audio.mp4`.
