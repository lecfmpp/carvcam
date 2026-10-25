import { readFile, writeFile } from "node:fs/promises";
import { generatePlate } from "./generate.js";
import { loadFontsFromDisk } from "./node.js";

/**
 * Uso: npm run generate -- examples/casa-da-ana.json [saida.nc]
 * O JSON pode ser só a especificação da placa, ou { "placa": {...}, "ferramenta": {...}, "maquina": {...} }.
 */
async function main() {
  const [file, outFile] = process.argv.slice(2);
  if (!file) {
    console.error("Uso: npm run generate -- <especificacao.json> [saida.nc]");
    process.exit(2);
  }
  const json = JSON.parse(await readFile(file, "utf8"));
  const placa = json.placa ?? json;
  const fontes = await loadFontsFromDisk();
  const res = generatePlate(placa, { fontes, ferramenta: json.ferramenta, ferramentaRecorte: json.ferramentaRecorte, maquina: json.maquina });

  for (const a of res.avisos) console.error(`${a.severidade === "erro" ? "✖" : "⚠"} ${a.mensagem}${a.sugestao ? `\n    → ${a.sugestao}` : ""}`);
  for (const p of res.verificacao?.problemas ?? []) console.error(`${p.severidade === "erro" ? "✖" : "⚠"} linha ${p.linha}: ${p.mensagem}`);
  if (!res.gcode) process.exit(1);

  const st = res.verificacao!.estatisticas;
  const projetoOk = !res.avisos.some((a) => a.severidade === "erro");
  if (!projetoOk) console.error("\n✖ O projeto tem erros e não pode ir para a máquina.");
  console.error(`${res.verificacao!.ok ? "✔ G-code verificado" : "✖ G-code reprovado no verificador"}: ${st.linhas} linhas, ~${Math.ceil(st.tempoEstimadoSeg / 60)} min, ${(st.comprimentoCorte / 1000).toFixed(1)} m de corte`);
  for (const o of res.operacoes) console.error(`  • ${o.nome} (T${o.ferramenta}, ${o.profundidade} mm)`);
  for (const [nome, p] of Object.entries(res.parametros)) {
    console.error(`  Parâmetros (${nome}): ${p.rpm} RPM, avanço ${p.avanco} mm/min, mergulho ${p.mergulho} mm/min, passada ${p.passada} mm`);
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
