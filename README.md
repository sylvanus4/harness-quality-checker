# Harness Quality Checker

**Is your agent harness actually good?** Paste your agent (or MCP tool) **system
prompt** and **tool schema**; a free, 100% client-side static analyzer scores it
on five axes — **Loop · Verification · Tracing · Memory · Safety** — shows the
exact gaps, and **generates a hardened prompt that satisfies all five**. Like
ESLint, but for agent harnesses. English / 한국어.

**Live:** https://sylvanus4.github.io/harness-quality-checker/

- **No key, no login, no server, no data egress.** Everything runs in your browser — including the prompt generator (deterministic assembly, no model call).
- **Bilingual.** EN/KO toggle for the whole UI, the axis explanations, and the generated prompt.
- **Vendor-neutral.** Works for any harness — Claude Code, Codex, Gemini CLI, OpenHands, a custom loop, or an MCP tool definition.
- **Transparent.** The rule set is `data/rules.json`; an independent Python audit re-derives every score and must reach byte-parity with the shipped JS in CI.

## Generate a hardened prompt

Give it a rough prompt and it returns a full one. The **Generate** button keeps
your text as the *Intent* and appends a deterministic **operating contract** —
for each axis, the canonical clause(s) you're missing (or all of them). Each
clause is written to contain the phrasing the analyzer looks for, so the
generated prompt **re-scores near-100** (a unit test asserts this property).
It's a scaffold to edit and merge with your intent, not a finished prompt, and
it never calls a model.

## The five axes

| Axis | Question it asks |
|---|---|
| **Loop** | Do tool results feed back as observations, does it iterate, and is there an explicit exit/termination condition — or is it single-shot? |
| **Verification** | Does the loop close on an objective gate (tests / typecheck / exit code / an independent reviewer) instead of the model's own "I'm done"? |
| **Tracing** | Are inputs, outputs, timing, and errors recorded per step, so a failure can be diagnosed afterward? |
| **Memory** | Are short-term working memory, conversation history, and a long-term store distinguished, and is the context budget managed? |
| **Safety** | Is untrusted input validated, are tool permissions scoped, and are irreversible actions gated on approval / dry-run / rollback? |

Each axis scores `0–20` (sum of matched weighted signals, capped). Total `0–100`
maps to an `A–F` grade. The analyzer also runs a structural check on the tool
JSON (missing descriptions, untyped parameters).

## How scoring works — and its limits

A **signal** is a weighted set of regex phrase-patterns plus optional structural
checks on the parsed tool schema. A signal counts if its phrasing appears in your
prompt/tools **or** its structural check passes. Axis = `min(20, Σ matched
weights)`; total = Σ axes.

It is a **lint, not a proof**. It reads phrasing and structure, so it can miss an
idea worded unusually, or credit a phrase that isn't truly wired at runtime. Read
a low score as "make these concerns explicit," and a high score as "you described
them" — not as a runtime guarantee.

## Run the gates locally

```bash
node test/compute.test.cjs                                   # unit gate
node audit/js_compute_dump.cjs > /tmp/js.json \
  && python3 audit/reference_audit.py /tmp/js.json           # independent audit (JS<->Python parity)
python3 -m http.server 8080                                  # preview at http://localhost:8080
```

No dependencies — no `npm install`, no `pip install`.

## Architecture

| File | Role |
|---|---|
| `assets/compute.js` | Pure, deterministic scoring core (browser + Node, same code path). |
| `data/rules.json` | The five axes, their weighted signals, and grade bands. |
| `assets/app.js` | Thin DOM wiring: read textareas → call the core → render. |
| `audit/reference_audit.py` | Independent Python re-implementation + anchors + JS parity check. |
| `test/compute.test.cjs` | Objective unit gate. |
| `.github/workflows/validate.yml` | CI: unit test + audit parity + JSON validation + HTML wiring. |
| `.github/workflows/pages.yml` | Deploys the static site to GitHub Pages. |

Built from the [agent-webtool-template](https://github.com/sylvanus4/agent-webtool-template)
skeleton (pure core + independent audit + CI + Pages).

## Extending the rules

Edit `data/rules.json` — add a signal (patterns + weight + `present`/`gap`
copy) or a whole axis. The Python audit re-derives scores from the same file, so
CI catches any JS/Python drift. Keep patterns portable (they must compile under
both JS `RegExp` and Python `re`).

## License

MIT.
