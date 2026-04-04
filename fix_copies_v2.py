content = open('server/ai.ts', 'r', encoding='utf-8', errors='replace').read()

# ── CORREÇÃO 1: mockResponse — substitui placeholders genéricos ──────────────
old1 = 'creatives: [\n      { format: "Vídeo 15s", headline: "Transforme [problema] em [resultado] em [tempo]", copy: "Copy focado em dor + solução rápida", cta: "Saiba mais" },\n      { format: "Carrossel", headline: "5 razões para escolher [marca]", copy: "Cada slide um benefício com prova social", cta: "Ver mais" },\n      { format: "Imagem estática", headline: "Oferta especial por tempo limitado", copy: "Urgência + desconto + garantia", cta: "Aproveitar agora" },\n    ],'

new1 = '''creatives: [
      { format: "Vídeo 15s", headline: "Descubra como conseguir resultados reais sem complicação", copy: "Milhares já transformaram seus resultados com esse método simples. Clique e veja como.", cta: "Quero saber mais", hook: "Você sabia que 9 em cada 10 pessoas cometem esse erro?" },
      { format: "Carrossel", headline: "3 passos para transformar seus resultados hoje", copy: "Método simples e comprovado. Passo 1: identifique. Passo 2: aplique. Passo 3: escale.", cta: "Ver o método completo", hook: "Para quem quer resultado sem enrolação" },
      { format: "Imagem estática", headline: "Material gratuito disponível por tempo limitado", copy: "Acesso imediato. Sem compromisso. Mais de 5.000 pessoas já baixaram.", cta: "Baixar grátis agora", hook: "Acesso gratuito liberado hoje" },
    ],
    creativesByObjective: {
      leads: [
        { format: "Vídeo 15s", headline: "Cadastre-se grátis e receba seu guia completo", copy: "Sem compromisso. Material 100% gratuito enviado direto para você.", cta: "Quero meu guia grátis" },
        { format: "Imagem estática", headline: "Baixe grátis: guia completo para [nicho]", copy: "Acesso imediato. Mais de 5.000 downloads. Comece hoje.", cta: "Baixar grátis agora" },
      ],
      sales: [
        { format: "Vídeo 15s", headline: "Oferta especial — apenas hoje com desconto exclusivo", copy: "Frete grátis + garantia de 30 dias. Estoque limitado. Compre agora.", cta: "Comprar agora com desconto" },
        { format: "Imagem estática", headline: "Última chance: condição especial por tempo limitado", copy: "Restam poucas unidades. Preço especial válido somente hoje.", cta: "Garantir minha unidade" },
      ],
    },'''

if 'Transforme [problema] em [resultado] em [tempo]' in content:
    content = content.replace(
        'creatives: [\n      { format: "Vídeo 15s", headline: "Transforme [problema] em [resultado] em [tempo]", copy: "Copy focado em dor + solução rápida", cta: "Saiba mais" },\n      { format: "Carrossel", headline: "5 razões para escolher [marca]", copy: "Cada slide um benefício com prova social", cta: "Ver mais" },\n      { format: "Imagem estática", headline: "Oferta especial por tempo limitado", copy: "Urgência + desconto + garantia", cta: "Aproveitar agora" },\n    ],',
        new1, 1
    )
    print('✅ Correção 1: mockResponse atualizado')
else:
    # Tenta localizar e mostrar texto exato
    idx = content.find('Transforme [problema]')
    if idx >= 0:
        trecho = content[idx-200:idx+400]
        print('⚠️  Texto encontrado mas diferente. Trecho:')
        print(repr(trecho))
    else:
        print('❌ Correção 1: não encontrado')

# ── CORREÇÃO 2: Prompt de criativos — adiciona campo orientation e CTA específico
old2 = '"type": "testimonial|storytelling|authority|lead_magnet|social_proof|direct_offer", "format": "...", "headline": "...", "copy": "...", "cta": "...", "hook": "...", "pain": "...", "authority": "...", "solution": "...", "complianceScore": "safe|warning|danger", "complianceNotes": "...", "safeAlternative": "versão segura se warning/danger"'

new2 = '"type": "testimonial|storytelling|authority|lead_magnet|social_proof|direct_offer", "format": "Vídeo 15s|Vídeo 30s|Carrossel|Imagem estática|Stories 9:16|Reels 9:16", "orientation": "vertical_9_16|quadrado_1_1|feed_4_5|horizontal_16_9", "headline": "headline REAL e específica para o nicho — NUNCA use [placeholder]", "copy": "copy REAL max 125 chars — para LEADS foque em cadastro grátis e baixo atrito, para SALES foque em oferta preço urgência garantia", "cta": "para LEADS: Quero meu guia grátis|Cadastrar grátis|Receber material. Para SALES: Comprar agora|Garantir desconto|Ver oferta. NUNCA apenas Saiba mais", "hook": "gancho real dos primeiros 3 segundos que para o scroll", "pain": "dor específica do público deste nicho", "solution": "solução que o produto oferece", "funnelStage": "TOF|MOF|BOF", "complianceScore": "safe|warning|danger", "complianceNotes": "notas Meta", "safeAlternative": "versão segura se warning/danger"'

if old2 in content:
    content = content.replace(old2, new2, 1)
    print('✅ Correção 2: prompt de criativos atualizado')
else:
    idx = content.find('"type": "testimonial|storytelling')
    if idx >= 0:
        print('⚠️  Correção 2: encontrado mas diferente')
        print(repr(content[idx:idx+300]))
    else:
        print('❌ Correção 2: não encontrado')

open('server/ai.ts', 'w', encoding='utf-8').write(content)
print('\n✅ ai.ts salvo!')
