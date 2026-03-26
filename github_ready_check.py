#!/usr/bin/env python3
"""
github_ready_check.py (v3)
Validates repo readiness for GitHub + basic Node project hygiene.

Checks:
- required files (package.json)
- .gitignore contains critical entries
- lockfile presence (pnpm-lock.yaml, yarn.lock, package-lock.json)
- package.json scripts: dev/build/start
- no .env tracked suggestion

Outputs reports/github-ready.json + .txt

Usage:
  python github_ready_check.py --strict
"""

from __future__ import annotations

import argparse
import json
from dataclasses import asdict
from pathlib import Path
from typing import List, Optional

from common import (
    Finding, ensure_reports_dir, findings_summary, log, now_iso, read_text,
    write_json, write_text, exit_for_strict
)

ROOT = Path(".").resolve()

RECOMMENDED_FILES = [
    ".gitignore",
    "pnpm-lock.yaml",
    "yarn.lock",
    "package-lock.json",
    "vite.config.ts",
    "vite.config.js",
    ".env.example",
    ".env.production.sample",
    "README.md",
]

CRITICAL_GITIGNORE_ENTRIES = [
    ".env",
    "node_modules",
    "dist",
    "build",
    "reports",
]

def read_package_json() -> Optional[dict]:
    p = ROOT / "package.json"
    if not p.exists():
        return None
    try:
        return json.loads(p.read_text(encoding="utf-8"))
    except Exception:
        return None

def has_any_lockfile() -> bool:
    return any((ROOT / f).exists() for f in ["pnpm-lock.yaml", "yarn.lock", "package-lock.json"])

def main() -> None:
    ap = argparse.ArgumentParser(description="Check GitHub readiness.")
    ap.add_argument("--reports-dir", default="reports")
    ap.add_argument("--strict", action="store_true")
    ap.add_argument("--fix", action="store_true", help="Optionally write/merge a stronger .gitignore (safe).")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    findings: List[Finding] = []

    if not (ROOT / "package.json").exists():
        findings.append(Finding(level="fail", code="MISSING_PACKAGE_JSON", message="package.json não encontrado na raiz.", details={}))
        log("fail", "package.json não encontrado.")
    else:
        findings.append(Finding(level="ok", code="HAS_PACKAGE_JSON", message="package.json encontrado.", details={}))
        log("ok", "package.json encontrado.")

    pkg = read_package_json()
    if pkg is None:
        findings.append(Finding(level="fail", code="PACKAGE_JSON_INVALID", message="package.json inválido ou não parseável.", details={}))
        log("fail", "package.json inválido.")
    else:
        scripts = (pkg.get("scripts") or {})
        needed = ["dev", "build", "start"]
        missing = [s for s in needed if s not in scripts]
        if missing:
            findings.append(Finding(level="warn", code="MISSING_SCRIPTS", message="Scripts recomendados ausentes no package.json.", details={"missing": missing, "scripts": scripts}))
            log("warn", f"Scripts ausentes: {', '.join(missing)} (recomendado ter dev/build/start)")
        else:
            findings.append(Finding(level="ok", code="HAS_SCRIPTS", message="Scripts dev/build/start presentes.", details={}))
            log("ok", "Scripts dev/build/start presentes.")

    if has_any_lockfile():
        findings.append(Finding(level="ok", code="HAS_LOCKFILE", message="Lockfile encontrado.", details={}))
        log("ok", "Lockfile encontrado (pnpm/yarn/npm).")
    else:
        findings.append(Finding(level="warn", code="MISSING_LOCKFILE", message="Sem lockfile. Recomendado commitar pnpm-lock.yaml/yarn.lock/package-lock.json.", details={}))
        log("warn", "Sem lockfile (recomendado).")

    # .gitignore
    gi = ROOT / ".gitignore"
    if not gi.exists():
        findings.append(Finding(level="warn", code="MISSING_GITIGNORE", message=".gitignore ausente. Recomendado criar.", details={}))
        log("warn", ".gitignore ausente.")
        existing = ""
    else:
        existing = read_text(gi)
        findings.append(Finding(level="ok", code="HAS_GITIGNORE", message=".gitignore encontrado.", details={}))
        log("ok", ".gitignore encontrado.")

    missing_entries = [e for e in CRITICAL_GITIGNORE_ENTRIES if e not in existing]
    if missing_entries:
        findings.append(Finding(level="warn", code="GITIGNORE_MISSING_ENTRIES", message="Algumas entradas críticas faltam no .gitignore.", details={"missing": missing_entries}))
        log("warn", f".gitignore faltando: {', '.join(missing_entries)}")
        if args.fix and not args.dry_run:
            add = "\n# Added by github_ready_check.py (v3)\n" + "\n".join(missing_entries) + "\n"
            gi.write_text(existing.rstrip() + "\n" + add, encoding="utf-8")
            log("fix", "Atualizei .gitignore com entradas faltantes.")
    else:
        findings.append(Finding(level="ok", code="GITIGNORE_OK", message=".gitignore contém entradas críticas.", details={}))
        log("ok", ".gitignore com entradas críticas ok.")

    report = {
        "tool": "github_ready_check.py",
        "version": "v3",
        "generated_at": now_iso(),
        "findings": [asdict(f) for f in findings],
        "summary": findings_summary(findings),
        "recommended_files_present": {f: (ROOT / f).exists() for f in RECOMMENDED_FILES},
    }

    reports_dir = ensure_reports_dir(Path(args.reports_dir))
    write_json(reports_dir / "github-ready.json", report)

    txt = []
    txt.append("GITHUB READY CHECK\n")
    txt.append(f"Generated: {report['generated_at']}\n\n")
    for f in findings:
        txt.append(f"[{f.level.upper()}] {f.code} - {f.message}\n")
    txt.append("\nRecomendações:\n")
    txt.append("- Nunca commitar .env (use .env.example)\n")
    txt.append("- Garanta scripts dev/build/start\n")
    txt.append("- Commit do lockfile para builds reprodutíveis\n")
    write_text(reports_dir / "github-ready.txt", "".join(txt))

    exit_for_strict(findings, args.strict)
    log("ok", "GitHub readiness concluído. Veja reports/github-ready.*")

if __name__ == "__main__":
    main()
