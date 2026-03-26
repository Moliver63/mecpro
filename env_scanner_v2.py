#!/usr/bin/env python3
"""
env_scanner_v2.py (v3)
Scans the project for environment variable usage:
  - Backend: process.env.X, process.env["X"]
  - Frontend (Vite): import.meta.env.VITE_X
Also detects hardcoded localhost URLs for hints.

Outputs under reports/:
  - env-report.json
  - env-report.txt
And generates:
  - .env.example (commented template)
  - .env.production.sample (placeholders)

Usage:
  python env_scanner_v2.py --fix
"""

from __future__ import annotations

import argparse
import re
from dataclasses import asdict
from pathlib import Path
from typing import Dict, List, Set

from common import (
    Finding, ensure_reports_dir, findings_summary, log, now_iso, safe_rel,
    write_json, write_text, read_text, exit_for_strict
)

ROOT = Path(".").resolve()

DEFAULT_IGNORE_DIRS: Set[str] = {
    "node_modules", ".git", "dist", "build", ".next", ".cache", ".turbo",
    ".vercel", ".output", "coverage", "tmp", "temp", ".pytest_cache", "reports"
}
IGNORE_FILES_SUFFIX = {".png",".jpg",".jpeg",".gif",".webp",".ico",".pdf",".zip",".mp4",".mov",".log"}
TEXT_EXT = {".js",".ts",".tsx",".jsx",".mjs",".cjs",".json",".env",".md",".yml",".yaml",".toml",".py"}

RE_PROCENV_DOT = re.compile(r"\bprocess\.env\.([A-Z0-9_]+)\b")
RE_PROCENV_BRACKET = re.compile(r"\bprocess\.env\[\s*[\"']([A-Z0-9_]+)[\"']\s*\]")
RE_VITE = re.compile(r"\bimport\.meta\.env\.([A-Z0-9_]+)\b")  # will filter VITE_ later
RE_LOCALHOST = re.compile(r"\b(localhost|127\.0\.0\.1)\b", re.IGNORECASE)

COMMON_KEY_HINTS = {
    "DATABASE_URL": "mysql://USER:PASS@HOST:3306/DB",
    "JWT_SECRET": "change-me-to-a-long-random-secret",
    "GOOGLE_CLIENT_ID": "your-google-client-id.apps.googleusercontent.com",
    "GOOGLE_CLIENT_SECRET": "your-google-client-secret",
    "GOOGLE_CALLBACK_URL": "https://YOUR_DOMAIN/api/auth/google/callback",
    "SITE_URL": "http://localhost:5173",
    "PORT": "3001",
}

def iter_files(root: Path, ignore_dirs: Set[str]) -> List[Path]:
    out: List[Path] = []
    for p in root.rglob("*"):
        if p.is_dir():
            continue
        if any(part in ignore_dirs for part in p.parts):
            continue
        if p.suffix.lower() in IGNORE_FILES_SUFFIX:
            continue
        if p.suffix.lower() not in TEXT_EXT and p.name != "package.json":
            continue
        out.append(p)
    return out

def add_hit(hits: Dict[str, Dict], key: str, fp: Path, line: int) -> None:
    if key not in hits:
        hits[key] = {"kind": "unknown", "hits": []}
    hits[key]["hits"].append({"file": safe_rel(fp), "line": line})

def template_line(key: str, value: str, comment: str = "") -> str:
    c = f"  # {comment}" if comment else ""
    return f"{key}={value}{c}\n"

