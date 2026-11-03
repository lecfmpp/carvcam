// Background photo for the sign-up / log-in / password pages (.auth in src/styles.css).
//   npm run auth-bg -- <photo.jpg|png|webp>
// Writes assets/img/auth-bg.webp (1920 px wide) and auth-bg-960.webp (phones), cropped to 16:9.
import sharp from "sharp";

const input = process.argv[2];
if (!input) {
  console.error("Usage: npm run auth-bg -- <photo>");
  process.exit(1);
}
for (const [width, name, quality] of [
  [1920, "auth-bg.webp", 70],
  [960, "auth-bg-960.webp", 68],
]) {
  const out = new URL(`../assets/img/${name}`, import.meta.url).pathname;
  const info = await sharp(input).rotate().resize({ width, height: Math.round((width * 9) / 16), fit: "cover", position: "centre" }).webp({ quality, effort: 6 }).toFile(out);
  console.log(`${name}: ${info.width}×${info.height}, ${(info.size / 1024).toFixed(0)} KB`);
}
