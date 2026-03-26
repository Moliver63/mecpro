#!/usr/bin/env python3
# common_error_auditor.py
# Auditor de erros comuns para projetos Vite/React/TS + Node/tRPC
# Uso: python common_error_auditor.py --root . --out reports

from __future__ import annotations

import argparse
import json
import os
import re
from dataclasses import dataclass, asdict
from pathlib import Path
from typing import Iterable, List, Dict, Optional, Tuple


@dataclass
class Finding:
    kind: str               # categoria do problema
    severity: str           # info|warn|error
    file: str               # caminho relativo
    line: int               # linha (1-based) ou 0
    message: str            # descrição curta
    hint: str = ""          # sugestão de correção
    excerpt: str = ""       # trecho (opcional)


TSX_EXTS = {".ts", ".tsx", ".js", ".jsx"}

# Palavras-chave típicas de placeholders/arquivos incompletos
PLACEHOLDER_PATTERNS: List[Tuple[re.Pattern, str]] = [
    (re.compile(r"\bTODO\b", re.I), "TODO encontrado"),
    (re.compile(r"\bFIXME\b", re.I), "FIXME encontrado"),
    (re.compile(r"Página em construção|Pagina em construcao|em construção|em construcao", re.I),
     "Página em construção (placeholder)"),
    (re.compile(r"Temporary stub|stub to prevent runtime crash|Replace this with a real import", re.I),
     "Stub temporário (placeholder)"),
    (re.compile(r"/\*\s*FIX:", re.I), "Comentário automático FIX (possível placeholder)"),
    (re.compile(r"throw new Error\(", re.I), "throw new Error(...) (pode estar não implementado)"),
    (re.compile(r"\breturn\s+null\s*;", re.I), "return null; (pode ser placeholder)"),
]

# Heurística de "handler vazio"
EMPTY_HANDLER_RE = re.compile(
    r"(const|function)\s+\w+\s*=\s*\([^)]*\)\s*=>\s*\{\s*(/\*.*?\*/\s*)?\}\s*;?",
    re.S
)

IMPORT_RE = re.compile(
    r"^\s*import\s+(?:type\s+)?(?:[\w*\s{},]+from\s+)?['\"]([^'\"]+)['\"];?\s*$",
    re.M
)

# Captura uso de identificadores em rotas comuns (element/component)
ROUTE_COMPONENT_RE = re.compile(
    r"(?:component\s*=\s*\{([A-Z][A-Za-z0-9_]*)\})|(?:element\s*=\s*\{<([A-Z][A-Za-z0-9_]*)\s*/?>\})"
)

# Import default simples: import X from "..."
DEFAULT_IMPORT_RE = re.compile(r"^\s*import\s+([A-Z][A-Za-z0-9_]*)\s+from\s+['\"][^'\"]+['\"]", re.M)


def read_text(p: Path) -> str:
    try:
        return p.read_text(encoding="utf-8")
    except UnicodeDecodeError:
        return p.read_text(errors="replace")


def relpath(root: Path, p: Path) -> str:
    try:
        return str(p.relative_to(root)).replace("\\", "/")
    except Exception:
        return str(p).replace("\\", "/")


def iter_files(root: Path, sub: Optional[str] = None, exts: Optional[set] = None) -> Iterable[Path]:
    base = root / sub if sub else root
    if not base.exists():
        return []
    for p in base.rglob("*"):
        if p.is_file():
            if exts is None:
                yield p
            else:
                if p.suffix in exts:
                    yield p


def line_for_pos(text: str, pos: int) -> int:
    return text.count("\n", 0, pos) + 1


def excerpt_at_line(text: str, line: int, radius: int = 2) -> str:
    lines = text.splitlines()
    if not lines:
        return ""
    i = max(0, min(len(lines) - 1, line - 1))
    start = max(0, i - radius)
    end = min(len(lines), i + radius + 1)
    out = []
    for idx in range(start, end):
        out.append(f"{idx+1:4d} | {lines[idx]}")
    return "\n".join(out)


def check_placeholders(root: Path) -> List[Finding]:
    findings: List[Finding] = []
    for p in iter_files(root, "client/src/pages", {".tsx"}):
        t = read_text(p)
        # export default ausente
        if "export default" not in t:
            findings.append(Finding(
                kind="page_missing_export_default",
                severity="warn",
                file=relpath(root, p),
                line=1,
                message="Página sem 'export default' (pode não ser componente)",
                hint="Garanta que a página exporta um componente default.",
            ))
        # arquivo muito curto
        lc = len(t.splitlines())
        if lc < 35:
            findings.append(Finding(
                kind="page_too_short",
                severity="info",
                file=relpath(root, p),
                line=1,
                message=f"Página muito curta ({lc} linhas) — pode estar incompleta.",
                hint="Verifique se é stub/placeholder.",
            ))
        # padrões comuns
        for rx, msg in PLACEHOLDER_PATTERNS:
            m = rx.search(t)
            if m:
                ln = line_for_pos(t, m.start())
                findings.append(Finding(
                    kind="placeholder",
                    severity="warn",
                    file=relpath(root, p),
                    line=ln,
                    message=msg,
                    hint="Remova placeholder e implemente a lógica real.",
                    excerpt=excerpt_at_line(t, ln),
                ))
        # handlers vazios
        if EMPTY_HANDLER_RE.search(t):
            findings.append(Finding(
                kind="empty_handler",
                severity="warn",
                file=relpath(root, p),
                line=1,
                message="Possível handler vazio (função => { /*...*/ })",
                hint="Implemente a ação ou remova o handler.",
            ))
    return findings


