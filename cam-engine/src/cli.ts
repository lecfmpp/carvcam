import { readFile, writeFile } from "node:fs/promises";
import { generatePlate } from "./generate.js";
import { migrateLegacySpec } from "./migrate.js";
import { loadFontsFromDisk } from "./node.js";

/**
 * Uso: npm run generate -- examples/anas-house.json [saida.nc]
 * O JSON pode ser só a especificação da placa, ou { "plate": {...}, "tool": {...}, "machine": {...} }.
 */
async function main() {
  const [file, outFile] = process.argv.slice(2);
  if (!file) {
    console.error("Uso: npm run generate -- <especificacao.json> [saida.nc]");
    process.exit(2);
  }
  const json = migrateLegacySpec<any>(JSON.parse(await readFile(file, "utf8")));
  const plate = json.plate ?? json;
  const fonts = await loadFontsFromDisk();
  const res = generatePlate(plate, { fonts, tool: json.tool, cutoutTool: json.cutoutTool, machine: json.machine });

  for (const a of res.warnings) console.error(`${a.severity === "error" ? "✖" : "⚠"} ${a.message}${a.suggestion ? `\n    → ${a.suggestion}` : ""}`);
  for (const p of res.verification?.problems ?? []) console.error(`${p.severity === "error" ? "✖" : "⚠"} linha ${p.line}: ${p.message}`);
  if (!res.gcode) process.exit(1);

  const st = res.verification!.stats;
  const projectOk = !res.warnings.some((a) => a.severity === "error");
  if (!projectOk) console.error("\n✖ O projeto tem erros e não pode ir para a máquina.");
  console.error(`${res.verification!.ok ? "✔ G-code verificado" : "✖ G-code reprovado no verificador"}: ${st.lines} linhas, ~${Math.ceil(st.estimatedTimeSec / 60)} min, ${(st.cutLength / 1000).toFixed(1)} m de corte`);
  for (const o of res.operations) console.error(`  • ${o.name} (T${o.tool}, ${o.depth} mm)`);
  for (const [name, p] of Object.entries(res.params)) {
    console.error(`  Parâmetros (${name}): ${p.rpm} RPM, avanço ${p.feed} mm/min, mergulho ${p.plunge} mm/min, passada ${p.stepdown} mm`);
  }

  if (!res.ok) {
    console.error("Nada foi gravado em disco.");
    process.exit(1);
  }
  if (outFile) await writeFile(outFile, res.gcode);
  else process.stdout.write(res.gcode);
  process.exit(res.ok ? 0 : 1);
}

main();
