#!/usr/bin/env python3
"""
╔══════════════════════════════════════════════════════════════════╗
║          🔍 MECPRO PLATFORM - SUPER AUDITOR v2.0               ║
║     Analisa páginas, rotas, imports, env vars e muito mais      ║
╚══════════════════════════════════════════════════════════════════╝

USO:
    python auditor_MECPRO.py                    # audita a pasta atual
    python auditor_MECPRO.py --path /caminho    # audita pasta específica
    python auditor_MECPRO.py --html             # gera relatório HTML
    python auditor_MECPRO.py --fix-hints        # mostra sugestões de correção
    python auditor_MECPRO.py --scan             # mostra estrutura real do projeto
"""

import os
import re
import sys
import json
import argparse
from pathlib import Path
from datetime import datetime
from collections import defaultdict

# ─────────────────────────────────────────────
#  CORES NO TERMINAL
# ─────────────────────────────────────────────
RED     = "\033[91m"
GREEN   = "\033[92m"
YELLOW  = "\033[93m"
BLUE    = "\033[94m"
MAGENTA = "\033[95m"
CYAN    = "\033[96m"
BOLD    = "\033[1m"
RESET   = "\033[0m"

def col(color, text): return f"{color}{text}{RESET}"
def ok(msg):    print(f"  {col(GREEN,'OK')}  {msg}")
def warn(msg):  print(f"  {col(YELLOW,'AV')}  {msg}")
def err(msg):   print(f"  {col(RED,'XX')}  {msg}")
def info(msg):  print(f"  {col(CYAN,'II')}  {msg}")
def section(title): print(f"\n{col(BOLD+BLUE,'='*60)}\n{col(BOLD+CYAN,'  '+title)}\n{col(BLUE,'='*60)}")

# ─────────────────────────────────────────────
#  MAPEAMENTOS ESPERADOS
# ─────────────────────────────────────────────
EXPECTED_PAGES = {
    "Login.tsx":           "Pagina de login",
    "Signup.tsx":          "Pagina de cadastro",
    "ForgotPassword.tsx":  "Esqueci minha senha",
    "ResetPassword.tsx":   "Redefinir senha",
    "VerifyEmail.tsx":     "Verificacao de email",
    "Home.tsx":            "Pagina inicial",
    "About.tsx":           "Sobre a MECPRO",
    "Contact.tsx":         "Contato",
    "FAQ.tsx":             "Perguntas frequentes",
    "Pricing.tsx":         "Planos e precos",
    "Terms.tsx":           "Termos de uso",
    "Privacy.tsx":         "Politica de privacidade",
    "NotFound.tsx":        "Pagina 404",
    "Courses.tsx":         "Listagem de cursos",
    "CourseDetail.tsx":    "Detalhe do curso",
    "LessonView.tsx":      "Visualizar aula",
    "MyCourses.tsx":       "Meus cursos",
    "Profile.tsx":         "Perfil do usuario",
    "EditProfile.tsx":     "Editar perfil",
    "MySubscription.tsx":  "Minha assinatura",
    "MyCertificates.tsx":  "Meus certificados",
    "UserReferrals.tsx":   "Indicacoes",
    "Messages.tsx":        "Mensagens",
    "Ebooks.tsx":          "Listagem de ebooks",
    "EbookReader.tsx":     "Leitor de ebook",
    "CommunityExplore.tsx":     "Explorar comunidade",
    "CommunityConnections.tsx": "Conexoes da comunidade",
    "CheckoutSuccess.tsx": "Sucesso no checkout",
    "AdminDashboard.tsx":           "Painel admin",
    "AdminUsers.tsx":               "Admin - Usuarios",
    "AdminCourses.tsx":             "Admin - Cursos",
    "AdminLessons.tsx":             "Admin - Aulas",
    "AdminCourseLessons.tsx":       "Admin - Aulas do curso",
    "AdminPrograms.tsx":            "Admin - Programas",
    "AdminPlans.tsx":               "Admin - Planos",
    "AdminAppointments.tsx":        "Admin - Agendamentos",
    "AdminFinanceiro.tsx":          "Admin - Financeiro",
    "AdminModeration.tsx":          "Admin - Moderacao",
    "AdminManageAdmins.tsx":        "Admin - Gerenciar admins",
    "AdminAccountSettings.tsx":     "Admin - Config conta",
    "AdminManageSubscriptions.tsx": "Admin - Assinaturas",
    "AdminCashbackRequests.tsx":    "Admin - Cashback",
    "AdminSettings.tsx":            "Admin - Configuracoes",
    "AdminStudents.tsx":            "Admin - Estudantes",
    "AcceptAdminInvite.tsx":        "Aceitar convite admin",
}

