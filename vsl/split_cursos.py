"""
split_cursos.py
Separa o academy_cursos.json em arquivos individuais prontos para o VSL Forge.

USO:
  python split_cursos.py
  python split_cursos.py --curso campanha-zero-mecpro
  python split_cursos.py --draft   (modo rápido para testar)
"""
import json, subprocess, sys, os, argparse
from pathlib import Path

ap = argparse.ArgumentParser()
ap.add_argument('--curso', default=None, help='Slug do curso específico')
ap.add_argument('--draft', action='store_true', help='Modo rascunho (mais rápido)')
args = ap.parse_args()

# Carrega os cursos
with open('academy_cursos.json', 'r', encoding='utf-8') as f:
    data = json.load(f)

cursos = data['cursos']
if args.curso:
    cursos = [c for c in cursos if c['slug'] == args.curso]
    if not cursos:
        print(f'❌ Curso "{args.curso}" não encontrado')
        print('Cursos disponíveis:', [c['slug'] for c in data['cursos']])
        sys.exit(1)

print(f'📚 {len(cursos)} curso(s) para gerar\n')

# Cria pasta de saída
output_dir = Path('academy_output')
output_dir.mkdir(exist_ok=True)

for curso in cursos:
    slug = curso['slug']
    json_path = output_dir / f'{slug}.json'

    # Salva JSON individual
    with open(json_path, 'w', encoding='utf-8') as f:
        json.dump(curso, f, indent=2, ensure_ascii=False)

    print(f'✅ {slug}.json criado ({len(curso["scenes"])} cenas)')

print(f'\n📁 Arquivos salvos em: {output_dir.absolute()}')
print('\n🚀 Para gerar os vídeos, rode:')
for curso in cursos:
    cmd = f'python vsl_forge_v2.py --config academy_output/{curso["slug"]}.json'
    if args.draft:
        cmd += ' --draft'
    print(f'  {cmd}')

print('\n💡 Dica: use --draft para testar rapidamente antes da versão final')
print('💡 Dica: use --resume para continuar de onde parou se interromper')
