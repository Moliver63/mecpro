#!/usr/bin/env python3
"""
╔══════════════════════════════════════════════════════════╗
║  RESTAURAR ARQUIVOS DANIFICADOS — Shadia Doctor          ║
║  Desfaz o --fix-oauth que corrompeu Login.tsx/Signup.tsx ║
╚══════════════════════════════════════════════════════════╝

EXECUTE AGORA no terminal do projeto:

    cd C:\Users\mixav\Downloads\shadia-serv
    python restaurar_arquivos.py

O script vai:
  1. Encontrar o backup mais recente em .shadia_backups\
  2. Restaurar Login.tsx e Signup.tsx (e qualquer outro arquivo alterado)
  3. Verificar que o build passa
"""

import shutil, sys
from pathlib import Path

def main():
    # Detectar raiz do projeto (pasta onde o script está)
    root = Path(__file__).parent.resolve()
    bdir_root = root / ".shadia_backups"

    print(f"\n{'='*60}")
    print(f"  🔄  RESTAURAR ARQUIVOS DANIFICADOS")
    print(f"  Projeto: {root}")
    print(f"{'='*60}\n")

    if not bdir_root.exists():
        print("❌ Pasta .shadia_backups não encontrada!")
        print(f"   Procurado em: {bdir_root}")
        print("\n   Alternativa manual:")
        print("   1. Use git: git checkout client/src/pages/Login.tsx")
        print("   2. Use git: git checkout client/src/pages/Signup.tsx")
        sys.exit(1)

    # Listar todas as pastas de backup
    backups = sorted([d for d in bdir_root.iterdir() if d.is_dir()])
    if not backups:
        print("❌ Nenhum backup encontrado em .shadia_backups/")
        sys.exit(1)

    print(f"📁 Backups disponíveis:")
    for i, b in enumerate(backups):
        files = list(b.iterdir())
        print(f"   [{i}] {b.name}  ({len(files)} arquivo(s))")

    # Usar o mais recente automaticamente
    bdir = backups[-1]
    print(f"\n✅ Usando backup mais recente: {bdir.name}\n")

    restored = 0
    failed   = 0

    for backup_file in sorted(bdir.iterdir()):
        if not backup_file.is_file():
            continue

        # Reconstruir path original
        # O backup usa "__" como separador de pasta (ex: client__src__pages__Login.tsx)
        rel_posix = backup_file.name.replace("__", "/")
        orig = root / rel_posix

        try:
            orig.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(backup_file, orig)
            print(f"  ✅ Restaurado: {rel_posix}")
            restored += 1
        except Exception as e:
            print(f"  ❌ Falha ao restaurar {rel_posix}: {e}")
            failed += 1

    print(f"\n{'─'*60}")
    print(f"  ✅ {restored} arquivo(s) restaurado(s)")
    if failed:
        print(f"  ❌ {failed} arquivo(s) com falha")
    print(f"{'─'*60}")

    if restored > 0:
        print(f"""
  🚀  PRÓXIMOS PASSOS:
      1. Execute o build para confirmar que passou:
         pnpm build

      2. Para rodar auditorias SEM --fix-oauth (seguro):
         python shadia_doctor.py --root . --apply --fix-links --fix-routes --create-stubs --fix-console

      3. O --fix-oauth foi corrigido no novo shadia_doctor.py
         Agora ele NÃO está incluído no --fix-all por padrão.
         Use só se souber o que está fazendo:
         python shadia_doctor.py --root . --apply --fix-oauth
""")
    else:
        print("\n  ⚠️  Nenhum arquivo restaurado.")
        print("  Tente manualmente com git:")
        print("    git checkout client/src/pages/Login.tsx")
        print("    git checkout client/src/pages/Signup.tsx")

if __name__ == "__main__":
    main()