def main() -> None:
    ap = argparse.ArgumentParser(description="Scan env var usage and generate templates.")
    ap.add_argument("--reports-dir", default="reports")
    ap.add_argument("--strict", action="store_true", help="Exit non-zero if critical env keys are missing from templates.")
    ap.add_argument("--fix", action="store_true", help="Write .env.example and .env.production.sample")
    ap.add_argument("--dry-run", action="store_true", help="Don't write files; only report.")
    ap.add_argument("--ignore-dir", action="append", default=[], help="Additional dir names to ignore (repeatable).")
    args = ap.parse_args()

    ignore_dirs = set(DEFAULT_IGNORE_DIRS) | set(args.ignore_dir)

    files = iter_files(ROOT, ignore_dirs)

    hits: Dict[str, Dict] = {}
    localhost_hits: List[Dict] = []

    for fp in files:
        txt = fp.read_text(encoding="utf-8", errors="ignore")
        # backend
        for m in RE_PROCENV_DOT.finditer(txt):
            key = m.group(1)
            line = txt.count("\n", 0, m.start()) + 1
            add_hit(hits, key, fp, line)
            hits[key]["kind"] = "backend"
        for m in RE_PROCENV_BRACKET.finditer(txt):
            key = m.group(1)
            line = txt.count("\n", 0, m.start()) + 1
            add_hit(hits, key, fp, line)
            hits[key]["kind"] = "backend"
        # frontend
        for m in RE_VITE.finditer(txt):
            key = m.group(1)
            if not key.startswith("VITE_"):
                continue
            line = txt.count("\n", 0, m.start()) + 1
            add_hit(hits, key, fp, line)
            hits[key]["kind"] = "frontend"
        # localhost hints
        for m in RE_LOCALHOST.finditer(txt):
            line = txt.count("\n", 0, m.start()) + 1
            localhost_hits.append({"file": safe_rel(fp), "line": line, "match": m.group(0)})

    # sort keys for stable outputs
    keys = sorted(hits.keys())

    # classify critical keys (heuristic)
    critical = [k for k in keys if k in {"DATABASE_URL","JWT_SECRET","GOOGLE_CLIENT_ID","GOOGLE_CLIENT_SECRET","SITE_URL"} or k.endswith("_SECRET") or k.endswith("_KEY")]
    missing_critical = [k for k in critical if k not in COMMON_KEY_HINTS and k not in keys]  # usually empty by design

    findings: List[Finding] = []
    if localhost_hits:
        findings.append(Finding(
            level="warn",
            code="LOCALHOST_REFERENCES",
            message="Foram encontradas referências a localhost/127.0.0.1; para deploy use env vars.",
            details={"count": len(localhost_hits), "samples": localhost_hits[:25]},
        ))
    else:
        findings.append(Finding(level="ok", code="NO_LOCALHOST_REFERENCES", message="Nenhuma referência a localhost encontrada.", details={}))

    if keys:
        findings.append(Finding(level="ok", code="ENV_KEYS_FOUND", message=f"Encontradas {len(keys)} variáveis de ambiente no código.", details={"count": len(keys)}))
    else:
        findings.append(Finding(level="warn", code="NO_ENV_KEYS_FOUND", message="Nenhuma variável process.env/import.meta.env encontrada (pode ser normal).", details={}))

    report = {
        "tool": "env_scanner_v2.py",
        "version": "v3",
        "generated_at": now_iso(),
        "keys": keys,
        "hits": hits,
        "localhost_hits": localhost_hits,
        "critical_keys": critical,
        "findings": [asdict(f) for f in findings],
        "summary": findings_summary(findings),
    }

    reports_dir = ensure_reports_dir(Path(args.reports_dir))
    write_json(reports_dir / "env-report.json", report)

    # text report
    lines = []
    lines.append("ENV REPORT\n")
    lines.append(f"Generated: {report['generated_at']}\n")
    lines.append(f"Keys found: {len(keys)}\n\n")
    for k in keys:
        kind = hits[k].get("kind","?")
        lines.append(f"- {k} ({kind}) [{len(hits[k]['hits'])} hits]\n")
        for h in hits[k]["hits"][:10]:
            lines.append(f"    • {h['file']}:{h['line']}\n")
        if len(hits[k]["hits"]) > 10:
            lines.append(f"    … (+{len(hits[k]['hits'])-10})\n")
    if localhost_hits:
        lines.append("\nLocalhost references (samples):\n")
        for h in localhost_hits[:15]:
            lines.append(f"  • {h['file']}:{h['line']} ({h['match']})\n")
    write_text(reports_dir / "env-report.txt", "".join(lines))

    # templates
    if args.fix and not args.dry_run:
        # .env.example
        ex = []
        ex.append("# Auto-generated by env_scanner_v2.py (v3)\n")
        ex.append("# Edite este arquivo e copie para .env (NUNCA commitar .env)\n\n")
        # group keys
        backend = [k for k in keys if hits[k].get("kind")=="backend" and not k.startswith("VITE_")]
        frontend = [k for k in keys if hits[k].get("kind")=="frontend" and k.startswith("VITE_")]
        other = [k for k in keys if k not in backend and k not in frontend]

        if backend:
            ex.append("# ================================\n# BACKEND (server)\n# ================================\n")
            for k in backend:
                placeholder = COMMON_KEY_HINTS.get(k, "")
                comment = "obrigatório" if k in critical else "opcional"
                ex.append(template_line(k, placeholder, comment))
            ex.append("\n")
        if frontend:
            ex.append("# ================================\n# FRONTEND (Vite) - vai para o browser\n# ================================\n")
            for k in frontend:
                placeholder = COMMON_KEY_HINTS.get(k, "")
                ex.append(template_line(k, placeholder, "opcional"))
            ex.append("\n")
        if other:
            ex.append("# ================================\n# OUTROS\n# ================================\n")
            for k in other:
                placeholder = COMMON_KEY_HINTS.get(k, "")
                ex.append(template_line(k, placeholder, "opcional"))
            ex.append("\n")

        (ROOT / ".env.example").write_text("".join(ex), encoding="utf-8")

        prod = []
        prod.append("# Auto-generated by env_scanner_v2.py (v3)\n")
        prod.append("# Template de produção (Render). Ajuste valores no painel do Render.\n\n")
        for k in keys:
            placeholder = COMMON_KEY_HINTS.get(k, "")
            prod.append(f"{k}={placeholder}\n")
        (ROOT / ".env.production.sample").write_text("".join(prod), encoding="utf-8")

        log("ok", "Gerados: .env.example e .env.production.sample")

    exit_for_strict(findings, args.strict)
    log("ok", "Env scan concluído. Veja reports/env-report.*")

if __name__ == "__main__":
    main()
