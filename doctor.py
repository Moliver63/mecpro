#!/usr/bin/env python3
# tools/doctor.py
from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable, List, Tuple

TEXT_EXTS = {
    ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".json", ".css", ".md", ".yml", ".yaml", ".env", ".sample"
}

SKIP_DIRS = {
    "node_modules", "dist", "build", ".git", ".turbo", ".next", ".vite", ".cache", ".pnpm"
}

IMPORT_SPACE_FIXES: List[Tuple[re.Pattern, str]] = [
    # Fix: "@/ _core/..."  or "@/  _core/..."
    (re.compile(r'(["\'])@/\s+_core/'), r'\1@/_core/'),
    # Fix: "from "@/ _core/.."" (handles extra spaces after @/)
    (re.compile(r'from\s+(["\'])@/\s+'), r'from \1@/'),
    # Fix: import("@/ _core/..")
    (re.compile(r'(\()(["\'])@/\s+'), r'\1\2@/'),
    # Fix: "@/ lib/..." -> "@/lib/..."
    (re.compile(r'(["\'])@/\s+([A-Za-z0-9_-]+/)'), r'\1@/\2'),
]

HARDCODE_PATTERNS: List[Tuple[str, re.Pattern]] = [
    ("localhost", re.compile(r"\blocalhost\b", re.IGNORECASE)),
    ("port-3001", re.compile(r"\b3001\b")),
    ("port-5173", re.compile(r"\b5173\b")),
]

RENDER_YAML = """services:
  - type: web
    name: shadiahasan-club
    env: node
    plan: starter
    buildCommand: pnpm install --frozen-lockfile && pnpm build
    startCommand: pnpm start
    autoDeploy: true
    envVars:
      - key: NODE_ENV
        value: production
      - key: PORT
        value: "10000"
"""

ENV_EXAMPLE = """# ================================
# APP
# ================================
NODE_ENV=development
PORT=3001
SITE_URL=http://localhost:5173
VITE_APP_URL=http://localhost:5173

# ================================
# DATABASE (BACKEND)
# ================================
DATABASE_URL=mysql://USER:PASSWORD@HOST:3306/DB_NAME

# ================================
# OAUTH (BACKEND)
# ================================
OAUTH_SERVER_URL=
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_CALLBACK_URL=http://localhost:3001/api/auth/google/callback

# ================================
# STRIPE (BACKEND)
# ================================
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=

# ================================
# EMAIL (optional)
# ================================
RESEND_API_KEY=
"""

@dataclass
class Change:
    file: Path
    kind: str
    detail: str

def iter_text_files(root: Path) -> Iterable[Path]:
    for p in root.rglob("*"):
        if p.is_dir():
            if p.name in SKIP_DIRS:
                # prune
                continue
        if not p.is_file():
            continue
        if any(part in SKIP_DIRS for part in p.parts):
            continue
        if p.suffix.lower() in TEXT_EXTS or p.name in {".env", ".env.production", ".env.production.local", ".env.local"}:
            yield p

def safe_read(p: Path) -> str | None:
    try:
        return p.read_text(encoding="utf-8")
    except UnicodeDecodeError:
        try:
            return p.read_text(encoding="utf-8-sig")
        except Exception:
            return None
    except Exception:
        return None

def safe_write(p: Path, content: str) -> None:
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(content, encoding="utf-8")

def load_json(p: Path) -> dict | None:
    txt = safe_read(p)
    if txt is None:
        return None
    try:
        return json.loads(txt)
    except Exception:
        return None

def apply_import_space_fixes(text: str) -> Tuple[str, int]:
    total = 0
    out = text
    for pat, repl in IMPORT_SPACE_FIXES:
        out2, n = pat.subn(repl, out)
        if n:
            total += n
            out = out2
    return out, total

def check_tsconfig_alias(tsconfig: dict) -> List[str]:
    msgs = []
    co = tsconfig.get("compilerOptions", {})
    paths = co.get("paths", {})
    base_url = co.get("baseUrl")
    if base_url != ".":
        msgs.append(f'tsconfig: compilerOptions.baseUrl esperado "." mas está "{base_url}"')
    if "@/*" not in paths:
        msgs.append('tsconfig: faltando paths["@/*"] (recomendado apontar para ./client/src/*)')
    return msgs

def ensure_render_yaml(root: Path, apply: bool, changes: List[Change]) -> None:
    p = root / "render.yaml"
    if p.exists():
        return
    if apply:
        safe_write(p, RENDER_YAML)
        changes.append(Change(p, "create", "Criado render.yaml para deploy no Render"))
    else:
        changes.append(Change(p, "suggest", "Sugestão: criar render.yaml (execute com --apply)"))

