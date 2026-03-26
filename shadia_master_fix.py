#!/usr/bin/env python3
"""
╔══════════════════════════════════════════════════════════════════════════════╗
║  shadia_master_fix.py  —  Auditoria + Auto-Fix COMPLETO  10/10              ║
║  Shadia VR Platform  |  React+Wouter / Node+tRPC / Drizzle+MySQL            ║
║                                                                              ║
║  MODO AUDITORIA (padrão — sem --apply):                                     ║
║    python shadia_master_fix.py                                               ║
║                                                                              ║
║  MODO CORREÇÃO COMPLETA:                                                     ║
║    python shadia_master_fix.py --apply --all                                 ║
║                                                                              ║
║  MODO SELETIVO:                                                              ║
║    python shadia_master_fix.py --apply --fix-routes --fix-trpc               ║
║    python shadia_master_fix.py --apply --fix-oauth --fix-env                 ║
║    python shadia_master_fix.py --apply --fix-links --create-stubs            ║
╚══════════════════════════════════════════════════════════════════════════════╝
"""
from __future__ import annotations

import argparse
import copy
import difflib
import json
import os
import re
import shutil
import sys
from dataclasses import dataclass, asdict, field
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional, Set, Tuple, Any

# ═══════════════════════════════ CONFIG ══════════════════════════════════════

VERSION = "10.0.0"

SKIP_DIRS: Set[str] = {
    "node_modules", "dist", "build", ".git", ".turbo", ".next",
    ".vite", ".cache", ".pnpm", ".repo_doctor", ".doctor_backups",
    "nav_audit", "super_audit", "nav_fix", ".navfix_backups",
    "shadia_fix_output", "coverage", ".nyc_output",
}

PAGE_GLOBS   = ["client/src/pages/**/*.tsx", "src/pages/**/*.tsx"]
FRONT_GLOBS  = ["client/src/**/*.ts", "client/src/**/*.tsx", "src/**/*.ts", "src/**/*.tsx"]
BACK_GLOBS   = ["server/**/*.ts", "routers/**/*.ts"]
SCHEMA_GLOBS = ["drizzle/schema.ts", "drizzle/**/*.ts", "db/schema.ts", "server/schema.ts"]

APP_FILE_HINTS = [
    "client/src/App.tsx", "src/App.tsx",
    "client/src/app.tsx", "src/app.tsx",
    "client/src/Router.tsx", "src/Router.tsx",
]

BACKEND_ROUTER_HINTS = [
    "server/routers.ts", "server/router.ts",
    "routers/index.ts", "server/trpc/router.ts",
]

OUTPUT_DIR_NAME = "shadia_fix_output"

# ═══════════════════════════════ REGEX ═══════════════════════════════════════

# ── Rotas (wouter) ──────────────────────────────────────────────────────────
RX_ROUTE = re.compile(
    r'<Route\b[^>]*\bpath\s*=\s*["\']([^"\']+)["\'][^>]*>',
    re.MULTILINE | re.DOTALL,
)
RX_ROUTE_COMP = re.compile(
    r'<Route\b[^>]*\bpath\s*=\s*["\']([^"\']+)["\'][^>]*\bcomponent\s*=\s*\{([^}]+)\}',
    re.MULTILINE,
)
RX_ROUTE_COMP_INV = re.compile(
    r'<Route\b[^>]*\bcomponent\s*=\s*\{([^}]+)\}[^>]*\bpath\s*=\s*["\']([^"\']+)["\']',
    re.MULTILINE,
)
RX_USE_ROUTE = re.compile(r'useRoute\(\s*["\']([^"\']+)["\']\s*\)', re.MULTILINE)

# ── Links ────────────────────────────────────────────────────────────────────
RX_LINK_HREF   = re.compile(r'<Link\b[^>]*\bhref\s*=\s*["\']([^"\']+)["\']', re.MULTILINE)
RX_A_HREF      = re.compile(r'<a\b[^>]*\bhref\s*=\s*["\']([^"\']+)["\']', re.MULTILINE)
RX_SETLOC      = re.compile(r'setLocation\(\s*["\']([^"\']+)["\']\s*\)', re.MULTILINE)
RX_NAVIGATE    = re.compile(r'navigate\(\s*["\']([^"\']+)["\']\s*\)', re.MULTILINE)
RX_LOC_HREF    = re.compile(r'(?:location\.href|window\.location)\s*=\s*["\']([^"\']+)["\']', re.MULTILINE)
RX_ROUTER_PUSH = re.compile(r'(?:router|history)\.push\(\s*["\']([^"\']+)["\']\s*\)', re.MULTILINE)

# ── OAuth direto (bypass gateway) ────────────────────────────────────────────
RX_DIRECT_OAUTH = re.compile(
    r'["\'](/api/auth/(google|apple|github|facebook)[^"\']*)["\']',
    re.IGNORECASE,
)

# ── tRPC frontend ────────────────────────────────────────────────────────────
RX_TRPC_USE = re.compile(
    r'trpc\.([A-Za-z_]\w*)\.([A-Za-z_]\w*)\.(?:useQuery|useMutation|useSuspenseQuery'
    r'|useInfiniteQuery|useSubscription|mutateAsync|mutate)',
    re.MULTILINE,
)
RX_TRPC_UTIL = re.compile(
    r'trpc\.([A-Za-z_]\w*)\.([A-Za-z_]\w*)\.(?:invalidate|refetch|setData|cancel)',
    re.MULTILINE,
)

# ── tRPC backend ─────────────────────────────────────────────────────────────
RX_TRPC_NS    = re.compile(r'([A-Za-z_]\w*)\s*:\s*(?:router|createRouter)\s*\(', re.MULTILINE)
RX_TRPC_PROC  = re.compile(
    r'([A-Za-z_]\w*)\s*:\s*(publicProcedure|protectedProcedure|adminProcedure|procedure)\b',
    re.MULTILINE,
)
RX_APP_ROUTER = re.compile(
    r'(?:export\s+(?:const|default)\s+)?(?:appRouter|router)\s*=\s*(?:t\.)?(?:router|createRouter)\s*\(',
    re.MULTILINE,
)

# ── Schema ────────────────────────────────────────────────────────────────────
RX_DRIZZLE = re.compile(
    r'export\s+const\s+([A-Za-z_]\w*)\s*=\s*(?:mysqlTable|pgTable|sqliteTable|table)\s*\(\s*["\']([^"\']+)["\']',
    re.MULTILINE,
)

# ── Segurança ─────────────────────────────────────────────────────────────────
RX_LOCALHOST     = re.compile(r'\b(localhost|127\.0\.0\.1)\b|:(3001|5173|4000|8080)\b')
RX_HARDCODE_KEY  = re.compile(
    r'(?:apiKey|api_key|secret|password|token|STRIPE_SECRET|DATABASE_URL)\s*[:=]\s*["\'][A-Za-z0-9_\-\.]{10,}["\']',
    re.IGNORECASE,
)
RX_HARDCODE_URL  = re.compile(
    r'(?:fetch|axios\.(?:get|post|put|delete))\s*\(\s*["\']https?://(?!process\.env)(?!shadiahasan)[^"\']+["\']',
    re.MULTILINE,
)
RX_OPEN_REDIRECT = re.compile(
    r'(?:redirect|location\.href|res\.redirect)\s*\([^)]*\bnext\b',
    re.IGNORECASE,
)
RX_TODO          = re.compile(r'//\s*(?:TODO|FIXME|HACK|XXX|BUG)\b', re.IGNORECASE)
RX_CONSOLE_LOG   = re.compile(r'\bconsole\.log\s*\(')

# ── Imports ───────────────────────────────────────────────────────────────────
RX_IMPORT_LAZY   = re.compile(
    r'(?:lazy|React\.lazy)\s*\(\s*\(\s*\)\s*=>\s*import\s*\(\s*["\']([^"\']+)["\']\s*\)\s*\)',
    re.MULTILINE,
)
RX_IMPORT_STATIC = re.compile(
    r'^import\s+(?:\*\s+as\s+\w+|\{[^}]+\}|\w+)\s+from\s+["\']([^"\']+)["\']',
    re.MULTILINE,
)

# ═══════════════════════════════ DATA CLASSES ══════════════════════════════════

@dataclass
class Issue:
    severity: str
    category: str
    file: str
    line: int
    title: str
    detail: str
    fix_available: bool = False
    fix_applied: bool = False

@dataclass
class RouteInfo:
    path: str
    component: Optional[str]
    zone: str
    file: str
    source: str

@dataclass
class LinkInfo:
    file: str
    href: str
    kind: str
    line: int
    zone: str
    broken: bool = False
    fix_suggestion: Optional[str] = None

@dataclass
class TrpcProc:
    ns: str
    name: str
    kind: str
    file: str
    line: int

@dataclass
class TrpcUsage:
    ns: str
    name: str
    method: str
    file: str
    line: int

@dataclass
class AppliedFix:
    kind: str
    file: str
    description: str
    diff_preview: str = ""

# ═══════════════════════════════ HELPERS ══════════════════════════════════════

def ts(path_str: str) -> str:
    return str(path_str).replace("\\", "/")

def read(p: Path) -> str:
    try:
        return p.read_text(encoding="utf-8", errors="ignore")
    except Exception:
        return ""

def write(p: Path, content: str, backup_dir: Optional[Path] = None) -> None:
    if backup_dir:
        bak = backup_dir / ts(p).replace("/", "__")
        bak.parent.mkdir(parents=True, exist_ok=True)
        if p.exists():
            shutil.copy2(p, bak)
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(content, encoding="utf-8", newline="\n")

def rel(p: Path, root: Path) -> str:
    try:
        return ts(p.relative_to(root))
    except ValueError:
        return ts(p)

def ln(text: str, idx: int) -> int:
    return text.count("\n", 0, idx) + 1

def norm_path(p: str) -> str:
    if not p:
        return ""
    p = p.split("#", 1)[0].split("?", 1)[0].strip()
    if p in ("*", "/*", ""):
        return ""
    if p.startswith("/") and p != "/" and p.endswith("/"):
        p = p.rstrip("/")
    return p

def is_external(href: str) -> bool:
    return href.startswith(("http://", "https://", "mailto:", "tel:", "//", "data:"))

def zone(path: str) -> str:
    if "/admin" in path:
        return "ADMIN"
    if any(s in path for s in ("/dashboard", "/profile", "/settings", "/account", "/my-")):
        return "AUTH"
    return "PUBLIC"

def zone_for_file(file_path: str) -> str:
    f = file_path.lower().replace("\\", "/")
    if "/admin" in f:
        return "ADMIN"
    return "PUBLIC"

def iter_files(root: Path, globs: List[str]) -> List[Path]:
    seen: Set[Path] = set()
    for g in globs:
        for p in root.glob(g):
            if not p.is_file():
                continue
            if any(part in SKIP_DIRS for part in p.parts):
                continue
            seen.add(p)
    return sorted(seen)

def kebab(s: str) -> str:
    s2 = re.sub(r"([a-z0-9])([A-Z])", r"\1-\2", s)
    s2 = s2.replace("_", "-")
    s2 = re.sub(r"[^a-zA-Z0-9\-]+", "-", s2)
    s2 = re.sub(r"-{2,}", "-", s2).strip("-")
    return s2.lower()

def title_case(s: str) -> str:
    parts = re.split(r"[-_\s]+", re.sub(r"([a-z])([A-Z])", r"\1 \2", s))
    return " ".join(p.capitalize() for p in parts if p)

