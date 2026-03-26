#!/usr/bin/env python3
"""
local_runner.py (v5 - Windows path-safe)
Runner para:
- checar toolchain (node + pnpm/npm/yarn)
- instalar deps
- rodar dev/build/start

Correção principal:
- No Windows, pnpm pode existir como pnpm.CMD.
- subprocess não resolve "pnpm" em alguns contextos.
- Agora executamos pelo caminho absoluto encontrado via which().
"""

from __future__ import annotations

import argparse
import os
import platform
import shutil
import subprocess
import sys
from dataclasses import asdict
from pathlib import Path
from typing import List, Optional, Tuple

from common import (
    Finding,
    ensure_reports_dir,
    findings_summary,
    log,
    now_iso,
    write_json,
    write_text,
    exit_for_strict,
)

ROOT = Path(".").resolve()


def which(bin_name: str) -> Optional[str]:
    """Resolve executáveis (Windows-friendly): .cmd/.exe também."""
    return (
        shutil.which(bin_name)
        or shutil.which(bin_name + ".cmd")
        or shutil.which(bin_name + ".exe")
    )


def run(cmd: List[str], cwd: Path = ROOT, env: Optional[dict] = None) -> int:
    log("info", " ".join(cmd))
    try:
        p = subprocess.Popen(cmd, cwd=str(cwd), env=env or os.environ.copy())
        return p.wait()
    except FileNotFoundError:
        log("fail", f"Executável não encontrado ao rodar: {' '.join(cmd)}")
        raise


def resolve_pm() -> Tuple[str, List[str], Optional[str]]:
    """
    Retorna (pm_name, runner_prefix, resolved_hint)

    runner_prefix é o executável REAL:
      - [r"C:\\...\\pnpm.CMD"]
      - [r"C:\\...\\npm.CMD"]
      - [r"C:\\...\\yarn.CMD"]
      - ["corepack", "pnpm"] (se corepack existir; mas no seu caso não existe)
    """
    pnpm_path = which("pnpm")
    if pnpm_path:
        return ("pnpm", [pnpm_path], pnpm_path)

    corepack_path = which("corepack")
    if corepack_path:
        # aqui runner_prefix inclui o corepack real
        return ("pnpm", [corepack_path, "pnpm"], corepack_path)

    npm_path = which("npm")
    if npm_path:
        return ("npm", [npm_path], npm_path)

    yarn_path = which("yarn")
    if yarn_path:
        return ("yarn", [yarn_path], yarn_path)

    return ("", [], None)


def pm_cmd(runner_prefix: List[str], args: List[str]) -> List[str]:
    return runner_prefix + args


