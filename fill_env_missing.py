# env_merge_fill_all.py
from __future__ import annotations
from pathlib import Path
import re
import json
from dataclasses import dataclass
from typing import Dict, Tuple, List, Optional

ENV_LINE_RE = re.compile(r"^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$")

@dataclass
class VarOrigin:
    value: str
    file: str
    line_no: int

def strip_inline_comment(v: str) -> str:
    """
    Remove comentário inline simples quando o valor não está entre aspas.
    Ex: KEY=abc # comment -> abc
    Não tenta ser um parser perfeito de shell, mas resolve 99% dos .env comuns.
    """
    s = v.strip()
    if not s:
        return s

    if (s.startswith('"') and s.count('"') >= 2) or (s.startswith("'") and s.count("'") >= 2):
        return s  # mantém (pode ter # dentro)
    # corta no primeiro # se houver espaço antes (padrão comum)
    # Ex: "abc#123" não deve cortar. "abc # 123" deve.
    parts = s.split(" #", 1)
    return parts[0].strip()

def unquote(v: str) -> str:
    s = v.strip()
    if len(s) >= 2 and ((s[0] == s[-1] == '"') or (s[0] == s[-1] == "'")):
        return s[1:-1]
    return s

def is_empty_value(raw_value: str) -> bool:
    v = raw_value.strip()
    if v == "":
        return True
    if v in ('""', "''"):
        return True
    return False

def quote_if_needed(value: str) -> str:
    if value == "":
        return value
    needs_quotes = any(ch.isspace() for ch in value) or "#" in value
    if needs_quotes:
        value = value.replace('"', '\\"')
        return f'"{value}"'
    return value

def parse_env_file(path: Path) -> Dict[str, VarOrigin]:
    found: Dict[str, VarOrigin] = {}
    try:
        lines = path.read_text(encoding="utf-8").splitlines()
    except UnicodeDecodeError:
        # fallback comum no Windows
        lines = path.read_text(encoding="latin-1").splitlines()

    for i, line in enumerate(lines, start=1):
        if not line.strip() or line.lstrip().startswith("#"):
            continue
        m = ENV_LINE_RE.match(line)
        if not m:
            continue
        key, raw_val = m.group(1), m.group(2)
        raw_val = strip_inline_comment(raw_val)
        # mantém o valor "como texto", mas sem aspas externas
        val = unquote(raw_val)
        found[key] = VarOrigin(value=val, file=str(path.name), line_no=i)
    return found

def discover_env_files(root: Path) -> List[Path]:
    """
    Encontra arquivos .env, .env.*, .env.production.sample etc.
    Ignora node_modules e dist por padrão.
    """
    patterns = [
        ".env",
        ".env.*",
    ]
    files: List[Path] = []
    for pat in patterns:
        files.extend(root.glob(pat))

    # filtra coisas comuns indesejadas
    files = [p for p in files if p.is_file() and "node_modules" not in p.parts and "dist" not in p.parts]
    # remove duplicados
    files = sorted(list(dict.fromkeys(files)), key=lambda p: p.name.lower())
    return files

def priority_score(filename: str) -> int:
    """
    Maior score = maior prioridade (ganha conflito).
    Ajuste aqui como quiser.
    """
    name = filename.lower()
    score = 0
    if "production" in name:
        score += 300
    if name.endswith(".sample") or name.endswith(".example"):
        score -= 50
    if name == ".env":
        score += 100
    if "local" in name or "dev" in name or "development" in name:
        score += 10
    return score

def merge_all(env_files: List[Path]) -> Tuple[Dict[str, str], Dict[str, VarOrigin]]:
    """
    Retorna:
      - merged: key -> value (resolvido por prioridade)
      - origin: key -> VarOrigin (de onde veio)
    """
    all_candidates: Dict[str, List[VarOrigin]] = {}

    for p in env_files:
        parsed = parse_env_file(p)
        for k, vo in parsed.items():
            all_candidates.setdefault(k, []).append(vo)

    merged: Dict[str, str] = {}
    origin: Dict[str, VarOrigin] = {}

    for k, vos in all_candidates.items():
        # resolve por prioridade do arquivo (e, em empate, pega o mais recente na lista)
        best = sorted(
            vos,
            key=lambda vo: (priority_score(vo.file),),  # score
            reverse=True
        )[0]
        merged[k] = best.value
        origin[k] = best

    return merged, origin

def fill_template(template_path: Path, output_path: Path, merged: Dict[str, str]) -> None:
    """
    Preenche somente valores vazios no template. Não altera valores já existentes.
    Preserva comentários e linhas não-KEY=.
    """
    try:
        raw_lines = template_path.read_text(encoding="utf-8").splitlines(True)
    except UnicodeDecodeError:
        raw_lines = template_path.read_text(encoding="latin-1").splitlines(True)

    out_lines: List[str] = []
    for line in raw_lines:
        if line.strip() == "" or line.lstrip().startswith("#"):
            out_lines.append(line)
            continue

        m = ENV_LINE_RE.match(line)
        if not m:
            out_lines.append(line)
            continue

        key, raw_val = m.group(1), m.group(2)
        raw_val_clean = strip_inline_comment(raw_val)

        if is_empty_value(raw_val_clean):
            if key in merged and merged[key] != "":
                out_lines.append(f"{key}={quote_if_needed(merged[key])}\n")
            else:
                out_lines.append(line)  # mantém vazio
        else:
            out_lines.append(line)  # já tem valor, mantém

    output_path.write_text("".join(out_lines), encoding="utf-8")

def main():
    root = Path(".").resolve()
    env_files = discover_env_files(root)

    if not env_files:
        print("❌ Nenhum arquivo .env encontrado nesta pasta.")
        return

    print("📄 Arquivos encontrados:")
    for p in env_files:
        print(f"  - {p.name}")

    merged, origin = merge_all(env_files)

    # Escolha do template principal (preferência: .env.production.sample)
    template = None
    for preferred in [".env.production.sample", ".env.production", ".env.example", ".env"]:
        cand = root / preferred
        if cand.exists():
            template = cand
            break
    if template is None:
        template = env_files[0]  # fallback

    out_env = root / ".env.production.filled"
    fill_template(template, out_env, merged)

    # relatório de origem
    report = {
        "template_used": template.name,
        "output": out_env.name,
        "files_scanned": [p.name for p in env_files],
        "vars_merged_count": len(merged),
        "origins": {
            k: {"value": v.value, "file": v.file, "line": v.line_no}
            for k, v in sorted(origin.items(), key=lambda x: x[0].lower())
        }
    }
    (root / "env-merge-report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")

    print(f"\n✅ Gerado: {out_env.name}")
    print("✅ Relatório: env-merge-report.json")
    print(f"ℹ️ Template usado: {template.name}")

if __name__ == "__main__":
    main()