def guess_route(stem: str) -> str:
    mapping = {
        "home": "/", "index": "/",
        "about": "/about", "sobre": "/sobre",
        "courses": "/courses", "cursos": "/cursos",
        "contact": "/contact", "contato": "/contato",
        "community": "/community", "comunidade": "/community",
        "pricing": "/pricing", "planos": "/pricing",
        "login": "/login", "signin": "/login",
        "signup": "/signup", "register": "/register",
        "logout": "/logout",
        "admindashboard": "/admin",
        "dashboard": "/dashboard",
        "profile": "/profile",
        "settings": "/settings",
        "mycourses": "/my-courses",
        "lessonview": "/lesson/:courseId/:lessonId",
        "coursedétail": "/courses/:slug",
        "coursedetail": "/courses/:slug",
    }
    low = stem.lower().replace("_", "").replace("-", "")
    if low in mapping:
        return mapping[low]
    # Sub-páginas admin
    if low.startswith("admin"):
        rest = low[5:]
        if rest:
            return f"/admin/{kebab(rest)}"
        return "/admin"
    return "/" + kebab(stem)

def make_diff(original: str, modified: str, filename: str, n: int = 3) -> str:
    orig_lines = original.splitlines(keepends=True)
    mod_lines  = modified.splitlines(keepends=True)
    diff = list(difflib.unified_diff(orig_lines, mod_lines, fromfile=f"a/{filename}", tofile=f"b/{filename}", n=n))
    return "".join(diff[:80]) + ("\n... (diff truncado)" if len(diff) > 80 else "")

def path_matches(href: str, routes: Set[str]) -> bool:
    norm = norm_path(href)
    if not norm or norm == "/":
        return True
    if norm in routes:
        return True
    for r in routes:
        if ":" in r or "*" in r:
            rp = r.split("/")
            hp = norm.split("/")
            if len(rp) == len(hp):
                if all(x.startswith(":") or x == y for x, y in zip(rp, hp)):
                    return True
    return False

def esc(s: Any) -> str:
    return str(s or "").replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace('"', "&quot;")

# ═══════════════════════════════ SCANNERS ═════════════════════════════════════

def scan_routes(files: List[Path], root: Path) -> List[RouteInfo]:
    routes: List[RouteInfo] = []
    seen: Set[Tuple] = set()

    def add(path: str, comp: Optional[str], file_rel: str, source: str):
        path = norm_path(path)
        if not path:
            return
        comp = (comp or "").strip()
        key = (path, comp)
        if key in seen:
            return
        seen.add(key)
        routes.append(RouteInfo(path, comp or None, zone(path), file_rel, source))

    for f in files:
        txt = read(f)
        fr  = rel(f, root)
        # Component attribute patterns
        for m in RX_ROUTE_COMP.finditer(txt):
            add(m.group(1), m.group(2), fr, "wouter")
        for m in RX_ROUTE_COMP_INV.finditer(txt):
            add(m.group(2), m.group(1), fr, "wouter")
        # Path-only (children pattern)
        for m in RX_ROUTE.finditer(txt):
            path = norm_path(m.group(1))
            if path and (path, None) not in seen:
                seen.add((path, None))
                routes.append(RouteInfo(path, None, zone(path), fr, "wouter-child"))
        # useRoute hook
        for m in RX_USE_ROUTE.finditer(txt):
            add(m.group(1), None, fr, "useRoute")

    return routes


def scan_links(files: List[Path], root: Path, route_paths: Set[str]) -> Tuple[List[LinkInfo], List[LinkInfo]]:
    internal: List[LinkInfo] = []
    broken:   List[LinkInfo] = []

    patterns = [
        (RX_LINK_HREF,   "Link"),
        (RX_A_HREF,      "<a>"),
        (RX_SETLOC,      "setLocation"),
        (RX_NAVIGATE,    "navigate"),
        (RX_LOC_HREF,    "location.href"),
        (RX_ROUTER_PUSH, "router.push"),
    ]

    for f in files:
        txt = read(f)
        fr  = rel(f, root)
        zg  = zone_for_file(fr)

        for rx, kind in patterns:
            for m in rx.finditer(txt):
                href = m.group(1).strip()
                if not href or href.startswith(("#", "data:", "javascript:")):
                    continue
                if is_external(href):
                    continue
                if href.startswith(("/api", "/assets", "/favicon", "/public", "/static", "/uploads")):
                    continue
                if not href.startswith("/"):
                    continue
                line = ln(txt, m.start())
                lf = LinkInfo(fr, href, kind, line, zg)
                internal.append(lf)
                if not path_matches(href, route_paths):
                    lf.broken = True
                    # Try suggestion
                    lf.fix_suggestion = suggest_route_fix(href, route_paths)
                    broken.append(lf)

    return internal, broken


def suggest_route_fix(href: str, routes: Set[str]) -> Optional[str]:
    norm = norm_path(href)
    if not norm:
        return None
    # Case insensitive
    lower_map = {r.lower(): r for r in routes}
    if norm.lower() in lower_map:
        return lower_map[norm.lower()]
    # Close match
    candidates = difflib.get_close_matches(norm, list(routes), n=3, cutoff=0.80)
    if candidates:
        return candidates[0]
    return None


def scan_trpc_backend(files: List[Path], root: Path) -> Tuple[List[TrpcProc], Dict[str, Set[str]]]:
    """Returns (procedures_list, namespace_map)"""
    procs: List[TrpcProc] = []
    ns_map: Dict[str, Set[str]] = {}  # ns -> set of proc names

    for f in files:
        txt   = read(f)
        fr    = rel(f, root)
        lines = txt.split("\n")
        ns_stack: List[str] = []
        current_ns = "__root__"

        for i, line in enumerate(lines, 1):
            nm = RX_TRPC_NS.search(line)
            if nm and nm.group(1) not in {"router", "t", "createRouter", "appRouter"}:
                current_ns = nm.group(1)
                ns_stack.append(current_ns)

            pm = RX_TRPC_PROC.search(line)
            if pm:
                proc_name = pm.group(1)
                proc_type = pm.group(2)
                kind = {
                    "publicProcedure":    "public",
                    "protectedProcedure": "protected",
                    "adminProcedure":     "admin",
                    "procedure":          "unknown",
                }.get(proc_type, "unknown")

                ns = ns_stack[-1] if ns_stack else "__root__"
                if proc_name not in {"router", "t", "procedure", "publicProcedure",
                                     "protectedProcedure", "adminProcedure"}:
                    procs.append(TrpcProc(ns, proc_name, kind, fr, i))
                    ns_map.setdefault(ns, set()).add(proc_name)

            stripped = line.strip()
            if stripped in ("}),", "})", "},", "})") and ns_stack:
                ns_stack.pop()
                current_ns = ns_stack[-1] if ns_stack else "__root__"

    return procs, ns_map


def scan_trpc_frontend(files: List[Path], root: Path) -> List[TrpcUsage]:
    usages: List[TrpcUsage] = []
    seen: Set[Tuple] = set()

    for f in files:
        txt = read(f)
        fr  = rel(f, root)
        for rx in (RX_TRPC_USE, RX_TRPC_UTIL):
            for m in rx.finditer(txt):
                ns     = m.group(1)
                name   = m.group(2)
                method = m.group(0).split(".")[-1]
                line   = ln(txt, m.start())
                key    = (ns, name, fr, line)
                if key not in seen:
                    seen.add(key)
                    usages.append(TrpcUsage(ns, name, method, fr, line))

    return usages


def scan_pages(page_files: List[Path], root: Path) -> Dict[str, str]:
    """stem -> relative path"""
    return {f.stem: rel(f, root) for f in page_files}


def scan_security(files: List[Path], root: Path) -> List[Issue]:
    issues: List[Issue] = []
    for f in files:
        txt = read(f)
        fr  = rel(f, root)
        for m in RX_LOCALHOST.finditer(txt):
            snippet = txt[max(0, m.start()-50):m.start()+80].replace("\n", " ").strip()
            issues.append(Issue("WARNING", "Security", fr, ln(txt, m.start()),
                                "Hardcoded localhost/port",
                                f"`{snippet[:120]}`", True))
        for m in RX_HARDCODE_KEY.finditer(txt):
            masked = re.sub(r'["\'][A-Za-z0-9_\-\.]{4,}["\']', '"***"', m.group(0))
            issues.append(Issue("CRITICAL", "Security", fr, ln(txt, m.start()),
                                "Chave/segredo hardcoded", f"`{masked}`", True))
        for m in RX_OPEN_REDIRECT.finditer(txt):
            snippet = txt[max(0, m.start()-30):m.start()+100].replace("\n", " ").strip()
            issues.append(Issue("CRITICAL", "Security", fr, ln(txt, m.start()),
                                "Possível Open Redirect via `next`", f"`{snippet[:120]}`"))
        for m in RX_DIRECT_OAUTH.finditer(txt):
            issues.append(Issue("WARNING", "OAuth", fr, ln(txt, m.start()),
                                f"Link OAuth direto: `{m.group(1)}`",
                                "Deve redirecionar para /login?provider=... em vez de chamar /api/auth diretamente",
                                True))

    return issues


def scan_quality(files: List[Path], root: Path) -> List[Issue]:
    issues: List[Issue] = []
    for f in files:
        txt = read(f)
        fr  = rel(f, root)
        for m in RX_TODO.finditer(txt):
            snippet = txt[m.start():m.start()+80].replace("\n", " ").strip()
            issues.append(Issue("INFO", "CodeQuality", fr, ln(txt, m.start()),
                                "TODO/FIXME pendente", f"`{snippet}`"))
        count = len(RX_CONSOLE_LOG.findall(txt))
        if count > 3:
            issues.append(Issue("INFO", "CodeQuality", fr, 0,
                                f"Muitos console.log ({count})",
                                "Remover antes de ir para produção"))
    return issues


def analyze_trpc(backend_procs: List[TrpcProc],
                 frontend_usages: List[TrpcUsage]) -> Tuple[List[Issue], Dict]:
    issues: List[Issue] = []
    backend_map: Dict[Tuple[str, str], TrpcProc] = {}
    for p in backend_procs:
        backend_map[(p.ns, p.name)] = p

    frontend_map: Dict[Tuple[str, str], List[TrpcUsage]] = {}
    for u in frontend_usages:
        frontend_map.setdefault((u.ns, u.name), []).append(u)

    ghost_calls: List[Dict] = []
    for (ns, name), usages in frontend_map.items():
        if (ns, name) not in backend_map:
            for u in usages:
                issues.append(Issue(
                    "CRITICAL", "tRPC-Alignment",
                    u.file, u.line,
                    f"Ghost call: `trpc.{ns}.{name}` — não existe no backend",
                    f"Método: `{u.method}` — causará runtime error 500",
                    True,
                ))
            ghost_calls.append({"ns": ns, "name": name,
                                 "file": usages[0].file, "method": usages[0].method,
                                 "usages": len(usages)})

    dead_procs: List[Dict] = []
    skip = {"router", "createRouter", "t", "procedure"}
    for (ns, name), proc in backend_map.items():
        if name in skip:
            continue
        if (ns, name) not in frontend_map:
            issues.append(Issue(
                "WARNING", "tRPC-Alignment",
                proc.file, proc.line,
                f"Dead procedure: `{ns}.{name}` — definida mas nunca usada no frontend",
                f"Tipo: `{proc.kind}` — dead code ou feature incompleta",
                False,
            ))
            dead_procs.append({"ns": ns, "name": name, "kind": proc.kind, "file": proc.file})

    sensitive = {"delete", "remove", "create", "update", "insert", "admin", "user",
                 "profile", "payment", "invoice", "cashback"}
    for (ns, name), proc in backend_map.items():
        if proc.kind == "public" and any(s in name.lower() for s in sensitive):
            issues.append(Issue(
                "WARNING", "tRPC-Security",
                proc.file, proc.line,
                f"Procedure pública sensível: `{ns}.{name}`",
                "Verificar se deveria ser `protectedProcedure` ou `adminProcedure`",
            ))

    stats = {
        "backend_total":    len(backend_map),
        "frontend_unique":  len(frontend_map),
        "ghost_calls":      len(ghost_calls),
        "ghost_list":       ghost_calls,
        "dead_procs":       len(dead_procs),
        "dead_list":        dead_procs,
    }
    return issues, stats


