# nav_sim_auditor_e2e.py v2
# Auditor E2E leve: navegação + login (user/admin) + detecção de falhas UX/console/network
#
# Uso:
#   python nav_sim_auditor_e2e.py --base http://localhost:3001 --max 30
#
# Credenciais via env (opcional):
#   set AUDIT_USER_EMAIL=user@email.com
#   set AUDIT_USER_PASS=senha123
#   set AUDIT_ADMIN_EMAIL=admin@email.com
#   set AUDIT_ADMIN_PASS=senha456

import os
import json
import time
import datetime
import argparse
from dataclasses import dataclass, asdict, field
from typing import List, Set, Optional, Tuple

from playwright.sync_api import sync_playwright, Page, TimeoutError as PWTimeout

SEVERITY_ICON = {"error": "❌", "warn": "⚠️ ", "info": "ℹ️ "}


# ------------------------------------------------------------------ #
# Modelo
# ------------------------------------------------------------------ #
@dataclass
class Finding:
    severity: str       # error | warn | info
    kind: str
    mode: str           # visitor | user | admin
    url: str
    message: str
    hint: str = ""
    details: dict = field(default_factory=dict)


# ------------------------------------------------------------------ #
# Helpers de UX
# ------------------------------------------------------------------ #
def text_visible(page: Page, candidates: List[str]) -> bool:
    for t in candidates:
        try:
            if page.get_by_text(t, exact=False).first.is_visible(timeout=400):
                return True
        except Exception:
            pass
    return False


def selector_visible(page: Page, selector: str) -> bool:
    try:
        loc = page.locator(selector)
        for i in range(min(loc.count(), 5)):
            if loc.nth(i).is_visible():
                return True
    except Exception:
        pass
    return False


def has_home_link(page: Page) -> bool:
    if text_visible(page, ["Home", "Início", "Página inicial"]):
        return True
    if selector_visible(page, 'a[href="/"]'):
        return True
    if selector_visible(page, '[aria-label*="home" i],[aria-label*="início" i],[aria-label*="logo" i]'):
        return True
    return False


def has_auth_link(page: Page) -> bool:
    if text_visible(page, ["Login", "Entrar", "Logout", "Sair", "Sign in", "Sign out"]):
        return True
    if selector_visible(page, 'a[href*="/login"],a[href*="/logout"],a[href*="/signin"]'):
        return True
    return False


def page_has_content(page: Page) -> bool:
    try:
        for sel in ("main", "h1", "h2", "[class*='content']", "[class*='container']"):
            if page.locator(sel).count() > 0:
                return True
    except Exception:
        pass
    return False


def collect_links(page: Page, base: str, limit: int = 20) -> List[str]:
    seen: Set[str] = set()
    result: List[str] = []
    try:
        for el in page.locator("a[href]").all()[:150]:
            href = (el.get_attribute("href") or "").strip()
            if not href or href.startswith("#") or href.startswith("mailto:"):
                continue
            if href.startswith("/"):
                u = base + href
            elif href.startswith(base):
                u = href
            else:
                continue
            # remove query / hash para deduplicar
            u = u.split("?")[0].split("#")[0].rstrip("/") or base + "/"
            if u not in seen:
                seen.add(u)
                result.append(u)
            if len(result) >= limit:
                break
    except Exception:
        pass
    return result


# ------------------------------------------------------------------ #
# Login heurístico
# ------------------------------------------------------------------ #
def try_login(page: Page, base: str, email: str, password: str) -> Tuple[bool, str]:
    try:
        page.goto(base + "/login", wait_until="domcontentloaded", timeout=20000)
    except Exception as e:
        return False, f"Não abriu /login: {e}"

    email_loc = page.locator(
        'input[type="email"],input[name="email"],input[placeholder*="mail" i]'
    ).first
    pass_loc = page.locator(
        'input[type="password"],input[name="password"],input[placeholder*="senha" i]'
    ).first

    try:
        if email_loc.count() == 0 or pass_loc.count() == 0:
            return False, "Formulário de login não encontrado"

        email_loc.fill(email)
        pass_loc.fill(password)

        btn = page.locator(
            'button[type="submit"],button:has-text("Entrar"),button:has-text("Login"),button:has-text("Sign in")'
        ).first
        if btn.count() > 0:
            btn.click()
        else:
            page.keyboard.press("Enter")

        page.wait_for_timeout(2000)

        if "/login" in page.url:
            if text_visible(page, ["inválid", "invalid", "erro", "credenciais", "incorreta"]):
                return False, "Credenciais inválidas"
            return False, "Ficou em /login após submit"

        return True, "OK"
    except Exception as e:
        return False, f"Exceção: {e}"


