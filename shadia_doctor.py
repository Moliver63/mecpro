#!/usr/bin/env python3
"""
╔══════════════════════════════════════════════════════════════════════════════╗
║         SHADIA DOCTOR v2.3  —  Auditoria + Diagnóstico + Autofix            ║
║     Stack: React 19 + Wouter + tRPC 11 + Drizzle + MySQL  |  2026           ║
╚══════════════════════════════════════════════════════════════════════════════╝

MODO AUDITORIA (padrão — leitura, zero escrita):
  python shadia_doctor.py --root /caminho/do/projeto

MODO AUTOFIX (--apply grava alterações, cria backups):
  python shadia_doctor.py --root . --apply --fix-all
  python shadia_doctor.py --root . --apply --fix-links --fix-routes
  python shadia_doctor.py --root . --dry-run --fix-all  (mostra diff sem gravar)

FLAGS DE FIX:
  --fix-all            Ativa todos os fixers abaixo
  --fix-links          Corrige href/navigate/setLocation quebrados
  --fix-routes         Adiciona rotas ausentes no App.tsx / Switch
  --fix-oauth          Substitui /api/auth/* por chamadas via trpc.auth.*
  --fix-console        Comenta console.log de produção
  --create-stubs       Cria páginas TSX stub para rotas sem arquivo

SAÍDA:
  <out>/shadia_audit.json   — dados completos em JSON
  <out>/shadia_report.html  — relatório interativo premium

Uso com Render.com:
  Adicione este script no repo e rode no CI antes do build:
  python shadia_doctor.py --root . --fail-on-critical
"""

from __future__ import annotations

import argparse, datetime, difflib, json, re, shutil, sys
from dataclasses import dataclass, field, asdict
from pathlib import Path
from typing import Dict, List, Optional, Set, Tuple

# ═══════════════════════════════ CONFIG ═══════════════════════════════════════

SKIP_DIRS: Set[str] = {
    "node_modules", "dist", "build", ".git", ".turbo", ".next",
    ".vite", ".cache", ".pnpm", ".repo_doctor", ".doctor_backups",
    "nav_audit", "super_audit", "shadia_out", "__pycache__",
}

PAGE_GLOBS     = ["client/src/pages/**/*.tsx", "src/pages/**/*.tsx"]
FRONTEND_GLOBS = ["client/src/**/*.ts", "client/src/**/*.tsx",
                  "src/**/*.ts",         "src/**/*.tsx"]
BACKEND_GLOBS  = ["server/**/*.ts", "server/**/*.tsx", "routers/**/*.ts"]
SCHEMA_GLOBS   = ["drizzle/**/*.ts", "db/schema.ts", "server/schema.ts"]
APP_HINTS      = ["client/src/App.tsx", "src/App.tsx",
                  "client/src/router.tsx", "src/router.tsx",
                  "client/src/routes.tsx", "src/routes.tsx"]

# Rotas públicas esperadas pela plataforma (para checar ausências)
EXPECTED_PUBLIC_ROUTES = {
    "/", "/courses", "/about", "/contact", "/community",
    "/login", "/signup", "/pricing", "/faq", "/terms", "/privacy",
    "/forgot-password", "/reset-password",
}
EXPECTED_AUTH_ROUTES = {
    "/dashboard", "/my-courses", "/profile", "/edit-profile",
    "/my-subscription", "/certificates", "/messages", "/settings",
}
EXPECTED_ADMIN_ROUTES = {
    "/admin", "/admin/courses", "/admin/users", "/admin/lessons",
    "/admin/appointments", "/admin/financeiro", "/admin/programs",
}

# ════════════════════════════ REGEX PATTERNS ══════════════════════════════════
#
# PROBLEMA IDENTIFICADO: O App.tsx usa path={"/"} — chaves JSX em volta da string.
# Todos os padrões abaixo suportam as três formas:
#   path="/x"        → aspas duplas diretas
#   path='/x'        → aspas simples diretas
#   path={"/x"}      → JSX expression com aspas duplas  ← era ignorado!
#   path={'/x'}      → JSX expression com aspas simples ← era ignorado!
#
# Helper: captura o valor de path em qualquer das 4 formas
# Grupo 1 = o path sem aspas nem chaves
_P = r'''path\s*=\s*(?:["\']([^"\']+)["\']|\{["\']([^"\']+)["\']\})'''

# ── Rotas — bloco completo <Route ...> ou <ProtectedRoute ...> ──
# Captura qualquer tag que comece com Route ou ProtectedRoute (multi-linha, até 500 chars)
R_ROUTE_BLOCK  = re.compile(r'<(?:Route|ProtectedRoute)\b(.{0,500}?)(?:/>|>(?!\s*\S))', re.M|re.S)
# Para blocos que fecham com > seguido de conteúdo (child routes), versão mais simples
R_ROUTE_OPEN   = re.compile(r'<(?:Route|ProtectedRoute)\b(.{0,500}?)>', re.M|re.S)

# Path em qualquer forma (usado em scan_routes E debug)
R_PATH_ANY     = re.compile(_P, re.M)

# Componente no atributo component={...}
R_COMP_ATTR    = re.compile(r'component\s*=\s*\{([A-Za-z][A-Za-z0-9_.]*)\}', re.M)
# Elemento React Router v6: element={<Comp />}
R_ELEM_ATTR    = re.compile(r'element\s*=\s*\{?\s*<([A-Za-z][A-Za-z0-9_]*)', re.M|re.S)

# Padrão de detecção rápida para debug (captura path="x" ou path={"x"})
R_PATH_DIRECT  = re.compile(_P, re.M)

# path standalone em arrays/objetos de rotas: { path: "/x", ... }
R_ROUTE_OBJ    = re.compile(r'''["\']path["\']\s*:\s*["\']([^"\']+)["\']''', re.M)

# useRoute hook
R_USE_ROUTE    = re.compile(r'useRoute\(\s*["\']([^"\']+)["\']\s*\)', re.M)

R_SWITCH       = re.compile(r'<Switch\b', re.M)

# ── Links / Navegação — também suportam href={"/..."} ──
# href="/x"  OU  href={"/x"}
_H = r'''href\s*=\s*(?:["\']([^"\']+)["\']|\{["\']([^"\']+)["\']\})'''
R_WLINK      = re.compile(r'<Link\b[^>]{0,200}?' + _H,      re.M|re.S)
R_ANCHOR     = re.compile(r'<a\b[^>]{0,200}?' + _H,         re.M|re.S)
R_SETLOC     = re.compile(r'setLocation\(\s*["\']([^"\']+)["\']\s*\)',  re.M)
R_NAVIGATE   = re.compile(r'\bnavigate\(\s*["\']([^"\']+)["\']\s*\)',   re.M)
R_PUSH       = re.compile(r'\.push\(\s*["\']([^"\']+)["\']\s*\)',        re.M)
R_HREF_ASSIGN= re.compile(r'(?:location\.href|window\.location)\s*=\s*["\']([^"\']+)["\']', re.M)

# ── tRPC ──
R_TRPC_USE   = re.compile(r'trpc\.([A-Za-z_]\w*)\.([A-Za-z_]\w*)\.(?:useQuery|useMutation|useSubscription|useSuspenseQuery|useInfiniteQuery|mutate(?:Async)?|query)', re.M)
R_TRPC_UTILS = re.compile(r'trpc\.([A-Za-z_]\w*)\.([A-Za-z_]\w*)\.(?:invalidate|refetch|setData|cancel)',                               re.M)
R_TRPC_NS    = re.compile(r'([A-Za-z_]\w*)\s*:\s*(?:router|createRouter)\s*\(\s*\{',                                                    re.M)
R_TRPC_PROC  = re.compile(r'([A-Za-z_]\w*)\s*:\s*(publicProcedure|protectedProcedure|adminProcedure|procedure)\b',                      re.M)

# ── Schema ──
R_TABLE      = re.compile(r'export\s+const\s+([A-Za-z_]\w*)\s*=\s*(?:mysqlTable|pgTable|sqliteTable|table)\s*\(\s*["\']([^"\']+)["\']', re.M)

# ── Segurança ──
R_LOCALHOST  = re.compile(r'\b(localhost|127\.0\.0\.1)\b|:(3001|5173|4000|8080)\b')
R_HARDCODE_K = re.compile(r'(?:apiKey|api_key|secret|password|token)\s*[:=]\s*["\'][A-Za-z0-9_\-\.]{10,}["\']', re.I)
R_HARDCODE_U = re.compile(r'(?:fetch|axios\.get|axios\.post)\s*\(\s*["\'](\bhttps?://(?!shadiahasan)[^"\']+)["\']', re.M)
R_OPEN_REDIR = re.compile(r'(?:redirect|location\.href|res\.redirect)\s*\([^)]*\bnext\b', re.I)
R_DIRECT_OAUTH_UI = re.compile(r'["\'](?:/api/auth/(?:google|apple)[^"\']*)["\']', re.I)

# ── Qualidade ──
R_TODO       = re.compile(r'//\s*(?:TODO|FIXME|HACK|XXX|BUG)\b', re.I)
R_CONSOLE    = re.compile(r'\bconsole\.log\s*\(')
R_UNUSED_IMP = re.compile(r"^import\s+\{([^}]+)\}\s+from\s+['\"]([^'\"]+)['\"]", re.M)

# ── Google OAuth ──
R_GOOGLE_CLIENT = re.compile(r'(?:GOOGLE_CLIENT_ID|googleClientId|client_id.*google)', re.I)
R_GOOGLE_CB_URL = re.compile(r'(?:callbackURL|redirect_uri|GOOGLE_CALLBACK_URL)', re.I)

# ════════════════════════════ DATA CLASSES ════════════════════════════════════

@dataclass
class Issue:
    severity: str        # CRITICAL | WARNING | INFO
    category: str        # Navigation | tRPC-Alignment | Security | CodeQuality | Auth | Config
    file: str
    line: int
    title: str
    detail: str
    fix_hint: str = ""   # instrução concreta de como resolver

@dataclass
class RouteFinding:
    file: str
    path: str
    component: Optional[str]
    zone: str            # PUBLIC | AUTH | ADMIN
    source: str

@dataclass
class LinkFinding:
    file: str
    href: str
    kind: str
    line: int
    zone_guess: str
    is_broken: bool = False

@dataclass
class TrpcProc:
    namespace: str
    name: str
    kind: str
    file: str
    line: int

@dataclass
class TrpcUsage:
    namespace: str
    name: str
    file: str
    line: int
    method: str

@dataclass
class DbTable:
    var_name: str
    table_name: str
    file: str

@dataclass
class Fix:
    file: str
    kind: str
    before: str
    after: str
    note: str

# ═══════════════════════════════ HELPERS ══════════════════════════════════════

def now_tag() -> str:
    return datetime.datetime.now().strftime("%Y%m%d_%H%M%S")

def iter_files(root: Path, globs: List[str]) -> List[Path]:
    seen: Set[Path] = set()
    for gp in globs:
        for p in root.glob(gp):
            if p.is_file() and not any(d in SKIP_DIRS for d in p.parts):
                seen.add(p)
    return sorted(seen)

def read(p: Path) -> str:
    return p.read_text(encoding="utf-8", errors="ignore")

def write(p: Path, s: str) -> None:
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(s, encoding="utf-8", newline="\n")

def backup(p: Path, bdir: Path) -> None:
    bdir.mkdir(parents=True, exist_ok=True)
    dst = bdir / p.as_posix().replace("/", "__")
    shutil.copy2(p, dst)

def relp(p: Path, root: Path) -> str:
    return str(p.relative_to(root)).replace("\\", "/")

def lineno(text: str, idx: int) -> int:
    return text.count("\n", 0, idx) + 1

def norm_path(p: str) -> str:
    if not p:
        return ""
    p = p.split("#", 1)[0].split("?", 1)[0].strip()
    if p in ("*", "/*", ""):
        return ""
    if p.startswith("/") and p != "/" and p.endswith("/"):
        p = p[:-1]
    return p

def is_external(href: str) -> bool:
    return href.startswith(("http://", "https://", "mailto:", "tel:", "//"))

def classify_zone(path: str) -> str:
    if "/admin" in path:
        return "ADMIN"
    if any(s in path for s in ("/dashboard", "/profile", "/settings",
                                "/account", "/my-", "/edit-", "/messages",
                                "/certificates", "/my-subscription")):
        return "AUTH"
    return "PUBLIC"

def path_matches(href: str, routes: Set[str]) -> bool:
    norm = norm_path(href)
    if not norm or norm == "/":
        return True
    if norm in routes:
        return True
    for r in routes:
        if ":" in r or "*" in r:
            rp, hp = r.split("/"), norm.split("/")
            if len(rp) == len(hp) and all(
                rpart.startswith(":") or rpart == hpart
                for rpart, hpart in zip(rp, hp)
            ):
                return True
    return False

def kebab(s: str) -> str:
    s = re.sub(r"([a-z0-9])([A-Z])", r"\1-\2", s).replace("_", "-")
    s = re.sub(r"[^a-zA-Z0-9\-]+", "-", s)
    return re.sub(r"-{2,}", "-", s).strip("-").lower()