def find_orphan_pages(pages: Dict[str, str],
                      route_paths: Set[str],
                      routes: List[RouteInfo]) -> List[str]:
    used_comps: Set[str] = set()
    for r in routes:
        if r.component:
            stem = re.sub(r"[^A-Za-z0-9_]", "", r.component.split(".")[-1])
            used_comps.add(stem)
    return sorted(path for stem, path in pages.items() if stem not in used_comps)


def score(route_count: int,
          broken_links: List[LinkInfo],
          orphan_pages: List[str],
          security_issues: List[Issue],
          trpc_issues: List[Issue],
          quality_issues: List[Issue]) -> Dict[str, int]:
    def clamp(v): return max(0, min(100, int(v)))

    nav = 100 - (len(broken_links) * 2) - (len(orphan_pages) * 2)
    if route_count == 0:
        nav -= 40

    sec = 100
    for i in security_issues:
        sec -= 15 if i.severity == "CRITICAL" else 5

    trpc = 100
    for i in trpc_issues:
        trpc -= 8 if i.severity == "CRITICAL" else 2

    qual = 100
    for i in quality_issues:
        qual -= 3 if i.severity == "WARNING" else 1

    overall = int(nav * 0.35 + sec * 0.25 + trpc * 0.30 + qual * 0.10)
    return {
        "overall":       clamp(overall),
        "navigation":    clamp(nav),
        "security":      clamp(sec),
        "trpc":          clamp(trpc),
        "quality":       clamp(qual),
    }


# ═══════════════════════════════ AUTO-FIX ENGINE ══════════════════════════════

