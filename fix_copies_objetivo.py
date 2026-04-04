content = open('server/ai.ts', 'r', encoding='utf-8', errors='replace').read()

# ── CORREÇÃO 1: mockResponse com copies reais por objetivo ───────────────────
old_mock = '''    creatives: [
      { format: "VÃdeo 15s", headline: "Transforme [problema] em [resultado] em [tempo]", copy: "Copy focado em dor + soluÃ§Ã£o rÃ¡pida", cta: "Saiba mais" },
      { format: "Carrossel", headline: "5 razÃµes para escolher [marca]", copy: "Cada slide um benefÃcio com prova social", cta: "Ver mais" },
      { format: "Imagem estÃ¡tica", headline: "Oferta especial por tempo limitado", copy: "UrgÃªncia + desconto + garantia", cta: "Aproveitar agora" },
    ],'''

new_mock = '''    creativesByObjective: {
      leads: [
        { format: "Video 15s", headline: "Descubra como conseguir [resultado] sem [objecao]", copy: "Milhares de pessoas ja transformaram seus resultados. Clique e receba seu guia gratuito agora.", cta: "Quero meu guia gratis", hook: "Voce sabia que 9 em cada 10 pessoas cometem esse erro?" },
        { format: "Carrossel", headline: "3 passos para [resultado desejado]", copy: "Passo 1: identifique o problema. Passo 2: aplique o metodo. Passo 3: veja os resultados.", cta: "Ver o metodo completo", hook: "Para quem quer [resultado] sem complicacao" },
        { format: "Imagem estatica", headline: "Material gratuito: [tema do lead magnet]", copy: "Baixe agora e comece a aplicar hoje mesmo. Sem compromisso.", cta: "Baixar gratis agora", hook: "Acesso gratuito por tempo limitado" },
      ],
      sales: [
        { format: "Video 15s", headline: "[Produto] com [desconto]% de desconto — so hoje", copy: "Nao perca essa oportunidade unica. Frete gratis + garantia de 30 dias. Compre agora.", cta: "Comprar agora com desconto", hook: "Oferta exclusiva para quem ver esse video" },
        { format: "Carrossel", headline: "Por que [produto] e a melhor escolha?", copy: "Qualidade comprovada por mais de 5.000 clientes satisfeitos. Veja os depoimentos reais.", cta: "Ver oferta completa", hook: "Clientes que compraram recomendam" },
        { format: "Imagem estatica", headline: "Ultima chance: [produto] com condicao especial", copy: "Estoque limitado. Preco especial valido apenas hoje. Garantia inclusa.", cta: "Garantir minha unidade", hook: "Restam poucas unidades" },
      ],
    },
    creatives: [
      { format: "Video 15s", headline: "Descubra como conseguir [resultado] sem [objecao]", copy: "Milhares de pessoas ja transformaram seus resultados. Clique agora.", cta: "Quero saber mais" },
      { format: "Carrossel", headline: "3 passos para [resultado desejado]", copy: "Metodo simples e comprovado para voce comecar hoje.", cta: "Ver o metodo" },
      { format: "Imagem estatica", headline: "Material gratuito disponivel agora", copy: "Acesso imediato. Sem compromisso.", cta: "Acessar gratis" },
    ],'''

if old_mock in content:
    content = content.replace(old_mock, new_mock)
    print('✅ Correção 1: mockResponse atualizado com copies por objetivo')
else:
    print('⚠️  Correção 1: texto não encontrado — buscando variação...')
    # Tenta localizar
    idx = content.find('Transforme [problema]')
    if idx >= 0:
        print(f'   Encontrado em índice {idx}')
        print(f'   Contexto: {repr(content[idx-100:idx+200])}')

# ── CORREÇÃO 2: Prompt principal — instrução de copies por objetivo ──────────
old_prompt = '''  "creatives": [
    {"type": "testimonial|storytelling|authority|lead_magnet|social_proof|direct_offer", "format": "...", "headline": "...", "copy": "...", "cta": "...", "hook": "...", "pain": "...", "authority": "...", "solution": "...", "complianceScore": "safe|warning|danger", "complianceNotes": "...", "safeAlternative": "versÃ£o segura se warning/danger"}
  ],'''

new_prompt = '''  "creatives": [
    {
      "type": "testimonial|storytelling|authority|lead_magnet|social_proof|direct_offer",
      "format": "Video 15s|Video 30s|Carrossel|Imagem estatica|Stories 9:16|Reels 9:16",
      "headline": "headline REAL e especifica para o nicho e objetivo — NAO use placeholders como [problema] ou [marca]",
      "copy": "copy REAL e persuasivo (max 125 chars) especifico para objetivo LEADS (foco em cadastro gratuito, material rico, sem compromisso) ou VENDAS (foco em oferta, preco, urgencia, garantia) — nunca generico",
      "cta": "CTA especifico: para leads use 'Quero meu guia gratis'|'Receber material'|'Cadastrar gratis'. Para vendas use 'Comprar agora'|'Garantir desconto'|'Ver oferta'. NUNCA use apenas 'Saiba mais'",
      "hook": "gancho especifico dos primeiros 3 segundos — deve parar o scroll",
      "pain": "dor especifica do publico-alvo deste nicho",
      "solution": "solucao que o produto/servico oferece",
      "funnelStage": "TOF|MOF|BOF",
      "orientation": "vertical_9_16|horizontal_16_9|quadrado_1_1|feed_4_5",
      "complianceScore": "safe|warning|danger",
      "complianceNotes": "notas de conformidade Meta",
      "safeAlternative": "versao segura se warning/danger"
    }
  ],'''

if old_prompt in content:
    content = content.replace(old_prompt, new_prompt)
    print('✅ Correção 2: prompt de criativos atualizado com instrução por objetivo')
else:
    print('⚠️  Correção 2: texto não encontrado — buscando variação...')
    idx = content.find('"type": "testimonial|storytelling')
    if idx >= 0:
        print(f'   Encontrado em índice {idx}')

# ── CORREÇÃO 3: Adicionar instrução de objetivo no prompt ───────────────────
old_obj = '''  "creatives": [
    {
      "type": "testimonial|storytelling|authority|lead_magnet|social_proof|direct_offer",'''

new_obj = '''  "INSTRUCAO_CRIATIVOS": "IMPORTANTE: O objetivo desta campanha e ${input.objective}. Para LEADS: copies focados em cadastro, material gratuito, sem compromisso, CTA de baixo atrito. Para SALES: copies focados em oferta, preco, urgencia, garantia, CTA de compra direta. NUNCA use placeholders como [problema], [resultado], [marca] — use textos REAIS baseados no nicho e perfil do cliente.",
  "creatives": [
    {
      "type": "testimonial|storytelling|authority|lead_magnet|social_proof|direct_offer",'''

if old_obj in content:
    content = content.replace(old_obj, new_obj, 1)
    print('✅ Correção 3: instrução de objetivo adicionada antes dos criativos')
else:
    print('⚠️  Correção 3: já aplicada ou texto diferente')

open('server/ai.ts', 'w', encoding='utf-8').write(content)
print('\n✅ ai.ts salvo com sucesso!')
print('Próximo passo: git add server/ai.ts && git commit && git push')
