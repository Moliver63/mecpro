#!/usr/bin/env python3
"""
pipeline.py (v1)
Orchestrates:
1) project_scanner2.py
2) env_scanner_v2.py
3) local_runner.py (check/install/build optional)
4) github_ready_check.py
5) render readiness checks (lightweight heuristics)

Usage:
  python pipeline.py --all --fix --strict
  python pipeline.py --scan
  python pipeline.py --env --fix
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
from dataclasses import dataclass, asdict
from pathlib import Path
from typing import Dict, List, Optional

from common import (
    Finding, ensure_reports_dir, findings_summary, log, now_iso, write_json,
    write_text, exit_for_strict, safe_rel
)

ROOT = Path(".").resolve()

@dataclass
class StepResult:
    name: str
    ok: bool
    exit_code: int
    report_file: Optional[str]
    hints: List[str]

def run_py(script: str, args: List[str]) -> int:
    cmd = [sys.executable, script] + args
    log("info", " ".join(cmd))
    p = subprocess.Popen(cmd)
    return p.wait()

def render_readiness_checks() -> List[Finding]:
    findings: List[Finding] = []
    pkg = ROOT / "package.json"
    if not pkg.exists():
        findings.append(Finding(level="fail", code="MISSING_PACKAGE_JSON", message="package.json ausente; não dá para avaliar Render.", details={}))
        return findings

    # Heuristic: check for process.env.PORT usage in server files
    server_candidates = []
    for rel in ["server", "src", "."]:
        d = ROOT / rel
        if d.is_dir():
            server_candidates.append(d)

    port_used = False
    for d in server_candidates:
        for fp in d.rglob("*"):
            if fp.is_dir():
                continue
            if fp.suffix.lower() not in {".js",".ts",".tsx",".jsx",".mjs",".cjs"}:
                continue
            try:
                txt = fp.read_text(encoding="utf-8", errors="ignore")
            except Exception:
                continue
            if "process.env.PORT" in txt or "process.env['PORT']" in txt or 'process.env["PORT"]' in txt:
                port_used = True
                break
        if port_used:
            break

    if port_used:
        findings.append(Finding(level="ok", code="USES_ENV_PORT", message="Encontrado uso de process.env.PORT (bom para Render).", details={}))
    else:
        findings.append(Finding(level="warn", code="MISSING_ENV_PORT", message="Não encontrei process.env.PORT. Garanta que o backend use PORT do Render.", details={"hint": "app.listen(process.env.PORT || 3001)"}))

    # render.yaml/Procfile presence
    if (ROOT / "render.yaml").exists() or (ROOT / "Procfile").exists():
        findings.append(Finding(level="ok", code="HAS_RENDER_CONFIG", message="render.yaml/Procfile presente.", details={}))
    else:
        findings.append(Finding(level="warn", code="NO_RENDER_CONFIG", message="Sem render.yaml/Procfile. Recomendado adicionar.", details={}))

    return findings

def main() -> None:
    ap = argparse.ArgumentParser(description="Local → GitHub → Render pipeline")
    ap.add_argument("--reports-dir", default="reports")
    ap.add_argument("--strict", action="store_true")
    ap.add_argument("--fix", action="store_true")
    ap.add_argument("--dry-run", action="store_true")

    # step flags
    ap.add_argument("--scan", action="store_true", help="Run project scanner")
    ap.add_argument("--env", action="store_true", help="Run env scanner")
    ap.add_argument("--local-check", action="store_true", help="Run local toolchain check")
    ap.add_argument("--install", action="store_true", help="Install deps locally")
    ap.add_argument("--build", action="store_true", help="Build locally")
    ap.add_argument("--github", action="store_true", help="Run GitHub readiness check")
    ap.add_argument("--render", action="store_true", help="Run Render readiness heuristics")

    ap.add_argument("--all", action="store_true", help="Run the full pipeline")
    args = ap.parse_args()

    if args.all:
        args.scan = args.env = args.local_check = args.github = args.render = True

    reports_dir = ensure_reports_dir(Path(args.reports_dir))

    steps: List[StepResult] = []
    all_findings: List[Finding] = []

    log("step", "PASSOS ENUMERADOS")
    log("step", "1) project scan")
    log("step", "2) env scan + templates")
    log("step", "3) local toolchain check (+ install/build opcionais)")
    log("step", "4) github readiness")
    log("step", "5) render readiness")
    log("step", "6) resumo final")

    # 1) scan
    if args.scan:
        rc = run_py("project_scanner2.py", ["--reports-dir", str(reports_dir)] + (["--strict"] if args.strict else []))
        steps.append(StepResult("project_scan", rc == 0, rc, str(reports_dir / "project-scan.json"), []))

    # 2) env
    if args.env:
        env_args = ["--reports-dir", str(reports_dir)]
        if args.fix: env_args += ["--fix"]
        if args.dry_run: env_args += ["--dry-run"]
        if args.strict: env_args += ["--strict"]
        rc = run_py("env_scanner_v2.py", env_args)
        steps.append(StepResult("env_scan", rc == 0, rc, str(reports_dir / "env-report.json"), []))

    # 3) local check/install/build
    if args.local_check:
        rc = run_py("local_runner.py", ["check", "--reports-dir", str(reports_dir)] + (["--strict"] if args.strict else []))
        steps.append(StepResult("local_check", rc == 0, rc, str(reports_dir / "local-runner.json"), []))
    if args.install:
        rc = run_py("local_runner.py", ["install", "--reports-dir", str(reports_dir)] + (["--strict"] if args.strict else []))
        steps.append(StepResult("install", rc == 0, rc, str(reports_dir / "local-runner.json"), []))
    if args.build:
        rc = run_py("local_runner.py", ["build", "--reports-dir", str(reports_dir)] + (["--strict"] if args.strict else []))
        steps.append(StepResult("build", rc == 0, rc, str(reports_dir / "local-runner.json"), []))

    # 4) github
    if args.github:
        gh_args = ["--reports-dir", str(reports_dir)]
        if args.fix: gh_args += ["--fix"]
        if args.dry_run: gh_args += ["--dry-run"]
        if args.strict: gh_args += ["--strict"]
        rc = run_py("github_ready_check.py", gh_args)
        steps.append(StepResult("github_ready", rc == 0, rc, str(reports_dir / "github-ready.json"), []))

    # 5) render
    if args.render:
        findings = render_readiness_checks()
        all_findings.extend(findings)
        render_ok = not any(f.level == "fail" for f in findings)
        steps.append(StepResult("render_ready", render_ok, 0 if render_ok else 2, None, []))

    # summary
    summary = {
        "tool": "pipeline.py",
        "version": "v1",
        "generated_at": now_iso(),
        "steps": [asdict(s) for s in steps],
        "render_findings": [asdict(f) for f in all_findings],
        "render_summary": findings_summary(all_findings),
    }
    write_json(reports_dir / "pipeline-summary.json", summary)

    log("step", "RESUMO FINAL")
    ok_steps = sum(1 for s in steps if s.ok)
    log("info", f"Steps OK: {ok_steps}/{len(steps)}")
    for s in steps:
        status = "ok" if s.ok else "fail"
        log(status, f"{s.name} (exit={s.exit_code})" + (f" report={s.report_file}" if s.report_file else ""))

    if all_findings:
        for f in all_findings:
            log(f.level if f.level in {"ok","warn","fail"} else "info", f"{f.code}: {f.message}")

    # strict mode: fail if any step failed or render fail
    if args.strict:
        if any(not s.ok for s in steps) or any(f.level == "fail" for f in all_findings):
            raise SystemExit(2)

    log("ok", f"Pipeline concluído. Veja {safe_rel(reports_dir / 'pipeline-summary.json')}")

if __name__ == "__main__":
    main()
