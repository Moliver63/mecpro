#!/usr/bin/env python3
# super_audit.py  —  Auditoria Completa: Navegação + Backend/Frontend Alignment
# Shadia VR Platform  |  Stack: React+Wouter / Node+tRPC / Drizzle+MySQL
# ============================================================================
from __future__ import annotations

import argparse
import json
import re
from dataclasses import dataclass, asdict, field
from pathlib import Path
from typing import Dict, List, Optional, Set, Tuple
from datetime import datetime

# ─────────────────────────── CONFIG ─────────────────────────────────────────

SKIP_DIRS: Set[str] = {
    "node_modules", "dist", "build", ".git", ".turbo", ".next",
    ".vite", ".cache", ".pnpm", ".repo_doctor", ".doctor_backups",
    "nav_audit", "super_audit",
}

# Globs para páginas do frontend
PAGE_GLOBS = [
    "src/pages/**/*.tsx",
    "client/src/pages/**/*.tsx",
]

# Globs para código frontend (links, rotas, uso de tRPC)
FRONTEND_GLOBS = [
    "src/**/*.ts", "src/**/*.tsx",
    "client/src/**/*.ts", "client/src/**/*.tsx",
]

# Globs para código backend (definição de tRPC)
BACKEND_GLOBS = [
    "server/**/*.ts",
    "server/**/*.tsx",
    "routers/**/*.ts",
]

# Arquivos de schema Drizzle
SCHEMA_GLOBS = [
    "drizzle/schema.ts",
    "drizzle/**/*.ts",
    "db/schema.ts",
    "server/schema.ts",
]

# Arquivos de rotas específicos (App.tsx + variantes)
APP_FILES_PATTERNS = ["App.tsx", "app.tsx", "Router.tsx", "routes.tsx", "Routes.tsx"]

# ─────────────────── REGEX PATTERNS ──────────────────────────────────────────

# --- ROTAS WOUTER (todas as variantes) ---
# <Route path="/x" component={Comp} />
ROUTE_COMPONENT_RE = re.compile(
    r"""<Route\b(?=[^>]*\bpath\s*=\s*["']([^"']+)["'])(?=[^>]*\bcomponent\s*=\s*\{([^}]+)\})[^>]*/?>""",
    re.MULTILINE,
)
# <Route component={Comp} path="/x" /> (ordem invertida)
ROUTE_COMPONENT_INV_RE = re.compile(
    r"""<Route\b(?=[^>]*\bcomponent\s*=\s*\{([^}]+)\})(?=[^>]*\bpath\s*=\s*["']([^"']+)["'])[^>]*/?>""",
    re.MULTILINE,
)
# <Route path="/x"><Comp /></Route>
ROUTE_CHILD_RE = re.compile(
    r"""<Route\b[^>]*\bpath\s*=\s*["']([^"']+)["'][^>]*>\s*(?:<>)?\s*<([A-Za-z][A-Za-z0-9_]*)""",
    re.MULTILINE | re.DOTALL,
)
# <Route path="/x">{() => <Comp />}</Route>
ROUTE_RENDERFN_RE = re.compile(
    r"""<Route\b[^>]*\bpath\s*=\s*["']([^"']+)["'][^>]*>\s*\{[^}]*=>\s*<([A-Za-z][A-Za-z0-9_]*)""",
    re.MULTILINE | re.DOTALL,
)
# useRoute("/x")  — rota declarada via hook
USE_ROUTE_RE = re.compile(r"""useRoute\(\s*["']([^"']+)["']\s*\)""", re.MULTILINE)

# --- LINKS ---
WOUTER_LINK_RE   = re.compile(r"""<Link\b[^>]*\bhref\s*=\s*["']([^"']+)["']""", re.MULTILINE)
ANCHOR_RE        = re.compile(r"""<a\b[^>]*\bhref\s*=\s*["']([^"']+)["']""", re.MULTILINE)
SETLOC_RE        = re.compile(r"""setLocation\(\s*["']([^"']+)["']\s*\)""", re.MULTILINE)
NAVIGATE_RE      = re.compile(r"""navigate\(\s*["']([^"']+)["']\s*\)""", re.MULTILINE)
PUSH_RE          = re.compile(r"""\.push\(\s*["']([^"']+)["']\s*\)""", re.MULTILINE)
REPLACE_RE       = re.compile(r"""\.replace\(\s*["']([^"']+)["']\s*\)""", re.MULTILINE)
HREF_ASSIGN_RE   = re.compile(r"""(?:location\.href|window\.location)\s*=\s*["']([^"']+)["']""", re.MULTILINE)

# --- tRPC USO NO FRONTEND ---
# trpc.namespace.procedure.useQuery / useMutation / useSubscription / mutate / query
TRPC_USE_RE = re.compile(
    r"""trpc\.([A-Za-z_][A-Za-z0-9_]*)\.([A-Za-z_][A-Za-z0-9_]*)\.(?:useQuery|useMutation|useSubscription|useSuspenseQuery|useInfiniteQuery|mutate(?:Async)?|query)""",
    re.MULTILINE,
)
# trpc.useUtils() / trpc.xxx.yyy.invalidate()
TRPC_UTILS_RE = re.compile(
    r"""trpc\.([A-Za-z_][A-Za-z0-9_]*)\.([A-Za-z_][A-Za-z0-9_]*)\.(?:invalidate|refetch|setData|cancel)""",
    re.MULTILINE,
)

# --- tRPC DEFINIÇÃO NO BACKEND ---
# namespace: router({ ... })
TRPC_ROUTER_NS_RE = re.compile(
    r"""([A-Za-z_][A-Za-z0-9_]*)\s*:\s*(?:router|createRouter)\s*\(\s*\{""",
    re.MULTILINE,
)
# procedure: publicProcedure / protectedProcedure / adminProcedure
TRPC_PROC_RE = re.compile(
    r"""([A-Za-z_][A-Za-z0-9_]*)\s*:\s*(publicProcedure|protectedProcedure|adminProcedure|procedure)\b""",
    re.MULTILINE,
)
# appRouter: t.router({ ... })
TRPC_APP_ROUTER_RE = re.compile(
    r"""(?:appRouter|router)\s*=\s*(?:t\.)?(?:router|createRouter)\s*\(\s*\{""",
    re.MULTILINE,
)

# --- SCHEMA DRIZZLE ---
# export const tableName = mysqlTable / pgTable / sqliteTable
DRIZZLE_TABLE_RE = re.compile(
    r"""export\s+const\s+([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(?:mysqlTable|pgTable|sqliteTable|table)\s*\(\s*['"]([^'"]+)['"]""",
    re.MULTILINE,
)