# ------------------------------------------------------------------ #
# Auditoria de uma página
# ------------------------------------------------------------------ #
def audit_page(page: Page, base: str, url: str, mode: str) -> Tuple[List[Finding], List[str]]:
    findings: List[Finding] = []
    console_errors: List[str] = []
    page_js_errors: List[str] = []
    net_errors: List[dict] = []

    def on_console(msg):
        if msg.type == "error":
            console_errors.append(msg.text[:300])

    def on_page_error(err):
        page_js_errors.append(str(err)[:300])

    def on_response(resp):
        try:
            if resp.status >= 400:
                u = resp.url
                # ignora assets estáticos
                if any(u.endswith(ext) for ext in (".js", ".css", ".map", ".png", ".ico", ".woff2")):
                    return
                if "/assets/" in u or "/_next/static" in u or "/static/" in u:
                    return
                net_errors.append({"status": resp.status, "url": u[:200]})
        except Exception:
            pass

    page.on("console", on_console)
    page.on("pageerror", on_page_error)
    page.on("response", on_response)

    try:
        # domcontentloaded é muito mais leve que networkidle
        page.goto(url, wait_until="domcontentloaded", timeout=18000)
        # espera leve extra para React/Next hidratar
        page.wait_for_timeout(800)
    except PWTimeout:
        findings.append(Finding("error", "timeout", mode, url,
                                "Timeout ao carregar a página",
                                "Verifique se a rota existe e o servidor está estável."))
        return findings, []
    except Exception as e:
        findings.append(Finding("error", "navigation_failed", mode, url,
                                "Falha ao navegar para a página",
                                "Cheque rota e redirects infinitos.",
                                {"exception": str(e)[:200]}))
        return findings, []

    current_url = page.url

    # --- JS errors ---
    if page_js_errors:
        findings.append(Finding("error", "pageerror", mode, current_url,
                                "Erro de execução JavaScript detectado",
                                "Corrija exceptions (undefined, hooks, render crash).",
                                {"errors": page_js_errors[:5]}))

    if console_errors:
        # filtra ruídos comuns
        real = [e for e in console_errors if not any(x in e for x in [
            "favicon", "DevTools", "Warning:", "React DevTools",
            "Download the React", "net::ERR_ABORTED"
        ])]
        if real:
            findings.append(Finding("error", "console_error", mode, current_url,
                                    f"{len(real)} erro(s) no console",
                                    "Verifique imports faltando, API calls e componentes quebrados.",
                                    {"errors": real[:8]}))

    if net_errors:
        findings.append(Finding("warn", "http_errors", mode, current_url,
                                f"{len(net_errors)} requisição(ões) HTTP com erro (≥400)",
                                "Cheque auth (401/403), endpoints e CORS.",
                                {"errors": net_errors[:10]}))

    # --- UX checks ---
    if "/admin" in current_url:
        if not has_home_link(page):
            findings.append(Finding("warn", "admin_no_home_link", mode, current_url,
                                    "Painel admin sem link visível para voltar ao site",
                                    "Adicione no header/sidebar do admin um link para '/'."))
        if not text_visible(page, ["Logout", "Sair", "Sign out"]):
            findings.append(Finding("warn", "admin_no_logout", mode, current_url,
                                    "Painel admin sem botão de logout visível",
                                    "Adicione botão de logout no header do admin."))
    else:
        if not has_home_link(page):
            findings.append(Finding("warn", "missing_home_link", mode, current_url,
                                    "Página sem link para Home (href='/', texto ou logo linkado)",
                                    "Verifique se o Header/Navbar está montado nesta rota."))
        if not has_auth_link(page):
            findings.append(Finding("warn", "missing_auth_link", mode, current_url,
                                    "Sem link de login/logout visível",
                                    "O Header deve exibir Login (visitante) ou Logout (autenticado)."))

    if not page_has_content(page):
        findings.append(Finding("warn", "empty_page", mode, current_url,
                                "Página parece vazia (sem <main>, <h1>, <h2> ou .content)",
                                "Pode ser loading infinito, rota não protegida ou componente não renderizado."))

    links = collect_links(page, base)
    return findings, links


