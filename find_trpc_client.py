import os
import re
from pathlib import Path

# Pastas para ignorar (não queremos varrer node_modules/dist/etc.)
IGNORE_DIRS = {
    "node_modules", ".git", "dist", "build", ".next", ".turbo",
    ".vite", ".output", "coverage", ".cache", "reports"
}

# Pastas candidatas comuns de frontend
CANDIDATE_DIRS = [
    "src",
    "client/src",
    "frontend/src",
    "web/src",
    "app/src",
    "apps/web/src",
    "apps/client/src",
]

# Padrões que indicam auth/session/cookie/api
PATTERNS = [
    r"\buseAuth\b",
    r"\bauth\b",
    r"\bsession\b",
    r"\bcookie\b",
    r"Missing session cookie",
    r"/api/",
    r"/api/auth/",
    r"credentials\s*:\s*['\"]include['\"]",
    r"withCredentials\s*:\s*true",
    r"Authorization",
    r"Bearer ",
    r"trpc",  # às vezes está no client também
]

EXTENSIONS = (".ts", ".tsx", ".js", ".jsx")

def should_skip_dir(dirname: str) -> bool:
    return dirname in IGNORE_DIRS or dirname.startswith(".")

def walk_files(base: Path):
    for root, dirs, files in os.walk(base):
        # filtra dirs ignoradas
        dirs[:] = [d for d in dirs if not should_skip_dir(d)]
        for f in files:
            if f.endswith(EXTENSIONS):
                yield Path(root) / f

def scan_dir(base: Path):
    hits = []
    if not base.exists():
        return hits

    rx_list = [re.compile(p, re.IGNORECASE) for p in PATTERNS]

    for fp in walk_files(base):
        try:
            text = fp.read_text(encoding="utf-8", errors="ignore")
        except Exception:
            continue

        score = 0
        matched = []
        for i, rx in enumerate(rx_list):
            if rx.search(text):
                score += 1
                matched.append(PATTERNS[i])

        if score > 0:
            hits.append((score, str(fp), matched))

    hits.sort(key=lambda x: (-x[0], x[1]))
    return hits

def detect_frontend_roots(project_root: Path):
    """Detecta possíveis raízes de frontend via vite.config.* e index.html."""
    roots = set()
    vite_names = {"vite.config.ts", "vite.config.js", "vite.config.mjs", "vite.config.cjs"}

    for fp in walk_files(project_root):
        name = fp.name
        if name in vite_names or name == "index.html":
            roots.add(str(fp.parent))

    return sorted(roots)

def main():
    root = Path(".").resolve()

    print("\n🧭 Projeto:", root)
    print("🔎 Detectando possíveis raízes de frontend (vite/index.html)...\n")

    frontend_roots = detect_frontend_roots(root)
    if frontend_roots:
        for r in frontend_roots[:25]:
            print("✅ frontend root candidato:", r)
        if len(frontend_roots) > 25:
            print(f"... +{len(frontend_roots) - 25} outros")
    else:
        print("⚠️ Não encontrei vite.config.* ou index.html facilmente (pode estar fora do padrão).")

    print("\n🔎 Varredura de pastas candidatas (src, client/src, frontend/src, etc.)...\n")

    all_hits = []
    for d in CANDIDATE_DIRS:
        base = root / d
        hits = scan_dir(base)
        if hits:
            print(f"✅ Encontrado em {d}: {len(hits)} arquivo(s)")
            all_hits.extend(hits)
        else:
            print(f"❌ Nada em {d}")

    # Também varre o backend para achar "Missing session cookie"
    print("\n🔎 Procurando no backend por 'Missing session cookie'...\n")
    backend_hits = scan_dir(root / "server")
    backend_hits = [h for h in backend_hits if any("Missing session cookie" in m for m in h[2])]
    if backend_hits:
        for score, path, matched in backend_hits[:20]:
            print(f"👉 {path}  | match: {', '.join(matched)}")
    else:
        print("❌ Não encontrei a string no server/ (talvez esteja em outro lugar ou log gerado).")

    print("\n🏆 TOP 20 arquivos mais prováveis (frontend+geral):\n")
    all_hits.sort(key=lambda x: (-x[0], x[1]))
    if not all_hits:
        print("❌ Nenhum arquivo bateu nos padrões. Isso indica que o código pode estar fora dessas pastas, ou minificado.")
        print("➡️ Dica: me diga sua estrutura (rodar 'dir' ou 'tree /f /a' pode ajudar).")
        return

    for score, path, matched in all_hits[:20]:
        short = ", ".join(matched[:5]) + (" ..." if len(matched) > 5 else "")
        print(f"({score:02d}) {path}\n     ↳ {short}")

    print("\n📌 Me envie aqui os 2–3 primeiros arquivos do TOP 20 (o conteúdo) que eu ajusto com precisão.\n")

if __name__ == "__main__":
    main()