# --- RISCOS DE SEGURANÇA ---
LOCALHOST_RE     = re.compile(r"\b(localhost|127\.0\.0\.1)\b|:(3001|5173|4000|8080)\b")
HARDCODE_URL_RE  = re.compile(r"""(?:fetch|axios\.get|axios\.post)\s*\(\s*["'](https?://(?!shadiahasan)[^"']+)["']""", re.MULTILINE)
OPEN_REDIRECT_RE = re.compile(r"""(?:redirect|location\.href|res\.redirect)\s*\([^)]*\bnext\b""", re.IGNORECASE)
HARDCODE_KEY_RE  = re.compile(r"""(?:apiKey|api_key|secret|password|token)\s*[:=]\s*["'][A-Za-z0-9_\-\.]{10,}["']""", re.IGNORECASE)
CONSOLE_LOG_RE   = re.compile(r"""\bconsole\.log\s*\(""")
TODO_FIXME_RE    = re.compile(r"""//\s*(?:TODO|FIXME|HACK|XXX|BUG)\b""", re.IGNORECASE)

# --- IMPORTS SUSPEITOS ---
DIRECT_DB_IMPORT_RE = re.compile(r"""(?:^|\s)import.*from.*['"]\.*\.\.?/db['"]""", re.MULTILINE)
MISSING_AUTH_CHECK_RE = re.compile(r"""publicProcedure\s*\.\s*(?:input|mutation|query)""")

# ─────────────────────── DATA CLASSES ────────────────────────────────────────

@dataclass
class Issue:
    severity: str   # CRITICAL | WARNING | INFO
    category: str
    file: str
    line: int
    title: str
    detail: str

@dataclass
class RouteFinding:
    file: str
    path: str
    component: Optional[str]
    zone: str
    source: str   # wouter | useRoute | express | manual

@dataclass
class LinkFinding:
    file: str
    href: str
    kind: str
    line: int
    zone_guess: str
    is_broken: bool = False

@dataclass
class TrpcProcedure:
    namespace: str
    name: str
    kind: str   # public | protected | admin | unknown
    file: str
    line: int

@dataclass
class TrpcUsage:
    namespace: str
    name: str
    file: str
    line: int
    method: str   # useQuery | useMutation | etc.

@dataclass
class DbTable:
    var_name: str
    table_name: str
    file: str

# ─────────────────────── HELPERS ─────────────────────────────────────────────

def iter_files(root: Path, globs: List[str]) -> List[Path]:
    seen: Set[Path] = set()
    for gp in globs:
        for p in root.glob(gp):
            if not p.is_file():
                continue
            if any(part in SKIP_DIRS for part in p.parts):
                continue
            seen.add(p)
    return sorted(seen)

def read_text(p: Path) -> str:
    return p.read_text(encoding="utf-8", errors="ignore")

def rel(p: Path, root: Path) -> str:
    return str(p.relative_to(root)).replace("\\", "/")

def lineno(text: str, idx: int) -> int:
    return text.count("\n", 0, idx) + 1

def normalize_path(p: str) -> str:
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

def classify_route(path: str) -> str:
    if "/admin" in path:
        return "ADMIN"
    if any(seg in path for seg in ("/dashboard", "/profile", "/settings", "/account", "/my-")):
        return "AUTH"
    return "PUBLIC"

def guess_zone(file_path: str) -> str:
    f = file_path.lower().replace("\\", "/")
    if "/admin" in f:
        return "ADMIN"
    return "PUBLIC"

def path_matches_route(href: str, routes: Set[str]) -> bool:
    """Verifica se href corresponde a alguma rota definida (aceita parâmetros dinâmicos)."""
    norm = normalize_path(href)
    if not norm or norm == "/":
        return True
    if norm in routes:
        return True
    # Checar rotas dinâmicas: /course/:id  vs  /course/123
    for r in routes:
        if ":" in r or "*" in r:
            rparts = r.split("/")
            hparts = norm.split("/")
            if len(rparts) == len(hparts):
                if all(rp.startswith(":") or rp == hp for rp, hp in zip(rparts, hparts)):
                    return True
    return False

# ─────────────────────── SCANNERS ─────────────────────────────────────────────

def scan_routes(files: List[Path], root: Path) -> List[RouteFinding]:
    routes: List[RouteFinding] = []
    seen: Set[Tuple] = set()

    def add(path: str, comp: Optional[str], file_rel: str, source: str):
        path = normalize_path(path)
        if not path:
            return
        comp = (comp or "").strip()
        key = (path, comp or "")
        if key in seen:
            return
        seen.add(key)
        routes.append(RouteFinding(file_rel, path, comp or None, classify_route(path), source))

    for f in files:
        txt = read_text(f)
        fr  = rel(f, root)

        for m in ROUTE_COMPONENT_RE.finditer(txt):
            add(m.group(1), m.group(2), fr, "wouter")
        for m in ROUTE_COMPONENT_INV_RE.finditer(txt):
            add(m.group(2), m.group(1), fr, "wouter")
        for m in ROUTE_CHILD_RE.finditer(txt):
            add(m.group(1), m.group(2), fr, "wouter-child")
        for m in ROUTE_RENDERFN_RE.finditer(txt):
            add(m.group(1), m.group(2), fr, "wouter-fn")
        for m in USE_ROUTE_RE.finditer(txt):
            add(m.group(1), None, fr, "useRoute")

    return routes


def scan_links(files: List[Path], root: Path, route_paths: Set[str]) -> Tuple[List[LinkFinding], List[LinkFinding], List[LinkFinding]]:
    internal: List[LinkFinding] = []
    external: List[LinkFinding] = []
    broken:   List[LinkFinding] = []

    for f in files:
        txt = read_text(f)
        fr  = rel(f, root)
        zg  = guess_zone(fr)

        patterns = [
            (WOUTER_LINK_RE, "Link"),
            (ANCHOR_RE,      "<a>"),
            (SETLOC_RE,      "setLocation"),
            (NAVIGATE_RE,    "navigate"),
            (PUSH_RE,        "push"),
            (HREF_ASSIGN_RE, "location.href"),
        ]
        for rx, kind in patterns:
            for m in rx.finditer(txt):
                href = m.group(1).strip()
                if not href or href.startswith("#") or href.startswith("data:"):
                    continue
                ln = lineno(txt, m.start())
                lf = LinkFinding(fr, href, kind, ln, zg)
                if is_external(href):
                    external.append(lf)
                elif href.startswith("/"):
                    if href.startswith(("/api", "/assets", "/favicon", "/public", "/static")):
                        continue
                    internal.append(lf)
                    if not path_matches_route(href, route_paths):
                        lf.is_broken = True
                        broken.append(lf)

    return internal, external, broken


