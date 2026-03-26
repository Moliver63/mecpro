import os
import glob
from pathlib import Path

ROOT = Path(__file__).parent
SEARCH_TERM = "DATABASE_URL"

print("=" * 60)
print("  Diagnóstico DATABASE_URL")
print("=" * 60)

# ============ 1. Variável de ambiente do sistema ============
print("\n📌 1. Variável de ambiente do sistema:")
sys_val = os.environ.get("DATABASE_URL")
if sys_val:
    print(f"   ✅ Encontrada: {sys_val[:60]}...")
else:
    print("   ❌ Não definida no ambiente do sistema")

# ============ 2. Arquivos .env* ============
print("\n📌 2. Arquivos .env encontrados:")
env_patterns = ["**/.env", "**/.env.*", "**/env.*", "**/env"]
env_files = []
for pattern in env_patterns:
    env_files += glob.glob(str(ROOT / pattern), recursive=True)

# Remover duplicatas e node_modules
env_files = list(set(f for f in env_files if "node_modules" not in f and ".git" not in f))

if not env_files:
    print("   ❌ Nenhum arquivo .env encontrado")
else:
    for env_file in sorted(env_files):
        rel = os.path.relpath(env_file, ROOT)
        try:
            with open(env_file, "r", encoding="utf-8", errors="ignore") as f:
                lines = f.readlines()
            found = [(i+1, l.strip()) for i, l in enumerate(lines) if SEARCH_TERM in l]
            if found:
                print(f"\n   📄 {rel}")
                for lineno, line in found:
                    # Mascarar senha se houver
                    if "://" in line and "@" in line:
                        parts = line.split("@")
                        masked = parts[0].split(":")
                        if len(masked) >= 3:
                            masked[-1] = "***SENHA***"
                            line = ":".join(masked) + "@" + "@".join(parts[1:])
                    print(f"      Linha {lineno}: {line}")
            else:
                print(f"   📄 {rel} → sem DATABASE_URL")
        except Exception as e:
            print(f"   ⚠️  {rel} → erro ao ler: {e}")

# ============ 3. Arquivos de configuração do projeto ============
print("\n📌 3. Arquivos de configuração do projeto:")
config_patterns = [
    "**/drizzle.config.*",
    "**/drizzle.config.ts",
    "**/drizzle.config.js",
]
config_files = []
for pattern in config_patterns:
    config_files += glob.glob(str(ROOT / pattern), recursive=True)
config_files = list(set(f for f in config_files if "node_modules" not in f))

for cf in sorted(config_files):
    rel = os.path.relpath(cf, ROOT)
    try:
        with open(cf, "r", encoding="utf-8", errors="ignore") as f:
            content = f.read()
        if SEARCH_TERM in content:
            print(f"   ✅ {rel} → referencia DATABASE_URL")
        else:
            print(f"   ℹ️  {rel} → não referencia DATABASE_URL")
    except Exception as e:
        print(f"   ⚠️  {rel} → erro: {e}")

# ============ 4. Arquivos TypeScript/JS do servidor ============
print("\n📌 4. Arquivos do servidor que usam DATABASE_URL:")
server_files = glob.glob(str(ROOT / "server/**/*.ts"), recursive=True)
server_files += glob.glob(str(ROOT / "server/**/*.js"), recursive=True)
server_files = [f for f in server_files if "node_modules" not in f]

found_server = []
for sf in sorted(server_files):
    try:
        with open(sf, "r", encoding="utf-8", errors="ignore") as f:
            lines = f.readlines()
        matches = [(i+1, l.strip()) for i, l in enumerate(lines) if SEARCH_TERM in l]
        if matches:
            found_server.append((sf, matches))
    except:
        pass

if not found_server:
    print("   ❌ Nenhum arquivo encontrado")
else:
    for sf, matches in found_server:
        rel = os.path.relpath(sf, ROOT)
        print(f"\n   📄 {rel}")
        for lineno, line in matches:
            print(f"      Linha {lineno}: {line}")

# ============ Resumo ============
print("\n" + "=" * 60)
print("  Resumo")
print("=" * 60)
if sys_val:
    print("✅ DATABASE_URL está definida no ambiente do sistema")
else:
    print("❌ DATABASE_URL NÃO está no ambiente do sistema")
    print("   → O servidor só vai encontrá-la se o arquivo .env")
    print("     for carregado via dotenv no código")

print("\n💡 Dica: no Render, a DATABASE_URL deve estar em:")
print("   Serviço shadiahasan → Environment → Variables")
print("=" * 60)