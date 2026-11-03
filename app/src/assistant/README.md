# Design assistant

Chat in the Create screen that edits the design the way the user asks — and nothing else — then
confirms in one short sentence. It never talks to the machine, and Pro features stay behind their
Pro gates. **Hidden from users** until it passes its evals (see the release checklist).

## Enable it locally

- Build time: `VITE_ENABLE_ASSISTANT=1 npm run dev`
- Running app: in the browser console, `localStorage.setItem("carvcam-enable-assistant", "1")`, then reload.

Open Create; the bar sits at the bottom-left (⌘K / Ctrl+K focuses it). Without a key it runs the
offline assistant (badge **Offline**); **Connect Claude** stores an Anthropic API key in this
browser only (badge **Claude**). The ↻ button starts a new chat.

## Architecture

```
AssistantBar.tsx ──send(message, ctx)──▶ provider (index.ts)
                                          ├─ claude.ts  → agent.ts runTurn (tool loop) ─▶ Messages API
                                          └─ local.ts   → regex plan → same tool calls
                      both apply tool calls with ops.ts on a draft, verified by verify (engine)
◀── reply { text, design?, changes[], question?, action?, remaining[] }
```

| File | Role |
| --- | --- |
| `schema.ts` | Tool input schemas **generated from the engine's zod schemas** (`PlateSpecSchema` and the element schemas, via zod v4 `toJSONSchema`), rewritten into the API's JSON Schema subset (no numeric/length/array-size constraints — they move into the description —, `anyOf` instead of `oneOf`, `additionalProperties: false`). `FIELD_DOCS` explains every field to the model; `EXCLUDED` lists the fields no tool writes, with the reason. |
| `tools.ts` | The 18 tools. Small fixed-shape tools are `strict: true`; the generated element/board tools are too big for strict mode's limits and are validated in app code instead (both paths go through the same zod validation). There is no machine tool. |
| `ops.ts` | Applies each tool call to a **draft** of the design: validates against the engine schema, rejects invalid input with an error the model can act on (the draft is untouched), and records a human change line (`Text 'SMITH' → size 40 mm`). |
| `ids.ts`, `describe.ts` | Element ids as the model sees them (`text:0`, `shape:2`, `icon:1`, `drawing:0`, `hole:3`, `slot:0`) and the text views: design summary with boxes, fonts, library, bits. |
| `prompt.ts` | System prompt generated from the real catalog: rules, styles, fonts, icons/library, materials, presets, bits, Pro features, units (mm, inch conversion) and coordinates. Static part + per-user session part (machine travel, owned bits, plan), both prompt-cached. |
| `agent.ts` | The turn loop (manual tool loop; see below). Transport is injectable (browser SDK client, Node SDK client, or a mock). |
| `verify.ts`, `browser.ts`, `evals/node.ts` | Engine checks: the same `generatePlate` run that feeds the warning panel — in the worker in the app (`browserVerify`), in-process in Node (`nodeVerify`). |
| `local.ts` | Offline assistant: understands simple requests and emits the **same tool calls**, so it shares validation, change list and undo. |
| `claude.ts`, `index.ts` | Key storage (localStorage, this browser only), SDK transport, provider selection. |

### One turn

1. The engine checks the current design (baseline problems).
2. The user message carries the current design (ids, fields, boxes, current problems) after the cached prefix.
3. Claude (`claude-opus-5-5`, adaptive thinking, effort `medium`, `tool_choice: auto`, server-side refusal fallback) calls tools; `ops.ts` applies them to the draft. Invalid input → `is_error` tool_result, the model retries.
4. **Verify loop**: after each round of edits, and again when the model wants to stop, the engine re-checks the draft. Problems that weren't in the baseline are appended (after the tool results) as `[Automatic engine check]`, up to `maxVerifyRounds` (3). The model fixes what it broke, or says why it can't.
5. The reply returns the draft as ONE new design. The bar applies it with `useDesign.commit` — always its own undo step — and shows the change list, any problems it caused and could not fix (`remaining`, computed by the app, not the model), an Undo button, the clarifying-question options, or the Pro button.

History is append-only (thinking blocks passed back unchanged); when the user edited the design
between turns, a note is appended rather than editing history. A failed request drops that turn.

### Caching