def stem_to_route(stem: str) -> str:
    low = stem.lower()
    if low in ("home", "index"):
        return "/"
    known = {
        "about": "/about", "courses": "/courses", "contact": "/contact",
        "community": "/community", "pricing": "/pricing", "login": "/login",
        "signup": "/signup", "admin": "/admin", "dashboard": "/dashboard",
        "profile": "/profile", "faq": "/faq", "terms": "/terms",
        "privacy": "/privacy", "mycourses": "/my-courses",
        "mysubscription": "/my-subscription", "editprofile": "/edit-profile",
        "mycertificates": "/certificates", "messages": "/messages",
        "forgotpassword": "/forgot-password", "resetpassword": "/reset-password",
        "lesssonview": "/lesson/:id", "lessonview": "/lesson/:id",
        "coursedetail": "/courses/:slug",
    }
    return known.get(low, "/" + kebab(stem))

# ════════════════════════════════ SCANNERS ════════════════════════════════════

def _extract_path(block: str) -> Optional[str]:
    """Extrai o valor do path de um bloco de atributos JSX.
    Suporta: path="/x"  path='/x'  path={"/x"}  path={'/x'}  path={`/x`}
    """
    m = R_PATH_ANY.search(block)
    if m:
        return m.group(1) or m.group(2)  # grupo 1 = aspas diretas, grupo 2 = dentro de {}
    # template literal: path={`/x`}
    m2 = re.search(r'path\s*=\s*\{`([^`]+)`\}', block)
    if m2:
        return m2.group(1)
    return None


def scan_routes(files: List[Path], root: Path) -> List[RouteFinding]:
    """
    Detector de rotas robusto.
    Suporta todas as variantes do App.tsx:
      <Route path={"/"} component={Home} />          ← JSX expression (era ignorado!)
      <Route path="/x" component={Home} />            ← aspas diretas
      <ProtectedRoute path={"/x"} component={C} />   ← ProtectedRoute
      <Route path={"/courses/:slug"} component={C} /> ← parâmetros dinâmicos
    """
    routes: List[RouteFinding] = []
    seen: Set[Tuple] = set()

    def add(path: str, comp: Optional[str], fr: str, src: str):
        path = norm_path(path)
        if not path:
            return
        if re.search(r'^\$\{|^\{|^#|^http', path):
            return
        comp = (comp or "").strip()
        comp = re.sub(r'[<>/\s].*$', '', comp).strip()
        key  = (path, comp)
        if key in seen:
            return
        seen.add(key)
        routes.append(RouteFinding(fr, path, comp or None, classify_zone(path), src))

    for f in files:
        txt = read(f)
        fr  = relp(f, root)

        # ── Estratégia principal: blocos <Route> e <ProtectedRoute> ──
        # Usamos R_ROUTE_OPEN que captura até o '>' de fechamento da tag de abertura
        for m in R_ROUTE_OPEN.finditer(txt):
            block = m.group(1)

            p_val = _extract_path(block)
            if not p_val:
                continue

            # Extrair componente (component={X} ou element={<X />})
            comp_val: Optional[str] = None
            cm = R_COMP_ATTR.search(block)
            if cm:
                comp_val = cm.group(1)
            else:
                em = R_ELEM_ATTR.search(block)
                if em:
                    comp_val = em.group(1)
                else:
                    rp = re.search(r'\{[^}]*=>\s*<([A-Za-z][A-Za-z0-9_]*)', block)
                    if rp:
                        comp_val = rp.group(1)

            add(p_val, comp_val, fr, "Route-block")

        # ── Estratégia 2: arrays/objetos de rotas { path: "/x" } ──
        for m in R_ROUTE_OBJ.finditer(txt):
            add(m.group(1), None, fr, "route-object")

        # ── Estratégia 3: useRoute("/x") ──
        for m in R_USE_ROUTE.finditer(txt):
            add(m.group(1), None, fr, "useRoute")

    return routes


def _extract_href(m: re.Match) -> Optional[str]:
    """Extrai href de match que pode ter grupo 1 (aspas diretas) OU grupo 2 (dentro de {})."""
    try:
        v = m.group(1) or m.group(2)
        return v.strip() if v else None
    except IndexError:
        return m.group(1).strip() if m.group(1) else None


def scan_links(files: List[Path], root: Path, routes: Set[str]
               ) -> Tuple[List[LinkFinding], List[LinkFinding]]:
    internal: List[LinkFinding] = []
    broken:   List[LinkFinding] = []
    SKIP_PREFIXES = ("/api", "/assets", "/favicon", "/public", "/static",
                     "/uploads", "/images", "/fonts")

    # R_WLINK e R_ANCHOR têm 2 grupos (aspas diretas + JSX expression)
    # R_SETLOC, R_NAVIGATE, R_PUSH, R_HREF_ASSIGN têm 1 grupo
    patterns = [
        (R_WLINK,       "Link",          True),   # True = tem grupo duplo (href={"/..."})
        (R_ANCHOR,      "<a>",           True),
        (R_SETLOC,      "setLocation",   False),
        (R_NAVIGATE,    "navigate",      False),
        (R_PUSH,        "push",          False),
        (R_HREF_ASSIGN, "location.href", False),
    ]
    for f in files:
        txt = read(f)
        fr  = relp(f, root)
        zg  = "ADMIN" if "/admin" in fr.lower() else "PUBLIC"
        for rx, kind, dual_group in patterns:
            for m in rx.finditer(txt):
                href = (_extract_href(m) if dual_group else m.group(1).strip()) or ""
                if not href or href.startswith(("#", "data:", "javascript:")):
                    continue
                ln = lineno(txt, m.start())
                if is_external(href):
                    continue
                if href.startswith("/"):
                    if any(href.startswith(p) for p in SKIP_PREFIXES):
                        continue
                    lf = LinkFinding(fr, href, kind, ln, zg)
                    internal.append(lf)
                    if not path_matches(href, routes):
                        lf.is_broken = True
                        broken.append(lf)
    return internal, broken


def scan_trpc_backend(files: List[Path], root: Path) -> List[TrpcProc]:
    procs: List[TrpcProc] = []
    kind_map = {
        "publicProcedure": "public", "protectedProcedure": "protected",
        "adminProcedure": "admin", "procedure": "unknown",
    }
    for f in files:
        txt   = read(f)
        fr    = relp(f, root)
        lines = txt.split("\n")
        ns_stack: List[str] = []
        for i, line in enumerate(lines, 1):
            nm = re.search(r'([A-Za-z_]\w*)\s*:\s*(?:router|createRouter)\s*\(', line)
            if nm:
                ns_stack.append(nm.group(1))
            pm = R_TRPC_PROC.search(line)
            if pm:
                procs.append(TrpcProc(
                    ns_stack[-1] if ns_stack else "__root__",
                    pm.group(1), kind_map.get(pm.group(2), "unknown"), fr, i
                ))
            if line.strip() in ("}),", "})", "},") and ns_stack:
                ns_stack.pop()
    return procs


def scan_trpc_frontend(files: List[Path], root: Path) -> List[TrpcUsage]:
    usages: List[TrpcUsage] = []
    seen: Set[Tuple] = set()
    for f in files:
        txt = read(f)
        fr  = relp(f, root)
        for rx in (R_TRPC_USE, R_TRPC_UTILS):
            for m in rx.finditer(txt):
                ns, name = m.group(1), m.group(2)
                ln = lineno(txt, m.start())
                method = m.group(0).split(".")[-1]
                key = (ns, name, fr)
                if key not in seen:
                    seen.add(key)
                    usages.append(TrpcUsage(ns, name, fr, ln, method))
    return usages


def scan_schema(files: List[Path], root: Path) -> List[DbTable]:
    tables: List[DbTable] = []
    for f in files:
        txt = read(f)
        fr  = relp(f, root)
        for m in R_TABLE.finditer(txt):
            tables.append(DbTable(m.group(1), m.group(2), fr))
    return tables


def scan_security(files: List[Path], root: Path) -> List[Issue]:
    issues: List[Issue] = []
    for f in files:
        txt = read(f)
        fr  = relp(f, root)
        for m in R_LOCALHOST.finditer(txt):
            ln = lineno(txt, m.start())
            snippet = txt[max(0,m.start()-40):m.start()+80].replace("\n"," ").strip()
            issues.append(Issue("WARNING","Security",fr,ln,
                "Hardcoded localhost/port detectado",
                f"`{snippet[:100]}`",
                "Substitua por variável de ambiente: process.env.VITE_API_URL ou similar"))
        for m in R_HARDCODE_K.finditer(txt):
            ln = lineno(txt, m.start())
            raw = re.sub(r'["\']\S+["\']', '"***"', m.group(0))
            issues.append(Issue("CRITICAL","Security",fr,ln,
                "Chave/segredo hardcoded no código",
                f"`{raw}`",
                "Mova para variável de ambiente (.env). NUNCA commite secrets no Git."))
        for m in R_HARDCODE_U.finditer(txt):
            ln = lineno(txt, m.start())
            issues.append(Issue("WARNING","Security",fr,ln,
                "URL de API externa hardcoded",
                f"URL: `{m.group(1)[:80]}`",
                "Use variável de ambiente: const API = import.meta.env.VITE_API_URL"))
        for m in R_OPEN_REDIR.finditer(txt):
            ln = lineno(txt, m.start())
            issues.append(Issue("CRITICAL","Security",fr,ln,
                "Possível Open Redirect via parâmetro `next`",
                txt[max(0,m.start()-30):m.start()+100].replace("\n"," ").strip()[:120],
                "Valide e sanitize o valor de `next` antes de redirecionar"))
        for m in R_DIRECT_OAUTH_UI.finditer(txt):
            ln = lineno(txt, m.start())
            issues.append(Issue("WARNING","Auth",fr,ln,
                "Link direto para /api/auth/* no frontend",
                f"Encontrado: `{m.group(0)}`",
                "Use trpc.auth.loginWithGoogle.mutate() em vez de link direto. "
                "Isso quebra o login OAuth no Render.com e em produção."))
    return issues


def scan_auth_config(root: Path) -> List[Issue]:
    """Verifica configurações específicas do OAuth/Google Login."""
    issues: List[Issue] = []

    # Checar .env.example ou .env para variáveis do Google OAuth
    env_files = list(root.glob(".env*"))
    env_text = "\n".join(read(f) for f in env_files if f.is_file())

    has_google_id  = bool(re.search(r'GOOGLE_CLIENT_ID\s*=\s*\S+', env_text))
    has_google_sec = bool(re.search(r'GOOGLE_CLIENT_SECRET\s*=\s*\S+', env_text))
    has_callback   = bool(re.search(r'GOOGLE_CALLBACK_URL\s*=\s*\S+', env_text))
    has_session_sec= bool(re.search(r'SESSION_SECRET\s*=\s*\S+', env_text))

    if not has_google_id:
        issues.append(Issue("CRITICAL","Auth","<env>",0,
            "GOOGLE_CLIENT_ID não encontrado no .env",
            "Variável ausente ou vazia",
            "Adicione no .env: GOOGLE_CLIENT_ID=seu_client_id.apps.googleusercontent.com\n"
            "Obtenha em: https://console.cloud.google.com/apis/credentials"))
    if not has_google_sec:
        issues.append(Issue("CRITICAL","Auth","<env>",0,
            "GOOGLE_CLIENT_SECRET não encontrado no .env",
            "Variável ausente ou vazia",
            "Adicione no .env: GOOGLE_CLIENT_SECRET=seu_secret\n"
            "No Google Cloud Console → Credenciais → OAuth 2.0 Client IDs"))
    if not has_callback:
        issues.append(Issue("WARNING","Auth","<env>",0,
            "GOOGLE_CALLBACK_URL não configurado",
            "Sem URL de callback OAuth definida",
            "Para desenvolvimento: GOOGLE_CALLBACK_URL=http://localhost:5000/api/auth/google/callback\n"
            "Para produção (Render.com): GOOGLE_CALLBACK_URL=https://shadiahasan.club/api/auth/google/callback\n"
            "⚠️  Cadastre AMBAS as URLs no Google Cloud Console → Authorized redirect URIs"))
    if not has_session_sec:
        issues.append(Issue("WARNING","Auth","<env>",0,
            "SESSION_SECRET não configurado",
            "Sessions inseguras sem secret",
            "Gere um secret seguro: node -e \"console.log(require('crypto').randomBytes(64).toString('hex'))\""))

    # Checar configuração do servidor OAuth
    oauth_files = iter_files(root, ["server/_core/oauth.ts", "server/oauth.ts",
                                     "server/**/*oauth*.ts", "server/**/*auth*.ts"])
    for f in oauth_files:
        txt = read(f)
        fr  = relp(f, root)
        # Verificar se callback URL está hardcoded
        if re.search(r'localhost.*callback|callback.*localhost', txt, re.I):
            ln = lineno(txt, txt.lower().find("localhost"))
            issues.append(Issue("CRITICAL","Auth",fr,ln,
                "Callback URL do OAuth hardcoded com localhost",
                "Em produção (Render.com) isso vai quebrar o login com Google",
                "Use: callbackURL: process.env.GOOGLE_CALLBACK_URL\n"
                "NUNCA hardcode localhost em configuração OAuth."))
        # Verificar se existe tratamento de erro no callback
        if "google" in txt.lower() and "catch" not in txt.lower():
            issues.append(Issue("WARNING","Auth",fr,0,
                "OAuth handler sem tratamento de erro (catch)",
                "Erros de autenticação podem travar o servidor silenciosamente",
                "Adicione try/catch em todas as rotas OAuth e trate falhas com redirect."))

    # Checar Render.com — variáveis necessárias
    render_yaml = root / "render.yaml"
    if render_yaml.exists():
        ry = read(render_yaml)
        for var in ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "DATABASE_URL", "SESSION_SECRET"]:
            if var not in ry:
                issues.append(Issue("WARNING","Config","render.yaml",0,
                    f"Variável `{var}` não está no render.yaml",
                    "Pode causar falha no deploy em produção",
                    f"Adicione em render.yaml → envVars: - key: {var}\n"
                    "Ou configure manualmente no dashboard do Render.com"))

    return issues


