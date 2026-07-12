# Security

`harness-quality-checker` is a **100% client-side static site** — HTML + CSS +
vanilla JS served on GitHub Pages. No backend, no build step, no package
dependencies, no API keys. The prompt and tool schema you paste are analyzed
entirely in your browser and never transmitted. Security here is a property of
the architecture, not a promise in prose.

## What this tool does — and does NOT do

| | |
|---|---|
| ✅ Runs fully **in your browser** | All logic runs client-side in vanilla JS. |
| ✅ **No data egress** | Nothing you type or paste is transmitted. No telemetry, analytics, phone-home, or tracking cookies. |
| ✅ **No secrets, no accounts** | No API key, no login, no auth call is ever made. |
| ✅ **Loader fetches are outbound GETs of public files** | When you use "Load from a URL / skills.sh", the browser performs a plain `GET` of that **public** file from `raw.githubusercontent.com` (CORS-open). It sends no credentials and none of your other input; it's the same as opening that URL in a tab. The skills.sh catalog is a static snapshot in `data/skills.json`, so no request is made to skills.sh at runtime. |
| ✅ **Reads local data** | Rule set + skill catalog are static JSON from the same origin; loaded files come only from the URL/file you choose. |
| 🚫 No backend / database | There is no server to compromise and no stored user data. |
| 🚫 No dependencies / build | No npm, no pip, no bundler. Nothing to `npm audit`. |
| 🚫 No `eval` of input | Inputs are parsed as strings/numbers for analysis; input is never executed as code. Render user input as `textContent`, never `innerHTML`, to keep it XSS-free. |

## Threat surface

With no server, no build pipeline, and no third-party dependencies, the attack
surface is limited to (1) the static files served from the repo and (2) the
browser that runs them. Realistic risks are the same as for any static page: a
malicious commit, or a compromised GitHub Pages account. There are no secrets to
steal and no data to exfiltrate.

## Data & privacy

Nothing leaves the browser. Reloading discards your inputs.

## Reporting a vulnerability

Found a genuine security issue (e.g. an XSS vector in how inputs render)?

- Preferred: open a **private GitHub Security Advisory** (`Security` tab → `Report a vulnerability`).
- Or open a normal **GitHub issue** — but do **not** include anything sensitive.
- Solo, best-effort project. No SLA.

## Out of scope

Inaccurate/outdated numbers (→ normal issue); GitHub Pages / GitHub platform
itself (→ report to GitHub); your own browser/OS/network; feature requests and UI
bugs (→ normal issue).

> Dependabot: **N/A** — there are no dependency manifests to scan.