EXPECTED_COMPONENTS = {
    "ErrorBoundary.tsx":       "Captura erros React",
    "ProtectedRoute.tsx":      "Rotas protegidas",
    "UserMenu.tsx":            "Menu do usuario",
    "CookieConsent.tsx":       "Banner de cookies",
    "MECPROAssistantChat.tsx": "Chat assistente IA",
}

EXPECTED_ENV_VARS = {
    "DATABASE_URL":       ("obrigatorio", "URL do banco de dados MySQL"),
    "JWT_SECRET":         ("obrigatorio", "Segredo para tokens JWT"),
    "SESSION_SECRET":     ("obrigatorio", "Segredo de sessao"),
    "STRIPE_SECRET_KEY":           ("obrigatorio", "Chave secreta do Stripe"),
    "STRIPE_PUBLISHABLE_KEY":      ("obrigatorio", "Chave publica do Stripe"),
    "STRIPE_WEBHOOK_SECRET":       ("recomendado", "Webhook secret do Stripe"),
    "STRIPE_PRICE_BASICO":         ("recomendado", "ID do preco basico"),
    "STRIPE_PRICE_PREMIUM":        ("recomendado", "ID do preco premium"),
    "STRIPE_PRICE_VIP":            ("recomendado", "ID do preco VIP"),
    "GOOGLE_CLIENT_ID":            ("obrigatorio", "Client ID do Google OAuth"),
    "GOOGLE_CLIENT_SECRET":        ("obrigatorio", "Secret do Google OAuth"),
    "GOOGLE_CALLBACK_URL":         ("obrigatorio", "URL de callback Google"),
    "RESEND_API_KEY":              ("obrigatorio", "Chave da API Resend para emails"),
    "EMAIL_FROM":                  ("obrigatorio", "Email remetente"),
    "VITE_APP_NAME":               ("recomendado", "Nome do app no frontend"),
    "VITE_APP_URL":                ("recomendado", "URL do app no frontend"),
    "VITE_API_URL":                ("recomendado", "URL da API no frontend"),
    "VITE_STRIPE_PUBLISHABLE_KEY": ("obrigatorio", "Chave Stripe no frontend"),
    # Problematicas
    "VITE_OAUTH_PORTAL_URL": ("removivel", "REMOVER - causa erro Invalid URL no const.ts"),
    "VITE_APP_ID":           ("removivel", "REMOVER - causa erro Invalid URL no const.ts"),
}

EXPECTED_ROUTES = [
    "/", "/pricing", "/courses", "/courses/:slug", "/about", "/contact",
    "/faq", "/terms", "/privacy", "/404", "/ebooks",
    "/login", "/signup", "/verify-email", "/forgot-password", "/reset-password",
    "/lesson/:id", "/my-courses", "/ebook/:id", "/certificates",
    "/profile", "/edit-profile", "/my-subscription", "/messages",
    "/dashboard/referrals", "/community/explore", "/community/connections",
    "/checkout/success",
    "/dashboard", "/admin", "/admin/users", "/admin/courses",
    "/admin/lessons", "/admin/programs", "/admin/plans",
    "/admin/appointments", "/admin/financeiro", "/admin/settings",
    "/admin/students", "/admin/moderation", "/admin/manage-admins",
    "/admin/account-settings", "/admin/manage-subscriptions",
    "/admin/cashback-requests", "/admin/management",
    "/admin/courses/:id/lessons", "/admin/accept-invite",
]

SECURITY_CHECKS = [
    (r'console\.log\(.*password', "console.log com senha"),
    (r'console\.log\(.*token',    "console.log com token"),
    (r'console\.log\(.*secret',   "console.log com secret"),
    (r'sk_live_\w+',              "Chave Stripe LIVE exposta no codigo"),
    (r'pk_live_\w+',              "Chave Stripe publica exposta no codigo"),
    (r'AIza[0-9A-Za-z\-_]{35}',  "Chave Google API exposta no codigo"),
    (r'-----BEGIN.*PRIVATE KEY',  "Chave privada exposta no codigo"),
]

# ─────────────────────────────────────────────
#  DETECCAO DE ESTRUTURA
# ─────────────────────────────────────────────

def find_project_root(start):
    current = Path(start).resolve()
    for _ in range(8):
        if (current / "package.json").exists():
            return current
        current = current.parent
    return Path(start).resolve()


def find_src_dir(root):
    """Detecta onde esta a pasta src com pages React."""
    candidates = [
        root / "src",
        root / "client" / "src",
        root / "frontend" / "src",
        root / "app" / "src",
        root / "web" / "src",
        root / "ui" / "src",
    ]
    # Prioriza quem tem pasta pages
    for c in candidates:
        if c.exists() and (c / "pages").exists():
            return c
    # Busca recursiva
    for p in root.rglob("pages"):
        if p.is_dir() and p.parent.name == "src" and "node_modules" not in str(p):
            return p.parent
    # Qualquer src existente
    for c in candidates:
        if c.exists():
            return c
    return None