def scan_code_quality(files: List[Path], root: Path) -> List[Issue]:
    issues: List[Issue] = []
    for f in files:
        txt = read(f)
        fr  = relp(f, root)
        for m in R_TODO.finditer(txt):
            ln = lineno(txt, m.start())
            snippet = txt[m.start():m.start()+80].replace("\n"," ").strip()
            issues.append(Issue("INFO","CodeQuality",fr,ln,
                "TODO/FIXME pendente", f"`{snippet}`", "Resolva antes do deploy em produção"))
        count_cl = len(R_CONSOLE.findall(txt))
        if count_cl > 3:
            issues.append(Issue("INFO","CodeQuality",fr,0,
                f"Muitos console.log ({count_cl})",
                "Logs de debug no código de produção",
                f"Remova ou substitua por logger: grep -n 'console.log' {fr}"))
    return issues


def scan_missing_routes(
    route_paths: Set[str],
    pages: Dict[str, str]   # {stem: relative_file}
) -> Tuple[List[str], List[str]]:
    """Retorna (rotas_esperadas_faltando, páginas_sem_rota)."""
    all_expected = EXPECTED_PUBLIC_ROUTES | EXPECTED_AUTH_ROUTES | EXPECTED_ADMIN_ROUTES
    missing_routes = sorted(all_expected - route_paths - {"/"})

    orphan_pages = []
    for stem, fpath in pages.items():
        guess = stem_to_route(stem)
        if not path_matches(guess, route_paths):
            orphan_pages.append(fpath)

    return missing_routes, orphan_pages


# ════════════════════════════ ANÁLISE tRPC ════════════════════════════════════

def analyze_trpc(
    backend: List[TrpcProc],
    frontend: List[TrpcUsage],
) -> Tuple[List[Issue], List[Dict], List[Dict]]:
    issues: List[Issue] = []
    bmap = {(p.namespace, p.name): p for p in backend}
    fmap: Dict[Tuple, List[TrpcUsage]] = {}
    for u in frontend:
        fmap.setdefault((u.namespace, u.name), []).append(u)

    ghost: List[Dict] = []
    for (ns, name), usgs in fmap.items():
        if (ns, name) not in bmap:
            for u in usgs:
                issues.append(Issue("CRITICAL","tRPC-Alignment",u.file,u.line,
                    f"Ghost call: trpc.{ns}.{name} não existe no backend",
                    f"Método: `{u.method}` — vai dar erro 500 em runtime",
                    f"Crie a procedure no server/routers.ts:\n"
                    f"  {ns}: router({{\n"
                    f"    {name}: protectedProcedure.query(async ({{ctx}}) => {{...}}),\n  }})"))
                ghost.append({"ns": ns, "name": name, "file": u.file, "line": u.line})

    dead: List[Dict] = []
    fkeys = set(fmap.keys())
    for p in backend:
        if (p.namespace, p.name) not in fkeys:
            dead.append({"ns": p.namespace, "name": p.name, "file": p.file, "line": p.line})

    return issues, ghost, dead


# ════════════════════════════ ROOT CAUSE ANALYSIS ═════════════════════════════

def diagnose_root_causes(
    route_paths: Set[str],
    app_file: Optional[Path],
    root: Path,
) -> List[Issue]:
    """Diagnóstico de causas raiz — especialmente por que 0 rotas foram detectadas."""
    issues: List[Issue] = []

    if not app_file:
        issues.append(Issue("CRITICAL","Config","<projeto>",0,
            "App.tsx / arquivo de rotas NÃO ENCONTRADO",
            "O script não conseguiu localizar client/src/App.tsx",
            "Verifique se o arquivo existe. Se o projeto tem estrutura diferente,\n"
            "passe a raiz correta: python shadia_doctor.py --root /caminho/certo\n"
            "O App.tsx deve ter: import { Switch, Route } from 'wouter';"))
        return issues

    txt = read(app_file)
    fr  = relp(app_file, root)

    has_switch   = bool(R_SWITCH.search(txt))
    has_route    = bool(re.search(r'<(?:Route|ProtectedRoute)\b', txt))
    has_path     = bool(R_PATH_ANY.search(txt))
    has_wouter   = "wouter" in txt.lower()
    has_rr       = "react-router" in txt.lower()
    # Extrair raw_paths com o novo regex (suporta aspas diretas E JSX expression)
    raw_paths    = [m.group(1) or m.group(2) for m in R_PATH_ANY.finditer(txt)
                    if (m.group(1) or m.group(2) or "").startswith("/")]

    if not has_route and not has_path:
        issues.append(Issue("CRITICAL","Navigation",fr,0,
            "App.tsx não tem NENHUMA rota definida (<Route> ou path='/')",
            f"Arquivo encontrado: {fr} | Wouter: {has_wouter} | ReactRouter: {has_rr} | Switch: {has_switch}",
            "Adicione rotas no App.tsx:\n"
            "  import { Switch, Route } from 'wouter';\n"
            "  <Switch>\n"
            "    <Route path='/' component={Home} />\n"
            "    <Route path='/courses' component={Courses} />\n"
            "  </Switch>"))
    elif has_route and not has_switch and has_wouter:
        issues.append(Issue("WARNING","Navigation",fr,0,
            "App.tsx tem <Route> mas SEM <Switch>",
            "Com Wouter, sem <Switch> todas as rotas que casam são renderizadas simultaneamente",
            "Envolva as rotas em <Switch>:\n"
            "  import { Switch, Route } from 'wouter';\n"
            "  <Switch>\n"
            "    {/* suas rotas aqui */}\n"
            "  </Switch>"))

    if len(raw_paths) > 0 and len(route_paths) == 0:
        sample = raw_paths[:5]
        issues.append(Issue("WARNING","Navigation",fr,0,
            f"App.tsx tem {len(raw_paths)} paths mas scanner não conseguiu parsear as rotas",
            f"Paths detectados: {sample}",
            "Verifique se as rotas estão no formato padrão:\n"
            "  <Route path={'/x'} component={Component} />\n"
            "  OU: <Route path='/x' component={Component} />"))

    if has_rr and not has_wouter:
        issues.append(Issue("WARNING","Navigation",fr,0,
            "Projeto usa React Router (não Wouter)",
            "O package.json/imports indicam react-router-dom",
            "O scanner suporta React Router v6 via path='/' diretamente."))

    # Verificar imports de páginas faltando
    page_imports = re.findall(r"import\s+(\w+)\s+from\s+['\"]@?[./]*pages/([^'\"]+)['\"]", txt)
    imported_comps = {m[0] for m in page_imports}
    used_in_routes = set(re.findall(r"component=\{([^}]+)\}", txt))
    missing_imports = used_in_routes - imported_comps
    for mi in sorted(missing_imports):
        issues.append(Issue("CRITICAL","Navigation",fr,0,
            f"Componente `{mi}` usado em Route mas não importado",
            "Vai causar erro de compilação / tela branca",
            f"Adicione no topo do App.tsx:\n  import {mi} from '@/pages/{mi}';"))

    return issues


# ════════════════════════════ SCORING ═════════════════════════════════════════

def compute_scores(
    total_routes: int,
    broken_links: int,
    all_links: int,
    ghost_calls: int,
    total_frontend: int,
    security_criticals: int,
    security_warnings: int,
    nav_issues_critical: int,
) -> Dict[str, int]:
    # Navegação
    if total_routes == 0:
        nav = 0
    else:
        broken_pct = (broken_links / max(all_links, 1)) * 100
        nav = max(0, 100 - int(broken_pct * 1.5) - nav_issues_critical * 8)
        nav = max(0, min(100, nav))

    # tRPC
    if total_frontend == 0:
        trpc_score = 100
    else:
        ghost_pct = (ghost_calls / max(total_frontend, 1)) * 100
        trpc_score = max(0, 100 - int(ghost_pct * 2))

    # Segurança
    sec = max(0, 100 - security_criticals * 25 - security_warnings * 8)

    # Global
    glob = int(nav * 0.45 + trpc_score * 0.35 + sec * 0.20)

    return {
        "global": glob,
        "navigation": nav,
        "trpc_alignment": trpc_score,
        "security": sec,
    }


# ════════════════════════════ AUTOFIX ENGINE ══════════════════════════════════

def propose_href_fix(href: str, routes: Set[str]) -> Optional[Tuple[str, str]]:
    if not href or href.startswith("#") or is_external(href):
        return None
    if any(href.startswith(p) for p in ("/api", "/assets", "/favicon")):
        return None
    p = norm_path(href)
    if not p.startswith("/"):
        p2 = "/" + p
        if p2 in routes:
            return (p2, "prefix /")
    if p in routes:
        return None  # já ok
    if (p + "/") in routes:
        return (p + "/", "trailing slash")
    if p.endswith("/") and p[:-1] in routes:
        return (p[:-1], "remove trailing slash")
    lm = {r.lower(): r for r in routes}
    if p.lower() in lm and p != lm[p.lower()]:
        return (lm[p.lower()], "case fix")
    cands = difflib.get_close_matches(p, list(routes), n=1, cutoff=0.88)
    if cands:
        return (cands[0], f"close match → {cands[0]}")
    return None


def fix_links_in_file(
    f: Path, broken: List[LinkFinding], routes: Set[str],
    apply: bool, bdir: Path, disable_unfixable: bool
) -> List[Fix]:
    file_broken = [b for b in broken if b.file == relp(f, f.parents[len(f.parts)-2])]
    # Re-filter by filename match regardless of root
    file_str = str(f).replace("\\", "/")
    file_broken_hrefs: Dict[str, str] = {}   # old → new
    for b in broken:
        if b.file in file_str or file_str.endswith(b.file):
            fix = propose_href_fix(b.href, routes)
            if fix:
                file_broken_hrefs[b.href] = fix[0]
            elif disable_unfixable:
                file_broken_hrefs[b.href] = "#"
    if not file_broken_hrefs:
        return []
    txt = original = read(f)
    for old, new in file_broken_hrefs.items():
        # replace in href="..." , href='...' , navigate("...") etc.
        for pat in (f'href="{old}"', f"href='{old}'",
                    f'navigate("{old}")', f"navigate('{old}')",
                    f'setLocation("{old}")', f"setLocation('{old}')"):
            new_pat = pat.replace(old, new)
            txt = txt.replace(pat, new_pat)
    if txt == original:
        return []
    fixes = [Fix(str(f), "fix_link", old, new, f"link corrigido")
             for old, new in file_broken_hrefs.items()]
    if apply:
        backup(f, bdir)
        write(f, txt)
    return fixes


def add_routes_to_app(
    app_file: Path, routes_to_add: List[Tuple[str, str]],
    apply: bool, bdir: Path
) -> List[Fix]:
    if not routes_to_add:
        return []
    txt = original = read(app_file)
    lines_to_insert = [f'      <Route path="{p}" component={{{c}}} />'
                       for p, c in routes_to_add]
    insertion = "\n" + "\n".join(lines_to_insert) + "\n"
    # Insert before </Switch> or before fallback <Route> without path
    m_fallback = re.search(r'<Route\b(?![^>]*\bpath=)[^>]*>', txt)
    if m_fallback:
        txt = txt[:m_fallback.start()] + insertion + txt[m_fallback.start():]
    else:
        idx = txt.lower().rfind("</switch>")
        if idx != -1:
            txt = txt[:idx] + insertion + txt[idx:]
        else:
            # Append before last </div> in Router/Switch area
            txt = txt + "\n/* AUTO-ADDED ROUTES — move inside <Switch>: */\n" + insertion
    if txt == original:
        return []
    fixes = [Fix(str(app_file), "add_route", "", str(routes_to_add), "rotas adicionadas")]
    if apply:
        backup(app_file, bdir)
        write(app_file, txt)
    return fixes


def create_stub_page(page_path: Path, route: str, apply: bool) -> Optional[Fix]:
    if page_path.exists():
        return None
    stem  = page_path.stem
    title = " ".join(w.capitalize() for w in re.split(r"[-_]+", stem))
    content = f"""\
import {{ Link }} from "wouter";

// AUTO-GENERATED STUB — personalize este componente
export default function {stem}() {{
  return (
    <div className="min-h-screen bg-background text-foreground">
      <main className="container py-10">
        <h1 className="text-3xl font-bold">{title}</h1>
        <p className="mt-3 text-muted-foreground">
          Página gerada para a rota <code>{route}</code>.
          Substitua este conteúdo pelo componente real.
        </p>
        <Link href="/" className="mt-6 inline-block text-primary hover:underline">
          ← Voltar ao início
        </Link>
      </main>
    </div>
  );
}}
"""
    if apply:
        write(page_path, content)
    return Fix(str(page_path), "create_stub", "", route, "stub TSX criado")