# ------------------------------------------------------------------ #
# Modo de execução (visitor / user / admin)
# ------------------------------------------------------------------ #
def run_mode(playwright_instance, base: str, seeds: List[str],
             mode: str, email: str, password: str,
             max_pages: int, headless: bool) -> List[Finding]:

    print(f"\n{'='*50}")
    print(f"  Modo: {mode.upper()}")
    print(f"{'='*50}")

    findings: List[Finding] = []

    # Cada modo usa um browser separado — evita acúmulo de memória
    browser = playwright_instance.chromium.launch(
        headless=headless,
        args=["--disable-dev-shm-usage", "--no-sandbox",
              "--disable-gpu", "--js-flags=--max-old-space-size=512"]
    )
    context = browser.new_context(
        viewport={"width": 1280, "height": 800},
        java_script_enabled=True,
    )
    page = context.new_page()

    # Login
    if mode in ("user", "admin"):
        if email and password:
            print(f"  🔑 Tentando login como {mode}...")
            ok, reason = try_login(page, base, email, password)
            if ok:
                print(f"  ✅ Login OK")
            else:
                print(f"  ⚠️  Login falhou: {reason}")
                findings.append(Finding("warn", "login_failed", mode, base + "/login",
                                        f"Login automático falhou: {reason}",
                                        "Verifique credenciais ou se o form mudou."))
        else:
            print(f"  ℹ️  Sem credenciais para {mode} — auditando sem login")
            findings.append(Finding("info", "login_skipped", mode, base + "/login",
                                    f"Login não executado (variáveis de ambiente não definidas)",
                                    f"Defina AUDIT_{mode.upper()}_EMAIL e AUDIT_{mode.upper()}_PASS."))

    queue = list(seeds)
    visited: Set[str] = set()

    while queue and len(visited) < max_pages:
        url = queue.pop(0)
        clean = url.split("?")[0].split("#")[0].rstrip("/") or base + "/"
        if clean in visited:
            continue
        visited.add(clean)

        print(f"  [{len(visited):02d}/{max_pages}] {url}")

        f, links = audit_page(page, base, url, mode)
        findings.extend(f)

        for u in links:
            uc = u.split("?")[0].split("#")[0].rstrip("/") or base + "/"
            if uc not in visited and u not in queue:
                queue.append(u)

        # Fecha e reabre a página a cada 15 visitas para liberar memória
        if len(visited) % 15 == 0:
            page.close()
            page = context.new_page()

    page.close()
    browser.close()   # fecha o browser inteiro — libera toda memória do Node.js

    ok_pages = len(visited) - sum(1 for f in findings if f.kind in ("timeout", "navigation_failed"))
    print(f"\n  Resultado: {len(visited)} páginas | {len([f for f in findings if f.severity=='error'])} erros | {len([f for f in findings if f.severity=='warn'])} avisos")
    return findings