def scan_structure(root):
    src = find_src_dir(root)
    top_dirs = []
    try:
        top_dirs = [d.name for d in root.iterdir()
                    if d.is_dir() and not d.name.startswith(".") and d.name != "node_modules"]
    except Exception:
        pass

    app_tsx = None
    for f in root.rglob("App.tsx"):
        if "node_modules" not in str(f):
            app_tsx = f
            break

    return {
        "root": str(root),
        "src": str(src) if src else None,
        "src_rel": str(src.relative_to(root)) if src else None,
        "pages": str(src / "pages") if src and (src / "pages").exists() else None,
        "components": str(src / "components") if src and (src / "components").exists() else None,
        "app_tsx": str(app_tsx.relative_to(root)) if app_tsx else None,
        "top_dirs": top_dirs,
    }


def read_file(path):
    try:
        return Path(path).read_text(encoding="utf-8", errors="ignore")
    except Exception:
        return ""

# ─────────────────────────────────────────────
#  AUDITORES
# ─────────────────────────────────────────────

def audit_pages(src):
    results = {"found": [], "missing": [], "extra": []}
    if src is None:
        results["error"] = "Pasta src nao encontrada. Use --scan para ver a estrutura."
        return results

    pages_dir = Path(src) / "pages"
    if not pages_dir.exists():
        results["error"] = f"Pasta pages nao encontrada em {src}"
        return results

    found_files = set(f.name for f in pages_dir.rglob("*.tsx"))

    for filename, description in EXPECTED_PAGES.items():
        if filename in found_files:
            results["found"].append((filename, description))
        else:
            results["missing"].append((filename, description))

    for f in found_files:
        if f not in EXPECTED_PAGES:
            results["extra"].append(f)

    return results



def audit_pages_completeness(src):
    """
    Heuristica para detectar paginas incompletas ou com placeholders em src/pages.
    Nao faz parse completo de TS/JSX; usa sinais comuns de "stub/TODO" e ausencia de export.
    Retorna:
      {
        "incomplete": [ { "file": "...", "relpath": "...", "score": 0-100, "issues": [...] } ],
        "ok": [ { "file": "...", "relpath": "..." } ],
        "stats": { ... }
      }
    """
    results = {"incomplete": [], "ok": [], "stats": {}}
    if src is None:
        results["error"] = "Pasta src nao encontrada"
        return results

    pages_dir = Path(src) / "pages"
    if not pages_dir.exists():
        results["error"] = f"Pasta pages nao encontrada em {src}"
        return results

    # Padrões de incompletude/placeholder (case-insensitive)
    patterns = [
        (r"\bTODO\b", "TODO encontrado"),
        (r"\bFIXME\b", "FIXME encontrado"),
        (r"Página em construção|Pagina em construcao|em construção|em construcao", "Página em construção (placeholder)"),
        (r"Temporary stub|stub to prevent runtime crash|Replace this with a real import", "Stub temporário (placeholder)"),
        (r"/\*\s*FIX:", "Comentário de FIX automático (placeholder)"),
        (r"throw new Error\(", "throw new Error(...) (não implementado)"),
        (r"return\s+null\s*;", "return null; (possível placeholder)"),
    ]

    # Heurística para "função handler vazia"
    empty_handler_re = re.compile(r"(const|function)\s+([A-Za-z0-9_]+)\s*=\s*\([^)]*\)\s*=>\s*\{\s*(/\*.*?\*/\s*)?\}\s*;?", re.S)

    total = 0
    incomplete = 0
    for f in sorted(pages_dir.rglob("*.tsx")):
        total += 1
        content = read_file(f)
        rel = str(f.relative_to(Path(src).parent)) if (Path(src).parent in f.parents) else str(f)
        issues = []
        score = 0

        # Export default
        if "export default" not in content:
            issues.append("Sem 'export default' (página pode não ser componente)")
            score += 35

        # Linhas muito poucas
        line_count = len(content.splitlines())
        if line_count < 35:
            issues.append(f"Muito curto ({line_count} linhas) - pode estar incompleto")
            score += 10

        # Placeholder patterns
        low = content
        for rx, msg in patterns:
            if re.search(rx, low, flags=re.IGNORECASE):
                issues.append(msg)
                score += 12

        # Handlers vazios
        if empty_handler_re.search(content):
            issues.append("Possível handler vazio (função => { /*...*/ })")
            score += 10

        # Se a página é praticamente só um placeholder
        if re.search(r"Página em construção|Pagina em construcao", content, flags=re.IGNORECASE) and line_count < 80:
            issues.append("Página parece apenas placeholder (conteúdo mínimo)")
            score += 18

        # Normaliza score
        score = min(100, score)

        if issues and score >= 20:
            incomplete += 1
            results["incomplete"].append({
                "file": f.name,
                "relpath": rel.replace("\\", "/"),
                "score": score,
                "issues": sorted(set(issues)),
            })
        else:
            results["ok"].append({"file": f.name, "relpath": rel.replace("\\", "/")})

    results["stats"] = {"total_pages": total, "incomplete_pages": incomplete, "ok_pages": total - incomplete}
    # Ordena por score desc
    results["incomplete"].sort(key=lambda x: x["score"], reverse=True)
    return results


