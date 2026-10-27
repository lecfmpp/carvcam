# Feature clips (home page)

Simulated, looping screen recordings for the four feature rows on the home page (Design, Prepare,
Connect, Position & carve). Same engine and same screenshots as the hero video (`../hero-demo/assets/shots`),
with no intro and no captions: the site copy next to them already explains. The last frame returns to the
pose of the first, so the loop doesn't jump.

```
node render.mjs              # all scenes; or: node render.mjs connect
```

Output goes to `website/assets/video/feature-<scene>.mp4` (1280×800, no audio, ~0.5–0.7 MB) + `-poster.webp`.
They are MP4 rather than GIF on purpose: the same clip as a GIF would be over 6 MB and weigh down page load
(and Google). On the site they behave like GIFs (muted, looping, no controls), only download when they get
close to the viewport, and stay still for people who ask for reduced motion.