def resolve_import(from_file: Path, spec: str, root: Path) -> Optional[Path]:
    """
    Resolve imports locais simples:
    - ./foo, ../bar, @/x (alias para client/src)
    """
    if spec.startswith("http") or spec.startswith("https"):
        return None
    if spec.startswith("@/"):
        # alias para client/src
        cand = root / "client/src" / spec[2:]
        # tenta extensões
        for ext in [".ts", ".tsx", ".js", ".jsx"]:
            if cand.with_suffix(ext).exists():
                return cand.with_suffix(ext)
        # index
        for ext in [".ts", ".tsx", ".js", ".jsx"]:
            if (cand / f"index{ext}").exists():
                return cand / f"index{ext}"
        return cand if cand.exists() else None

    if spec.startswith("."):
        cand = (from_file.parent / spec).resolve()
        # se já tem extensão
        if cand.exists():
            return cand
        for ext in [".ts", ".tsx", ".js", ".jsx", ".json"]:
            if cand.with_suffix(ext).exists():
                return cand.with_suffix(ext)
        # pasta com index
        for ext in [".ts", ".tsx", ".js", ".jsx"]:
            if (cand / f"index{ext}").exists():
                return cand / f"index{ext}"
        return None

    # pacote npm (não validamos aqui)
    return None


def check_imports(root: Path) -> List[Finding]:
    findings: List[Finding] = []
    for p in iter_files(root, "client/src", TSX_EXTS):
        t = read_text(p)
        for m in IMPORT_RE.finditer(t):
            spec = m.group(1)
            resolved = resolve_import(p, spec, root)
            if resolved is None and (spec.startswith(".") or spec.startswith("@/")):
                ln = line_for_pos(t, m.start())
                findings.append(Finding(
                    kind="broken_import",
                    severity="error",
                    file=relpath(root, p),
                    line=ln,
                    message=f"Import local não resolvido: '{spec}'",
                    hint="Verifique caminho/alias e se o arquivo existe.",
                    excerpt=excerpt_at_line(t, ln),
                ))
    return findings


def check_app_routes_undefined(root: Path) -> List[Finding]:
    app = root / "client/src/App.tsx"
    if not app.exists():
        return []
    t = read_text(app)

    # quais componentes estão importados como default
    imported = set(DEFAULT_IMPORT_RE.findall(t))
    # quais são definidos como const/function no arquivo
    declared = set(re.findall(r"\b(?:const|function)\s+([A-Z][A-Za-z0-9_]*)\b", t))

    findings: List[Finding] = []
    for m in ROUTE_COMPONENT_RE.finditer(t):
        comp = m.group(1) or m.group(2)
        if not comp:
            continue
        if comp not in imported and comp not in declared:
            ln = line_for_pos(t, m.start())
            findings.append(Finding(
                kind="route_component_not_defined",
                severity="error",
                file=relpath(root, app),
                line=ln,
                message=f"Componente usado em rota não está definido/importado: {comp}",
                hint=f"Importe {comp} ou crie o componente. Isso causa '{comp} is not defined' em runtime.",
                excerpt=excerpt_at_line(t, ln),
            ))
    return findings


def check_env_placeholders(root: Path) -> List[Finding]:
    env = root / ".env"
    if not env.exists():
        env = root / "server/.env"
    if not env.exists():
        return []
    t = read_text(env)

    findings: List[Finding] = []
    for i, line in enumerate(t.splitlines(), start=1):
        if not line or line.strip().startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        k = k.strip()
        v = v.strip().strip('"').strip("'")
        if "PLACEHOLDER" in v or "SUBSTITUA" in v or v.startswith("dev_change_me"):
            findings.append(Finding(
                kind="env_placeholder",
                severity="warn",
                file=relpath(root, env),
                line=i,
                message=f"Variável com placeholder: {k}",
                hint="Substitua por um valor real antes de produção.",
                excerpt=f"{i:4d} | {line}",
            ))
    return findings