def audit_components(src):
    results = {"found": [], "missing": []}
    if src is None:
        results["error"] = "Pasta src nao encontrada"
        return results

    comp_dir = Path(src) / "components"
    if not comp_dir.exists():
        results["error"] = f"Pasta components nao encontrada em {src}"
        return results

    found_files = set(f.name for f in comp_dir.rglob("*.tsx"))
    for filename, description in EXPECTED_COMPONENTS.items():
        if filename in found_files:
            results["found"].append((filename, description))
        else:
            results["missing"].append((filename, description))

    return results


def audit_env(root):
    results = {"found": {}, "missing": [], "warnings": [], "problematic": []}
    env_file = Path(root) / ".env"

    if not env_file.exists():
        results["error"] = "Arquivo .env nao encontrado"
        return results

    content = read_file(env_file)
    env_vars = {}
    for line in content.splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            key, _, value = line.partition("=")
            env_vars[key.strip()] = value.strip()

    for var, (status, description) in EXPECTED_ENV_VARS.items():
        value = env_vars.get(var, "")

        if status == "removivel":
            if var in env_vars:
                results["problematic"].append((var, description, value))
            continue

        if var in env_vars and value:
            placeholders = ["SUBSTITUA", "your_", "change_me", "xxx", "TODO", "dev_change"]
            is_placeholder = any(p.lower() in value.lower() for p in placeholders)
            results["found"][var] = {
                "value": value[:30] + "..." if len(value) > 30 else value,
                "status": status,
                "placeholder": is_placeholder,
                "description": description,
            }
            if is_placeholder:
                results["warnings"].append((var, f"Placeholder: {value[:50]}"))
        else:
            results["missing"].append((var, status, description))

    return results


def audit_routes(root, src):
    results = {"defined": [], "missing": [], "duplicates": [], "broken_imports": [], "app_tsx_path": None}

    # Encontra App.tsx
    app_tsx = None
    candidates = []
    if src:
        candidates.append(Path(src) / "App.tsx")
        candidates.append(Path(src).parent / "App.tsx")
    candidates.append(Path(root) / "src" / "App.tsx")
    candidates.append(Path(root) / "client" / "src" / "App.tsx")

    for c in candidates:
        if c.exists():
            app_tsx = c
            break

    if not app_tsx:
        for f in Path(root).rglob("App.tsx"):
            if "node_modules" not in str(f):
                app_tsx = f
                break

    if not app_tsx:
        results["error"] = "App.tsx nao encontrado"
        return results

    results["app_tsx_path"] = str(app_tsx)
    content = read_file(app_tsx)

    route_pattern = re.compile(r'path=["\'\{]["\']?([^"\'}\s]+)["\']?["\'\}]')
    defined = route_pattern.findall(content)
    results["defined"] = defined

    seen = defaultdict(int)
    for r in defined:
        seen[r] += 1
    results["duplicates"] = [r for r, n in seen.items() if n > 1]

    for route in EXPECTED_ROUTES:
        found = any(d.rstrip("/") == route.rstrip("/") for d in defined)
        if not found:
            results["missing"].append(route)

    # Imports quebrados
    used = set(re.findall(r'component=\{(\w+)\}', content))
    imported = set(re.findall(r'import\s+(\w+)\s+from', content))
    stubs = set(re.findall(r'const\s+(\w+)\s*=\s*\(\s*\)\s*=>', content))
    available = imported | stubs | {"NotFound"}

    for comp in used:
        if comp not in available:
            results["broken_imports"].append(comp)

    return results


def audit_security(root, src):
    issues = []
    search = Path(src) if src else Path(root) / "src"
    if not search.exists():
        return issues
    for ext in ["*.ts", "*.tsx"]:
        for fp in search.rglob(ext):
            if "node_modules" in str(fp):
                continue
            content = read_file(fp)
            for pattern, description in SECURITY_CHECKS:
                if re.search(pattern, content, re.IGNORECASE):
                    try:
                        rel = fp.relative_to(root)
                    except Exception:
                        rel = fp
                    issues.append((str(rel), description))
    return issues