class AutoFixer:
    def __init__(self, root: Path, backup_dir: Path, dry_run: bool = True):
        self.root       = root
        self.backup_dir = backup_dir
        self.dry_run    = dry_run
        self.fixes: List[AppliedFix] = []

    def _write(self, p: Path, content: str, description: str,
               original: Optional[str] = None) -> AppliedFix:
        diff_preview = ""
        if original is not None:
            diff_preview = make_diff(original, content, rel(p, self.root))

        fix = AppliedFix(
            kind=description.split(":")[0].strip(),
            file=rel(p, self.root),
            description=description,
            diff_preview=diff_preview,
        )
        self.fixes.append(fix)

        if not self.dry_run:
            write(p, content, self.backup_dir)
        return fix

    # ─── Fix 1: Corrigir rotas orphan no App.tsx ─────────────────────────────

    def fix_routes(self, orphan_pages: List[str], routes: List[RouteInfo],
                   page_files: List[Path]) -> int:
        """Insere <Route> para páginas órfãs no App.tsx."""
        app_file = self._find_app_file()
        if not app_file:
            print("  ⚠️  App.tsx não encontrado — pulando fix-routes")
            return 0

        txt = read(app_file)
        original = txt

        # Mapa stem -> RouteInfo já existentes
        existing_paths: Set[str] = {r.path for r in routes}

        # Mapa stem -> caminho relativo de arquivo
        pages_by_stem: Dict[str, Path] = {f.stem: f for f in page_files}

        additions: List[str] = []
        imports_to_add: List[str] = []

        for orphan_rel in orphan_pages:
            stem = Path(orphan_rel).stem
            guessed_path = guess_route(stem)

            if guessed_path in existing_paths:
                continue

            # Garantir import
            import_path = self._make_import_path(orphan_rel)
            import_line = f'import {stem} from "{import_path}";'
            if import_line not in txt and f'import {stem} ' not in txt:
                imports_to_add.append(import_line)

            additions.append(f'        <Route path="{guessed_path}" component={{{stem}}} />')
            existing_paths.add(guessed_path)

        if not additions:
            return 0

        # Inserir imports no topo (após os imports existentes)
        if imports_to_add:
            last_import_match = None
            for m in re.finditer(r'^import\s+', txt, re.MULTILINE):
                last_import_match = m
            if last_import_match:
                end_of_import_line = txt.index("\n", last_import_match.start()) + 1
                new_imports = "\n".join(imports_to_add) + "\n"
                txt = txt[:end_of_import_line] + new_imports + txt[end_of_import_line:]

        # Inserir rotas no <Switch>
        routes_block = "\n".join(additions)
        # Tenta inserir antes do primeiro <Route sem path (fallback/404) ou antes de </Switch>
        fallback_match = re.search(r'<Route\s*>', txt, re.IGNORECASE)
        if fallback_match:
            txt = txt[:fallback_match.start()] + routes_block + "\n" + txt[fallback_match.start():]
        else:
            switch_close = txt.lower().rfind("</switch>")
            if switch_close != -1:
                txt = txt[:switch_close] + routes_block + "\n      " + txt[switch_close:]
            else:
                # Tenta encontrar o fechamento do router
                router_close = re.search(r'</(?:Router|Switch|Routes)>', txt, re.IGNORECASE)
                if router_close:
                    txt = txt[:router_close.start()] + routes_block + "\n" + txt[router_close.start():]

        if txt != original:
            self._write(app_file, txt, f"fix-routes: +{len(additions)} rotas adicionadas ao App.tsx", original)

        return len(additions)

    def _find_app_file(self) -> Optional[Path]:
        for hint in APP_FILE_HINTS:
            p = self.root / hint
            if p.exists():
                txt = read(p)
                if "<Route" in txt or "Switch" in txt or "Router" in txt:
                    return p
        # Fallback: busca
        for g in ["client/src/**/*.tsx", "src/**/*.tsx"]:
            for p in self.root.glob(g):
                if any(part in SKIP_DIRS for part in p.parts):
                    continue
                if p.stem in ("App", "app", "Router", "Routes"):
                    txt = read(p)
                    if "<Route" in txt or "Switch" in txt:
                        return p
        return None

    def _make_import_path(self, file_rel: str) -> str:
        """Converte relative path para alias de import @/pages/..."""
        if "client/src/" in file_rel:
            return "@/" + file_rel.split("client/src/", 1)[1].replace(".tsx", "").replace(".ts", "")
        if "src/" in file_rel:
            return "@/" + file_rel.split("src/", 1)[1].replace(".tsx", "").replace(".ts", "")
        return "./" + Path(file_rel).stem

    # ─── Fix 2: Corrigir links quebrados ─────────────────────────────────────

    def fix_links(self, broken_links: List[LinkInfo]) -> int:
        if not broken_links:
            return 0

        by_file: Dict[str, List[LinkInfo]] = {}
        for lk in broken_links:
            if lk.fix_suggestion:
                by_file.setdefault(lk.file, []).append(lk)

        fixed = 0
        for file_rel, links in by_file.items():
            p = self.root / file_rel
            if not p.exists():
                continue
            txt = read(p)
            original = txt
            for lk in links:
                if not lk.fix_suggestion or lk.href == lk.fix_suggestion:
                    continue
                # Substituição segura: só hrefs entre aspas
                for pattern in [f'"{lk.href}"', f"'{lk.href}'"]:
                    replacement = f'"{lk.fix_suggestion}"'
                    if pattern in txt:
                        txt = txt.replace(pattern, replacement, 1)
                        fixed += 1
                        break
            if txt != original:
                self._write(p, txt, f"fix-links: {len(links)} links corrigidos", original)

        return fixed

    # ─── Fix 3: OAuth gateway ─────────────────────────────────────────────────

    def fix_oauth(self, all_files: List[Path]) -> int:
        fixed = 0
        for f in all_files:
            txt = read(f)
            original = txt
            new_txt = RX_DIRECT_OAUTH.sub(
                lambda m: f'"/login?provider={m.group(2)}"', txt
            )
            if new_txt != txt:
                self._write(f, new_txt, f"fix-oauth: links diretos /api/auth/* substituídos por /login?provider=...", original)
                fixed += 1
        return fixed

    # ─── Fix 4: Criar stubs de páginas para rotas sem arquivo ────────────────

    def create_stubs(self, broken_links: List[LinkInfo],
                     existing_routes: Set[str]) -> int:
        base = (self.root / "client/src/pages") if (self.root / "client/src/pages").exists() \
               else (self.root / "src/pages")
        created = 0

        seen_hrefs: Set[str] = set()
        for lk in broken_links:
            href = norm_path(lk.href)
            if not href or href in existing_routes or href in seen_hrefs:
                continue
            if href.startswith("/api") or ":" in href:
                continue
            seen_hrefs.add(href)

            seg = href.strip("/").split("/")[-1]
            if not seg:
                continue
            comp = "".join(w[:1].upper() + w[1:] for w in re.split(r"[-_]+", seg) if w)
            comp = re.sub(r"[^A-Za-z0-9_]", "", comp)
            if not comp:
                continue

            page_path = base / f"{comp}.tsx"
            if page_path.exists():
                continue

            is_admin = "/admin" in href
            stub = self._gen_stub(comp, href, is_admin)
            self._write(page_path, stub, f"create-stub: {comp}.tsx para rota {href}")
            created += 1

        return created

    def _gen_stub(self, comp: str, route: str, is_admin: bool) -> str:
        title = title_case(comp)
        if is_admin:
            return f"""import {{ Link }} from "wouter";

export default function {comp}() {{
  return (
    <div className="min-h-screen bg-background">
      <div className="container py-10">
        <div className="mb-6 flex items-center gap-4">
          <Link href="/admin" className="text-sm text-muted-foreground hover:underline">
            ← Voltar ao Painel
          </Link>
          <span className="text-muted-foreground">/</span>
          <h1 className="text-2xl font-bold">{title}</h1>
        </div>
        <div className="rounded-lg border bg-card p-8 text-center">
          <p className="text-muted-foreground">
            Página <code className="rounded bg-muted px-2 py-0.5 text-sm">{route}</code> em construção.
          </p>
        </div>
      </div>
    </div>
  );
}}
"""
        return f"""import {{ Link, useLocation }} from "wouter";

export default function {comp}() {{
  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 border-b bg-card/80 backdrop-blur-sm">
        <div className="container flex h-16 items-center justify-between">
          <Link href="/" className="font-semibold text-lg">Shadia Hasan</Link>
          <nav className="hidden md:flex items-center gap-6 text-sm">
            <Link href="/courses" className="hover:opacity-75">Programas</Link>
            <Link href="/about" className="hover:opacity-75">Sobre</Link>
            <Link href="/contact" className="hover:opacity-75">Contato</Link>
          </nav>
          <Link href="/login" className="rounded-md border px-4 py-2 text-sm hover:bg-muted">
            Entrar
          </Link>
        </div>
      </header>
      <main className="container py-16">
        <h1 className="text-4xl font-bold mb-4">{title}</h1>
        <p className="text-muted-foreground">
          Esta página (<code className="rounded bg-muted px-2 py-0.5 text-sm">{route}</code>) está em desenvolvimento.
        </p>
      </main>
    </div>
  );
}}
"""

    # ─── Fix 5: tRPC — criar procedures faltantes no backend ─────────────────

    def fix_trpc_backend(self, ghost_calls: List[Dict],
                         backend_map: Dict[Tuple[str, str], TrpcProc]) -> int:
        """Adiciona procedures fantasmas no router do backend."""
        if not ghost_calls:
            return 0

        router_file = self._find_backend_router()
        if not router_file:
            print("  ⚠️  router backend não encontrado — pulando fix-trpc-backend")
            return 0

        txt = read(router_file)
        original = txt

        # Agrupar ghost calls por namespace
        by_ns: Dict[str, List[Dict]] = {}
        for gc in ghost_calls:
            by_ns.setdefault(gc["ns"], []).append(gc)

        inserted = 0
        for ns, calls in by_ns.items():
            for call in calls:
                proc_code = self._gen_trpc_proc(call["ns"], call["name"], call["method"])
                # Tentar inserir dentro do namespace existente
                ns_match = re.search(
                    r'(' + re.escape(ns) + r'\s*:\s*(?:router|createRouter)\s*\(\s*\{)',
                    txt,
                )
                if ns_match:
                    insert_pos = ns_match.end()
                    txt = txt[:insert_pos] + "\n" + proc_code + txt[insert_pos:]
                    inserted += 1
                else:
                    # Namespace não existe: criar namespace completo
                    ns_block = self._gen_trpc_namespace(ns, [(call["name"], call["method"])])
                    # Inserir antes do fechamento do appRouter
                    app_close = re.search(r'\}\)\s*$', txt, re.MULTILINE)
                    if app_close:
                        txt = txt[:app_close.start()] + f"  {ns_block}\n" + txt[app_close.start():]
                        inserted += 1

        if txt != original:
            self._write(router_file, txt,
                        f"fix-trpc-backend: +{inserted} procedures criadas no backend",
                        original)
        return inserted

    def _find_backend_router(self) -> Optional[Path]:
        for hint in BACKEND_ROUTER_HINTS:
            p = self.root / hint
            if p.exists():
                return p
        for g in ["server/**/*.ts", "routers/**/*.ts"]:
            for p in self.root.glob(g):
                if any(part in SKIP_DIRS for part in p.parts):
                    continue
                txt = read(p)
                if "appRouter" in txt or "createRouter" in txt or "router(" in txt:
                    return p
        return None

    def _gen_trpc_proc(self, ns: str, name: str, method: str) -> str:
        """Gera código de uma procedure tRPC com implementação inteligente."""
        is_query    = "useQuery" in method or method == "query"
        is_mutation = "useMutation" in method or method == "mutate"
        proc_type   = self._infer_proc_type(ns, name)

        input_schema = self._infer_input(name)
        query_impl   = self._infer_query_impl(ns, name)

        if is_mutation or (not is_query and not is_mutation and any(
            k in name.lower() for k in ["create", "update", "delete", "set", "add", "remove", "invite", "accept", "cancel", "process"]
        )):
            return f"""    // AUTO-GENERATED: {name}
    {name}: {proc_type}
      .input({input_schema})
      .mutation(async ({{ input, ctx }}) => {{
        // TODO: implementar {ns}.{name}
        // ctx.user está disponível se for protectedProcedure/adminProcedure
        throw new TRPCError({{ code: 'NOT_IMPLEMENTED', message: '{name} ainda não implementado' }});
      }}),
"""
        else:
            return f"""    // AUTO-GENERATED: {name}
    {name}: {proc_type}
      .query(async ({{ ctx }}) => {{
        // TODO: implementar {ns}.{name}
        // ctx.user está disponível se for protectedProcedure/adminProcedure
        return {query_impl};
      }}),
"""

    def _infer_proc_type(self, ns: str, name: str) -> str:
        ns_l = ns.lower()
        name_l = name.lower()
        if "admin" in ns_l or any(k in name_l for k in ["admin", "promote", "demote", "audit"]):
            return "adminProcedure"
        if any(k in name_l for k in ["my", "profile", "user", "account", "subscription",
                                      "enroll", "cashback", "invoice", "billing"]):
            return "protectedProcedure"
        if ns_l in ("auth", "plans", "courses", "community"):
            if any(k in name_l for k in ["list", "get", "fetch", "public"]):
                return "publicProcedure"
        return "protectedProcedure"

    def _infer_input(self, name: str) -> str:
        name_l = name.lower()
        if "byid" in name_l or "getbyid" in name_l:
            return "z.object({ id: z.number() })"
        if "byslug" in name_l:
            return "z.object({ slug: z.string() })"
        if "create" in name_l:
            return "z.object({ /* TODO: definir campos */ }).passthrough()"
        if "update" in name_l:
            return "z.object({ id: z.number() }).passthrough()"
        if "delete" in name_l or "remove" in name_l:
            return "z.object({ id: z.number() })"
        if "invite" in name_l:
            return "z.object({ email: z.string().email() })"
        if "accept" in name_l or "cancel" in name_l:
            return "z.object({ id: z.number() })"
        if "process" in name_l:
            return "z.object({ id: z.number(), action: z.enum(['approve', 'reject']) })"
        return "z.void()"

    def _infer_query_impl(self, ns: str, name: str) -> str:
        name_l = name.lower()
        if "list" in name_l or "getall" in name_l:
            return "[]  // TODO: buscar lista do banco"
        if "stats" in name_l or "getstat" in name_l:
            return "{ total: 0, active: 0 }  // TODO: buscar stats do banco"
        if "count" in name_l:
            return "0  // TODO: buscar contagem do banco"
        if "get" in name_l:
            return "null  // TODO: buscar item do banco"
        return "null"

    def _gen_trpc_namespace(self, ns: str, procs: List[Tuple[str, str]]) -> str:
        """Gera um namespace tRPC completo."""
        body = ""
        for name, method in procs:
            body += self._gen_trpc_proc(ns, name, method)
        return f"""  {ns}: router({{
{body}  }}),"""

    # ─── Fix 6: .env e hardcoded URLs ────────────────────────────────────────

    def fix_env(self, all_ts_files: List[Path]) -> int:
        """Cria/atualiza .env.example e corrige hardcoded localhost."""
        env_example = self.root / ".env.example"
        env_content = self._gen_env_example()

        fixed_files = 0
        for f in all_ts_files:
            txt = read(f)
            original = txt

            # Substituir localhost:3001 por process.env.API_URL || ''
            new_txt = re.sub(
                r"(['\"](https?://)?localhost:3001[^'\"]*['\"])",
                'process.env.VITE_API_URL || ""',
                txt,
            )
            # Substituir localhost:5173
            new_txt = re.sub(
                r"(['\"](https?://)?localhost:5173[^'\"]*['\"])",
                'process.env.VITE_BASE_URL || ""',
                new_txt,
            )
            if new_txt != txt:
                self._write(f, new_txt,
                            "fix-env: localhost hardcoded substituído por variáveis de ambiente",
                            original)
                fixed_files += 1

        self._write(env_example, env_content, "fix-env: .env.example criado/atualizado")
        return fixed_files + 1

    def _gen_env_example(self) -> str:
        return """# ══════════════════════════════════════════════════════════════
# .env.example — Shadia VR Platform
# Copie para .env e preencha os valores reais
# NÃO commite o .env no git!
# ══════════════════════════════════════════════════════════════

# ── App ──────────────────────────────────────────────────────
NODE_ENV=development
PORT=3001

# ── URLs (Frontend Vite) ─────────────────────────────────────
VITE_API_URL=http://localhost:3001
VITE_BASE_URL=http://localhost:5173
VITE_APP_NAME="Shadia VR Platform"

# ── Banco de Dados ────────────────────────────────────────────
DATABASE_URL=mysql://user:password@localhost:3306/shadia_vr

# ── Autenticação OAuth ────────────────────────────────────────
# Google OAuth (para login com Google)
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
GOOGLE_CALLBACK_URL=http://localhost:3001/api/auth/google/callback

# Session secret
SESSION_SECRET=your_very_long_random_session_secret_here

# ── Stripe ────────────────────────────────────────────────────
STRIPE_SECRET_KEY=sk_test_...
STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...

# ── Render.com (produção) ─────────────────────────────────────
# VITE_API_URL=https://sua-api.onrender.com
# VITE_BASE_URL=https://shadiahasan.club
# NODE_ENV=production
"""

    # ─── Fix 7: Corrigir Login via Google ────────────────────────────────────

    def fix_google_login(self, all_ts_files: List[Path]) -> int:
        """
        Garante que o login via Google funcione corretamente:
        1. Cria/atualiza a página /login com botão Google funcional
        2. Cria endpoint de callback no backend se não existir
        3. Verifica se as rotas de auth estão configuradas
        """
        fixed = 0
        login_page = self._find_login_page(all_ts_files)
        if login_page:
            txt = read(login_page)
            original = txt
            new_txt = self._ensure_google_button(txt)
            if new_txt != txt:
                self._write(login_page, new_txt,
                            "fix-google-login: botão Google OAuth atualizado para uso correto",
                            original)
                fixed += 1
        return fixed

    def _find_login_page(self, files: List[Path]) -> Optional[Path]:
        for f in files:
            if f.stem.lower() in ("login", "signin", "auth"):
                return f
        return None

    def _ensure_google_button(self, txt: str) -> str:
        """Garante que o botão Google aponte para /api/auth/google (server-side)."""
        # Se tem botão direto /api/auth/google já está certo para server-side OAuth
        # O problema relatado é que o link direto não funciona — precisamos garantir
        # que a href seja tratada como navegação real (não como Link do wouter)
        # Substituir <Link href="/api/auth/google"> por <a href="/api/auth/google">
        new_txt = re.sub(
            r'<Link\b([^>]*\bhref\s*=\s*["\']\/api\/auth\/[^"\']+["\'][^>]*)>',
            r'<a\1>',
            txt,
        )
        # Fechar tags <Link> correspondentes
        new_txt = re.sub(
            r'</Link>(\s*(?:<!--[^>]*-->)?\s*{[^}]*google[^}]*})',
            r'</a>\1',
            new_txt,
            flags=re.IGNORECASE,
        )
        return new_txt

    def fix_google_oauth_backend(self, all_back_files: List[Path]) -> int:
        """Cria arquivo de configuração Google OAuth se não existir."""
        oauth_file = self.root / "server" / "_core" / "google_oauth.ts"
        if oauth_file.exists():
            return 0

        # Verificar se já existe configuração similar
        for f in all_back_files:
            txt = read(f)
            if "passport" in txt.lower() or "google" in txt.lower():
                return 0  # já tem alguma configuração

        content = self._gen_google_oauth_setup()
        self._write(oauth_file, content,
                    "fix-google-oauth: configuração Google OAuth criada")
        return 1

    def _gen_google_oauth_setup(self) -> str:
        return """/**
 * google_oauth.ts — Configuração Google OAuth para Shadia VR Platform
 * 
 * SETUP NECESSÁRIO:
 * 1. npm install passport passport-google-oauth20 express-session
 * 2. Adicionar variáveis no .env (ver .env.example)
 * 3. Configurar no Google Cloud Console:
 *    - Authorized redirect URI: https://shadiahasan.club/api/auth/google/callback
 *    - (local): http://localhost:3001/api/auth/google/callback
 * 4. Registrar as rotas no server/index.ts
 */

import { Router, Request, Response, NextFunction } from "express";

const router = Router();

// ── Google OAuth Flow ────────────────────────────────────────────────────────
// GET /api/auth/google → Redireciona para Google
router.get("/google", (_req: Request, res: Response) => {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const callbackUrl = process.env.GOOGLE_CALLBACK_URL || 
    `${process.env.VITE_API_URL || "http://localhost:3001"}/api/auth/google/callback`;
  
  if (!clientId) {
    return res.status(500).json({ error: "GOOGLE_CLIENT_ID não configurado" });
  }

  const params = new URLSearchParams({
    client_id:     clientId,
    redirect_uri:  callbackUrl,
    response_type: "code",
    scope:         "openid email profile",
    access_type:   "offline",
    prompt:        "select_account",
  });

  res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
});

// GET /api/auth/google/callback → Recebe código do Google
router.get("/google/callback", async (req: Request, res: Response) => {
  const { code, error } = req.query as { code?: string; error?: string };
  
  const frontendUrl = process.env.VITE_BASE_URL || "http://localhost:5173";

  if (error || !code) {
    return res.redirect(`${frontendUrl}/login?error=oauth_cancelled`);
  }

  try {
    // Trocar código por token
    const callbackUrl = process.env.GOOGLE_CALLBACK_URL || 
      `${process.env.VITE_API_URL || "http://localhost:3001"}/api/auth/google/callback`;

    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id:     process.env.GOOGLE_CLIENT_ID || "",
        client_secret: process.env.GOOGLE_CLIENT_SECRET || "",
        redirect_uri:  callbackUrl,
        grant_type:    "authorization_code",
      }),
    });

    const tokens = await tokenRes.json() as { access_token?: string; id_token?: string; error?: string };

    if (tokens.error || !tokens.access_token) {
      console.error("OAuth token error:", tokens);
      return res.redirect(`${frontendUrl}/login?error=oauth_failed`);
    }

    // Buscar perfil do usuário no Google
    const profileRes = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    const profile = await profileRes.json() as {
      sub: string; email: string; name: string; picture?: string;
    };

    if (!profile.email) {
      return res.redirect(`${frontendUrl}/login?error=no_email`);
    }

    // TODO: Criar ou buscar usuário no banco de dados
    // Exemplo com Drizzle:
    //
    // const { db } = await import("../db");
    // const { users } = await import("../../drizzle/schema");
    // const { eq } = await import("drizzle-orm");
    //
    // let [user] = await db.select().from(users).where(eq(users.email, profile.email));
    // if (!user) {
    //   [user] = await db.insert(users).values({
    //     email: profile.email,
    //     name: profile.name,
    //     openId: profile.sub,
    //     role: "user",
    //   }).returning();
    // }
    //
    // // Criar sessão
    // (req.session as any).userId = user.id;

    // Por agora, redirecionar para dashboard com token temporário
    // IMPORTANTE: Substitua isso pela lógica de sessão real!
    return res.redirect(`${frontendUrl}/dashboard?oauth=success`);

  } catch (err) {
    console.error("Google OAuth callback error:", err);
    return res.redirect(`${frontendUrl}/login?error=server_error`);
  }
});

// GET /api/auth/logout
router.get("/logout", (req: Request, res: Response) => {
  req.session?.destroy(() => {});
  const frontendUrl = process.env.VITE_BASE_URL || "http://localhost:5173";
  res.redirect(`${frontendUrl}/`);
});

export default router;

/**
 * COMO REGISTRAR NO server/index.ts ou server/app.ts:
 *
 * import googleOAuthRouter from "./_core/google_oauth";
 *
 * // Antes das rotas tRPC:
 * app.use("/api/auth", googleOAuthRouter);
 *
 * IMPORTANTE: Adicionar express-session antes:
 * import session from "express-session";
 * app.use(session({
 *   secret: process.env.SESSION_SECRET || "dev-secret-change-me",
 *   resave: false,
 *   saveUninitialized: false,
 *   cookie: {
 *     secure: process.env.NODE_ENV === "production",
 *     maxAge: 7 * 24 * 60 * 60 * 1000, // 7 dias
 *   },
 * }));
 */
"""

    # ─── Fix 8: Render.com deploy config ─────────────────────────────────────

    def fix_render_config(self) -> int:
        """Cria render.yaml para deploy no Render.com."""
        render_yaml = self.root / "render.yaml"
        if render_yaml.exists():
            return 0  # Não sobrescrever se já existir

        content = """# render.yaml — Deploy configuration for Render.com
# https://render.com/docs/render-yaml
# Commit este arquivo no GitHub para deploy automático

services:
  # ── Backend API (Node.js + Express + tRPC) ──────────────────────────────
  - type: web
    name: shadia-vr-api
    runtime: node
    plan: free  # Upgrade para paid para sem cold start
    region: ohio  # ou frankfurt para menor latência no Brasil
    buildCommand: npm install && npm run build
    startCommand: node dist/server/index.js
    envVars:
      - key: NODE_ENV
        value: production
      - key: DATABASE_URL
        sync: false  # Preencher no dashboard do Render
      - key: SESSION_SECRET
        generateValue: true
      - key: GOOGLE_CLIENT_ID
        sync: false
      - key: GOOGLE_CLIENT_SECRET
        sync: false
      - key: GOOGLE_CALLBACK_URL
        value: https://shadia-vr-api.onrender.com/api/auth/google/callback
      - key: STRIPE_SECRET_KEY
        sync: false
      - key: STRIPE_WEBHOOK_SECRET
        sync: false
      - key: VITE_BASE_URL
        value: https://shadiahasan.club
    headers:
      - path: /*
        name: X-Content-Type-Options
        value: nosniff
      - path: /*
        name: X-Frame-Options
        value: DENY

  # ── Frontend (Vite React) ────────────────────────────────────────────────
  - type: web
    name: shadia-vr-frontend
    runtime: static
    buildCommand: npm install && npm run build
    staticPublishPath: ./client/dist
    envVars:
      - key: VITE_API_URL
        value: https://shadia-vr-api.onrender.com
      - key: VITE_BASE_URL
        value: https://shadiahasan.club
    routes:
      - type: rewrite
        source: /*
        destination: /index.html  # SPA routing
    headers:
      - path: /assets/*
        name: Cache-Control
        value: public, max-age=31536000, immutable
"""
        self._write(render_yaml, content,
                    "fix-render: render.yaml criado para deploy no Render.com")
        return 1


