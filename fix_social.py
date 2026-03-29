import re

# ── LANDING.TSX: corrigir ícones ??  →  emojis reais
with open('client/src/pages/Landing.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

content = content.replace('{ icon:"??", label:"Instagram"', '{ icon:"📸", label:"Instagram"')
content = content.replace('{ icon:"??", label:"Facebook"',  '{ icon:"📘", label:"Facebook"')
content = content.replace('{ icon:"??", label:"TikTok"',    '{ icon:"🎵", label:"TikTok"')

with open('client/src/pages/Landing.tsx', 'w', encoding='utf-8') as f:
    f.write(content)
print('✅ Landing.tsx — ícones corrigidos')

# ── CONTACT.TSX: adicionar Instagram, Facebook, TikTok
with open('client/src/pages/Contact.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

OLD = '{ icon: "📱", label: "WhatsApp", value: "(47) 99465-824", action: () => window.open("https://wa.me/554799465824") },'
NEW = '''{ icon: "📱", label: "WhatsApp",  value: "(47) 99465-824", action: () => window.open("https://wa.me/554799465824") },
    { icon: "📸", label: "Instagram", value: "@mecproai",     action: () => window.open("https://instagram.com/mecproai") },
    { icon: "📘", label: "Facebook",  value: "@mecproai",     action: () => window.open("https://facebook.com/mecproai") },
    { icon: "🎵", label: "TikTok",    value: "@mecproaibrl",  action: () => window.open("https://tiktok.com/@mecproaibrl") },'''

if OLD in content:
    content = content.replace(OLD, NEW)
    with open('client/src/pages/Contact.tsx', 'w', encoding='utf-8') as f:
        f.write(content)
    print('✅ Contact.tsx — redes sociais adicionadas')
else:
    print('⚠️  Contact.tsx — texto original não encontrado, verifique manualmente')
    # Mostra o trecho atual para debug
    for i, line in enumerate(content.split('\n')[20:30], start=21):
        print(f'  linha {i}: {line}')
