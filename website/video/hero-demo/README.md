# Hero video (website)

Same format as the Tá no Caixa hero: real app screenshots stacked in a zooming "camera",
a drawn cursor, ripples on clicks and numbered captions. The intro and outro carry the CarvCAM
brand: the icon assembles itself (square → board → bit plunging and opening the groove → chips) and
the name comes in **as one word**, `Carv` (Geist 600) + `CAM` (Geist Mono 500) in the same `<text>`,
with no space. Transition: an orange disc grows from the center, graphite covers it and the app opens
with an iris; at the end, orange → white and the call to action.

## The story (current app)

1. **Design**: the Name tags ×6 board (six linked tags). Click the first tag's text, type `AVA`, pick
   Archivo Black, drag *Letter height* from 8 to 10 mm, open **Make copies** and type one name per copy
   (AVA, BEN, CLARA, DEV, ELLA, FINN). The status reads *Ready to carve*.
2. **Prepare**: play the toolpath, switch to 3D.
3. **Connect**: the cable-by-cable wizard, *Choose the USB port*, Connect, then the real tests
   (move up 2 mm, spin for 3 s). The top bar turns *Ready*.
4. **Position and carve**: home, touch plate, zero, checklist, carve the V-bit part, the guided bit
   change (swap, re-measure, continue), the cut-outs, and the finished piece in 3D.

The top bar shows the current *Simple / Advanced* switch; there is no assistant bar.

## Capturing the screens

`capture/cap.cjs` starts the app (the Vite dev server of an `app/` checkout of the app branch, with
`npm install` done in `cam-engine/` and `app/`), seeds the stores (LongMill MK3 30×30 + AutoSpin, a
starter bit kit, and the Name tags board reading `NAME` in Bebas Neue 8 mm), drives the whole flow with
Playwright on the simulator and saves each state to `assets/shots/*.jpg` (1440×900 @2x). It also writes the
box of every button it clicks to `capture/targets.json` and `assets/targets.js`; both compositions (this
one and `../features/clip.html`) read `assets/targets.js`, so the cursor lands on the right spot after a
re-capture without editing coordinates by hand. Video-only edits: the simulator fault bar and the text caret
are hidden, and the wizard's port step shows *Choose the USB port* (the
simulator runs underneath).

```
cd website
npm run video:capture -- --app <checkout>/app     # or: -- --url http://localhost:5173
```

Uses the globally installed playwright (`require("playwright")`) and its Chromium.

## Render

```
cd website
npm run video:hero      # node video/hero-demo/render.mjs
```

`render.mjs` runs `npx hyperframes@0.8.181 render -o renders/hero-demo.mp4 --fps 30 --crf 20` (the
1920×1200 master, git-ignored), then makes the site version (1280×800 H.264, CRF 25, no audio, as on
Tá no Caixa) and the poster (frame at 30.0 s):

```
ffmpeg -i renders/hero-demo.mp4 -vf scale=1280:800 -c:v libx264 -preset slow -crf 25 -pix_fmt yuv420p -movflags +faststart -an ../../assets/video/hero-demo.mp4
ffmpeg -ss 30.0 -i renders/hero-demo.mp4 -frames:v 1 -vf scale=1280:800 ../../assets/video/hero-demo-poster.webp
```

The video lasts 34.875 s (18 bars of the soundtrack). The app part is written at a "natural" pace and
sped up to fit between the 2 s intro and the outro (`SPEED` in `index.html`). `npx hyperframes@0.8.181 check`
and `preview` still work for editing.

## Soundtrack

`music/gen_saas.py` is the Tá no Caixa soundtrack generator (light corporate, 18 bars = 34.875 s,
seamless loop) with a different seed. `python3 gen_saas.py hero-saas.wav`, then
`ffmpeg -i hero-saas.wav -c:a aac -b:a 160k hero-saas.m4a`. For the version with sound (YouTube, social):
`ffmpeg -i renders/hero-demo.mp4 -i music/hero-saas.m4a -map 0:v -map 1:a -c copy -shortest renders/hero-demo-audio.mp4`.