def audit_missing_features(root, src):
    issues = []
    base = Path(src) if src else Path(root) / "src"
    checks = [
        (base / "lib" / "trpc.ts",                "src/lib/trpc.ts - Configuracao tRPC"),
        (base / "_core" / "hooks" / "useAuth.ts",  "src/_core/hooks/useAuth.ts - Hook useAuth"),
        (base / "contexts" / "ThemeContext.tsx",    "src/contexts/ThemeContext.tsx"),
        (Path(root) / "server",                     "Pasta /server - Backend Express"),
        (Path(root) / "shared",                     "Pasta /shared - Tipos compartilhados"),
        (Path(root) / "drizzle.config.ts",          "drizzle.config.ts - Config Drizzle ORM"),
    ]
    for path, name in checks:
        if not path.exists():
            issues.append(name)
    return issues


def audit_typescript(root):
    results = {"config_found": False, "strict": False, "paths_configured": False}
    tsconfig = Path(root) / "tsconfig.json"
    if tsconfig.exists():
        results["config_found"] = True
        content = read_file(tsconfig)
        try:
            clean = re.sub(r'//.*', '', content)
            clean = re.sub(r'/\*.*?\*/', '', clean, flags=re.DOTALL)
            cfg = json.loads(clean)
            comp = cfg.get("compilerOptions", {})
            results["strict"] = comp.get("strict", False)
            results["paths_configured"] = "@" in str(comp.get("paths", {}))
        except Exception:
            pass
    return results


def audit_package_json(root):
    results = {"scripts": {}}
    pkg_file = Path(root) / "package.json"
    if not pkg_file.exists():
        results["error"] = "package.json nao encontrado"
        return results
    try:
        pkg = json.loads(read_file(pkg_file))
        scripts = pkg.get("scripts", {})
        for s in ["dev", "build", "start", "check"]:
            results["scripts"][s] = s in scripts
        deps = {**pkg.get("dependencies", {}), **pkg.get("devDependencies", {})}
        results["dep_count"] = len(deps)
    except Exception:
        results["error"] = "Erro ao parsear package.json"
    return results

# ─────────────────────────────────────────────
#  HTML REPORT
# ─────────────────────────────────────────────