def scan_trpc_backend(files: List[Path], root: Path) -> List[TrpcProcedure]:
    """Extrai procedures tRPC definidas no backend."""
    procedures: List[TrpcProcedure] = []

    for f in files:
        txt   = read_text(f)
        fr    = rel(f, root)
        lines = txt.split("\n")

        # Estratégia: encontrar namespaces e procedures no mesmo arquivo
        # Construir mapa de contexto via indentação aproximada
        current_ns = "__root__"
        ns_stack: List[str] = []

        for i, line in enumerate(lines, 1):
            # Detectar abertura de namespace
            nm = re.search(r"""([A-Za-z_][A-Za-z0-9_]*)\s*:\s*(?:router|createRouter)\s*\(""", line)
            if nm:
                current_ns = nm.group(1)
                ns_stack.append(current_ns)

            # Detectar procedure
            pm = TRPC_PROC_RE.search(line)
            if pm:
                proc_name  = pm.group(1)
                proc_type  = pm.group(2)
                kind_map   = {
                    "publicProcedure":    "public",
                    "protectedProcedure": "protected",
                    "adminProcedure":     "admin",
                    "procedure":          "unknown",
                }
                kind = kind_map.get(proc_type, "unknown")
                ns   = ns_stack[-1] if ns_stack else "__root__"
                procedures.append(TrpcProcedure(ns, proc_name, kind, fr, i))

            # Detectar fechamento de namespace (heurística: linha com apenas "}")
            stripped = line.strip()
            if stripped in ("}),", "})", "},") and ns_stack:
                ns_stack.pop()
                current_ns = ns_stack[-1] if ns_stack else "__root__"

    return procedures


def scan_trpc_frontend(files: List[Path], root: Path) -> List[TrpcUsage]:
    """Extrai usos de tRPC no frontend."""
    usages: List[TrpcUsage] = []
    seen: Set[Tuple] = set()

    for f in files:
        txt = read_text(f)
        fr  = rel(f, root)
        for rx in (TRPC_USE_RE, TRPC_UTILS_RE):
            for m in rx.finditer(txt):
                ns   = m.group(1)
                name = m.group(2)
                ln   = lineno(txt, m.start())
                method = m.group(0).split(".")[-1]
                key  = (ns, name, fr)
                if key not in seen:
                    seen.add(key)
                    usages.append(TrpcUsage(ns, name, fr, ln, method))

    return usages


def scan_db_schema(files: List[Path], root: Path) -> List[DbTable]:
    tables: List[DbTable] = []
    for f in files:
        txt = read_text(f)
        fr  = rel(f, root)
        for m in DRIZZLE_TABLE_RE.finditer(txt):
            tables.append(DbTable(m.group(1), m.group(2), fr))
    return tables


def scan_security(files: List[Path], root: Path) -> List[Issue]:
    issues: List[Issue] = []
    for f in files:
        txt = read_text(f)
        fr  = rel(f, root)

        for m in LOCALHOST_RE.finditer(txt):
            ln = lineno(txt, m.start())
            snippet = txt[max(0, m.start()-60):m.start()+80].replace("\n", " ").strip()
            issues.append(Issue("WARNING", "Security", fr, ln,
                                "Hardcoded localhost/port",
                                f"Detectado: `{snippet[:120]}`"))

        for m in OPEN_REDIRECT_RE.finditer(txt):
            ln = lineno(txt, m.start())
            snippet = txt[max(0, m.start()-40):m.start()+100].replace("\n", " ").strip()
            issues.append(Issue("CRITICAL", "Security", fr, ln,
                                "Possível Open Redirect via `next`",
                                f"`{snippet[:120]}`"))

        for m in HARDCODE_KEY_RE.finditer(txt):
            ln = lineno(txt, m.start())
            # mascara o valor
            raw = m.group(0)
            masked = re.sub(r'["\']\S+["\']', '"***"', raw)
            issues.append(Issue("CRITICAL", "Security", fr, ln,
                                "Chave/segredo hardcoded",
                                f"`{masked}`"))

        for m in HARDCODE_URL_RE.finditer(txt):
            ln = lineno(txt, m.start())
            issues.append(Issue("WARNING", "Security", fr, ln,
                                "URL de API hardcoded",
                                f"URL: `{m.group(1)[:80]}`"))

    return issues


def scan_code_quality(files: List[Path], root: Path) -> List[Issue]:
    issues: List[Issue] = []
    for f in files:
        txt = read_text(f)
        fr  = rel(f, root)
        for m in TODO_FIXME_RE.finditer(txt):
            ln = lineno(txt, m.start())
            snippet = txt[m.start():m.start()+80].replace("\n", " ").strip()
            issues.append(Issue("INFO", "CodeQuality", fr, ln,
                                "TODO/FIXME pendente", f"`{snippet}`"))
        count_cl = len(CONSOLE_LOG_RE.findall(txt))
        if count_cl > 3:
            issues.append(Issue("INFO", "CodeQuality", fr, 0,
                                f"Muitos console.log ({count_cl})",
                                "Remover antes de produção"))

    return issues


def scan_page_components(files: List[Path], root: Path) -> Dict[str, str]:
    """Retorna {NomeComponente: caminho_relativo} para arquivos de páginas."""
    pages: Dict[str, str] = {}
    for f in files:
        stem = f.stem
        pages[stem] = rel(f, root)
    return pages

# ─────────────────────── ANÁLISE E SCORING ────────────────────────────────────

