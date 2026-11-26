#!/usr/bin/env python3
"""Sanity checks on data/foods.json. Run before every build; exits non-zero on any failure.

- tags, class, serving and raw flag use the known values
- energy: Atwater estimate (4 protein + 9 fat + 4 net carb + 2 fiber) within 0.62-1.45 of kcal
- fiber <= carbohydrate; fiber only in plant foods
- vitamin B12 not in unfortified plant foods (tempeh and miso carry traces)
- no negative values
- every food says whether it is an everyday food (common 0|1); no USDA entry (fdc) used twice
- every food has a NOVA group 1-3 (4 only as a stated exception); removed keys aren't live foods
"""
import json, pathlib, sys

d = json.loads((pathlib.Path(__file__).parent.parent / "data/foods.json").read_text(encoding="utf-8"))
O = d["order"]
# Diet patterns and allergen exclusions match these words exactly, so a typo silently
# lets a food past a filter.
TAGS = set("dairy egg gluten peanut treenut soy fish shellfish sesame nightshade "
           "legume grain redmeat organ addedsugar fortified".split())
CLS = {"plant", "dairy", "egg", "fish", "meat"}
errs = []
for f in d["foods"]:
    n = dict(zip(O, f["n"])); k = f["k"]; tags = f["tags"].split()
    if set(tags) - TAGS: errs.append(f"{k}: unknown tag {' '.join(sorted(set(tags) - TAGS))}")
    if f["cls"] not in CLS: errs.append(f"{k}: unknown class {f['cls']}")
    if not f["serv"] > 0: errs.append(f"{k}: serving must be over 0 g")
    if f["raw"] not in (0, 1): errs.append(f"{k}: raw must be 0 or 1")
    if f.get("common") not in (0, 1): errs.append(f"{k}: common (everyday food) must be 0 or 1")
    # NOVA: 1 unprocessed/minimally processed, 2 culinary ingredient, 3 processed. Group 4
    # (ultra-processed) is left out; the few kept on purpose say why in `exc`.
    if f.get("nova") not in (1, 2, 3) and not (f.get("nova") == 4 and f.get("exc")):
        errs.append(f"{k}: nova must be 1, 2 or 3 (4 only as an exception with a reason in exc)")
    if len(f["n"]) != len(O): errs.append(f"{k}: expected {len(O)} values")
    if any(v < 0 for v in f["n"]): errs.append(f"{k}: negative value")
    if n["fiber"] > n["carb"] + 1e-9: errs.append(f"{k}: fiber > carbohydrate")
    if f["cls"] != "plant" and n["fiber"] > 0: errs.append(f"{k}: fiber in an animal food")
    if f["cls"] == "plant" and n["B12"] > 0.1 and "fortified" not in tags and k not in ("tempeh", "miso"):
        errs.append(f"{k}: B12 in an unfortified plant food")
    if n["kcal"] >= 5 and k != "cocoa":
        r = (4*n["protein"] + 9*n["fat"] + 4*(n["carb"] - n["fiber"]) + 2*n["fiber"]) / n["kcal"]
        if not 0.62 <= r <= 1.45: errs.append(f"{k}: Atwater ratio {r:.2f}")
keys = [f["k"] for f in d["foods"]]
if len(keys) != len(set(keys)): errs.append("duplicate food keys")
fdcs = [f["fdc"] for f in d["foods"] if "fdc" in f]
for x in {x for x in fdcs if fdcs.count(x) > 1}: errs.append(f"USDA entry {x} used by more than one food")
# `removed` names foods taken out (old saved days are told what was left out); none may still be live
for k in set(d.get("removed", {})) & set(keys): errs.append(f"{k}: listed in removed but still a food")
print("\n".join(errs) or f"OK: {len(d['foods'])} foods pass all checks")
sys.exit(1 if errs else 0)
