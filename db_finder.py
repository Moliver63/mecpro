import os
import re
from pathlib import Path

ROOT = Path(".").resolve()

IGNORE_DIRS = {
    "node_modules", ".git", "dist", "build", ".next", ".cache",
    ".turbo", ".vercel", ".output", "coverage"
}

TEXT_EXT = {
    ".js", ".ts", ".tsx", ".jsx", ".json", ".env",
    ".sql", ".prisma", ".yaml", ".yml", ".md"
}

def read_file(path):
    try:
        return path.read_text(encoding="utf8", errors="ignore")
    except:
        return ""

files = []

for root, dirs, fs in os.walk(ROOT):
    dirs[:] = [d for d in dirs if d not in IGNORE_DIRS]
    for f in fs:
        p = Path(root) / f
        if p.suffix.lower() in TEXT_EXT or p.name.startswith(".env"):
            files.append(p)

print("\n🔎 Procurando configuração de banco...\n")

# =============================
# 1) PROCURAR DATABASE_URL
# =============================
db_urls = []
for f in files:
    text = read_file(f)
    if "DATABASE_URL" in text:
        db_urls.append((f, text))

if db_urls:
    print("✅ DATABASE_URL encontrado em:\n")
    for f, text in db_urls:
        print("📄", f)
        match = re.findall(r"DATABASE_URL\s*=\s*(.*)", text)
        for m in match:
            print("   ➜", m)
else:
    print("❌ DATABASE_URL NÃO encontrado")

# =============================
# 2) DETECTAR TIPO DE BANCO
# =============================
print("\n🧠 Detectando tipo de banco...\n")

db_type = "DESCONHECIDO"

for f, text in db_urls:
    if "postgres" in text.lower():
        db_type = "POSTGRES"
    elif "mysql" in text.lower():
        db_type = "MYSQL"
    elif "sqlite" in text.lower():
        db_type = "SQLITE"

print("👉 Banco detectado:", db_type)

# =============================
# 3) PROCURAR SCHEMA / MIGRATIONS
# =============================
print("\n📦 Procurando schema e migrations...\n")

keywords = [
    "create table users",
    "model User",
    "users =",
    "pgTable('users'",
    "sqliteTable('users'",
    "drizzle",
    "prisma"
]

schema_files = []

for f in files:
    text = read_file(f).lower()
    for k in keywords:
        if k.lower() in text:
            schema_files.append(f)
            break

if schema_files:
    print("✅ Arquivos que definem tabela USERS:\n")
    for f in schema_files:
        print("📄", f)
else:
    print("❌ Não achei schema da tabela users")

# =============================
# 4) PROCURAR MIGRATIONS
# =============================
print("\n🧱 Procurando migrations...\n")

migration_dirs = ["migrations", "drizzle", "prisma", "db"]

found_migrations = []

for root, dirs, fs in os.walk(ROOT):
    for d in dirs:
        if any(x in d.lower() for x in migration_dirs):
            found_migrations.append(Path(root) / d)

if found_migrations:
    print("✅ Pastas de migrations:\n")
    for d in found_migrations:
        print("📁", d)
else:
    print("❌ Nenhuma pasta de migrations encontrada")

# =============================
# 5) PROCURAR SQLITE FILE
# =============================
print("\n💾 Procurando arquivos de banco local...\n")

db_files = []
for root, dirs, fs in os.walk(ROOT):
    for f in fs:
        if f.endswith((".db", ".sqlite", ".sqlite3")):
            db_files.append(Path(root) / f)

if db_files:
    print("✅ Arquivos de banco encontrados:\n")
    for f in db_files:
        print("📄", f)
else:
    print("ℹ️ Nenhum arquivo .db encontrado (provavelmente Postgres remoto)")

print("\n🎯 Análise finalizada!")
