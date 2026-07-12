/* ─────────────────────────────────────────────────────────────────────────
   harness-quality-checker — DOM wiring.
   All scoring lives in compute.js (pure). This file only fetches the rule set,
   reads the two textareas, calls the core, and renders. User-supplied strings
   are escaped before insertion (XSS-safe: no raw innerHTML of input).
   ───────────────────────────────────────────────────────────────────────── */
(function () {
  const $ = (id) => document.getElementById(id);
  const promptEl = $("prompt"), toolsEl = $("tools"), out = $("out"), badge = $("gradeBadge");
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  let rules = null, examples = null;

  function gradeClass(label) { return "g-" + String(label).toLowerCase(); }

  function render() {
    if (!rules) return;
    const hasInput = promptEl.value.trim() || toolsEl.value.trim();
    if (!hasInput) {
      badge.textContent = "";
      out.innerHTML = '<p class="dim">Paste a harness (or load an example) to see the five-axis breakdown.</p>';
      return;
    }
    let r;
    try { r = HarnessCheck.analyze(promptEl.value, toolsEl.value, rules); }
    catch (e) { out.innerHTML = '<div class="err">Analysis error: <code>' + esc(e && e.message) + "</code></div>"; return; }

    const gc = gradeClass(r.grade.label);
    badge.innerHTML = '<span class="badge ' + (r.total >= 70 ? "ok" : r.total >= 55 ? "warn" : "no") + '">' + r.total + " / 100</span>";

    let html = '<div class="grade-hero"><span class="grade-letter ' + gc + '">' + esc(r.grade.label) +
      '</span><span class="grade-total">' + r.total + " / 100</span></div>" +
      '<p class="grade-blurb">' + esc(r.grade.blurb) + "</p>";

    r.axes.forEach(function (a) {
      const pct = Math.round((a.score / a.max) * 100);
      html += '<div class="axis"><div class="axis-head"><span class="axis-name">' + esc(a.name) +
        '</span><span class="axis-score"><b>' + a.score + "</b> / " + a.max + "</span></div>" +
        '<div class="bar"><div class="fill" style="width:' + pct + '%"></div></div>' +
        '<p class="axis-summary">' + esc(a.summary) + "</p>";
      const gaps = a.signals.filter(function (s) { return !s.matched; });
      const oks = a.signals.filter(function (s) { return s.matched; });
      gaps.forEach(function (s) { html += '<div class="sig gap"><span class="mk">→</span><span>' + esc(s.gap) + "</span></div>"; });
      if (oks.length) {
        html += '<details class="axis-sigs"><summary>' + oks.length + " signal(s) present</summary>";
        oks.forEach(function (s) { html += '<div class="sig ok"><span class="mk">✓</span><span>' + esc(s.present) + "</span></div>"; });
        html += "</details>";
      }
      html += "</div>";
    });

    // Tool-schema structural health
    const ts = r.toolSchema;
    html += '<div class="schema"><div class="block-title">Tool schema health</div>';
    if (!ts.provided) {
      html += '<div class="schema-row issue"><span class="mk">→</span><span>No tool schema provided — an agent needs tools to act and observe.</span></div>';
    } else {
      ts.issues.forEach(function (i) { html += '<div class="schema-row issue"><span class="mk">✗</span><span>' + esc(i) + "</span></div>"; });
      ts.ok.forEach(function (o) { html += '<div class="schema-row ok"><span class="mk">✓</span><span>' + esc(o) + "</span></div>"; });
      if (ts.parsed && !ts.issues.length && !ts.ok.length) html += '<div class="schema-row ok"><span class="mk">✓</span><span>' + ts.count + " tool(s) parsed.</span></div>";
    }
    html += "</div>";

    out.innerHTML = html;
  }

  function loadExample(id) {
    if (id === "clear") { promptEl.value = ""; toolsEl.value = ""; render(); return; }
    if (!examples) return;
    const c = examples.cases.find(function (x) { return x.id === id; });
    if (!c) return;
    promptEl.value = c.prompt;
    toolsEl.value = c.tool;
    render();
  }

  promptEl.addEventListener("input", render);
  toolsEl.addEventListener("input", render);
  document.querySelectorAll("[data-ex]").forEach(function (b) {
    b.addEventListener("click", function () { loadExample(b.getAttribute("data-ex")); });
  });

  Promise.all([
    fetch("data/rules.json").then(function (r) { return r.json(); }),
    fetch("data/examples.json").then(function (r) { return r.json(); })
  ]).then(function (res) {
    rules = res[0]; examples = res[1]; render();
  }).catch(function (e) {
    out.innerHTML = '<div class="err">Could not load rule set (' + esc(e && e.message) +
      "). Serve over http (e.g. <code>python3 -m http.server</code>), not file://.</div>";
  });
})();
