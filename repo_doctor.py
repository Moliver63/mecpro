#!/usr/bin/env python3
# repo_doctor.py
"""
Shadia VR Platform - Repo Doctor
- Varre o repo e detecta problemas comuns (imports inválidos, alias, arquivos faltando)
- Aplica correções seguras (autofix) e gera relatório
- Opcional: roda pnpm lint/typecheck/build/test e coleta logs
"""

from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import subprocess
import sys
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Iterable, List, Optional, Tuple

TEXT_EXTS = {".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".json", ".md", ".css", ".env", ".yml", ".yaml"}
CODE_EXTS = {".ts", ".tsx", ".js", ".jsx"}

DEFAULT_IGNORES = {
    "node_modules", ".git", "dist", "build", ".next", ".turbo", ".cache",
    ".vite", ".output", "coverage", ".pnpm-store"
}

IMPORT_RE = re.compile(
    r"""(?mx)
    ^\s*import\s+(?:type\s+)?(?:[\w*\s{},]+from\s+)?["']([^"']+)["']\s*;?\s*$
    |^\s*export\s+[^"']*from\s+["']([^"']+)["']\s*;?\s*$
    """
)

@dataclass
class Finding:
    level: str   # INFO/WARN/ERROR/FIXED
    file: str
    message: str

def now_stamp() -> str:
    return datetime.now().strftime("%Y%m%d-%H%M%S")

def read_text(p: Path) -> str:
    return p.read_text(encoding="utf-8", errors="ignore")

def write_text(p: Path, s: str) -> None:
    p.write_text(s, encoding="utf-8", newline="\n")

def is_ignored(path: Path, ignores: set[str]) -> bool:
    parts = set(path.parts)
    return any(x in parts for x in ignores)

def iter_files(root: Path, ignores: set[str]) -> Iterable[Path]:
    for p in root.rglob("*"):
        if p.is_file() and not is_ignored(p, ignores):
            yield p

def detect_repo_root(start: Path) -> Optional[Path]:
    cur = start.resolve()
    for _ in range(10):
        if (cur / "package.json").exists():
            return cur
        if cur.parent == cur:
            break
        cur = cur.parent
    return None

def load_package_json(root: Path) -> dict:
    pj = root / "package.json"
    if not pj.exists():
        return {}
    try:
        return json.loads(read_text(pj))
    except Exception:
        return {}

def run_cmd(cmd: List[str], cwd: Path, timeout: int = 1200) -> Tuple[int, str]:
    """
    Retorna (code, output). Não explode em erro, apenas captura tudo.
    """
    try:
        p = subprocess.run(
            cmd,
            cwd=str(cwd),
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            timeout=timeout,
            shell=(os.name == "nt"),
        )
        return p.returncode, p.stdout
    except Exception as e:
        return 999, f"[repo_doctor] Falha ao executar {cmd}: {e}\n"

def backup_file(p: Path, backup_dir: Path) -> Path:
    backup_dir.mkdir(parents=True, exist_ok=True)
    rel = p.as_posix().replace("/", "__")
    dst = backup_dir / f"{rel}.bak"
    shutil.copy2(p, dst)
    return dst

def apply_safe_fixes(root: Path, findings: List[Finding], backup_dir: Path) -> int:
    """
    Faz fixes pequenos e seguros.
    Retorna quantidade de arquivos modificados.
    """
    modified = 0

    # Fix 1: "@/ _core/..." (com espaço) -> "@/_core/..."
    space_alias_patterns = [
        (re.compile(r'@/\s+_core/'), '@/_core/'),
        (re.compile(r'"\s*@/\s+_core/'), '"@/_core/'),
        (re.compile(r"'\s*@/\s+_core/"), "'@/_core/"),
    ]

    # Fix 2: imports com espaços acidentais "@ /" -> "@/"
    generic_alias_space = [
        (re.compile(r'@\s+/'), '@/'),
    ]

    # Fix 3: normalizar finais de linha e remover trailing spaces (leve)
    trailing_ws = re.compile(r"[ \t]+$", re.MULTILINE)

    for p in iter_files(root, DEFAULT_IGNORES):
        if p.suffix.lower() not in CODE_EXTS:
            continue

        original = read_text(p)
        changed = original

        for rx, repl in space_alias_patterns:
            changed = rx.sub(repl, changed)

        for rx, repl in generic_alias_space:
            changed = rx.sub(repl, changed)

        changed = trailing_ws.sub("", changed)

        if changed != original:
            backup_file(p, backup_dir)
            write_text(p, changed)
            modified += 1
            findings.append(Finding("FIXED", str(p.relative_to(root)), "Aplicadas correções seguras (alias/import espaços/trailing spaces)."))

    return modified

def parse_tsconfig_paths(root: Path) -> dict:
    """
    Lê tsconfig.json e tenta extrair paths (alias) se existir.
    """
    ts = root / "tsconfig.json"
    if not ts.exists():
        return {}
    try:
        data = json.loads(read_text(ts))
        return data.get("compilerOptions", {}).get("paths", {}) or {}
    except Exception:
        return {}

def resolve_import_to_paths(import_path: str, importer: Path, root: Path, alias_paths: dict) -> Optional[Path]:
    """
    Resolve import local para um path do filesystem (best-effort).
    - suporta relativo ./ ../
    - suporta alias @/ se tsconfig paths ou padrão client/src
    """
    # ignore packages (react, express, etc.)
    if import_path.startswith(("react", "wouter", "three", "@react-", "drizzle-", "zod")):
        return None
    if not (import_path.startswith((".", "/", "@/")) or import_path.startswith("@/")):
        # Pode ser package. Não sabemos resolver sem node.
        return None

    # Relativo
    if import_path.startswith("."):
        base = importer.parent
        cand = (base / import_path).resolve()
        return cand

    # Alias "@/"
    if import_path.startswith("@/"):
        # tentamos resolver via tsconfig paths (se houver)
        # e fallback para client/src
        suffix = import_path[2:]  # remove "@/"
        # 1) tsconfig paths (ex: "@/*": ["client/src/*"])
        for k, v in alias_paths.items():
            if not isinstance(v, list):
                continue
            # padrões tipo "@/*"
            if k.endswith("/*") and k.startswith("@/"):
                prefix = k[:-1]  # "@/"" com "*"
                if import_path.startswith(prefix):
                    tail = import_path[len(prefix):]
                    for target in v:
                        # target: "client/src/*"
                        target_prefix = target[:-1] if target.endswith("*") else target
                        cand = (root / target_prefix / tail).resolve()
                        return cand

        # 2) fallback padrão do seu projeto (comum): client/src
        fallback = (root / "client" / "src" / suffix).resolve()
        return fallback

    return None

def exists_with_ts_ext(p: Path) -> bool:
    """
    Checa se arquivo existe com extensões comuns ou index.* dentro do diretório.
    """
    # se já tem extensão e existe
    if p.exists():
        return True

    # tentar extensões
    for ext in (".ts", ".tsx", ".js", ".jsx"):
        if p.with_suffix(ext).exists():
            return True

    # tentar index.*
    if p.is_dir():
        for ext in (".ts", ".tsx", ".js", ".jsx"):
            if (p / f"index{ext}").exists():
                return True

    # se path aponta para algo sem extensão, checar diretório
    if p.suffix == "":
        for ext in (".ts", ".tsx", ".js", ".jsx"):
            if (Path(str(p) + ext)).exists():
                return True
        for ext in (".ts", ".tsx", ".js", ".jsx"):
            if (p / f"index{ext}").exists():
                return True

    return False

def scan_imports(root: Path, findings: List[Finding]) -> None:
    alias_paths = parse_tsconfig_paths(root)

    for p in iter_files(root, DEFAULT_IGNORES):
        if p.suffix.lower() not in CODE_EXTS:
            continue

        txt = read_text(p)
        for m in IMPORT_RE.finditer(txt):
            imp = m.group(1) or m.group(2)
            if not imp:
                continue
            # ignora coisas tipo "node:fs"
            if imp.startswith("node:"):
                continue

            resolved = resolve_import_to_paths(imp, p, root, alias_paths)
            if resolved is None:
                continue

            if not exists_with_ts_ext(resolved):
                findings.append(Finding(
                    "ERROR",
                    str(p.relative_to(root)),
                    f"Import parece quebrado: '{imp}' (não encontrei arquivo alvo em disco)."
                ))

def check_env(root: Path, findings: List[Finding]) -> None:
    """
    Checagens mínimas de env para rodar local e no Render.
    Não insere secrets, só alerta se estiver faltando.
    """
    env_candidates = [root / ".env", root / ".env.local", root / ".env.production.local", root / ".env.production"]
    existing = [p for p in env_candidates if p.exists()]
    if not existing:
        findings.append(Finding("WARN", "-", "Nenhum arquivo .env encontrado na raiz. Crie .env (local) e .env.production.sample/.env.example (sem secrets)."))
        return

    # procura chaves importantes sem valores (best-effort)
    key_re = re.compile(r"^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$")
    must_have = [
        "DATABASE_URL",
        "PORT",
        "SITE_URL",
        "VITE_APP_URL",
        # OAuth / Stripe (o manual fala de OAuth/Stripe; sem isso algumas rotas quebram)
        "STRIPE_SECRET_KEY",
        "STRIPE_WEBHOOK_SECRET",
        "OAUTH_SERVER_URL",
    ]

    merged: dict[str, str] = {}
    for p in existing:
        for line in read_text(p).splitlines():
            if not line.strip() or line.strip().startswith("#"):
                continue
            m = key_re.match(line)
            if not m:
                continue
            k = m.group(1).strip()
            v = m.group(2).strip()
            merged.setdefault(k, v)

    for k in must_have:
        if k not in merged:
            findings.append(Finding("WARN", str(existing[0].name), f"Variável possivelmente necessária ausente: {k}"))
        else:
            v = merged[k].strip().strip('"').strip("'")
            if v == "" or v.upper() in {"CHANGEME", "TODO"}:
                findings.append(Finding("WARN", str(existing[0].name), f"Variável definida mas vazia/fraca: {k}"))

def check_render_readiness(root: Path, findings: List[Finding]) -> None:
    pj = load_package_json(root)
    scripts = (pj.get("scripts") or {}) if isinstance(pj, dict) else {}

    # Render geralmente precisa de: build e start
    if "build" not in scripts:
        findings.append(Finding("ERROR", "package.json", "Falta script 'build' (Render precisa buildar)."))
    if not any(k in scripts for k in ("start", "start:prod", "start:render", "start:localprod")):
        findings.append(Finding("WARN", "package.json", "Não achei script claro de start de produção (sugestão: 'start' para Render)."))

    # Porta dinâmica: precisa respeitar process.env.PORT
    # O manual recomenda porta dinâmica no Render e organização do app :contentReference[oaicite:2]{index=2}
    server_entry_candidates = [root / "server" / "index.ts", root / "server" / "index.js", root / "dist" / "index.js", root / "src" / "index.ts"]
    found_any = any(p.exists() for p in server_entry_candidates)
    if not found_any:
        findings.append(Finding("INFO", "-", "Não localizei entrypoint óbvio do server (ok se for diferente). Garanta que o server usa process.env.PORT."))

def write_report(root: Path, findings: List[Finding], out_dir: Path) -> Path:
    out_dir.mkdir(parents=True, exist_ok=True)
    report_path = out_dir / "repo_doctor_report.md"

    levels = {"ERROR": 0, "WARN": 1, "FIXED": 2, "INFO": 3}
    findings_sorted = sorted(findings, key=lambda f: (levels.get(f.level, 9), f.file, f.message))

    lines = []
    lines.append(f"# Repo Doctor Report\n")
    lines.append(f"- Data: {datetime.now().isoformat(timespec='seconds')}\n")
    lines.append(f"- Root: `{root}`\n")
    lines.append(f"- Total: {len(findings_sorted)} achados\n\n")

    for lvl in ("ERROR", "WARN", "FIXED", "INFO"):
        items = [f for f in findings_sorted if f.level == lvl]
        if not items:
            continue
        lines.append(f"## {lvl} ({len(items)})\n")
        for f in items:
            loc = f.file if f.file else "-"
            lines.append(f"- **{loc}** — {f.message}\n")
        lines.append("\n")

    write_text(report_path, "".join(lines))
    return report_path

def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--root", default=".", help="Raiz do repo (onde está package.json)")
    ap.add_argument("--fix", action="store_true", help="Aplicar correções seguras automaticamente")
    ap.add_argument("--run", action="store_true", help="Rodar pnpm install/lint/typecheck/build/test e anexar logs")
    ap.add_argument("--skip-install", action="store_true", help="Quando usar --run, não roda pnpm install")
    args = ap.parse_args()

    start = Path(args.root)
    root = detect_repo_root(start)
    if not root:
        print("[repo_doctor] ERRO: não encontrei package.json. Rode na raiz do projeto.")
        return 2

    findings: List[Finding] = []
    out_dir = root / ".repo_doctor" / now_stamp()
    backup_dir = out_dir / "backups"
    logs_dir = out_dir / "logs"

    # 1) Fixes seguros
    if args.fix:
        modified = apply_safe_fixes(root, findings, backup_dir)
        findings.append(Finding("INFO", "-", f"Autofix: {modified} arquivo(s) modificado(s). Backups em {backup_dir.relative_to(root)}"))

    # 2) Scan imports quebrados
    scan_imports(root, findings)

    # 3) Checar env / integrações esperadas
    check_env(root, findings)

    # 4) Checar preparo para Render/GitHub
    check_render_readiness(root, findings)

    # 5) Rodar comandos Node (opcional)
    if args.run:
        logs_dir.mkdir(parents=True, exist_ok=True)

        def save_log(name: str, content: str) -> None:
            write_text(logs_dir / f"{name}.log", content)

        # localizar pnpm
        pnpm = "pnpm.cmd" if os.name == "nt" else "pnpm"
        if shutil.which(pnpm) is None:
            findings.append(Finding("ERROR", "-", "pnpm não encontrado no PATH. Instale pnpm e rode novamente com --run."))
        else:
            if not args.skip_install:
                code, out = run_cmd([pnpm, "install"], root, timeout=2400)
                save_log("01_pnpm_install", out)
                findings.append(Finding("INFO", "-", f"pnpm install => exit {code} (ver logs)"))

            steps = [
                ("02_lint", [pnpm, "run", "lint"]),
                ("03_typecheck", [pnpm, "run", "typecheck"]),
                ("04_build", [pnpm, "run", "build"]),
                ("05_test", [pnpm, "run", "test"]),
            ]
            for name, cmd in steps:
                code, out = run_cmd(cmd, root, timeout=2400)
                save_log(name, out)
                lvl = "ERROR" if code != 0 else "INFO"
                findings.append(Finding(lvl, "-", f"{' '.join(cmd)} => exit {code} (logs em .repo_doctor)"))

    report = write_report(root, findings, out_dir)
    print(f"[repo_doctor] OK. Report: {report}")
    print(f"[repo_doctor] Pasta: {out_dir}")
    return 0

if __name__ == "__main__":
    raise SystemExit(main())