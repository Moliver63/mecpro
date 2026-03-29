content = open('server/_core/router.ts', 'r', encoding='utf-8', errors='replace').read()

old = 'if (!input.placements || input.placements.length === 0 || input.placementMode === "auto") {\n              // Auto: Advantage+ Placements (Meta escolhe)\n              return {};\n            }'

new = 'if (!input.placements || input.placements.length === 0 || input.placementMode === "auto") {\n              // Auto: Advantage+ Placements (Meta escolhe)\n              // device_platforms obrigatorio para evitar erro #1885366\n              return { device_platforms: ["mobile", "desktop"] };\n            }'

if old in content:
    content = content.replace(old, new)
    open('server/_core/router.ts', 'w', encoding='utf-8').write(content)
    print('OK - device_platforms adicionado')
else:
    # Tenta localizar o trecho para debug
    idx = content.find('Advantage+ Placements')
    if idx >= 0:
        print('Trecho encontrado mas texto diferente:')
        print(repr(content[idx-100:idx+150]))
    else:
        idx2 = content.find('placementMode')
        print('placementMode encontrado em:', idx2)
        if idx2 >= 0:
            print(repr(content[idx2-50:idx2+200]))
