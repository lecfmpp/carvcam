# CarvCAM website

Static marketing site: landing page plus programmatic SEO pages generated from `src/data.mjs`.

| Path | Template | Source data |
|---|---|---|
| `/` | Landing page | `faq`, `machines`, feature rows in `build.mjs` |
| `/download/` | Download (Windows; Mac and Linux in development) | `site` |
| `/machines/{slug}/` | Machine page | `machines` |
| `/features/{slug}/` | Feature page | `features` |
| `/compare/carvcam-vs-{slug}/` | Comparison (sourced, dated) | `competitors` |
| `/best-cnc-software-for-longmill/` | Commercial hub | all of the above |
| `/learn/{slug}/` | How-to with HowTo schema | `howtos` |

```bash
npm install
npm run images -- <folder with app screenshots (PNG)>   # → assets/screens/*.webp (1440 and 800 px)
npm run capture -- --app <checkout>/app --convert       # re-shoots every app screenshot (see below)
npm run build            # → dist/ with clean URLs, sitemap.xml, robots.txt
node build.mjs --preview # → links to index.html, to open without a server
npm run serve            # → http://localhost:4321
```

Before going live, set `site.url` (domain) and `site.installer` (Windows installer link) in `src/data.mjs`.
Competitor facts in `competitors` were checked on each vendor's site in October 2026; re-check before
updating `site.checked`.

## App screenshots
`scripts/capture-app.mjs` re-shoots every screenshot in `assets/screens/` from an app checkout
(the `app/` folder of the app branch, with `npm install` done in `cam-engine/` and `app/`). It starts
the app's Vite dev server, seeds each shot's workshop (LongMill MK3 30×30 + AutoSpin and a starter bit
kit by default; AltMill or MK2 for some wiring steps), drives the app with Playwright and saves 1440×900
PNGs to `.capture/`; `--convert` turns them into the WebP pairs. One table (`SHOTS`) lists every
shot: name, what it shows and the steps. `--list` prints it, `--only a,b` re-shoots a few.

The home page clips and the hero video (`video/`) are built from their own captured frames
(`video/hero-demo/capture`) and are not updated by this script.

## Accounts
`/signup/`, `/login/`, `/reset-password/`, `/onboarding/` and `/account/` are built by
`src/account.mjs` and run in the browser with `assets/js/account.js` against Supabase (project and
publishable key in `src/data.mjs`; tables and RLS in `supabase/migrations/`). They are `noindex` and
left out of the sitemap and llms.txt.

`assets/js/supabase.js` is a small vendored client (auth + REST only, ~30 KB gzipped). To rebuild it:
```
mkdir /tmp/sb && cd /tmp/sb && npm i @supabase/auth-js@2.118.0 @supabase/postgrest-js@2.118.0 esbuild
printf 'export { AuthClient } from "@supabase/auth-js";\nexport { PostgrestClient } from "@supabase/postgrest-js";\n' > entry.js
npx esbuild entry.js --bundle --format=esm --minify --target=es2020 --platform=browser --outfile=supabase.js
```