Render order is tools → system → messages. Tools are deterministic (built once, fixed order); system
block 1 (static, generated from the catalog) and block 2 (this user's setup) carry `cache_control`;
a top-level `cache_control` also caches the growing conversation between the steps of a turn. Nothing
time-dependent is in the prefix; the design rides in the user messages.

### Pro features and safety

- `open_pro_feature` only returns an action. The bar shows a button that opens the inlay wizard
  (whose own `useProGate("inlay")` shows the preview/upgrade) or Prepare (batch, cost). `spec.inlay`
  is in `EXCLUDED`: no tool can write it.
- No tool can start, move or stop the machine; the prompt tells the model to say carving starts with the user.

## Tests (no key needed, run in CI)

```
cd app && npx vitest run src/assistant
```

- `schema.test.ts` — every engine field is exposed by a tool or excluded with a reason, and documented (fails when the engine gains a field the assistant doesn't know); schemas use only the API's JSON Schema subset; strict tools stay within strict-mode limits (≤ 20 strict tools, ≤ 24 optional params, ≤ 16 union params); every tool has a handler; no machine tool.
- `ops.test.ts` — operation application and validation (every tool, rejected input leaves the draft untouched).
- `agent.test.ts` — mocked transport: request shape (model, caching, strict tools, no forced tool choice), error retry, append-only history, design-changed note, verify loop (with a fake verifier and with the real engine), round limit and `remaining`, questions, refusals, `max_tokens`, failed requests, step limit; the store's one-reply-one-undo-step `commit`.
- `local.test.ts` — offline assistant.
- `evals/cases.test.ts` — every eval case's starting design is valid and its **golden answer**, replayed through the real loop, tools and engine, passes the case's assertions.

## Evals (live, needs a key)

```
cd app
ANTHROPIC_API_KEY=sk-ant-… npm run eval:assistant                       # all cases
npm run eval:assistant -- --case copies-name-tags,ask-move-it           # ids or substrings
npm run eval:assistant -- --category safety
npm run eval:assistant -- --model claude-opus-5-5 --effort low --concurrency 2
npm run eval:assistant -- --repeat 3 --json /tmp/assistant-evals.json   # flakiness + raw results
```

Prints PASS/FAIL per case (with the tools called, the reply and each failed assertion), a summary
by category, token usage (check `cache read` is non-zero) and whether the release bar is met (exit
code 1 when not). Only the model is live: the loop, tools and engine are the app's own code.

### Cases

`evals/cases.ts` — 51 cases in 11 categories: board (inches, thickness, material, edge, frame,
lettering), text (font, words, size, second line, make it fit, arch, bolder), style (engrave/raise,
depth, part with tabs, cut through), layout (move, center everything, align, holes in corners, hanging
slot, remove), elements (icons, library paw/frame, circle, underline), copies (6 name tags with names,
4 hearts, back to one), bits/settings (60° V-bit, 1/4″ for the cut-out, not-owned bit, slower, tabs),
ambiguous (must ask), Pro (inlay/batch/cost must open the gated UI and never write it), safety (start
carving, run the job, 3D), fix (the verify loop must repair what an edit breaks).

### Adding a case

1. Pick or add a starting design in `evals/fixtures.ts` (`F.*`, or `project("<First cuts id>")`).
2. Append to `CASES`: `id`, `category`, `start`, `message`, optional `ownedBits`/`pro`/`machine`.
3. `expect`: use `edit(...)` for requests that should change the design (changed, no question, no new engine errors, short reply) or `hold(...)` for ones that shouldn't; add `onlyChanged("spec.texts.0.size", …)` (the "nothing else" rule; `*` matches one path segment), `equals`, `approx`, `that(name, fn)`, `asks()`, `opensPro()`, `replyMatches()`, `noCheck(code)`, `insideBoard()`.
4. `golden`: a correct answer (tool calls + one-sentence reply). `npx vitest run src/assistant/evals` proves it passes — if it doesn't, the case or the assertion is wrong.
5. Run it live: `npm run eval:assistant -- --case <id> --repeat 3`.

## Release checklist (before unhiding)

- [ ] `npx vitest run` (app) and `npx vitest run` (cam-engine) green; `npx tsc --noEmit`; `npx vite build`.
- [ ] Live evals on the shipping model and effort, `--repeat 3`: **≥ 90 % overall**, and **100 % of `safety` and `pro`** on every repeat (the runner's release bar).
- [ ] No case fails on all 3 repeats (a consistent failure is a bug, not noise): fix the prompt/tools or the case.
- [ ] Token usage: `cache read` > 0 from the second request on (the cached prefix works); median turn latency acceptable in the UI (check `--json` timings).
- [ ] Manual pass in the app with the flag on: offline and Claude modes, Undo after a reply (one step), a clarifying question, a Pro button on a free account (shows the upgrade, changes nothing), an API error (wrong key → design unchanged).
- [ ] Decide how keys work for release (user key in the browser today; the Pro "hosted AI" feature would route through a server instead).
- [ ] Then remove the `assistantEnabled()` gate in `lib/features.ts` (or default it on).
