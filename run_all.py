#!/usr/bin/env python3
"""
run_all.py (v3)
Executor "botão único" do toolkit Local → GitHub → Render.

Mudança:
- Não tenta corepack se corepack não existir no PATH.
- Como o pnpm foi detectado via caminho absoluto no local_runner v5,
  o install deve funcionar.
"""

import subprocess
import sys
import shutil
from pathlib import Path

ROOT = Path(__file__).parent


def run(cmd):
    print("\n" + "=" * 70)
    print("EXECUTANDO:", " ".join(cmd))
    print("=" * 70)

    p = subprocess.Popen(cmd, cwd=str(ROOT))
    p.wait()

    if p.returncode != 0:
        raise SystemExit(p.returncode)


def check_files():
    required = [
        "pipeline.py",
        "project_scanner2.py",
        "env_scanner_v2.py",
        "github_ready_check.py",
        "local_runner.py",
        "common.py",
    ]
    print("🔎 Verificando arquivos do toolkit...")
    for f in required:
        if not (ROOT / f).exists():
            print(f"❌ Arquivo ausente: {f}")
            sys.exit(1)
    print("✅ Todos os scripts encontrados.")


def main():
    print("\n🚀 INICIANDO PIPELINE COMPLETO\n")
    check_files()

    # 1) Pipeline de checks + geração de templates
    run([sys.executable, "pipeline.py", "--all", "--fix"])

    # 2) Install deps (agora deve funcionar com local_runner v5)
    print("\n📦 Instalando dependências do projeto...")
    run([sys.executable, "local_runner.py", "install"])

    # 3) Build
    print("\n🏗️ Rodando build local...")
    run([sys.executable, "local_runner.py", "build"])

    print("\n" + "=" * 70)
    print("🎉 PIPELINE FINALIZADO COM SUCESSO")
    print("=" * 70)

    print(
        r"""
PRÓXIMOS PASSOS:

1) Rodar local:
   python local_runner.py dev

2) Subir para o GitHub:
   git init
   git add .
   git commit -m "first deploy"
   git branch -M main
   git remote add origin <SEU_REPO>
   git push -u origin main

3) Deploy no Render:
   Build Command: pnpm install && pnpm run build
   Start Command: pnpm run start
   (Configure env vars no painel usando .env.production.sample)

✅ Tudo pronto.
"""
    )


if __name__ == "__main__":
    main()