def analyze_trpc_alignment(
    backend_procs: List[TrpcProcedure],
    frontend_usages: List[TrpcUsage],
) -> Tuple[List[Issue], Dict]:
    """Cruza procedures backend vs usos frontend."""
    issues: List[Issue] = []

    # Mapa backend: {(ns, name): TrpcProcedure}
    backend_map: Dict[Tuple[str, str], TrpcProcedure] = {}
    for p in backend_procs:
        backend_map[(p.namespace, p.name)] = p

    # Mapa frontend: {(ns, name): [TrpcUsage]}
    frontend_map: Dict[Tuple[str, str], List[TrpcUsage]] = {}
    for u in frontend_usages:
        key = (u.namespace, u.name)
        frontend_map.setdefault(key, []).append(u)

    # Procedures usadas no frontend mas não definidas no backend
    ghost_calls: List[Dict] = []
    for (ns, name), usages in frontend_map.items():
        if (ns, name) not in backend_map:
            for u in usages:
                issues.append(Issue(
                    "CRITICAL", "tRPC-Alignment",
                    u.file, u.line,
                    f"Procedure `trpc.{ns}.{name}` NÃO existe no backend",
                    f"Método usado: `{u.method}` — provavelmente causará runtime error"
                ))
                ghost_calls.append({"ns": ns, "name": name, "file": u.file, "line": u.line})

    # Procedures definidas no backend mas nunca usadas no frontend
    dead_procs: List[Dict] = []
    skip_names = {"router", "createRouter", "t", "procedure"}
    for (ns, name), proc in backend_map.items():
        if name in skip_names:
            continue
        if (ns, name) not in frontend_map:
            issues.append(Issue(
                "WARNING", "tRPC-Alignment",
                proc.file, proc.line,
                f"Procedure `{ns}.{name}` definida mas nunca usada no frontend",
                f"Tipo: `{proc.kind}` — dead code ou feature incompleta"
            ))
            dead_procs.append({"ns": ns, "name": name, "kind": proc.kind, "file": proc.file})

    # Public procedures que talvez devessem ser protegidas
    suspicious_public: List[Dict] = []
    sensitive_names = {"delete", "remove", "create", "update", "insert", "admin", "user", "profile", "payment"}
    for (ns, name), proc in backend_map.items():
        if proc.kind == "public" and any(s in name.lower() for s in sensitive_names):
            issues.append(Issue(
                "WARNING", "tRPC-Security",
                proc.file, proc.line,
                f"Procedure pública com nome sensível: `{ns}.{name}`",
                "Verificar se deveria ser `protectedProcedure` ou `adminProcedure`"
            ))
            suspicious_public.append({"ns": ns, "name": name, "file": proc.file})

    stats = {
        "backend_total": len(backend_map),
        "frontend_usages_unique": len(frontend_map),
        "ghost_calls": len(ghost_calls),
        "dead_procs": len(dead_procs),
        "suspicious_public": len(suspicious_public),
    }
    return issues, stats


def compute_scores(
    route_count: int,
    broken_links: List[LinkFinding],
    orphan_pages: List[str],
    security_issues: List[Issue],
    trpc_issues: List[Issue],
    quality_issues: List[Issue],
) -> Dict[str, int]:
    def clamp(v): return max(0, min(100, v))

    # Score de Navegação (links quebrados, órfãos)
    nav = 100
    nav -= len(broken_links) * 3
    nav -= len(orphan_pages) * 2
    if route_count == 0:
        nav -= 50

    # Score de Segurança
    sec = 100
    criticals = [i for i in security_issues if i.severity == "CRITICAL"]
    warnings  = [i for i in security_issues if i.severity == "WARNING"]
    sec -= len(criticals) * 15
    sec -= len(warnings)  * 5

    # Score de tRPC
    trpc_crit = [i for i in trpc_issues if i.severity == "CRITICAL"]
    trpc_warn = [i for i in trpc_issues if i.severity == "WARNING"]
    trpc = 100
    trpc -= len(trpc_crit) * 10
    trpc -= len(trpc_warn) * 3

    # Score de Qualidade
    qual = 100
    qual -= len([i for i in quality_issues if i.severity == "WARNING"]) * 5
    qual -= len([i for i in quality_issues if i.severity == "INFO"])    * 1

    # Score global (ponderado)
    overall = int(nav * 0.35 + sec * 0.25 + trpc * 0.30 + qual * 0.10)

    return {
        "overall": clamp(overall),
        "navigation": clamp(nav),
        "security": clamp(sec),
        "trpc_alignment": clamp(trpc),
        "code_quality": clamp(qual),
    }

# ─────────────────────── MASTER AUDIT ────────────────────────────────────────

