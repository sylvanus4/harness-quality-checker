/* ─────────────────────────────────────────────────────────────────────────
   harness-quality-checker — DOM wiring (EN/KO) + source loaders.
   Scoring, generation, URL-normalization, checkable-gate, and markdown
   extraction all live in compute.js (pure). This file fetches the rule set +
   skill catalog, wires the textareas / URL / drag-drop / skills.sh picker,
   runs the pre-flight gate before scoring, and renders in the selected
   language. User-supplied strings are escaped before insertion.
   ───────────────────────────────────────────────────────────────────────── */
(function () {
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  const promptEl = $("prompt"), toolsEl = $("tools"), out = $("out"), badge = $("gradeBadge"), genOut = $("genOut");
  const srcUrl = $("srcUrl"), skillSelect = $("skillSelect"), dropZone = $("dropZone"), fileInput = $("fileInput"),
    loadStatus = $("loadStatus"), disclaimer = $("disclaimer");
  let rules = null, examples = null, skills = null, lang = "ko";
  const mode = () => (document.querySelector('input[name="genmode"]:checked') || {}).value || "gaps";

  const I18N = {
    en: {
      sub: 'Paste your agent\'s <b>system prompt</b> and <b>tool schema</b> — or <b>load a SKILL.md by URL / file / from skills.sh</b>. A rule-based static analyzer scores the harness on five axes — <b>Loop · Verification · Tracing · Memory · Safety</b> — flags the gaps, and can <b>generate a hardened prompt</b> that satisfies all five. Like ESLint, but for agent harnesses. <b>No key · no server · no data leaves your browser.</b>',
      inHead: "Input", loadFrom: "Load from a URL, file, or skills.sh", fetch: "Fetch", check: "Check",
      dropText: "Drop a SKILL.md / agent .md here, or ", browse: "browse", skillPlaceholder: "Browse popular skills (skills.sh)…",
      lblPrompt: "System prompt", hintPrompt: "the agent / MCP tool instructions",
      lblTools: "Tool / function schema", hintTools: "JSON — Anthropic or OpenAI shape (optional)",
      exStrong: "Load strong example", exWeak: "Load weak example", clear: "Clear",
      scoreHead: "Score", placeholder: "Paste a harness, load a file, or pick a skill to see the five-axis breakdown.",
      genHead: "Generate a hardened prompt", modeGaps: "Fill the gaps", modeAll: "Full contract",
      genSub: "Keeps your rough prompt as the intent and appends a deterministic operating contract that covers the missing axes — so the result scores near-100. No model call; runs in your browser.",
      gen: "Generate", copy: "Copy", copied: "Copied ✓", genPlaceholder: "The hardened prompt appears here…",
      schemaHealth: "Tool schema health", noTool: "No tool schema provided — an agent needs tools to act and observe.",
      signalsPresent: (n) => n + " signal(s) present",
      busy: "Fetching…", loadedOk: (n) => "Loaded ✓ " + (n ? "(" + n + ")" : ""),
      fetchFail: (m) => "Couldn't fetch (" + m + "). If it's a private repo or a non-CORS host, download the file and drop it here.",
      disclaimer: "Loaded a skill/agent file. This tool scores <b>agent-harness structure</b> (loop · verification · tracing · memory · safety). A <b>knowledge or workflow skill</b> — a checklist, a style guide, a how-to — legitimately scores low: it's a category mismatch, not a defect. Score it only if it's meant to drive an autonomous agent loop.",
      howAxesSummary: "What the five axes mean",
      howAxesBody: "<ul><li><b>Loop</b> — does the harness form a real agent loop? Tool results fed back as observations, iteration, and an explicit exit condition — not a single-shot answer.</li><li><b>Verification</b> — does the loop close on an objective gate (tests / typecheck / exit code / an independent reviewer) rather than the model's own claim that it is done?</li><li><b>Tracing</b> — are inputs, outputs, timing, and errors recorded per step, so a failure can be diagnosed after the fact?</li><li><b>Memory</b> — are short-term working memory, conversation history, and a long-term store distinguished, and is the context budget managed?</li><li><b>Safety</b> — is untrusted input validated, are tool permissions scoped, and are irreversible actions gated on approval / dry-run / rollback?</li></ul><p class='dim'>Adapted from the common \"production agent stack\" framing (loop · harness · evals · tracing · memory), reframed for what you can statically check in a prompt + tool schema.</p>",
      howScoreSummary: "How the score works (and its limits)",
      howScoreBody: "<ul><li>Each axis has weighted <b>signals</b> (regex phrase patterns + structural checks on the tool JSON). A signal counts if its phrasing appears in your prompt/tools <em>or</em> its structural check passes.</li><li>Axis score = <code>min(20, sum of matched signal weights)</code>. Total = sum of the five axes = <code>0–100</code>, mapped to a letter grade.</li><li>The <b>Generate</b> button assembles a hardened prompt deterministically from the same rules — each clause contains the phrasing the analyzer looks for, so the result re-scores near-100. It is a scaffold to edit, not a finished prompt.</li><li>Loading a URL/file fetches only the raw text (GitHub raw is CORS-open); skills.sh is snapshotted into <code>data/skills.json</code> because it sends no CORS header. Everything is analyzed locally.</li><li><b>Limits:</b> this is a <em>lint</em>, not a proof. It reads phrasing and structure, so it can miss an idea worded unusually, or credit a phrase that isn't truly wired. A low score means \"make these concerns explicit,\" not \"this is bad.\"</li></ul>",
      footer: '100% client-side · <a href="https://github.com/sylvanus4/harness-quality-checker">GitHub</a> · MIT · a vendor-neutral self-diagnostic. Scores are heuristic estimates, not a guarantee.',
      loadErr: (m) => 'Could not load rule set (' + esc(m) + "). Serve over http (e.g. <code>python3 -m http.server</code>), not file://."
    },
    ko: {
      sub: '에이전트의 <b>시스템 프롬프트</b>와 <b>툴 스키마</b>를 붙여넣거나 — <b>URL·파일·skills.sh에서 SKILL.md를 불러오세요</b>. 규칙 기반 정적 분석기가 하네스를 5축 — <b>루프 · 검증 · 추적 · 메모리 · 안전</b> — 으로 채점하고, 빈틈을 짚고, 다섯 축을 만족하는 <b>강화된 프롬프트를 생성</b>합니다. ESLint의 에이전트 하네스판. <b>키 없음 · 서버 없음 · 데이터가 브라우저를 벗어나지 않음.</b>',
      inHead: "입력", loadFrom: "URL·파일·skills.sh에서 불러오기", fetch: "가져오기", check: "검사",
      dropText: "SKILL.md / 에이전트 .md 파일을 여기에 놓거나, ", browse: "찾아보기", skillPlaceholder: "인기 스킬 둘러보기 (skills.sh)…",
      lblPrompt: "시스템 프롬프트", hintPrompt: "에이전트 / MCP 툴 지시문",
      lblTools: "툴 / 함수 스키마", hintTools: "JSON — Anthropic 또는 OpenAI 형태 (선택)",
      exStrong: "강한 예시 불러오기", exWeak: "약한 예시 불러오기", clear: "지우기",
      scoreHead: "점수", placeholder: "하네스를 붙여넣거나, 파일을 불러오거나, 스킬을 고르면 5축 분석이 표시됩니다.",
      genHead: "강화된 프롬프트 생성", modeGaps: "빈틈만 채우기", modeAll: "전체 계약",
      genSub: "당신의 러프한 프롬프트를 의도(intent)로 유지하고, 빠진 축을 덮는 결정론적 운영 계약을 덧붙입니다 — 결과는 100점에 가깝게 재채점됩니다. 모델 호출 없이 브라우저에서 실행됩니다.",
      gen: "생성", copy: "복사", copied: "복사됨 ✓", genPlaceholder: "여기에 강화된 프롬프트가 나타납니다…",
      schemaHealth: "툴 스키마 상태", noTool: "툴 스키마가 없습니다 — 에이전트가 행동·관찰하려면 툴이 필요합니다.",
      signalsPresent: (n) => "충족된 신호 " + n + "개",
      busy: "가져오는 중…", loadedOk: (n) => "불러옴 ✓ " + (n ? "(" + n + ")" : ""),
      fetchFail: (m) => "가져오지 못했습니다 (" + m + "). 비공개 저장소이거나 CORS 미허용 호스트면, 파일을 내려받아 여기에 끌어다 놓으세요.",
      disclaimer: "스킬/에이전트 파일을 불러왔습니다. 이 도구는 <b>에이전트 하네스 구조</b>(루프 · 검증 · 추적 · 메모리 · 안전)를 채점합니다. 체크리스트·스타일 가이드·how-to 같은 <b>지식/워크플로 스킬</b>은 낮게 나오는 게 정상입니다 — 결함이 아니라 카테고리 불일치입니다. 자율 에이전트 루프를 구동하려는 것일 때만 채점하세요.",
      howAxesSummary: "다섯 축의 의미",
      howAxesBody: "<ul><li><b>루프(Loop)</b> — 실제 에이전트 루프를 이루는가? 툴 결과를 관찰로 되먹이고, 반복하며, 명시적 종료 조건이 있는가 — 한 번에 답하고 끝이 아니라.</li><li><b>검증(Verification)</b> — 모델의 '끝났다' 주장이 아니라 객관적 게이트(테스트/타입체크/exit code/독립 리뷰어)로 루프를 닫는가?</li><li><b>추적(Tracing)</b> — 단계별 입력·출력·타이밍·에러가 기록돼 사후에 실패를 진단할 수 있는가?</li><li><b>메모리(Memory)</b> — 단기 작업 메모리·대화 히스토리·장기 저장소를 구분하고, 컨텍스트 예산을 관리하는가?</li><li><b>안전(Safety)</b> — 신뢰 불가 입력을 검증하고, 툴 권한을 좁히며, 비가역 행동을 승인/dry-run/rollback으로 막는가?</li></ul><p class='dim'>흔한 \"프로덕션 에이전트 스택\" 프레임(loop · harness · evals · tracing · memory)을, 프롬프트+툴 스키마에서 정적으로 확인 가능한 형태로 재구성한 것입니다.</p>",
      howScoreSummary: "채점 방식 (그리고 한계)",
      howScoreBody: "<ul><li>각 축은 가중 <b>신호</b>(정규식 문구 패턴 + 툴 JSON 구조 검사)를 가집니다. 해당 문구가 프롬프트/툴에 나타나거나 구조 검사를 통과하면 카운트됩니다.</li><li>축 점수 = <code>min(20, 매칭된 신호 가중치 합)</code>. 총점 = 5축 합 = <code>0–100</code>, 등급으로 매핑.</li><li><b>생성</b> 버튼은 같은 규칙으로 강화 프롬프트를 결정론적으로 조립합니다 — 각 조항이 분석기가 찾는 문구를 담고 있어 결과가 100점 근처로 재채점됩니다. 완성본이 아니라 다듬을 골격입니다.</li><li>URL/파일 불러오기는 원문 텍스트만 가져옵니다(GitHub raw는 CORS 열림). skills.sh는 CORS 헤더를 안 줘서 <code>data/skills.json</code>에 스냅샷했습니다. 분석은 전부 로컬에서 이뤄집니다.</li><li><b>한계:</b> 이것은 <em>린트</em>이지 증명이 아닙니다. 문구·구조를 읽으므로 특이 표현을 놓치거나 실제 배선 안 된 문구에 점수를 줄 수 있습니다. 낮은 점수는 \"이 관심사를 명시하라\"는 뜻이지 \"나쁘다\"가 아닙니다.</li></ul>",
      footer: '100% 클라이언트 사이드 · <a href="https://github.com/sylvanus4/harness-quality-checker">GitHub</a> · MIT · 벤더 중립 자가진단 도구. 점수는 휴리스틱 추정치이며 보장이 아닙니다.',
      loadErr: (m) => '규칙셋을 불러오지 못했습니다 (' + esc(m) + "). file:// 이 아니라 http로 서빙하세요 (예: <code>python3 -m http.server</code>)."
    }
  };

  function applyChrome() {
    const t = I18N[lang];
    document.documentElement.lang = lang;
    $("sub").innerHTML = t.sub;
    $("inHead").firstChild.nodeValue = t.inHead + " ";
    $("loadFromLbl").textContent = t.loadFrom;
    $("btnFetch").textContent = t.fetch;
    $("btnCheckSkill").textContent = t.check;
    $("dropText").textContent = t.dropText;
    $("browseLbl").textContent = t.browse;
    if (skillSelect.options[0]) skillSelect.options[0].textContent = t.skillPlaceholder;
    $("lblPrompt").childNodes[0].nodeValue = t.lblPrompt + " ";
    $("hintPrompt").textContent = t.hintPrompt;
    $("lblTools").childNodes[0].nodeValue = t.lblTools + " ";
    $("hintTools").textContent = t.hintTools;
    $("exStrong").textContent = t.exStrong;
    $("exWeak").textContent = t.exWeak;
    $("btnClear").textContent = t.clear;
    $("scoreHead").textContent = t.scoreHead;
    $("genHead").textContent = t.genHead;
    $("modeGaps").textContent = t.modeGaps;
    $("modeAll").textContent = t.modeAll;
    $("genSub").textContent = t.genSub;
    $("btnGen").textContent = t.gen;
    $("btnCopy").textContent = t.copy;
    genOut.setAttribute("placeholder", t.genPlaceholder);
    $("howAxesSummary").textContent = t.howAxesSummary;
    $("howAxesBody").innerHTML = t.howAxesBody;
    $("howScoreSummary").textContent = t.howScoreSummary;
    $("howScoreBody").innerHTML = t.howScoreBody;
    $("footer").innerHTML = t.footer;
    if (disclaimer && !disclaimer.hidden) disclaimer.innerHTML = t.disclaimer;
    const ph = $("placeholder"); if (ph) ph.textContent = t.placeholder;
  }

  function setStatus(kind, msg) { loadStatus.className = "load-status " + (kind || ""); loadStatus.innerHTML = msg || ""; }
  function showDisclaimer(on) { if (!disclaimer) return; disclaimer.hidden = !on; if (on) disclaimer.innerHTML = I18N[lang].disclaimer; }

  function render() {
    if (!rules) return;
    const t = I18N[lang];
    const hasInput = promptEl.value.trim() || toolsEl.value.trim();
    if (!hasInput) { badge.textContent = ""; out.innerHTML = '<p class="dim" id="placeholder">' + esc(t.placeholder) + "</p>"; return; }
    let r;
    try { r = HarnessCheck.analyze(promptEl.value, toolsEl.value, rules); }
    catch (e) { out.innerHTML = '<div class="err">Analysis error: <code>' + esc(e && e.message) + "</code></div>"; return; }

    badge.innerHTML = '<span class="badge ' + (r.total >= 70 ? "ok" : r.total >= 55 ? "warn" : "no") + '">' + r.total + " / 100</span>";
    let html = '<div class="grade-hero"><span class="grade-letter g-' + esc(String(r.grade.label).toLowerCase()) + '">' + esc(r.grade.label) +
      '</span><span class="grade-total">' + r.total + " / 100</span></div>" +
      '<p class="grade-blurb">' + esc(r.grade.blurb[lang]) + "</p>";

    r.axes.forEach(function (a) {
      const pct = Math.round((a.score / a.max) * 100);
      html += '<div class="axis"><div class="axis-head"><span class="axis-name">' + esc(a.name[lang]) +
        '</span><span class="axis-score"><b>' + a.score + "</b> / " + a.max + "</span></div>" +
        '<div class="bar"><div class="fill" style="width:' + pct + '%"></div></div>' +
        '<p class="axis-summary">' + esc(a.summary[lang]) + "</p>";
      const oks = a.signals.filter(function (s) { return s.matched; });
      a.signals.filter(function (s) { return !s.matched; })
        .forEach(function (s) { html += '<div class="sig gap"><span class="mk">→</span><span>' + esc(s.gap[lang]) + "</span></div>"; });
      if (oks.length) {
        html += '<details class="axis-sigs"><summary>' + esc(t.signalsPresent(oks.length)) + "</summary>";
        oks.forEach(function (s) { html += '<div class="sig ok"><span class="mk">✓</span><span>' + esc(s.present[lang]) + "</span></div>"; });
        html += "</details>";
      }
      html += "</div>";
    });

    const ts = r.toolSchema;
    html += '<div class="schema"><div class="block-title">' + esc(t.schemaHealth) + "</div>";
    if (!ts.provided) html += '<div class="schema-row issue"><span class="mk">→</span><span>' + esc(t.noTool) + "</span></div>";
    else {
      ts.issues.forEach(function (i) { html += '<div class="schema-row issue"><span class="mk">✗</span><span>' + esc(i) + "</span></div>"; });
      ts.ok.forEach(function (o) { html += '<div class="schema-row ok"><span class="mk">✓</span><span>' + esc(o) + "</span></div>"; });
    }
    html += "</div>";
    out.innerHTML = html;
  }

  function generate() {
    if (!rules) return;
    try { genOut.value = HarnessCheck.harden(promptEl.value, toolsEl.value, rules, { lang: lang, mode: mode() }); }
    catch (e) { genOut.value = "error: " + (e && e.message); }
    $("btnCopy").disabled = !genOut.value;
  }

  function copyGen() {
    if (!genOut.value) return;
    const done = function () { const b = $("btnCopy"); b.textContent = I18N[lang].copied; setTimeout(function () { b.textContent = I18N[lang].copy; }, 1400); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(genOut.value).then(done, done);
    else { genOut.select(); try { document.execCommand("copy"); } catch (e) {} done(); }
  }

  // ── loading a fetched/dropped skill file ──
  function ingestText(text, label) {
    const chk = HarnessCheck.isCheckable(text);
    if (!chk.ok) { setStatus("err", esc(chk.reason)); showDisclaimer(false); return false; }
    const ex = HarnessCheck.extractHarness(text);
    promptEl.value = ex.prompt;
    toolsEl.value = ex.tools;
    setStatus("ok", esc(I18N[lang].loadedOk(ex.meta.name || label || "")));
    showDisclaimer(true);
    render();
    return true;
  }

  function fetchAndLoad(rawUrl) {
    setStatus("busy", esc(I18N[lang].busy));
    fetch(rawUrl).then(function (r) {
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.text();
    }).then(function (txt) { ingestText(txt, rawUrl.split("/").pop()); })
      .catch(function (e) { setStatus("err", I18N[lang].fetchFail(esc(e && e.message))); showDisclaimer(false); });
  }

  function fetchFromInput() {
    const norm = HarnessCheck.normalizeSourceUrl(srcUrl.value);
    if (norm.error) { setStatus("err", esc(norm.error)); return; }
    fetchAndLoad(norm.rawUrl);
  }

  function loadExample(id) {
    if (id === "clear") { promptEl.value = ""; toolsEl.value = ""; genOut.value = ""; $("btnCopy").disabled = true; showDisclaimer(false); setStatus("", ""); render(); return; }
    if (!examples) return;
    const c = examples.cases.find(function (x) { return x.id === id; });
    if (!c) return;
    promptEl.value = c.prompt; toolsEl.value = c.tool; showDisclaimer(false); setStatus("", ""); render();
  }

  function populateSkills() {
    if (!skills || !skills.skills) return;
    const ph = document.createElement("option"); ph.value = ""; ph.textContent = I18N[lang].skillPlaceholder;
    skillSelect.appendChild(ph);
    skills.skills.forEach(function (s) {
      const o = document.createElement("option");
      o.value = s.rawUrl;
      const k = s.installs >= 1000 ? Math.round(s.installs / 1000) + "k" : String(s.installs);
      o.textContent = s.name + " · " + s.source + " · " + k;
      skillSelect.appendChild(o);
    });
  }

  // events
  promptEl.addEventListener("input", function () { showDisclaimer(false); render(); });
  toolsEl.addEventListener("input", render);
  $("btnGen").addEventListener("click", generate);
  $("btnCopy").addEventListener("click", copyGen);
  $("btnFetch").addEventListener("click", fetchFromInput);
  srcUrl.addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); fetchFromInput(); } });
  $("btnCheckSkill").addEventListener("click", function () { if (skillSelect.value) fetchAndLoad(skillSelect.value); });
  skillSelect.addEventListener("change", function () { if (skillSelect.value) fetchAndLoad(skillSelect.value); });
  fileInput.addEventListener("change", function () {
    const f = fileInput.files && fileInput.files[0]; if (!f) return;
    const rd = new FileReader(); rd.onload = function () { ingestText(String(rd.result), f.name); }; rd.readAsText(f);
  });
  ["dragenter", "dragover"].forEach(function (ev) { dropZone.addEventListener(ev, function (e) { e.preventDefault(); dropZone.classList.add("drag"); }); });
  ["dragleave", "drop"].forEach(function (ev) { dropZone.addEventListener(ev, function (e) { e.preventDefault(); dropZone.classList.remove("drag"); }); });
  dropZone.addEventListener("drop", function (e) {
    const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]; if (!f) return;
    const rd = new FileReader(); rd.onload = function () { ingestText(String(rd.result), f.name); }; rd.readAsText(f);
  });
  document.querySelectorAll("[data-ex]").forEach(function (b) { b.addEventListener("click", function () { loadExample(b.getAttribute("data-ex")); }); });
  document.querySelectorAll('#langToggle input[name="lang"]').forEach(function (r) {
    r.addEventListener("change", function () { lang = r.value; applyChrome(); render(); if (genOut.value) generate(); });
  });
  document.querySelectorAll('#genMode input[name="genmode"]').forEach(function (r) {
    r.addEventListener("change", function () { if (genOut.value) generate(); });
  });

  applyChrome();
  Promise.all([
    fetch("data/rules.json").then(function (r) { return r.json(); }),
    fetch("data/examples.json").then(function (r) { return r.json(); }),
    fetch("data/skills.json").then(function (r) { return r.json(); }).catch(function () { return { skills: [] }; })
  ]).then(function (res) { rules = res[0]; examples = res[1]; skills = res[2]; populateSkills(); render(); })
    .catch(function (e) { out.innerHTML = '<div class="err">' + I18N[lang].loadErr(e && e.message) + "</div>"; });
})();
