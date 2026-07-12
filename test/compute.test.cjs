/* Objective gate for the harness analysis core. Run: node test/compute.test.cjs
   Loads the SHIPPED compute.js + rules + fixtures, asserts defensible properties. */
const fs = require("fs");
const path = require("path");
const { analyze } = require("../assets/compute.js");

const root = path.join(__dirname, "..");
const rules = JSON.parse(fs.readFileSync(path.join(root, "data/rules.json")));
const cases = JSON.parse(fs.readFileSync(path.join(root, "data/examples.json"))).cases;
const C = (id) => cases.find((c) => c.id === id);
const run = (c) => analyze(c.prompt, c.tool, rules);

let pass = 0, fail = 0;
function ok(name, cond) { cond ? (pass++, console.log("  PASS " + name)) : (fail++, console.log("  FAIL " + name)); }

console.log("compute.js gate:");

// 1. Fixtures land in their hand-defensible bands
for (const c of cases) {
  const r = run(c), e = c.expect;
  ok(`${c.id}: total ${r.total} in [${e.totalMin},${e.totalMax}]`, r.total >= e.totalMin && r.total <= e.totalMax);
  ok(`${c.id}: grade ${r.grade.label} in ${JSON.stringify(e.gradeIn)}`, e.gradeIn.includes(r.grade.label));
  ok(`${c.id}: toolParsed == ${e.toolParsed}`, r.toolSchema.parsed === e.toolParsed);
  if (e.loopExact !== undefined) {
    const loop = r.axes.find((a) => a.id === "loop").score;
    ok(`${c.id}: loop == ${e.loopExact}`, loop === e.loopExact);
  }
}

// 2. Structural invariants
const strong = run(C("strong"));
ok("total == sum of axis scores", strong.total === strong.axes.reduce((s, a) => s + a.score, 0));
ok("no axis exceeds its max", strong.axes.every((a) => a.score <= a.max && a.score >= 0));
ok("total never exceeds 100", strong.total <= 100 && strong.maxTotal === 100);
ok("strong beats weak", strong.total > run(C("weak")).total);
ok("strong beats partial", strong.total > run(C("partial")).total);

// 3. Determinism — same input twice -> identical total
ok("deterministic", run(C("partial")).total === analyze(C("partial").prompt, C("partial").tool, rules).total);

// 4. Empty input is safe (no throw) and scores 0
const empty = analyze("", "", rules);
ok("empty -> total 0", empty.total === 0);
ok("empty -> grade F", empty.grade.label === "F");
ok("undefined input safe (no throw)", analyze(undefined, undefined, rules).total === 0);

// 5. Gaps are actionable: every unmatched signal exposes a `gap` string
let allGapsPresent = true;
for (const a of run(C("partial")).axes)
  for (const s of a.signals)
    if (!s.matched && !(s.gap && typeof s.gap.en === "string" && s.gap.en.length > 0)) allGapsPresent = false;
ok("unmatched signals carry an actionable gap (bilingual)", allGapsPresent);

// 5b. Bilingual: axis names / grade blurb / signal copy exist in EN and KO
const axKo = strong.axes.every((a) => a.name.en && a.name.ko && a.summary.en && a.summary.ko);
ok("axes carry EN+KO names & summaries", axKo);
ok("grade blurb bilingual", !!(strong.grade.blurb.en && strong.grade.blurb.ko));

// 6. Tool-schema structural analysis: valid tool parses, invalid flags an issue
ok("strong tool parses", strong.toolSchema.parsed === true && strong.toolSchema.count === 1);
const badTool = run(C("invalid_tool"));
ok("invalid tool -> parsed false + issue reported", badTool.toolSchema.parsed === false && badTool.toolSchema.issues.length > 0);

// 7. A described, typed tool schema yields an `ok` note; a bare one yields issues
const missingDesc = analyze("agent", "[{\"name\":\"foo\"}]", rules);
ok("tool without description -> issue", missingDesc.toolSchema.issues.some((i) => /no description/.test(i)));

// 8. Prompt generator — the core property: a generated prompt satisfies the axes.
const { harden } = require("../assets/compute.js");
const weak = C("weak");
const genAllTool = harden(weak.prompt, C("strong").tool, rules, { mode: "all", lang: "en" });
const genAllNoTool = harden(weak.prompt, "", rules, { mode: "all", lang: "en" });
ok("harden(all)+tool re-scores A (>=85)", HarnessCheckReanalyze(genAllTool, C("strong").tool) >= 85);
ok("harden(all) reaches 100 with a tool", HarnessCheckReanalyze(genAllTool, C("strong").tool) === 100);
ok("harden(all) prose-only still >=85 (A)", HarnessCheckReanalyze(genAllNoTool, "") >= 85);
ok("generated prompt keeps the user's intent", genAllTool.indexOf(weak.prompt.trim().slice(0, 20)) !== -1);

const genGaps = harden(weak.prompt, "", rules, { mode: "gaps", lang: "en" });
ok("gaps mode raises a weak harness's score", HarnessCheckReanalyze(genGaps, "") > run(weak).total);
ok("gaps mode notes the missing tool schema", /tool schema/i.test(genGaps));

const genKo = harden(weak.prompt, "", rules, { mode: "all", lang: "ko" });
ok("KO generator emits Korean contract header", genKo.indexOf("운영 계약") !== -1);
ok("generator deterministic", harden(weak.prompt, "", rules, { mode: "all", lang: "en" }) === genAllNoTool);

function HarnessCheckReanalyze(promptStr, toolStr) { return analyze(promptStr, toolStr, rules).total; }

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
