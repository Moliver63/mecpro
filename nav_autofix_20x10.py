#!/usr/bin/env python3
"""
nav_autofix_20x10.py — Auto-fix de navegação/rotas/páginas (React+Vite+TS + wouter)

DRY-RUN por padrão. Use --apply para aplicar e criar backups.

Uso exemplo (20/10):
  python nav_autofix_20x10.py --fix-links --create-pages --add-routes --enforce-login-gateway
  python nav_autofix_20x10.py --apply --fix-links --create-pages --add-routes --enforce-login-gateway
"""

from __future__ import annotations

import argparse
import datetime as _dt
import difflib
import json
import re
import shutil
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, List, Optional, Set, Tuple


SKIP_DIRS = {
    "node_modules", "dist", "build", ".git", ".turbo", ".next",
    ".vite", ".cache", ".pnpm", ".repo_doctor", ".doctor_backups",
    "nav_audit", "nav_fix"
}

DEFAULT_AUDIT_JSON = "nav_audit/nav_audit.json"

WOUTER_LINK_HREF_RE = re.compile(r'(<Link\\b[^>]*\\bhref\\s*=\\s*["\\\'])([^"\\\']+)(["\\\'])', re.IGNORECASE)
ANCHOR_HREF_RE = re.compile(r'(<a\\b[^>]*\\bhref\\s*=\\s*["\\\'])([^"\\\']+)(["\\\'])', re.IGNORECASE)
SETLOC_RE = re.compile(r'(setLocation\\(\\s*["\\\'])([^"\\\']+)(["\\\']\\s*\\))', re.IGNORECASE)

DIRECT_OAUTH_UI_RE = re.compile(r'(["\\\'])(/api/auth/(google|apple)[^"\\\']*)(["\\\'])', re.IGNORECASE)

ROUTE_FALLBACK_NO_PATH_RE = re.compile(r"<Route\\b(?![^>]*\\bpath=)[^>]*>", re.IGNORECASE)

ROUTE_FILE_HINTS = [
    "client/src/App.tsx",
    "src/App.tsx",
    "client/src/router.tsx",
    "client/src/routes.tsx",
    "src/router.tsx",
    "src/routes.tsx",
]


def now_tag() -> str:
    return _dt.datetime.now().strftime("%Y%m%d_%H%M%S")


def read_text(p: Path) -> str:
    return p.read_text(encoding="utf-8", errors="ignore")


def write_text(p: Path, s: str) -> None:
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(s, encoding="utf-8", newline="\\n")


def backup_file(p: Path, backup_dir: Path) -> None:
    backup_dir.mkdir(parents=True, exist_ok=True)
    dst = backup_dir / p.as_posix().replace("/", "__")
    dst.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(p, dst)


def normalize_path(p: str) -> str:
    if not p:
        return p
    p = p.split("#", 1)[0]
    p = p.split("?", 1)[0].strip()
    if p in ("*", "/*"):
        return ""
    if p.startswith("/") and p != "/" and p.endswith("/"):
        p = p[:-1]
    return p


def is_external(href: str) -> bool:
    return href.startswith(("http://", "https://", "mailto:", "tel:"))


def kebab(s: str) -> str:
    s2 = re.sub(r"([a-z0-9])([A-Z])", r"\\1-\\2", s)
    s2 = s2.replace("_", "-")
    s2 = re.sub(r"[^a-zA-Z0-9\\-]+", "-", s2)
    s2 = re.sub(r"-{2,}", "-", s2).strip("-")
    return s2.lower()


def guess_route_from_page_stem(stem: str) -> str:
    low = stem.lower()
    if low in ("home", "index"):
        return "/"
    mapping = {
        "about": "/about",
        "courses": "/courses",
        "contact": "/contact",
        "community": "/community",
        "pricing": "/pricing",
        "login": "/login",
        "signup": "/signup",
        "admin": "/admin",
        "dashboard": "/dashboard",
    }
    if low in mapping:
        return mapping[low]
    return "/" + kebab(stem)


