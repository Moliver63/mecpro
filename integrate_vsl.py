content = open('server/_core/router.ts', 'r', encoding='utf-8', errors='replace').read()

# Adiciona import
if 'vslRouter' not in content:
    old = 'import { adminIntelligenceRouter } from "./adminIntelligenceRouter";'
    if old in content:
        content = content.replace(old, old + '\nimport { vslRouter } from "./vslRouter";')
        print('import adicionado')
    else:
        print('AVISO: import adminIntelligenceRouter nao encontrado')
        print('Primeiros imports do arquivo:')
        for i, line in enumerate(content.split('\n')[:20]):
            print(f'  {i+1}: {line}')
else:
    print('import vslRouter ja existe')

# Adiciona no appRouter
if 'vsl:' not in content:
    for old in [
        'intelligence:   adminIntelligenceRouter,',
        'intelligence: adminIntelligenceRouter,',
        'intelligence:adminIntelligenceRouter,',
    ]:
        if old in content:
            content = content.replace(old, old + '\n  vsl:            vslRouter,')
            print('vsl: adicionado no appRouter')
            break
    else:
        print('AVISO: nao encontrou intelligence no appRouter')
        print('Buscando "appRouter" no arquivo...')
        idx = content.find('appRouter')
        if idx >= 0:
            print('Contexto:', repr(content[idx:idx+300]))
else:
    print('vsl: ja existe no appRouter')

open('server/_core/router.ts', 'w', encoding='utf-8').write(content)
print('router.ts salvo')
