import { readFile, writeFile } from "node:fs/promises";
import { generatePlate } from "./generate.js";
import { migrateLegacySpec } from "./migrate.js";
import { loadFontsFromDisk } from "./node.js";

/**
 * Usage: npm run generate -- examples/anas-house.json [output.nc]
 * The JSON can be just the sign spec, or { "plate": {...}, "tool": {...}, "machine": {...} }.
 */
async function main() {
  const [file, outFile] = process.argv.slice(2);
  if (!file) {
    console.error("Usage: npm run generate -- <spec.json> [output.nc]");
    process.exit(2);
  }
  const json = migrateLegacySpec<any>(JSON.parse(await readFile(file, "utf8")));
  const plate = json.plate ?? json;
  const fonts = await loadFontsFromDisk();
  const res = generatePlate(plate, { fonts, tool: json.tool, cutoutTool: json.cutoutTool, machine: json.machine });

  for (const a of res.warnings) console.error(`${a.severity === "error" ? "✖" : "⚠"} ${a.message}${a.suggestion ? `\n    → ${a.suggestion}` : ""}`);
  for (const p of res.verification?.problems ?? []) console.error(`${p.severity === "error" ? "✖" : "⚠"} line ${p.line}: ${p.message}`);
  if (!res.gcode) process.exit(1);

  const st = res.verification!.stats;
  const projectOk = !res.warnings.some((a) => a.severity === "error");
  if (!projectOk) console.error("\n✖ The project has errors and cannot go to the machine.");
  console.error(`${res.verification!.ok ? "✔ G-code verified" : "✖ G-code failed verification"}: ${st.lines} lines, ~${Math.ceil(st.estimatedTimeSec / 60)} min, ${(st.cutLength / 1000).toFixed(1)} m of cutting`);
  for (const o of res.operations) console.error(`  • ${o.name} (T${o.tool}, ${o.depth} mm)`);
  for (const [name, p] of Object.entries(res.params)) {
    console.error(`  Parameters (${name}): ${p.rpm} RPM, feed ${p.feed} mm/min, plunge ${p.plunge} mm/min, stepdown ${p.stepdown} mm`);
  }

  if (!res.ok) {
    console.error("Nothing was written to disk.");
    process.exit(1);
  }
  if (outFile) await writeFile(outFile, res.gcode);
  else process.stdout.write(res.gcode);
  process.exit(res.ok ? 0 : 1);
}

main();
