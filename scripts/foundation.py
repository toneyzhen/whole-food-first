#!/usr/bin/env python3
"""Take newer USDA Foundation Foods lab values for matched foods, nutrient by nutrient.

Foundation Foods (FoodData Central) re-analyses a few hundred staples about twice a year. For each
food in data/audit/foundation_matches.json (app key -> Foundation fdcId: the same food in the same
form, checked by hand), every nutrient Foundation measured replaces the app's value; everything
else stays (SR Legacy). Each change is logged, old and new, in data/audit/foundation_<release>.json.

    python3 scripts/foundation.py FoodData_Central_foundation_food_json_2026-04-30.zip           # dry run
    python3 scripts/foundation.py FoodData_Central_foundation_food_json_2026-04-30.zip --write

Download the JSON zip from https://fdc.nal.usda.gov/download-datasets (don't commit it). To add
foods, put new matches in foundation_matches.json first. Then run validate.py, build.py and the
smoke test, and compare the solver sweep with CLAUDE.md.
"""
import json, pathlib, re, sys, zipfile
from validate import problems   # the same checks validate.py runs (scripts/ is on the path when run)

ROOT = pathlib.Path(__file__).parent.parent
# Foundation nutrient numbers for each app nutrient, in order of preference; a tuple is summed
# (EPA + DHA, K1 + MK-4). Folate is absent: Foundation reports no DFE.
NUM = {"kcal": ["208", "958", "957"], "protein": ["203"], "fat": ["204"], "carb": ["205", "205.2"],
       "fiber": ["291"], "LA": ["618", "675"], "ALA": ["619", "851"], "EPADHA": [("629", "621")],
       "Ca": ["301"], "Fe": ["303"], "Mg": ["304"], "P": ["305"], "K": ["306"], "Zn": ["309"],
       "Cu": ["312"], "Mn": ["315"], "Na": ["307"], "Se": ["317"], "I": ["314"], "A": ["320"],
       "C": ["401"], "D": ["328"], "E": ["323"], "K1K2": [("430", "428")], "B1": ["404"],
       "B2": ["405"], "B3": ["406"], "B6": ["415"], "B12": ["418"], "choline": ["421"], "Mo": ["316"]}
# Brazil nut selenium varies enormously by soil; a lower figure would let the solver plan more nuts
# than the selenium upper limit allows with real ones, so the higher SR value stays.
KEEP_SR = {("brazil", "Se")}

def foundation(zip_path):
    """fdcId -> (description, {app nutrient: value per 100 g}) for the foods Foundation measured."""
    z = zipfile.ZipFile(zip_path)
    out = {}
    for f in json.loads(z.read(z.namelist()[0]))["FoundationFoods"]:
        if not f: continue
        v = {str(x["nutrient"]["number"]): x["amount"] for x in (f.get("foodNutrients") or [])
             if x and x.get("amount") is not None and (x.get("nutrient") or {}).get("number")}
        vals = {}
        for k, alts in NUM.items():
            for a in alts:
                if isinstance(a, tuple):
                    if all(b in v for b in a): vals[k] = sum(v[b] for b in a); break
                    if k == "K1K2" and a[0] in v: vals[k] = v[a[0]]; break
                elif a in v: vals[k] = v[a]; break
        out[str(f["fdcId"])] = (f["description"], vals)
    return out

def main(zip_path, write):
    release = re.search(r"(\d{4}-\d{2})-\d{2}", pathlib.Path(zip_path).name)
    release = release.group(1) if release else "unknown"
    ff = foundation(zip_path)
    match = json.loads((ROOT / "data/audit/foundation_matches.json").read_text(encoding="utf-8"))["matches"]
    d = json.loads((ROOT / "data/foods.json").read_text(encoding="utf-8")); O = d["order"]
    IX = {k: i for i, k in enumerate(O)}; by = {f["k"]: f for f in d["foods"]}
    iodine_db = json.loads((ROOT / "data/audit/iodine_r4.json").read_text(encoding="utf-8"))["foods"]
    audit, held = {}, []
    for k, fid in sorted(match.items()):
        f = by.get(k); x = ff.get(str(fid))
        if not f or not x: held.append(f"{k}: {'no such food' if not f else 'not in this release'}"); continue
        desc, v = x; old = list(f["n"])
        # the same food in the same form agrees on energy and protein; a big gap means a wrong match
        gap = next((f"{n} {old[IX[n]]:g} -> {v[n]:g}" for n, tol, floor in (("kcal", .25, 10), ("protein", .30, 1))
                    if n in v and abs(v[n] - old[IX[n]]) > floor and abs(v[n] - old[IX[n]]) / max(old[IX[n]], 1e-9) > tol), None)
        if gap: held.append(f"{k}: {gap}"); continue
        new, changed = list(old), {}
        for n, val in v.items():
            if n == "I" and old[IX["I"]] > 0 and k in iodine_db: continue   # the Iodine Database is better
            if n == "fiber" and f["cls"] != "plant": continue
            if val == 0 and old[IX[n]] > 0: continue      # Foundation often records 0 when not quantified
            if (k, n) in KEEP_SR: continue
            val = round(float(val), 3 if val < 1 else 2 if val < 10 else 1)
            if val != old[IX[n]]: new[IX[n]] = val; changed[n] = [old[IX[n]], val]
        f["n"] = new
        errs = problems(f, O)
        if errs: f["n"] = old; held.append(f"{k}: {', '.join(errs)}"); continue
        f["ff"] = int(fid)
        if changed: audit[k] = {"ff": int(fid), "description": desc, "changed": changed}
    print(f"{len(match)} matches, {len(audit)} foods with changed values, {len(held)} held")
    for h in held: print("  held", h)
    for k, a in audit.items(): print(f"  {k}: " + ", ".join(f"{n} {o:g}->{w:g}" for n, (o, w) in a["changed"].items()))
    if not write: return
    order = ["k", "name", "cat", "cls", "serv", "sl", "tags", "raw", "common", "nova", "exc", "n", "fdc", "ff"]
    d["foods"] = [{x: f[x] for x in order if x in f} for f in d["foods"]]
    (ROOT / "data/foods.json").write_bytes(json.dumps(d, indent=1, ensure_ascii=False).encode("utf-8"))
    if audit:
        (ROOT / f"data/audit/foundation_{release}.json").write_bytes((json.dumps({
            "source": f"USDA FoodData Central, Foundation Foods ({pathlib.Path(zip_path).name}). https://fdc.nal.usda.gov/download-datasets",
            "how": "See scripts/foundation.py: matched foods take every nutrient Foundation measured, except a 0 over a real value, fiber for animal foods, iodine from the Iodine Database, and Brazil nut selenium.",
            "foods": dict(sorted(audit.items()))}, indent=1, ensure_ascii=False) + "\n").encode("utf-8"))
    print("written")

if __name__ == "__main__":
    if len(sys.argv) < 2: sys.exit(__doc__)
    main(sys.argv[1], "--write" in sys.argv)