def run_audit(root: Path) -> Dict:
    print(f"🔍 Auditando: {root}")

    page_files    = iter_files(root, PAGE_GLOBS)
    frontend_files = iter_files(root, FRONTEND_GLOBS)
    backend_files  = iter_files(root, BACKEND_GLOBS)
    schema_files   = iter_files(root, SCHEMA_GLOBS)

    # Todos os arquivos TS/TSX para scan de links e segurança
    all_ts_files  = sorted(set(frontend_files + backend_files))

    print(f"   📄 Páginas encontradas:    {len(page_files)}")
    print(f"   🖥️  Arquivos frontend:      {len(frontend_files)}")
    print(f"   ⚙️  Arquivos backend:       {len(backend_files)}")
    print(f"   🗄️  Arquivos de schema:     {len(schema_files)}")

    # 1. PÁGINAS
    pages_by_stem = scan_page_components(page_files, root)

    # 2. ROTAS (escanear TODOS os arquivos frontend + backend)
    routes = scan_routes(all_ts_files, root)
    route_paths: Set[str] = {r.path for r in routes if r.path}
    print(f"   🗺️  Rotas detectadas:       {len(routes)}")

    # Se ainda 0 rotas, buscar App.tsx explicitamente em qualquer subpasta
    if not routes:
        print("   ⚠️  Buscando App.tsx em qualquer subpasta...")
        for pattern in APP_FILES_PATTERNS:
            for app_file in root.rglob(pattern):
                if any(part in SKIP_DIRS for part in app_file.parts):
                    continue
                extra = scan_routes([app_file], root)
                routes.extend(extra)
                route_paths.update(r.path for r in extra if r.path)
        print(f"   🗺️  Rotas (pós-busca extra): {len(routes)}")

    # 3. LINKS
    internal_links, external_links, broken_links = scan_links(frontend_files, root, route_paths)
    print(f"   🔗 Links internos:         {len(internal_links)}")
    print(f"   🔗 Links quebrados:        {len(broken_links)}")

    # 4. tRPC BACKEND
    backend_procs = scan_trpc_backend(backend_files, root)
    print(f"   ⚙️  Procedures backend:     {len(backend_procs)}")

    # 5. tRPC FRONTEND
    frontend_usages = scan_trpc_frontend(frontend_files, root)
    print(f"   🖥️  Usos tRPC frontend:     {len(frontend_usages)}")

    # 6. SCHEMA
    db_tables = scan_db_schema(schema_files, root)
    print(f"   🗄️  Tabelas no schema:      {len(db_tables)}")

    # 7. SEGURANÇA
    security_issues = scan_security(all_ts_files, root)

    # 8. QUALIDADE
    quality_issues = scan_code_quality(all_ts_files, root)

    # 9. ANÁLISE tRPC ALIGNMENT
    trpc_align_issues, trpc_stats = analyze_trpc_alignment(backend_procs, frontend_usages)

    # 10. PÁGINAS ÓRFÃS
    used_stems: Set[str] = set()
    for r in routes:
        if r.component:
            stem = re.sub(r"[^A-Za-z0-9_]", "", r.component)
            if stem in pages_by_stem:
                used_stems.add(stem)
    orphan_pages = sorted([pages_by_stem[s] for s in pages_by_stem if s not in used_stems])

    # 11. ROTAS COM COMPONENTE INEXISTENTE
    unknown_comps = [
        asdict(r) for r in routes
        if r.component and re.sub(r"[^A-Za-z0-9_]", "", r.component) not in pages_by_stem
    ]

    # 12. ZONAS DE ROTA
    route_zones: Dict[str, List[str]] = {"PUBLIC": [], "AUTH": [], "ADMIN": []}
    for r in routes:
        route_zones[r.zone].append(r.path)
    for z in route_zones:
        route_zones[z] = sorted(set(route_zones[z]))

    broken_by_zone = {"PUBLIC": 0, "AUTH": 0, "ADMIN": 0}
    for lk in broken_links:
        broken_by_zone[lk.zone_guess] = broken_by_zone.get(lk.zone_guess, 0) + 1

    # Todas as issues juntas
    all_issues: List[Issue] = (
        trpc_align_issues +
        security_issues   +
        quality_issues
    )

    # Issues de navegação (links quebrados, órfãos)
    nav_issues: List[Issue] = []
    for lk in broken_links:
        nav_issues.append(Issue(
            "CRITICAL" if lk.zone_guess == "ADMIN" else "WARNING",
            "Navigation",
            lk.file, lk.line,
            f"Link quebrado: `{lk.href}`",
            f"Tipo: {lk.kind} | Zona: {lk.zone_guess}"
        ))
    for op in orphan_pages:
        nav_issues.append(Issue(
            "WARNING", "Navigation", op, 0,
            "Página órfã (sem rota definida)",
            "Adicionar <Route path=... component={...} /> no App.tsx"
        ))
    all_issues = nav_issues + all_issues

    # SCORES
    scores = compute_scores(
        len(routes), broken_links, orphan_pages,
        security_issues, trpc_align_issues, quality_issues
    )

    # SUMÁRIO DE COUNTS
    counts = {
        "pages_found":        len(page_files),
        "routes_detected":    len(routes),
        "internal_links":     len(internal_links),
        "external_links":     len(external_links),
        "broken_links":       len(broken_links),
        "broken_links_public": broken_by_zone["PUBLIC"],
        "broken_links_admin":  broken_by_zone["ADMIN"],
        "orphan_pages":        len(orphan_pages),
        "backend_procedures":  len(backend_procs),
        "frontend_trpc_usages": len(frontend_usages),
        "trpc_ghost_calls":    trpc_stats["ghost_calls"],
        "trpc_dead_procs":     trpc_stats["dead_procs"],
        "db_tables":           len(db_tables),
        "security_criticals":  len([i for i in security_issues if i.severity == "CRITICAL"]),
        "security_warnings":   len([i for i in security_issues if i.severity == "WARNING"]),
        "todo_fixme":          len([i for i in quality_issues if "TODO" in i.title or "FIXME" in i.title]),
        "total_issues":        len(all_issues),
    }

    return {
        "root":         str(root),
        "generated_at": datetime.now().isoformat(timespec="seconds"),
        "scores":       scores,
        "counts":       counts,
        "trpc_stats":   trpc_stats,
        "route_zones":  route_zones,
        "routes":       [asdict(r) for r in routes],
        "broken_links": [asdict(l) for l in broken_links],
        "orphan_pages": orphan_pages,
        "unknown_route_components": unknown_comps,
        "backend_procedures": [asdict(p) for p in backend_procs],
        "frontend_usages":    [asdict(u) for u in frontend_usages],
        "db_tables":          [asdict(t) for t in db_tables],
        "issues":             [asdict(i) for i in all_issues],
    }

# ─────────────────────── HTML REPORT ─────────────────────────────────────────