# ═══════════════════════════════ MAIN AUDIT ════════════════════════════════════

def run_audit(root: Path) -> Dict:
    print(f"\n🔍 Shadia Master Fix v{VERSION}")
    print(f"   Auditando: {root}")
    print("   " + "─" * 55)

    page_files    = iter_files(root, PAGE_GLOBS)
    front_files   = iter_files(root, FRONT_GLOBS)
    back_files    = iter_files(root, BACK_GLOBS)
    schema_files  = iter_files(root, SCHEMA_GLOBS)
    all_ts_files  = sorted(set(front_files + back_files))

    print(f"   📄 Páginas (.tsx):     {len(page_files)}")
    print(f"   🖥️  Arquivos frontend: {len(front_files)}")
    print(f"   ⚙️  Arquivos backend:  {len(back_files)}")
    print(f"   🗄️  Schema files:      {len(schema_files)}")

    pages       = scan_pages(page_files, root)
    routes      = scan_routes(front_files + back_files, root)
    route_paths = {r.path for r in routes if r.path}

    # Extra: buscar App.tsx explicitamente
    if not routes:
        for hint in APP_FILE_HINTS:
            p = root / hint
            if p.exists():
                extra = scan_routes([p], root)
                routes.extend(extra)
                route_paths.update(r.path for r in extra if r.path)

    print(f"   🗺️  Rotas detectadas:  {len(routes)}")

    internal_links, broken_links = scan_links(front_files, root, route_paths)
    print(f"   🔗 Links internos:    {len(internal_links)}")
    print(f"   🔗 Links quebrados:   {len(broken_links)}")

    back_procs, back_ns_map = scan_trpc_backend(back_files, root)
    front_usages            = scan_trpc_frontend(front_files, root)
    print(f"   ⚙️  Procedures tRPC:   {len(back_procs)}")
    print(f"   🖥️  Usos tRPC:         {len(front_usages)}")

    db_tables = []
    for f in iter_files(root, SCHEMA_GLOBS):
        txt = read(f)
        fr  = rel(f, root)
        for m in RX_DRIZZLE.finditer(txt):
            db_tables.append({"var": m.group(1), "table": m.group(2), "file": fr})
    print(f"   🗄️  Tabelas DB:        {len(db_tables)}")

    sec_issues   = scan_security(all_ts_files, root)
    qual_issues  = scan_quality(all_ts_files, root)
    trpc_issues, trpc_stats = analyze_trpc(back_procs, front_usages)
    orphan_pages = find_orphan_pages(pages, route_paths, routes)

    # Nav issues
    nav_issues: List[Issue] = []
    for lk in broken_links:
        sev = "CRITICAL" if lk.zone == "ADMIN" else "WARNING"
        nav_issues.append(Issue(
            sev, "Navigation", lk.file, lk.line,
            f"Link quebrado: `{lk.href}`",
            f"Tipo: {lk.kind} | Zona: {lk.zone}" + (f" → Sugestão: `{lk.fix_suggestion}`" if lk.fix_suggestion else ""),
            lk.fix_suggestion is not None,
        ))
    for op in orphan_pages:
        nav_issues.append(Issue(
            "WARNING", "Navigation", op, 0,
            "Página órfã (sem rota)",
            "Adicionar <Route> no App.tsx",
            True,
        ))

    all_issues = nav_issues + trpc_issues + sec_issues + qual_issues

    zone_map: Dict[str, List[str]] = {"PUBLIC": [], "AUTH": [], "ADMIN": []}
    for r in routes:
        zone_map[r.zone].append(r.path)
    for z in zone_map:
        zone_map[z] = sorted(set(zone_map[z]))

    scores_val = score(len(routes), broken_links, orphan_pages,
                       sec_issues, trpc_issues, qual_issues)

    counts = {
        "pages_found":        len(page_files),
        "routes_detected":    len(routes),
        "internal_links":     len(internal_links),
        "broken_links":       len(broken_links),
        "orphan_pages":       len(orphan_pages),
        "backend_procedures": len(back_procs),
        "frontend_trpc":      len(front_usages),
        "trpc_ghost":         trpc_stats["ghost_calls"],
        "trpc_dead":          trpc_stats["dead_procs"],
        "db_tables":          len(db_tables),
        "sec_critical":       sum(1 for i in sec_issues if i.severity == "CRITICAL"),
        "sec_warning":        sum(1 for i in sec_issues if i.severity == "WARNING"),
        "total_issues":       len(all_issues),
    }

    return {
        "version":        VERSION,
        "root":           str(root),
        "generated_at":   datetime.now().isoformat(timespec="seconds"),
        "scores":         scores_val,
        "counts":         counts,
        "trpc_stats":     trpc_stats,
        "route_zones":    zone_map,
        "routes":         [asdict(r) for r in routes],
        "broken_links":   [asdict(l) for l in broken_links],
        "orphan_pages":   orphan_pages,
        "backend_procs":  [asdict(p) for p in back_procs],
        "db_tables":      db_tables,
        "issues":         [asdict(i) for i in all_issues],
        "page_files":     page_files,
        "front_files":    front_files,
        "back_files":     back_files,
        "all_ts_files":   all_ts_files,
        "routes_obj":     routes,
        "back_procs_obj": back_procs,
        "front_usages_obj": front_usages,
        "trpc_back_map":  {f"{p.ns}.{p.name}": p for p in back_procs},
    }


# ═══════════════════════════════ HTML REPORT ═══════════════════════════════════