def check_package_scripts(root: Path) -> List[Finding]:
    pkg = root / "package.json"
    if not pkg.exists():
        pkg = root / "client/package.json"
    if not pkg.exists():
        return []
    data = json.loads(read_text(pkg))
    scripts = (data.get("scripts") or {})
    deps = (data.get("dependencies") or {})
    devdeps = (data.get("devDependencies") or {})

    findings: List[Finding] = []

    # NODE_ENV= sem cross-env (problema no Windows)
    for name, cmd in scripts.items():
        if isinstance(cmd, str) and re.search(r"\bNODE_ENV\s*=", cmd) and "cross-env" not in cmd:
            findings.append(Finding(
                kind="windows_node_env_script",
                severity="warn",
                file=relpath(root, pkg),
                line=0,
                message=f"Script '{name}' usa NODE_ENV=... sem cross-env (quebra no Windows).",
                hint="Use: cross-env NODE_ENV=... <comando>",
                excerpt=f"{name}: {cmd}",
            ))

    # cross-env usado mas não instalado
    uses_cross_env = any(isinstance(cmd, str) and "cross-env" in cmd for cmd in scripts.values())
    if uses_cross_env and ("cross-env" not in deps and "cross-env" not in devdeps):
        findings.append(Finding(
            kind="cross_env_missing_dependency",
            severity="error",
            file=relpath(root, pkg),
            line=0,
            message="Scripts usam cross-env mas ele não está em dependencies/devDependencies.",
            hint="Instale: pnpm add -D cross-env",
        ))

    return findings


def check_index_html_umami(root: Path) -> List[Finding]:
    html = root / "client/index.html"
    if not html.exists():
        html = root / "client/public/index.html"
    if not html.exists():
        return []
    t = read_text(html)
    if '<script src="/umami"' in t and 'type="module"' not in t:
        ln = 1
        idx = t.find('<script src="/umami"')
        if idx != -1:
            ln = line_for_pos(t, idx)
        return [Finding(
            kind="umami_script_module",
            severity="info",
            file=relpath(root, html),
            line=ln,
            message='Script /umami sem type="module" pode gerar warning no build.',
            hint='Use <script type="module" src="/umami"></script> (se for ESM) ou use a URL oficial do tracker com defer.',
            excerpt=excerpt_at_line(t, ln),
        )]
    return []


def write_reports(out_dir: Path, findings: List[Finding]) -> None:
    out_dir.mkdir(parents=True, exist_ok=True)
    # json
    (out_dir / "common_errors.json").write_text(
        json.dumps([asdict(f) for f in findings], ensure_ascii=False, indent=2),
        encoding="utf-8"
    )
    # txt
    lines = []
    for f in findings:
        loc = f"{f.file}:{f.line}" if f.line else f.file
        lines.append(f"[{f.severity.upper()}] {f.kind} @ {loc}\n  - {f.message}")
        if f.hint:
            lines.append(f"  - Dica: {f.hint}")
        if f.excerpt:
            lines.append("  - Trecho:\n" + "\n".join("    " + s for s in f.excerpt.splitlines()))
        lines.append("")
    (out_dir / "common_errors.txt").write_text("\n".join(lines), encoding="utf-8")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--root", default=".", help="Raiz do projeto (onde ficam client/ e server/)")
    ap.add_argument("--out", default="reports", help="Pasta de saída dos relatórios")
    args = ap.parse_args()

    root = Path(args.root).resolve()
    out_dir = (root / args.out).resolve()

    findings: List[Finding] = []
    findings += check_package_scripts(root)
    findings += check_index_html_umami(root)
    findings += check_env_placeholders(root)
    findings += check_imports(root)
    findings += check_app_routes_undefined(root)
    findings += check_placeholders(root)

    # Ordena por severidade
    sev_order = {"error": 0, "warn": 1, "info": 2}
    findings.sort(key=lambda f: (sev_order.get(f.severity, 9), f.file, f.line))

    write_reports(out_dir, findings)

    print("\n============================================================")
    print("  COMMON ERROR AUDITOR - RELATÓRIO")
    print("============================================================")
    print(f"Raiz: {root}")
    print(f"Saída: {out_dir}")
    print(f"Total findings: {len(findings)}")
    print("------------------------------------------------------------")

    errors = [f for f in findings if f.severity == "error"]
    warns = [f for f in findings if f.severity == "warn"]
    infos = [f for f in findings if f.severity == "info"]

    print(f"Errors: {len(errors)} | Warns: {len(warns)} | Infos: {len(infos)}\n")

    # Mostra top 30
    for f in (errors + warns + infos)[:30]:
        loc = f"{f.file}:{f.line}" if f.line else f.file
        print(f"[{f.severity.upper()}] {loc} - {f.message}")

    print("\nArquivos gerados:")
    print(f"- {out_dir / 'common_errors.txt'}")
    print(f"- {out_dir / 'common_errors.json'}\n")


if __name__ == "__main__":
    main()