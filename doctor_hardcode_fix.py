#!/usr/bin/env python3
from __future__ import annotations

import argparse
import re
from pathlib import Path

TARGETS = [
    "client/src/const.ts",
    "client/src/lib/api.ts",
    "server/routers/auth.ts",
    "server/routers/index.ts",
]

def read(p: Path) -> str:
    return p.read_text(encoding="utf-8", errors="ignore")

def write(p: Path, s: str) -> None:
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(s, encoding="utf-8", newline="\n")

def backup(p: Path, backups: Path) -> None:
    backups.mkdir(parents=True, exist_ok=True)
    dst = backups / (p.as_posix().replace("/", "__") + ".bak")
    if not dst.exists():
        dst.write_text(read(p), encoding="utf-8")

def ensure_runtime_ts(root: Path, apply: bool, logs: list[str]) -> None:
    runtime = root / "client/src/config/runtime.ts"
    if runtime.exists():
        return
    content = """// client/src/config/runtime.ts
export const APP_URL =
  import.meta.env.VITE_APP_URL || window.location.origin;

// Use VITE_API_URL se você quiser API em outro host.
// Senão, usa /api no mesmo domínio (ideal p/ Render).
export const API_BASE_URL =
  import.meta.env.VITE_API_URL || "/api";
"""
    if apply:
        write(runtime, content)
        logs.append("[create] client/src/config/runtime.ts")
    else:
        logs.append("[suggest] criar client/src/config/runtime.ts (use --apply)")

def fix_import_space(txt: str) -> tuple[str, int]:
    new, n = re.subn(r'(["\'])@/\s+_core/', r'\1@/_core/', txt)
    return new, n

def patch_client_api_ts(txt: str) -> tuple[str, int]:
    """
    - remove hardcode localhost:3001
    - garante uso de API_BASE_URL
    """
    n = 0
    out = txt

    # Se já usa API_BASE_URL, só remove hardcode explícito
    out2, c = re.subn(r'https?://localhost:3001', '', out)
    if c:
        n += c
        out = out2

    # Se encontra fetch("http://localhost:3001/api...") -> fetch(`${API_BASE_URL}/...`)
    out2, c = re.subn(
        r'fetch\(\s*["\']https?://localhost:3001(/api)?',
        'fetch(`${API_BASE_URL}',
        out
    )
    if c:
        n += c
        out = out2

    # Se arquivo não importa API_BASE_URL, tenta inserir (best-effort)
    if "API_BASE_URL" in out and "from \"../config/runtime\"" not in out and "from '../config/runtime'" not in out:
        # insere após primeiros imports
        lines = out.splitlines()
        insert_at = 0
        for i, line in enumerate(lines):
            if line.strip().startswith("import "):
                insert_at = i + 1
        lines.insert(insert_at, 'import { API_BASE_URL } from "../config/runtime";')
        out = "\n".join(lines)
        n += 1

    return out, n

def patch_client_const_ts(txt: str) -> tuple[str, int]:
    """
    Remove constantes tipo API_URL = "http://localhost:3001"
    e substitui por API_BASE_URL.
    """
    n = 0
    out = txt

    # padrões comuns: export const API_URL = "http://localhost:3001";
    out2, c = re.subn(
        r'(export\s+const\s+\w*API\w*\s*=\s*)["\']https?://localhost:3001["\']\s*;?',
        r'\1API_BASE_URL;',
        out
    )
    if c:
        n += c
        out = out2

    # se referenciou API_BASE_URL e não importou
    if "API_BASE_URL" in out and "from \"./config/runtime\"" not in out and "from './config/runtime'" not in out and "from \"../config/runtime\"" not in out:
        # tenta importar relativo (const.ts geralmente está em src/)
        # se const.ts está em client/src/const.ts, caminho é "./config/runtime"
        if "client/src/const.ts" in "client/src/const.ts":
            import_line = 'import { API_BASE_URL } from "./config/runtime";'
            if import_line not in out:
                lines = out.splitlines()
                insert_at = 0
                for i, line in enumerate(lines):
                    if line.strip().startswith("import "):
                        insert_at = i + 1
                lines.insert(insert_at, import_line)
                out = "\n".join(lines)
                n += 1

    # remove strings soltas localhost:5173 se existirem
    out2, c = re.subn(r'https?://localhost:5173', '', out)
    if c:
        n += c
        out = out2

    return out, n

def patch_server_redirects(txt: str) -> tuple[str, int]:
    """
    Troca hardcode localhost:5173 por process.env.SITE_URL (fallback local).
    """
    n = 0
    out = txt

    # garantir SITE_URL definido
    if "const SITE_URL" not in out and "SITE_URL" in out:
        pass

    if "SITE_URL" not in out:
        # injeta definição no topo (depois imports)
        lines = out.splitlines()
        insert_at = 0
        for i, line in enumerate(lines):
            if line.strip().startswith("import "):
                insert_at = i + 1
        lines.insert(insert_at, 'const SITE_URL = process.env.SITE_URL || "http://localhost:5173";')
        out = "\n".join(lines)
        n += 1

    # substitui URL hardcoded em redirects
    out2, c = re.subn(r'https?://localhost:5173', '${SITE_URL}', out)
    # NÃO queremos ${} em TS. Então fazemos por concat.
    if c:
        n += c
        out = out2.replace("'${SITE_URL}'", "SITE_URL").replace('"${SITE_URL}"', "SITE_URL")

    # substitui padrões tipo res.redirect("http://localhost:5173/...")
    out2, c = re.subn(
        r'res\.redirect\(\s*["\']https?://localhost:5173([^"\']*)["\']\s*\)',
        r'res.redirect(SITE_URL + "\1")',
        out
    )
    if c:
        n += c
        out = out2

    return out, n

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--root", default=".")
    ap.add_argument("--apply", action="store_true")
    args = ap.parse_args()

    root = Path(args.root).resolve()
    if not (root / "package.json").exists():
        print("ERRO: rode na raiz do projeto (onde fica package.json).")
        raise SystemExit(2)

    backups = root / ".doctor_backups"
    logs: list[str] = []

    ensure_runtime_ts(root, args.apply, logs)

    for rel in TARGETS:
        p = root / rel
        if not p.exists():
            continue

        txt = read(p)
        out = txt
        changed = 0

        out, n0 = fix_import_space(out)
        changed += n0

        if rel.endswith("client/src/lib/api.ts"):
            out, n1 = patch_client_api_ts(out)
            changed += n1

        if rel.endswith("client/src/const.ts"):
            out, n2 = patch_client_const_ts(out)
            changed += n2

        if rel.startswith("server/routers/"):
            out, n3 = patch_server_redirects(out)
            changed += n3

        if changed and out != txt:
            print(f"[patch] {rel}: {changed} alteração(ões)")
            if args.apply:
                backup(p, backups)
                write(p, out)
            logs.append(f"[patch] {rel}: {changed}")
        elif changed:
            logs.append(f"[note] {rel}: detectado mas não alterado")

    if not args.apply:
        print("\nRodou em DRY-RUN. Para aplicar de verdade:")
        print("  python doctor_hardcode_fix.py --apply")
    else:
        print(f"\nOK. Backups em: {backups}")
        print("Agora rode:")
        print("  pnpm check")
        print("  pnpm dev")

if __name__ == "__main__":
    main()