# ------------------------------------------------------------------ #
# HTML Report
# ------------------------------------------------------------------ #
def generate_html(findings: List[Finding], base: str, duration: float) -> str:
    errors = [f for f in findings if f.severity == "error"]
    warns  = [f for f in findings if f.severity == "warn"]
    infos  = [f for f in findings if f.severity == "info"]
    now = datetime.datetime.now().strftime("%d/%m/%Y %H:%M")

    rows = ""
    for f in findings:
        color = {"error": "#f43f5e", "warn": "#fbbf24", "info": "#60a5fa"}.get(f.severity, "#888")
        icon  = {"error": "❌", "warn": "⚠️", "info": "ℹ️"}.get(f.severity, "")
        details_html = ""
        if f.details:
            details_html = f'<pre class="details">{json.dumps(f.details, ensure_ascii=False, indent=2)}</pre>'
        hint_html = f'<div class="hint">💡 {f.hint}</div>' if f.hint else ""
        rows += f"""
        <tr>
          <td><span class="badge" style="background:color-mix(in srgb,{color} 15%,transparent);color:{color};border:1px solid color-mix(in srgb,{color} 30%,transparent)">{icon} {f.severity}</span></td>
          <td><span class="mode-tag mode-{f.mode}">{f.mode}</span></td>
          <td><code class="url">{f.url.replace(base,'') or '/'}</code></td>
          <td class="msg-cell"><div class="msg">{f.message}</div>{hint_html}{details_html}</td>
        </tr>"""

    return f"""<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>E2E Audit – Shadia Platform</title>
<link href="https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&family=Syne:wght@600;800&family=Inter:wght@400;500&display=swap" rel="stylesheet">
<style>
*,*::before,*::after{{box-sizing:border-box;margin:0;padding:0}}
:root{{--bg:#080a0f;--s1:#0f1117;--s2:#161920;--border:#232530;--text:#dde1eb;--muted:#5c6270;
       --red:#f43f5e;--yellow:#fbbf24;--blue:#60a5fa;--green:#22c55e;--purple:#a78bfa}}
body{{font-family:'Inter',sans-serif;background:var(--bg);color:var(--text);min-height:100vh}}
header{{padding:48px 60px 36px;background:var(--s1);border-bottom:1px solid var(--border);position:relative;overflow:hidden}}
header::after{{content:'';position:absolute;inset:0;background:radial-gradient(ellipse 60% 80% at 90% 50%,rgba(167,139,250,.07),transparent);pointer-events:none}}
.tag{{font-family:'DM Mono',monospace;font-size:11px;letter-spacing:2px;text-transform:uppercase;color:var(--purple);margin-bottom:10px}}
h1{{font-family:'Syne',sans-serif;font-size:clamp(26px,3.5vw,40px);font-weight:800;letter-spacing:-1px;line-height:1.1}}
h1 em{{color:var(--purple);font-style:normal}}
.meta{{font-family:'DM Mono',monospace;font-size:12px;color:var(--muted);margin-top:14px}}
.stats{{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:14px;padding:32px 60px;background:var(--s2);border-bottom:1px solid var(--border)}}
.sc{{background:var(--s1);border:1px solid var(--border);border-radius:10px;padding:20px 16px;text-align:center;transition:border-color .2s}}
.sc:hover{{border-color:var(--purple)}}
.sn{{font-family:'Syne',sans-serif;font-size:38px;font-weight:800;letter-spacing:-2px;line-height:1;margin-bottom:4px}}
.sl{{font-family:'DM Mono',monospace;font-size:10px;letter-spacing:1.5px;text-transform:uppercase;color:var(--muted)}}
.table-wrap{{padding:36px 60px 60px}}
.section-label{{font-family:'DM Mono',monospace;font-size:11px;letter-spacing:2px;text-transform:uppercase;color:var(--muted);margin-bottom:16px}}
table{{width:100%;border-collapse:collapse;font-size:13px}}
thead th{{font-family:'DM Mono',monospace;font-size:10px;letter-spacing:1.5px;text-transform:uppercase;color:var(--muted);text-align:left;padding:8px 14px;border-bottom:1px solid var(--border)}}
tbody tr{{border-bottom:1px solid var(--border);transition:background .15s}}
tbody tr:hover{{background:var(--s2)}}
td{{padding:12px 14px;vertical-align:top}}
.badge{{display:inline-block;padding:2px 9px;border-radius:99px;font-family:'DM Mono',monospace;font-size:11px;white-space:nowrap}}
.mode-tag{{display:inline-block;padding:2px 9px;border-radius:99px;font-family:'DM Mono',monospace;font-size:10px;letter-spacing:.5px;text-transform:uppercase}}
.mode-visitor{{background:rgba(96,165,250,.1);color:var(--blue);border:1px solid rgba(96,165,250,.2)}}
.mode-user{{background:rgba(34,197,94,.1);color:var(--green);border:1px solid rgba(34,197,94,.2)}}
.mode-admin{{background:rgba(167,139,250,.1);color:var(--purple);border:1px solid rgba(167,139,250,.2)}}
.url{{font-family:'DM Mono',monospace;font-size:12px;color:var(--purple);background:rgba(167,139,250,.06);padding:2px 6px;border-radius:4px}}
.msg{{font-size:13px;line-height:1.5;margin-bottom:4px}}
.hint{{font-size:12px;color:var(--muted);margin-top:4px}}
.details{{font-size:11px;font-family:'DM Mono',monospace;background:var(--s1);border:1px solid var(--border);border-radius:6px;padding:8px;margin-top:8px;overflow:auto;max-height:120px;color:#8b9ab0;white-space:pre-wrap}}
.msg-cell{{max-width:520px}}
@media(max-width:768px){{header,.stats,.table-wrap{{padding-left:20px;padding-right:20px}}.stats{{grid-template-columns:repeat(2,1fr)}}}}
</style>
</head>
<body>
<header>
  <div class="tag">// E2E UX Audit</div>
  <h1>Shadia <em>Platform</em><br>Relatório E2E</h1>
  <div class="meta">{base} &nbsp;·&nbsp; {now} &nbsp;·&nbsp; {duration:.1f}s</div>
</header>
<div class="stats">
  <div class="sc"><div class="sn" style="color:var(--text)">{len(findings)}</div><div class="sl">Total findings</div></div>
  <div class="sc"><div class="sn" style="color:var(--red)">{len(errors)}</div><div class="sl">Erros</div></div>
  <div class="sc"><div class="sn" style="color:var(--yellow)">{len(warns)}</div><div class="sl">Avisos</div></div>
  <div class="sc"><div class="sn" style="color:var(--blue)">{len(infos)}</div><div class="sl">Info</div></div>
</div>
<div class="table-wrap">
  <div class="section-label">// Detalhamento</div>
  <table>
    <thead><tr><th>Severidade</th><th>Modo</th><th>Página</th><th>Detalhe</th></tr></thead>
    <tbody>{rows}</tbody>
  </table>
</div>
</body>
</html>"""


