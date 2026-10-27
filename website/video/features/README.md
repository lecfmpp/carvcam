# Clipes dos recursos (home)

Gravações de tela simuladas, em loop, para as quatro linhas de recursos da home (Design, Prepare,
Connect, Position & carve). Mesmo motor e mesmas capturas do vídeo do hero (`../hero-demo/assets/shots`),
sem abertura e sem legenda: o texto do site ao lado já explica. O último quadro volta à pose do primeiro,
então o loop não salta.

```
node render.mjs              # todas as cenas; ou: node render.mjs connect
```

Saída em `website/assets/video/feature-<cena>.mp4` (1280×800, sem áudio, ~0,5–0,7 MB) + `-poster.webp`.
São MP4 e não GIF de propósito: o mesmo clipe em GIF passaria de 6 MB e pesaria no carregamento (e no
Google). No site eles se comportam como GIF (mudos, em loop, sem controles), só baixam quando chegam
perto da tela e ficam parados para quem pede menos movimento.
