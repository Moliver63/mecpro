with open('client/src/pages/Contact.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

old = 'window.open("https://wa.me/554799465824") },'
new = 'window.open("https://wa.me/554799465824") },\n    { icon: "📸", label: "Instagram", value: "@mecproaibrl", action: () => window.open("https://instagram.com/mecproaibrl") },\n    { icon: "📘", label: "Facebook",  value: "@mecproai",    action: () => window.open("https://facebook.com/mecproai") },\n    { icon: "🎵", label: "TikTok",    value: "@mecproaibrl", action: () => window.open("https://tiktok.com/@mecproaibrl") },'

if old in content:
    content = content.replace(old, new)
    with open('client/src/pages/Contact.tsx', 'w', encoding='utf-8') as f:
        f.write(content)
    print('OK - redes sociais adicionadas ao Contact')
else:
    print('ERRO - texto nao encontrado')
    idx = content.find('wa.me')
    print('Contexto:', repr(content[idx-20:idx+80]))
