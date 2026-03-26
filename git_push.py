import subprocess
import sys

def run(cmd, check=True):
    result = subprocess.run(cmd, shell=True, capture_output=True, text=True)
    if check and result.returncode != 0:
        print(f"❌ Erro: {result.stderr.strip()}")
        sys.exit(1)
    return result

def main():
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("-m", "--message", default="update", help="Commit message")
    args = parser.parse_args()

    print("=" * 50)
    print("  GitHub Auto Push")
    print("=" * 50)

    # Garantir que .env nunca seja incluído
    env_files = [
        ".env", ".env.development", ".env.production",
        ".env.local", ".env.bak", "env.development",
        "env.production", "check_database_url.py"
    ]
    for f in env_files:
        run(f'git rm --cached "{f}" 2>nul', check=False)

    # Verificar status
    status = run("git status --porcelain").stdout.strip()
    if not status:
        print("✅ Nada para commitar.")
        return

    print("\n📋 Arquivos a serem enviados:")
    for line in status.splitlines():
        print(f"  {line}")

    # Adicionar apenas arquivos já rastreados
    run('git add -u')

    # Remover qualquer .env que entrou
    staged = run("git diff --cached --name-only").stdout.strip()
    for f in staged.splitlines():
        if ".env" in f or "env." in f:
            run(f'git reset HEAD "{f}"', check=False)
            print(f"⚠️  Removido do stage: {f}")

    # Commit
    result = run(f'git commit -m "{args.message}"', check=False)
    if result.returncode != 0:
        print("✅ Nada novo para commitar.")
        return
    print(f'✅ Commit: "{args.message}"')

    # Push
    print("⬆️  Enviando para o GitHub...")
    result = run("git push", check=False)
    if result.returncode != 0:
        print(f"❌ Erro no push:\n{result.stderr}")
        sys.exit(1)
    print("✅ Push realizado com sucesso!")

if __name__ == "__main__":
    main()
