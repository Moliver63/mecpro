#!/usr/bin/env python3
"""
project_scanner2.py (v3)
Scans the repository for structure, risky patterns, and deployment footguns.
Outputs a JSON + TXT report under reports/.

Usage:
  python project_scanner2.py --help
"""

from __future__ import annotations

import argparse
import re
from dataclasses import asdict
from pathlib import Path
from typing import Dict, List, Set, Tuple

from common import (
    Finding, ensure_reports_dir, findings_summary, hr, log, now_iso,
    safe_rel, write_json, write_text, exit_for_strict,
)

ROOT = Path(".").resolve()

DEFAULT_IGNORE_DIRS: Set[str] = {
    "node_modules", ".git", "dist", "build", ".next", ".cache", ".turbo",
    ".vercel", ".output", "coverage", "tmp", "temp", ".pytest_cache", "reports"
}
IGNORE_FILES_SUFFIX = {".png",".jpg",".jpeg",".gif",".webp",".ico",".pdf",".zip",".mp4",".mov",".log"}

TEXT_EXT = {".js",".ts",".tsx",".jsx",".json",".mjs",".cjs",".env",".md",".yml",".yaml",".toml",".py"}

RE_LOCALHOST = re.compile(r"\b(localhost|127\.0\.0\.1)\b", re.IGNORECASE)
RE_PORT_HARDCODE = re.compile(r"\b(3000|3001|5173|8080)\b")

def iter_files(root: Path, ignore_dirs: Set[str]) -> List[Path]:
    out: List[Path] = []
    for p in root.rglob("*"):
        if p.is_dir():
            continue
        if any(part in ignore_dirs for part in p.parts):
            continue
        if p.suffix.lower() in IGNORE_FILES_SUFFIX:
            continue
        if p.suffix.lower() not in TEXT_EXT and p.name not in {"package.json","pnpm-lock.yaml","yarn.lock","package-lock.json"}:
            continue
        out.append(p)
    return out

def detect_structure() -> Dict[str, bool]:
    return {
        "has_client_dir": (ROOT / "client").is_dir(),
        "has_server_dir": (ROOT / "server").is_dir(),
        "has_src_dir": (ROOT / "src").is_dir(),
        "has_package_json": (ROOT / "package.json").exists(),
        "has_vite": (ROOT / "vite.config.ts").exists() or (ROOT / "vite.config.js").exists(),
        "has_render_yaml": (ROOT / "render.yaml").exists(),
        "has_procfile": (ROOT / "Procfile").exists(),
    }

def scan_patterns(files: List[Path]) -> Dict[str, List[Dict]]:
    hits = {
        "localhost": [],
        "hardcoded_ports": [],
    }
    for fp in files:
        try:
            txt = fp.read_text(encoding="utf-8", errors="ignore")
        except Exception:
            continue
        for m in RE_LOCALHOST.finditer(txt):
            line = txt.count("\n", 0, m.start()) + 1
            hits["localhost"].append({"file": safe_rel(fp), "line": line, "match": m.group(0)})
        for m in RE_PORT_HARDCODE.finditer(txt):
            line = txt.count("\n", 0, m.start()) + 1
            hits["hardcoded_ports"].append({"file": safe_rel(fp), "line": line, "match": m.group(0)})
    return hits

