import os
import re
import json
from pathlib import Path
from typing import List, Tuple, Optional

ROOT = Path(os.getcwd())

# -------- Helpers --------

def read_text(path: Path) -> str:
    try:
        return path.read_text(encoding="utf-8", errors="ignore")
    except Exception:
        return ""

def exists(path: Path) -> bool:
    return path.exists()

def ok(msg):  return f"✅ {msg}"
def warn(msg): return f"⚠️  {msg}"
def bad(msg):  return f"❌ {msg}"

def find_file_by_name(name: str) -> Optional[Path]:
    # search shallow-ish (avoid node_modules)
    for p in ROOT.rglob(name):
        if "node_modules" in str(p): 
            continue
        return p
    return None

def parse_env_file(env_path: Path) -> dict:
    env = {}
    if not env_path.exists():
        return env
    text = read_text(env_path)
    for line in text.splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        if "=" not in line:
            continue
        k, v = line.split("=", 1)
        env[k.strip()] = v.strip().strip('"').strip("'")
    return env

def load_package_json() -> dict:
    pkg_path = ROOT / "package.json"
    if not pkg_path.exists():
        return {}
    try:
        return json.loads(read_text(pkg_path))
    except Exception:
        return {}

def dep_present(pkg: dict, name: str) -> bool:
    deps = pkg.get("dependencies", {}) or {}
    dev = pkg.get("devDependencies", {}) or {}
    return (name in deps) or (name in dev)

def scan_paths_for_patterns(paths: List[Path], patterns: List[re.Pattern]) -> List[Tuple[Path, str]]:
    hits = []
    for p in paths:
        txt = read_text(p)
        for pat in patterns:
            if pat.search(txt):
                hits.append((p, pat.pattern))
    return hits

def list_code_files() -> List[Path]:
    candidates = []
    for ext in ("*.ts", "*.tsx", "*.js", "*.jsx"):
        for p in ROOT.rglob(ext):
            if "node_modules" in str(p):
                continue
            if "dist" in str(p) or "build" in str(p):
                continue
            candidates.append(p)
    return candidates

# -------- Checks --------

def check_project_root() -> List[str]:
    out = []
    if exists(ROOT / "package.json"):
        out.append(ok("package.json encontrado"))
    else:
        out.append(bad("package.json NÃO encontrado — rode o script na raiz do projeto"))
    return out

def check_deps() -> List[str]:
    out = []
    pkg = load_package_json()
    if not pkg:
        return [bad("Não consegui ler package.json")]

    required = ["cors", "cookie-parser", "passport", "passport-google-oauth20"]
    optional = ["jsonwebtoken"]
    dev_types = ["@types/cors", "@types/cookie-parser"]

    for d in required:
        out.append(ok(f"Dependência instalada: {d}") if dep_present(pkg, d)
                   else bad(f"Dependência ausente: {d} → rode: pnpm add {d}"))

    for d in optional:
        out.append(ok(f"Dependência instalada: {d}") if dep_present(pkg, d)
                   else warn(f"Dependência opcional não encontrada: {d} (talvez você use ENV.cookieSecret em vez de JWT_SECRET)"))

    # TS types
    for t in dev_types:
        out.append(ok(f"Types instalados: {t}") if dep_present(pkg, t)
                   else warn(f"Types ausentes: {t} → recomendado: pnpm add -D {t}"))
    return out

