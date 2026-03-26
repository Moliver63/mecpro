import os
import re
import json
from collections import defaultdict

ROOT = os.getcwd()

IGNORE_DIRS = {"node_modules", "dist", "build", ".git", ".next", ".vite", "coverage"}
EXTS = {".ts", ".tsx", ".js", ".jsx", ".mts", ".cts", ".mjs", ".cjs"}

def should_ignore(path: str) -> bool:
    parts = set(path.replace("\\", "/").split("/"))
    return any(d in parts for d in IGNORE_DIRS)

def read_text(path: str) -> str:
    with open(path, "r", encoding="utf-8", errors="ignore") as f:
        return f.read()

def find_file_rel(candidates):
    for rel in candidates:
        p = os.path.join(ROOT, rel)
        if os.path.isfile(p):
            return p
    return None

def walk_files():
    for root, dirs, files in os.walk(ROOT):
        if should_ignore(root):
            continue
        for name in files:
            ext = os.path.splitext(name)[1].lower()
            if ext in EXTS:
                yield os.path.join(root, name)

# ---------------------------
# 1) Localizar arquivos-chave
# ---------------------------
admin_ts = find_file_rel([
    r"server\routers\admin.ts",
    r"server/routers/admin.ts",
    r"server\routers\admin.mts",
    r"server/routers/admin.mts",
])

app_tsx = find_file_rel([
    r"client\src\App.tsx",
    r"client/src/App.tsx",
    r"client\src\main.tsx",
    r"client/src/main.tsx",
    r"src\App.tsx",
    r"src/App.tsx",
])

protected_route_tsx = find_file_rel([
    r"client\src\components\ProtectedRoute.tsx",
    r"client/src/components/ProtectedRoute.tsx",
])

trpc_core = find_file_rel([
    r"server\_core\trpc.ts",
    r"server/_core/trpc.ts",
])

context_core = find_file_rel([
    r"server\_core\context.ts",
    r"server/_core/context.ts",
])

# --------------------------------
# 2) Extrair "procedures" do admin
# --------------------------------
def extract_trpc_procedures(ts: str):
    """
    Captura padrões tipo:
      export const adminRouter = createTRPCRouter({
        getDashboard: adminProcedure.query(...)
        inviteAdmin: manageAdminsProcedure.mutation(...)
      })
    """
    # chaves no router: <name>:
    key_pat = re.compile(r"^\s*([a-zA-Z0-9_]+)\s*:\s*(?:adminProcedure|superAdminProcedure|protectedProcedure|publicProcedure|manageAdminsProcedure)\b", re.M)
    keys = key_pat.findall(ts)

    # tenta pegar qual procedure está sendo usada
    proc_pat = re.compile(r"^\s*([a-zA-Z0-9_]+)\s*:\s*([a-zA-Z0-9_]+Procedure)\b", re.M)
    mapping = proc_pat.findall(ts)
    proc_by_route = {k: v for (k, v) in mapping}

    return sorted(set(keys)), proc_by_route

def extract_permission_keywords(ts: str):
    perms = set()
    for kw in ["manageAdmins", "manageCourses", "manageStudents", "manageContent", "manageSettings", "viewAnalytics"]:
        if kw in ts:
            perms.add(kw)
    # roles checks
    role_checks = {
        "checks_admin": bool(re.search(r"role\s*!==?\s*['\"]admin['\"]|role\s*!==\s*['\"]admin['\"]", ts)),
        "checks_superadmin": bool(re.search(r"superadmin", ts, re.I)),
    }
    return sorted(perms), role_checks

# --------------------------------
# 3) Extrair páginas Admin no client
# --------------------------------
def list_admin_pages():
    pages = []
    # padrão comum: client/src/pages/Admin*.tsx e client/src/pages/admin/*.tsx
    for p in walk_files():
        p_norm = p.replace("\\", "/")
        if "/client/src/pages/" in p_norm and p_norm.endswith(".tsx"):
            base = os.path.basename(p_norm)
            if base.startswith("Admin") or "/client/src/pages/admin/" in p_norm.lower():
                pages.append(p_norm)
    return sorted(pages)

