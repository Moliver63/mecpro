#!/usr/bin/env python3
"""
MECPro Project Health Check
Verifica os principais pontos do projeto antes de rodar/deployar.
"""
import os, json, re
from pathlib import Path

ROOT = Path(__file__).parent
OK, WARN, FAIL = "✅", "⚠️ ", "❌"
results = []

def check(label, ok, warn=False, detail=""):
    icon = OK if ok else (WARN if warn else FAIL)
    results.append((icon, label, detail))
    print(f"{icon} {label}" + (f" — {detail}" if detail else ""))

# ── 1. Arquivos essenciais ──
print("\n📁 ARQUIVOS ESSENCIAIS")
essential = [
    "package.json", "vite.config.ts", "tsconfig.json",
    "server/_core/index.ts", "server/_core/router.ts",
    "server/db.ts", "server/schema.ts", "server/email.ts",
    "drizzle.config.ts", "client/src/App.tsx", "client/src/index.css",
    "client/index.html", "client/public/favicon.svg",
]
for f in essential:
    check(f, (ROOT / f).exists(), detail="FALTANDO" if not (ROOT / f).exists() else "")

# ── 2. .env vars ──
print("\n🔐 VARIÁVEIS DE AMBIENTE")
env_path = ROOT / ".env"
env_vars = {}
if env_path.exists():
    for line in env_path.read_text(encoding="utf-8").splitlines():
        if "=" in line and not line.startswith("#"):
            k, _, v = line.partition("=")
            env_vars[k.strip()] = v.strip()

required_env = {
    "DATABASE_URL": "postgresql://",
    "JWT_SECRET": None,
    "RESEND_API_KEY": "re_",
    "GOOGLE_CLIENT_ID": None,
    "GOOGLE_CLIENT_SECRET": None,
}
for key, prefix in required_env.items():
    val = env_vars.get(key, "")
    missing = not val or "your_" in val or val in ("re_...", "sk_test_...", "")
    placeholder = prefix and not val.startswith(prefix) if prefix else False
    check(key, not missing and not placeholder,
          warn=False,
          detail="NÃO CONFIGURADO" if missing else ("PARECE PLACEHOLDER" if placeholder else "ok"))

# ── 3. Páginas ──
print("\n📄 PÁGINAS")
pages_dir = ROOT / "client/src/pages"
pages = list(pages_dir.glob("*.tsx")) if pages_dir.exists() else []
placeholder_count = 0
for p in pages:
    content = p.read_text(encoding="utf-8")
    if "em desenvolvimento" in content:
        placeholder_count += 1
check(f"Total de páginas", True, detail=str(len(pages)))
check(f"Páginas com placeholder", placeholder_count == 0, warn=True,
      detail=f"{placeholder_count} páginas ainda com 🚧")

# ── 4. package.json scripts ──
print("\n📦 PACKAGE.JSON")
pkg = json.loads((ROOT / "package.json").read_text(encoding="utf-8"))
scripts = pkg.get("scripts", {})
for s in ["dev", "build", "start", "db:push", "seed"]:
    check(f"script:{s}", s in scripts, detail=scripts.get(s, "FALTANDO")[:60])
# Garantir que build não chama esbuild
build_cmd = scripts.get("build", "")
check("build sem esbuild server", "esbuild" not in build_cmd, detail=build_cmd[:60])

# ── 5. Imports críticos ──
print("\n🔗 IMPORTS CRÍTICOS")
app_tsx = (ROOT / "client/src/App.tsx").read_text(encoding="utf-8") if (ROOT / "client/src/App.tsx").exists() else ""
check("trpc.Provider no App.tsx", "trpc.Provider" in app_tsx)
check("QueryClientProvider no App.tsx", "QueryClientProvider" in app_tsx)
check("ErrorBoundary no App.tsx", "ErrorBoundary" in app_tsx)

router = (ROOT / "server/_core/router.ts").read_text(encoding="utf-8") if (ROOT / "server/_core/router.ts").exists() else ""
check("auth.register no router", "register:" in router)
check("auth.login no router", "login:" in router)
check("createEmailVerificationToken", "createEmailVerificationToken" in router or "createEmailVerificationToken" in (ROOT/"server/db.ts").read_text(encoding="utf-8"))

# ── 6. Google OAuth ──
print("\n🔐 GOOGLE OAUTH")
idx = (ROOT / "server/_core/index.ts").read_text(encoding="utf-8") if (ROOT / "server/_core/index.ts").exists() else ""
check("/api/auth/google endpoint", "/api/auth/google" in idx)
check("/api/auth/google/callback endpoint", "google/callback" in idx)
check("upsertOAuthUser no db", "upsertOAuthUser" in (ROOT/"server/db.ts").read_text(encoding="utf-8"))
check("Botão Google no Login.tsx", "api/auth/google" in (ROOT/"client/src/pages/Login.tsx").read_text(encoding="utf-8") if (ROOT/"client/src/pages/Login.tsx").exists() else False)

# ── 7. Email ──
print("\n📧 EMAIL")
email_ts = (ROOT / "server/email.ts").read_text(encoding="utf-8") if (ROOT / "server/email.ts").exists() else ""
check("sendVerificationEmail", "sendVerificationEmail" in email_ts)
check("sendPasswordResetEmail", "sendPasswordResetEmail" in email_ts)
check("Register envia email", "sendVerificationEmail" in router)

# ── 8. Resumo ──
total = len(results)
ok_count = sum(1 for r in results if r[0] == OK)
warn_count = sum(1 for r in results if r[0] == WARN)
fail_count = sum(1 for r in results if r[0] == FAIL)
score = int(ok_count / total * 100)

print(f"\n{'='*60}")
print(f"RESULTADO: {ok_count}/{total} checks ok — Score {score}%")
print(f"  {OK} OK: {ok_count}  {WARN} Avisos: {warn_count}  {FAIL} Falhas: {fail_count}")
if fail_count == 0:
    print("🎉 Projeto saudável! Pronto para rodar.")
else:
    print(f"⚠️  {fail_count} problema(s) a resolver antes do deploy.")
print('='*60)
