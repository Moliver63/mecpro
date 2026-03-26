#!/usr/bin/env python3
"""
env_doctor.py
Diagnóstico inteligente do arquivo .env

Funções:
- Detecta .env ausente
- Detecta variáveis críticas faltando
- Sugere valores locais automaticamente
- --fix → escreve/atualiza o .env sozinho
"""

from pathlib import Path
import argparse
import re

ROOT = Path(".")
ENV_FILE = ROOT / ".env"


CRITICAL_DEFAULTS = {
    "NODE_ENV": "development",
    "PORT": "3001",
    "SITE_URL": "http://localhost:5173",
    "OAUTH_SERVER_URL": "http://localhost:3001",
}


OPTIONAL_DEFAULTS = {
    "RESEND_API_KEY": "add-your-key-to-enable-emails",
}


def parse_env(text: str):
    env = {}
    for line in text.splitlines():
        if "=" in line and not line.strip().startswith("#"):
            k, v = line.split("=", 1)
            env[k.strip()] = v.strip()
    return env


def print_header():
    print("\n🩺 ENV DOCTOR\n" + "=" * 50)


def ensure_env_exists():
    if not ENV_FILE.exists():
        print("⚠️ .env não encontrado. Criando um novo...")
        ENV_FILE.write_text("", encoding="utf-8")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--fix", action="store_true", help="Corrige automaticamente o .env")
    args = parser.parse_args()

    print_header()
    ensure_env_exists()

    content = ENV_FILE.read_text(encoding="utf-8")
    env = parse_env(content)

    missing = []

    print("\n🔎 Verificando variáveis críticas...\n")

    for key, default in CRITICAL_DEFAULTS.items():
        if key not in env:
            print(f"❌ Faltando: {key}")
            print(f"   👉 Sugestão: {key}={default}\n")
            missing.append((key, default))
        else:
            print(f"✅ {key} OK")

    print("\n🔎 Verificando variáveis opcionais...\n")

    optional_missing = []
    for key, default in OPTIONAL_DEFAULTS.items():
        if key not in env:
            print(f"⚠️ Opcional ausente: {key}")
            optional_missing.append((key, default))

    # APPLY FIX
    if args.fix:
        print("\n🛠️ Aplicando correções no .env...\n")
        new_lines = content.strip().splitlines()

        for key, default in missing:
            new_lines.append(f"{key}={default}")

        for key, default in optional_missing:
            new_lines.append(f"# {key}={default}")

        ENV_FILE.write_text("\n".join(new_lines) + "\n", encoding="utf-8")
        print("✅ .env atualizado automaticamente!")

    print("\n🎉 Diagnóstico concluído.\n")


if __name__ == "__main__":
    main()