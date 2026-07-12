#!/usr/bin/env python3
"""Independent correctness audit for harness-quality-checker.

Re-implements the 5-axis scoring FROM THE SPEC (not copied from compute.js):
lowercase the combined prompt+tool text, match each signal by regex-any OR the
structural schema check, sum matched weights per axis (capped), total across
axes. Then it (1) pins hand-computed ANCHOR truths, (2) checks the fixture score
bands, and (3) cross-checks the shipped compute.js output (js_compute_dump.cjs)
field-by-field for byte-parity.

Run:  node audit/js_compute_dump.cjs > /tmp/js.json && python3 audit/reference_audit.py /tmp/js.json
Exit: 0 all correct · 1 any anchor/band/parity failure
"""
import json, re, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
RULES = json.loads((ROOT / "data/rules.json").read_text())
CASES = json.loads((ROOT / "data/examples.json").read_text())["cases"]


def norm(s):
    return (s if isinstance(s, str) else "").replace("’", "'")


def normalize_tools(data):
    if isinstance(data, list):
        lst = data
    elif isinstance(data, dict) and isinstance(data.get("tools"), list):
        lst = data["tools"]
    elif isinstance(data, dict) and isinstance(data.get("functions"), list):
        lst = data["functions"]
    elif isinstance(data, dict):
        lst = [data]
    else:
        lst = []
    out = []
    for el in lst:
        t = el
        if isinstance(el, dict) and el.get("type") == "function" and isinstance(el.get("function"), dict):
            t = el["function"]
        t = t if isinstance(t, dict) else {}
        props = ((t.get("input_schema") or {}).get("properties")
                 or (t.get("parameters") or {}).get("properties")
                 or (t.get("inputSchema") or {}).get("properties") or {})
        params = [{"name": k, "type": (v or {}).get("type"), "description": (v or {}).get("description")}
                  for k, v in props.items()]
        out.append({"name": t.get("name") or "(unnamed)", "description": t.get("description") or "", "params": params})
    return out


def tool_facts(tool_text):
    t = (tool_text or "").strip()
    if t == "":
        return {"provided": False, "parsed": False, "count": 0, "present": False}
    try:
        data = json.loads(t)
    except Exception:
        return {"provided": True, "parsed": False, "count": 0, "present": False}
    tools = normalize_tools(data)
    all_params = [p for x in tools for p in x["params"]]
    described = len(tools) > 0 and all(x["description"] and x["description"].strip() for x in tools)
    params_typed = all(bool(p["type"]) for p in all_params)
    return {"provided": True, "parsed": True, "count": len(tools), "present": len(tools) >= 1,
            "described": described, "paramsTyped": params_typed}


def schema_check(sid, facts):
    return {"tools_present": bool(facts.get("present")),
            "tools_described": bool(facts.get("described")),
            "params_typed": facts.get("present") and bool(facts.get("paramsTyped"))}.get(sid, False)


def signal_matched(sig, combined, facts):
    for p in sig.get("patterns", []):
        if re.search(p, combined):
            return True
    if sig.get("schema") and schema_check(sig["schema"], facts):
        return True
    return False


def grade_for(total):
    for g in RULES["grades"]:
        if total >= g["min"]:
            return g["label"]
    return RULES["grades"][-1]["label"]


def score(prompt, tool):
    combined = (norm(prompt) + "\n" + norm(tool)).lower()
    facts = tool_facts(norm(tool))
    axes, total = {}, 0
    for axis in RULES["axes"]:
        raw = sum(s["weight"] for s in axis["signals"] if signal_matched(s, combined, facts))
        sc = min(axis["max"], raw)
        axes[axis["id"]] = sc
        total += sc
    return {"total": total, "grade": grade_for(total), "axes": axes,
            "toolParsed": facts["parsed"], "toolCount": facts["count"]}


fail = 0


def check(name, cond):
    global fail
    print(("  PASS " if cond else "  FAIL ") + name)
    if not cond:
        fail += 1