def ensure_env_templates(root: Path, apply: bool, changes: List[Change]) -> None:
    env_example = root / ".env.example"
    env_prod_sample = root / ".env.production.sample"
    for p in (env_example, env_prod_sample):
        if p.exists():
            continue
        if apply:
            safe_write(p, ENV_EXAMPLE)
            changes.append(Change(p, "create", f"Criado {p.name} (template)"))
        else:
            changes.append(Change(p, "suggest", f"Sugestão: criar {p.name} (execute com --apply)"))

def audit_package_json(root: Path, changes: List[Change]) -> None:
    pkg_path = root / "package.json"
    pkg = load_json(pkg_path) or {}
    scripts = (pkg.get("scripts") or {})
    # Verifica se build + start existem (Render precisa disso)
    for key in ("build", "start"):
        if key not in scripts:
            changes.append(Change(pkg_path, "warn", f'package.json: script "{key}" não encontrado'))
    # Sugere cross-env no Windows (você já está usando em uma variante) :contentReference[oaicite:4]{index=4}
    if "dev" in scripts and "cross-env" not in scripts["dev"]:
        changes.append(Change(pkg_path, "suggest", 'Sugestão: usar "cross-env" no script dev para compatibilidade Windows'))

def patch_server_port(root: Path, apply: bool, changes: List[Change]) -> None:
    """
    Tenta achar 'app.listen(3001' e substituir por process.env.PORT.
    Só aplica se encontrar um padrão bem claro.
    """
    candidates = [
        root / "server" / "_core" / "index.ts",
        root / "server" / "index.ts",
        root / "server" / "app.ts",
    ]
    for p in candidates:
        if not p.exists():
            continue
        txt = safe_read(p)
        if txt is None:
            continue
        # pattern: app.listen(3001, ... ) OR listen(3001)
        pat = re.compile(r"(listen\()\s*(3001)\s*(,)")
        if pat.search(txt):
            if apply:
                new = pat.sub(r"\1Number(process.env.PORT || 3001)\3", txt)
                safe_write(p, new)
                changes.append(Change(p, "patch", "Substituído listen(3001) por process.env.PORT com fallback"))
            else:
                changes.append(Change(p, "suggest", f"{p}: trocar listen(3001) por process.env.PORT (use --apply)"))

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--root", default=".", help="Pasta raiz do projeto")
    ap.add_argument("--apply", action="store_true", help="Aplicar correções automaticamente")
    args = ap.parse_args()

    root = Path(args.root).resolve()
    if not (root / "package.json").exists():
        print(f"ERRO: não achei package.json em {root}. Rode dentro da raiz do repo.")
        raise SystemExit(2)

    changes: List[Change] = []

    # 1) Checagens de config
    tsconfig_path = root / "tsconfig.json"
    tsconfig = load_json(tsconfig_path) or {}
    for msg in check_tsconfig_alias(tsconfig):
        changes.append(Change(tsconfig_path, "warn", msg))

    audit_package_json(root, changes)

    # 2) Patches em arquivos de texto
    for f in iter_text_files(root):
        txt = safe_read(f)
        if txt is None:
            continue

        new_txt, nfix = apply_import_space_fixes(txt)
        if nfix:
            if args.apply:
                safe_write(f, new_txt)
                changes.append(Change(f, "patch", f"Corrigido alias com espaço em {nfix} ocorrência(s)"))
            else:
                changes.append(Change(f, "suggest", f"Encontrado alias com espaço ({nfix} ocorrência(s)); rode com --apply"))

        # Auditoria de hardcode (só reporta)
        for label, pat in HARDCODE_PATTERNS:
            if pat.search(txt):
                changes.append(Change(f, "note", f"Possível hardcode encontrado: {label}"))

    # 3) Render + env templates
    ensure_render_yaml(root, args.apply, changes)
    ensure_env_templates(root, args.apply, changes)
    patch_server_port(root, args.apply, changes)

    # 4) Relatório
    now = dt.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    print(f"\n=== SHADIA DOCTOR REPORT ({now}) ===")
    by_kind = {"patch": [], "create": [], "warn": [], "suggest": [], "note": []}
    for c in changes:
        by_kind.setdefault(c.kind, []).append(c)

    def dump(kind: str):
        items = by_kind.get(kind, [])
        if not items:
            return
        print(f"\n[{kind.upper()}] ({len(items)})")
        for it in items:
            rel = os.path.relpath(it.file, root)
            print(f" - {rel}: {it.detail}")

    for k in ("warn", "note", "suggest", "create", "patch"):
        dump(k)

    print("\nPróximos comandos:")
    print(" - pnpm install")
    print(" - pnpm check")
    print(" - pnpm test")
    print(" - pnpm dev")
    print(" - pnpm build && pnpm start")
    print("\nDica: rode novamente com --apply para aplicar correções automáticas.\n")

if __name__ == "__main__":
    main()