def check_env_coherence() -> List[str]:
    out = []
    env_path = ROOT / ".env"
    env = parse_env_file(env_path)

    if not env:
        out.append(warn(".env não encontrado ou vazio — vou checar process.env só em runtime, mas recomendo ter .env local"))
        return out

    # Essentials
    SITE_URL = env.get("SITE_URL")
    PORT = env.get("PORT")
    OAUTH_SERVER_URL = env.get("OAUTH_SERVER_URL")
    GOOGLE_CALLBACK_URL = env.get("GOOGLE_CALLBACK_URL")
    GOOGLE_CLIENT_ID = env.get("GOOGLE_CLIENT_ID")
    GOOGLE_CLIENT_SECRET = env.get("GOOGLE_CLIENT_SECRET")

    if SITE_URL:
        out.append(ok(f"SITE_URL={SITE_URL}"))
    else:
        out.append(bad("SITE_URL ausente (ex: http://localhost:5173)"))

    if PORT:
        out.append(ok(f"PORT={PORT}"))
    else:
        out.append(warn("PORT ausente — se seu servidor escolhe porta automaticamente, o OAuth quebra. Recomendo fixar PORT=3001"))

    if OAUTH_SERVER_URL:
        out.append(ok(f"OAUTH_SERVER_URL={OAUTH_SERVER_URL}"))
    else:
        out.append(warn("OAUTH_SERVER_URL ausente — recomendado: http://localhost:3001"))

    if GOOGLE_CALLBACK_URL:
        out.append(ok(f"GOOGLE_CALLBACK_URL={GOOGLE_CALLBACK_URL}"))
    else:
        out.append(bad("GOOGLE_CALLBACK_URL ausente (ex: http://localhost:3001/api/auth/google/callback)"))

    if GOOGLE_CLIENT_ID:
        out.append(ok("GOOGLE_CLIENT_ID presente"))
    else:
        out.append(bad("GOOGLE_CLIENT_ID ausente"))

    if GOOGLE_CLIENT_SECRET:
        out.append(ok("GOOGLE_CLIENT_SECRET presente"))
    else:
        out.append(bad("GOOGLE_CLIENT_SECRET ausente"))

    # Consistency checks
    if SITE_URL and not SITE_URL.startswith(("http://", "https://")):
        out.append(bad("SITE_URL precisa começar com http:// ou https://"))

    if OAUTH_SERVER_URL and not OAUTH_SERVER_URL.startswith(("http://", "https://")):
        out.append(bad("OAUTH_SERVER_URL precisa começar com http:// ou https://"))

    if GOOGLE_CALLBACK_URL and not GOOGLE_CALLBACK_URL.startswith(("http://", "https://")):
        out.append(bad("GOOGLE_CALLBACK_URL precisa ser URL ABSOLUTA (http://...)"))

    # Check that callback matches oauth server base if both are defined
    if OAUTH_SERVER_URL and GOOGLE_CALLBACK_URL:
        if not GOOGLE_CALLBACK_URL.startswith(OAUTH_SERVER_URL):
            out.append(warn(
                f"GOOGLE_CALLBACK_URL não começa com OAUTH_SERVER_URL.\n"
                f"  OAUTH_SERVER_URL={OAUTH_SERVER_URL}\n"
                f"  GOOGLE_CALLBACK_URL={GOOGLE_CALLBACK_URL}\n"
                f"Isso pode causar mismatch se seu código monta baseURL."
            ))

    # Stripe price sanity
    for k in ["STRIPE_PRICE_BASICO", "STRIPE_PRICE_PREMIUM", "STRIPE_PRICE_VIP"]:
        v = env.get(k)
        if not v:
            out.append(warn(f"{k} ausente (se você usa Stripe checkout, precisa dele)"))
        else:
            if v.startswith("price_"):
                out.append(ok(f"{k} parece correto (price_...)"))
            elif v.startswith("prod_"):
                out.append(bad(f"{k} está como prod_... mas deveria ser price_... (Price ID)"))
            else:
                out.append(warn(f"{k} tem formato inesperado: {v[:10]}..."))

    return out