# --------------------------------
# 4) Extrair rotas /admin no App.tsx
# --------------------------------
def extract_admin_routes_from_app(ts: str):
    """
    Tenta capturar rotas tipo:
      <Route path="/admin" ...>
      <Route path="/admin/settings" ...>
    Compatível com wouter/react-router na base de heurística.
    """
    routes = set()

    # wouter / react-router: path="/admin..."
    for m in re.finditer(r'path\s*=\s*["\'](/admin[^"\']*)["\']', ts):
        routes.add(m.group(1))

    # react-router v6: <Route path="/admin" element={<.../>} />
    for m in re.finditer(r'<Route[^>]+path\s*=\s*["\'](/admin[^"\']*)["\']', ts):
        routes.add(m.group(1))

    # fallback: strings "/admin"
    if "/admin" in ts and not routes:
        routes.add("/admin")

    return sorted(routes)

# --------------------------------
# 5) Relatório e “missing”
# --------------------------------
report = {
    "paths": {
        "admin_ts": admin_ts,
        "app_tsx": app_tsx,
        "protected_route_tsx": protected_route_tsx,
        "trpc_core": trpc_core,
        "context_core": context_core,
    },
    "analysis": {},
    "missing": {},
    "recommendations": [],
}

# Ler e analisar admin.ts
admin_routes = []
admin_proc_map = {}
admin_perms = []
role_checks = {}

if admin_ts and os.path.isfile(admin_ts):
    admin_text = read_text(admin_ts)
    admin_routes, admin_proc_map = extract_trpc_procedures(admin_text)
    admin_perms, role_checks = extract_permission_keywords(admin_text)

    report["analysis"]["admin_router"] = {
        "procedures_found": admin_routes,
        "procedure_type_by_name": admin_proc_map,
        "permission_keywords_found": admin_perms,
        "role_checks": role_checks,
        "notes": [],
    }

    # Heurística: se tem superadmin no core mas admin.ts bloqueia só admin
    if role_checks.get("checks_admin") and not role_checks.get("checks_superadmin"):
        report["analysis"]["admin_router"]["notes"].append(
            "⚠️ Parece que há checagem rígida só para role 'admin'. Se você usa 'superadmin', padronize admin||superadmin."
        )
else:
    report["analysis"]["admin_router"] = {"error": "Não achei server/routers/admin.ts no projeto."}

# Páginas admin no client
pages = list_admin_pages()
report["analysis"]["client_admin_pages"] = pages

# App routes
admin_paths = []
if app_tsx and os.path.isfile(app_tsx):
    app_text = read_text(app_tsx)
    admin_paths = extract_admin_routes_from_app(app_text)
report["analysis"]["admin_paths_in_app"] = admin_paths

# Missing comparisons
# 5.1 endpoints no backend sem página evidente
# (heurística simples: nome do procedure aparece em algum Admin*.tsx)
page_text_cache = {}
def any_page_mentions(name: str) -> bool:
    # procura "trpc.admin.<name>" ou "<name>("
    needle1 = f"admin.{name}"
    needle2 = f".{name}("
    for p in pages:
        if p not in page_text_cache:
            page_text_cache[p] = read_text(p)
        t = page_text_cache[p]
        if needle1 in t or needle2 in t:
            return True
    return False

backend_without_page = []
for r in admin_routes:
    if not any_page_mentions(r):
        backend_without_page.append(r)

# 5.2 páginas admin sem rota registrada no App.tsx
# (heurística: se existe AdminSettings.tsx então esperar /admin/settings etc.)
page_name_to_expected = []
for p in pages:
    base = os.path.splitext(os.path.basename(p))[0]
    # AdminAccountSettings -> /admin/account-settings (heurística)
    if base.startswith("Admin"):
        slug = re.sub(r"([a-z])([A-Z])", r"\1-\2", base[5:]).lower()  # remove "Admin"
        if slug:
            expected = "/admin/" + slug
        else:
            expected = "/admin"
        page_name_to_expected.append((base, expected))

missing_routes_in_app = []
app_set = set(admin_paths)
for base, expected in page_name_to_expected:
    # aceitar /admin e /admin/... se existir alguma variante
    if not any(path.startswith(expected) for path in app_set) and expected not in app_set:
        # se o app só tem /admin e faz nested routes internamente, isso pode ser falso positivo
        missing_routes_in_app.append({"page": base, "expected_route": expected})

