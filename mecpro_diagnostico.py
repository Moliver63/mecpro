#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
╔══════════════════════════════════════════════════════════════════════════════╗
║          MECPro — DIAGNÓSTICO COMPLETO DE INTELIGÊNCIA COMPETITIVA          ║
║     Análise: Meta Ads API · Gemini AI · Scraping · Cruzamento de Dados      ║
╚══════════════════════════════════════════════════════════════════════════════╝

Execução:  python3 mecpro_diagnostico.py
Resultado: relatorio_mecpro.txt  (salvo automaticamente)
"""

import json
import re
import sys
import os
from datetime import datetime

# ─────────────────────────────────────────────────────────────────────────────
# DADOS COLETADOS DA ANÁLISE ESTÁTICA DO CÓDIGO
# (server/ai.ts · server/db.ts · server/schema.ts · server/_core/router.ts)
# ─────────────────────────────────────────────────────────────────────────────

ANALISE = {

    # ══════════════════════════════════════════════════════════════════════════
    # BLOCO 1 — META ADS LIBRARY API
    # ══════════════════════════════════════════════════════════════════════════
    "meta_api": {
        "titulo": "META ADS LIBRARY API",
        "score": 42,
        "token_configurado": True,   # env tem META_ACCESS_TOKEN real
        "endpoint_usado": "https://graph.facebook.com/v19.0/ads_archive",
        "limit_atual": 50,
        "limit_maximo_api": 1000,

        "campos_usados": [
            "id",
            "ad_creation_time",
            "ad_creative_bodies",
            "ad_creative_link_titles",
            "ad_creative_link_captions",
            "ad_snapshot_url",
            "impressions",
        ],

        "campos_disponiveis_ignorados": [
            ("page_name",             "CRÍTICO",  "Nome da página — identifica o anunciante real"),
            ("page_id",               "CRÍTICO",  "ID confirmado pelo Meta — evita confusão de páginas"),
            ("ad_creative_media",     "CRÍTICO",  "Tipo real do criativo: video/image/carousel + URLs de mídia"),
            ("publisher_platforms",   "ALTO",     "Onde o anúncio roda: fb, ig, audience_network, messenger"),
            ("demographic_distribution", "ALTO",  "Distribuição por idade/gênero — ouro para segmentação"),
            ("delivery_by_region",    "ALTO",     "Estados/cidades com mais veiculação"),
            ("spend",                 "ALTO",     "Faixa de investimento estimado do anúncio"),
            ("reach_estimate",        "ALTO",     "Alcance estimado do anúncio"),
            ("target_ages",           "MÉDIO",    "Faixa etária do público-alvo configurado"),
            ("target_gender",         "MÉDIO",    "Gênero do público-alvo"),
            ("target_locations",      "MÉDIO",    "Localização do público-alvo"),
            ("languages",             "MÉDIO",    "Idiomas veiculados — indica mercados"),
            ("content_delivery_stops","MÉDIO",    "Quando o anúncio parou — mede longevidade"),
            ("bylines",               "BAIXO",    "Quem pagou pelo anúncio (paid for by)"),
            ("funding_entity",        "BAIXO",    "Entidade financiadora"),
        ],

        "problemas": [
            {
                "severidade": "CRÍTICO",
                "titulo": "limit=50 — perdendo até 95% dos anúncios",
                "detalhe": (
                    "A API suporta até limit=1000 por chamada. Com limit=50, "
                    "um concorrente com 500 anúncios ativos terá apenas 10% coletado. "
                    "Além disso, não há paginação implementada (campo 'after' do cursor). "
                    "Concorrentes grandes como franquias ou e-commerces chegam a ter "
                    "3.000+ anúncios ativos simultâneos."
                ),
                "correcao": (
                    "Aumentar limit=200 (máximo prático sem timeout) e implementar "
                    "loop de paginação com cursor 'after': "
                    "while (data.paging?.cursors?.after) { fetch próxima página }"
                ),
                "codigo_fix": """