def fix_oauth_links(f: Path, apply: bool, bdir: Path) -> List[Fix]:
    """
    Substitui links diretos /api/auth/google por chamada válida via trpc.
    Gera código TypeScript/JavaScript sintaticamente correto.
    """
    txt = original = read(f)

    # ── Padrão 1: href="/api/auth/google"  ou  href='/api/auth/google'
    # Substituir o atributo href por onClick com chamada tRPC
    txt = re.sub(
        r'\bhref\s*=\s*["\']\/api\/auth\/google(?:\/callback)?["\']',
        'onClick={() => trpc.auth.loginWithGoogle.mutate()}',
        txt
    )

    # ── Padrão 2: window.location = "/api/auth/google"
    # Precisa substituir a expressão INTEIRA incluindo o ; para evitar syntax error
    txt = re.sub(
        r'window\.location\s*=\s*["\']\/api\/auth\/google(?:\/callback)?["\'];?',
        'void trpc.auth.loginWithGoogle.mutate();',
        txt
    )

    # ── Padrão 3: window.location.href = "/api/auth/google"
    txt = re.sub(
        r'window\.location\.href\s*=\s*["\']\/api\/auth\/google(?:\/callback)?["\'];?',
        'void trpc.auth.loginWithGoogle.mutate();',
        txt
    )

    # ── Padrão 4: location.href = "/api/auth/google"
    txt = re.sub(
        r'(?<!\.)location\.href\s*=\s*["\']\/api\/auth\/google(?:\/callback)?["\'];?',
        'void trpc.auth.loginWithGoogle.mutate();',
        txt
    )

    # ── Padrão 5: navigate("/api/auth/google")
    txt = re.sub(
        r'\bnavigate\s*\(\s*["\']\/api\/auth\/google(?:\/callback)?["\']\s*\);?',
        'trpc.auth.loginWithGoogle.mutate();',
        txt
    )

    if txt == original:
        return []
    if apply:
        backup(f, bdir)
        write(f, txt)
    return [Fix(str(f), "fix_oauth_link", "/api/auth/google",
                "trpc.auth.loginWithGoogle.mutate()", "OAuth link corrigido para chamada tRPC válida")]


# ════════════════════════════ MAIN RUNNER ═════════════════════════════════════

def find_app_file(root: Path) -> Optional[Path]:
    """Localiza o arquivo de rotas principal — busca agressiva."""
    # 1. Hints diretos — retorna mesmo sem <Route> (para diagnóstico)
    for hint in APP_HINTS:
        p = root / hint
        if p.exists():
            return p

    # 2. Scan por arquivo com Switch OU Route
    for gp in ["client/src/**/*.tsx", "src/**/*.tsx"]:
        for p in root.glob(gp):
            if any(d in SKIP_DIRS for d in p.parts):
                continue
            txt = read(p)
            if ("<Switch" in txt and "<Route" in txt) or "useRoute(" in txt:
                return p

    # 3. Qualquer arquivo que mencione path="/
    for gp in ["client/src/**/*.tsx", "src/**/*.tsx"]:
        for p in root.glob(gp):
            if any(d in SKIP_DIRS for d in p.parts):
                continue
            txt = read(p)
            if 'path="/' in txt or "path='/" in txt:
                return p
    return None


def debug_app_file(app_file: Optional[Path], root: Path) -> Dict:
    """Debug do App.tsx — diagnóstico de por que 0 rotas foram detectadas."""
    if not app_file or not app_file.exists():
        return {
            "found": False, "path": None, "has_switch": False,
            "has_route": False, "has_wouter_import": False,
            "route_count_raw": 0, "raw_paths_found": [],
        }
    txt = read(app_file)
    fr  = relp(app_file, root)

    # Extrair todos os paths com o novo regex (suporta aspas diretas E JSX {})
    raw_paths = [m.group(1) or m.group(2) for m in R_PATH_ANY.finditer(txt)
                 if (m.group(1) or m.group(2) or "").startswith("/")]

    return {
        "found": True,
        "path": fr,
        "has_switch": "<Switch" in txt,
        "has_route": "<Route" in txt or "<ProtectedRoute" in txt,
        "has_wouter_import": "wouter" in txt.lower(),
        "has_react_router": "react-router" in txt.lower(),
        "has_protected_route": "ProtectedRoute" in txt,
        "raw_paths_found": raw_paths[:30],
        "route_count_raw": len(raw_paths),
        "first_80_lines": "\n".join(txt.split("\n")[:80]),
    }


def run_full_audit(root: Path) -> Dict:
    print("🔍 Scanning arquivos...")
    fe_files  = iter_files(root, FRONTEND_GLOBS)
    be_files  = iter_files(root, BACKEND_GLOBS)
    pg_files  = iter_files(root, PAGE_GLOBS)
    sc_files  = iter_files(root, SCHEMA_GLOBS)
    app_file  = find_app_file(root)

    print(f"   Frontend: {len(fe_files)} arquivos | Backend: {len(be_files)} | Pages: {len(pg_files)}")
    if app_file:
        print(f"   App file: {relp(app_file, root)}")
    else:
        print(f"   ⚠️  App.tsx NÃO ENCONTRADO")

    app_debug = debug_app_file(app_file, root)
    if app_debug["found"]:
        print(f"   App debug: Switch={app_debug['has_switch']} Route={app_debug['has_route']} "
              f"Wouter={app_debug['has_wouter_import']} paths_raw={app_debug['route_count_raw']}")

    # ── Scan ──
    routes     = scan_routes(fe_files, root)
    route_paths= {r.path for r in routes}
    pages      = {f.stem: relp(f, root) for f in pg_files}

    _, broken_links = scan_links(fe_files, root, route_paths)
    all_links_l, _  = scan_links(fe_files, root, route_paths)

    be_procs   = scan_trpc_backend(be_files, root)
    fe_usages  = scan_trpc_frontend(fe_files, root)
    db_tables  = scan_schema(sc_files, root)
    sec_issues = scan_security(fe_files + be_files, root)
    auth_issues= scan_auth_config(root)
    qual_issues= scan_code_quality(fe_files + be_files, root)
    root_issues= diagnose_root_causes(route_paths, app_file, root)
    trpc_issues, ghost, dead = analyze_trpc(be_procs, fe_usages)
    missing_routes, orphan_pages = scan_missing_routes(route_paths, pages)

    # Unknown route components
    comp_to_page = {stem: fp for stem, fp in pages.items()}
    unknown_comps = [
        {"path": r.path, "component": r.component, "zone": r.zone, "file": r.file}
        for r in routes
        if r.component and r.component not in comp_to_page
    ]

    # ── Aggregate issues ──
    all_issues: List[Issue] = (
        root_issues + trpc_issues + sec_issues + auth_issues + qual_issues
    )

    # Missing expected routes as issues
    for mr in missing_routes:
        zone = classify_zone(mr)
        all_issues.append(Issue("WARNING","Navigation","client/src/App.tsx",0,
            f"Rota esperada `{mr}` não declarada",
            f"A plataforma referencia esta rota mas ela não existe no App.tsx (zona: {zone})",
            f'Adicione no App.tsx: <Route path="{mr}" component={{...}} />'))

    # Broken links as issues
    for bl in broken_links[:50]:  # limit to top 50 in issues list
        all_issues.append(Issue("WARNING","Navigation",bl.file,bl.line,
            f"Link quebrado: `{bl.href}`",
            f"Tipo: {bl.kind} | Zona: {bl.zone_guess}",
            f"Verifique se a rota `{bl.href}` está registrada no App.tsx"))

    sec_crits = sum(1 for i in sec_issues + auth_issues if i.severity == "CRITICAL")
    sec_warns = sum(1 for i in sec_issues + auth_issues if i.severity == "WARNING")
    nav_crits = sum(1 for i in root_issues if i.severity == "CRITICAL")

    scores = compute_scores(
        len(routes), len(broken_links), len(all_links_l),
        len(ghost), len(fe_usages),
        sec_crits, sec_warns, nav_crits
    )

    # Zones
    route_zones = {"PUBLIC": [], "AUTH": [], "ADMIN": []}
    for r in routes:
        route_zones[r.zone].append(r.path)

    counts = {
        "routes_detected":   len(routes),
        "pages_found":       len(pages),
        "broken_links":      len(broken_links),
        "total_links":       len(all_links_l),
        "orphan_pages":      len(orphan_pages),
        "missing_routes":    len(missing_routes),
        "backend_procedures":len(be_procs),
        "frontend_usages":   len(fe_usages),
        "ghost_calls":       len(ghost),
        "dead_procedures":   len(dead),
        "db_tables":         len(db_tables),
        "security_criticals":sec_crits,
        "security_warnings": sec_warns,
        "issues_critical":   sum(1 for i in all_issues if i.severity == "CRITICAL"),
        "issues_warning":    sum(1 for i in all_issues if i.severity == "WARNING"),
        "issues_info":       sum(1 for i in all_issues if i.severity == "INFO"),
        "issues_total":      len(all_issues),
    }

    def ser(lst):
        return [asdict(x) if hasattr(x, '__dataclass_fields__') else x for x in lst]

    return {
        "generated_at":       datetime.datetime.now().isoformat(),
        "project_root":       str(root),
        "app_file":           str(app_file) if app_file else None,
        "app_debug":          app_debug,
        "scores":             scores,
        "counts":             counts,
        "routes":             ser(routes),
        "route_zones":        route_zones,
        "broken_links":       ser(broken_links),
        "orphan_pages":       orphan_pages,
        "missing_expected_routes": missing_routes,
        "backend_procedures": ser(be_procs),
        "frontend_usages":    ser(fe_usages),
        "ghost_calls":        ghost,
        "dead_procedures":    dead,
        "db_tables":          ser(db_tables),
        "unknown_route_components": unknown_comps,
        "issues":             ser(all_issues),
    }


def run_autofix(root: Path, report: Dict, cfg: Dict) -> List[Fix]:
    """Aplica todos os fixes solicitados."""
    apply   = cfg.get("apply", False)
    bdir    = root / ".shadia_backups" / now_tag()
    fixes:  List[Fix] = []

    route_paths = {r["path"] for r in report["routes"]}
    app_file_str= report.get("app_file")
    app_file    = Path(app_file_str) if app_file_str else find_app_file(root)
    fe_files    = iter_files(root, FRONTEND_GLOBS)
    pg_files    = iter_files(root, PAGE_GLOBS)

    # 1. Fix links
    if cfg.get("fix_links"):
        broken_data = report["broken_links"]
        broken_objs = [LinkFinding(**b) for b in broken_data]
        disable_uf  = cfg.get("disable_unfixable", False)
        for f in fe_files:
            fr = relp(f, root)
            file_broken = [b for b in broken_objs if b.file == fr]
            if not file_broken:
                continue
            for b in file_broken:
                fix = propose_href_fix(b.href, route_paths)
                if fix or disable_uf:
                    new_href = fix[0] if fix else "#"
                    txt = original = read(f)
                    for pat in [f'href="{b.href}"', f"href='{b.href}'",
                                f'navigate("{b.href}")', f"navigate('{b.href}')"]:
                        txt = txt.replace(pat, pat.replace(b.href, new_href))
                    if txt != original:
                        if apply:
                            backup(f, bdir)
                            write(f, txt)
                        fixes.append(Fix(fr, "fix_link", b.href, new_href,
                                        f"L{b.line} — {fix[1] if fix else 'desabilitado'}"))

    # 2. Fix OAuth links
    if cfg.get("fix_oauth"):
        for f in fe_files:
            fx = fix_oauth_links(f, apply, bdir)
            fixes.extend(fx)

    # 3. Create stub pages + add routes
    routes_to_add: List[Tuple[str, str]] = []
    pages_by_stem = {f.stem: f for f in pg_files}

    if cfg.get("create_stubs"):
        base = (root / "client/src/pages") if (root / "client/src/pages").exists() else (root / "src/pages")
        for item in report["broken_links"]:
            href = norm_path(item.get("href",""))
            if not href or not href.startswith("/") or href.startswith("/api"):
                continue
            if href in route_paths:
                continue
            seg = href.strip("/").split("/")[-1]
            if not seg:
                continue
            comp = re.sub(r"[^A-Za-z0-9_]","",
                          "".join(w[:1].upper()+w[1:] for w in re.split(r"[-_]+", seg) if w))
            if not comp or comp in pages_by_stem:
                continue
            stub = create_stub_page(base / f"{comp}.tsx", href, apply)
            if stub:
                fixes.append(stub)
                routes_to_add.append((href, comp))

    if cfg.get("fix_routes") and app_file:
        # Also add orphan pages to routes
        for stem, fp in {f.stem: f for f in pg_files}.items():
            guess = stem_to_route(stem)
            if not path_matches(guess, route_paths) and ":" not in guess:
                routes_to_add.append((guess, stem))
        seen = set()
        deduped = [(p,c) for p,c in routes_to_add
                   if not ((p,c) in seen or seen.add((p,c)))]  # type: ignore
        fx = add_routes_to_app(app_file, deduped, apply, bdir)
        fixes.extend(fx)

    # 4. Comment console.log
    if cfg.get("fix_console"):
        for f in fe_files + iter_files(root, BACKEND_GLOBS):
            txt = original = read(f)
            txt = R_CONSOLE.sub("// console.log(", txt)
            if txt != original:
                if apply:
                    backup(f, bdir)
                    write(f, txt)
                count = original.count("console.log(")
                fixes.append(Fix(relp(f, root), "fix_console", "", "",
                               f"Comentados {count} console.log"))

    return fixes, str(bdir) if apply else ""


