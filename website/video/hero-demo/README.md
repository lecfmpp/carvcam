# Hero video (website)

Same format as the Tá no Caixa hero: real app screenshots stacked in a zooming "camera",
a drawn cursor, ripples on clicks and numbered captions. The intro and outro carry the CarvCAM
brand: the icon assembles itself (square → board → bit plunging and opening the groove → chips) and
the name comes in **as one word**, `Carv` (Geist 600) + `CAM` (Geist Mono 500) in the same `<text>`,
with no space. Transition: an orange disc grows from the center, graphite covers it and the app opens
with an iris; at the end, orange → white and the call to action.

## Capturing the screens

`capture/cap.cjs` opens the app (simulator, LongMill MK3 30×30 + AutoSpin), runs the whole flow
("Welcome" text in Pacifico, prepare, connection wizard, home, touch plate, zero, carve to the
end) and saves each state to `shots/*.jpg` (1440×900 @2x) + the click coordinates to
`targets.json`. Two visual-only edits: the fault simulation bar is hidden, and the wizard's
"Simulator" card shows up as the detected USB port (`STM32 (SuperLongBoard) · COM3`);
the simulator runs underneath.

```
cd gsender-ui && npx vite --port 5173      # the app, in another terminal
cd website/video/hero-demo/capture
node cap.cjs                               # uses the globally installed playwright
cp shots/*.jpg ../assets/shots/
```

## Render

```
cd website/video/hero-demo
npx hyperframes@0.8.181 check
npx hyperframes@0.8.181 render -o renders/hero-demo.mp4 --fps 30 --crf 20
```

The site version (no audio, as on Tá no Caixa) and the poster:

```
ffmpeg -i renders/hero-demo.mp4 -vf scale=1280:800 -c:v libx264 -preset slow -crf 25 -pix_fmt yuv420p -movflags +faststart -an ../../assets/video/hero-demo.mp4
ffmpeg -ss 30.6 -i renders/hero-demo.mp4 -frames:v 1 -vf scale=1280:800 ../../assets/video/hero-demo-poster.webp
```

## Soundtrack

`music/gen_saas.py` is the Tá no Caixa soundtrack generator (light corporate, 18 bars = 34.875 s,
seamless loop) with a different seed. `python3 gen_saas.py hero-saas.wav`, then
`ffmpeg -i hero-saas.wav -c:a aac -b:a 160k hero-saas.m4a`. For the version with sound (YouTube, social):
`ffmpeg -i renders/hero-demo.mp4 -i music/hero-saas.m4a -map 0:v -map 1:a -c copy -shortest renders/hero-demo-audio.mp4`.