def main() -> None:
    ap = argparse.ArgumentParser(description="Project scanner (structure + risky patterns).")
    ap.add_argument("--reports-dir", default="reports", help="Where to write reports/")
    ap.add_argument("--strict", action="store_true", help="Exit non-zero if critical fails are found.")
    ap.add_argument("--json", action="store_true", help="Also print JSON to stdout.")
    ap.add_argument("--ignore-dir", action="append", default=[], help="Additional dir names to ignore (repeatable).")
    args = ap.parse_args()

    ignore_dirs = set(DEFAULT_IGNORE_DIRS) | set(args.ignore_dir)

    log("step", "Passo 1: varrer estrutura do projeto")
    structure = detect_structure()
    if not structure["has_package_json"]:
        log("fail", "package.json não encontrado na raiz. Este toolkit assume Node/JS na raiz.")
    else:
        log("ok", "package.json encontrado.")

    files = iter_files(ROOT, ignore_dirs)
    log("info", f"Arquivos de texto analisados: {len(files)}")

    log("step", "Passo 2: procurar padrões perigosos (localhost/portas hardcoded)")
    hits = scan_patterns(files)

    findings: List[Finding] = []

    # localhost
    if hits["localhost"]:
        findings.append(Finding(
            level="warn",
            code="LOCALHOST_HARDCODE",
            message="Encontradas referências a localhost/127.0.0.1. Para deploy, use variáveis de ambiente.",
            details={"count": len(hits["localhost"]), "samples": hits["localhost"][:25]},
        ))
        log("warn", f"localhost/127.0.0.1 encontrados: {len(hits['localhost'])}")
    else:
        findings.append(Finding(level="ok", code="NO_LOCALHOST", message="Nenhum localhost hardcoded encontrado.", details={}))
        log("ok", "Nenhum localhost hardcoded.")

    # hardcoded ports
    if hits["hardcoded_ports"]:
        findings.append(Finding(
            level="warn",
            code="HARDCODED_PORTS",
            message="Possíveis portas hardcoded detectadas. Preferir process.env.PORT / VITE_*.",
            details={"count": len(hits["hardcoded_ports"]), "samples": hits["hardcoded_ports"][:25]},
        ))
        log("warn", f"Possíveis portas hardcoded: {len(hits['hardcoded_ports'])}")
    else:
        findings.append(Finding(level="ok", code="NO_HARDCODED_PORTS", message="Nenhuma porta hardcoded óbvia encontrada.", details={}))
        log("ok", "Nenhuma porta hardcoded óbvia.")

    # render config presence (not mandatory, but recommended)
    if structure["has_render_yaml"] or structure["has_procfile"]:
        findings.append(Finding(level="ok", code="HAS_RENDER_CONFIG", message="Config de deploy (render.yaml/Procfile) encontrada.", details=structure))
        log("ok", "render.yaml/Procfile encontrado.")
    else:
        findings.append(Finding(level="warn", code="MISSING_RENDER_CONFIG", message="Sem render.yaml/Procfile. Recomendado adicionar para deploy consistente.", details=structure))
        log("warn", "Sem render.yaml/Procfile (recomendado).")

    report = {
        "tool": "project_scanner2.py",
        "version": "v3",
        "generated_at": now_iso(),
        "structure": structure,
        "hits": hits,
        "findings": [asdict(f) for f in findings],
        "summary": findings_summary(findings),
    }

    reports_dir = ensure_reports_dir(Path(args.reports_dir))
    write_json(reports_dir / "project-scan.json", report)

    txt_lines = []
    txt_lines.append("PROJECT SCAN REPORT\n")
    txt_lines.append(f"Generated: {report['generated_at']}\n")
    txt_lines.append("\nStructure:\n")
    for k,v in structure.items():
        txt_lines.append(f"  - {k}: {v}\n")
    txt_lines.append("\nFindings:\n")
    for f in findings:
        txt_lines.append(f"  [{f.level.upper()}] {f.code} - {f.message}\n")
    txt_lines.append("\nTips:\n")
    txt_lines.append("  - Substitua URLs hardcoded por env vars (SITE_URL, API_URL, VITE_API_URL, etc.).\n")
    txt_lines.append("  - No Render, garanta que o backend use process.env.PORT.\n")

    write_text(reports_dir / "project-scan.txt", "".join(txt_lines))

    if args.json:
        import json
        print(json.dumps(report, ensure_ascii=False, indent=2))

    exit_for_strict(findings, args.strict)
    log("ok", "Project scan concluído. Veja reports/project-scan.*")

if __name__ == "__main__":
    main()