def check_backend_code() -> List[str]:
    out = []
    index_ts = find_file_by_name("index.ts")
    routes_ts = find_file_by_name("routes.ts")
    passport_ts = find_file_by_name("passport.ts")

    if index_ts:
        txt = read_text(index_ts)
        if re.search(r"cors\(", txt) and re.search(r"credentials\s*:\s*true", txt):
            out.append(ok(f"CORS com credentials:true encontrado em {index_ts}"))
        else:
            out.append(bad(f"CORS com credentials:true NÃO encontrado em {index_ts} (cookie pode não funcionar entre 5173↔3001)"))

        # origin set?
        if re.search(r"origin\s*:\s*.*SITE_URL", txt) or re.search(r"origin\s*:\s*process\.env\.SITE_URL", txt):
            out.append(ok("CORS origin parece baseado em SITE_URL"))
        else:
            out.append(warn("CORS origin não parece usar SITE_URL (verifique se origin está correto)"))

    else:
        out.append(warn("Não achei index.ts (backend). Pulando check de CORS."))

    if routes_ts:
        txt = read_text(routes_ts)
        # redirect relative
        if re.search(r"res\.redirect\(\s*['\"]/(courses|admin|dashboard)[\"']\s*\)", txt):
            out.append(bad("Encontrado redirect RELATIVO (ex: res.redirect('/courses')). Deve ser absoluto usando SITE_URL"))
        else:
            out.append(ok("Não detectei redirect relativo óbvio (bom)"))

        # cookie name and set
        if re.search(r"res\.cookie\(", txt):
            out.append(ok("Cookie sendo setado no callback (res.cookie encontrado)"))
        else:
            out.append(bad("Não encontrei res.cookie no callback — sem cookie, não mantém login"))

    else:
        out.append(warn("Não achei routes.ts. Se suas rotas OAuth estão em outro arquivo, rode novamente ou aponte o caminho."))

    if passport_ts:
        txt = read_text(passport_ts)
        if re.search(r"callbackURL\s*:\s*process\.env\.GOOGLE_CALLBACK_URL", txt):
            out.append(ok("passport.ts usa GOOGLE_CALLBACK_URL (bom)"))
        else:
            out.append(warn("passport.ts não parece usar GOOGLE_CALLBACK_URL diretamente (pode gerar callback relativo)"))

    else:
        out.append(warn("Não achei passport.ts. Pulando check do callbackURL."))

    return out

def check_frontend_credentials() -> List[str]:
    out = []
    # look in client/ or src/
    code_files = list_code_files()

    # Search for fetch credentials include or axios withCredentials
    fetch_cred = re.compile(r"credentials\s*:\s*['\"]include['\"]")
    axios_cred = re.compile(r"withCredentials\s*=\s*true|withCredentials\s*:\s*true")

    found_fetch = False
    found_axios = False
    for p in code_files:
        txt = read_text(p)
        if fetch_cred.search(txt):
            found_fetch = True
        if axios_cred.search(txt):
            found_axios = True

    if found_fetch:
        out.append(ok("Frontend: encontrei fetch com credentials:'include'"))
    if found_axios:
        out.append(ok("Frontend: encontrei axios com withCredentials:true"))

    if not found_fetch and not found_axios:
        out.append(bad("Frontend: NÃO encontrei credentials:'include' nem withCredentials:true — cookie não vai acompanhar requests"))
        out.append(warn("Correção: use fetch(...,{credentials:'include'}) OU axios.defaults.withCredentials=true"))

    return out

def main():
    report = []

    report.append("=== CHECK RAIZ DO PROJETO ===")
    report.extend(check_project_root())
    report.append("")

    report.append("=== CHECK DEPENDÊNCIAS (node/pnpm) ===")
    report.extend(check_deps())
    report.append("")

    report.append("=== CHECK .ENV (coerência e variáveis críticas) ===")
    report.extend(check_env_coherence())
    report.append("")

    report.append("=== CHECK BACKEND (CORS, redirect, cookie) ===")
    report.extend(check_backend_code())
    report.append("")

    report.append("=== CHECK FRONTEND (credentials include / withCredentials) ===")
    report.extend(check_frontend_credentials())
    report.append("")

    # Final recommendation
    report.append("=== AÇÕES RECOMENDADAS (se houver ❌) ===")
    bads = [line for line in report if line.startswith("❌")]
    if not bads:
        report.append(ok("Nenhum erro crítico detectado. Se ainda cair em auth_failed, pegue o erro real do terminal (passport) e valide no Google Console."))
    else:
        for b in bads:
            report.append(b)

    print("\n".join(report))

if __name__ == "__main__":
    main()