def classify_route(path: str) -> str:
    if path.startswith("/admin"):
        return "ADMIN"
    if path.startswith(("/dashboard", "/profile", "/settings", "/account")):
        return "AUTH"
    return "PUBLIC"


def find_route_file(root: Path) -> Optional[Path]:
    for rel in ROUTE_FILE_HINTS:
        p = root / rel
        if p.exists():
            txt = read_text(p)
            if "<Route" in txt and "<Switch" in txt:
                return p
    # fallback scan
    for gp in ["client/src/**/*.tsx", "src/**/*.tsx"]:
        for p in root.glob(gp):
            if not p.is_file():
                continue
            if any(part in SKIP_DIRS for part in p.parts):
                continue
            txt = read_text(p)
            if "<Route" in txt and "<Switch" in txt:
                return p
    return None


def extract_routes_from_audit(report: Dict) -> Set[str]:
    routes = set()
    for r in report.get("routes", []) or []:
        path = normalize_path(str(r.get("path") or ""))
        if path:
            routes.add(path)
    for _, arr in (report.get("route_zones") or {}).items():
        for p in arr or []:
            p2 = normalize_path(str(p))
            if p2:
                routes.add(p2)
    return routes


def load_audit_json(root: Path, audit_json: Path) -> Dict:
    p = audit_json if audit_json.is_absolute() else (root / audit_json)
    if not p.exists():
        raise FileNotFoundError(f"Não achei {p}. Rode primeiro: python audit_nav_best.py")
    return json.loads(p.read_text(encoding="utf-8", errors="ignore"))


def iter_code_files(root: Path) -> List[Path]:
    out: List[Path] = []
    for gp in ["client/src/**/*.ts", "client/src/**/*.tsx", "src/**/*.ts", "src/**/*.tsx"]:
        for p in root.glob(gp):
            if not p.is_file():
                continue
            if any(part in SKIP_DIRS for part in p.parts):
                continue
            out.append(p)
    return sorted(set(out))


def iter_page_files(root: Path) -> List[Path]:
    out: List[Path] = []
    for gp in ["client/src/pages/**/*.tsx", "src/pages/**/*.tsx"]:
        for p in root.glob(gp):
            if not p.is_file():
                continue
            if any(part in SKIP_DIRS for part in p.parts):
                continue
            out.append(p)
    return sorted(set(out))


@dataclass
class Fix:
    file: str
    kind: str
    before: str
    after: str
    note: str


def propose_href_fix(href: str, route_paths: Set[str]) -> Optional[Tuple[str, str]]:
    if not href or href.startswith("#"):
        return None
    if is_external(href):
        return None
    if href.startswith(("/api", "/assets", "data:", "/favicon")):
        return None

    p = normalize_path(href)

    # prefix /
    if not p.startswith("/"):
        p2 = "/" + p
        if p2 in route_paths:
            return (p2, "normalizar para path absoluto (prefix /)")

    # trailing slash
    if p not in route_paths and (p + "/") in route_paths:
        return (p + "/", "adicionar trailing slash")
    if p.endswith("/") and p[:-1] in route_paths:
        return (p[:-1], "remover trailing slash")

    # case-insensitive
    lower_map = {rp.lower(): rp for rp in route_paths}
    if p.lower() in lower_map and p != lower_map[p.lower()]:
        return (lower_map[p.lower()], "ajuste de caixa (case)")

    # close match (conservador)
    candidates = difflib.get_close_matches(p, list(route_paths), n=3, cutoff=0.88)
    if candidates:
        best = candidates[0]
        seg_p = (p.split("/", 2)[1] if p.startswith("/") and len(p.split("/")) > 1 else "")
        seg_b = (best.split("/", 2)[1] if best.startswith("/") and len(best.split("/")) > 1 else "")
        if seg_p and seg_p == seg_b:
            return (best, f"close match -> {best}")
    return None