def write_html(out_path: Path, report: Dict) -> None:
    def esc(s) -> str:
        return str(s or "").replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")

    def score_color(s: int) -> str:
        if s >= 80: return "#22c55e"
        if s >= 50: return "#f59e0b"
        return "#ef4444"

    def sev_badge(sev: str) -> str:
        colors = {"CRITICAL": "#ef4444", "WARNING": "#f59e0b", "INFO": "#3b82f6"}
        c = colors.get(sev, "#6b7280")
        return f'<span style="background:{c};color:#fff;padding:1px 7px;border-radius:999px;font-size:0.72em;font-weight:700">{esc(sev)}</span>'

    def cat_badge(cat: str) -> str:
        colors = {
            "Navigation": "#8b5cf6",
            "tRPC-Alignment": "#06b6d4",
            "tRPC-Security": "#f97316",
            "Security": "#ef4444",
            "CodeQuality": "#6b7280",
        }
        c = colors.get(cat, "#6b7280")
        return f'<span style="background:{c};color:#fff;padding:1px 7px;border-radius:999px;font-size:0.72em">{esc(cat)}</span>'

    scores  = report["scores"]
    counts  = report["counts"]
    issues  = report["issues"]
    routes  = report["routes"]

    criticals = [i for i in issues if i["severity"] == "CRITICAL"]
    warnings  = [i for i in issues if i["severity"] == "WARNING"]
    infos     = [i for i in issues if i["severity"] == "INFO"]

    H: List[str] = []
    a = H.append

    a("<!doctype html><html lang='pt-BR'><head>")
    a("<meta charset='utf-8'>")
    a("<meta name='viewport' content='width=device-width,initial-scale=1'>")
    a("<title>Super Audit — Shadia VR Platform</title>")
    a("""<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:system-ui,'Segoe UI',Arial,sans-serif;background:#0f172a;color:#e2e8f0;font-size:14px;line-height:1.6}
a{color:#7dd3fc;text-decoration:none}
a:hover{text-decoration:underline}
h1,h2,h3{font-weight:700;line-height:1.2}
code{background:#1e293b;padding:2px 6px;border-radius:4px;font-family:monospace;font-size:0.88em;color:#f8fafc}
.container{max-width:1400px;margin:0 auto;padding:24px}
.header{background:linear-gradient(135deg,#1e1b4b,#0f172a);border-bottom:1px solid #334155;padding:32px 24px;margin-bottom:32px}
.header h1{font-size:2em;color:#f8fafc;margin-bottom:6px}
.header small{color:#94a3b8;font-size:0.9em}

/* Score Cards */
.scores-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:16px;margin-bottom:32px}
.score-card{background:#1e293b;border:1px solid #334155;border-radius:12px;padding:20px;text-align:center}
.score-card .score-val{font-size:2.8em;font-weight:800;line-height:1}
.score-card .score-label{color:#94a3b8;font-size:0.82em;margin-top:6px}
.score-main{grid-column:1 / -1;background:linear-gradient(135deg,#1e1b4b,#1e293b);border:2px solid #6366f1}

/* Stats bar */
.stats-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px;margin-bottom:32px}
.stat{background:#1e293b;border:1px solid #334155;border-radius:8px;padding:14px 16px}
.stat .val{font-size:1.6em;font-weight:700;color:#f8fafc}
.stat .lbl{font-size:0.75em;color:#94a3b8;margin-top:2px}
.stat.crit{border-left:4px solid #ef4444}
.stat.warn{border-left:4px solid #f59e0b}
.stat.ok  {border-left:4px solid #22c55e}
.stat.info{border-left:4px solid #3b82f6}

/* Tables */
.section{background:#1e293b;border:1px solid #334155;border-radius:12px;margin-bottom:24px;overflow:hidden}
.section-header{padding:16px 20px;background:#162032;border-bottom:1px solid #334155;display:flex;align-items:center;justify-content:space-between;cursor:pointer}
.section-header h2{font-size:1em;color:#f8fafc}
.section-header .cnt{background:#334155;padding:2px 10px;border-radius:999px;font-size:0.78em;color:#94a3b8}
.section-body{padding:0}
table{border-collapse:collapse;width:100%}
td,th{border-bottom:1px solid #1e293b;padding:9px 14px;vertical-align:top;text-align:left;font-size:0.85em}
th{background:#0f172a;color:#94a3b8;font-weight:600;font-size:0.78em;text-transform:uppercase;letter-spacing:0.05em}
tr:hover td{background:#162032}
.mono{font-family:monospace;font-size:0.83em;color:#93c5fd;word-break:break-all}
.pill{display:inline-block;padding:1px 8px;border-radius:999px;font-size:0.72em;font-weight:600}
.pill-green{background:#166534;color:#bbf7d0}
.pill-red{background:#7f1d1d;color:#fecaca}
.pill-yellow{background:#78350f;color:#fde68a}
.pill-blue{background:#1e3a5f;color:#bfdbfe}
.pill-purple{background:#3b0764;color:#e9d5ff}

/* Route zones */
.zones{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;padding:20px}
.zone{background:#0f172a;border-radius:8px;padding:16px}
.zone h3{font-size:0.82em;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:10px;font-weight:700}
.zone.pub h3{color:#22c55e}
.zone.auth h3{color:#f59e0b}
.zone.admin h3{color:#ef4444}
.zone ul{list-style:none;padding:0}
.zone ul li{padding:3px 0;border-bottom:1px solid #1e293b;font-size:0.82em}
.zone ul li code{color:#7dd3fc}

/* Issues list */
.issues-list{padding:0}
.issue-row{display:grid;grid-template-columns:auto auto 1fr auto;gap:12px;padding:12px 20px;border-bottom:1px solid #0f172a;align-items:start}
.issue-row:hover{background:#162032}
.issue-file{font-size:0.75em;color:#64748b;font-family:monospace}
.issue-title{font-weight:600;color:#f8fafc;font-size:0.88em}
.issue-detail{color:#94a3b8;font-size:0.82em;margin-top:2px}
.issue-lineno{color:#475569;font-size:0.72em;white-space:nowrap}

/* Collapsible */
details summary{cursor:pointer;list-style:none}
details summary::-webkit-details-marker{display:none}
details[open] .section-header .arrow{transform:rotate(90deg)}
.arrow{display:inline-block;transition:transform .2s;margin-right:8px;font-size:0.8em;color:#94a3b8}

/* Progress bar */
.progress{background:#0f172a;border-radius:999px;height:8px;margin-top:8px;overflow:hidden}
.progress-fill{height:100%;border-radius:999px;transition:width .6s}

/* Responsive */
@media(max-width:768px){
  .zones{grid-template-columns:1fr}
  .scores-grid{grid-template-columns:repeat(2,1fr)}
  .issue-row{grid-template-columns:1fr;gap:4px}
}
</style>""")
    a("</head><body>")

    # HEADER
    a('<div class="header"><div class="container">')
    a(f'<h1>🔍 Super Audit Report</h1>')
    a(f'<small>Shadia VR Platform &nbsp;|&nbsp; {esc(report["root"])} &nbsp;|&nbsp; {esc(report["generated_at"])}</small>')
    a('</div></div>')

    a('<div class="container">')

    # SCORE CARDS
    a('<div class="scores-grid">')
    overall = scores["overall"]
    a(f'<div class="score-card score-main">'
      f'<div class="score-val" style="color:{score_color(overall)}">{overall}</div>'
      f'<div class="score-label">Score Global (0–100)</div>'
      f'<div class="progress"><div class="progress-fill" style="width:{overall}%;background:{score_color(overall)}"></div></div>'
      f'</div>')

    labels = {"navigation":"🗺️ Navegação","security":"🔒 Segurança","trpc_alignment":"⚙️ tRPC Alinhamento","code_quality":"✨ Qualidade"}
    for k, lbl in labels.items():
        s = scores[k]
        a(f'<div class="score-card">'
          f'<div class="score-val" style="color:{score_color(s)}">{s}</div>'
          f'<div class="score-label">{lbl}</div>'
          f'<div class="progress"><div class="progress-fill" style="width:{s}%;background:{score_color(s)}"></div></div>'
          f'</div>')
    a('</div>')

    # STATS
    def stat(val, lbl, cls=""):
        return f'<div class="stat {cls}"><div class="val">{esc(val)}</div><div class="lbl">{lbl}</div></div>'

    a('<div class="stats-grid">')
    a(stat(counts["routes_detected"],     "Rotas detectadas",   "ok" if counts["routes_detected"] else "crit"))
    a(stat(counts["pages_found"],         "Páginas (.tsx)",      "info"))
    a(stat(counts["broken_links"],        "Links quebrados",     "crit" if counts["broken_links"] else "ok"))
    a(stat(counts["orphan_pages"],        "Páginas órfãs",       "warn" if counts["orphan_pages"] else "ok"))
    a(stat(counts["backend_procedures"],  "Procedures backend",  "info"))
    a(stat(counts["frontend_trpc_usages"],"Usos tRPC frontend",  "info"))
    a(stat(counts["trpc_ghost_calls"],    "Ghost calls tRPC",    "crit" if counts["trpc_ghost_calls"] else "ok"))
    a(stat(counts["trpc_dead_procs"],     "Dead procedures",     "warn" if counts["trpc_dead_procs"] else "ok"))
    a(stat(counts["db_tables"],           "Tabelas DB (schema)", "info"))
    a(stat(counts["security_criticals"],  "Riscos CRÍTICOS",     "crit" if counts["security_criticals"] else "ok"))
    a(stat(counts["security_warnings"],   "Riscos WARNING",      "warn" if counts["security_warnings"] else "ok"))
    a(stat(counts["total_issues"],        "Total de issues",     "info"))
    a('</div>')

    # ISSUES POR SEVERIDADE (resumo)
    for sev, lst, cls in [("CRITICAL", criticals, "crit"), ("WARNING", warnings, "warn"), ("INFO", infos, "info")]:
        if not lst:
            continue
        cat_counts: Dict[str, int] = {}
        for i in lst:
            cat_counts[i["category"]] = cat_counts.get(i["category"], 0) + 1
        summary = " &nbsp;·&nbsp; ".join(f'{cat_badge(c)} <b>{n}</b>' for c, n in sorted(cat_counts.items()))
        a(f'<div style="background:#1e293b;border:1px solid #334155;border-left:4px solid {"#ef4444" if sev=="CRITICAL" else "#f59e0b" if sev=="WARNING" else "#3b82f6"};border-radius:8px;padding:12px 20px;margin-bottom:12px">'
          f'{sev_badge(sev)} &nbsp; <b>{len(lst)} issues</b> &nbsp;·&nbsp; {summary}</div>')

    # ── SEÇÃO: ROTAS POR ZONA ──
    a('<details open><summary>')
    a('<div class="section-header"><h2><span class="arrow">▶</span>🗺️ Rotas por Zona</h2>'
      f'<span class="cnt">{len(routes)} rotas</span></div>')
    a('</summary>')
    a('<div class="section"><div class="zones">')
    zone_classes = {"PUBLIC": "pub", "AUTH": "auth", "ADMIN": "admin"}
    for zone, paths in report["route_zones"].items():
        zc = zone_classes.get(zone, "")
        a(f'<div class="zone {zc}"><h3>{esc(zone)} ({len(paths)})</h3><ul>')
        for p in paths or ["(nenhuma)"]:
            a(f'<li><code>{esc(p)}</code></li>')
        a('</ul></div>')
    a('</div></div></details>')

    # ── SEÇÃO: TODAS AS ISSUES ──
    def render_issues_section(title: str, icon: str, lst: List[Dict], open_tag: bool = True):
        if not lst:
            return
        op = "open" if open_tag else ""
        a(f'<details {op}><summary>')
        a(f'<div class="section-header"><h2><span class="arrow">▶</span>{icon} {esc(title)}</h2>'
          f'<span class="cnt">{len(lst)}</span></div>')
        a('</summary><div class="section"><div class="issues-list">')
        for i in lst:
            ln_txt = f"L{i['line']}" if i.get("line") and i["line"] > 0 else ""
            a(f'<div class="issue-row">'
              f'<div>{sev_badge(i["severity"])}</div>'
              f'<div>{cat_badge(i["category"])}</div>'
              f'<div>'
              f'<div class="issue-title">{esc(i["title"])}</div>'
              f'<div class="issue-detail">{esc(i["detail"])}</div>'
              f'<div class="issue-file">{esc(i["file"])}</div>'
              f'</div>'
              f'<div class="issue-lineno">{ln_txt}</div>'
              f'</div>')
        a('</div></div></details>')

    # Issues CRITICAL
    render_issues_section("Issues Críticas", "🚨", criticals, open_tag=True)
    # Issues WARNING
    render_issues_section("Issues de Atenção (Warnings)", "⚠️", warnings, open_tag=True)
    # Issues INFO
    render_issues_section("Informações e Melhorias", "💡", infos, open_tag=False)

    # ── SEÇÃO: LINKS QUEBRADOS ──
    broken = report["broken_links"]
    if broken:
        a('<details open><summary>')
        a(f'<div class="section-header"><h2><span class="arrow">▶</span>🔗 Links Internos Quebrados</h2>'
          f'<span class="cnt">{len(broken)}</span></div>')
        a('</summary><div class="section">')
        a('<table><thead><tr><th>Arquivo</th><th>Link</th><th>Tipo</th><th>Linha</th><th>Zona</th></tr></thead><tbody>')
        for lk in broken:
            zone_pill = f'<span class="pill pill-{"red" if lk["zone_guess"]=="ADMIN" else "yellow"}">{esc(lk["zone_guess"])}</span>'
            a(f'<tr><td class="mono">{esc(lk["file"])}</td>'
              f'<td><code>{esc(lk["href"])}</code></td>'
              f'<td>{esc(lk["kind"])}</td>'
              f'<td>{lk["line"]}</td>'
              f'<td>{zone_pill}</td></tr>')
        a('</tbody></table></div></details>')

    # ── SEÇÃO: PÁGINAS ÓRFÃS ──
    orphans = report["orphan_pages"]
    if orphans:
        a('<details open><summary>')
        a(f'<div class="section-header"><h2><span class="arrow">▶</span>👻 Páginas Órfãs (sem rota)</h2>'
          f'<span class="cnt">{len(orphans)}</span></div>')
        a('</summary><div class="section">')
        a('<table><thead><tr><th>Arquivo da Página</th><th>Ação Recomendada</th></tr></thead><tbody>')
        for op in orphans:
            comp = Path(op).stem
            a(f'<tr><td class="mono">{esc(op)}</td>'
              f'<td><code>&lt;Route path="/..." component=&#123;{esc(comp)}&#125; /&gt;</code></td></tr>')
        a('</tbody></table></div></details>')

    # ── SEÇÃO: tRPC PROCEDURES ──
    back_procs = report["backend_procedures"]
    front_usages = report["frontend_usages"]

    if back_procs:
        a('<details><summary>')
        a(f'<div class="section-header"><h2><span class="arrow">▶</span>⚙️ Procedures Backend tRPC</h2>'
          f'<span class="cnt">{len(back_procs)}</span></div>')
        a('</summary><div class="section">')
        a('<table><thead><tr><th>Namespace</th><th>Procedure</th><th>Tipo</th><th>Arquivo</th><th>Linha</th></tr></thead><tbody>')
        for p in sorted(back_procs, key=lambda x: (x["namespace"], x["name"])):
            kind_pill = {
                "public":    '<span class="pill pill-blue">public</span>',
                "protected": '<span class="pill pill-yellow">protected</span>',
                "admin":     '<span class="pill pill-red">admin</span>',
            }.get(p["kind"], '<span class="pill">?</span>')
            a(f'<tr><td><code>{esc(p["namespace"])}</code></td>'
              f'<td><code>{esc(p["name"])}</code></td>'
              f'<td>{kind_pill}</td>'
              f'<td class="mono">{esc(p["file"])}</td>'
              f'<td>{p["line"]}</td></tr>')
        a('</tbody></table></div></details>')

    if front_usages:
        a('<details><summary>')
        a(f'<div class="section-header"><h2><span class="arrow">▶</span>🖥️ Usos tRPC no Frontend</h2>'
          f'<span class="cnt">{len(front_usages)}</span></div>')
        a('</summary><div class="section">')
        a('<table><thead><tr><th>Namespace</th><th>Procedure</th><th>Método</th><th>Arquivo</th><th>Linha</th></tr></thead><tbody>')
        for u in sorted(front_usages, key=lambda x: (x["namespace"], x["name"])):
            a(f'<tr><td><code>{esc(u["namespace"])}</code></td>'
              f'<td><code>{esc(u["name"])}</code></td>'
              f'<td><code>{esc(u["method"])}</code></td>'
              f'<td class="mono">{esc(u["file"])}</td>'
              f'<td>{u["line"]}</td></tr>')
        a('</tbody></table></div></details>')

    # ── SEÇÃO: SCHEMA DB ──
    db_tables = report["db_tables"]
    if db_tables:
        a('<details><summary>')
        a(f'<div class="section-header"><h2><span class="arrow">▶</span>🗄️ Tabelas do Banco de Dados (Drizzle Schema)</h2>'
          f'<span class="cnt">{len(db_tables)}</span></div>')
        a('</summary><div class="section">')
        a('<table><thead><tr><th>Variável TS</th><th>Nome da Tabela SQL</th><th>Arquivo</th></tr></thead><tbody>')
        for t in db_tables:
            a(f'<tr><td><code>{esc(t["var_name"])}</code></td>'
              f'<td><code>{esc(t["table_name"])}</code></td>'
              f'<td class="mono">{esc(t["file"])}</td></tr>')
        a('</tbody></table></div></details>')

    # ── SEÇÃO: ROTAS COM COMP DESCONHECIDO ──
    unk = report["unknown_route_components"]
    if unk:
        a('<details><summary>')
        a(f'<div class="section-header"><h2><span class="arrow">▶</span>❓ Rotas com Componente Não Mapeado</h2>'
          f'<span class="cnt">{len(unk)}</span></div>')
        a('</summary><div class="section">')
        a('<table><thead><tr><th>Path</th><th>Componente</th><th>Zona</th><th>Arquivo</th></tr></thead><tbody>')
        for u in unk:
            a(f'<tr><td><code>{esc(u["path"])}</code></td>'
              f'<td><code>{esc(u["component"])}</code></td>'
              f'<td>{esc(u["zone"])}</td>'
              f'<td class="mono">{esc(u["file"])}</td></tr>')
        a('</tbody></table></div></details>')

    # FOOTER
    a('<div style="margin-top:40px;padding:24px 0;border-top:1px solid #334155;color:#475569;font-size:0.8em;text-align:center">')
    a(f'Super Audit gerado em {esc(report["generated_at"])} &nbsp;·&nbsp; Shadia VR Platform')
    a('</div>')

    a('</div>')  # container
    a('</body></html>')

    out_path.write_text("\n".join(H), encoding="utf-8")