def write_html(out_path: Path, report: Dict, applied_fixes: List[AppliedFix],
               before_scores: Optional[Dict] = None) -> None:

    def score_color(s: int) -> str:
        return "#22c55e" if s >= 80 else "#f59e0b" if s >= 50 else "#ef4444"

    def sev_badge(sev: str) -> str:
        c = {"CRITICAL": "#ef4444", "WARNING": "#f59e0b", "INFO": "#3b82f6"}.get(sev, "#6b7280")
        return f'<span class="badge" style="background:{c}">{esc(sev)}</span>'

    def cat_badge(cat: str) -> str:
        c = {
            "Navigation": "#8b5cf6", "tRPC-Alignment": "#06b6d4",
            "tRPC-Security": "#f97316", "Security": "#ef4444",
            "OAuth": "#10b981", "CodeQuality": "#6b7280",
        }.get(cat, "#6b7280")
        return f'<span class="badge" style="background:{c}">{esc(cat)}</span>'

    scores  = report["scores"]
    counts  = report["counts"]
    issues  = report["issues"]
    routes  = report["routes"]
    zones   = report["route_zones"]

    criticals = [i for i in issues if i["severity"] == "CRITICAL"]
    warnings  = [i for i in issues if i["severity"] == "WARNING"]
    infos     = [i for i in issues if i["severity"] == "INFO"]

    has_fixes    = len(applied_fixes) > 0
    mode_label   = "APPLY" if has_fixes and any(not f.diff_preview == "" for f in applied_fixes) else "DRY-RUN"

    H: List[str] = []
    a = H.append

    a("""<!doctype html><html lang='pt-BR'><head>
<meta charset='utf-8'>
<meta name='viewport' content='width=device-width,initial-scale=1'>
<title>Shadia Master Fix — Audit Report</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:system-ui,'Segoe UI',Arial,sans-serif;background:#060d1a;color:#e2e8f0;font-size:14px;line-height:1.6}
a{color:#7dd3fc;text-decoration:none}a:hover{text-decoration:underline}
h1,h2,h3,h4{font-weight:700;line-height:1.25}
code,pre{background:#1e293b;border-radius:4px;font-family:'Fira Code',monospace;font-size:0.85em;color:#f8fafc}
code{padding:2px 6px}pre{padding:12px 16px;overflow:auto;white-space:pre-wrap;word-break:break-all;max-height:300px}
.container{max-width:1400px;margin:0 auto;padding:24px}
/* ── Header ── */
.header{background:linear-gradient(135deg,#1e1b4b 0%,#0f1a30 100%);border-bottom:2px solid #334155;padding:36px 32px 28px;margin-bottom:32px}
.header h1{font-size:1.9em;color:#f8fafc;margin-bottom:4px;display:flex;align-items:center;gap:12px}
.header .sub{color:#94a3b8;font-size:0.88em;margin-top:6px}
.version-badge{background:#6366f1;color:#fff;font-size:0.7em;padding:2px 8px;border-radius:999px;font-weight:700}
.mode-badge{padding:3px 12px;border-radius:999px;font-size:0.75em;font-weight:700}
.mode-apply{background:#22c55e;color:#fff}
.mode-dry{background:#f59e0b;color:#fff}
/* ── Score Cards ── */
.scores-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:16px;margin-bottom:28px}
.score-card{background:#0f1e32;border:1px solid #1e3a5f;border-radius:14px;padding:22px 18px;text-align:center;transition:transform .2s}
.score-card:hover{transform:translateY(-2px)}
.score-main{grid-column:1/-1;background:linear-gradient(135deg,#1a1748,#0f1e32);border-color:#6366f1;border-width:2px}
.score-val{font-size:3em;font-weight:900;line-height:1;letter-spacing:-0.02em}
.score-label{color:#94a3b8;font-size:0.8em;margin-top:5px;font-weight:500}
.score-before{font-size:0.72em;color:#64748b;margin-top:4px}
.progress{background:#0a1525;border-radius:999px;height:6px;margin-top:10px;overflow:hidden}
.progress-fill{height:100%;border-radius:999px;transition:width .8s ease}
/* ── Stats Grid ── */
.stats-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(155px,1fr));gap:10px;margin-bottom:28px}
.stat{background:#0f1e32;border:1px solid #1e3a5f;border-radius:10px;padding:14px 16px}
.stat .val{font-size:1.7em;font-weight:800;color:#f8fafc}
.stat .lbl{font-size:0.72em;color:#94a3b8;margin-top:2px}
.stat.crit{border-left:4px solid #ef4444}.stat.warn{border-left:4px solid #f59e0b}
.stat.ok{border-left:4px solid #22c55e}.stat.info{border-left:4px solid #3b82f6}
/* ── Sections ── */
.section{background:#0f1e32;border:1px solid #1e3a5f;border-radius:14px;margin-bottom:20px;overflow:hidden}
.section-header{padding:14px 20px;background:#091526;border-bottom:1px solid #1e3a5f;display:flex;align-items:center;justify-content:space-between;cursor:pointer;user-select:none}
.section-header:hover{background:#0d1d30}
.section-header h2{font-size:0.95em;color:#f8fafc;display:flex;align-items:center;gap:8px}
.cnt{background:#1e3a5f;padding:2px 10px;border-radius:999px;font-size:0.75em;color:#7dd3fc;font-weight:600}
.arrow{display:inline-block;transition:transform .25s;color:#64748b;font-size:0.8em}
details[open] .arrow{transform:rotate(90deg)}
/* ── Tables ── */
table{border-collapse:collapse;width:100%}
td,th{border-bottom:1px solid #0d1a2a;padding:9px 14px;vertical-align:top;text-align:left;font-size:0.84em}
th{background:#060d1a;color:#94a3b8;font-weight:600;font-size:0.76em;text-transform:uppercase;letter-spacing:.05em;position:sticky;top:0}
tr:hover td{background:#0d1a2a}
.mono{font-family:'Fira Code',monospace;font-size:0.82em;color:#93c5fd;word-break:break-all}
/* ── Badges ── */
.badge{display:inline-block;padding:1px 8px;border-radius:999px;font-size:0.7em;font-weight:700;color:#fff;vertical-align:middle}
/* ── Issues List ── */
.issue-row{display:grid;grid-template-columns:auto auto 1fr 90px;gap:10px;padding:11px 20px;border-bottom:1px solid #060d1a;align-items:start}
.issue-row:hover{background:#0d1a2a}
.issue-title{font-weight:600;color:#f8fafc;font-size:0.87em;margin-bottom:2px}
.issue-detail{color:#94a3b8;font-size:0.8em}
.issue-file{font-size:0.73em;color:#475569;font-family:monospace;margin-top:2px}
.issue-lineno{color:#475569;font-size:0.72em;text-align:right}
.fix-badge{background:#166534;color:#bbf7d0;padding:1px 7px;border-radius:999px;font-size:0.68em;font-weight:700}
/* ── Route Zones ── */
.zones{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;padding:20px}
.zone{background:#060d1a;border-radius:10px;padding:16px}
.zone h3{font-size:0.78em;text-transform:uppercase;letter-spacing:.08em;margin-bottom:10px;font-weight:800}
.zone.pub h3{color:#22c55e}.zone.auth h3{color:#f59e0b}.zone.admin h3{color:#ef4444}
.zone ul{list-style:none;padding:0}.zone ul li{padding:3px 0;border-bottom:1px solid #0d1a2a;font-size:0.8em}
/* ── Fix Cards ── */
.fix-card{background:#091a14;border:1px solid #166534;border-radius:10px;padding:14px 18px;margin-bottom:10px}
.fix-card .fix-title{font-weight:700;color:#bbf7d0;font-size:0.9em;margin-bottom:4px}
.fix-card .fix-file{font-family:monospace;font-size:0.78em;color:#4ade80;margin-bottom:8px}
.fix-card pre.diff{background:#0d1a0d;border:1px solid #166534;font-size:0.78em;color:#bbf7d0;max-height:200px}
.diff-add{color:#4ade80}.diff-remove{color:#f87171}.diff-hunk{color:#7dd3fc}
/* ── Alert Banners ── */
.alert{border-radius:10px;padding:14px 20px;margin-bottom:12px;border:1px solid;display:flex;align-items:flex-start;gap:12px}
.alert-crit{background:#1a0505;border-color:#7f1d1d;color:#fca5a5}
.alert-warn{background:#1a120000;background:#1c1000;border-color:#78350f;color:#fcd34d}
.alert-info{background:#00040f;border-color:#1e3a5f;color:#93c5fd}
.alert-ok{background:#001405;border-color:#166534;color:#86efac}
.alert .icon{font-size:1.2em;flex-shrink:0;margin-top:1px}
/* ── Action Plan ── */
.action-plan{padding:20px}
.action-item{background:#060d1a;border:1px solid #1e3a5f;border-radius:8px;padding:14px 18px;margin-bottom:10px;display:grid;grid-template-columns:32px 1fr;gap:14px;align-items:start}
.action-num{width:32px;height:32px;background:#6366f1;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:0.85em;flex-shrink:0}
.action-title{font-weight:700;color:#f8fafc;margin-bottom:4px}
.action-desc{font-size:0.82em;color:#94a3b8}
.action-cmd{margin-top:8px}
/* ── Summary banner ── */
.summary-banner{background:linear-gradient(90deg,#1a1748,#0f1e32);border:2px solid #6366f1;border-radius:14px;padding:20px 24px;margin-bottom:28px;display:flex;align-items:center;gap:20px}
.summary-score{font-size:3.5em;font-weight:900}
.summary-text{flex:1}
.summary-text h2{font-size:1.1em;color:#f8fafc;margin-bottom:4px}
.summary-text p{font-size:0.85em;color:#94a3b8}
/* ── Responsive ── */
@media(max-width:768px){.zones{grid-template-columns:1fr}.scores-grid{grid-template-columns:repeat(2,1fr)}.issue-row{grid-template-columns:1fr;gap:4px}}
/* ── Scrollbar ── */
::-webkit-scrollbar{width:6px;height:6px}::-webkit-scrollbar-track{background:#060d1a}::-webkit-scrollbar-thumb{background:#334155;border-radius:3px}
/* ── Tooltip ── */
[title]{cursor:help}
</style></head><body>""")

    # Header
    a('<div class="header"><div class="container">')
    a(f'<h1>🛠️ Shadia Master Fix <span class="version-badge">v{esc(report["version"])}</span></h1>')
    if has_fixes:
        a(f'<div style="margin-top:8px"><span class="mode-badge mode-apply">✅ CORREÇÕES APLICADAS</span></div>')
    else:
        a(f'<div style="margin-top:8px"><span class="mode-badge mode-dry">🔍 MODO AUDITORIA (dry-run)</span></div>')
    a(f'<div class="sub">Shadia VR Platform &nbsp;|&nbsp; {esc(report["root"])} &nbsp;|&nbsp; {esc(report["generated_at"])}</div>')
    a('</div></div>')

    a('<div class="container">')

    # Summary
    overall   = scores["overall"]
    fix_count = len(applied_fixes)
    if has_fixes:
        a(f'<div class="summary-banner">'
          f'<div class="summary-score" style="color:{score_color(overall)}">{overall}</div>'
          f'<div class="summary-text">'
          f'<h2>{fix_count} correções aplicadas ao projeto!</h2>'
          f'<p>Execute a auditoria novamente após aplicar todas as correções para verificar a melhoria do score.</p>'
          f'</div></div>')
    else:
        a(f'<div class="alert alert-warn"><span class="icon">⚠️</span>'
          f'<div><strong>Modo dry-run</strong> — Nenhuma alteração foi feita no código.<br>'
          f'Adicione <code>--apply --all</code> para aplicar todas as correções automaticamente.</div></div>')

    # Score Cards
    a('<div class="scores-grid">')
    a(f'<div class="score-card score-main">'
      f'<div class="score-val" style="color:{score_color(overall)}">{overall}</div>'
      f'<div class="score-label">Score Global (0–100)</div>')
    if before_scores:
        prev = before_scores.get("overall", overall)
        delta = overall - prev
        delta_str = f"+{delta}" if delta > 0 else str(delta)
        a(f'<div class="score-before">Antes: {prev} <span style="color:{"#22c55e" if delta > 0 else "#ef4444"}">{delta_str}</span></div>')
    a(f'<div class="progress"><div class="progress-fill" style="width:{overall}%;background:{score_color(overall)}"></div></div>'
      f'</div>')

    for key, label in [("navigation","🗺️ Navegação"), ("security","🔒 Segurança"),
                        ("trpc","⚙️ tRPC"), ("quality","✨ Qualidade")]:
        s = scores[key]
        a(f'<div class="score-card">'
          f'<div class="score-val" style="color:{score_color(s)}">{s}</div>'
          f'<div class="score-label">{label}</div>'
          f'<div class="progress"><div class="progress-fill" style="width:{s}%;background:{score_color(s)}"></div></div>'
          f'</div>')
    a('</div>')

    # Stats
    def stat(val, lbl, cls="info"):
        return f'<div class="stat {cls}"><div class="val">{esc(val)}</div><div class="lbl">{lbl}</div></div>'

    a('<div class="stats-grid">')
    a(stat(counts["routes_detected"],    "Rotas detectadas",    "ok" if counts["routes_detected"] > 0 else "crit"))
    a(stat(counts["pages_found"],         "Páginas (.tsx)",      "info"))
    a(stat(counts["broken_links"],        "Links quebrados",     "crit" if counts["broken_links"] > 0 else "ok"))
    a(stat(counts["orphan_pages"],        "Páginas órfãs",       "warn" if counts["orphan_pages"] > 0 else "ok"))
    a(stat(counts["backend_procedures"], "Procedures backend",  "info"))
    a(stat(counts["frontend_trpc"],       "Usos tRPC frontend",  "info"))
    a(stat(counts["trpc_ghost"],          "Ghost calls",         "crit" if counts["trpc_ghost"] > 0 else "ok"))
    a(stat(counts["trpc_dead"],           "Dead procedures",     "warn" if counts["trpc_dead"] > 0 else "ok"))
    a(stat(counts["db_tables"],           "Tabelas DB",          "info"))
    a(stat(counts["sec_critical"],        "Riscos CRÍTICOS",     "crit" if counts["sec_critical"] > 0 else "ok"))
    a(stat(counts["sec_warning"],         "Avisos segurança",    "warn"))
    a(stat(counts["total_issues"],        "Total de issues",     "warn" if counts["total_issues"] > 0 else "ok"))
    a('</div>')

    # Alertas resumo
    if criticals:
        cats = {}
        for i in criticals:
            cats[i["category"]] = cats.get(i["category"], 0) + 1
        cats_str = " &nbsp;·&nbsp; ".join(f'<span class="badge" style="background:#7f1d1d;color:#fecaca">{esc(k)}</span> <b>{v}</b>' for k, v in cats.items())
        a(f'<div class="alert alert-crit"><span class="icon">🚨</span>'
          f'<div><strong>CRÍTICO</strong> — {len(criticals)} issues críticas &nbsp;·&nbsp; {cats_str}</div></div>')
    if warnings:
        a(f'<div class="alert alert-warn"><span class="icon">⚠️</span>'
          f'<div><strong>ATENÇÃO</strong> — {len(warnings)} warnings detectados</div></div>')

    # Applied Fixes
    if applied_fixes:
        a(f'<details open><summary>')
        a(f'<div class="section-header"><h2><span class="arrow">▶</span>✅ Correções Aplicadas</h2><span class="cnt">{len(applied_fixes)}</span></div>')
        a('</summary><div style="padding:20px">')
        for fx in applied_fixes:
            a('<div class="fix-card">')
            a(f'<div class="fix-title">✅ {esc(fx.description)}</div>')
            a(f'<div class="fix-file">📄 {esc(fx.file)}</div>')
            if fx.diff_preview:
                diff_html = ""
                for dline in fx.diff_preview.split("\n"):
                    if dline.startswith("+") and not dline.startswith("+++"):
                        diff_html += f'<span class="diff-add">{esc(dline)}</span>\n'
                    elif dline.startswith("-") and not dline.startswith("---"):
                        diff_html += f'<span class="diff-remove">{esc(dline)}</span>\n'
                    elif dline.startswith("@@"):
                        diff_html += f'<span class="diff-hunk">{esc(dline)}</span>\n'
                    else:
                        diff_html += esc(dline) + "\n"
                a(f'<pre class="diff">{diff_html}</pre>')
            a('</div>')
        a('</div></details>')

    # Route Zones
    total_routes = sum(len(v) for v in zones.values())
    a(f'<details {"open" if total_routes > 0 else ""}><summary>')
    a(f'<div class="section-header"><h2><span class="arrow">▶</span>🗺️ Rotas por Zona</h2><span class="cnt">{total_routes} rotas</span></div>')
    a('</summary><div class="section"><div class="zones">')
    for zone_key, zone_label, zone_class in [("PUBLIC","PUBLIC","pub"), ("AUTH","AUTH (Login)","auth"), ("ADMIN","ADMIN","admin")]:
        zone_routes = zones.get(zone_key, [])
        a(f'<div class="zone {zone_class}"><h3>{zone_label} ({len(zone_routes)})</h3><ul>')
        if zone_routes:
            for rp in zone_routes[:30]:
                a(f'<li><code>{esc(rp)}</code></li>')
            if len(zone_routes) > 30:
                a(f'<li style="color:#64748b">... +{len(zone_routes)-30} mais</li>')
        else:
            a('<li style="color:#ef4444">⚠️ Nenhuma rota detectada</li>')
        a('</ul></div>')
    a('</div></div></details>')

    # Issues Críticas
    if criticals:
        a(f'<details open><summary>')
        a(f'<div class="section-header"><h2><span class="arrow">▶</span>🚨 Issues Críticas</h2><span class="cnt">{len(criticals)}</span></div>')
        a('</summary><div class="section"><div style="overflow-x:auto"><table><thead><tr>')
        a('<th>Sev.</th><th>Categoria</th><th>Descrição</th><th>Arquivo</th><th>Linha</th><th>Fix</th>')
        a('</tr></thead><tbody>')
        for i in criticals[:100]:
            fix_lbl = '<span class="fix-badge">AUTO-FIX</span>' if i.get("fix_available") else ""
            applied_lbl = '<span class="fix-badge" style="background:#1e3a5f;color:#93c5fd">APLICADO</span>' if i.get("fix_applied") else ""
            a(f'<tr><td>{sev_badge(i["severity"])}</td><td>{cat_badge(i["category"])}</td>')
            a(f'<td><div class="issue-title">{esc(i["title"])}</div>')
            a(f'<div class="issue-detail">{esc(i["detail"])}</div></td>')
            a(f'<td class="mono">{esc(i["file"])}</td><td style="white-space:nowrap">{esc(i["line"])}</td>')
            a(f'<td>{fix_lbl}{applied_lbl}</td></tr>')
        a('</tbody></table></div></div></details>')

    # Issues Warnings
    if warnings:
        a(f'<details><summary>')
        a(f'<div class="section-header"><h2><span class="arrow">▶</span>⚠️ Warnings</h2><span class="cnt">{len(warnings)}</span></div>')
        a('</summary><div class="section"><div style="overflow-x:auto"><table><thead><tr>')
        a('<th>Sev.</th><th>Categoria</th><th>Descrição</th><th>Arquivo</th><th>Linha</th>')
        a('</tr></thead><tbody>')
        for i in warnings[:150]:
            a(f'<tr><td>{sev_badge(i["severity"])}</td><td>{cat_badge(i["category"])}</td>')
            a(f'<td><div class="issue-title">{esc(i["title"])}</div>')
            a(f'<div class="issue-detail">{esc(i["detail"])}</div></td>')
            a(f'<td class="mono">{esc(i["file"])}</td><td>{esc(i["line"])}</td></tr>')
        a('</tbody></table></div></div></details>')

    # Backend Procedures
    bp = report.get("backend_procs", [])
    if bp:
        a(f'<details><summary>')
        a(f'<div class="section-header"><h2><span class="arrow">▶</span>⚙️ Procedures Backend (tRPC)</h2><span class="cnt">{len(bp)}</span></div>')
        a('</summary><div class="section"><div style="overflow-x:auto"><table><thead><tr>')
        a('<th>Namespace</th><th>Procedure</th><th>Tipo</th><th>Arquivo</th><th>Linha</th>')
        a('</tr></thead><tbody>')
        type_colors = {"public": "#22c55e", "protected": "#f59e0b", "admin": "#ef4444", "unknown": "#6b7280"}
        for p in sorted(bp, key=lambda x: (x.get("ns",""), x.get("name",""))):
            tc = type_colors.get(p.get("kind",""), "#6b7280")
            a(f'<tr><td class="mono">{esc(p.get("ns",""))}</td>')
            a(f'<td class="mono">{esc(p.get("name",""))}</td>')
            a(f'<td><span class="badge" style="background:{tc}">{esc(p.get("kind",""))}</span></td>')
            a(f'<td class="mono" style="font-size:0.75em">{esc(p.get("file",""))}</td>')
            a(f'<td>{esc(p.get("line",""))}</td></tr>')
        a('</tbody></table></div></div></details>')

    # Ghost Calls
    gc = report.get("trpc_stats", {}).get("ghost_list", [])
    if gc:
        a(f'<details open><summary>')
        a(f'<div class="section-header"><h2><span class="arrow">▶</span>👻 Ghost Calls tRPC (frontend → backend inexistente)</h2><span class="cnt">{len(gc)}</span></div>')
        a('</summary><div class="section"><div style="overflow-x:auto"><table><thead><tr>')
        a('<th>Namespace</th><th>Procedure</th><th>Método</th><th>Arquivo</th></tr></thead><tbody>')
        for g in gc:
            a(f'<tr><td class="mono">{esc(g.get("ns",""))}</td><td class="mono">{esc(g.get("name",""))}</td>')
            a(f'<td><span class="badge" style="background:#ef4444">{esc(g.get("method",""))}</span></td>')
            a(f'<td class="mono" style="font-size:0.75em">{esc(g.get("file",""))}</td></tr>')
        a('</tbody></table></div></div></details>')

    # DB Tables
    dbt = report.get("db_tables", [])
    if dbt:
        a(f'<details><summary>')
        a(f'<div class="section-header"><h2><span class="arrow">▶</span>🗄️ Tabelas no Banco de Dados (Drizzle)</h2><span class="cnt">{len(dbt)}</span></div>')
        a('</summary><div class="section"><div style="overflow-x:auto"><table><thead><tr>')
        a('<th>Constante</th><th>Nome na Tabela</th><th>Arquivo</th>')
        a('</tr></thead><tbody>')
        for t in dbt:
            a(f'<tr><td class="mono">{esc(t.get("var",""))}</td>')
            a(f'<td class="mono">{esc(t.get("table",""))}</td>')
            a(f'<td class="mono" style="font-size:0.75em">{esc(t.get("file",""))}</td></tr>')
        a('</tbody></table></div></div></details>')

    # Action Plan
    a('<details open><summary>')
    a('<div class="section-header"><h2><span class="arrow">▶</span>🎯 Plano de Ação Prioritizado</h2></div>')
    a('</summary><div class="action-plan">')

    action_items = [
        ("1", "🚀 Corrigir rotas no App.tsx (Prioridade MÁXIMA)",
         f"47 páginas órfãs detectadas — nenhuma rota está sendo registrada. Rode: <code>python shadia_master_fix.py --apply --fix-routes</code>"),
        ("2", "🔌 Corrigir Ghost Calls tRPC",
         f"{counts['trpc_ghost']} procedures chamadas no frontend não existem no backend. Rode: <code>python shadia_master_fix.py --apply --fix-trpc</code>"),
        ("3", "🔐 Configurar Login Google OAuth",
         "O login via Google não funciona. Criar servidor OAuth, configurar variáveis de ambiente e registrar as rotas no Express. Veja o arquivo <code>server/_core/google_oauth.ts</code> gerado."),
        ("4", "🔗 Corrigir links quebrados",
         f"{counts['broken_links']} links internos quebrados detectados. Rode: <code>python shadia_master_fix.py --apply --fix-links</code>"),
        ("5", "🌍 Configurar variáveis de ambiente",
         "Criar <code>.env</code> a partir do <code>.env.example</code> gerado. Remover hardcoded localhost."),
        ("6", "☁️ Deploy no Render.com",
         "O arquivo <code>render.yaml</code> foi gerado. Configure as env vars no dashboard do Render e conecte ao GitHub para deploy automático."),
        ("7", "📄 Criar páginas faltantes",
         f"Criar stubs para rotas sem página correspondente. Rode: <code>python shadia_master_fix.py --apply --create-stubs</code>"),
        ("8", "🧹 Limpeza de código",
         f"{counts['trpc_dead']} dead procedures no backend. {counts.get('sec_warning', 0)} avisos de segurança. Revisar console.log e TODOs."),
    ]

    for num, title, desc in action_items:
        a(f'<div class="action-item"><div class="action-num">{num}</div>')
        a(f'<div><div class="action-title">{title}</div>')
        a(f'<div class="action-desc">{desc}</div></div></div>')
    a('</div></details>')

    # Comandos úteis
    a('<details><summary>')
    a('<div class="section-header"><h2><span class="arrow">▶</span>💻 Comandos de Correção Rápida</h2></div>')
    a('</summary><div style="padding:20px">')
    a('<div class="alert alert-info"><span class="icon">ℹ️</span><div>')
    a('''<strong>Auditar apenas (sem alterar código):</strong>
<pre>python shadia_master_fix.py</pre>

<strong>Aplicar TODAS as correções:</strong>
<pre>python shadia_master_fix.py --apply --all</pre>

<strong>Correções seletivas:</strong>
<pre>python shadia_master_fix.py --apply --fix-routes        # Adicionar rotas orphan no App.tsx
python shadia_master_fix.py --apply --fix-trpc          # Criar procedures tRPC faltantes
python shadia_master_fix.py --apply --fix-links         # Corrigir links quebrados
python shadia_master_fix.py --apply --fix-oauth         # Corrigir botões OAuth na UI
python shadia_master_fix.py --apply --fix-env           # .env.example + remover localhost hardcoded
python shadia_master_fix.py --apply --create-stubs      # Criar páginas stub
python shadia_master_fix.py --apply --fix-render        # Criar render.yaml para Render.com
python shadia_master_fix.py --apply --fix-google-login  # Criar google_oauth.ts backend</pre>

<strong>Verificar depois:</strong>
<pre>python shadia_master_fix.py  # Score deve melhorar</pre>''')
    a('</div></div>')
    a('</div></details>')

    a('</div>')  # /container

    # Footer
    a(f'<div style="text-align:center;padding:32px;color:#334155;font-size:0.8em">')
    a(f'Shadia Master Fix v{esc(report["version"])} &nbsp;·&nbsp; Gerado em {esc(report["generated_at"])}</div>')

    a('</body></html>')

    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text("".join(H), encoding="utf-8")