# ═══════════════════════════════ HTML REPORT ══════════════════════════════════

def esc(s):
    return str(s).replace("&","&amp;").replace("<","&lt;").replace(">","&gt;").replace('"',"&quot;")

def score_color(v: int) -> str:
    if v >= 80: return "#22c55e"
    if v >= 50: return "#f59e0b"
    return "#ef4444"

def sev_pill(sev: str) -> str:
    colors = {"CRITICAL":"#ef4444","WARNING":"#f59e0b","INFO":"#3b82f6"}
    c = colors.get(sev, "#64748b")
    return f'<span class="pill" style="background:{c};color:#fff">{esc(sev)}</span>'

def cat_pill(cat: str) -> str:
    colors = {
        "Navigation":"#8b5cf6","tRPC-Alignment":"#06b6d4","Security":"#ef4444",
        "Auth":"#f97316","CodeQuality":"#6b7280","Config":"#ec4899",
    }
    c = colors.get(cat, "#334155")
    return f'<span class="pill" style="background:{c};color:#fff">{esc(cat)}</span>'

def write_html(out: Path, report: Dict, fixes: Optional[List[Fix]] = None) -> None:
    H: List[str] = []
    a = H.append

    scores  = report["scores"]
    counts  = report["counts"]
    issues  = report["issues"]
    routes  = report["routes"]
    broken  = report["broken_links"]
    orphans = report["orphan_pages"]
    ghost   = report["ghost_calls"]
    dead    = report["dead_procedures"]
    be_procs= report["backend_procedures"]
    fe_usgs = report["frontend_usages"]
    tables  = report["db_tables"]
    zones   = report["route_zones"]
    missing_r = report.get("missing_expected_routes", [])

    gs = scores["global"]
    gcolor = score_color(gs)

    a(f"""<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Shadia Doctor — Relatório de Auditoria</title>
<style>
@import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:ital,wght@0,400;0,600;1,400&family=Sora:wght@300;400;600;700;800&display=swap');
*{{box-sizing:border-box;margin:0;padding:0}}
:root{{
  --bg:#080c14;--surface:#0d1424;--surface2:#121c2e;--border:#1e2d44;
  --text:#c9d8f0;--muted:#5a7299;--accent:#4f8ef7;--green:#34d399;
  --red:#f87171;--yellow:#fbbf24;--purple:#a78bfa;--cyan:#22d3ee;
}}
html{{scroll-behavior:smooth}}
body{{font-family:'Sora',system-ui,sans-serif;background:var(--bg);color:var(--text);font-size:14px;line-height:1.6}}
a{{color:var(--accent);text-decoration:none}}a:hover{{text-decoration:underline}}
code{{font-family:'IBM Plex Mono',monospace;font-size:0.84em;background:var(--surface2);padding:1px 6px;border-radius:4px;color:#93c5fd}}
pre{{font-family:'IBM Plex Mono',monospace;font-size:0.82em;background:var(--surface2);padding:14px;border-radius:8px;overflow-x:auto;white-space:pre-wrap;color:#93c5fd;border:1px solid var(--border)}}

/* ── Layout ── */
.wrap{{max-width:1440px;margin:0 auto;padding:0 24px}}
.hero{{background:linear-gradient(135deg,#060e1c 0%,#0a1628 40%,#0d1d3a 100%);border-bottom:1px solid var(--border);padding:48px 0 36px}}
.hero-inner{{display:flex;align-items:flex-end;justify-content:space-between;gap:24px;flex-wrap:wrap}}
.hero h1{{font-size:2.4em;font-weight:800;letter-spacing:-0.03em;color:#e2eeff}}
.hero h1 span{{color:var(--accent)}}
.hero .meta{{color:var(--muted);font-size:0.82em;margin-top:6px;font-family:'IBM Plex Mono',monospace}}
.score-globe{{text-align:right}}
.score-globe .num{{font-size:5em;font-weight:800;line-height:1;color:{gcolor}}}
.score-globe .lbl{{color:var(--muted);font-size:0.78em}}

/* ── Scores grid ── */
.scores{{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:14px;padding:28px 0}}
.sc{{background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:20px;position:relative;overflow:hidden}}
.sc::before{{content:'';position:absolute;top:0;left:0;right:0;height:3px}}
.sc.green::before{{background:var(--green)}} .sc.yellow::before{{background:var(--yellow)}} .sc.red::before{{background:var(--red)}}
.sc .v{{font-size:2.6em;font-weight:800;line-height:1}}
.sc .l{{color:var(--muted);font-size:0.78em;margin-top:5px}}
.bar{{height:5px;background:var(--border);border-radius:9px;margin-top:10px;overflow:hidden}}
.bar-f{{height:100%;border-radius:9px;transition:width .8s cubic-bezier(.4,0,.2,1)}}

/* ── Stats ── */
.stats{{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px;margin:16px 0 32px}}
.stat{{background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:14px 16px;border-left:3px solid transparent}}
.stat.crit{{border-left-color:var(--red)}} .stat.warn{{border-left-color:var(--yellow)}}
.stat.ok{{border-left-color:var(--green)}} .stat.info{{border-left-color:var(--accent)}}
.stat .v{{font-size:1.7em;font-weight:700;color:#e2eeff;font-family:'IBM Plex Mono',monospace}}
.stat .l{{font-size:0.72em;color:var(--muted);margin-top:2px}}

/* ── Sections ── */
details{{margin-bottom:16px}}
details summary{{cursor:pointer;list-style:none;user-select:none}}
details summary::-webkit-details-marker{{display:none}}
.sec-head{{background:var(--surface2);border:1px solid var(--border);border-radius:10px;padding:14px 20px;display:flex;align-items:center;justify-content:space-between;transition:background .15s}}
.sec-head:hover{{background:#162032}}
details[open] .sec-head{{border-bottom-left-radius:0;border-bottom-right-radius:0;border-bottom-color:transparent}}
.sec-head h2{{font-size:0.95em;color:#e2eeff;font-weight:600;display:flex;align-items:center;gap:8px}}
.sec-head .arrow{{color:var(--muted);transition:transform .2s;font-size:0.75em}}
details[open] .sec-head .arrow{{transform:rotate(90deg)}}
.cnt{{background:var(--border);color:var(--muted);padding:2px 10px;border-radius:99px;font-size:0.75em;font-weight:600}}
.sec-body{{background:var(--surface);border:1px solid var(--border);border-top:none;border-radius:0 0 10px 10px;overflow:hidden}}

/* ── Tables ── */
table{{border-collapse:collapse;width:100%}}
th{{background:#0a1020;color:var(--muted);font-size:0.72em;text-transform:uppercase;letter-spacing:0.08em;padding:9px 14px;font-weight:600;white-space:nowrap}}
td{{padding:9px 14px;border-bottom:1px solid var(--border);font-size:0.85em;vertical-align:top}}
tr:last-child td{{border-bottom:none}}
tr:hover td{{background:#0d1830}}
.mono{{font-family:'IBM Plex Mono',monospace;font-size:0.82em;color:#93c5fd;word-break:break-all}}

/* ── Issues ── */
.issue-row{{display:grid;grid-template-columns:auto auto 1fr auto;gap:10px;padding:12px 20px;border-bottom:1px solid var(--border);align-items:start}}
.issue-row:hover{{background:#0d1830}}
.issue-row:last-child{{border-bottom:none}}
.issue-title{{font-weight:600;color:#e2eeff;font-size:0.9em}}
.issue-detail{{color:var(--muted);font-size:0.81em;margin-top:3px}}
.issue-file{{font-size:0.73em;color:#3a5272;font-family:'IBM Plex Mono',monospace;margin-top:2px}}
.issue-hint{{font-size:0.79em;color:#4a7ca8;margin-top:5px;padding:6px 10px;background:#0a1628;border-left:2px solid var(--accent);border-radius:0 4px 4px 0}}
.lno{{color:#334e6b;font-size:0.72em;white-space:nowrap;font-family:'IBM Plex Mono',monospace}}

/* ── Pills ── */
.pill{{display:inline-block;padding:1px 9px;border-radius:99px;font-size:0.7em;font-weight:700;white-space:nowrap}}

/* ── Zones ── */
.zones{{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;padding:20px}}
.zone{{background:#080c14;border-radius:8px;padding:16px}}
.zone h3{{font-size:0.78em;text-transform:uppercase;letter-spacing:0.1em;font-weight:700;margin-bottom:10px}}
.zone.pub h3{{color:var(--green)}} .zone.auth h3{{color:var(--yellow)}} .zone.adm h3{{color:var(--red)}}
.zone ul{{list-style:none}} .zone li{{padding:3px 0;border-bottom:1px solid var(--border);font-size:0.82em}}

/* ── Action Plan ── */
.plan{{margin:0 0 32px}}
.plan-title{{font-size:1.1em;font-weight:700;color:#e2eeff;margin-bottom:16px;padding-bottom:10px;border-bottom:1px solid var(--border)}}
.step{{display:flex;gap:16px;margin-bottom:12px;padding:14px 18px;background:var(--surface);border:1px solid var(--border);border-radius:10px}}
.step-num{{font-size:1.4em;font-weight:800;min-width:32px;line-height:1.2}}
.step-body h4{{font-weight:600;color:#e2eeff;font-size:0.9em;margin-bottom:4px}}
.step-body p{{color:var(--muted);font-size:0.82em}}
.step-body code{{font-size:0.82em}}
.step.p1{{border-left:3px solid var(--red)}} .step.p2{{border-left:3px solid var(--yellow)}}
.step.p3{{border-left:3px solid var(--green)}}

/* ── Fixes summary ── */
.fix-row{{display:grid;grid-template-columns:auto 1fr auto;gap:10px;padding:10px 16px;border-bottom:1px solid var(--border);align-items:center;font-size:0.84em}}
.fix-row:last-child{{border-bottom:none}}
.fix-kind{{padding:1px 8px;border-radius:99px;font-size:0.7em;font-weight:700;background:#1a2d48;color:#93c5fd}}

/* ── Tabs ── */
.tabs{{display:flex;gap:2px;margin-bottom:0;border-bottom:1px solid var(--border)}}
.tab{{padding:10px 18px;font-size:0.85em;font-weight:600;cursor:pointer;color:var(--muted);background:none;border:none;border-bottom:2px solid transparent;transition:all .15s}}
.tab.active{{color:var(--accent);border-bottom-color:var(--accent)}}
.tab-pane{{display:none}} .tab-pane.active{{display:block}}

/* ── Badges ── */
.badge-ok{{display:inline-flex;align-items:center;gap:6px;background:#052010;border:1px solid #1a5c30;color:var(--green);padding:6px 14px;border-radius:99px;font-size:0.78em;font-weight:600}}
.badge-err{{display:inline-flex;align-items:center;gap:6px;background:#1a0808;border:1px solid #5c1a1a;color:var(--red);padding:6px 14px;border-radius:99px;font-size:0.78em;font-weight:600}}
.badge-warn{{display:inline-flex;align-items:center;gap:6px;background:#1a1005;border:1px solid #5c3a10;color:var(--yellow);padding:6px 14px;border-radius:99px;font-size:0.78em;font-weight:600}}

/* ── Summary ribbon ── */
.ribbon{{display:flex;gap:10px;flex-wrap:wrap;margin:16px 0 24px}}

/* ── Responsive ── */
@media(max-width:900px){{
  .zones{{grid-template-columns:1fr}}
  .scores{{grid-template-columns:repeat(2,1fr)}}
  .issue-row{{grid-template-columns:1fr;gap:4px}}
  .hero-inner{{flex-direction:column;align-items:flex-start}}
  .score-globe{{text-align:left}}
}}
</style>
</head>
<body>
""")

    # ── HERO ──
    a(f'<div class="hero"><div class="wrap"><div class="hero-inner">')
    a(f'<div>')
    a(f'<h1>🩺 Shadia <span>Doctor</span></h1>')
    a(f'<div class="meta">{esc(report["project_root"])} &nbsp;·&nbsp; {esc(report["generated_at"])}</div>')
    app_str = report.get("app_file","")
    if app_str:
        a(f'<div class="meta" style="margin-top:4px">App file: <code>{esc(app_str)}</code></div>')
    else:
        a(f'<div class="meta" style="color:var(--red)">⚠️ App.tsx não encontrado</div>')
    a(f'</div>')
    a(f'<div class="score-globe"><div class="num">{gs}</div><div class="lbl">Score Global / 100</div></div>')
    a(f'</div></div></div>')

    a('<div class="wrap">')

    # ── SCORES ──
    a('<div class="scores">')
    for key, label, emoji in [
        ("navigation","Navegação","🗺️"),
        ("trpc_alignment","tRPC Alinhamento","⚙️"),
        ("security","Segurança","🔒"),
    ]:
        v = scores[key]
        c_cls = "green" if v >= 80 else "yellow" if v >= 50 else "red"
        c_hex = score_color(v)
        a(f'<div class="sc {c_cls}"><div class="v" style="color:{c_hex}">{v}</div>')
        a(f'<div class="l">{emoji} {label}</div>')
        a(f'<div class="bar"><div class="bar-f" style="width:{v}%;background:{c_hex}"></div></div></div>')
    a('</div>')

    # ── RIBBON (summary badges) ──
    a('<div class="ribbon">')
    def rbadge(cls, icon, text):
        a(f'<span class="badge-{cls}">{icon} {esc(text)}</span>')
    if counts["issues_critical"] > 0:
        rbadge("err","🚨",f'{counts["issues_critical"]} CRITICAL issues')
    if counts["issues_warning"] > 0:
        rbadge("warn","⚠️",f'{counts["issues_warning"]} warnings')
    if counts["routes_detected"] == 0:
        rbadge("err","🔴","0 rotas detectadas — verifique App.tsx")
    else:
        rbadge("ok","✅",f'{counts["routes_detected"]} rotas detectadas')
    if counts["broken_links"] > 0:
        rbadge("err","🔗",f'{counts["broken_links"]} links quebrados')
    else:
        rbadge("ok","🔗","Todos os links OK")
    if counts["ghost_calls"] > 0:
        rbadge("err","👻",f'{counts["ghost_calls"]} ghost tRPC calls')
    a('</div>')

    # ── STATS ──
    a('<div class="stats">')
    stats_data = [
        ("routes_detected","Rotas detectadas","crit" if counts["routes_detected"]==0 else "ok"),
        ("pages_found","Páginas (.tsx)","info"),
        ("broken_links","Links quebrados","crit" if counts["broken_links"]>0 else "ok"),
        ("missing_routes","Rotas esperadas faltando","warn"),
        ("orphan_pages","Páginas órfãs","warn"),
        ("ghost_calls","Ghost calls tRPC","crit" if counts["ghost_calls"]>0 else "ok"),
        ("dead_procedures","Procedures mortas","warn"),
        ("backend_procedures","Procedures backend","info"),
        ("frontend_usages","Usos tRPC frontend","info"),
        ("db_tables","Tabelas DB","info"),
        ("security_criticals","Riscos CRÍTICOS","crit" if counts["security_criticals"]>0 else "ok"),
        ("security_warnings","Riscos WARNING","warn"),
    ]
    for key, lbl, cls in stats_data:
        a(f'<div class="stat {cls}"><div class="v">{counts[key]}</div><div class="l">{esc(lbl)}</div></div>')
    a('</div>')

    # ── PLANO DE AÇÃO PRIORITÁRIO ──
    crit_issues = [i for i in issues if i["severity"]=="CRITICAL"]
    warn_issues = [i for i in issues if i["severity"]=="WARNING"]

    a('<div class="plan">')
    a('<div class="plan-title">🎯 Plano de Ação — Por Onde Começar</div>')

    def action_step(num, priority_cls, icon, title, body_html):
        a(f'<div class="step {priority_cls}"><div class="step-num">{icon}</div>')
        a(f'<div class="step-body"><h4>{esc(title)}</h4><div>{body_html}</div></div></div>')

    if counts["routes_detected"] == 0:
        action_step(1,"p1","🔴","CRÍTICO: Registrar rotas no App.tsx",
            f'<p>Seu App.tsx não está sendo detectado ou não tem rotas. '
            f'Verifique se existe <code>client/src/App.tsx</code> e se usa '
            f'<code>&lt;Switch&gt;</code> + <code>&lt;Route&gt;</code> do Wouter.</p>'
            f'<pre>import {{ Switch, Route }} from \'wouter\';\n// ...\n&lt;Switch&gt;\n'
            f'  &lt;Route path="/" component={{Home}} /&gt;\n'
            f'  &lt;Route path="/courses" component={{Courses}} /&gt;\n'
            f'&lt;/Switch&gt;</pre>')

    auth_crits = [i for i in crit_issues if i["category"]=="Auth"]
    if auth_crits:
        hints = "<br>".join(f'• <code>{esc(i["title"])}</code>' for i in auth_crits[:3])
        action_step(2,"p1","🔐","Corrigir configuração do Google OAuth",
            f'<p>O login com Google falha por configuração incorreta. Problemas encontrados:</p>'
            f'<p style="margin-top:8px">{hints}</p>'
            f'<p style="margin-top:8px">Veja a aba <strong>Auth/Config</strong> para instruções detalhadas.</p>')

    if counts["ghost_calls"] > 0:
        action_step(3,"p1","👻","Eliminar Ghost Calls tRPC",
            f'<p>{counts["ghost_calls"]} chamadas no frontend apontam para procedures que não existem no backend. '
            f'Isso causa erros 500 em runtime. Veja aba <strong>tRPC</strong> para detalhes.</p>')

    if counts["broken_links"] > 0:
        top_routes = list(dict.fromkeys(b["href"] for b in broken[:10]))[:5]
        href_list  = " ".join(f'<code>{esc(h)}</code>' for h in top_routes)
        action_step(4,"p2","🔗","Corrigir links internos quebrados",
            f'<p>{counts["broken_links"]} links apontam para rotas inexistentes. '
            f'Principais: {href_list}</p>'
            f'<p style="margin-top:6px">Execute: <code>python shadia_doctor.py --root . --apply --fix-links --fix-routes --create-stubs</code></p>')

    if counts["dead_procedures"] > 10:
        action_step(5,"p2","🗑️","Limpar procedures mortas no backend",
            f'<p>{counts["dead_procedures"]} procedures definidas no backend nunca são usadas no frontend. '
            f'Isso aumenta o bundle e dificulta manutenção.</p>')

    action_step(6,"p3","🚀","Preparar para Render.com (produção)",
        f'<p>Antes do deploy:</p>'
        f'<pre># 1. Configure variáveis no Render dashboard:\n'
        f'DATABASE_URL=mysql://...\nGOOGLE_CLIENT_ID=...\nGOOGLE_CLIENT_SECRET=...\n'
        f'GOOGLE_CALLBACK_URL=https://shadiahasan.club/api/auth/google/callback\n'
        f'SESSION_SECRET=...(gere com: node -e "console.log(require(\'crypto\').randomBytes(64).toString(\'hex\'))")\n\n'
        f'# 2. No Google Cloud Console → Credenciais → OAuth 2.0 Client IDs\n'
        f'#    Authorized redirect URIs:\n'
        f'#    - http://localhost:5000/api/auth/google/callback  (dev)\n'
        f'#    - https://shadiahasan.club/api/auth/google/callback  (prod)</pre>')
    a('</div>')

    # ── ISSUES TABS ──
    a("""<div class="sec-body" style="border:1px solid var(--border);border-radius:10px;overflow:hidden;margin-bottom:16px">
<div class="tabs" id="issue-tabs">
  <button class="tab active" onclick="switchTab('critical')">🚨 Críticos ({c})</button>
  <button class="tab" onclick="switchTab('warning')">⚠️ Atenção ({w})</button>
  <button class="tab" onclick="switchTab('info')">💡 Info ({i})</button>
</div>""".replace("{c}",str(counts["issues_critical"]))
         .replace("{w}",str(counts["issues_warning"]))
         .replace("{i}",str(counts["issues_info"])))

    def render_issues_pane(pane_id: str, issue_list: List[Dict], active: bool):
        a(f'<div class="tab-pane {"active" if active else ""}" id="tab-{pane_id}">')
        a('<div>')
        if not issue_list:
            a('<div style="padding:32px;text-align:center;color:var(--muted)">Nenhuma issue nesta categoria 🎉</div>')
        for iss in issue_list:
            ln_txt = f"L{iss['line']}" if iss.get("line") and iss["line"] > 0 else ""
            a(f'<div class="issue-row">')
            a(f'<div>{sev_pill(iss["severity"])}</div>')
            a(f'<div>{cat_pill(iss["category"])}</div>')
            a(f'<div>')
            a(f'<div class="issue-title">{esc(iss["title"])}</div>')
            a(f'<div class="issue-detail">{esc(iss["detail"])}</div>')
            a(f'<div class="issue-file">{esc(iss["file"])}</div>')
            if iss.get("fix_hint"):
                a(f'<div class="issue-hint">💡 {esc(iss["fix_hint"])}</div>')
            a(f'</div>')
            a(f'<div class="lno">{esc(ln_txt)}</div>')
            a(f'</div>')
        a('</div></div>')

    render_issues_pane("critical", crit_issues, True)
    render_issues_pane("warning",  warn_issues, False)
    render_issues_pane("info",     [i for i in issues if i["severity"]=="INFO"], False)
    a('</div>')

    # ── ZONES ──
    a("""<details open><summary><div class="sec-head">
<h2><span class="arrow">▶</span>🗺️ Rotas por Zona</h2>
<span class="cnt">{n} rotas</span></div></summary>
<div class="sec-body">""".replace("{n}", str(counts["routes_detected"])))
    a('<div class="zones">')
    for zone_key, zone_cls, zone_label in [
        ("PUBLIC","pub","PUBLIC"),("AUTH","auth","AUTH (requer login)"),("ADMIN","adm","ADMIN")
    ]:
        items = zones.get(zone_key, [])
        a(f'<div class="zone {zone_cls}"><h3>{zone_label} ({len(items)})</h3><ul>')
        if items:
            for p in sorted(items):
                a(f'<li><code>{esc(p)}</code></li>')
        else:
            a('<li style="color:var(--muted)">(nenhuma)</li>')
        a('</ul></div>')
    a('</div>')
    if missing_r:
        a(f'<div style="padding:16px 20px;border-top:1px solid var(--border)">')
        a(f'<div style="font-size:0.82em;color:var(--yellow);font-weight:600;margin-bottom:8px">⚠️ {len(missing_r)} rotas esperadas NÃO DECLARADAS:</div>')
        a('<div style="display:flex;flex-wrap:wrap;gap:6px">')
        for mr in missing_r:
            a(f'<code style="background:#1a1005;border:1px solid #3a2a00">{esc(mr)}</code>')
        a('</div></div>')
    a('</div></details>')

    # ── BROKEN LINKS ──
    if broken:
        a(f"""<details open><summary><div class="sec-head">
<h2><span class="arrow">▶</span>🔗 Links Quebrados</h2>
<span class="cnt">{len(broken)}</span></div></summary>
<div class="sec-body"><table>
<thead><tr><th>Arquivo</th><th>Link</th><th>Tipo</th><th>L#</th><th>Zona</th></tr></thead><tbody>""")
        for lk in broken:
            zc = "var(--red)" if lk["zone_guess"]=="ADMIN" else "var(--yellow)"
            a(f'<tr><td class="mono">{esc(lk["file"])}</td>'
              f'<td><code>{esc(lk["href"])}</code></td>'
              f'<td>{esc(lk["kind"])}</td>'
              f'<td class="lno">{lk["line"]}</td>'
              f'<td><span style="color:{zc};font-size:0.78em;font-weight:600">{esc(lk["zone_guess"])}</span></td></tr>')
        a('</tbody></table></div></details>')

    # ── ORPHAN PAGES ──
    if orphans:
        a(f"""<details open><summary><div class="sec-head">
<h2><span class="arrow">▶</span>👻 Páginas Órfãs (sem rota)</h2>
<span class="cnt">{len(orphans)}</span></div></summary>
<div class="sec-body"><table>
<thead><tr><th>Arquivo</th><th>Rota Sugerida</th><th>Fix para App.tsx</th></tr></thead><tbody>""")
        for op in orphans:
            stem = Path(op).stem
            guess = stem_to_route(stem)
            fix_snippet = f'&lt;Route path="{esc(guess)}" component={{{esc(stem)}}} /&gt;'
            a(f'<tr><td class="mono">{esc(op)}</td><td><code>{esc(guess)}</code></td>'
              f'<td><code>{fix_snippet}</code></td></tr>')
        a('</tbody></table></div></details>')

    # ── tRPC ──
    a(f"""<details><summary><div class="sec-head">
<h2><span class="arrow">▶</span>⚙️ tRPC — Ghost Calls e Dead Procedures</h2>
<span class="cnt">{len(ghost)} ghost · {len(dead)} dead</span></div></summary>
<div class="sec-body">""")
    if ghost:
        a('<div style="padding:12px 20px 6px;font-size:0.8em;font-weight:700;color:var(--red)">🔴 Ghost Calls (frontend chama procedure que NÃO existe no backend)</div>')
        a('<table><thead><tr><th>Namespace</th><th>Procedure</th><th>Arquivo</th><th>L#</th></tr></thead><tbody>')
        for g in ghost:
            a(f'<tr><td><code>{esc(g["ns"])}</code></td><td><code>{esc(g["name"])}</code></td>'
              f'<td class="mono">{esc(g["file"])}</td><td class="lno">{g["line"]}</td></tr>')
        a('</tbody></table>')
    if dead:
        a(f'<div style="padding:12px 20px 6px;font-size:0.8em;font-weight:700;color:var(--yellow)">⚠️ Dead Procedures ({len(dead)} backend procedures nunca usadas no frontend)</div>')
        a('<table><thead><tr><th>Namespace</th><th>Procedure</th><th>Arquivo</th><th>L#</th></tr></thead><tbody>')
        for d in dead[:30]:
            a(f'<tr><td><code>{esc(d["ns"])}</code></td><td><code>{esc(d["name"])}</code></td>'
              f'<td class="mono">{esc(d["file"])}</td><td class="lno">{d.get("line","")}</td></tr>')
        if len(dead) > 30:
            a(f'<tr><td colspan="4" style="color:var(--muted);padding:10px">... e mais {len(dead)-30}</td></tr>')
        a('</tbody></table>')
    a('</div></details>')

    # ── PROCEDURES BACKEND ──
    if be_procs:
        a(f"""<details><summary><div class="sec-head">
<h2><span class="arrow">▶</span>📡 Procedures Backend ({len(be_procs)})</h2>
<span class="cnt">{len(be_procs)}</span></div></summary>
<div class="sec-body"><table>
<thead><tr><th>Namespace</th><th>Procedure</th><th>Tipo</th><th>Arquivo</th><th>L#</th></tr></thead><tbody>""")
        kind_colors = {"public":"var(--accent)","protected":"var(--yellow)","admin":"var(--red)","unknown":"var(--muted)"}
        for p in sorted(be_procs, key=lambda x:(x["namespace"],x["name"])):
            kc = kind_colors.get(p["kind"],"var(--muted)")
            a(f'<tr><td><code>{esc(p["namespace"])}</code></td><td><code>{esc(p["name"])}</code></td>'
              f'<td><span style="color:{kc};font-size:0.78em;font-weight:600">{esc(p["kind"])}</span></td>'
              f'<td class="mono">{esc(p["file"])}</td><td class="lno">{p["line"]}</td></tr>')
        a('</tbody></table></div></details>')

    # ── DB SCHEMA ──
    if tables:
        a(f"""<details><summary><div class="sec-head">
<h2><span class="arrow">▶</span>🗄️ Tabelas do Banco ({len(tables)})</h2>
<span class="cnt">{len(tables)}</span></div></summary>
<div class="sec-body"><table>
<thead><tr><th>Variável TS</th><th>Tabela SQL</th><th>Arquivo</th></tr></thead><tbody>""")
        for t in tables:
            a(f'<tr><td><code>{esc(t["var_name"])}</code></td><td><code>{esc(t["table_name"])}</code></td>'
              f'<td class="mono">{esc(t["file"])}</td></tr>')
        a('</tbody></table></div></details>')

    # ── AUTOFIX RESULTS ──
    if fixes:
        a(f"""<details open><summary><div class="sec-head">
<h2><span class="arrow">▶</span>🔧 Fixes Aplicados</h2>
<span class="cnt">{len(fixes)}</span></div></summary>
<div class="sec-body">""")
        for fx in fixes:
            a(f'<div class="fix-row">')
            a(f'<span class="fix-kind">{esc(fx.kind)}</span>')
            a(f'<div><span class="mono">{esc(fx.file)}</span> — {esc(fx.note)}</div>')
            if fx.before and fx.after:
                a(f'<div style="font-size:0.78em;color:var(--muted)"><del>{esc(fx.before[:40])}</del> → <code>{esc(fx.after[:40])}</code></div>')
            a('</div>')
        a('</div></details>')

    # ── FOOTER ──
    a(f'<div style="margin-top:48px;padding:24px 0;border-top:1px solid var(--border);color:var(--muted);font-size:0.78em;text-align:center;font-family:\'IBM Plex Mono\',monospace">')
    a(f'Shadia Doctor v2.0 &nbsp;·&nbsp; {esc(report["generated_at"])} &nbsp;·&nbsp; <a href="https://shadiahasan.club">shadiahasan.club</a>')
    a(f'</div>')

    a('</div>')  # .wrap
    a("""<script>
function switchTab(id) {
  document.querySelectorAll('.tab').forEach((t,i)=>{
    const ids=['critical','warning','info'];
    t.classList.toggle('active', ids[i]===id);
  });
  document.querySelectorAll('.tab-pane').forEach(p=>{
    p.classList.toggle('active', p.id==='tab-'+id);
  });
}
// Arrow rotation on details toggle
document.querySelectorAll('details').forEach(d=>{
  d.addEventListener('toggle',()=>{
    const arr = d.querySelector('.arrow');
    if(arr) arr.style.transform = d.open ? 'rotate(90deg)' : 'rotate(0deg)';
  });
});
</script>
</body></html>""")

    out.write_text("\n".join(H), encoding="utf-8")
    print(f"✅ HTML: {out}")


