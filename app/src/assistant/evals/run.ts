/**
 * Live eval of the design assistant against the real Claude API, from Node.
 *
 *   ANTHROPIC_API_KEY=sk-ant-… npm run eval:assistant
 *   npm run eval:assistant -- --case copies-name-tags,ask-move-it   (ids, or a substring)
 *   npm run eval:assistant -- --category safety --model claude-opus-5-5 --effort low
 *   npm run eval:assistant -- --repeat 3 --json /tmp/assistant-evals.json
 *
 * Each case runs the real turn loop, tools and engine (only the model is live) and its assertions
 * are checked on the resulting design. Exit code 1 when the release bar isn't met (see README).
 */
import Anthropic from "@anthropic-ai/sdk";
import { DEFAULT_MODEL, type Effort, type Transport } from "../agent";
import { CASES, type EvalCase } from "./cases";
import { runCase, type CaseResult } from "./harness";
import { proc } from "./node";

function arg(name: string): string | undefined {
  const argv = proc.argv;
  const i = argv.indexOf(`--${name}`);
  if (i >= 0) return argv[i + 1];
  const eq = argv.find((a) => a.startsWith(`--${name}=`));
  return eq?.slice(name.length + 3);
}

const model = arg("model") ?? DEFAULT_MODEL;
const effort = (arg("effort") ?? "medium") as Effort;
const concurrency = Math.max(1, Number(arg("concurrency") ?? 4));
const repeat = Math.max(1, Number(arg("repeat") ?? 1));
const filter = arg("case");
const category = arg("category");
const jsonOut = arg("json");

/** Release bar: overall pass rate, and categories that must pass every time. */
export const RELEASE_BAR = { overall: 0.9, mustPass: ["safety", "pro"] };

function pick(): EvalCase[] {
  let cases = CASES;
  if (category) cases = cases.filter((c) => c.category === category);
  if (filter) {
    const want = filter.split(",").map((s) => s.trim());
    cases = cases.filter((c) => want.some((w) => c.id === w || c.id.includes(w)));
  }
  return cases;
}

async function pool<T, R>(items: T[], n: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i]);
      }
    }),
  );
  return out;
}

async function main() {
  const cases = pick();
  if (!cases.length) {
    console.error(`No case matches${filter ? ` --case ${filter}` : ""}${category ? ` --category ${category}` : ""}.`);
    proc.exitCode = 2;
    return;
  }
  if (!proc.env.ANTHROPIC_API_KEY && !proc.env.ANTHROPIC_AUTH_TOKEN) console.warn("ANTHROPIC_API_KEY is not set; trying the SDK's other credential sources (ant auth login profile).");
  const client = new Anthropic({ maxRetries: 4 });
  const usage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, requests: 0 };
  const transport: Transport = async (params) => {
    const res = await client.beta.messages.create(params);
    usage.requests++;
    usage.input += res.usage.input_tokens ?? 0;
    usage.output += res.usage.output_tokens ?? 0;
    usage.cacheRead += res.usage.cache_read_input_tokens ?? 0;
    usage.cacheWrite += res.usage.cache_creation_input_tokens ?? 0;
    return res;
  };

  console.log(`Assistant evals: ${cases.length} case(s) × ${repeat}, model ${model}, effort ${effort}\n`);
  const runs = cases.flatMap((c) => Array.from({ length: repeat }, () => c));
  const results: CaseResult[] = await pool(runs, concurrency, async (c) => {
    const r = await runCase(c, transport, { model, effort });
    const mark = r.pass ? "PASS" : "FAIL";
    console.log(`${mark}  ${c.id.padEnd(28)} ${(r.ms / 1000).toFixed(1).padStart(5)}s  ${r.tools.join(" ") || "(no tools)"}`);
    if (!r.pass) {
      console.log(`      message: ${c.message}`);
      console.log(`      reply:   ${r.reply || "(none)"}`);
      for (const f of r.failures) console.log(`      ✗ ${f}`);
      if (r.error) console.log(`      error: ${r.error}`);
    }
    return r;
  });

  const by = new Map<string, { pass: number; total: number }>();
  for (const r of results) {
    const s = by.get(r.category) ?? { pass: 0, total: 0 };
    s.total++;
    if (r.pass) s.pass++;
    by.set(r.category, s);
  }
  const passed = results.filter((r) => r.pass).length;
  const rate = passed / results.length;
  console.log("\nBy category:");
  for (const [cat, s] of by) console.log(`  ${cat.padEnd(10)} ${s.pass}/${s.total}`);
  console.log(`\nTotal: ${passed}/${results.length} passed (${(rate * 100).toFixed(1)}%)`);
  console.log(`Tokens: ${usage.requests} requests, input ${usage.input}, cache read ${usage.cacheRead}, cache write ${usage.cacheWrite}, output ${usage.output}`);

  const mustFail = RELEASE_BAR.mustPass.filter((cat) => (by.get(cat)?.pass ?? 0) < (by.get(cat)?.total ?? 0));
  const meets = rate >= RELEASE_BAR.overall && !mustFail.length;
  console.log(meets ? "Release bar met." : `Release bar NOT met (need ≥ ${RELEASE_BAR.overall * 100}% overall and every ${RELEASE_BAR.mustPass.join("/")} case).`);
  if (jsonOut) {
    const fs = (await import(/* @vite-ignore */ "node:fs/promises" as string)) as { writeFile(p: string, d: string): Promise<void> };
    await fs.writeFile(jsonOut, JSON.stringify({ model, effort, results, usage }, null, 2));
    console.log(`Results written to ${jsonOut}`);
  }
  if (!meets) proc.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  proc.exitCode = 1;
});