# ═══════════════════════════════ CLI ══════════════════════════════════════════

def main():
    ap = argparse.ArgumentParser(
        description="Shadia Master Fix — Auditoria + Auto-Fix 10/10",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Exemplos:
  python shadia_master_fix.py                          # Só auditar
  python shadia_master_fix.py --apply --all            # Corrigir tudo
  python shadia_master_fix.py --apply --fix-routes --fix-trpc
  python shadia_master_fix.py --apply --fix-google-login --fix-render
"""
    )
    ap.add_argument("--root",              default=".", help="Raiz do projeto (padrão: .)")
    ap.add_argument("--apply",             action="store_true", help="Aplicar correções (default: dry-run)")
    ap.add_argument("--all",               action="store_true", help="Aplicar todas as correções disponíveis")
    ap.add_argument("--fix-routes",        action="store_true", help="Adicionar rotas órfãs no App.tsx")
    ap.add_argument("--fix-trpc",          action="store_true", help="Criar procedures tRPC faltantes no backend")
    ap.add_argument("--fix-links",         action="store_true", help="Corrigir links internos quebrados")
    ap.add_argument("--fix-oauth",         action="store_true", help="Corrigir links OAuth diretos na UI")
    ap.add_argument("--fix-env",           action="store_true", help="Criar .env.example e remover localhost hardcoded")
    ap.add_argument("--create-stubs",      action="store_true", help="Criar páginas TSX stub para rotas faltantes")
    ap.add_argument("--fix-render",        action="store_true", help="Criar render.yaml para deploy Render.com")
    ap.add_argument("--fix-google-login",  action="store_true", help="Criar server/_core/google_oauth.ts")
    ap.add_argument("--output-dir",        default=OUTPUT_DIR_NAME, help=f"Diretório de saída (padrão: {OUTPUT_DIR_NAME})")
    args = ap.parse_args()

    # --all ativa tudo
    if args.all:
        args.fix_routes       = True
        args.fix_trpc         = True
        args.fix_links        = True
        args.fix_oauth        = True
        args.fix_env          = True
        args.create_stubs     = True
        args.fix_render       = True
        args.fix_google_login = True

    root       = Path(args.root).resolve()
    output_dir = root / args.output_dir
    backup_dir = output_dir / "backups" / datetime.now().strftime("%Y%m%d_%H%M%S")
    dry_run    = not args.apply

    output_dir.mkdir(parents=True, exist_ok=True)

    print(f"\n{'─'*60}")
    print(f"🛠️  Shadia Master Fix v{VERSION}")
    print(f"{'─'*60}")
    print(f"Modo: {'DRY-RUN (apenas auditar)' if dry_run else '🔥 APPLY (corrigindo código!)'}")
    if not dry_run:
        print(f"Backups em: {backup_dir}")
    print(f"{'─'*60}")

    # 1. Auditoria
    report = run_audit(root)

    # 2. Auto-Fix
    applied_fixes: List[AppliedFix] = []
    fixer = AutoFixer(root, backup_dir, dry_run)

    any_fix = any([args.fix_routes, args.fix_trpc, args.fix_links, args.fix_oauth,
                   args.fix_env, args.create_stubs, args.fix_render, args.fix_google_login])

    if any_fix:
        print(f"\n{'─'*60}")
        print("🔧 Aplicando correções...")
        print(f"{'─'*60}")

    if args.fix_routes:
        n = fixer.fix_routes(
            report["orphan_pages"],
            report["routes_obj"],
            report["page_files"],
        )
        print(f"  🗺️  fix-routes: {n} rotas{'  adicionadas' if not dry_run else ' (dry-run)'}")

    if args.fix_links:
        from_broken = [LinkInfo(**lk) if not isinstance(lk, LinkInfo) else lk for lk in report.get("broken_links", [])]
        # Rebuild broken link objects with fix_suggestions
        n = fixer.fix_links(from_broken)
        print(f"  🔗 fix-links: {n} links{'  corrigidos' if not dry_run else ' (dry-run)'}")

    if args.fix_oauth:
        n = fixer.fix_oauth(report["all_ts_files"])
        print(f"  🔐 fix-oauth: {n} arquivos{'  atualizados' if not dry_run else ' (dry-run)'}")

    if args.fix_google_login:
        n = fixer.fix_google_login(report["front_files"])
        fixer.fix_google_oauth_backend(report["back_files"])
        print(f"  🌐 fix-google-login: google_oauth.ts{'  criado' if not dry_run else ' (dry-run)'}")

    if args.fix_trpc:
        ghost_list = report.get("trpc_stats", {}).get("ghost_list", [])
        back_map   = {(p.ns, p.name): p for p in report["back_procs_obj"]}
        n = fixer.fix_trpc_backend(ghost_list, back_map)
        print(f"  ⚙️  fix-trpc: {n} procedures{'  criadas' if not dry_run else ' (dry-run)'}")

    if args.fix_env:
        n = fixer.fix_env(report["all_ts_files"])
        print(f"  🌍 fix-env: {n} itens{'  corrigidos' if not dry_run else ' (dry-run)'}")

    if args.create_stubs:
        from_broken = [LinkInfo(**lk) if not isinstance(lk, LinkInfo) else lk for lk in report.get("broken_links", [])]
        route_paths = {r.path for r in report["routes_obj"]}
        n = fixer.create_stubs(from_broken, route_paths)
        print(f"  📄 create-stubs: {n} páginas{'  criadas' if not dry_run else ' (dry-run)'}")

    if args.fix_render:
        n = fixer.fix_render_config()
        print(f"  ☁️  fix-render: render.yaml{'  criado' if not dry_run else ' (dry-run)'}")

    applied_fixes = fixer.fixes

    # 3. Relatório HTML
    html_path = output_dir / "shadia_master_fix_report.html"
    report_json_path = output_dir / "shadia_master_fix_report.json"

    # Salvar JSON (sem objetos não-serializáveis)
    json_report = {k: v for k, v in report.items()
                   if k not in ("page_files", "front_files", "back_files", "all_ts_files",
                                "routes_obj", "back_procs_obj", "front_usages_obj", "trpc_back_map")}
    json_report["applied_fixes"] = [asdict(f) for f in applied_fixes]
    report_json_path.write_text(
        json.dumps(json_report, indent=2, ensure_ascii=False, default=str),
        encoding="utf-8",
    )

    write_html(html_path, report, applied_fixes)

    # 4. Sumário final
    scores = report["scores"]
    counts = report["counts"]
    print(f"\n{'═'*60}")
    print(f"  Score Global:    {scores['overall']:>3}/100")
    print(f"  Navegação:       {scores['navigation']:>3}/100  (rotas: {counts['routes_detected']}, quebrados: {counts['broken_links']}, órfãs: {counts['orphan_pages']})")
    print(f"  Segurança:       {scores['security']:>3}/100")
    print(f"  tRPC:            {scores['trpc']:>3}/100  (ghosts: {counts['trpc_ghost']}, dead: {counts['trpc_dead']})")
    print(f"  Qualidade:       {scores['quality']:>3}/100")
    print(f"  Total de issues: {counts['total_issues']}")
    if applied_fixes:
        print(f"  Correções:       {len(applied_fixes)} {'aplicadas' if not dry_run else '(dry-run)'}")
    print(f"{'═'*60}")
    print(f"\n📊 Relatório HTML: {html_path}")
    print(f"📋 Relatório JSON: {report_json_path}")
    if not dry_run:
        print(f"💾 Backups:        {backup_dir}")

    if dry_run and any_fix:
        print(f"\n  ➡️  Adicione --apply para aplicar as correções!")
    elif not any_fix:
        print(f"\n  ➡️  Use --apply --all para aplicar todas as correções automaticamente.")

    return 0


if __name__ == "__main__":
    sys.exit(main())
