import os
from collections import defaultdict

ROOT = os.getcwd()

print("\n🔎 FIND ADMIN CORE (v2)")
print("📁 Projeto:", ROOT)
print("=" * 70)

# Extensões comuns em projetos TS/Node modernos
EXTENSIONS = {
    ".ts", ".tsx", ".js", ".jsx",
    ".mts", ".cts", ".mjs", ".cjs",
}

# Pastas para ignorar
IGNORE_DIRS = {"node_modules", "dist", "build", ".git", ".next", ".vite", "coverage"}

# Palavras-chave fortes (backend + frontend)
KEYWORDS = [
    # tRPC backend core
    "protectedProcedure",
    "publicProcedure",
    "adminProcedure",
    "superAdminProcedure",
    "createTRPCRouter",
    "initTRPC",
    "createContext",
    "createTRPCContext",

    # auth/context
    "ctx.user",
    "ctx.session",
    "req.cookies",
    "cookieParser",
    "Authorization",
    "Bearer ",
    "UNAUTHORIZED",
    "FORBIDDEN",
    "role",
    "isAdmin",
    "manageAdmins",
    "getAdminPermissions",

    # routes / admin
    "/admin",
    "Admin",
    "ProtectedRoute",
    "useAuth",
    "requireAuth",
    "redirect",
]

# Indícios por caminho (quando o texto não ajuda)
PATH_HINTS = [
    os.path.join("server", "_core", "trpc"),
    os.path.join("server", "_core", "context"),
    os.path.join("server", "routers", "admin"),
    os.path.join("server", "auth"),
    os.path.join("client", "src", "pages", "Admin"),
    os.path.join("client", "src", "components", "ProtectedRoute"),
    os.path.join("client", "src", "_core", "hooks", "useAuth"),
]

def should_ignore_dir(path: str) -> bool:
    parts = set(path.replace("\\", "/").split("/"))
    return any(d in parts for d in IGNORE_DIRS)

scanned = 0
matches = []

for root, dirs, files in os.walk(ROOT):
    if should_ignore_dir(root):
        continue

    for name in files:
        ext = os.path.splitext(name)[1].lower()
        if ext not in EXTENSIONS:
            continue

        path = os.path.join(root, name)
        scanned += 1

        try:
            with open(path, "r", encoding="utf-8", errors="ignore") as f:
                content = f.read()
        except:
            continue

        content_lower = content.lower()

        score = 0
        hitlist = []

        # Score por keywords (case-insensitive)
        for kw in KEYWORDS:
            if kw.lower() in content_lower:
                score += 2
                hitlist.append(kw)

        # Score por hints no caminho
        pnorm = path.replace("\\", "/").lower()
        for h in PATH_HINTS:
            if h.replace("\\", "/").lower() in pnorm:
                score += 5
                hitlist.append(f"[PATH_HINT:{h}]")

        if score > 0:
            matches.append((score, path, sorted(set(hitlist))))

print(f"\n📦 Arquivos escaneados: {scanned}")
if not matches:
    print("❌ Não encontrei nada com os padrões atuais.")
    print("\n➡️ Tente isto agora:")
    print("1) Confirme que existe pasta server/routers e server/_core")
    print("2) Rode este comando para listar arquivos backend:")
    print(r'   dir server\_core /s')
    print(r'   dir server\routers /s')
    raise SystemExit(0)

# Ordena por score desc, depois por path
matches.sort(key=lambda x: (-x[0], x[1]))

print("\n🏆 TOP 30 arquivos mais prováveis (por score):\n")
for score, path, hits in matches[:30]:
    print(f"({score:02d}) 📄 {path}")
    print("     ↳ " + ", ".join(hits))
    print()

print("=" * 70)
print("📌 Me envie aqui os 3 primeiros arquivos dessa lista (copiar e colar o conteúdo ou anexar).")
print("Aí eu te digo exatamente onde valida permissão/admin, middleware e como liberar admin local.")