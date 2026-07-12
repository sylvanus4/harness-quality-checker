/* Dump the SHIPPED compute.js output for every fixture as JSON, so the
   independent Python reference (reference_audit.py) can cross-check it.
   Run: node audit/js_compute_dump.cjs */
const fs = require("fs"), path = require("path");
const { analyze } = require("../assets/compute.js");
const root = path.join(__dirname, "..");
const rules = JSON.parse(fs.readFileSync(path.join(root, "data/rules.json")));
const cases = JSON.parse(fs.readFileSync(path.join(root, "data/examples.json"))).cases;

const out = cases.map(function (c) {
  const r = analyze(c.prompt, c.tool, rules);
  return {
    id: c.id,
    total: r.total,
    grade: r.grade.label,
    axes: r.axes.map(function (a) { return { id: a.id, score: a.score }; }),
    toolParsed: r.toolSchema.parsed,
    toolCount: r.toolSchema.count
  };
});
console.log(JSON.stringify(out));
