"""Validate course files.

  python tools/check.py                 validate every course in data/index.json
  python tools/check.py names <id>      list each glyph with its Unicode name
  python tools/check.py find <text>     search Unicode names, e.g. find "HIEROGLYPH G017"
"""
import json, re, sys, unicodedata
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")
DATA = Path(__file__).resolve().parent.parent / "data"
PUNCT = re.compile(r"[,.?!;:]")
FONTS = {
    "cuneiform": [(0x12000, 0x1254F)],
    "hieroglyphs": [(0x13000, 0x1345F)],
    "runic": [(0x16A0, 0x16FF)],
    "greek": [(0x0370, 0x03FF), (0x1F00, 0x1FFF)],
    "devanagari": [(0x0900, 0x097F), (0xA8E0, 0xA8FF)],
}


def tokens(s):
    return PUNCT.sub("", s).split()


def course_ids():
    return json.loads((DATA / "index.json").read_text("utf-8"))


def check(cid):
    errs, warns = [], []
    try:
        c = json.loads((DATA / f"{cid}.json").read_text("utf-8"))
    except Exception as e:
        return [f"cannot load: {e}"], []
    for key in ("id", "name", "native", "era", "place", "blurb", "emblem", "accent", "keys", "facts", "units"):
        if key not in c:
            errs.append(f"missing course field '{key}'")
    script = c.get("script")
    ranges = FONTS.get(script["font"]) if script else None
    if script and not ranges:
        errs.append(f"unknown script font {script.get('font')}")

    def glyph_ok(where, g):
        if not ranges:
            return
        odd = [ch for ch in g if not ch.isspace() and ch not in "-.=()" and not any(a <= ord(ch) <= b for a, b in ranges)]
        if odd:
            warns.append(f"{where}: characters outside the {script['font']} block: {' '.join(f'U+{ord(x):04X}' for x in odd)}")

    for ui, u in enumerate(c.get("units", [])):
        tag = f"unit {ui + 1} '{u.get('title', '?')}'"
        for key in ("title", "about", "kind", "guide", "items"):
            if key not in u:
                errs.append(f"{tag}: missing '{key}'")
        kind = u.get("kind")
        items = u.get("items", [])
        if kind == "words" and not 6 <= len(items) <= 14:
            warns.append(f"{tag}: {len(items)} items (aim for 9-12)")
        if kind == "script" and len(items) < 8:
            warns.append(f"{tag}: only {len(items)} signs")
        seen = {}
        for it in items:
            if not it.get("t") or not it.get("en"):
                errs.append(f"{tag}: item missing t/en: {it}")
                continue
            if kind == "script" and not it.get("g"):
                errs.append(f"{tag}: script item without g: {it['t']}")
            if it.get("g"):
                glyph_ok(f"{tag} '{it['t']}'", it["g"])
            key = it["t"].lower()
            if key in seen:
                warns.append(f"{tag}: duplicate t '{it['t']}'")
            seen[key] = 1
        sentences = u.get("sentences", [])
        if kind == "words" and len(sentences) < 4:
            warns.append(f"{tag}: only {len(sentences)} sentences")
        for s in sentences:
            if not s.get("t") or not s.get("en"):
                errs.append(f"{tag}: sentence missing t/en: {s}")
                continue
            n = len(tokens(s["t"]))
            if not 1 <= n <= 8:
                warns.append(f"{tag}: '{s['t']}' has {n} tokens")
            if s.get("g"):
                if len(tokens(s["g"])) != n:
                    errs.append(f"{tag}: g/t token count differs in '{s['t']}' ({len(tokens(s['g']))} vs {n})")
                glyph_ok(f"{tag} '{s['t']}'", s["g"])
            elif script and script["font"] in ("cuneiform", "hieroglyphs", "greek", "devanagari"):
                warns.append(f"{tag}: sentence without g: '{s['t']}'")
        for g in u.get("guide", []):
            if "h" not in g or "p" not in g:
                errs.append(f"{tag}: guide entry needs h and p")
    if len(c.get("units", [])) != 12:
        warns.append(f"{len(c.get('units', []))} units (aim for 12)")
    check_stories(cid, c, glyph_ok, errs, warns)
    check_reference(cid, c, glyph_ok, errs, warns)
    return errs, warns


