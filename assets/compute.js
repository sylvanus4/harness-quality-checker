/* ─────────────────────────────────────────────────────────────────────────
   harness-quality-checker — pure analysis core.

   analyze(promptText, toolText, rules) statically scores an agent harness
   (system prompt + tool/function schema) on five axes: Loop, Verification,
   Tracing, Memory, Safety. Rule-based and deterministic — no model call, no
   network, no DOM. `rules` is data/rules.json, injected by the caller so this
   file stays pure (browser via global, Node via module.exports).

   A signal is matched if ANY of its regex `patterns` match the combined,
   lowercased prompt+tool text, OR its structural `schema` check is true.
   Axis score = min(max, sum of matched signal weights). Total = sum of axis
   scores (0-100). Because both patterns and arithmetic are deterministic, the
   independent Python audit reaches byte-parity.
   ───────────────────────────────────────────────────────────────────────── */
(function (root) {

  function norm(s) {
    // straighten curly apostrophes so "don't"/"don’t" match the same pattern
    return (typeof s === "string" ? s : "").replace(/’/g, "'");
  }

  function normalizeTools(data) {
    let list = [];
    if (Array.isArray(data)) list = data;
    else if (data && Array.isArray(data.tools)) list = data.tools;
    else if (data && Array.isArray(data.functions)) list = data.functions;
    else if (data && typeof data === "object") list = [data];

    return list.map(function (el) {
      let t = el;
      if (el && el.type === "function" && el.function) t = el.function; // OpenAI wrapper
      const props =
        (t && t.input_schema && t.input_schema.properties) ||   // Anthropic
        (t && t.parameters && t.parameters.properties) ||        // OpenAI
        (t && t.inputSchema && t.inputSchema.properties) ||
        {};
      const params = Object.keys(props || {}).map(function (name) {
        const spec = props[name] || {};
        return { name: name, type: spec.type, description: spec.description };
      });
      return {
        name: (t && t.name) || "(unnamed)",
        description: (t && t.description) || "",
        params: params
      };
    });
  }

  function toolFacts(toolText) {
    const t = (toolText || "").trim();
    if (!t) return { provided: false, parsed: false, count: 0, tools: [], issues: [], ok: [] };
    let data;
    try { data = JSON.parse(t); }
    catch (e) {
      return { provided: true, parsed: false, count: 0, tools: [], ok: [],
        issues: ["Tool schema is not valid JSON — structural checks skipped."] };
    }
    const tools = normalizeTools(data);
    const allParams = tools.reduce(function (a, x) { return a.concat(x.params); }, []);
    const described = tools.length > 0 && tools.every(function (x) { return x.description && x.description.trim(); });
    const paramsTyped = allParams.every(function (p) { return !!p.type; });
    const paramsDescribed = allParams.every(function (p) { return p.description && String(p.description).trim(); });

    const issues = [], ok = [];
    if (tools.length === 0) issues.push("No tools found in the schema.");
    tools.forEach(function (x) { if (!(x.description && x.description.trim())) issues.push("Tool '" + x.name + "' has no description."); });
    const untyped = allParams.filter(function (p) { return !p.type; }).length;
    const undesc = allParams.filter(function (p) { return !(p.description && String(p.description).trim()); }).length;
    if (untyped > 0) issues.push(untyped + " parameter(s) missing a `type`.");
    if (undesc > 0) issues.push(undesc + " parameter(s) missing a description.");
    if (described) ok.push("All " + tools.length + " tool(s) have a description.");
    if (allParams.length > 0 && paramsTyped) ok.push("All parameters are typed.");
    if (allParams.length > 0 && paramsDescribed) ok.push("All parameters are described.");

    return { provided: true, parsed: true, count: tools.length, tools: tools,
      present: tools.length >= 1, described: described, paramsTyped: paramsTyped, paramsDescribed: paramsDescribed,
      issues: issues, ok: ok };
  }

  function schemaCheck(id, facts) {
    switch (id) {
      case "tools_present": return !!facts.present;
      case "tools_described": return !!facts.described;
      case "params_typed": return facts.present && !!facts.paramsTyped;
      default: return false;
    }
  }

  function signalMatched(sig, combined, facts) {
    if (sig.patterns) {
      for (let i = 0; i < sig.patterns.length; i++) {
        if (new RegExp(sig.patterns[i]).test(combined)) return true;
      }
    }
    if (sig.schema && schemaCheck(sig.schema, facts)) return true;
    return false;
  }

  function gradeFor(total, grades) {
    for (let i = 0; i < grades.length; i++) if (total >= grades[i].min) return grades[i];
    return grades[grades.length - 1];
  }

  function analyze(promptText, toolText, rules) {
    const prompt = norm(promptText);
    const tool = norm(toolText);
    const combined = (prompt + "\n" + tool).toLowerCase();
    const facts = toolFacts(tool);

    let total = 0, maxTotal = 0;
    const axes = rules.axes.map(function (axis) {
      let raw = 0;
      const signals = axis.signals.map(function (sig) {
        const matched = signalMatched(sig, combined, facts);
        if (matched) raw += sig.weight;
        return { id: sig.id, weight: sig.weight, matched: matched,
          present: sig.present, gap: sig.gap, clause: sig.clause, schema: sig.schema };
      });
      const score = Math.min(axis.max, raw);
      total += score; maxTotal += axis.max;
      return { id: axis.id, name: axis.name, max: axis.max, summary: axis.summary,
        score: score, signals: signals };
    });

    return {
      provided: { prompt: prompt.trim().length > 0, tool: tool.trim().length > 0 },
      axes: axes,
      total: total,
      maxTotal: maxTotal,
      grade: gradeFor(total, rules.grades),
      toolSchema: { provided: facts.provided, parsed: facts.parsed, count: facts.count,
        issues: facts.issues, ok: facts.ok }
    };
  }

  // ── Prompt generator ──────────────────────────────────────────────────
  // Deterministically assembles a harness-grade system prompt from the user's
  // rough prompt (kept as the Intent) + the canonical clause for each signal.
  // mode "gaps": only add clauses for UNMATCHED signals; mode "all": every axis.
  // No model call — pure string assembly, so it stays 100% client-side. By
  // construction each clause contains the phrase the analyzer looks for, so the
  // generated prompt re-scores high (see the property test).
  const GEN = {
    en: { intentHeader: "# Intent", intentPlaceholder: "<describe what the agent should accomplish>",
          contractHeader: "## Operating contract", gapsNote: "Filling the gaps found in your harness:",
          allNote: "A full five-axis operating contract:", toolNote: "(also define the tool schema so the agent can act)" },
    ko: { intentHeader: "# 의도 (Intent)", intentPlaceholder: "<에이전트가 달성할 목표를 여기에 기술>",
          contractHeader: "## 운영 계약 (Operating contract)", gapsNote: "하네스에서 발견된 빈틈을 채웁니다:",
          allNote: "5축 전체 운영 계약:", toolNote: "(에이전트가 행동하도록 툴 스키마도 정의하세요)" }
  };

  function harden(promptText, toolText, rules, opts) {
    opts = opts || {};
    const lang = GEN[opts.lang] ? opts.lang : "en";
    const mode = opts.mode === "all" ? "all" : "gaps";
    const a = analyze(promptText, toolText, rules);
    const g = GEN[lang];
    const intent = norm(promptText).trim();
    const lines = [g.intentHeader, intent || g.intentPlaceholder, "", g.contractHeader,
      "_" + (mode === "all" ? g.allNote : g.gapsNote) + "_"];
    let n = 0, needsTool = false;
    a.axes.forEach(function (axis) {
      const chosen = axis.signals.filter(function (s) { return mode === "all" ? true : !s.matched; });
      if (chosen.length === 0) return;
      n++;
      lines.push("", "### " + n + ". " + axis.name[lang]);
      chosen.forEach(function (s) {
        if (s.schema && !s.matched) needsTool = true;
        lines.push("- " + (s.clause ? s.clause[lang] : ""));
      });
    });
    if (needsTool) lines.push("", "> " + g.toolNote);
    return lines.join("\n");
  }

  const api = { analyze: analyze, toolFacts: toolFacts, harden: harden };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.HarnessCheck = api;
  // eslint note: `api` intentionally exposes analyze/harden/toolFacts only.
})(typeof self !== "undefined" ? self : this);
