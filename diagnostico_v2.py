#!/usr/bin/env python3
"""
Diagnóstico V2 - Problema "não visualiza página localmente"
Rode na RAIZ do projeto: python diagnostico_v2.py

O que este script faz melhor que o V1:
- Detecta pasta do frontend automaticamente (client/frontend/web ou raiz)
- Detecta porta real do Vite (não assume 5173 cegamente)
- Testa rota SPA (/courses) no frontend e identifica falta de fallback
- Verifica se frontend consegue alcançar backend (URL/proxy/CORS)
- Valida variáveis VITE_* comuns e inconsistências de SITE_URL / API
"""

import os
import sys
import re
import json
import socket
import subprocess
from datetime import datetime
from urllib.parse import urlparse

import requests


# =========================
# Pretty output
# =========================
class Colors:
    HEADER = '\033[95m'
    BLUE = '\033[94m'
    GREEN = '\033[92m'
    YELLOW = '\033[93m'
    RED = '\033[91m'
    END = '\033[0m'
    BOLD = '\033[1m'

def print_header(text):
    print(f"\n{Colors.HEADER}{Colors.BOLD}{'='*72}{Colors.END}")
    print(f"{Colors.HEADER}{Colors.BOLD} {text}{Colors.END}")
    print(f"{Colors.HEADER}{Colors.BOLD}{'='*72}{Colors.END}\n")

def ok(msg): print(f"{Colors.GREEN}✅ {msg}{Colors.END}")
def warn(msg): print(f"{Colors.YELLOW}⚠️  {msg}{Colors.END}")
def err(msg): print(f"{Colors.RED}❌ {msg}{Colors.END}")
def info(msg): print(f"{Colors.BLUE}ℹ️  {msg}{Colors.END}")

def exists(p): return os.path.exists(p)


# =========================
# Helpers
# =========================
def check_port_open(port, host="127.0.0.1"):
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    sock.settimeout(0.4)
    try:
        res = sock.connect_ex((host, port))
        return res == 0
    finally:
        sock.close()

def http_get(url, timeout=4):
    return requests.get(url, timeout=timeout, allow_redirects=True)

def read_text_file(path):
    # tenta alguns encodings comuns no Windows/BR
    encs = ["utf-8", "cp1252", "latin-1", "iso-8859-1"]
    last = None
    for e in encs:
        try:
            with open(path, "r", encoding=e) as f:
                return f.read(), e
        except Exception as ex:
            last = ex
    raise last

def parse_env_file(path):
    content, enc = read_text_file(path)
    env = {}
    for line in content.splitlines():
        s = line.strip()
        if not s or s.startswith("#"):
            continue
        # aceita KEY=VALUE (sem export)
        if s.lower().startswith("export "):
            s = s[7:].strip()
        if "=" not in s:
            continue
        k, v = s.split("=", 1)
        env[k.strip()] = v.strip().strip('"').strip("'")
    return env, enc

def find_frontend_dir():
    """
    Detecta onde está o Vite/React.
    Prioridade: client/ frontend/ web/ app/ (se tiver package.json com vite)
    Se na raiz tiver vite também, assume raiz.
    """
    candidates = ["client", "frontend", "web", "app", "."]
    for c in candidates:
        pkg = os.path.join(c, "package.json")
        if not exists(pkg):
            continue
        try:
            txt, _ = read_text_file(pkg)
            package = json.loads(txt)
        except Exception:
            continue

        deps = package.get("dependencies", {})
        dev = package.get("devDependencies", {})
        scripts = package.get("scripts", {})

        # heurística: vite aparece em deps/devDeps OU script dev chama vite
        has_vite = ("vite" in deps) or ("vite" in dev) or any("vite" in (v or "") for v in scripts.values())
        has_react = ("react" in deps) or ("react" in dev)

        if has_vite and has_react:
            return os.path.abspath(c), package
    return None, None