def apply_rewrite_in_file(path: Path, replacements: List[Tuple[str, str]], apply: bool, backup_dir: Path) -> List[Fix]:
    if not replacements:
        return []
    txt = read_text(path)
    original = txt

    def _replace_one(pattern, t: str, old: str, new: str) -> str:
        def sub(m):
            a, href, b = m.group(1), m.group(2), m.group(3)
            if href == old:
                return a + new + b
            return m.group(0)
        return pattern.sub(sub, t)

    fixes: List[Fix] = []
    for old, new in replacements:
        if old == new:
            continue
        new_txt = txt
        new_txt = _replace_one(WOUTER_LINK_HREF_RE, new_txt, old, new)
        new_txt = _replace_one(ANCHOR_HREF_RE, new_txt, old, new)
        new_txt = _replace_one(SETLOC_RE, new_txt, old, new)
        if new_txt != txt:
            fixes.append(Fix(path.as_posix(), "fix_link", old, new, "substituição conservadora em href/setLocation"))
            txt = new_txt

    if txt != original and apply:
        backup_file(path, backup_dir)
        write_text(path, txt)
    return fixes


def enforce_login_gateway_in_file(path: Path, apply: bool, backup_dir: Path) -> List[Fix]:
    txt = read_text(path)
    original = txt

    def sub(m):
        q1, _url, _prov, q2 = m.group(1), m.group(2), m.group(3), m.group(4)
        return f"{q1}/login{q2}"

    new_txt = DIRECT_OAUTH_UI_RE.sub(sub, txt)
    fixes: List[Fix] = []
    if new_txt != txt:
        fixes.append(Fix(path.as_posix(), "login_gateway", "/api/auth/*", "/login", "bloquear bypass do provedor na UI"))
        txt = new_txt

    if txt != original and apply:
        backup_file(path, backup_dir)
        write_text(path, txt)
    return fixes


def create_stub_page(page_path: Path, route: str, apply: bool) -> Optional[Fix]:
    if page_path.exists():
        return None

    stem = page_path.stem
    title = re.sub(r"([a-z])([A-Z])", r"\\1 \\2", stem).strip()

    # usamos format() e dobramos chaves {{ }} para TSX
    content = """import {{ Link, useLocation }} from "wouter";
import {{ useAuth }} from "@/_core/hooks/useAuth";
import UserMenu from "@/components/UserMenu";

export default function {comp}() {{
  const [, setLocation] = useLocation();
  const {{ isAuthenticated }} = useAuth();

  const goLogin = () => {{
    const next = window.location.pathname + window.location.search;
    setLocation(`/login?next=${{encodeURIComponent(next)}}`);
  }};

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-50 border-b bg-card/50 backdrop-blur-sm">
        <div className="container flex h-16 items-center justify-between">
          <Link href="/" className="flex items-center gap-2 font-semibold">
            <span className="text-lg">Shadia Hasan</span>
          </Link>

          <nav className="hidden md:flex items-center gap-6 text-sm">
            <Link href="/courses" className="hover:opacity-80">Programas</Link>
            <Link href="/about" className="hover:opacity-80">Sobre</Link>
            <Link href="/contact" className="hover:opacity-80">Contato</Link>
            <Link href="/community" className="hover:opacity-80">Comunidade</Link>
          </nav>

          <div className="flex items-center gap-3">
            {{isAuthenticated ? (
              <UserMenu />
            ) : (
              <button
                onClick={{goLogin}}
                className="inline-flex h-9 items-center justify-center rounded-md border px-4 text-sm hover:bg-muted"
              >
                Entrar
              </button>
            )}}
          </div>
        </div>
      </header>

      <main className="container py-10">
        <h1 className="text-3xl font-bold">{title}</h1>
        <p className="mt-3 text-muted-foreground">
          Página criada automaticamente pelo nav_autofix_20x10.py para a rota <code>{route}</code>.
          Ajuste o conteúdo conforme necessário.
        </p>
      </main>
    </div>
  );
}}
""".format(comp=stem, title=title, route=route)

    if apply:
        write_text(page_path, content)

    return Fix(page_path.as_posix(), "create_page", "", route, "stub TSX criado (layout padrão)")


