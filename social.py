with open('client/src/pages/Landing.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

old = '{label:"Contato", href:"/contact"},'
new = '{label:"Contato", href:"/contact"},{label:"Instagram", href:"https://instagram.com/mecproaibrl"},{label:"Facebook", href:"https://facebook.com/mecproai"},{label:"TikTok", href:"https://tiktok.com/@mecproaibrl"},'

if old in content:
    content = content.replace(old, new)
    with open('client/src/pages/Landing.tsx', 'w', encoding='utf-8') as f:
        f.write(content)
    print('OK - redes sociais adicionadas')
else:
    print('ERRO - texto nao encontrado')
    idx = content.find('Contato')
    print('Contexto:', content[idx-50:idx+100])