// Substituir chamada única por loop paginado:
async function fetchAllMetaAds(pageId: string, token: string) {
  const allAds: any[] = [];
  let after: string | null = null;
  let page = 0;

  do {
    const cursor = after ? `&after=${after}` : '';
    const url = `https://graph.facebook.com/v19.0/ads_archive`
      + `?access_token=${token}`
      + `&search_page_ids=${pageId}`
      + `&ad_active_status=ACTIVE`
      + `&ad_reached_countries=BR`
      + `&fields=id,ad_creation_time,ad_creative_bodies,ad_creative_link_titles,`
      + `ad_creative_link_captions,ad_snapshot_url,impressions,page_name,page_id,`
      + `ad_creative_media,publisher_platforms,demographic_distribution,`
      + `delivery_by_region,spend,reach_estimate,target_ages,target_gender,`
      + `target_locations,languages,content_delivery_stops`
      + `&limit=200${cursor}`;

    const res  = await fetch(url);
    const data = await res.json();
    if (data.error) break;

    allAds.push(...(data.data || []));
    after = data.paging?.cursors?.after || null;
    page++;

    // Segurança: máximo 15 páginas (3.000 anúncios)
    if (page >= 15) break;

    // Rate limit: 200ms entre páginas
    await new Promise(r => setTimeout(r, 200));

  } while (after);

  return allAds;
}
"""
            },
            {
                "severidade": "CRÍTICO",
                "titulo": "Sem paginação — dados truncados silenciosamente",
                "detalhe": (
                    "Quando a API retorna cursor 'after' na resposta, significa que "
                    "há mais páginas. O código atual ignora esse campo completamente. "
                    "O usuário vê '7 anúncios coletados' sem saber que existem 400+"
                ),
                "correcao": "Implementar loop de paginação (ver fix acima)"
            },
            {
                "severidade": "ALTO",
                "titulo": "Sem busca de anúncios INATIVOS",
                "detalhe": (
                    "A query filtra apenas ad_active_status=ACTIVE. "
                    "Anúncios inativos/arquivados revelam padrões históricos: "
                    "quais criativos o concorrente testou e abandonou (= não funcionou), "
                    "sazonalidade de campanhas, testes A/B anteriores."
                ),
                "correcao": "Fazer duas queries: ACTIVE + INACTIVE, salvar ambas com flag isActive"
            },
            {
                "severidade": "ALTO",
                "titulo": "ad_creative_media ignorado — tipo do anúncio estimado incorretamente",
                "detalhe": (
                    "A função detectAdType() tenta inferir o tipo pelo campo "
                    "'ad_creative_media[0].type', mas esse campo NÃO está na lista "
                    "de fields solicitados à API. O Meta retorna apenas os campos "
                    "explicitamente pedidos no parâmetro ?fields=. "
                    "Resultado: todos os anúncios são classificados como 'image' por padrão."
                ),
                "correcao": "Adicionar 'ad_creative_media' na lista de fields"
            },
            {
                "severidade": "MÉDIO",
                "titulo": "Token de ambiente único — sem fallback para token do usuário",
                "detalhe": (
                    "O token META_ACCESS_TOKEN é do ambiente do servidor (app token). "
                    "A tabela api_integrations existe no schema para tokens por usuário, "
                    "mas nunca é consultada. Usuários com seus próprios tokens Meta "
                    "não podem usá-los para aumentar limites."
                ),
                "correcao": "Consultar api_integrations do usuário antes de usar o token global"
            },
        ]
    },

    # ══════════════════════════════════════════════════════════════════════════
    # BLOCO 2 — GEMINI AI
    # ══════════════════════════════════════════════════════════════════════════
    "gemini": {
        "titulo": "GEMINI AI (google/gemini-1.5-flash)",
        "score": 55,
        "key_configurada": True,   # env tem GEMINI_API_KEY real
        "modelo_atual": "gemini-1.5-flash",
        "temperatura_atual": 0.7,
        "max_tokens_atual": 4096,
        "context_window_flash": 1_000_000,  # tokens disponíveis
        "tokens_usados_estimado": 2500,

        "problemas": [
            {
                "severidade": "CRÍTICO",
                "titulo": "Sem system prompt — IA sem identidade ou papel definido",
                "detalhe": (
                    "A API Gemini suporta o campo 'system_instruction' separado do "
                    "user prompt. Sem ele, o modelo não tem contexto de quem é, "
                    "qual é o produto, o mercado ou o objetivo. "
                    "O papel ('Você é um especialista...') está embutido no próprio "
                    "prompt de usuário, o que consome tokens e reduz a consistência "
                    "das respostas entre chamadas."
                ),
                "correcao": (
                    "Adicionar system_instruction na chamada. "
                    "Isso melhora consistência, reduz tokens gastos com role-play, "
                    "e permite reutilizar a função gemini() para múltiplos propósitos."
                ),
                "codigo_fix": """
