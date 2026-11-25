#!/usr/bin/env python3
"""Build index.html from src/app.template.html + src/js/*.js + data/foods.json.

The app is a single self-contained HTML file: the scripts and the food database are inlined so
the page works from file:// or any static host with no server.

The scripts share one scope and run top to bottom, in the order of JS_FILES; a file may use
anything defined in an earlier one (and functions from any of them, which are hoisted).
"""
import json, pathlib

ROOT = pathlib.Path(__file__).parent
JS_FILES = ["foods", "nutrients", "builder", "solver", "views", "storage", "boot"]
data = json.loads((ROOT / "data/foods.json").read_text(encoding="utf-8"))
js = "".join((ROOT / f"src/js/{n}.js").read_text(encoding="utf-8") for n in JS_FILES)
page = (ROOT / "src/app.template.html").read_text(encoding="utf-8")
page = (page.replace("/*__JS__*/", js)
            .replace("/*__DATA__*/", json.dumps(data, separators=(",", ":"), ensure_ascii=False))
            .replace("__NFOODS__", str(len(data["foods"]))))
(ROOT / "index.html").write_bytes(page.encode("utf-8"))  # bytes: keep LF endings on Windows
print(f"index.html built: {len(data['foods'])} foods, {len(page):,} bytes")