# ─────────────────────── MAIN ────────────────────────────────────────────────

def main():
    ap = argparse.ArgumentParser(
        description="Super Audit — Navegação + tRPC Alignment + Segurança + Qualidade"
    )
    ap.add_argument("--root", default=".", help="Raiz do projeto (default: .)")
    ap.add_argument("--out",  default="super_audit", help="Pasta de saída (default: super_audit)")
    ap.add_argument("--no-html", action="store_true", help="Não gerar HTML (apenas JSON)")
    args = ap.parse_args()

    root    = Path(args.root).resolve()
    out_dir = root / args.out
    out_dir.mkdir(parents=True, exist_ok=True)

    report = run_audit(root)

    json_path = out_dir / "super_audit.json"
    html_path = out_dir / "super_audit.html"

    json_path.write_text(json.dumps(report, indent=2, ensure_ascii=False), encoding="utf-8")

    if not args.no_html:
        write_html(html_path, report)

    print("\n" + "="*60)
    print("✅  SUPER AUDIT COMPLETO")
    print("="*60)
    print(f"\n📊  SCORES:")
    for k, v in report["scores"].items():
        emoji = "🟢" if v >= 80 else "🟡" if v >= 50 else "🔴"
        print(f"    {emoji}  {k:<20} {v:>3}/100")

    print(f"\n📋  COUNTS:")
    for k, v in report["counts"].items():
        print(f"    • {k:<35} {v}")

    print(f"\n📁  Saída:")
    print(f"    JSON: {json_path}")
    if not args.no_html:
        print(f"    HTML: {html_path}")

    # Dicas diagnósticas
    print("\n💡  DIAGNÓSTICO:")
    if report["counts"]["routes_detected"] == 0:
        print("    🔴 NENHUMA ROTA detectada!")
        print("       → Certifique-se que seu App.tsx usa:")
        print('         <Route path="/exemplo" component={MinhaPage} />')
        print("       → O arquivo App.tsx deve estar em client/src/ ou src/")
    elif report["counts"]["routes_detected"] < 5:
        print("    ⚠️  Poucas rotas detectadas. Verifique se App.tsx está no glob correto.")

    if report["counts"]["broken_links"] > 20:
        print(f"    🔴 {report['counts']['broken_links']} links quebrados — prioridade máxima!")
    if report["counts"]["trpc_ghost_calls"] > 0:
        print(f"    🔴 {report['counts']['trpc_ghost_calls']} chamadas tRPC sem procedure backend — runtime errors!")
    if report["counts"]["security_criticals"] > 0:
        print(f"    🔴 {report['counts']['security_criticals']} riscos de segurança CRÍTICOS!")


if __name__ == "__main__":
    main()
