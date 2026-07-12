/* Refresh data/skills.json — a static snapshot of popular Agent Skills.

   Why a snapshot? skills.sh's search API returns JSON but sends NO CORS header,
   so a 100%-client-side page cannot call it from the browser. GitHub raw
   (raw.githubusercontent.com) IS CORS-open, so we resolve each skill to its raw
   SKILL.md URL here (in Node, where CORS doesn't apply) and ship the result.
   The browser then fetches the SKILL.md from GitHub raw on demand.

   Run (needs network to skills.sh + raw.githubusercontent.com):
     node tools/build_skills_catalog.cjs > data/skills.json
   Node 18+ (global fetch). No dependencies.
*/
const SEEDS = ["agent", "loop", "mcp", "review", "debug", "orchestrator", "browser", "code", "research", "test"];
const MAX = 30;

async function json(u) { try { const r = await fetch(u); return r.ok ? await r.json() : null; } catch { return null; } }
async function raw200(u) { try { const r = await fetch(u); return r.status === 200 && (await r.text()).length > 200; } catch { return false; } }

async function resolveRaw(source, skillId) {
  const branches = ["main", "master"];
  const paths = [
    `skills/${skillId}/SKILL.md`, `${skillId}/SKILL.md`, `SKILL.md`,
    `.claude/skills/${skillId}/SKILL.md`, `plugins/${skillId}/SKILL.md`
  ];
  for (const b of branches) for (const p of paths) {
    const u = `https://raw.githubusercontent.com/${source}/${b}/${p}`;
    if (await raw200(u)) return u;
  }
  return null;
}

(async () => {
  const map = new Map();
  for (const q of SEEDS) {
    const d = await json(`https://www.skills.sh/api/search?q=${encodeURIComponent(q)}`);
    if (d && d.skills) for (const s of d.skills) if (!map.has(s.id)) map.set(s.id, s);
  }
  const all = [...map.values()].sort((a, b) => (b.installs || 0) - (a.installs || 0));
  const out = [];
  for (const s of all) {
    if (out.length >= MAX) break;
    const rawUrl = await resolveRaw(s.source, s.skillId);
    if (rawUrl) out.push({ name: s.name, source: s.source, installs: s.installs || 0, rawUrl });
  }
  const doc = {
    _note: "Static snapshot of popular Agent Skills (from skills.sh) resolved to GitHub raw SKILL.md URLs. Browsed client-side; the SKILL.md is fetched from GitHub raw (CORS-open) on selection — skills.sh itself sends no CORS header, so we snapshot instead of live-calling it. Refresh with tools/build_skills_catalog.cjs. installs = skills.sh install count at snapshot time.",
    generated: new Date().toISOString().slice(0, 10),
    skills: out
  };
  process.stdout.write(JSON.stringify(doc, null, 2) + "\n");
})();