# ═══════════════════════════════ MAIN ═════════════════════════════════════════

def generate_env_files(root: Path, dev_env: Path) -> None:
    """Gera .env.development e .env.production a partir do .env atual."""
    if not dev_env.exists():
        print(f"  ⚠️  {dev_env} não encontrado — pulando geração de .env")
        return

    dev_text = dev_env.read_text(encoding="utf-8", errors="ignore")

    # Extrair valores do .env de desenvolvimento
    def get_val(key: str) -> str:
        m = re.search(rf'^{re.escape(key)}\s*=\s*(.+)$', dev_text, re.M)
        return m.group(1).strip().strip('"\'') if m else ""

    google_id     = get_val("GOOGLE_CLIENT_ID")
    google_secret = get_val("GOOGLE_CLIENT_SECRET")
    jwt_secret    = get_val("JWT_SECRET")
    session_secret= get_val("SESSION_SECRET")
    resend_key    = get_val("RESEND_API_KEY")
    stripe_secret = get_val("STRIPE_SECRET_KEY")
    stripe_pub    = get_val("STRIPE_PUBLISHABLE_KEY")
    stripe_wh     = get_val("STRIPE_WEBHOOK_SECRET")
    email_from    = get_val("EMAIL_FROM")
    price_basico  = get_val("STRIPE_PRICE_BASICO")
    price_premium = get_val("STRIPE_PRICE_PREMIUM")
    price_vip     = get_val("STRIPE_PRICE_VIP")
    prod_basico   = get_val("STRIPE_PROD_BASICO")
    prod_premium  = get_val("STRIPE_PROD_PREMIUM")
    prod_vip      = get_val("STRIPE_PROD_VIP")
    dev_admin_key = get_val("DEV_ADMIN_KEY")

    timestamp = datetime.datetime.now().strftime("%Y-%m-%d %H:%M")

    # ── .env.development (local) ──
    env_dev = f"""\
# ================================================================
# .env.development — Ambiente LOCAL (localhost)
# Gerado por Shadia Doctor v2.3 em {timestamp}
# ================================================================

# ── Ambiente ──
NODE_ENV=development
PORT=3001

# ── URLs ──
SITE_URL=http://localhost:3001
API_URL=http://localhost:3001
OAUTH_SERVER_URL=http://localhost:3001

# ── Frontend (Vite → browser) ──
VITE_APP_NAME="Shadia Hasan Club"
VITE_APP_URL=http://localhost:3001
VITE_API_URL=http://localhost:3001
VITE_STRIPE_PUBLISHABLE_KEY={stripe_pub}
VITE_ANALYTICS_ENDPOINT=
VITE_ANALYTICS_WEBSITE_ID=

# ── Database ──
# Para rodar local: mysql://USER:SENHA@localhost:3306/shadia_local
DATABASE_URL=mysql://shadia:Shadia%4012345@localhost:3306/shadia_local

# ── Auth / Sessions ──
JWT_SECRET={jwt_secret}
SESSION_SECRET={session_secret}
COOKIE_SECURE=false
COOKIE_SAMESITE=lax
COOKIE_DOMAIN=

# ── Bootstrap Admin (DEV ONLY) ──
DEV_ADMIN_KEY={dev_admin_key}

# ── Google OAuth (DEV) ──
GOOGLE_CLIENT_ID={google_id}
GOOGLE_CLIENT_SECRET={google_secret}
GOOGLE_CALLBACK_URL=http://localhost:3001/api/auth/google/callback

# ── Apple OAuth (quando ativar) ──
APPLE_CLIENT_ID=
APPLE_TEAM_ID=
APPLE_KEY_ID=
APPLE_PRIVATE_KEY=

# ── Email (Resend) ──
RESEND_API_KEY={resend_key}
EMAIL_FROM={email_from}

# ── Stripe ──
STRIPE_SECRET_KEY={stripe_secret}
STRIPE_PUBLISHABLE_KEY={stripe_pub}
STRIPE_WEBHOOK_SECRET={stripe_wh}

# ── Planos Stripe ──
STRIPE_PRICE_BASICO={price_basico}
STRIPE_PRICE_PREMIUM={price_premium}
STRIPE_PRICE_VIP={price_vip}
STRIPE_PROD_BASICO={prod_basico}
STRIPE_PROD_PREMIUM={prod_premium}
STRIPE_PROD_VIP={prod_vip}
"""

    # ── .env.production (Render.com — shadiahasan.club) ──
    env_prod = f"""\
# ================================================================
# .env.production — Produção no Render.com
# Domínio: https://shadiahasan.club  |  https://shadiahasan.com
# Gerado por Shadia Doctor v2.3 em {timestamp}
#
# ⚠️  IMPORTANTE:
#   1. NÃO commite este arquivo no Git!
#   2. Configure as variáveis diretamente no Render.com Dashboard:
#      https://dashboard.render.com → seu serviço → Environment
#   3. No Google Cloud Console → APIs & Services → Credentials
#      OAuth 2.0 Client → Authorized redirect URIs — adicione:
#        https://shadiahasan.club/api/auth/google/callback
#        https://shadiahasan.com/api/auth/google/callback
#        http://localhost:3001/api/auth/google/callback (manter para dev)
# ================================================================

# ── Ambiente ──
NODE_ENV=production
PORT=10000

# ── URLs de Produção ──
# O Render.com usa PORT=10000 internamente e redireciona via proxy
SITE_URL=https://shadiahasan.club
API_URL=https://shadiahasan.club
OAUTH_SERVER_URL=https://shadiahasan.club

# ── Frontend (Vite → browser) ──
VITE_APP_NAME="Shadia Hasan Club"
VITE_APP_URL=https://shadiahasan.club
VITE_API_URL=https://shadiahasan.club
VITE_STRIPE_PUBLISHABLE_KEY={stripe_pub}
VITE_ANALYTICS_ENDPOINT=
VITE_ANALYTICS_WEBSITE_ID=

# ── Database ──
# Use a URL do banco MySQL/TiDB em produção fornecida pelo seu provedor
# Ex Render.com (PostgreSQL): postgresql://user:pass@host/db
# Ex PlanetScale/TiDB: mysql://user:pass@host:3306/shadia_prod?ssl=true
DATABASE_URL=PREENCHA_COM_URL_DO_BANCO_DE_PRODUCAO

# ── Auth / Sessions ──
JWT_SECRET={jwt_secret}
SESSION_SECRET={session_secret}
# Em produção: cookies DEVEM ser secure=true (HTTPS)
COOKIE_SECURE=true
COOKIE_SAMESITE=none
# Domain para cookies (permite subdomínios)
COOKIE_DOMAIN=shadiahasan.club

# ── Bootstrap Admin ──
# Remova DEV_ADMIN_KEY em produção ou mantenha seguro
DEV_ADMIN_KEY={dev_admin_key}

# ── Google OAuth (PRODUÇÃO) ──
# ⚠️ A CALLBACK_URL DEVE SER A DE PRODUÇÃO — NUNCA localhost em prod!
GOOGLE_CLIENT_ID={google_id}
GOOGLE_CLIENT_SECRET={google_secret}
GOOGLE_CALLBACK_URL=https://shadiahasan.club/api/auth/google/callback

# ── Apple OAuth (quando ativar) ──
APPLE_CLIENT_ID=
APPLE_TEAM_ID=
APPLE_KEY_ID=
APPLE_PRIVATE_KEY=

# ── Email (Resend) ──
RESEND_API_KEY={resend_key}
EMAIL_FROM={email_from}

# ── Stripe (PRODUÇÃO — use chaves live) ──
STRIPE_SECRET_KEY={stripe_secret}
STRIPE_PUBLISHABLE_KEY={stripe_pub}
# STRIPE_WEBHOOK_SECRET: gere no dashboard Stripe → Webhooks
# URL do webhook: https://shadiahasan.club/api/stripe/webhook
STRIPE_WEBHOOK_SECRET={stripe_wh if stripe_wh else "GERE_NO_STRIPE_DASHBOARD"}

# ── Planos Stripe ──
STRIPE_PRICE_BASICO={price_basico}
STRIPE_PRICE_PREMIUM={price_premium}
STRIPE_PRICE_VIP={price_vip}
STRIPE_PROD_BASICO={prod_basico}
STRIPE_PROD_PREMIUM={prod_premium}
STRIPE_PROD_VIP={prod_vip}
"""

    # ── render.yaml (se não existir) ──
    render_yaml = f"""\
# render.yaml — Configuração de deploy no Render.com
# Gerado por Shadia Doctor v2.3 em {timestamp}
# Docs: https://render.com/docs/render-yaml

services:
  - type: web
    name: shadia-hasan-club
    env: node
    region: ohio  # ou: oregon, frankfurt, singapore
    plan: starter  # ou: free (limitado), standard
    buildCommand: pnpm install && pnpm build
    startCommand: node dist/server/index.js
    healthCheckPath: /api/health

    envVars:
      - key: NODE_ENV
        value: production
      - key: PORT
        value: 10000

      # ── URLs ──
      - key: SITE_URL
        value: https://shadiahasan.club
      - key: API_URL
        value: https://shadiahasan.club
      - key: OAUTH_SERVER_URL
        value: https://shadiahasan.club

      # ── Frontend ──
      - key: VITE_APP_NAME
        value: "Shadia Hasan Club"
      - key: VITE_APP_URL
        value: https://shadiahasan.club
      - key: VITE_API_URL
        value: https://shadiahasan.club

      # ── Secrets (configure manualmente no dashboard Render) ──
      - key: DATABASE_URL
        sync: false  # preencher manualmente no dashboard
      - key: JWT_SECRET
        sync: false
      - key: SESSION_SECRET
        sync: false
      - key: GOOGLE_CLIENT_ID
        sync: false
      - key: GOOGLE_CLIENT_SECRET
        sync: false
      - key: GOOGLE_CALLBACK_URL
        value: https://shadiahasan.club/api/auth/google/callback
      - key: STRIPE_SECRET_KEY
        sync: false
      - key: STRIPE_PUBLISHABLE_KEY
        sync: false
      - key: STRIPE_WEBHOOK_SECRET
        sync: false
      - key: RESEND_API_KEY
        sync: false

      # ── Stripe plans ──
      - key: STRIPE_PRICE_BASICO
        value: {price_basico}
      - key: STRIPE_PRICE_PREMIUM
        value: {price_premium}
      - key: STRIPE_PRICE_VIP
        value: {price_vip}

      # ── Cookies ──
      - key: COOKIE_SECURE
        value: "true"
      - key: COOKIE_SAMESITE
        value: none
      - key: COOKIE_DOMAIN
        value: shadiahasan.club
"""

    out = root / "shadia_out"
    out.mkdir(exist_ok=True)

    (out / ".env.development").write_text(env_dev, encoding="utf-8")
    (out / ".env.production").write_text(env_prod, encoding="utf-8")
    (out / "render.yaml.example").write_text(render_yaml, encoding="utf-8")

    print(f"\n✅ .env.development → {out / '.env.development'}")
    print(f"✅ .env.production  → {out / '.env.production'}")
    print(f"✅ render.yaml.example → {out / 'render.yaml.example'}")
    print(f"\n⚠️  ATENÇÃO:")
    print(f"   • O .env.production tem chaves REAIS — NUNCA commite no Git!")
    print(f"   • Configure as variáveis 'sync: false' manualmente no Render dashboard")
    print(f"   • No Google Cloud Console, cadastre ambas as URLs de callback:")
    print(f"     https://shadiahasan.club/api/auth/google/callback")
    print(f"     https://shadiahasan.com/api/auth/google/callback")
    print(f"     http://localhost:3001/api/auth/google/callback")