def add_routes_to_app(app_file: Path, routes_to_add: List[Tuple[str, str]], apply: bool, backup_dir: Path) -> List[Fix]:
    if not routes_to_add:
        return []
    txt = read_text(app_file)
    original = txt

    lines = []
    for path, comp in routes_to_add:
        lines.append(f'      <Route path="{path}" component={{{comp}}} />')
    insertion = "\\n" + "\\n".join(lines) + "\\n"

    m_fallback = ROUTE_FALLBACK_NO_PATH_RE.search(txt)
    if m_fallback:
        idx = m_fallback.start()
        txt = txt[:idx] + insertion + txt[idx:]
    else:
        idx2 = txt.lower().rfind("</switch>")
        if idx2 != -1:
            txt = txt[:idx2] + insertion + txt[idx2:]

    fixes: List[Fix] = []
    if txt != original:
        fixes.append(Fix(app_file.as_posix(), "add_routes", "", str(routes_to_add), "inserido no <Switch>"))
        if apply:
            backup_file(app_file, backup_dir)
            write_text(app_file, txt)
    return fixes


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--root", default=".", help="raiz do projeto")
    ap.add_argument("--audit", default=DEFAULT_AUDIT_JSON, help="caminho do nav_audit.json")
    ap.add_argument("--apply", action="store_true", help="aplicar alterações (senão: dry-run)")
    ap.add_argument("--fix-links", action="store_true", help="tentar corrigir links internos quebrados")
    ap.add_argument("--disable-unfixable", action="store_true", help='se não der pra corrigir, substitui href por "#"')
    ap.add_argument("--create-pages", action="store_true", help="criar páginas TSX stub para rotas faltantes")
    ap.add_argument("--add-routes", action="store_true", help="adicionar rotas no App.tsx (wouter <Switch>)")
    ap.add_argument("--enforce-login-gateway", action="store_true", help="trocar links diretos /api/auth/* na UI por /login")
    args = ap.parse_args()

    root = Path(args.root).resolve()
    audit_json = Path(args.audit)
    report = load_audit_json(root, audit_json)

    backup_dir = root / ".navfix_backups" / now_tag()
    planned: List[Fix] = []
    applied: List[Fix] = []

    route_paths = extract_routes_from_audit(report)
    broken = report.get("broken_links", []) or []

    app_file = find_route_file(root)

    # 1) Fix broken links
    if args.fix_links and broken:
        repl_by_file: Dict[str, List[Tuple[str, str]]] = {}
        unfixable_by_file: Dict[str, List[str]] = {}

        for item in broken:
            file = item.get("file")
            href = item.get("href") or ""
            if not file or not href:
                continue
            fix = propose_href_fix(href, route_paths)
            if fix:
                new_href, _note = fix
                repl_by_file.setdefault(file, []).append((href, new_href))
            else:
                unfixable_by_file.setdefault(file, []).append(href)

        for rel, reps in repl_by_file.items():
            p = root / rel
            if p.exists():
                fxs = apply_rewrite_in_file(p, reps, args.apply, backup_dir)
                (applied if args.apply else planned).extend(fxs)

        if args.disable_unfixable:
            for rel, hrefs in unfixable_by_file.items():
                p = root / rel
                if not p.exists():
                    continue
                reps = [(h, "#") for h in sorted(set(hrefs))]
                fxs = apply_rewrite_in_file(p, reps, args.apply, backup_dir)
                for fx in fxs:
                    fx.kind = "disable_link"
                    fx.note = "link desabilitado (#) por não haver rota correspondente"
                (applied if args.apply else planned).extend(fxs)

    # 2) Enforce login gateway
    if args.enforce_login_gateway:
        for p in iter_code_files(root):
            fxs = enforce_login_gateway_in_file(p, args.apply, backup_dir)
            (applied if args.apply else planned).extend(fxs)

    # 3) Create pages + add routes
    orphan_pages: List[str] = report.get("orphan_pages") or []
    routes_to_add: List[Tuple[str, str]] = []

    if args.create_pages or args.add_routes:
        pages = iter_page_files(root)
        pages_by_stem = {p.stem: p for p in pages}

        # propose routes for orphan pages (existing pages not routed)
        for stem, p in pages_by_stem.items():
            rel = str(p.relative_to(root)).replace("\\\\", "/")
            if orphan_pages and rel in orphan_pages:
                path = guess_route_from_page_stem(stem)
                if path not in route_paths:
                    routes_to_add.append((path, stem))

        # create stubs for broken hrefs
        if args.create_pages:
            base = (root / "client/src/pages") if (root / "client/src/pages").exists() else (root / "src/pages")
            for item in broken:
                href = normalize_path(item.get("href") or "")
                if not href or not href.startswith("/") or href.startswith("/api"):
                    continue
                if href in route_paths:
                    continue
                seg = href.strip("/").split("/")[-1]
                if not seg:
                    continue
                comp = re.sub(r"[^A-Za-z0-9_]", "", "".join([w[:1].upper()+w[1:] for w in re.split(r"[-_ ]+", seg) if w]))
                if not comp:
                    continue
                page_path = base / f"{comp}.tsx"
                fx = create_stub_page(page_path, href, args.apply)
                if fx:
                    (applied if args.apply else planned).append(fx)
                    routes_to_add.append((href, comp))

        # add routes
        if args.add_routes:
            if not app_file:
                print("❌ Não achei App.tsx/arquivo de rotas com <Switch>. Ajuste ROUTE_FILE_HINTS ou me diga o caminho.")
            else:
                # dedup
                seen = set()
                deduped = []
                for path, comp in routes_to_add:
                    k = (path, comp)
                    if k in seen:
                        continue
                    seen.add(k)
                    deduped.append((path, comp))
                fxs = add_routes_to_app(app_file, deduped, args.apply, backup_dir)
                (applied if args.apply else planned).extend(fxs)

    out_dir = root / "nav_fix"
    out_dir.mkdir(parents=True, exist_ok=True)
    report_out = out_dir / ("nav_fix_applied.json" if args.apply else "nav_fix_plan.json")

    payload = {
        "mode": "APPLY" if args.apply else "DRY_RUN",
        "timestamp": _dt.datetime.now().isoformat(),
        "backup_dir": str(backup_dir) if args.apply else "",
        "audit_source": str((audit_json if audit_json.is_absolute() else (root / audit_json))),
        "route_count": len(route_paths),
        "planned_fixes": [fx.__dict__ for fx in planned],
        "applied_fixes": [fx.__dict__ for fx in applied],
        "notes": [
            "Depois de aplicar, rode: python audit_nav_best.py para medir melhoria.",
            "Este script é conservador: não mexe em lógica de TRPC/Auth, só navegação/rotas/páginas/links.",
        ],
    }
    report_out.write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")

    print("✅ nav_autofix_20x10 finalizado")
    print(f"- modo: {'APPLY' if args.apply else 'DRY-RUN'}")
    print(f"- relatório: {report_out}")
    if args.apply:
        print(f"- backups: {backup_dir}")
    print(f"- fixes planejados: {len(planned)} | aplicados: {len(applied)}")
    if not args.apply:
        print("➡️ Para aplicar de verdade, rode novamente com --apply")


if __name__ == "__main__":
    main()
