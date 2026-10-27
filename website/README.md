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
npm run build            # → dist/ with clean URLs, sitemap.xml, robots.txt
node build.mjs --preview # → links to index.html, to open without a server
npm run serve            # → http://localhost:4321
```

Before going live, set `site.url` (domain) and `site.installer` (Windows installer link) in `src/data.mjs`.
Competitor facts in `competitors` were checked on each vendor's site in October 2026; re-check before
updating `site.checked`.