def restore_from_backup(root: Path, backup_dir_str: Optional[str] = None) -> None:
    """
    Restaura arquivos a partir do backup mais recente em .shadia_backups/.
    Use quando um fix estragou algum arquivo.
    """
    bdir_root = root / ".shadia_backups"
    if not bdir_root.exists():
        print("  ⚠️  Nenhum backup encontrado em .shadia_backups/")
        return

    # Usar pasta especificada ou a mais recente
    if backup_dir_str:
        bdir = Path(backup_dir_str)
    else:
        subdirs = sorted([d for d in bdir_root.iterdir() if d.is_dir()])
        if not subdirs:
            print("  ⚠️  Pasta .shadia_backups/ existe mas está vazia")
            return
        bdir = subdirs[-1]   # mais recente

    print(f"\n🔄 Restaurando de: {bdir}")
    restored = 0
    for backup_file in bdir.iterdir():
        if not backup_file.is_file():
            continue
        # Reconstruir path original: "__" vira "/"
        rel = backup_file.name.replace("__", "/")
        orig = root / rel
        orig.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(backup_file, orig)
        print(f"  ✅ Restaurado: {rel}")
        restored += 1

    if restored == 0:
        print("  ⚠️  Nenhum arquivo para restaurar")
    else:
        print(f"\n  ✅ {restored} arquivo(s) restaurado(s) do backup {bdir.name}")
        print(f"     Execute 'pnpm build' novamente para verificar.")