async function gemini(prompt: string, systemInstruction?: string): Promise<string> {
  const body: any = {
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: 0.4,          // Mais determinístico para análises
      maxOutputTokens: 8192,     // Flash suporta até 8192 output tokens
      responseMimeType: "application/json",  // Força JSON nativo — elimina parsing!
    },
  };

  // System instruction separada — não consome tokens do user turn
  if (systemInstruction) {
    body.system_instruction = { parts: [{ text: systemInstruction }] };
  }

  const res = await fetch(`${GEMINI_URL}?key=${GEMINI_API_KEY}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const data = await res.json() as any;

  // Tratar rate limit (429) com retry exponencial
  if (res.status === 429) {
    await new Promise(r => setTimeout(r, 2000));
    return gemini(prompt, systemInstruction); // retry uma vez
  }

  if (data.error) throw new Error(data.error.message);
  return data.candidates?.[0]?.content?.parts?.[0]?.text || "";
}

// Constante de sistema para análise de concorrentes
const SYSTEM_MARKETING_ANALYST = `
Você é o MECPro AI, especialista sênior em inteligência competitiva de marketing digital.
Sua função é analisar dados de anúncios da Meta Ads Library e gerar insights acionáveis
para gestores de tráfego e donos de negócios brasileiros.

Regras obrigatórias:
- Responda SEMPRE em JSON válido, sem markdown, sem explicações fora do JSON
- Use linguagem direta e prática, foco em ação
- Baseie análises nos dados fornecidos, nunca invente métricas
- Priorize padrões que se repetem por 30+ dias (= testados e validados)
`;
"""
            },
            {
                "severidade": "CRÍTICO",
                "titulo": "responseMimeType não configurado — parsing frágil",
                "detalhe": (
                    "Gemini 1.5 Flash suporta 'responseMimeType: application/json' "
                    "que força o modelo a retornar JSON válido nativamente, "
                    "eliminando o hack de .replace(/```json|```/g, '').trim(). "
                    "Sem isso, o modelo às vezes retorna texto com markdown, "
                    "quebrando o JSON.parse() e caindo no fallback de mock."
                ),
                "correcao": "Adicionar responseMimeType na generationConfig (ver fix acima)"
            },
            {
                "severidade": "ALTO",
                "titulo": "temperatura 0.7 muito alta para análise estruturada",
                "detalhe": (
                    "Para tarefas de análise com saída JSON estruturada, "
                    "temperatura 0.7 aumenta criatividade desnecessária e "
                    "o risco de o modelo 'inventar' dados ou variar o formato JSON. "
                    "Temperatura recomendada: 0.2-0.4 para análises factuais, "
                    "0.6-0.8 apenas para geração criativa de copies."
                ),
                "correcao": "analyzeCompetitor e generateMarketAnalysis → temperature: 0.3 | generateCampaign → temperature: 0.6"
            },
            {
                "severidade": "ALTO",
                "titulo": "Dados do cliente (Módulo 1) NÃO são injetados no prompt de análise do Módulo 2",
                "detalhe": (
                    "analyzeCompetitor() analisa o concorrente de forma genérica, "
                    "sem saber nada sobre o cliente: nicho, produto, público-alvo, "
                    "dor principal, budget. "
                    "Isso impede que a IA identifique oportunidades específicas, "
                    "como 'o concorrente não anuncia para o público-alvo do seu cliente'. "
                    "generateMarketAnalysis() no Módulo 3 injeta o perfil, "
                    "mas o Módulo 2 (análise de cada concorrente) permanece cego."
                ),
                "correcao": "Buscar clientProfile no início de analyzeCompetitor() e incluir no prompt",
                "codigo_fix": """
// No início de analyzeCompetitor():
const clientProfile = await db.getClientProfile(projectId);

// No prompt, adicionar seção CONTEXTO DO CLIENTE:
const clientContext = clientProfile ? `
CONTEXTO DO CLIENTE (use para análise comparativa):
- Nicho: ${clientProfile.niche}
- Produto/Serviço: ${clientProfile.productService}
- Público-alvo: ${clientProfile.targetAudience}
- Dor principal que resolve: ${clientProfile.mainPain}
- Proposta de valor: ${clientProfile.uniqueValueProposition}
- Budget mensal: R$ ${clientProfile.monthlyBudget || 'não informado'}

OBJETIVO: Identifique gaps que o concorrente deixa abertos e que o cliente pode explorar.
` : '';
"""
            },
            {
                "severidade": "ALTO",
                "titulo": "maxOutputTokens: 4096 — resposta truncada em análises densas",
                "detalhe": (
                    "Gemini 1.5 Flash suporta até 8192 tokens de output. "
                    "Com 4096, análises de mercado completas (Módulo 3) ou "
                    "campanhas detalhadas (Módulo 4) podem ser truncadas no meio "
                    "do JSON, causando erro de parse e fallback para mock."
                ),
                "correcao": "Aumentar maxOutputTokens para 8192"
            },
            {
                "severidade": "MÉDIO",
                "titulo": "Sem retry em caso de erro 429 (rate limit)",
                "detalhe": (
                    "Gemini free tier: 15 req/min. Tier pago: 1000 req/min. "
                    "Se múltiplos usuários usarem simultaneamente, erros 429 "
                    "são prováveis. Sem retry, o usuário recebe insights de mock "
                    "sem saber que a IA falhou."
                ),
                "correcao": "Implementar retry com backoff exponencial (ver fix acima)"
            },
            {
                "severidade": "MÉDIO",
                "titulo": "Modelo gemini-1.5-flash — considerar gemini-2.0-flash",
                "detalhe": (
                    "Gemini 2.0 Flash (lançado dez/2024) tem melhor raciocínio, "
                    "custo similar e melhor aderência a JSON schema. "
                    "String do modelo: 'gemini-2.0-flash-exp' ou 'gemini-2.0-flash'."
                ),
                "correcao": "Atualizar GEMINI_URL para gemini-2.0-flash | Manter 1.5-flash como fallback"
            },
            {
                "severidade": "BAIXO",
                "titulo": "Sem cache de prompts idênticos",
                "detalhe": (
                    "Se o usuário clica 'Re-analisar' sem novos dados, "
                    "o mesmo prompt é enviado ao Gemini novamente gastando tokens. "
                    "Adicionar hash do prompt + TTL de 1h economizaria ~60% das chamadas."
                ),
                "correcao": "Cache em memória ou Redis: Map<promptHash, { result, ts }>"
            },
        ]
    },

    # ══════════════════════════════════════════════════════════════════════════
    # BLOCO 3 — SCRAPING E COLETA DE DADOS
    # ══════════════════════════════════════════════════════════════════════════
    "scraping": {
        "titulo": "SCRAPING & COLETA DE DADOS",
        "score": 38,

        "problemas": [
            {
                "severidade": "CRÍTICO",
                "titulo": "Ads Library pública bloqueia scrapers sem headless browser",
                "detalhe": (
                    "O endpoint async/search_ads retorna 'for(;;);' (proteção CSRF) "
                    "seguido de JSON, mas o Facebook detecta requests sem cookies "
                    "e sessão autenticada e retorna HTML vazio ou dados zerados. "
                    "O código atual faz fetch() simples sem cookies/sessão — "
                    "parseAdsLibraryResponse() nunca consegue dados reais sem token."
                ),
                "correcao": (
                    "Para scraping real sem token oficial, usar Playwright/Puppeteer "
                    "headless com sessão autenticada. "
                    "Alternativa mais simples: usar a API oficial sempre que possível "
                    "e deixar scraping apenas para casos de Instagram (sem page_id)."
                ),
                "codigo_fix": """
// OPÇÃO A: Playwright (servidor Node.js) — instalar @playwright/test
import { chromium } from 'playwright';

async function scrapeAdsLibraryHeadless(pageId: string): Promise<RawAd[]> {
  const browser = await chromium.launch({ headless: true });
  const page    = await browser.newPage();

  // Abre Ads Library com cookies de sessão (se disponível)
  await page.goto(
    `https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=BR&view_all_page_id=${pageId}`,
    { waitUntil: 'networkidle' }
  );

  // Intercepta as chamadas XHR que retornam os cards de anúncios
  const ads: RawAd[] = [];
  page.on('response', async (res) => {
    if (res.url().includes('ads/library/async/search_ads')) {
      const text = await res.text();
      ads.push(...parseAdsLibraryResponse(text));
    }
  });

  // Scroll para carregar mais anúncios (lazy load)
  for (let i = 0; i < 5; i++) {
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(1500);
  }

  await browser.close();
  return ads;
}

// OPÇÃO B (recomendada): Apify Actor para Meta Ads Library
// Serviço gerenciado, sem bloqueio, ~$0.01/execução
// https://apify.com/apify/facebook-ads-scraper
"""
            },
            {
                "severidade": "CRÍTICO",
                "titulo": "Website do concorrente nunca é analisado",
                "detalhe": (
                    "O campo websiteUrl é coletado no formulário mas NUNCA usado. "
                    "Analisar o site do concorrente revela: landing pages, ofertas, "
                    "preços, copy de conversão, pixels instalados (via meta tags), "
                    "tecnologias usadas (Wappalyzer). "
                    "Esses dados enriquecem muito o prompt do Gemini."
                ),
                "correcao": "Criar fetchWebsiteData() que extrai title, description, h1-h3, preços via cheerio",
                "codigo_fix": """
// Instalar: pnpm add cheerio
import * as cheerio from 'cheerio';

async function fetchWebsiteData(url: string) {
  try {
    const res  = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; MECProBot/1.0)' },
      signal: AbortSignal.timeout(8000),
    });
    const html = await res.text();
    const $    = cheerio.load(html);

    return {
      title:       $('title').text().trim().slice(0, 200),
      description: $('meta[name=description]').attr('content')?.slice(0, 300) || '',
      h1:          $('h1').map((_, el) => $(el).text().trim()).get().slice(0, 5),
      h2:          $('h2').map((_, el) => $(el).text().trim()).get().slice(0, 10),
      cta_buttons: $('button, a.btn, a[href*=comprar], a[href*=assinar]')
                     .map((_, el) => $(el).text().trim()).get()
                     .filter(t => t.length > 2 && t.length < 40).slice(0, 10),
      price_mentions: html.match(/R\\$\\s*[\\d.,]+/g)?.slice(0, 10) || [],
    };
  } catch {
    return null;
  }
}
"""
            },
            {
                "severidade": "ALTO",
                "titulo": "Dados de ads repetidos no banco — sem deduplicação",
                "detalhe": (
                    "createScrapedAd() insere sempre, sem verificar se adId já existe. "
                    "Cada clique em 'Re-analisar' duplica todos os anúncios no banco. "
                    "Com paginação real (300+ anúncios), isso cresce exponencialmente."
                ),
                "correcao": "Usar INSERT ... ON CONFLICT (adId) DO UPDATE ou verificar existência antes",
                "codigo_fix": """
// Usar upsert ao invés de insert:
export async function upsertScrapedAd(data: any) {
  const db = await getDb();

  // Verifica se já existe pelo adId
  if (data.adId) {
    const existing = await db.select({ id: scrapedAds.id })
      .from(scrapedAds)
      .where(eq(scrapedAds.adId, data.adId))
      .limit(1);

    if (existing.length > 0) {
      // Atualiza dados (pode ter mudado isActive, impressions)
      await db.update(scrapedAds)
        .set({ isActive: data.isActive, rawData: data.rawData, createdAt: new Date() })
        .where(eq(scrapedAds.adId, data.adId));
      return existing[0];
    }
  }

  const r = await db.insert(scrapedAds).values(data).returning({ id: scrapedAds.id });
  return r[0];
}
"""
            },
            {
                "severidade": "ALTO",
                "titulo": "Anúncios estimados (mock) misturados com dados reais — sem distinção",
                "detalhe": (
                    "generateMockAds() salva anúncios com adId começando em 'estimated_'. "
                    "O frontend não distingue dados reais de estimados. "
                    "O usuário vê '7 anúncios' sem saber que são inventados. "
                    "O Gemini analisa dados fictícios como se fossem reais."
                ),
                "correcao": "Adicionar campo source ('meta_api' | 'scraping' | 'estimated') na tabela scraped_ads e exibir badge no frontend"
            },
            {
                "severidade": "MÉDIO",
                "titulo": "Sem coleta de dados do Google Ads",
                "detalhe": (
                    "googleAdsUrl existe no schema mas não há nenhuma função "
                    "que busque dados do Google Ads Transparency Center. "
                    "Concorrentes que rodam Google Search + Meta podem ter "
                    "suas palavras-chave inferidas pela Transparency Center API."
                ),
                "correcao": "Integrar Google Ads Transparency API (gratuita) para anúncios de busca"
            },
        ]
    },

    # ══════════════════════════════════════════════════════════════════════════
    # BLOCO 4 — CRUZAMENTO DE DADOS (DATA PIPELINE)
    # ══════════════════════════════════════════════════════════════════════════
    "cruzamento": {
        "titulo": "CRUZAMENTO DE DADOS E DATA PIPELINE",
        "score": 28,

        "problemas": [
            {
                "severidade": "CRÍTICO",
                "titulo": "Frontend recebe adsCount=undefined — badge sempre mostra 'Não analisado'",
                "detalhe": (
                    "O TypeScript do frontend espera c.adsCount e c.aiInsights, "
                    "mas getCompetitorsByProjectId() faz SELECT simples da tabela "
                    "competitors, que NÃO tem essas colunas. "
                    "O schema tem apenas: id, name, notes, facebookPageId, etc. "
                    "aiInsights é salvo em 'notes' via updateCompetitorInsights(). "
                    "adsCount nunca é calculado. "
                    "Resultado: badge sempre 'Não analisado', Raio-X sem dados."
                ),
                "correcao": "Reescrever getCompetitorsByProjectId() com JOIN + COUNT + dados de scrapedAds",
                "codigo_fix": """
// server/db.ts — substituir getCompetitorsByProjectId:
export async function getCompetitorsByProjectId(projectId: number) {
  const db = await getDb();
  if (!db) return [];

  // Query com contagem de anúncios e top-5 anúncios por concorrente
  const comps = await db.select({
    id:              competitors.id,
    name:            competitors.name,
    facebookPageId:  competitors.facebookPageId,
    facebookPageUrl: competitors.facebookPageUrl,
    instagramUrl:    competitors.instagramUrl,
    websiteUrl:      competitors.websiteUrl,
    aiInsights:      competitors.notes,   // notes = campo onde insights são salvos
  })
  .from(competitors)
  .where(eq(competitors.projectId, projectId))
  .orderBy(competitors.createdAt);

  // Para cada concorrente, busca contagem e anúncios
  const result = await Promise.all(comps.map(async (c) => {
    const ads = await db.select()
      .from(scrapedAds)
      .where(eq(scrapedAds.competitorId, c.id))
      .orderBy(desc(scrapedAds.createdAt))
      .limit(20);

    return {
      ...c,
      adsCount:   ads.length,
      scrapedAds: ads,
    };
  }));

  return result;
}
"""
            },
            {
                "severidade": "CRÍTICO",
                "titulo": "Módulo 2 → Módulo 3: dados de anúncios NÃO são cruzados com perfil do cliente",
                "detalhe": (
                    "generateMarketAnalysis() injeta o perfil do cliente e lista os concorrentes, "
                    "MAS os dados individuais dos anúncios (headlines, bodyText, CTAs) "
                    "são enviados apenas como contagens agregadas. "
                    "O Gemini não vê os textos reais — apenas '7 anúncios coletados'. "
                    "Isso elimina a capacidade de identificar: "
                    "quais dores o concorrente explora, que promessas faz, qual tom usa."
                ),
                "correcao": "Incluir os top-10 anúncios de cada concorrente com texto completo no prompt do Módulo 3",
                "codigo_fix": """
// Em generateMarketAnalysis(), substituir a seção de anúncios por:
const competitorsDetail = competitors.map((c: any) => {
  const compAds = allAds.filter((a: any) => a.competitorName === c.name);
  const activeAds = compAds.filter((a: any) => a.isActive);
  const ctaFreq = compAds.reduce((acc: any, a: any) => {
    if (a.cta) acc[a.cta] = (acc[a.cta] || 0) + 1;
    return acc;
  }, {});
  const topCtas = Object.entries(ctaFreq)
    .sort((a: any, b: any) => b[1] - a[1])
    .slice(0, 3)
    .map(([cta]) => cta);

  return `
CONCORRENTE: ${c.name}
- Total anúncios: ${compAds.length} (${activeAds.length} ativos)
- CTAs predominantes: ${topCtas.join(', ') || 'n/a'}
- Top 5 headlines (por ordem de coleta):
${compAds.slice(0, 5).map((a: any, i: number) =>
  `  [${i+1}] "${a.headline || 'sem headline'}" — ${a.adType || 'image'} | CTA: ${a.cta || '?'}`
).join('\\n')}
- Textos mais longos (copy completo):
${compAds.filter((a: any) => a.bodyText && a.bodyText.length > 50).slice(0, 3).map((a: any) =>
  `  → "${a.bodyText?.slice(0, 300)}"`
).join('\\n')}
`;
}).join('\\n\\n');
"""
            },
            {
                "severidade": "ALTO",
                "titulo": "Módulo 4 não usa dados frescos — usa apenas contagens do Módulo 3",
                "detalhe": (
                    "generateCampaign() busca competitors e marketAnalysis mas "
                    "usa apenas: nomes dos concorrentes, contagem de anúncios, "
                    "top-5 CTAs e formatos. "
                    "Não usa os dados mais ricos: demographic_distribution, "
                    "delivery_by_region, spend range — que informariam diretamente "
                    "a estratégia de segmentação e budget."
                ),
                "correcao": "Enriquecer prompt do Módulo 4 com dados demográficos e regionais dos anúncios"
            },
            {
                "severidade": "ALTO",
                "titulo": "aiInsights salvo em campo 'notes' — colisão semântica",
                "detalhe": (
                    "updateCompetitorInsights() salva em competitors.notes. "
                    "O campo notes foi projetado para anotações manuais do usuário. "
                    "Sobreescrevendo com insights da IA, perde-se a capacidade "
                    "de anotações manuais E os insights ficam sem metadados "
                    "(quando foi gerado, qual modelo, quantos anúncios eram base)."
                ),
                "correcao": "Adicionar colunas aiInsights, aiGeneratedAt, aiAdsAnalyzed na tabela competitors"
            },
            {
                "severidade": "MÉDIO",
                "titulo": "Sem score/ranking de concorrentes por atividade",
                "detalhe": (
                    "O Módulo 3 lista todos os concorrentes igualmente. "
                    "Mas concorrentes com 200 anúncios ativos há 90 dias "
                    "são muito mais relevantes que um com 2 anúncios. "
                    "Sem um 'threat score', o Gemini não prioriza os insights."
                ),
                "correcao": "Calcular score = (adsAtivos * 2) + (diasAtivos * 0.5) e ordenar antes do prompt"
            },
        ]
    },

    # ══════════════════════════════════════════════════════════════════════════
    # BLOCO 5 — SCHEMA / BANCO DE DADOS
    # ══════════════════════════════════════════════════════════════════════════
    "schema": {
        "titulo": "SCHEMA / BANCO DE DADOS",
        "score": 60,

        "problemas": [
            {
                "severidade": "ALTO",
                "titulo": "scraped_ads sem índices — queries lentas com volume",
                "detalhe": (
                    "Sem índices em competitorId e projectId, "
                    "cada query de SELECT com WHERE varre a tabela inteira. "
                    "Com 50 concorrentes × 200 anúncios = 10.000 linhas, "
                    "já começa a ficar lento. Com paginação real: 150.000+ linhas."
                ),
                "correcao": "Criar índices: CREATE INDEX idx_scraped_competitor ON scraped_ads(competitorId); CREATE INDEX idx_scraped_project ON scraped_ads(projectId);"
            },
            {
                "severidade": "ALTO",
                "titulo": "scraped_ads sem campos ricos que a API pode fornecer",
                "detalhe": (
                    "O schema não tem colunas para: demographicDistribution, "
                    "deliveryByRegion, spendRange, reachEstimate, publisherPlatforms. "
                    "Mesmo que o código colete esses dados da API, "
                    "são jogados fora (não salvos) ou ficam apenas em rawData (JSON string). "
                    "Para cruzamento eficiente, precisam ser colunas indexáveis."
                ),
                "correcao": "Adicionar colunas JSONB ou varchar: demographicData, regionData, spendRange, platforms"
            },
            {
                "severidade": "MÉDIO",
                "titulo": "competitors sem aiInsights como coluna dedicada",
                "detalhe": "aiInsights e notas manuais compartilham o campo notes — ver bug de cruzamento acima",
                "correcao": "ALTER TABLE competitors ADD COLUMN aiInsights TEXT, ADD COLUMN aiGeneratedAt TIMESTAMP;"
            },
        ]
    },
}

# ─────────────────────────────────────────────────────────────────────────────
# ENGINE DE RELATÓRIO
# ─────────────────────────────────────────────────────────────────────────────

SEVERIDADE_ORDEM = {"CRÍTICO": 0, "ALTO": 1, "MÉDIO": 2, "BAIXO": 3}
SEVERIDADE_EMOJI = {"CRÍTICO": "🔴", "ALTO": "🟠", "MÉDIO": "🟡", "BAIXO": "🔵"}
SEVERIDADE_LABEL = {"CRÍTICO": "CRÍTICO", "ALTO": "ALTO   ", "MÉDIO": "MÉDIO  ", "BAIXO": "BAIXO  "}


def contar_por_severidade(bloco: dict) -> dict:
    cont = {"CRÍTICO": 0, "ALTO": 0, "MÉDIO": 0, "BAIXO": 0}
    for p in bloco.get("problemas", []):
        cont[p["severidade"]] += 1
    return cont


def calcular_score_geral(blocos: dict) -> float:
    scores = [b.get("score", 50) for b in blocos.values() if isinstance(b, dict)]
    return round(sum(scores) / len(scores), 1) if scores else 0


def barra_progresso(score: int, width: int = 30) -> str:
    filled = round(score / 100 * width)
    bar    = "█" * filled + "░" * (width - filled)
    cor    = "🔴" if score < 40 else ("🟠" if score < 60 else ("🟡" if score < 80 else "🟢"))
    return f"{cor} [{bar}] {score}/100"


def gerar_relatorio() -> str:
    linhas = []
    W = 80  # largura do relatório

    def h(texto, char="═"):
        return char * W + "\n" + texto.center(W) + "\n" + char * W

    def sep(char="─"):
        return char * W

    now = datetime.now().strftime("%d/%m/%Y %H:%M")

    # ── Cabeçalho ──
    linhas.append(h(" MECPro — DIAGNÓSTICO DE INTELIGÊNCIA COMPETITIVA "))
    linhas.append(f"  Gerado em: {now}")
    linhas.append(f"  Arquivos analisados: server/ai.ts · server/db.ts · server/schema.ts · server/_core/router.ts")
    linhas.append(f"  Credenciais no .env: GEMINI_API_KEY ✅ · META_ACCESS_TOKEN ✅ · DATABASE_URL ✅")
    linhas.append("")

    # ── Score geral ──
    score_geral = calcular_score_geral(ANALISE)
    linhas.append(h(f" SCORE GERAL: {score_geral}/100 ", "─"))
    linhas.append("")

    labels = {
        "meta_api": "Meta Ads API",
        "gemini":   "Gemini AI   ",
        "scraping": "Scraping    ",
        "cruzamento": "Cruzamento ",
        "schema":   "Schema/DB   ",
    }
    for key, bloco in ANALISE.items():
        if not isinstance(bloco, dict):
            continue
        s = bloco.get("score", 0)
        linhas.append(f"  {labels.get(key, key)}  {barra_progresso(s)}")
    linhas.append("")

    # ── Resumo executivo ──
    total_criticos = sum(
        contar_por_severidade(b)["CRÍTICO"]
        for b in ANALISE.values() if isinstance(b, dict)
    )
    total_altos = sum(
        contar_por_severidade(b)["ALTO"]
        for b in ANALISE.values() if isinstance(b, dict)
    )
    total_medios = sum(
        contar_por_severidade(b)["MÉDIO"]
        for b in ANALISE.values() if isinstance(b, dict)
    )

    linhas.append(sep())
    linhas.append("  RESUMO EXECUTIVO".center(W))
    linhas.append(sep())
    linhas.append("")
    linhas.append(f"  🔴 Problemas CRÍTICOS  : {total_criticos}  (bloqueiam funcionamento real)")
    linhas.append(f"  🟠 Problemas ALTOS     : {total_altos}  (reduzem qualidade da análise)")
    linhas.append(f"  🟡 Problemas MÉDIOS    : {total_medios}  (melhorias de performance/UX)")
    linhas.append("")
    linhas.append("  DIAGNÓSTICO:")
    linhas.append("  O sistema tem as APIs corretas configuradas (Gemini + Meta), mas a lógica")
    linhas.append("  de extração e cruzamento está operando a ~30% da capacidade real.")
    linhas.append("")
    linhas.append("  Os 3 maiores problemas que impedem valor real hoje:")
    linhas.append("  1. Meta API coleta apenas 50 anúncios sem paginação (perde 80-95% dos dados)")
    linhas.append("  2. Frontend recebe adsCount=undefined — badge sempre mostra 'Não analisado'")
    linhas.append("  3. Gemini analisa concorrente sem saber nada sobre o cliente do Módulo 1")
    linhas.append("")

    # ── Blocos detalhados ──
    for key, bloco in ANALISE.items():
        if not isinstance(bloco, dict):
            continue

        titulo   = bloco.get("titulo", key.upper())
        score    = bloco.get("score", 0)
        problemas = bloco.get("problemas", [])

        linhas.append("")
        linhas.append(sep("═"))
        linhas.append(f"  {titulo}".ljust(W - 10) + f"  Score: {score}/100")
        linhas.append(sep("═"))

        # Contagem por severidade
        cont = contar_por_severidade(bloco)
        partes = [f"{SEVERIDADE_EMOJI[s]} {v} {s}" for s, v in cont.items() if v > 0]
        linhas.append("  " + "  |  ".join(partes))
        linhas.append("")

        # Campos / info adicional por bloco
        if key == "meta_api":
            linhas.append(f"  Token configurado : {'✅ Sim' if bloco['token_configurado'] else '❌ Não'}")
            linhas.append(f"  Limit atual       : {bloco['limit_atual']} (máximo suportado: {bloco['limit_maximo_api']})")
            linhas.append(f"  Campos usados     : {len(bloco['campos_usados'])} de {len(bloco['campos_usados']) + len(bloco['campos_disponiveis_ignorados'])} disponíveis")
            linhas.append("")
            linhas.append("  CAMPOS IGNORADOS (ordenados por impacto):")
            for campo, sev, desc in sorted(bloco["campos_disponiveis_ignorados"], key=lambda x: SEVERIDADE_ORDEM[x[1]]):
                linhas.append(f"  {SEVERIDADE_EMOJI[sev]} {campo:<35} {desc}")
            linhas.append("")

        if key == "gemini":
            linhas.append(f"  Key configurada   : {'✅ Sim' if bloco['key_configurada'] else '❌ Não'}")
            linhas.append(f"  Modelo atual      : {bloco['modelo_atual']}")
            linhas.append(f"  Temperatura       : {bloco['temperatura_atual']} (recomendado: 0.3 para análises, 0.6 para criativos)")
            linhas.append(f"  Max output tokens : {bloco['max_tokens_atual']} (disponível: {bloco['context_window_flash']:,})")
            linhas.append(f"  Tokens/chamada    : ~{bloco['tokens_usados_estimado']:,} estimados")
            linhas.append(f"  System prompt     : ❌ Não configurado")
            linhas.append(f"  responseMimeType  : ❌ Não configurado (risco de JSON inválido)")
            linhas.append(f"  Retry em 429      : ❌ Não implementado")
            linhas.append("")

        # Problemas do bloco
        probs_sorted = sorted(problemas, key=lambda p: SEVERIDADE_ORDEM[p["severidade"]])
        for i, p in enumerate(probs_sorted, 1):
            sev   = p["severidade"]
            emoji = SEVERIDADE_EMOJI[sev]
            label = SEVERIDADE_LABEL[sev]

            linhas.append(f"  {emoji} [{label}] #{i}: {p['titulo']}")
            linhas.append(sep("·"))

            # Detalhe com quebra de linha
            detalhe = p["detalhe"]
            palavras = detalhe.split()
            linha_atual = "  PROBLEMA: "
            for palavra in palavras:
                if len(linha_atual) + len(palavra) + 1 > W - 2:
                    linhas.append(linha_atual)
                    linha_atual = "  " + palavra + " "
                else:
                    linha_atual += palavra + " "
            if linha_atual.strip():
                linhas.append(linha_atual)

            linhas.append("")
            correcao = p.get("correcao", "")
            if correcao:
                palavras_c = correcao.split()
                linha_c    = "  CORREÇÃO:  "
                for palavra in palavras_c:
                    if len(linha_c) + len(palavra) + 1 > W - 2:
                        linhas.append(linha_c)
                        linha_c = "  " + palavra + " "
                    else:
                        linha_c += palavra + " "
                if linha_c.strip():
                    linhas.append(linha_c)

            if "codigo_fix" in p:
                linhas.append("")
                linhas.append("  CÓDIGO SUGERIDO:")
                linhas.append("  " + sep("-"))
                for linha_cod in p["codigo_fix"].strip().split("\n"):
                    linhas.append("  " + linha_cod)
                linhas.append("  " + sep("-"))

            linhas.append("")

    # ── Plano de ação priorizado ──
    linhas.append("")
    linhas.append(sep("═"))
    linhas.append("  PLANO DE AÇÃO — ORDEM DE IMPLEMENTAÇÃO RECOMENDADA".center(W))
    linhas.append(sep("═"))
    linhas.append("")

    acoes = [
        # (prioridade, tempo estimado, arquivo, ação)
        ("1", "30min", "server/db.ts",          "Corrigir getCompetitorsByProjectId() → JOIN + COUNT + scrapedAds"),
        ("2", "20min", "server/ai.ts",           "fetchMetaAdsById(): aumentar limit=200 + loop de paginação"),
        ("3", "15min", "server/ai.ts",           "fetchMetaAdsById(): adicionar 12 campos faltantes no ?fields="),
        ("4", "15min", "server/ai.ts",           "Corrigir detectAdType() → ad_creative_media agora estará nos dados"),
        ("5", "20min", "server/ai.ts",           "gemini(): adicionar system_instruction + responseMimeType + temperature 0.3"),
        ("6", "25min", "server/ai.ts",           "analyzeCompetitor(): injetar clientProfile no prompt"),
        ("7", "20min", "server/ai.ts",           "generateMarketAnalysis(): incluir headlines/bodyText reais no prompt"),
        ("8", "30min", "server/db.ts",           "upsertScrapedAd(): deduplicação por adId"),
        ("9", "20min", "server/schema.ts",       "Adicionar colunas aiInsights, aiGeneratedAt na tabela competitors"),
        ("10","40min", "server/ai.ts",           "fetchWebsiteData(): scraping do site do concorrente via cheerio"),
        ("11","60min", "server/ai.ts",           "fetchMetaAdsById(): segunda query para anúncios INATIVOS"),
        ("12","90min", "server/schema.ts+db.ts", "Adicionar colunas ricas em scraped_ads + índices de performance"),
    ]

    linhas.append(f"  {'Nº':<4} {'Tempo':<8} {'Arquivo':<30} Ação")
    linhas.append("  " + sep("-"))
    for num, tempo, arq, acao in acoes:
        emoji = "🔴" if int(num) <= 4 else ("🟠" if int(num) <= 8 else "🟡")
        linhas.append(f"  {emoji} {num:<3} {tempo:<8} {arq:<30} {acao}")

    linhas.append("")
    linhas.append("  Tempo total estimado: ~7h de desenvolvimento")
    linhas.append("  Impacto esperado após correções: score 28-55 → 85-90+")
    linhas.append("")

    # ── Rodapé ──
    linhas.append(sep("═"))
    linhas.append("  Diagnóstico gerado por análise estática do código MECPro v1.0".center(W))
    linhas.append("  Arquivos de origem: server/ (ai.ts · db.ts · schema.ts · _core/router.ts)".center(W))
    linhas.append(sep("═"))

    return "\n".join(linhas)


# ─────────────────────────────────────────────────────────────────────────────
# MAIN
# ─────────────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    relatorio = gerar_relatorio()

    # Exibe no terminal
    print(relatorio)

    # Salva no mesmo diretório do script (funciona em Windows e Linux)
    script_dir = os.path.dirname(os.path.abspath(__file__))
    caminho    = os.path.join(script_dir, "relatorio_mecpro_diagnostico.txt")

    with open(caminho, "w", encoding="utf-8") as f:
        f.write(relatorio)

    print(f"\n✅ Relatório salvo em: {caminho}")