report["missing"]["backend_procedures_without_obvious_page_usage"] = backend_without_page
report["missing"]["admin_pages_without_obvious_route_in_App"] = missing_routes_in_app

# Recommendations (gerais, baseadas no que quase sempre dá problema)
recs = []
if protected_route_tsx:
    recs.append("✅ Verifique client/src/components/ProtectedRoute.tsx: não redirecionar enquanto 'loading' e aceitar admin || superadmin.")
else:
    recs.append("⚠️ Não achei ProtectedRoute.tsx. Se você usa outro guard, localize e valide admin/superadmin.")

if context_core:
    recs.append("✅ Verifique server/_core/context.ts: garantir que ctx.user é preenchido a partir do cookie/token (senão /admin sempre cai).")
else:
    recs.append("⚠️ Não achei server/_core/context.ts. Sem contexto, adminProcedure pode falhar sempre.")

if trpc_core:
    recs.append("✅ Verifique server/_core/trpc.ts: padronizar adminProcedure (admin || superadmin) e superAdminProcedure (só superadmin).")
else:
    recs.append("⚠️ Não achei server/_core/trpc.ts. Sem procedures core, admin pode estar duplicado em múltiplos arquivos.")

report["recommendations"] = recs

# ---------------------------
# Print + salvar relatório
# ---------------------------
print("\n==============================")
print("🩺 ADMIN DOCTOR REPORT")
print("==============================\n")

print("📌 Arquivos-chave encontrados:")
for k, v in report["paths"].items():
    print(f" - {k}: {v}")

print("\n--- Backend admin.ts ---")
if "error" in report["analysis"]["admin_router"]:
    print("❌", report["analysis"]["admin_router"]["error"])
else:
    print(f"✅ Procedures no admin router: {len(report['analysis']['admin_router']['procedures_found'])}")
    print("   ", ", ".join(report["analysis"]["admin_router"]["procedures_found"][:25]) + ("..." if len(report["analysis"]["admin_router"]["procedures_found"]) > 25 else ""))
    print(f"✅ Keywords de permissões vistas: {', '.join(report['analysis']['admin_router']['permission_keywords_found']) or '(nenhuma)'}")
    if report["analysis"]["admin_router"]["notes"]:
        for n in report["analysis"]["admin_router"]["notes"]:
            print("   ", n)

print("\n--- Frontend Admin Pages ---")
print(f"✅ Admin pages encontradas: {len(pages)}")
for p in pages[:20]:
    print(" -", p)
if len(pages) > 20:
    print(" ... (mais páginas)")

print("\n--- Rotas /admin no App ---")
print(f"✅ Rotas /admin detectadas no App: {len(admin_paths)}")
for r in admin_paths:
    print(" -", r)

print("\n--- Possíveis faltas ---")
print("1) Procedures backend sem uso óbvio nas páginas Admin:")
if backend_without_page:
    print("   ⚠️", ", ".join(backend_without_page[:30]) + ("..." if len(backend_without_page) > 30 else ""))
else:
    print("   ✅ Nenhuma evidente.")

print("\n2) Páginas Admin sem rota óbvia no App.tsx (pode ser falso positivo se rotas são internas):")
if missing_routes_in_app:
    for item in missing_routes_in_app[:15]:
        print(f"   ⚠️ {item['page']} -> esperado algo como {item['expected_route']}")
    if len(missing_routes_in_app) > 15:
        print("   ... (mais itens)")
else:
    print("   ✅ Nenhuma evidente.")

print("\n--- Recomendações ---")
for r in report["recommendations"]:
    print(" -", r)

out_path = os.path.join(ROOT, "reports")
os.makedirs(out_path, exist_ok=True)
json_path = os.path.join(out_path, "admin-doctor.json")
with open(json_path, "w", encoding="utf-8") as f:
    json.dump(report, f, ensure_ascii=False, indent=2)

print(f"\n💾 Relatório salvo em: {json_path}")
print("\n✅ Pronto. Se quiser, cole aqui o conteúdo de reports/admin-doctor.json que eu te digo exatamente o que corrigir no admin.ts.")