def try_detect_vite_port(front_dir):
    """
    1) tenta ler vite.config.* e procurar 'port:'
    2) tenta identificar via portas comuns abertas
    """
    # 1) procurar em vite.config.*
    for name in ["vite.config.ts", "vite.config.js", "vite.config.mjs", "vite.config.cjs"]:
        p = os.path.join(front_dir, name)
        if exists(p):
            try:
                txt, _ = read_text_file(p)
                m = re.search(r"port\s*:\s*(\d{2,5})", txt)
                if m:
                    return int(m.group(1)), f"extraído de {name}"
            except Exception:
                pass

    # 2) checar portas comuns do Vite
    for port in [5173, 5174, 4173, 3000, 3001]:
        if check_port_open(port):
            return port, "porta detectada aberta (heurística)"
    return None, "não foi possível detectar"

def normalize_url(u):
    if not u:
        return None
    u = u.strip()
    if u.startswith("http://") or u.startswith("https://"):
        return u.rstrip("/")
    # se vier só host:port
    if re.match(r"^[\w\.\-]+:\d+$", u):
        return f"http://{u}".rstrip("/")
    return u.rstrip("/")


# =========================
# Checks
# =========================
def check_envs():
    print_header("📄 .env (raiz) + VITE_*")
    if not exists(".env"):
        warn(".env não encontrado na raiz. Se seu backend/front dependem disso, pode quebrar local.")
        return {}

    env, enc = parse_env_file(".env")
    info(f".env lido com encoding: {enc}")
    info(f"Total de chaves encontradas: {len(env)}")

    required = ["DATABASE_URL", "GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "JWT_SECRET", "SITE_URL"]
    missing = [k for k in required if k not in env]
    if missing:
        warn(f"Variáveis backend faltando: {', '.join(missing)}")
    else:
        ok("Variáveis backend obrigatórias presentes")

    # VITE variables (frontend)
    vite_keys = [k for k in env.keys() if k.startswith("VITE_")]
    if vite_keys:
        ok(f"VITE_* encontradas: {', '.join(sorted(vite_keys)[:12])}" + (" ..." if len(vite_keys) > 12 else ""))
    else:
        warn("Nenhuma variável VITE_* encontrada no .env da raiz. Se o front depende disso, pode ficar branco.")

    # checagens comuns
    site_url = normalize_url(env.get("SITE_URL"))
    vite_app_url = normalize_url(env.get("VITE_APP_URL") or env.get("VITE_SITE_URL"))
    vite_api = normalize_url(env.get("VITE_API_URL") or env.get("VITE_BACKEND_URL") or env.get("VITE_SERVER_URL"))

    if site_url and "shadiahasan.club" in site_url.lower():
        warn(f"SITE_URL parece produção ({site_url}). Em dev, normalmente é http://localhost:5173")
    if vite_app_url and "shadiahasan.club" in vite_app_url.lower():
        warn(f"VITE_APP_URL parece produção ({vite_app_url}). Isso pode quebrar rotas locais.")
    if vite_api and "localhost" not in vite_api.lower():
        warn(f"VITE_API_URL/VITE_BACKEND_URL não parece local ({vite_api}). Isso costuma quebrar fetch em dev.")

    return env

def check_backend(base="http://localhost:3001"):
    print_header("🚀 Backend (porta 3001)")

    parsed = urlparse(base)
    host = parsed.hostname or "127.0.0.1"
    port = parsed.port or 80

    if not check_port_open(3001):
        err("Porta 3001 fechada. Backend não está rodando.")
        info("Correção: rode o backend (ex.: pnpm dev) e confirme que ele sobe em 3001.")
        return False

    endpoints = [
        "/api/trpc/health",
        "/api/trpc/courses.list",
        "/api/health",
        "/",
    ]
    ok_any = False
    for ep in endpoints:
        url = f"{base}{ep}"
        try:
            r = http_get(url, timeout=4)
            if r.status_code == 200:
                ok(f"Backend respondeu 200 em {ep}")
                ok_any = True
                # tenta indicar se é tRPC
                ct = (r.headers.get("content-type") or "").lower()
                if "application/json" in ct:
                    try:
                        j = r.json()
                        if isinstance(j, dict) and "result" in j:
                            info("Resposta JSON parece tRPC (campo result).")
                    except Exception:
                        pass
            else:
                warn(f"{ep} retornou {r.status_code}")
        except Exception as e:
            warn(f"Falha ao chamar {ep}: {e}")

    if not ok_any:
        err("Backend está na porta 3001 mas nenhum endpoint testado retornou 200.")
        info("Isso costuma indicar rota errada, servidor não subiu completo, ou middleware bloqueando.")
        return False
    return True

def check_frontend(front_dir, vite_port):
    print_header("🎨 Frontend (Vite)")

    if vite_port is None:
        err("Não consegui detectar a porta do Vite.")
        info("Abra seu terminal onde roda o pnpm dev e veja: 'Local: http://localhost:XXXX'")
        return False

    base = f"http://localhost:{vite_port}"

    if not check_port_open(vite_port):
        err(f"Porta {vite_port} fechada. Frontend não está rodando.")
        info(f"Correção: rode o frontend (pnpm dev) e confira a porta (esperado {vite_port}).")
        return False

    # 1) home
    try:
        r = http_get(base, timeout=4)
        if r.status_code != 200:
            err(f"GET / retornou {r.status_code} em {base}")
            return False
        ok(f"GET / OK ({base})")

        html = r.text.lower()
        if "/@vite/client" in html or "vite" in html:
            ok("HTML indica Vite (/@vite/client encontrado).")
        else:
            warn("HTML não parece Vite. Pode estar servindo outra coisa/proxy estranho.")
    except Exception as e:
        err(f"Falha ao abrir {base}: {e}")
        return False

    # 2) rota SPA
    try:
        r2 = http_get(f"{base}/courses", timeout=4)
        if r2.status_code == 200:
            ok("GET /courses retornou 200 (roteamento SPA ok).")
        elif r2.status_code == 404:
            err("GET /courses retornou 404 → provável falta de fallback do React Router.")
            info("Correção típica (Vite): usar BrowserRouter + configurar server para fallback index.html (em preview/prod).")
            info("Em dev do Vite normalmente isso não acontece; se acontece, pode ser que NÃO seja Vite dev, e sim outro servidor.")
        else:
            warn(f"GET /courses retornou {r2.status_code}")
    except Exception as e:
        warn(f"Falha ao testar /courses: {e}")

    # 3) checar se assets básicos do vite respondem
    try:
        r3 = http_get(f"{base}/@vite/client", timeout=4)
        if r3.status_code == 200:
            ok("GET /@vite/client OK (Vite client servindo).")
        else:
            warn(f"GET /@vite/client retornou {r3.status_code} (estranho para Vite dev).")
    except Exception as e:
        warn(f"Falha ao testar /@vite/client: {e}")

    # 4) sugerir proxy se front não “enxerga” backend
    # (não dá pra ver console do browser daqui, mas dá pra inferir config)
    vite_cfg_paths = [os.path.join(front_dir, n) for n in ["vite.config.ts", "vite.config.js", "vite.config.mjs", "vite.config.cjs"]]
    cfg_found = next((p for p in vite_cfg_paths if exists(p)), None)
    if cfg_found:
        try:
            txt, _ = read_text_file(cfg_found)
            if "proxy" in txt and "/api" in txt:
                ok(f"vite.config tem proxy (aparentemente). ({os.path.basename(cfg_found)})")
            else:
                warn(f"vite.config encontrado mas não vi proxy claro para /api. ({os.path.basename(cfg_found)})")
                info("Se o front chama /api/... e o backend está em 3001, configure proxy no Vite.")
        except Exception:
            pass
    else:
        warn("Não encontrei vite.config.* no frontend. Se o app depende de proxy, isso pode ser o motivo.")

    return True

def suggest_fixes(env, front_dir, vite_port, backend_ok):
    print_header("🛠️ Correções objetivas (as mais prováveis)")

    # 1) API URL/proxy
    vite_api = normalize_url(env.get("VITE_API_URL") or env.get("VITE_BACKEND_URL") or env.get("VITE_SERVER_URL") or "")
    if vite_api and "localhost" not in vite_api.lower():
        err("Seu frontend parece apontar API para produção (VITE_API_URL/VITE_BACKEND_URL).")
        info("Fix rápido (dev): coloque VITE_API_URL=http://localhost:3001 no .env (ou use proxy do Vite).")

    # 2) SITE_URL
    site_url = normalize_url(env.get("SITE_URL") or "")
    if site_url and "localhost" not in site_url.lower():
        warn("SITE_URL parece produção. Isso pode afetar callbacks, redirects e links.")
        info("Fix dev: SITE_URL=http://localhost:5173 (ou a porta real do Vite).")

    # 3) Porta do Vite
    if vite_port and vite_port != 5173:
        warn(f"Seu Vite não está em 5173 e sim em {vite_port}.")
        info(f"Acesse: http://localhost:{vite_port} (e atualize VITE_APP_URL / SITE_URL se necessário).")

    # 4) Quando backend está ok mas front “não carrega dados”
    if backend_ok:
        info("Se a página abre mas NÃO carrega dados (ex.: cursos vazios), o problema costuma ser:")
        print("  - Front chamando API errada (produção) OU")
        print("  - CORS bloqueando (backend não permite origin do Vite) OU")
        print("  - Proxy do Vite ausente (/api -> http://localhost:3001)")

        print("\nProxy exemplo (vite.config.ts):")
        print("""
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': 'http://localhost:3001',
    },
  },
})
""".strip())

    # 5) Rota SPA / fallback (preview/prod)
    info("Se /courses dá 404 quando você abre direto no navegador:")
    print("  - Em DEV (Vite), geralmente NÃO deveria. Se acontece, você pode estar servindo build via outro server sem fallback.")
    print("  - Em PROD/preview, configure fallback para index.html (Nginx/Node/Render)")

def main():
    print_header("🔍 Diagnóstico V2 - Local não visualiza página")
    print(f"📂 Diretório: {os.getcwd()}")
    print(f"🕐 {datetime.now().strftime('%d/%m/%Y %H:%M:%S')}")
    print(f"🐍 Python: {sys.version.split()[0]} | 💻 {sys.platform}")

    # env
    env = check_envs()

    # frontend dir
    print_header("🧭 Detectando frontend")
    front_dir, pkg = find_frontend_dir()
    if not front_dir:
        err("Não consegui detectar o frontend (Vite+React) em client/frontend/web/raiz.")
        info("Dica: me diga sua estrutura de pastas (ls/dir) e onde roda o pnpm dev do front.")
        front_dir = os.getcwd()
    else:
        ok(f"Frontend detectado em: {front_dir}")
        scripts = (pkg or {}).get("scripts", {})
        if scripts.get("dev"):
            info(f"Script dev: {scripts['dev']}")

    vite_port, why = try_detect_vite_port(front_dir)
    info(f"Porta Vite: {vite_port} ({why})")

    backend_ok = check_backend("http://localhost:3001")
    frontend_ok = check_frontend(front_dir, vite_port)

    suggest_fixes(env, front_dir, vite_port, backend_ok)

    print_header("📌 Próximo passo (o que você me manda aqui)")
    print("1) Cole o PRINT do terminal onde você roda o front: a parte que mostra 'Local: http://localhost:XXXX'")
    print("2) Cole o erro do Console do navegador (F12 → Console) quando abre a página (principalmente em /courses)")
    print("3) Cole seu vite.config.ts (se existir) e o trecho do código onde faz fetch da API")

    print_header("🏁 Fim")

if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        warn("Interrompido pelo usuário")
        sys.exit(0)
    except Exception as e:
        err(f"Erro inesperado: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)