# ---- ANCHORS: hand-computed truth, independent of fixtures/JS ----
print("== ANCHORS (hand-computed truth) ==")
check("empty prompt + no tool -> total 0, grade F", score("", "") == {"total": 0, "grade": "F", "axes": {"loop": 0, "verification": 0, "tracing": 0, "memory": 0, "safety": 0}, "toolParsed": False, "toolCount": 0})
check("'adversarial refuter' -> verification > 0", score("add an adversarial refuter pass", "")["axes"]["verification"] > 0)
check("'require human approval before delete' -> safety > 0", score("require human approval before you delete anything", "")["axes"]["safety"] > 0)
check("axis caps hold (no axis exceeds 20)", all(v <= 20 for v in score(CASES[0]["prompt"], CASES[0]["tool"])["axes"].values()))
check("total never exceeds 100", score(CASES[0]["prompt"], CASES[0]["tool"])["total"] <= 100)
# a valid single tool -> loop.act_gate (tools_present) contributes even with no loop prose
check("valid tool alone lifts loop above 0", score("You are an assistant.", CASES[0]["tool"])["axes"]["loop"] >= 4)

# ---- FIXTURE bands (data/examples.json contract) ----
print("\n== fixture bands ==")
for c in CASES:
    r = score(c["prompt"], c["tool"])
    e = c["expect"]
    check(f"{c['id']}: total in [{e['totalMin']},{e['totalMax']}] (got {r['total']})", e["totalMin"] <= r["total"] <= e["totalMax"])
    check(f"{c['id']}: grade {r['grade']} in {e['gradeIn']}", r["grade"] in e["gradeIn"])
    check(f"{c['id']}: toolParsed == {e['toolParsed']}", r["toolParsed"] == e["toolParsed"])
    if "loopExact" in e:
        check(f"{c['id']}: loop == {e['loopExact']}", r["axes"]["loop"] == e["loopExact"])

# ---- PARITY: JS (shipped) vs reference, every fixture ----
print("\n== JS <-> reference parity ==")
js = json.loads(Path(sys.argv[1]).read_text())
by_id = {row["id"]: row for row in js}
mism = []
for c in CASES:
    ref = score(c["prompt"], c["tool"])
    jr = by_id[c["id"]]
    if jr["total"] != ref["total"]:
        mism.append(f"{c['id']}: total JS={jr['total']} REF={ref['total']}")
    if jr["grade"] != ref["grade"]:
        mism.append(f"{c['id']}: grade JS={jr['grade']} REF={ref['grade']}")
    if jr["toolParsed"] != ref["toolParsed"]:
        mism.append(f"{c['id']}: toolParsed JS={jr['toolParsed']} REF={ref['toolParsed']}")
    if jr["toolCount"] != ref["toolCount"]:
        mism.append(f"{c['id']}: toolCount JS={jr['toolCount']} REF={ref['toolCount']}")
    for a in jr["axes"]:
        if a["score"] != ref["axes"][a["id"]]:
            mism.append(f"{c['id']}/{a['id']}: JS={a['score']} REF={ref['axes'][a['id']]}")
check(f"all {len(CASES)} JS results match reference (total/grade/axes/tool)", not mism)
for x in mism[:30]:
    print("     ! " + x)

# ---- DETAIL TABLE ----
print("\n== per-fixture detail ==")
print(f"{'fixture':<14}{'total':>7}{'grade':>7}{'loop':>6}{'verif':>7}{'trace':>7}{'mem':>6}{'safe':>6}")
for c in CASES:
    r = score(c["prompt"], c["tool"])
    a = r["axes"]
    print(f"{c['id']:<14}{r['total']:>7}{r['grade']:>7}{a['loop']:>6}{a['verification']:>7}{a['tracing']:>7}{a['memory']:>6}{a['safety']:>6}")

print(f"\n{'ALL CHECKS PASSED' if fail == 0 else str(fail) + ' CHECK(S) FAILED'}")
sys.exit(1 if fail else 0)