def generate_html_report(data, output_path):
    now = datetime.now().strftime("%d/%m/%Y %H:%M")
    pages_found = len(data["pages"].get("found", []))
    pages_total = pages_found + len(data["pages"].get("missing", []))
    score = int((pages_found / max(pages_total, 1)) * 100)
    sc = '#4ade80' if score > 80 else '#fbbf24' if score > 50 else '#f87171'

    html = f"""<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8">
<title>MECPRO Audit</title><style>
body{{font-family:-apple-system,sans-serif;background:#0f0f1a;color:#e0e0e0;margin:0;padding:20px}}
h1{{color:#a78bfa;text-align:center;font-size:2em}}h2{{color:#7c3aed;border-bottom:1px solid #7c3aed44;padding-bottom:8px}}
.card{{background:#1a1a2e;border-radius:12px;padding:20px;margin:16px 0;border:1px solid #2d2d4e}}
.ok{{color:#4ade80}}.warn{{color:#fbbf24}}.err{{color:#f87171}}
.score{{font-size:3em;font-weight:bold;color:{sc};text-align:center}}
table{{width:100%;border-collapse:collapse}}td,th{{padding:8px 12px;border-bottom:1px solid #2d2d4e;text-align:left}}
th{{color:#a78bfa}}.tag{{display:inline-block;padding:2px 8px;border-radius:4px;font-size:12px;font-weight:bold}}
.tag-ok{{background:#065f46;color:#4ade80}}.tag-warn{{background:#78350f;color:#fbbf24}}.tag-err{{background:#7f1d1d;color:#f87171}}
.summary{{display:flex;gap:16px;flex-wrap:wrap;justify-content:center;margin-top:16px}}
.stat{{background:#1a1a2e;border:1px solid #7c3aed44;border-radius:8px;padding:16px 24px;text-align:center;min-width:120px}}
.stat-num{{font-size:2em;font-weight:bold}}code{{background:#0d0d1f;padding:2px 6px;border-radius:4px;font-size:13px}}
</style></head><body>
<h1>MECPRO Platform - Auditoria</h1>
<p style="text-align:center;color:#888">Gerado em {now}</p>
<div class="card">
  <div class="score">{score}%</div>
  <p style="text-align:center;color:#aaa">Completude de paginas</p>
  <div class="summary">
    <div class="stat"><div class="stat-num" style="color:#4ade80">{pages_found}</div><div>paginas OK</div></div>
    <div class="stat"><div class="stat-num" style="color:#f87171">{len(data['pages'].get('missing',[]))}</div><div>faltando</div></div>
    <div class="stat"><div class="stat-num" style="color:#fbbf24">{len(data['env'].get('missing',[]))}</div><div>env ausentes</div></div>
    <div class="stat"><div class="stat-num" style="color:#f87171">{len(data['security'])}</div><div>seg. alertas</div></div>
    <div class="stat"><div class="stat-num" style="color:#f87171">{len(data['routes'].get('broken_imports',[]))}</div><div>imports quebrados</div></div>
  </div>
</div>
"""
    # Estrutura
    struct = data.get("structure", {})
    html += f"""<div class="card"><h2>Estrutura Detectada</h2><table>
<tr><td>Raiz</td><td><code>{struct.get('root','?')}</code></td></tr>
<tr><td>src/</td><td><code>{struct.get('src_rel') or 'NAO ENCONTRADO'}</code></td></tr>
<tr><td>App.tsx</td><td><code>{struct.get('app_tsx') or 'NAO ENCONTRADO'}</code></td></tr>
<tr><td>Pastas raiz</td><td><code>{', '.join(struct.get('top_dirs', []))}</code></td></tr>
</table></div>
"""
    # Paginas
    if "error" in data["pages"]:
        html += f'<div class="card"><h2>Paginas</h2><p class="err">{data["pages"]["error"]}</p></div>\n'
    else:
        html += '<div class="card"><h2>Paginas</h2><table><tr><th>Arquivo</th><th>Descricao</th><th>Status</th></tr>\n'
        for name, desc in sorted(data["pages"]["found"]):
            html += f'<tr><td>{name}</td><td>{desc}</td><td><span class="tag tag-ok">OK</span></td></tr>\n'
        for name, desc in sorted(data["pages"]["missing"]):
            html += f'<tr><td>{name}</td><td>{desc}</td><td><span class="tag tag-err">FALTANDO</span></td></tr>\n'
        if data["pages"].get("extra"):
            for name in sorted(data["pages"]["extra"]):
                html += f'<tr><td>{name}</td><td>Pagina extra nao mapeada</td><td><span class="tag tag-warn">EXTRA</span></td></tr>\n'
        html += "</table></div>\n"


    # Paginas - Completeness / Incompletas
    section("PAGINAS INCOMPLETAS / PLACEHOLDERS")
    pq = audit_pages_completeness(src)
    if "error" in pq:
        err(pq["error"])
    else:
        st = pq.get("stats", {})
        ok(f"{st.get('ok_pages',0)}/{st.get('total_pages',0)} páginas parecem OK (heurística)")
        if pq["incomplete"]:
            warn(f"{len(pq['incomplete'])} páginas com sinais de incompletude/placeholder:")
            for item in pq["incomplete"]:
                print(f"       -> {item['file']:<30} score={item['score']:>3}  {', '.join(item['issues'][:3])}{'...' if len(item['issues'])>3 else ''}")
        else:
            ok("Nenhuma página com sinais óbvios de incompletude.")


    # Componentes
    html += '<div class="card"><h2>Componentes Essenciais</h2><table><tr><th>Arquivo</th><th>Descricao</th><th>Status</th></tr>\n'
    for name, desc in data["components"].get("found", []):
        html += f'<tr><td>{name}</td><td>{desc}</td><td><span class="tag tag-ok">OK</span></td></tr>\n'
    for name, desc in data["components"].get("missing", []):
        html += f'<tr><td>{name}</td><td>{desc}</td><td><span class="tag tag-err">FALTANDO</span></td></tr>\n'
    html += "</table></div>\n"

    # ENV
    html += '<div class="card"><h2>Variaveis de Ambiente (.env)</h2><table><tr><th>Variavel</th><th>Status</th><th>Descricao</th></tr>\n'
    for var, d in data["env"]["found"].items():
        tag = 'tag-warn' if d["placeholder"] else 'tag-ok'
        label = 'PLACEHOLDER' if d["placeholder"] else 'OK'
        html += f'<tr><td><code>{var}</code></td><td><span class="tag {tag}">{label}</span></td><td>{d["description"]}</td></tr>\n'
    for var, status, desc in data["env"]["missing"]:
        tag = 'tag-err' if status == 'obrigatorio' else 'tag-warn'
        html += f'<tr><td><code>{var}</code></td><td><span class="tag {tag}">{status.upper()}</span></td><td>{desc}</td></tr>\n'
    for var, desc, val in data["env"].get("problematic", []):
        html += f'<tr><td><code>{var}</code></td><td><span class="tag tag-err">REMOVER</span></td><td>{desc}</td></tr>\n'
    html += "</table></div>\n"

    # Rotas
    html += '<div class="card"><h2>Rotas</h2>'
    if "error" in data["routes"]:
        html += f'<p class="err">{data["routes"]["error"]}</p>'
    else:
        if data["routes"]["broken_imports"]:
            html += '<p class="err">Componentes usados sem import (causam ReferenceError):</p><ul>'
            for c in data["routes"]["broken_imports"]:
                html += f'<li><code>{c}</code></li>'
            html += '</ul>'
        if data["routes"]["duplicates"]:
            html += f'<p class="warn">Rotas duplicadas: {", ".join(data["routes"]["duplicates"])}</p>'
        if data["routes"]["missing"]:
            html += '<p class="warn">Rotas esperadas nao encontradas:</p><ul>'
            for r in data["routes"]["missing"]:
                html += f'<li><code>{r}</code></li>'
            html += '</ul>'
        if not data["routes"]["broken_imports"] and not data["routes"]["duplicates"] and not data["routes"]["missing"]:
            html += '<p class="ok">Todas as rotas OK</p>'
    html += '</div>\n'

    # Seguranca
    if data["security"]:
        html += '<div class="card"><h2>Alertas de Seguranca</h2><table><tr><th>Arquivo</th><th>Problema</th></tr>\n'
        for fp, issue in data["security"]:
            html += f'<tr><td><code>{fp}</code></td><td class="err">{issue}</td></tr>\n'
        html += "</table></div>\n"

    # Faltando
    if data["missing_features"]:
        html += '<div class="card"><h2>Arquivos Ausentes</h2><ul>'
        for f in data["missing_features"]:
            html += f'<li class="err">{f}</li>'
        html += '</ul></div>\n'

    html += '</body></html>'
    Path(output_path).write_text(html, encoding="utf-8")


