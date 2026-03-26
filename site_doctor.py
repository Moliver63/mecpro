#!/usr/bin/env python3
"""site_doctor.py — Local doctor + auto-fix for .env (localhost:3001)

Usage
- Read-only:
    python site_doctor.py
- Auto-fix .env (creates .env.bak):
    python site_doctor.py --fix-env
- Override base URL:
    PowerShell: $env:BASE_URL="http://localhost:3001"; python site_doctor.py
"""

import os
import sys
import json
import socket
import argparse
from pathlib import Path
from urllib.parse import urlparse

try:
    import requests
except ImportError:
    print("❌ Missing dependency: requests")
    print("➡️  Install it with: pip install requests")
    sys.exit(1)

BASE_DEFAULT = "http://localhost:3001"
TIMEOUT = 5

RECOMMENDED_BASE = "http://localhost:3001"
ENV_KEYS_TO_FIX = ["SITE_URL", "VITE_APP_URL", "VITE_API_URL"]


def ok(msg): print(f"✅ {msg}")
def warn(msg): print(f"⚠️  {msg}")
def err(msg): print(f"❌ {msg}")
def info(msg): print(f"ℹ️  {msg}")


def port_open(host: str, port: int) -> bool:
    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    s.settimeout(0.7)
    try:
        return s.connect_ex((host, port)) == 0
    finally:
        s.close()


def read_env_file(path: Path):
    """Return (env_dict, original_lines)."""
    if not path.exists():
        return {}, []
    lines = path.read_text(encoding="utf-8", errors="ignore").splitlines()
    env = {}
    for line in lines:
        s = line.strip()
        if not s or s.startswith("#"):
            continue
        if s.lower().startswith("export "):
            s = s[7:].strip()
        if "=" not in s:
            continue
        k, v = s.split("=", 1)
        env[k.strip()] = v.strip().strip('"').strip("'")
    return env, lines


def normalize_url(u):
    if not u:
        return None
    u = u.strip().rstrip("/")
    if u.startswith("http://") or u.startswith("https://"):
        return u
    if ":" in u and "://" not in u:
        return "http://" + u
    return u


def write_env_fixed(path: Path, original_lines, fixes: dict) -> None:
    """Apply fixes to existing lines if keys exist; append missing keys at end."""
    keys_seen = set()
    new_lines = []
    for line in original_lines:
        raw = line
        stripped = raw.strip()

        if not stripped or stripped.startswith("#") or "=" not in stripped:
            new_lines.append(raw)
            continue

        prefix = ""
        body = raw
        if stripped.lower().startswith("export "):
            prefix = "export "
            body = raw[len("export "):]

        k, _v = body.split("=", 1)
        key = k.strip()
        keys_seen.add(key)

        if key in fixes:
            new_lines.append(f"{prefix}{key}={fixes[key]}")
        else:
            new_lines.append(raw)

    for k, v in fixes.items():
        if k not in keys_seen:
            new_lines.append(f"{k}={v}")

    path.write_text("\n".join(new_lines) + "\n", encoding="utf-8")


def get(url: str):
    return requests.get(url, timeout=TIMEOUT, allow_redirects=True)


def _describe_redirects(response):
    if not response.history:
        return response.url
    hist = [h.url for h in response.history[-2:]]
    hist.append(response.url)
    return " -> ".join(hist)


def check_http(base: str):
    info(f"Base alvo: {base}")
    parsed = urlparse(base)
    host = parsed.hostname or "localhost"
    port = parsed.port or (443 if parsed.scheme == "https" else 80)

    if not port_open(host, port):
        err(f"Porta {port} NÃO está aberta em {host}. O servidor não parece rodar.")
        info("Ação: rode `pnpm dev` e confirme que aparece: Server running on http://localhost:3001/")
        return False

    ok(f"Porta {port} está aberta em {host}")

    core_routes = [
        ("/", "Home"),
        ("/courses", "Cursos (rota principal)"),
        ("/api/health", "API Health"),
        ("/api/auth/me", "Auth Me (precisa cookie)"),
    ]

    trpc_routes_optional = [
        ("/api/trpc", "tRPC base (opcional)"),
        ("/api/trpc/health", "tRPC health (opcional)"),
        ("/api/trpc/auth.me", "tRPC auth.me (opcional)"),
        ("/api/trpc/auth.me?batch=1&input=%7B%220%22%3A%7B%22json%22%3A%7B%7D%7D%7D", "tRPC auth.me (batch probe, opcional)"),
    ]

    any_ok = False

    info("Rotas principais:")
    for path, label in core_routes:
        url = base + path
        try:
            r = get(url)
            status = r.status_code
            ct = (r.headers.get("content-type") or "").lower()
            hops = _describe_redirects(r)

            if status == 200:
                ok(f"{label}: {path} OK (200) | {hops}")
                any_ok = True
            elif status in (301, 302, 307, 308):
                warn(f"{label}: {path} redirect ({status}) | {hops}")
            elif status == 401:
                warn(f"{label}: {path} 401 (não logado / cookie ausente) | {hops}")
            elif status == 403:
                warn(f"{label}: {path} 403 (bloqueado / cookie inválido) | {hops}")
            elif status == 404:
                err(f"{label}: {path} 404 (rota não existe / sem fallback SPA?) | {hops}")
            else:
                warn(f"{label}: {path} status {status} | {hops}")

            if path in ("/", "/courses") and status == 200:
                if "text/html" not in ct:
                    warn(f"{path} não retornou HTML (content-type={ct}) — pode não ser a UI.")
                else:
                    html = r.text.lower()
                    if "<div" not in html or "root" not in html:
                        warn(f"{path} retornou HTML mas não encontrei indícios claros do app (root).")

        except Exception as e:
            err(f"{label}: falha ao acessar {path}: {e}")

    print("\n--- tRPC probes (opcional) ---\n")
    for path, label in trpc_routes_optional:
        url = base + path
        try:
            r = get(url)
            status = r.status_code
            hops = _describe_redirects(r)

            if status in (200, 401, 403, 405):
                ok(f"{label}: {path} respondeu {status} | {hops}")
            else:
                warn(f"{label}: {path} respondeu {status} (pode ser normal) | {hops}")
        except Exception as e:
            warn(f"{label}: falha ao acessar {path}: {e}")

    return any_ok


