# Feature clips (home page)

Simulated, looping screen recordings for the four feature rows on the home page (Design, Prepare,
Connect, Position & carve). Same engine, same screenshots and same button boxes as the hero video
(`../hero-demo/assets/shots`, `../hero-demo/assets/targets.js`, both written by
`../hero-demo/capture/cap.cjs`), with no intro and no captions: the site copy next to them already explains.
The last frame returns to the pose of the first, so the loop doesn't jump.

| Clip | Shows |
|---|---|
| design | Name tags: type the name, pick Archivo Black, size it, one name per linked copy |
| prepare | play the toolpath, 3D, then the panel: verified, Download G-code, no post-processor to pick |
| connect | cable by cable, *Choose the USB port*, then the real tests |
| carve | checklist, start, live preview, guided bit change, cut-outs, finished piece |

```
cd website
npm run video:capture -- --app <checkout>/app   # once, shared with the hero video
npm run video:clips                             # all scenes; or: node video/features/render.mjs connect
```

Output goes to `website/assets/video/feature-<scene>.mp4` (1280×800 H.264, 30 fps, 10–14 s, no audio, ~0.6–0.85 MB) + `-poster.webp`.
They are MP4 rather than GIF on purpose: the same clip as a GIF would be over 6 MB and weigh down page load
(and Google). On the site they behave like GIFs (muted, looping, no controls), only download when they get
close to the viewport, and stay still for people who ask for reduced motion.
