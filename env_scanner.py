import os
import re
from pathlib import Path

ROOT = Path(".").resolve()

TEXT_EXTS = {".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"}
SKIP_DIRS = {"node_modules", ".git", "dist", "build"}

re_proc = re.compile(r"\bprocess\.env\.([A-Z0-9_]+)\b")
re_proc_bracket = re.compile(r"\bprocess\.env\[['\"]([A-Z0-9_]+)['\"]\]\b")
re_vite = re.compile(r"\bimport\.meta\.env\.([A-Z0-9_]+)\b")

found_proc = set()
found_vite = set()

def should_skip_dir(path: Path) -> bool:
    parts = set(path.parts)
    return any(p in parts for p in SKIP_DIRS)

for dirpath, dirnames, filenames in os.walk(ROOT):
    dp = Path(dirpath)
    if should_skip_dir(dp):
        dirnames[:] = []
        continue

    for fn in filenames:
        p = dp / fn
        if p.suffix.lower() not in TEXT_EXTS:
            continue
        try:
            txt = p.read_text(encoding="utf-8", errors="ignore")
        except Exception:
            continue

        for m in re_proc.finditer(txt):
            found_proc.add(m.group(1))

        for m in re_proc_bracket.finditer(txt):
            found_proc.add(m.group(1))

        for m in re_vite.finditer(txt):
            found_vite.add(m.group(1))

print("\n=== process.env KEYS ===")
for k in sorted(found_proc):
    print(k)

print("\n=== import.meta.env KEYS ===")
for k in sorted(found_vite):
    print(k)

print("\nDone. Use this list to build your .env file.")