# ─────────────────────────────────────────────
#  MAIN
# ─────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Auditor MECPRO Platform v2.0")
    parser.add_argument("--path", default=".", help="Caminho raiz do projeto")
    parser.add_argument("--html", action="store_true", help="Gerar relatorio HTML")
    parser.add_argument("--fix-hints", action="store_true", help="Sugestoes de correcao")
    parser.add_argument("--scan", action="store_true", help="Mostrar estrutura real")
    args = parser.parse_args()

    root = find_project_root(args.path)
    src  = find_src_dir(root)
    structure = scan_structure(root)

    print(f"\n{'='*60}")
    print(f"  MECPRO PLATFORM - SUPER AUDITOR v2.0")
    print(f"{'='*60}")
    print(f"  Raiz : {root}")
    print(f"  src/ : {src if src else 'NAO ENCONTRADO'}")
    print(f"  Hora : {datetime.now().strftime('%d/%m/%Y %H:%M:%S')}\n")

    if src is None:
        print(f"\n  ATENCAO: Pasta src/ nao detectada automaticamente!")
        print(f"  Pastas encontradas na raiz: {', '.join(structure['top_dirs'])}")
        print(f"  Use: python auditor_MECPRO.py --path CAMINHO_CORRETO --scan\n")

    # Scan
    if args.scan:
        section("ESTRUTURA REAL DO PROJETO")
        info(f"Pastas na raiz: {', '.join(structure['top_dirs'])}")
        info(f"src/: {structure.get('src_rel') or 'NAO ENCONTRADO'}")
        info(f"pages/: {structure.get('pages') or 'NAO ENCONTRADO'}")
        info(f"components/: {structure.get('components') or 'NAO ENCONTRADO'}")
        info(f"App.tsx: {structure.get('app_tsx') or 'NAO ENCONTRADO'}")
        if src:
            section("CONTEUDO DE src/")
            try:
                for item in sorted(Path(src).iterdir()):
                    if item.is_dir():
                        n = len(list(item.rglob("*.tsx"))) + len(list(item.rglob("*.ts")))
                        print(f"    {item.name+'/':30} {n} arquivos")
            except Exception as e:
                err(str(e))

    # Paginas
    section("PAGINAS (src/pages/)")
    pages = audit_pages(src)
    if "error" in pages:
        err(pages["error"])
    else:
        ok(f"{len(pages['found'])}/{len(pages['found'])+len(pages['missing'])} paginas encontradas")
        if pages["missing"]:
            err(f"{len(pages['missing'])} FALTANDO:")
            for name, desc in sorted(pages["missing"]):
                print(f"       -> {name:<38} {desc}")
        if pages["extra"]:
            info(f"Extras: {', '.join(sorted(pages['extra']))}")

    # Componentes
    section("COMPONENTES ESSENCIAIS")
    components = audit_components(src)
    if "error" in components:
        err(components["error"])
    else:
        for name, desc in components["found"]:
            ok(f"{name} - {desc}")
        for name, desc in components["missing"]:
            err(f"{name} - {desc} [FALTANDO]")

    # ENV
    section("VARIAVEIS DE AMBIENTE (.env)")
    env = audit_env(root)
    if "error" in env:
        err(env["error"])
    else:
        for var, d in env["found"].items():
            if d["placeholder"]:
                warn(f"{var} = PLACEHOLDER - substitua pelo valor real!")
            else:
                ok(var)
        if env["missing"]:
            print()
            for var, status, desc in env["missing"]:
                if status == "obrigatorio":
                    err(f"{var} - {desc} [OBRIGATORIO]")
                else:
                    warn(f"{var} - {desc} [{status}]")
        if env.get("problematic"):
            print()
            for var, desc, val in env["problematic"]:
                err(f"REMOVER: {var} - {desc}")
        if env.get("warnings"):
            print()
            for var, msg in env["warnings"]:
                warn(f"{var}: {msg}")

    # Rotas
    section("ROTAS (App.tsx)")
    routes = audit_routes(root, src)
    if "error" in routes:
        err(routes["error"])
    else:
        ok(f"{len(routes['defined'])} rotas definidas em {routes.get('app_tsx_path','?')}")
        if routes["broken_imports"]:
            print()
            for comp in routes["broken_imports"]:
                err(f"'{comp}' usado em Route mas NAO IMPORTADO -> ReferenceError!")
        if routes["duplicates"]:
            print()
            for r in routes["duplicates"]:
                warn(f"Rota duplicada: {r}")
        if routes["missing"]:
            print()
            warn(f"{len(routes['missing'])} rotas esperadas nao encontradas:")
            for r in routes["missing"]:
                print(f"       -> {r}")

    # Seguranca
    section("SEGURANCA")
    security = audit_security(root, src)
    if not security:
        ok("Nenhum problema de seguranca detectado no codigo")
    else:
        for fp, issue in security:
            err(f"{issue}")
            print(f"       -> {fp}")

    # TypeScript
    section("TYPESCRIPT")
    ts = audit_typescript(root)
    ok("tsconfig.json encontrado")       if ts["config_found"]    else err("tsconfig.json nao encontrado")
    ok("Modo strict ativado")            if ts["strict"]           else warn("Modo strict desativado")
    ok("Path aliases (@/) configurados") if ts["paths_configured"] else warn("Path aliases nao detectados")

    # Package.json
    section("PACKAGE.JSON")
    pkg = audit_package_json(root)
    if "error" in pkg:
        err(pkg["error"])
    else:
        info(f"Total de dependencias: {pkg.get('dep_count','?')}")
        for script, found in pkg["scripts"].items():
            ok(f"Script '{script}'") if found else warn(f"Script '{script}' nao encontrado")

    # Arquivos essenciais
    section("ARQUIVOS ESSENCIAIS")
    missing_features = audit_missing_features(root, src)
    if not missing_features:
        ok("Todos os arquivos essenciais encontrados")
    else:
        for f in missing_features:
            err(f"Faltando: {f}")

    # Fix hints
    if args.fix_hints:
        section("SUGESTOES DE CORRECAO")
        if src is None:
            print(f"\n  Pasta src nao detectada. Verifique:")
            print(f"  python auditor_MECPRO.py --path C:\\caminho\\projeto --scan")
        if routes.get("broken_imports"):
            print(f"\n  Adicione no App.tsx:")
            for comp in routes["broken_imports"]:
                print(f"    import {comp} from './pages/{comp}'")
        if env.get("problematic"):
            print(f"\n  Remova do .env:")
            for var, _, _ in env["problematic"]:
                print(f"    Delete a linha: {var}=...")
        pholders = [v for v, d in env.get("found", {}).items() if d.get("placeholder")]
        if pholders:
            print(f"\n  Substitua no .env:")
            for v in pholders:
                print(f"    {v} - obtenha o valor real")

    # Score
    section("SCORE FINAL")
    p_ok = len(pages.get("found", []))
    p_t  = p_ok + len(pages.get("missing", []))
    e_ok = len(env.get("found", {}))
    e_t  = e_ok + len(env.get("missing", []))
    c_ok = len(components.get("found", []))
    c_t  = c_ok + len(components.get("missing", []))
    broken = len(routes.get("broken_imports", []))
    phs    = sum(1 for d in env.get("found", {}).values() if d.get("placeholder"))

    score = int(((p_ok + e_ok + c_ok) / max(p_t + e_t + c_t, 1)) * 100)

    print(f"\n  Paginas:          {p_ok}/{p_t}")
    print(f"  Env vars:         {e_ok}/{e_t} ({phs} placeholder)")
    print(f"  Componentes:      {c_ok}/{c_t}")
    print(f"  Imports quebrados: {broken}")
    print(f"\n  SCORE: {score}%\n")

    if score >= 95 and broken == 0:
        print("  PROJETO COMPLETO!\n")
    elif score > 75 and broken == 0:
        print("  Quase completo. Verifique os itens acima.\n")
    else:
        print("  Pendencias importantes. Rode com --fix-hints\n")

    # HTML
    if args.html:
        report_data = {
            "root": str(root),
            "structure": structure,
            "pages": pages,
            "env": env,
            "components": components,
            "routes": routes,
            "security": security,
            "missing_features": missing_features,
        }
        out = root / "audit_report.html"
        generate_html_report(report_data, out)
        print(f"  Relatorio HTML gerado: {out}\n")


if __name__ == "__main__":
    main()
