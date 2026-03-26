import os
import re
from pathlib import Path

ROOT = Path(".")
REPORT = []

def add(msg):
    REPORT.append(msg)
    print(msg)

print("\n🔎 Escaneando projeto...\n")

# =========================
# LISTAR TODA ESTRUTURA
# =========================
all_files = []

for root, dirs, files in os.walk(ROOT):
    for file in files:
        path = os.path.join(root, file)
        all_files.append(path)

add(f"📂 Total de arquivos encontrados: {len(all_files)}")

# =========================
# PROCURAR ARQUIVOS IMPORTANTES
# =========================
important = [
    "package.json",
    "vite.config",
    "server.js",
    "app.js",
    "index.js",
    ".env",
    "render.yaml"
]

for file in important:
    found = [f for f in all_files if file in f]
    if not found:
        add(f"❌ FALTANDO: {file}")
    else:
        add(f"✅ Encontrado: {file}")

# =========================
# LER CONTEÚDOS
# =========================
def read_file(path):
    try:
        return open(path, "r", encoding="utf8", errors="ignore").read()
    except:
        return ""

contents = {f: read_file(f) for f in all_files}

# =========================
# CHECK BACKEND PROBLEMS
# =========================
add("\n🧠 Analisando BACKEND...\n")

backend_files = [f for f in all_files if "server" in f or "app." in f]

trust_proxy_found = False
jwt_secret_found = False
dotenv_found = False
cors_found = False

for file, text in contents.items():
    if "trust proxy" in text:
        trust_proxy_found = True
    if "JWT_SECRET" in text or "jwt.sign" in text:
        jwt_secret_found = True
    if "dotenv" in text:
        dotenv_found = True
    if "cors(" in text:
        cors_found = True

if not trust_proxy_found:
    add("❌ FALTA app.set('trust proxy', 1) → login pode falhar no Render")

if not jwt_secret_found:
    add("❌ JWT_SECRET não encontrado")

if not dotenv_found:
    add("❌ dotenv não carregado")

if not cors_found:
    add("⚠️ CORS não encontrado")

# =========================
# CHECK FRONTEND PROBLEMS
# =========================
add("\n🎨 Analisando FRONTEND...\n")

localhost_found = False
credentials_found = False

for file, text in contents.items():
    if "localhost" in text:
        localhost_found = True
    if "credentials: 'include'" in text:
        credentials_found = True

if localhost_found:
    add("❌ FRONTEND ainda usa LOCALHOST → quebra no deploy")

if not credentials_found:
    add("❌ fetch sem credentials include → cookie login falha")

# =========================
# CHECK BUILD
# =========================
add("\n📦 Analisando BUILD...\n")

package_files = [f for f in all_files if "package.json" in f]

for file in package_files:
    text = contents[file]
    if "build" not in text:
        add(f"❌ Script build faltando em {file}")
    if "start" not in text:
        add(f"❌ Script start faltando em {file}")

# =========================
# GERAR RELATÓRIO
# =========================
report_path = "RELATORIO_PROJETO.txt"
with open(report_path, "w", encoding="utf8") as f:
    for line in REPORT:
        f.write(line + "\n")

print("\n✅ Análise finalizada!")
print(f"📄 Relatório salvo em: {report_path}")
