#!/usr/bin/env python3
"""
common.py - shared helpers for the local→github→render toolkit.
"""

from __future__ import annotations

import json
import os
import sys
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, Iterable, Optional

DEFAULT_REPORTS_DIR = Path("reports")

LEVEL_ICONS = {
    "check": "🔎",
    "ok": "✅",
    "fail": "❌",
    "warn": "⚠️",
    "fix": "🛠️",
    "hint": "💡",
    "step": "➡️",
    "info": "ℹ️",
}

def now_iso() -> str:
    return datetime.utcnow().replace(microsecond=0).isoformat() + "Z"

def icon(level: str) -> str:
    return LEVEL_ICONS.get(level, "•")

def log(level: str, msg: str) -> None:
    print(f"{icon(level)} [{level}] {msg}")

def hr() -> None:
    print("—" * 72)

def ensure_reports_dir(path: Path = DEFAULT_REPORTS_DIR) -> Path:
    path.mkdir(parents=True, exist_ok=True)
    return path

def write_json(path: Path, data: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")

def write_text(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")

def read_text(path: Path) -> str:
    return path.read_text(encoding="utf-8", errors="ignore")

def is_truthy_env(value: Optional[str]) -> bool:
    if value is None:
        return False
    return value.strip().lower() in {"1","true","yes","y","on"}

@dataclass
class Finding:
    level: str  # ok/warn/fail
    code: str   # machine-readable code
    message: str
    details: Dict[str, Any]

def findings_summary(findings: Iterable[Finding]) -> Dict[str, int]:
    counts = {"ok": 0, "warn": 0, "fail": 0}
    for f in findings:
        counts[f.level] = counts.get(f.level, 0) + 1
    return counts

def exit_for_strict(findings: Iterable[Finding], strict: bool) -> None:
    if not strict:
        return
    for f in findings:
        if f.level == "fail":
            raise SystemExit(2)

def safe_rel(path: Path) -> str:
    try:
        return str(path.relative_to(Path.cwd()))
    except Exception:
        return str(path)