def main() -> None:
    ap = argparse.ArgumentParser(description="Local runner for Node apps (Windows path-safe).")
    ap.add_argument("action", choices=["check", "install", "dev", "build", "start"], help="Action to run.")
    ap.add_argument("--reports-dir", default="reports")
    ap.add_argument("--strict", action="store_true")
    ap.add_argument("--fix", action="store_true", help="Best-effort fixes.")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--", dest="passthrough", nargs=argparse.REMAINDER, help="Args pass-through")
    args = ap.parse_args()

    findings: List[Finding] = []
    reports_dir = ensure_reports_dir(Path(args.reports_dir))

    if not (ROOT / "package.json").exists():
        findings.append(Finding(level="fail", code="MISSING_PACKAGE_JSON", message="package.json não encontrado na raiz.", details={}))
        log("fail", "package.json não encontrado.")
        report = {
            "tool": "local_runner.py",
            "version": "v5",
            "generated_at": now_iso(),
            "action": args.action,
            "exit_code": 2,
            "findings": [asdict(f) for f in findings],
            "summary": findings_summary(findings),
        }
        write_json(reports_dir / "local-runner.json", report)
        write_text(reports_dir / "local-runner.txt", "\n".join([f"[{f.level.upper()}] {f.code} - {f.message}" for f in findings]) + "\n")
        raise SystemExit(2)

    # Node
    node_path = which("node")
    if not node_path:
        findings.append(Finding(level="fail", code="MISSING_NODE", message="Node.js não encontrado no PATH.", details={"hint": "Instale Node LTS e reinicie o terminal."}))
        log("fail", "Node.js não encontrado no PATH.")
    else:
        findings.append(Finding(level="ok", code="HAS_NODE", message=f"Node encontrado: {node_path}", details={}))
        log("ok", f"Node encontrado: {node_path}")

    # Package manager
    pm, runner_prefix, resolved_hint = resolve_pm()
    if not pm:
        findings.append(Finding(level="fail", code="MISSING_PKG_MANAGER", message="Nenhum gerenciador encontrado (pnpm/npm/yarn/corepack).", details={}))
        log("fail", "pnpm/npm/yarn/corepack não encontrados.")
    else:
        details = {"pm": pm, "runner_prefix": runner_prefix, "resolved_hint": resolved_hint}
        findings.append(Finding(level="ok", code="HAS_PKG_MANAGER", message=f"Gerenciador detectado: {pm}", details=details))
        log("ok", f"Gerenciador detectado: {pm}")
        log("info", f"Runner real: {' '.join(runner_prefix)}")

    # strict: se faltar node/pm, sai
    if args.strict and any(f.level == "fail" for f in findings):
        report = {
            "tool": "local_runner.py",
            "version": "v5",
            "generated_at": now_iso(),
            "action": args.action,
            "exit_code": 2,
            "findings": [asdict(f) for f in findings],
            "summary": findings_summary(findings),
        }
        write_json(reports_dir / "local-runner.json", report)
        write_text(reports_dir / "local-runner.txt", "\n".join([f"[{f.level.upper()}] {f.code} - {f.message}" for f in findings]) + "\n")
        raise SystemExit(2)

    action = args.action
    passthrough = getattr(args, "passthrough", None) or []
    rc = 0

    try:
        if action == "check":
            log("ok", "Check local concluído.")
            rc = 0

        elif action == "install":
            if args.dry_run:
                log("info", f"(dry-run) instalaria deps: {' '.join(runner_prefix)} install")
                rc = 0
            else:
                rc = run(pm_cmd(runner_prefix, ["install"] + passthrough))

        elif action == "dev":
            if args.dry_run:
                log("info", f"(dry-run) rodaria dev: {' '.join(runner_prefix)} run dev")
                rc = 0
            else:
                rc = run(pm_cmd(runner_prefix, ["run", "dev"] + passthrough))

        elif action == "build":
            if args.dry_run:
                log("info", f"(dry-run) rodaria build: {' '.join(runner_prefix)} run build")
                rc = 0
            else:
                rc = run(pm_cmd(runner_prefix, ["run", "build"] + passthrough))

        elif action == "start":
            if args.dry_run:
                log("info", f"(dry-run) rodaria start: {' '.join(runner_prefix)} run start")
                rc = 0
            else:
                rc = run(pm_cmd(runner_prefix, ["run", "start"] + passthrough))

    except FileNotFoundError:
        rc = 2
        findings.append(Finding(
            level="fail",
            code="EXECUTABLE_NOT_FOUND",
            message="Falhou ao executar o gerenciador mesmo tendo sido detectado. PATH pode estar inconsistente.",
            details={
                "pm": pm,
                "runner_prefix": runner_prefix,
                "hint": "Feche e reabra o PowerShell/VSCode para recarregar PATH.",
            },
        ))

    if rc != 0:
        findings.append(Finding(level="fail", code="COMMAND_FAILED", message=f"Ação '{action}' falhou (exit={rc}).", details={"action": action}))
        log("fail", f"Falha ao executar '{action}' (exit {rc}).")
    else:
        findings.append(Finding(level="ok", code="COMMAND_OK", message=f"Ação '{action}' executada com sucesso.", details={"action": action}))
        log("ok", f"Ação '{action}' ok.")

    report = {
        "tool": "local_runner.py",
        "version": "v5",
        "generated_at": now_iso(),
        "platform": {"system": platform.system(), "release": platform.release()},
        "action": action,
        "exit_code": rc,
        "findings": [asdict(f) for f in findings],
        "summary": findings_summary(findings),
    }

    write_json(reports_dir / "local-runner.json", report)
    write_text(reports_dir / "local-runner.txt", "\n".join([f"[{f.level.upper()}] {f.code} - {f.message}" for f in findings]) + "\n")

    exit_for_strict(findings, args.strict)
    if rc != 0:
        raise SystemExit(rc)


if __name__ == "__main__":
    main()