# ------------------------------------------------------------------ #
# CLI
# ------------------------------------------------------------------ #
def main():
    ap = argparse.ArgumentParser(description="Auditor E2E leve – Shadia Platform")
    ap.add_argument("--base", default="http://localhost:3001")
    ap.add_argument("--max", type=int, default=25, help="Páginas por modo (padrão: 25)")
    ap.add_argument("--out", default="audit_e2e_report.html")
    ap.add_argument("--headless", action="store_true")
    ap.add_argument("--modes", default="visitor,user,admin",
                    help="Modos separados por vírgula: visitor,user,admin")
    args = ap.parse_args()

    base = args.base.rstrip("/")
    modes = [m.strip() for m in args.modes.split(",")]

    seeds = [
        base + "/",
        base + "/courses",
        base + "/pricing",
        base + "/faq",
        base + "/about",
        base + "/contact",
        base + "/login",
        base + "/signup",
        base + "/forgot-password",
        base + "/my-courses",
        base + "/profile",
        base + "/community/explore",
        base + "/admin",
        base + "/admin/dashboard",
        base + "/admin/users",
    ]

    user_email  = os.getenv("AUDIT_USER_EMAIL", "")
    user_pass   = os.getenv("AUDIT_USER_PASS", "")
    admin_email = os.getenv("AUDIT_ADMIN_EMAIL", "")
    admin_pass  = os.getenv("AUDIT_ADMIN_PASS", "")

    creds = {
        "visitor": ("", ""),
        "user":    (user_email, user_pass),
        "admin":   (admin_email, admin_pass),
    }

    t0 = time.time()
    all_findings: List[Finding] = []

    with sync_playwright() as pw:
        for mode in modes:
            email, password = creds.get(mode, ("", ""))
            findings = run_mode(pw, base, seeds, mode, email, password,
                                max_pages=args.max, headless=args.headless)
            all_findings.extend(findings)

    duration = time.time() - t0

    # --- Terminal summary ---
    errors = [f for f in all_findings if f.severity == "error"]
    warns  = [f for f in all_findings if f.severity == "warn"]

    print("\n" + "="*60)
    print("  RELATÓRIO FINAL")
    print("="*60)
    print(f"  Findings: {len(all_findings)} | Erros: {len(errors)} | Avisos: {len(warns)}")
    print(f"  Duração:  {duration:.1f}s")
    print("-"*60)
    for f in (errors + warns)[:30]:
        print(f"  {SEVERITY_ICON.get(f.severity,'?')} [{f.mode}] {f.kind}")
        print(f"     {f.url.replace(base,'') or '/'}")
        print(f"     {f.message}")
        if f.hint:
            print(f"     💡 {f.hint}")
        print()

    # --- HTML report ---
    html = generate_html(all_findings, base, duration)
    with open(args.out, "w", encoding="utf-8") as fh:
        fh.write(html)
    print(f"  📄 Relatório HTML → {os.path.abspath(args.out)}")
    print("="*60)


if __name__ == "__main__":
    main()