def main():
    ap = argparse.ArgumentParser(
        description="Shadia Doctor v2.3 — Auditoria + Diagnóstico + Autofix",
        formatter_class=argparse.RawTextHelpFormatter,
    )
    ap.add_argument("--root",    default=".",  help="Raiz do projeto")
    ap.add_argument("--out",     default="shadia_out", help="Pasta de saída")
    ap.add_argument("--apply",   action="store_true", help="Gravar fixes (senão dry-run)")
    ap.add_argument("--dry-run", action="store_true", help="Mostrar diff sem gravar")
    ap.add_argument("--no-html", action="store_true", help="Não gerar HTML")
    ap.add_argument("--fail-on-critical", action="store_true",
                    help="Sair com código 1 se houver issues CRITICAL (para CI)")
    ap.add_argument("--gen-env", action="store_true",
                    help="Gerar .env.development e .env.production para Render.com")
    ap.add_argument("--env-file", default=".env",
                    help="Caminho do .env de origem para --gen-env (default: .env)")
    ap.add_argument("--debug-app", action="store_true",
                    help="Mostrar primeiras 80 linhas do App.tsx para diagnóstico")
    ap.add_argument("--restore", action="store_true",
                    help="Restaurar arquivos do backup mais recente (desfaz --apply)")
    ap.add_argument("--restore-from", default=None, metavar="BACKUP_DIR",
                    help="Restaurar de backup específico (ex: .shadia_backups/20260226_101153)")
    # Fix flags
    ap.add_argument("--fix-all",     action="store_true",
                    help="Ativar todos os fixers seguros (links, rotas, stubs, console)\n"
                         "NÃO inclui --fix-oauth (requer revisão manual)")
    ap.add_argument("--fix-links",   action="store_true", help="Corrigir links quebrados")
    ap.add_argument("--fix-routes",  action="store_true", help="Adicionar rotas no App.tsx")
    ap.add_argument("--fix-oauth",   action="store_true",
                    help="Corrigir chamadas OAuth diretas (use com cuidado — revise o resultado)")
    ap.add_argument("--fix-console", action="store_true", help="Comentar console.log")
    ap.add_argument("--create-stubs",action="store_true", help="Criar stubs TSX para rotas faltando")
    ap.add_argument("--disable-unfixable", action="store_true",
                    help='Links não corrigíveis viram href="#"')
    args = ap.parse_args()

    root    = Path(args.root).resolve()
    out_dir = root / args.out
    out_dir.mkdir(parents=True, exist_ok=True)

    print(f"\n{'='*64}")
    print(f"  🩺  SHADIA DOCTOR v2.3")
    print(f"  Projeto: {root}")
    print(f"{'='*64}\n")

    # ── Restaurar backup ──
    if args.restore or args.restore_from:
        restore_from_backup(root, args.restore_from)
        return

    # ── Gerar .env de produção ──
    if args.gen_env:
        env_src = Path(args.env_file)
        if not env_src.is_absolute():
            env_src = root / args.env_file
        generate_env_files(root, env_src)
        print()

    report = run_full_audit(root)

    # ── Debug App.tsx ──
    if args.debug_app:
        dbg = report.get("app_debug", {})
        if dbg.get("found"):
            print(f"\n{'─'*56}")
            print(f"  🔎 DEBUG App.tsx: {dbg['path']}")
            print(f"  Switch: {dbg['has_switch']} | Route: {dbg['has_route']} | "
                  f"Wouter: {dbg['has_wouter_import']} | paths_raw: {dbg['route_count_raw']}")
            if dbg.get("raw_paths_found"):
                print(f"  Paths encontrados: {dbg['raw_paths_found'][:10]}")
            print(f"{'─'*56}")
            print(f"\n  📄 Primeiras 80 linhas do App.tsx:")
            print(f"{'─'*56}")
            for i, ln in enumerate(dbg.get("first_80_lines","").split("\n"), 1):
                print(f"  {i:3d} | {ln}")
            print(f"{'─'*56}\n")
        else:
            print("\n  ⚠️  App.tsx não encontrado para debug\n")

    # ── Autofix ──
    fixes: List[Fix] = []
    bdir_str = ""
    any_fix = any([args.fix_all, args.fix_links, args.fix_routes,
                   args.fix_oauth, args.fix_console, args.create_stubs])
    if any_fix:
        # ⚠️ --fix-oauth NUNCA está incluído em --fix-all
        # Precisa ser explicitamente solicitado com --fix-oauth
        cfg = {
            "apply":            args.apply,
            "fix_links":        args.fix_links or args.fix_all,
            "fix_routes":       args.fix_routes or args.fix_all,
            "fix_oauth":        args.fix_oauth,   # NUNCA args.fix_all aqui
            "fix_console":      args.fix_console or args.fix_all,
            "create_stubs":     args.create_stubs or args.fix_all,
            "disable_unfixable":args.disable_unfixable,
        }
        mode = "APPLY (gravando)" if args.apply else "DRY-RUN (simulando)"
        print(f"\n🔧 Modo fix: {mode}")
        if cfg["fix_oauth"]:
            print(f"  ⚠️  --fix-oauth ativo: revise os arquivos alterados antes do build!")
        fixes, bdir_str = run_autofix(root, report, cfg)
        print(f"   Fixes: {len(fixes)}")
        if args.apply and bdir_str:
            print(f"   Backups: {bdir_str}")
            print(f"   Para desfazer: python shadia_doctor.py --root . --restore")

    # ── Salvar JSON ──
    j_path = out_dir / "shadia_audit.json"
    payload = {
        **report,
        "fixes": [asdict(f) for f in fixes] if fixes else [],
        "fix_mode": "APPLY" if args.apply else ("DRY_RUN" if any_fix else "AUDIT_ONLY"),
        "backup_dir": bdir_str,
    }
    j_path.write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"✅ JSON: {j_path}")

    # ── Gerar HTML ──
    if not args.no_html:
        h_path = out_dir / "shadia_report.html"
        write_html(h_path, report, fixes if fixes else None)

    # ── Console summary ──
    s = report["scores"]
    c = report["counts"]
    print(f"\n{'─'*48}")
    print(f"  📊  SCORES")
    print(f"{'─'*48}")
    for k, v in s.items():
        e = "🟢" if v>=80 else "🟡" if v>=50 else "🔴"
        print(f"  {e}  {k:<22}  {v:>3}/100")

    print(f"\n{'─'*48}")
    print(f"  📋  CONTAGENS")
    print(f"{'─'*48}")
    for k, v in c.items():
        print(f"  •  {k:<35} {v}")

    print(f"\n{'─'*48}")
    print(f"  💡  DIAGNÓSTICO")
    print(f"{'─'*48}")

    dbg = report.get("app_debug", {})
    if c["routes_detected"] == 0:
        print("  🔴  ZERO rotas detectadas!")
        if dbg.get("found"):
            print(f"      App.tsx: {dbg['path']}")
            print(f"      <Switch>: {dbg['has_switch']} | <Route>: {dbg['has_route']} | "
                  f"Wouter: {dbg['has_wouter_import']} | paths_raw: {dbg['route_count_raw']}")
            if dbg.get("raw_paths_found"):
                print(f"      Paths no arquivo: {dbg['raw_paths_found'][:5]}")
            print(f"      → Execute com --debug-app para ver as primeiras 80 linhas")
        else:
            print("      → App.tsx NÃO ENCONTRADO em client/src/App.tsx ou src/App.tsx")

    if c["ghost_calls"] > 0:
        print(f"  🔴  {c['ghost_calls']} Ghost calls tRPC → erros 500 em runtime!")
    if c["broken_links"] > 0:
        print(f"  ⚠️   {c['broken_links']} links quebrados")
    if c["security_criticals"] > 0:
        print(f"  🔴  {c['security_criticals']} riscos CRÍTICOS de segurança!")

    auth_issues_list = [i for i in report["issues"] if i["category"]=="Auth" and i["severity"]=="CRITICAL"]
    if auth_issues_list:
        print(f"\n  🔐  GOOGLE LOGIN — Problemas encontrados:")
        for ai in auth_issues_list:
            print(f"      🔴 {ai['title']}")
            if ai.get("fix_hint"):
                for ln in ai["fix_hint"].split("\n")[:3]:
                    print(f"         {ln}")

    print(f"\n  📁  Saída: {out_dir}")
    print(f"\n  🔧  Comandos úteis:")
    print(f"      # Auditoria sem modificar arquivos:")
    print(f"      python shadia_doctor.py --root .")
    print(f"      # Fixes SEGUROS (links, rotas, stubs, console — SEM oauth):")
    print(f"      python shadia_doctor.py --root . --apply --fix-all")
    print(f"      # Desfazer último --apply (restaurar backups):")
    print(f"      python shadia_doctor.py --root . --restore")
    print(f"      # Gerar .env de desenvolvimento e produção:")
    print(f"      python shadia_doctor.py --root . --gen-env")
    print(f"      # CI/CD (falha se houver críticos):")
    print(f"      python shadia_doctor.py --root . --fail-on-critical\n")

    if args.fail_on_critical and c["issues_critical"] > 0:
        sys.exit(1)


if __name__ == "__main__":
    main()