def check_and_optionally_fix_env(root: Path, fix_env: bool) -> None:
    env_path = root / ".env"
    env, lines = read_env_file(env_path)

    info("Checando URLs do .env (recomendado para seu setup):")
    info(f"  SITE_URL={RECOMMENDED_BASE}")
    info(f"  VITE_APP_URL={RECOMMENDED_BASE}")
    info(f"  VITE_API_URL={RECOMMENDED_BASE}")

    cur = {k: normalize_url(env.get(k)) for k in ENV_KEYS_TO_FIX}

    def is_good(v):
        return bool(v) and "localhost:3001" in v

    for k in ENV_KEYS_TO_FIX:
        if cur[k] is None:
            warn(f"{k} não definido.")
        elif is_good(cur[k]):
            ok(f"{k} OK ({cur[k]})")
        else:
            warn(f"{k}={cur[k]} (pode causar URL errada no front/back).")

    if not fix_env:
        return

    if not env_path.exists():
        warn(".env não existe — criando um novo com valores recomendados.")
        env_path.write_text(
            "\n".join([f"{k}={RECOMMENDED_BASE}" for k in ENV_KEYS_TO_FIX]) + "\n",
            encoding="utf-8",
        )
        ok("Criado .env com valores recomendados.")
        return

    fixes = {k: RECOMMENDED_BASE for k in ENV_KEYS_TO_FIX}

    backup = root / ".env.bak"
    backup.write_text("\n".join(lines) + "\n", encoding="utf-8")
    ok("Backup criado: .env.bak")

    write_env_fixed(env_path, lines, fixes)
    ok("✅ .env atualizado com valores recomendados (localhost:3001).")


def check_project_root(root: Path) -> bool:
    info(f"Pasta: {root}")

    pkg = root / "package.json"
    if not pkg.exists():
        err("package.json não encontrado na raiz. Você está na pasta certa?")
        return False

    ok("package.json encontrado.")
    try:
        data = json.loads(pkg.read_text(encoding="utf-8"))
        scripts = data.get("scripts", {})
        for k in ("dev", "build", "start"):
            if k in scripts:
                ok(f"script {k}: {scripts[k]}")
            else:
                warn(f"script {k} ausente no package.json")
    except Exception as e:
        warn(f"Não consegui ler package.json: {e}")

    return True


def main():
    parser = argparse.ArgumentParser(add_help=True)
    parser.add_argument("--fix-env", action="store_true", help="Auto-fix SITE_URL / VITE_APP_URL / VITE_API_URL in .env to http://localhost:3001 (creates .env.bak).")
    args = parser.parse_args()

    base = (os.environ.get("BASE_URL") or BASE_DEFAULT).rstrip("/")
    root = Path(".").resolve()

    print("\n==============================")
    print("🩺 SITE DOCTOR (Local Check)")
    print("==============================\n")

    if not check_project_root(root):
        sys.exit(1)

    env = read_env_file(root / ".env")[0]
    if not env and not args.fix_env:
        warn(".env não encontrado ou vazio (na raiz). Em dev pode funcionar, mas você perde consistência.")
    else:
        check_and_optionally_fix_env(root, args.fix_env)

    print("\n------------------------------")
    print("🌐 Testes HTTP")
    print("------------------------------\n")

    ok_any = check_http(base)

    print("\n------------------------------")
    print("✅ Conclusão")
    print("------------------------------\n")

    if args.fix_env:
        ok("Fix-env aplicado. Reinicie o servidor para garantir que o Vite recarregue as variáveis:")
        print("  Ctrl + C")
        print("  pnpm dev")
        print()

    if not ok_any:
        err("Nada respondeu OK. Provável: servidor não está rodando na porta certa, ou rotas não existem.")
        print("Ações rápidas:")
        print("  1) pnpm dev")
        print("  2) abrir http://localhost:3001/courses")
        print("  3) se /courses der 404 → falta fallback SPA no servidor.")
    else:
        ok("O servidor está respondendo.")
        print("Se login falhar, verifique cookie no Chrome: Application → Cookies → http://localhost:3001")
        print("Se /api/auth/me ficar 401 após login, o cookie não está sendo enviado (credentials/include) ou não está sendo lido (cookie-parser / nome do cookie).")

    print("\nDica: você pode mudar a base com:")
    print("  PowerShell: $env:BASE_URL='http://localhost:3001'; python site_doctor.py\n")


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\nInterrompido.")
        sys.exit(0)