def check_reference(cid, course, glyph_ok, errs, warns):
    path = DATA / "reference" / f"{cid}.json"
    if not path.exists():
        warns.append("no reference file (pronunciation and grammar)")
        return
    try:
        ref = json.loads(path.read_text("utf-8"))
    except Exception as e:
        errs.append(f"reference: cannot load: {e}")
        return
    sounds = ref.get("sounds", {})
    if not sounds.get("intro") or not sounds.get("groups"):
        errs.append("reference: sounds needs intro and groups")
    for grp in sounds.get("groups", []):
        if not grp.get("h") or not grp.get("rows"):
            errs.append(f"reference: sound group needs h and rows: {grp.get('h')}")
        for row in grp.get("rows", []):
            if not row.get("t") or not row.get("like"):
                errs.append(f"reference: sound row needs t and like: {row}")
            if row.get("g"):
                glyph_ok(f"sounds '{row.get('t')}'", row["g"])
    for tip in sounds.get("tips", []):
        if not tip.get("h") or not tip.get("p"):
            errs.append("reference: sound tip needs h and p")
    tables = ref.get("grammar", [])
    if not tables:
        errs.append("reference: no grammar tables")
    for tb in tables:
        tag = f"grammar '{tb.get('title', '?')}'"
        for key in ("title", "unit", "head", "rows"):
            if key not in tb:
                errs.append(f"{tag}: missing '{key}'")
        if not 1 <= tb.get("unit", 0) <= len(course.get("units", [])):
            errs.append(f"{tag}: unit {tb.get('unit')} out of range")
        for row in tb.get("rows", []):
            if len(row) != len(tb.get("head", [])):
                errs.append(f"{tag}: row {row} has {len(row)} cells, head has {len(tb.get('head', []))}")
            for cell in row:
                if isinstance(cell, dict):
                    if not cell.get("t"):
                        errs.append(f"{tag}: cell object needs t: {cell}")
                    if cell.get("g"):
                        glyph_ok(tag, cell["g"])
                elif not isinstance(cell, str):
                    errs.append(f"{tag}: bad cell {cell!r}")


def check_stories(cid, course, glyph_ok, errs, warns):
    path = DATA / "stories" / f"{cid}.json"
    if not path.exists():
        return
    try:
        stories = json.loads(path.read_text("utf-8"))
    except Exception as e:
        errs.append(f"stories: cannot load: {e}")
        return
    ids = set()
    for st in stories:
        tag = f"story '{st.get('id', '?')}'"
        for key in ("id", "title", "source", "about", "unit", "lines"):
            if key not in st:
                errs.append(f"{tag}: missing '{key}'")
        if st.get("id") in ids:
            errs.append(f"{tag}: duplicate id")
        ids.add(st.get("id"))
        if not 1 <= st.get("unit", 0) <= len(course.get("units", [])):
            errs.append(f"{tag}: unit {st.get('unit')} is out of range")
        if st.get("badge") and not (st["badge"].get("name") and st["badge"].get("about")):
            errs.append(f"{tag}: badge needs name and about")
        lines = st.get("lines", [])
        if not 3 <= len(lines) <= 12:
            warns.append(f"{tag}: {len(lines)} lines (aim for 4-10)")
        for ln in lines:
            if not ln.get("t") or not ln.get("en"):
                errs.append(f"{tag}: line missing t/en: {ln}")
                continue
            n = len(tokens(ln["t"]))
            if n > 12:
                warns.append(f"{tag}: '{ln['t'][:40]}' has {n} tokens")
            if len(ln.get("gloss", [])) != n:
                errs.append(f"{tag}: gloss count {len(ln.get('gloss', []))} != {n} tokens in '{ln['t'][:40]}'")
            if ln.get("g"):
                if len(tokens(ln["g"])) != n:
                    errs.append(f"{tag}: g/t token count differs in '{ln['t'][:40]}' ({len(tokens(ln['g']))} vs {n})")
                glyph_ok(f"{tag} '{ln['t'][:30]}'", ln["g"])
            q = ln.get("q")
            if q and not (q.get("prompt") and 2 <= len(q.get("options", [])) <= 4 and 0 <= q.get("answer", -1) < len(q["options"])):
                errs.append(f"{tag}: bad question on '{ln['t'][:40]}'")


def names(cid):
    c = json.loads((DATA / f"{cid}.json").read_text("utf-8"))
    groups = [(u["title"], u["items"] + u.get("sentences", [])) for u in c["units"]]
    story_path = DATA / "stories" / f"{cid}.json"
    if story_path.exists():
        groups += [(f"story {s['id']}", s["lines"]) for s in json.loads(story_path.read_text("utf-8"))]
    for title, entries in groups:
        print(f"\n== {title}")
        for it in entries:
            if not it.get("g"):
                continue
            print(f"{it['t']}  ({it['en']})")
            for ch in it["g"]:
                if not ch.isspace():
                    print(f"    {ch}  U+{ord(ch):04X}  {unicodedata.name(ch, '?')}")


def find(text):
    text = text.upper()
    hits = 0
    for cp in range(0x110000):
        name = unicodedata.name(chr(cp), "")
        if text in name:
            print(f"{chr(cp)}  U+{cp:04X}  {name}")
            hits += 1
            if hits >= 80:
                print("... (truncated)")
                return


if __name__ == "__main__":
    args = sys.argv[1:]
    if args[:1] == ["names"]:
        names(args[1])
    elif args[:1] == ["find"]:
        find(" ".join(args[1:]))
    else:
        failed = False
        listed = set(json.loads((DATA / "stories" / "index.json").read_text("utf-8")))
        present = {f.stem for f in (DATA / "stories").glob("*.json") if f.stem != "index"}
        if not args and listed != present:
            print(f"stories/index.json is out of date: lists {sorted(listed)}, files exist for {sorted(present)}")
            failed = True
        for cid in args or course_ids():
            errs, warns = check(cid)
            print(f"{cid}: {'OK' if not errs else 'FAIL'} ({len(errs)} errors, {len(warns)} warnings)")
            for e in errs:
                print("  error:", e)
            for w in warns:
                print("  warn: ", w)
            failed |= bool(errs)
        sys.exit(1 if failed else 0)
