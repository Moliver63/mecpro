import "dotenv/config";
import { log } from "./logger";
import * as db from "./db";
import type { CampaignCreative } from "../shared/campaignCreative.schema";
import { syncCreativeTextToV2, syncCreativeImageToV2 } from "../shared/campaignCreative.sync";
import { scoreCreativeList } from "./creativeScoringEngine";
import { generateAdImage, getImageGenerationDiagnostics, type CreativeImageFormat, type ImageProvider } from "./imageGeneration";

// ── Google Ads API — busca keywords e insights do concorrente ────────────────
async function fetchGoogleCompetitorInsights(
  competitorId: number,
  projectId:    number,
  compName:     string,
  websiteUrl:   string | null | undefined,
  userId:       number | null | undefined,
): Promise<boolean> {
  try {
    // Busca integração Google Ads do usuário
    const googleInt = userId ? await db.getApiIntegration(userId, "google") : null;
    if (!googleInt) {
      log.info("ai", "[Google] Sem integração Google Ads — pulando", { competitorId });
      return false;
    }

    const developerToken = (googleInt as any).developerToken || process.env.GOOGLE_ADS_DEVELOPER_TOKEN;
    const customerId     = ((googleInt as any).accountId || process.env.GOOGLE_ADS_CUSTOMER_ID || "").replace(/-/g, "");
    const refreshToken   = (googleInt as any).refreshToken;
    const clientId       = (googleInt as any).appId       || process.env.GOOGLE_ADS_CLIENT_ID;
    const clientSecret   = (googleInt as any).appSecret   || process.env.GOOGLE_ADS_CLIENT_SECRET;

    if (!developerToken || !customerId) {
      log.info("ai", "[Google] Credenciais incompletas — pulando", { competitorId });
      return false;
    }

    // Obtém access token via refresh
    let accessToken = (googleInt as any).accessToken || "";
    if (refreshToken && clientId && clientSecret) {
      try {
        const params = new URLSearchParams({
          client_id:     clientId,
          client_secret: clientSecret,
          refresh_token: refreshToken,
          grant_type:    "refresh_token",
        });
        const tokenRes  = await fetch("https://oauth2.googleapis.com/token", {
          method:  "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          bodyText:   params,
          signal:  AbortSignal.timeout(10000),
        });
        const tokenData: any = await tokenRes.json();
        if (tokenData.access_token) accessToken = tokenData.access_token;
      } catch (e: any) {
        log.warn("ai", "[Google] Falha ao renovar token", { message: e?.message });
      }
    }

    if (!accessToken) {
      log.warn("ai", "[Google] Sem access token válido", {
        competitorId,
        hasRefreshToken: !!refreshToken,
        hasClientId:     !!clientId,
        hasClientSecret: !!clientSecret,
        tip: !refreshToken ? "Configure Refresh Token em Configurações → Google Ads"
           : !clientId ? "Configure Client ID em Configurações → Google Ads"
           : "Falha ao renovar token — verifique Client Secret",
      });
      return false;
    }

    // ── Keyword Planner — busca palavras-chave relacionadas ao concorrente ──
    // Usa o nome do concorrente e o site (se disponível) como seed
    const seeds: any[] = [];
    if (websiteUrl) seeds.push({ url: websiteUrl.replace(/^https?:\/\//, "") });
    seeds.push({ keyword: compName });
    if (seeds.length === 0) return false;

    const kpUrl = `https://googleads.googleapis.com/v18/customers/${customerId}:generateKeywordIdeas`;
    const kpBody = {
      keywordSeed:        { keywords: [compName] },
      urlSeed:            websiteUrl ? { url: websiteUrl } : undefined,
      language:           "languageConstants/1014", // Português
      geoTargetConstants: ["geoTargetConstants/2076"], // Brasil
      includeAdultKeywords: false,
      keywordPlanNetwork: "GOOGLE_SEARCH",
      pageSize: 20,
    };

    log.info("ai", "[Google] Keyword Planner iniciado", { competitorId, compName, websiteUrl });

    const kpRes = await fetch(kpUrl, {
      method:  "POST",
      headers: {
        "Content-Type":    "application/json",
        "Authorization":   `Bearer ${accessToken}`,
        "developer-token": developerToken,
        "login-customer-id": customerId,
      },
      body:   JSON.stringify(kpBody),
      signal: AbortSignal.timeout(15000),
    });

    // ── Safe JSON parsing — evita "Unexpected token '<'" se API retornar HTML ──
    const contentType = kpRes.headers.get("content-type") || "";
    if (!contentType.includes("application/json")) {
      const text = await kpRes.text().catch(() => "");
      log.warn("ai", "[Google] Keyword Planner retornou não-JSON", {
        status:      kpRes.status,
        contentType,
        preview:     text.slice(0, 200),
        tip:         kpRes.status === 401 ? "Token expirado — reconecte Google Ads em Configurações"
                   : kpRes.status === 403 ? "Developer Token sem permissão — solicite Basic Access no API Center"
                   : `HTTP ${kpRes.status}`,
      });
      return false;
    }

    const kpData: any = await kpRes.json().catch(() => ({}));

    if (!kpRes.ok || kpData.error) {
      const errMsg = kpData.error?.message || kpData.error?.details?.[0]?.message || JSON.stringify(kpData).slice(0, 300);
      log.warn("ai", "[Google] Keyword Planner erro", {
        status:  kpRes.status,
        message: errMsg,
        code:    kpData.error?.code,
      });
      return false;
    }

    const results = kpData.results || [];
    if (results.length === 0) {
      log.info("ai", "[Google] Keyword Planner sem resultados", { competitorId });
      return false;
    }

    // Converte os resultados em "anúncios" para o banco
    // Cada keyword vira um registro com fonte "google_keyword_planner"
    let saved = 0;
    for (const kw of results.slice(0, 15)) {
      const text    = kw.text || "";
      const avgMCpc = kw.keywordIdeaMetrics?.averageCpc?.value;
      const monthly = kw.keywordIdeaMetrics?.avgMonthlySearches;
      const comp    = kw.keywordIdeaMetrics?.competition; // LOW/MEDIUM/HIGH

      if (!text) continue;

      const cpcBRL = avgMCpc ? `R$ ${(Number(avgMCpc) / 1_000_000).toFixed(2)}` : "N/A";
      const vol    = monthly ? `${Number(monthly).toLocaleString("pt-BR")} buscas/mês` : "";
      const compLabel = comp === "HIGH" ? "🔴 Alta" : comp === "MEDIUM" ? "🟡 Média" : "🟢 Baixa";

      try {
        await db.upsertScrapedAd({
          competitorId,
          projectId,
          headline:    text,
          bodyText:    `Volume: ${vol} | CPC médio: ${cpcBRL} | Competição: ${compLabel}`,
          imageUrl:    null,
          videoUrl:    null,
          landingPageUrl:  `https://ads.google.com/aw/keywordplanner/ideas/list`,
          adType:      "google_keyword_planner",
          platform:    "google",
          isActive:    true,
          startDate: new Date(),
          rawData:     JSON.stringify({ text, avgCpc: avgMCpc, monthlySearches: monthly, competition: comp }),
        });
        saved++;
      } catch (e: any) {
        log.warn("ai", "[Google] Erro ao salvar keyword", { text, message: e?.message });
      }
    }

    log.info("ai", "[Google] Keyword Planner OK", { competitorId, saved, total: results.length });
    if (saved > 0) return true;

    // ── Fallback: Google Ads Transparency (sem Keyword Planner) ──────────────
    return await fetchGoogleTransparencyInsights(competitorId, projectId, compName, websiteUrl, accessToken, developerToken, customerId);

  } catch (e: any) {
    log.warn("ai", "[Google] fetchGoogleCompetitorInsights erro", { competitorId, message: e?.message });
    // Tenta Google Transparency mesmo sem Keyword Planner
    try {
      const googleInt2 = userId ? await db.getApiIntegration(userId, "google") : null;
      if (googleInt2) {
        const at2 = (googleInt2 as any).accessToken || "";
        const dt2 = (googleInt2 as any).developerToken || process.env.GOOGLE_ADS_DEVELOPER_TOKEN || "";
        const cid2 = ((googleInt2 as any).accountId || process.env.GOOGLE_ADS_CUSTOMER_ID || "").replace(/-/g, "");
        return await fetchGoogleTransparencyInsights(competitorId, projectId, compName, websiteUrl, at2, dt2, cid2);
      }
    } catch {}
    return false;
  }
}

// ── Google Transparency + Search API — insights sem Keyword Planner ──────────
async function fetchGoogleTransparencyInsights(
  competitorId: number,
  projectId:    number,
  compName:     string,
  websiteUrl:   string | null | undefined,
  accessToken:  string,
  developerToken: string,
  customerId:   string,
): Promise<boolean> {
  let saved = 0;

  // ── 1. Google Ads Transparency Center API ──────────────────────────────────
  // Busca anúncios reais veiculados pelo concorrente no Google
  try {
    log.info("ai", "[Google] Transparency Center iniciado", { competitorId, compName });
    const domain = websiteUrl
      ? (() => { try { return new URL(websiteUrl).hostname.replace(/^www\./, ""); } catch { return null; } })()
      : null;

    const searchTerm = domain || compName;
    const transUrl = `https://adstransparency.google.com/api/advertiser/search?query=${encodeURIComponent(searchTerm)}&region=BR&format=json`;

    const transRes = await fetch(transUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; Googlebot/2.1)",
        "Accept": "application/json",
      },
      signal: AbortSignal.timeout(10000),
    });

    if (transRes.ok) {
      const text = await transRes.text();
      // Ads Transparency retorna JSONP ou JSON com advertisers
      const jsonMatch = text.match(/\{[\s\S]+\}/);
      if (jsonMatch) {
        try {
          const transData = JSON.parse(jsonMatch[0]);
          const advertisers = transData?.advertisers || transData?.results || [];
          const nameSlug = compName.toLowerCase().replace(/[^a-z0-9]/g, "");

          for (const adv of advertisers.slice(0, 5)) {
            const advName = adv.displayName || adv.name || "";
            const advSlug = advName.toLowerCase().replace(/[^a-z0-9]/g, "");
            if (!advSlug.includes(nameSlug.slice(0, 5)) && !nameSlug.includes(advSlug.slice(0, 5))) continue;

            await db.upsertScrapedAd({
              competitorId, projectId,
              headline:   advName,
              bodyText:   `Anunciante verificado no Google Ads Transparency | Domínio: ${domain || compName}`,
              imageUrl:   null, videoUrl: null,
              landingPageUrl: `https://adstransparency.google.com/advertiser/${adv.advertiserId || ""}`,
              adType:     "google_transparency",
              platform:   "google",
              isActive:   true,
              startDate: new Date(),
              rawData:    JSON.stringify({ advertiserId: adv.advertiserId, verified: true, source: "google_transparency" }),
            });
            saved++;
            log.info("ai", "[Google] Transparency advertiser encontrado", { competitorId, advName, advertiserId: adv.advertiserId });
          }
        } catch {}
      }
    }
  } catch (e: any) {
    log.info("ai", "[Google] Transparency erro", { message: e?.message?.slice(0, 80) });
  }

  // ── 2. Google Custom Search API — busca pública de anúncios ───────────────
  // Usa GOOGLE_API_KEY + GOOGLE_CSE_ID se configurados, ou busca pública
  try {
    const googleApiKey = process.env.GOOGLE_API_KEY || process.env.GOOGLE_CLIENT_ID;
    const cseId = process.env.GOOGLE_CSE_ID;
    const domain = websiteUrl ? (() => { try { return new URL(websiteUrl).hostname; } catch { return null; } })() : null;
    const queries = [
      `site:${domain} anúncio`,
      `"${compName}" publicidade Google`,
      `"${compName}" imóveis comprar alugar`,
    ].filter(Boolean).slice(0, 2);

    for (const q of queries) {
      if (saved >= 5) break;
      let searchUrl = "";
      if (googleApiKey && cseId) {
        searchUrl = `https://www.googleapis.com/customsearch/v1?key=${googleApiKey}&cx=${cseId}&q=${encodeURIComponent(q)}&num=5&lr=lang_pt`;
      } else {
        // Busca pública via scraping leve do Google
        searchUrl = `https://www.google.com/search?q=${encodeURIComponent(q)}&num=5&hl=pt-BR`;
      }

      try {
        const sRes = await fetch(searchUrl, {
          headers: { "User-Agent": "Mozilla/5.0 (compatible; Googlebot/2.1)", "Accept-Language": "pt-BR" },
          signal: AbortSignal.timeout(8000),
        });

        if (googleApiKey && cseId && sRes.ok) {
          const sData: any = await sRes.json().catch(() => ({}));
          const items = sData.items || [];
          for (const item of items.slice(0, 3)) {
            await db.upsertScrapedAd({
              competitorId, projectId,
              headline:   item.title || q,
              bodyText:   item.snippet || "",
              imageUrl:   item.pagemap?.cse_image?.[0]?.src || null,
              videoUrl:   null,
              landingPageUrl: item.link || searchUrl,
              adType:     "google_search",
              platform:   "google",
              isActive:   true,
              startDate: new Date(),
              rawData:    JSON.stringify({ query: q, source: "google_custom_search" }),
            });
            saved++;
          }
          log.info("ai", "[Google] Custom Search OK", { competitorId, q, count: items.length });
        }
      } catch (e2: any) {
        log.info("ai", "[Google] Search query erro", { q, message: e2?.message?.slice(0, 60) });
      }
    }
  } catch (e: any) {
    log.info("ai", "[Google] Custom Search erro", { message: e?.message?.slice(0, 80) });
  }

  // ── 3. Google Ads API — Auction Insights (concorrentes do usuário) ─────────
  // Lista quais domínios competem com o usuário nos leilões do Google Ads
  if (accessToken && developerToken && customerId) {
    try {
      log.info("ai", "[Google] Auction Insights iniciado", { competitorId, compName });
      const auctionQuery = `SELECT auction_insight.display_name, auction_insight.impression_share, auction_insight.overlap_rate, auction_insight.outranking_share FROM auction_insight_campaign WHERE segments.date DURING LAST_30_DAYS LIMIT 20`;

      const auctionRes = await fetch(
        `https://googleads.googleapis.com/v17/customers/${customerId}/googleAds:search`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${accessToken}`,
            "developer-token": developerToken,
            "login-customer-id": customerId,
          },
          body: JSON.stringify({ query: auctionQuery }),
          signal: AbortSignal.timeout(15000),
        }
      );

      if (auctionRes.ok) {
        const aData: any = await auctionRes.json().catch(() => ({}));
        const rows = aData.results || [];
        const nameSlug = compName.toLowerCase().replace(/[^a-z0-9]/g, "");

        for (const row of rows) {
          const displayName = row.auctionInsight?.displayName || "";
          const dSlug = displayName.toLowerCase().replace(/[^a-z0-9]/g, "");
          if (!dSlug.includes(nameSlug.slice(0, 4)) && !nameSlug.includes(dSlug.slice(0, 4))) continue;

          const impShare = row.auctionInsight?.impressionShare;
          const overlapRate = row.auctionInsight?.overlapRate;
          const outrankShare = row.auctionInsight?.outrankingShare;

          await db.upsertScrapedAd({
            competitorId, projectId,
            headline:   `${displayName} — Google Ads Auction Insights`,
            bodyText:   `Impression Share: ${impShare ? (Number(impShare)*100).toFixed(1)+"%" : "N/A"} | Overlap Rate: ${overlapRate ? (Number(overlapRate)*100).toFixed(1)+"%" : "N/A"} | Outranking Share: ${outrankShare ? (Number(outrankShare)*100).toFixed(1)+"%" : "N/A"}`,
            imageUrl:   null, videoUrl: null,
            landingPageUrl: `https://ads.google.com/aw/campaigns`,
            adType:     "google_auction_insights",
            platform:   "google",
            isActive:   true,
            startDate: new Date(),
            rawData:    JSON.stringify({ displayName, impShare, overlapRate, outrankShare, source: "google_auction_insights" }),
          });
          saved++;
          log.info("ai", "[Google] Auction Insights match", { competitorId, displayName });
        }

        if (rows.length > 0) {
          log.info("ai", "[Google] Auction Insights OK", { competitorId, rows: rows.length, matched: saved });
        }
      } else {
        const errText = await auctionRes.text().catch(() => "");
        log.info("ai", "[Google] Auction Insights HTTP erro", { status: auctionRes.status, preview: errText.slice(0, 150) });
      }
    } catch (e: any) {
      log.info("ai", "[Google] Auction Insights erro", { message: e?.message?.slice(0, 80) });
    }
  }

  // ── 4. Google Knowledge Graph API — dados públicos da empresa ─────────────
  try {
    const kgKey = process.env.GOOGLE_API_KEY;
    if (kgKey) {
      const kgUrl = `https://kgsearch.googleapis.com/v1/entities:search?query=${encodeURIComponent(compName)}&key=${kgKey}&limit=3&indent=True&languages=pt`;
      const kgRes = await fetch(kgUrl, { signal: AbortSignal.timeout(8000) });
      if (kgRes.ok) {
        const kgData: any = await kgRes.json().catch(() => ({}));
        const items = kgData.itemListElement || [];
        for (const item of items.slice(0, 2)) {
          const entity = item.result || {};
          const desc = entity.description || entity.detailedDescription?.articleBody || "";
          if (!desc) continue;

          await db.upsertScrapedAd({
            competitorId, projectId,
            headline:   entity.name || compName,
            bodyText:   desc.slice(0, 500),
            imageUrl:   entity.image?.contentUrl || null,
            videoUrl:   null,
            landingPageUrl: entity.url || entity.detailedDescription?.url || "",
            adType:     "google_knowledge_graph",
            platform:   "google",
            isActive:   true,
            startDate: new Date(),
            rawData:    JSON.stringify({ entityId: entity["@id"], types: entity["@type"], source: "google_knowledge_graph" }),
          });
          saved++;
          log.info("ai", "[Google] Knowledge Graph OK", { competitorId, name: entity.name, desc: desc.slice(0, 60) });
        }
      }
    }
  } catch (e: any) {
    log.info("ai", "[Google] Knowledge Graph erro", { message: e?.message?.slice(0, 80) });
  }

  log.info("ai", "[Google] fetchGoogleTransparencyInsights concluído", { competitorId, saved });
  return saved > 0;
}

const GEMINI_API_KEY  = process.env.GEMINI_API_KEY;
const GEMINI_API_KEY2 = process.env.GEMINI_API_KEY_2;  // chave de fallback (opcional)
const GEMINI_API_KEY3 = process.env.GEMINI_API_KEY_3;  // chave adicional (opcional)

// ── Semáforo para limitar chamadas Gemini simultâneas ───────────────────────
// Evita estourar a quota quando muitas análises rodam ao mesmo tempo
let _geminiConcurrent = 0;
const GEMINI_MAX_CONCURRENT = 3; // máximo 3 chamadas simultâneas

async function withGeminiSemaphore<T>(fn: () => Promise<T>): Promise<T> {
  const MAX_WAIT = 30000; // espera no máximo 30s para entrar
  const start = Date.now();
  while (_geminiConcurrent >= GEMINI_MAX_CONCURRENT) {
    if (Date.now() - start > MAX_WAIT) throw new Error("Gemini semaphore timeout");
    await new Promise(r => setTimeout(r, 500));
  }
  _geminiConcurrent++;
  try {
    return await fn();
  } finally {
    _geminiConcurrent--;
  }
}

// ── Rotação inteligente de chaves Gemini ─────────────────────────────────
// Rastreia chaves com quota esgotada e evita reutilizá-las até reset
const _exhaustedKeys = new Set<string>();
const _exhaustedAt   = new Map<string, number>();
const QUOTA_RESET_MS = 60 * 60 * 1000; // 1 hora — tempo estimado de reset do Google

// ── Cache de resultados Gemini para evitar chamadas repetidas ────────────────
// Evita que o mesmo concorrente/prompt seja analisado várias vezes em sequência
const _geminiCache = new Map<string, { result: string; ts: number }>();
const GEMINI_CACHE_TTL = 5 * 60 * 1000; // 5 minutos

function getCachedGemini(key: string): string | null {
  const entry = _geminiCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.ts > GEMINI_CACHE_TTL) {
    _geminiCache.delete(key);
    return null;
  }
  return entry.result;
}

function setCachedGemini(key: string, result: string) {
  // Limita cache a 50 entradas para não consumir memória
  if (_geminiCache.size >= 50) {
    const firstKey = _geminiCache.keys().next().value;
    if (firstKey) _geminiCache.delete(firstKey);
  }
  _geminiCache.set(key, { result, ts: Date.now() });
}

function getGeminiKey(attempt = 0): string | undefined {
  const allKeys = [GEMINI_API_KEY, GEMINI_API_KEY2, GEMINI_API_KEY3].filter(Boolean) as string[];
  if (allKeys.length === 0) return undefined;

  // Limpa chaves que já passaram do tempo de reset
  const now = Date.now();
  for (const [key, ts] of _exhaustedAt.entries()) {
    if (now - ts > QUOTA_RESET_MS) {
      _exhaustedKeys.delete(key);
      _exhaustedAt.delete(key);
      log.info("ai", "Gemini key quota reset — reativando chave", { keyPrefix: key.slice(0, 8) });
    }
  }

  // Filtra chaves disponíveis (não esgotadas)
  const availableKeys = allKeys.filter(k => !_exhaustedKeys.has(k));

  if (availableKeys.length === 0) {
    // Todas esgotadas — usa a primeira mesmo assim (fallback)
    log.warn("ai", "Todas as chaves Gemini com quota esgotada — usando chave primária como fallback");
    return allKeys[0];
  }

  return availableKeys[attempt % availableKeys.length];
}

function markGeminiKeyExhausted(key: string) {
  if (!key) return;
  _exhaustedKeys.add(key);
  _exhaustedAt.set(key, Date.now());
  log.warn("ai", "Gemini key marcada como esgotada", {
    keyPrefix: key.slice(0, 8),
    totalExhausted: _exhaustedKeys.size,
    availableKeys: [GEMINI_API_KEY, GEMINI_API_KEY2, GEMINI_API_KEY3]
      .filter(Boolean)
      .filter(k => !_exhaustedKeys.has(k!)).length,
  });
}


// ══════════════════════════════════════════════════════════════════════════
// META ADS COMPLIANCE ENGINE — Políticas Meta 2025/2026
// Atualizado: Mar/2026 | Fonte: https://www.facebook.com/policies/ads/
// ══════════════════════════════════════════════════════════════════════════

const META_PROHIBITED_WORDS: string[] = [
  // Saúde / Claims médicos proibidos
  "cure","cura","milagre","miracle","garantido","100% eficaz","elimina definitivamente",
  "tratamento definitivo","elimina para sempre",
  "queima gordura","detox milagroso",
  // Financeiro
  "renda garantida","ganhe dinheiro fácil","fique rico","enriqueça rápido",
  "retorno garantido","sem risco","lucro garantido","dinheiro fácil",
  "renda extra garantida","investimento seguro 100%",
  // Clickbait proibido
  "você não vai acreditar","chocante","inacreditável","segredo revelado",
  "médicos odeiam","eles não querem que você saiba",
];

const META_SENSITIVE_WORDS: string[] = [
  "emagrecimento","perda de peso","dieta","antes e depois",
  "crédito","empréstimo","financiamento","ganho","lucro",
  "criptomoeda","bitcoin","forex","trading","investimento",
  "cirurgia","procedimento estético","botox","lipoaspiração",
];

export const META_POLICY_RULES_2026 = `
POLÍTICAS META ADS 2026 — REGRAS CRÍTICAS:

1. CLAIMS PROIBIDOS: Nunca prometer resultados específicos de saúde ou financeiros garantidos.
   Nunca usar "antes e depois" em saúde/beleza. Nunca claims comparativos não comprovados.

2. SEGMENTAÇÃO: Proibido segmentar por condição de saúde, etnia, religião ou orientação sexual.
   Crédito/Emprego/Imóveis têm restrições especiais de faixa etária e localização.

3. IMAGENS: Proibido "antes e depois" de procedimentos estéticos. Texto em imagem: máx 20%.
   Proibido imagens enganosas ou editadas para parecer conteúdo orgânico.

4. COPY: Proibido CAPS LOCK excessivo. Proibido emojis excessivos (>6 por anúncio).
   Proibido falsa urgência ("últimas 2 vagas — expira em 10min").
   Proibido clickbait e linguagem pessoal implícita ("Sabemos que você tem diabetes").

5. LANDING PAGE: Página deve corresponder ao anúncio. Sem pop-ups que impeçam saída.
   URL exibida deve ser a URL real.

6. CATEGORIAS ESPECIAIS (requerem declaração prévia na Meta):
   Crédito, Habitação, Emprego, Saúde, Medicamentos, Produtos Financeiros, Jogos de Azar.

7. OBJETIVOS: OUTCOME_LEADS requer política de privacidade clara na landing page.
   OUTCOME_SALES: pixel de conversão obrigatório para melhor performance.
`;

// ── Validador de compliance ───────────────────────────────────────────────
export function validateMetaCompliance(text: string): {
  score: "safe" | "warning" | "danger";
  issues: string[];
  suggestions: string[];
} {
  const lower = text.toLowerCase();
  const issues: string[] = [];
  const suggestions: string[] = [];

  for (const word of META_PROHIBITED_WORDS) {
    if (lower.includes(word.toLowerCase())) {
      issues.push(`Palavra/frase proibida pela Meta: "${word}"`);
      suggestions.push(`Substitua "${word}" por linguagem de benefício real`);
    }
  }
  for (const word of META_SENSITIVE_WORDS) {
    if (lower.includes(word.toLowerCase())) {
      suggestions.push(`Termo sensível: "${word}" — pode requerer revisão manual da Meta`);
    }
  }
  const capsRatio = (text.match(/[A-ZÁÉÍÓÚÀÈÌÒÙÂÊÎÔÛÃÕÇ]/g) || []).length / (text.length || 1);
  if (capsRatio > 0.3) {
    issues.push("Uso excessivo de CAPS LOCK (>30% do texto)");
    suggestions.push("Reduza maiúsculas — use apenas para ênfase pontual");
  }
  const urgencyTest = /últimas?\s+\d+\s+vagas?|expira\s+em\s+\d+|apenas\s+(hoje|agora)|somente\s+hoje/i;
  if (urgencyTest.test(text)) {
    issues.push("Falsa urgência detectada — proibida pela Meta");
    suggestions.push("Use datas reais ao invés de urgência artificial");
  }
  const score = issues.length === 0 ? "safe" : issues.length <= 2 ? "warning" : "danger";
  return { score, issues, suggestions };
}

// ── Benchmarks reais por nicho — fontes: Meta Business Insights, WordStream, Google Ads BR 2025 ──
const MARKET_NICHE_BENCHMARKS: Record<string, {
  cpc: [number, number];   // R$ min-max
  cpl: [number, number];   // R$ min-max
  cpa: [number, number];   // R$ min-max
  cpm: [number, number];   // R$ min-max
  ctr: [number, number];   // % min-max
  roas: [number, number];  // min-max
  label: string;
}> = {
  // Imóveis / Real Estate
  "imoveis":        { cpc:[3.50,8.00],  cpl:[45,150],   cpa:[800,3000],  cpm:[18,40],  ctr:[0.8,2.2],  roas:[3,8],   label:"Imóveis" },
  "imobiliaria":    { cpc:[3.50,8.00],  cpl:[45,150],   cpa:[800,3000],  cpm:[18,40],  ctr:[0.8,2.2],  roas:[3,8],   label:"Imóveis" },
  "alto padrao":    { cpc:[5.00,12.00], cpl:[80,250],   cpa:[1500,5000], cpm:[25,60],  ctr:[0.6,1.8],  roas:[4,10],  label:"Imóveis Alto Padrão" },
  // Educação / Cursos
  "educacao":       { cpc:[1.20,3.50],  cpl:[12,45],    cpa:[80,300],    cpm:[8,20],   ctr:[1.5,4.0],  roas:[5,15],  label:"Educação" },
  "curso":          { cpc:[1.20,3.50],  cpl:[12,45],    cpa:[80,300],    cpm:[8,20],   ctr:[1.5,4.0],  roas:[5,15],  label:"Cursos Online" },
  "infoproduto":    { cpc:[0.80,2.50],  cpl:[8,30],     cpa:[40,180],    cpm:[6,15],   ctr:[2.0,5.0],  roas:[6,20],  label:"Infoproduto" },
  // Saúde / Beleza
  "saude":          { cpc:[1.50,4.00],  cpl:[15,50],    cpa:[100,400],   cpm:[10,25],  ctr:[1.2,3.5],  roas:[4,12],  label:"Saúde" },
  "estetica":       { cpc:[1.00,3.00],  cpl:[10,35],    cpa:[60,200],    cpm:[8,18],   ctr:[1.8,4.5],  roas:[5,14],  label:"Estética" },
  "clinica":        { cpc:[2.00,5.00],  cpl:[20,70],    cpa:[150,500],   cpm:[12,30],  ctr:[1.0,2.8],  roas:[3,9],   label:"Clínica" },
  // E-commerce / Varejo
  "ecommerce":      { cpc:[0.60,2.00],  cpl:[5,20],     cpa:[25,120],    cpm:[5,14],   ctr:[2.5,6.0],  roas:[4,15],  label:"E-commerce" },
  "moda":           { cpc:[0.50,1.80],  cpl:[4,15],     cpa:[20,80],     cpm:[4,12],   ctr:[2.0,5.5],  roas:[3,10],  label:"Moda" },
  "varejo":         { cpc:[0.50,1.80],  cpl:[4,15],     cpa:[20,80],     cpm:[4,12],   ctr:[2.0,5.5],  roas:[3,10],  label:"Varejo" },
  // Serviços B2B
  "b2b":            { cpc:[4.00,10.00], cpl:[60,200],   cpa:[500,2000],  cpm:[20,50],  ctr:[0.5,1.5],  roas:[3,8],   label:"B2B" },
  "tecnologia":     { cpc:[3.00,8.00],  cpl:[40,150],   cpa:[300,1200],  cpm:[15,40],  ctr:[0.8,2.0],  roas:[4,10],  label:"Tecnologia" },
  "saas":           { cpc:[3.50,9.00],  cpl:[50,180],   cpa:[400,1500],  cpm:[18,45],  ctr:[0.6,1.8],  roas:[3,8],   label:"SaaS" },
  // Financeiro / Seguros
  "financeiro":     { cpc:[5.00,15.00], cpl:[80,300],   cpa:[600,2500],  cpm:[25,65],  ctr:[0.5,1.5],  roas:[3,7],   label:"Financeiro" },
  "seguro":         { cpc:[4.00,12.00], cpl:[60,220],   cpa:[400,1800],  cpm:[20,55],  ctr:[0.6,1.8],  roas:[3,8],   label:"Seguros" },
  // Alimentação
  "restaurante":    { cpc:[0.80,2.50],  cpl:[8,25],     cpa:[15,60],     cpm:[6,16],   ctr:[2.0,5.0],  roas:[3,8],   label:"Restaurante" },
  "alimentacao":    { cpc:[0.70,2.20],  cpl:[6,22],     cpa:[12,50],     cpm:[5,14],   ctr:[2.2,5.5],  roas:[3,9],   label:"Alimentação" },
  // Fitness / Academia
  "academia":       { cpc:[1.00,3.00],  cpl:[10,35],    cpa:[50,180],    cpm:[7,18],   ctr:[1.5,4.0],  roas:[4,11],  label:"Academia/Fitness" },
  "fitness":        { cpc:[1.00,3.00],  cpl:[10,35],    cpa:[50,180],    cpm:[7,18],   ctr:[1.5,4.0],  roas:[4,11],  label:"Fitness" },
  // Default genérico
  "default":        { cpc:[1.50,4.00],  cpl:[15,50],    cpa:[100,400],   cpm:[10,25],  ctr:[1.2,3.5],  roas:[4,10],  label:"Geral" },
};

// ── Meta Insights API — busca métricas reais da conta do usuário ──
// Aceita token e accountId do projeto/usuário (multi-tenant)
export async function fetchMetaInsightsBenchmarks(
  tokenOverride?: string,
  accountIdOverride?: string
): Promise<{
  cpc: number; cpl: number; cpm: number; ctr: number; roas: number;
  spend: number; impressions: number; clicks: number; leads: number;
  updatedAt: string; source: string;
} | null> {
  // Prioriza credenciais do projeto/usuário, cai para .env como fallback de dev
  const token     = tokenOverride     || process.env.META_ACCESS_TOKEN;
  const accountId = accountIdOverride || process.env.META_AD_ACCOUNT_ID;
  if (!token || !accountId) return null;

  try {
    // Busca insights dos últimos 30 dias da conta
    const fields = [
      "spend", "impressions", "clicks", "cpc", "cpm", "ctr",
      "cost_per_unique_click", "actions", "action_values", "purchase_roas"
    ].join(",");

    const url = `https://graph.facebook.com/v19.0/${accountId}/insights` +
      `?fields=${fields}&date_preset=last_30d&level=account&access_token=${token}`;

    const res  = await fetch(url);
    const data = await res.json() as any;

    if (data.error) {
      log.warn("ai", "Meta Insights API error", { error: data.error.message });
      return null;
    }

    const d = data.data?.[0];
    if (!d) return null;

    // Extrai CPL das actions (lead = formulário preenchido)
    const leadAction = d.actions?.find((a: any) =>
      ["lead", "offsite_conversion.fb_pixel_lead", "onsite_conversion.lead_grouped"].includes(a.action_type)
    );
    const leadCount = leadAction ? Number(leadAction.value) : 0;
    const spend     = Number(d.spend || 0);
    const cpl       = leadCount > 0 ? spend / leadCount : 0;

    // Extrai ROAS das purchase_roas
    const roas = d.purchase_roas?.[0]?.value ? Number(d.purchase_roas[0].value) : 0;

    log.info("ai", "Meta Insights fetched", {
      spend, cpc: d.cpc, cpm: d.cpm, ctr: d.ctr, cpl, roas
    });

    return {
      cpc:         Number(d.cpc  || 0),
      cpl:         cpl,
      cpm:         Number(d.cpm  || 0),
      ctr:         Number(d.ctr  || 0),
      roas:        roas,
      spend:       spend,
      impressions: Number(d.impressions || 0),
      clicks:      Number(d.clicks || 0),
      leads:       leadCount,
      updatedAt:   new Date().toISOString(),
      source:      "Meta Ads Insights API — últimos 30 dias",
    };
  } catch (e: any) {
    log.warn("ai", "Meta Insights fetch error", { message: e.message });
    return null;
  }
}

function resolveNicheBenchmarks(niche: string) {
  if (!niche) return MARKET_NICHE_BENCHMARKS["default"];
  const n = niche.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  // Tenta match exato primeiro
  for (const key of Object.keys(MARKET_NICHE_BENCHMARKS)) {
    if (n.includes(key)) return MARKET_NICHE_BENCHMARKS[key];
  }
  return MARKET_NICHE_BENCHMARKS["default"];
}

// ── Motor de Estimativa de Gasto do Concorrente ───────────────────────────────
// Baseado em dados públicos da Meta Ads Library:
// - Número de anúncios ativos
// - Tempo de veiculação (dias no ar)
// - Formato dos criativos (vídeo = CPM maior)
// - Faixa de impressões reportada pela Meta
// - CPM médio do nicho

export function estimateCompetitorSpend(ads: any[], niche: string): {
  monthlyMin:    number;
  monthlyMax:    number;
  monthlyMid:    number;
  confidence:    "alta" | "media" | "baixa";
  methodology:   string;
  breakdown: {
    activeAds:       number;
    avgDaysRunning:  number;
    dominantFormat:  string;
    impressionRange: string;
    cpmUsed:         [number, number];
    estimatedImpressions: [number, number];
  };
} {
  const benchmarks = resolveNicheBenchmarks(niche);
  const now = Date.now();

  // 1. Filtra anúncios ativos
  const activeAds = ads.filter(a => a.isActive || a.isActive === 1);
  const totalAds  = activeAds.length || ads.length;

  // 2. Calcula dias médios de veiculação
  const daysRunning = ads
    .filter(a => a.startDate)
    .map(a => Math.max(1, Math.round((now - new Date(a.startDate).getTime()) / (1000 * 60 * 60 * 24))));
  const avgDays = daysRunning.length > 0
    ? Math.round(daysRunning.reduce((s, d) => s + d, 0) / daysRunning.length)
    : 30;

  // 3. Formato dominante (vídeo = CPM 30-50% maior)
  const formats = ads.map(a => a.adType || a.format || "image");
  const videoCount = formats.filter(f => f.toLowerCase().includes("video") || f === "VIDEO").length;
  const dominantFormat = videoCount > formats.length * 0.5 ? "video" : "image";
  const formatMultiplier = dominantFormat === "video" ? 1.4 : 1.0;

  // 4. Estima impressões por faixa reportada pela Meta
  // Meta reporta: "<1K", "1K-4.9K", "5K-9.9K", "10K-49.9K", "50K-199.9K", "200K-499.9K", "500K+"
  const impressionRanges: Record<string, [number, number]> = {
    "< 1000":    [100,    999],
    "1000-4999": [1000,   4999],
    "5000-9999": [5000,   9999],
    "10000-49999": [10000, 49999],
    "50000-199999": [50000, 199999],
    "200000-499999": [200000, 499999],
    "500000+":   [500000, 2000000],
  };

  // Pega a faixa de impressões mais comum nos anúncios
  const impressionFaixas = ads
    .map(a => a.impressions || a.impressionRange || "")
    .filter(Boolean);

  let estImpMin = 0;
  let estImpMax = 0;
  let impressionLabel = "Não informado";

  if (impressionFaixas.length > 0) {
    // Soma os ranges de impressões de todos os anúncios
    for (const faixa of impressionFaixas) {
      for (const [key, [min, max]] of Object.entries(impressionRanges)) {
        if (faixa.includes(key) || (typeof faixa === "string" && faixa.replace(/[^0-9]/g, "") >= String(min))) {
          estImpMin += min;
          estImpMax += max;
          break;
        }
      }
    }
    impressionLabel = `~${(estImpMin / 1000).toFixed(0)}K – ${(estImpMax / 1000).toFixed(0)}K impressões`;
  } else {
    // Fallback: estima por número de anúncios ativos × dias × impressões médias diárias por formato
    const dailyImprPerAd = dominantFormat === "video" ? 800 : 500;
    estImpMin = totalAds * avgDays * dailyImprPerAd * 0.7;
    estImpMax = totalAds * avgDays * dailyImprPerAd * 1.3;
    impressionLabel = "Estimado por volume de anúncios";
  }

  // 5. Calcula gasto estimado: Impressões × CPM / 1000
  const [cpmMin, cpmMax] = benchmarks.cpm;
  const cpmAdjMin = cpmMin * formatMultiplier;
  const cpmAdjMax = cpmMax * formatMultiplier;

  const spendMin = Math.round((estImpMin * cpmAdjMin) / 1000);
  const spendMax = Math.round((estImpMax * cpmAdjMax) / 1000);
  const spendMid = Math.round((spendMin + spendMax) / 2);

  // 6. Normaliza para mensal (30 dias)
  const monthlyFactor = avgDays > 0 ? 30 / Math.min(avgDays, 90) : 1;
  const monthlyMin = Math.round(spendMin * monthlyFactor);
  const monthlyMax = Math.round(spendMax * monthlyFactor);
  const monthlyMid = Math.round(spendMid * monthlyFactor);

  // 7. Confiança baseada na quantidade de dados
  const confidence: "alta" | "media" | "baixa" =
    totalAds >= 10 && daysRunning.length >= 5 ? "alta" :
    totalAds >= 3  && daysRunning.length >= 2 ? "media" : "baixa";

  return {
    monthlyMin,
    monthlyMax,
    monthlyMid,
    confidence,
    methodology: `Estimativa baseada em ${totalAds} anúncios (${activeAds.length} ativos), ` +
      `média de ${avgDays} dias no ar, formato dominante: ${dominantFormat}, ` +
      `CPM do nicho ${benchmarks.label}: R$ ${cpmAdjMin.toFixed(0)}-${cpmAdjMax.toFixed(0)}/mil impressões.`,
    breakdown: {
      activeAds:            activeAds.length,
      avgDaysRunning:       avgDays,
      dominantFormat,
      impressionRange:      impressionLabel,
      cpmUsed:              [Math.round(cpmAdjMin), Math.round(cpmAdjMax)],
      estimatedImpressions: [Math.round(estImpMin), Math.round(estImpMax)],
    },
  };
}

function fmtRange(range: [number, number], prefix = "R$ "): string {
  return `${prefix}${range[0].toFixed(2).replace(".", ",")} — ${prefix}${range[1].toFixed(2).replace(".", ",")}`;
}
// Cascata de modelos — evita previews expirados/inválidos em produção
const GEMINI_MODELS = [
  "gemini-2.5-flash-lite",   // 🥇 lite como primary — evita throttling constante
  "gemini-2.5-flash",        // 🥈 flash completo como fallback
  "gemini-2.0-flash",        // 🥉 2.0 — cota B separada da 2.5
  "gemini-2.0-flash-lite",   // 4º  2.0 lite — cota B
  "gemini-2.5-pro",          // 5º  2.5 pro — último recurso
];
const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/models";

// ── Toggle LLM Principal — controlado pelo painel Admin ──────────────────────
// "on"  = Gemini (melhor qualidade)
// "off" = Groq/Llama (fallback gratuito)
let _llmMode: "on" | "off" = "on";  // padrão: Gemini ligado

export function getLLMMode(): "on" | "off" { return _llmMode; }
export function setLLMMode(mode: "on" | "off") {
  _llmMode = mode;
  log.info("ai", `🔀 MECPro AI: ${mode === "on" ? "🟢 IA Categoria A ativada" : "🟡 IA Categoria B ativada"}`);
}

// Carrega configuração salva no banco na inicialização
export async function loadLLMModeFromDB() {
  try {
    const { getAdminSettings } = await import("./_core/../db.js");
    const settings = await getAdminSettings();
    if (settings["llm_mode"] === "off") {
      _llmMode = "off";
      log.info("ai", "MECPro AI: Categoria B carregada do banco");
    } else {
      log.info("ai", "MECPro AI: Categoria A carregada do banco");
    }
  } catch {
    log.info("ai", "MECPro AI: usando padrão (Categoria A)");
  }
}

// ── MECPro AI Service (Python/Groq) — motor externo gratuito ──
const MECPRO_AI_URL = process.env.MECPRO_AI_URL?.replace(/\/$/, "");

// Flag: HF Space confirma que DNS do Facebook está bloqueado naquele ambiente
// Setado automaticamente quando /scrape-ads-library retorna source="dns_blocked_hf"
// Reseta a cada 30 minutos para tentar novamente
let _hfDnsBlocked   = false;
let _hfDnsBlockedAt = 0;
const HF_DNS_RESET_MS = 30 * 60 * 1000;

function isHfDnsBlocked(): boolean {
  if (!_hfDnsBlocked) return false;
  if (Date.now() - _hfDnsBlockedAt > HF_DNS_RESET_MS) {
    _hfDnsBlocked = false;
    log.info("ai", "HF DNS block reset — tentando novamente após 30min");
    return false;
  }
  return true;
}

// ── Circuit Breaker para Meta Ads Library API ────────────────────────────────
// Quando Meta retorna code=10 (sem permissão), não faz sentido continuar tentando
// na mesma sessão. O CB abre e vai direto pro fallback por 60 minutos.
const _metaCB = {
  failures:      0,
  state:         "CLOSED" as "CLOSED" | "OPEN" | "HALF_OPEN",
  openedAt:      0,
  THRESHOLD:     2,          // abre após 2 falhas por permissão
  RESET_MS:      60 * 60 * 1000, // tenta reabrir após 60 min
};

function metaCBisOpen(): boolean {
  if (_metaCB.state === "CLOSED") return false;
  if (_metaCB.state === "OPEN") {
    if (Date.now() - _metaCB.openedAt > _metaCB.RESET_MS) {
      _metaCB.state    = "HALF_OPEN";
      _metaCB.failures = 0;
      log.info("ai", "Meta CB: HALF_OPEN — testando novamente após 60min");
      return false;
    }
    return true;
  }
  return false; // HALF_OPEN: deixa tentar
}

function metaCBrecordFailure(reason: "permission" | "token" | "other") {
  if (reason === "permission") {
    _metaCB.failures++;
    if (_metaCB.failures >= _metaCB.THRESHOLD) {
      _metaCB.state    = "OPEN";
      _metaCB.openedAt = Date.now();
      log.warn("ai", `Meta CB: OPEN — ${_metaCB.failures} falhas de permissão. Fallback direto por 60min.`);
    }
  }
}

function metaCBrecordSuccess() {
  if (_metaCB.state === "HALF_OPEN") {
    _metaCB.state    = "CLOSED";
    _metaCB.failures = 0;
    log.info("ai", "Meta CB: CLOSED — Meta API voltou a responder");
  }
}

// ── Cache de análise de concorrentes ─────────────────────────────────────────
// Evita re-chamar Gemini + pipeline completo para o mesmo concorrente recentemente
// analisado. TTL de 10 minutos — suficiente para evitar cliques repetidos.
const _competitorCache = new Map<number, { ts: number; result: any }>();
const COMPETITOR_CACHE_TTL = 10 * 60 * 1000; // 10 minutos

function getCompetitorCache(competitorId: number): any | null {
  const entry = _competitorCache.get(competitorId);
  if (!entry) return null;
  if (Date.now() - entry.ts > COMPETITOR_CACHE_TTL) {
    _competitorCache.delete(competitorId);
    return null;
  }
  return entry.result;
}

function setCompetitorCache(competitorId: number, result: any) {
  // Limita cache a 50 concorrentes para não crescer indefinidamente
  if (_competitorCache.size >= 50) {
    const oldest = [..._competitorCache.entries()].sort((a, b) => a[1].ts - b[1].ts)[0];
    if (oldest) _competitorCache.delete(oldest[0]);
  }
  _competitorCache.set(competitorId, { ts: Date.now(), result });
}

const AI_TIMEOUTS = {
  hfHealthMs:              7000,
  hfWarmIntervalMs:        25 * 60 * 1000,
  mecproAiMs:              30000,  // 30s
  resolvePageIdMs:          8000,  // 8s
  geminiMs:                55000,  // 55s — campanha/análise precisa de mais tempo (era 35s)
  geminiFinalRetryMs:      55000,  // 55s retry final
  geminiFinalRetryDelayMs:  3000,  // 3s wait (era 5s)
  metaOfficialMs:          15000,  // 15s
  publicProxyMs:           10000,  // 10s
  publicDirectMs:           8000,  // 8s
  websiteScrapeMs:         20000,  // 20s
  websiteAnalyzeMs:        30000,  // 30s (era 25s)
  seoAnalysisMs:           20000,  // 20s (era 15s)
  mockGenerationMs:        25000,  // 25s (era 20s)
} as const;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// ── Wake-up do HF Space — evita timeout na primeira chamada ──────────────────
let _hfSpaceWarmedUp = false;
async function warmupHFSpace() {
  if (_hfSpaceWarmedUp || !MECPRO_AI_URL) return;
  try {
    await fetch(`${MECPRO_AI_URL}/health`, { method: "GET", signal: AbortSignal.timeout(AI_TIMEOUTS.hfHealthMs) });
    _hfSpaceWarmedUp = true;
  } catch {}
}
// Tenta acordar o HF Space ao iniciar o servidor (não bloqueante)
if (MECPRO_AI_URL) {
  warmupHFSpace().catch(() => {});
  // Ping a cada 25 minutos para evitar sleep (HF dorme após 48h)
  setInterval(() => { warmupHFSpace().catch(() => {}); _hfSpaceWarmedUp = false; }, AI_TIMEOUTS.hfWarmIntervalMs);
}

async function mecproAI(endpoint: string, body: any): Promise<any | null> {
  if (!MECPRO_AI_URL) return null;
  // Tenta acordar o Space se necessário
  await warmupHFSpace();
  try {
    log.info("ai", `MECPro AI Service → ${endpoint}`);
    const res  = await fetch(`${MECPRO_AI_URL}/${endpoint}`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify(body),
      signal:  AbortSignal.timeout(AI_TIMEOUTS.mecproAiMs),
    });
    if (!res.ok) {
      const errBody = await res.text().catch(() => "");
      log.warn("ai", `MECPro AI Service error ${res.status}`, { endpoint, body: errBody.slice(0, 200) });
      return null;
    }
    const data = await res.json() as any;
    const motor = data.motor || "desconhecido";
    log.info("ai", `MECPro AI Service OK (motor=${motor})`, { endpoint });
    // O serviço retorna { success, motor, data: {...campos} }
    // data.data é o objeto com os campos da IA; data caso contrário
    const result = data.data ?? data;
    // Garante que não retorna objeto vazio ou string
    if (!result || typeof result !== "object" || Object.keys(result).length === 0) {
      log.warn("ai", "MECPro AI retornou resposta vazia ou inválida", { endpoint });
      return null;
    }
    return result;
  } catch (e: any) {
    log.warn("ai", "MECPro AI Service unreachable", { endpoint, message: e.message });
    return null;
  }
}

// System instruction permanente — define o papel da IA em todo o MECPro
const SYSTEM_MECPRO = `
Você é o MECPro AI, especialista sênior em inteligência competitiva de marketing digital.
Sua função é analisar dados de anúncios da Meta Ads Library e gerar insights estratégicos
acionáveis para gestores de tráfego e donos de negócios brasileiros.

Regras obrigatórias:
- Responda SEMPRE em JSON válido, sem markdown, sem texto fora do JSON
- Use linguagem direta, prática e orientada a ação
- Baseie análises APENAS nos dados fornecidos, nunca invente métricas ou números
- Priorize padrões que se repetem em múltiplos anúncios ou por 30+ dias (= validados pelo mercado)
- Quando dados forem insuficientes, sinalize com "dados insuficientes para esta análise"

GLOSSÁRIO OFICIAL DE SIGLAS — use sempre estas definições e exemplos:
CTA (Call To Action): chamada para ação. Ex: "Comprar agora", "Saiba mais", "Baixar ebook", "Falar no WhatsApp". Uso em nomenclatura: Campanha_CursoIA_CTA_WhatsApp
CRO (Conversion Rate Optimization): otimização da taxa de conversão — melhorar página de vendas, anúncio, botão ou copy para aumentar % de conversão. Ex: Campanha_CRO_PaginaVenda_V2
CPC (Cost Per Click): custo por clique — quanto custa cada clique no anúncio.
CPM (Cost Per Mille): custo por mil impressões — quanto custa mostrar o anúncio 1000 vezes.
CTR (Click Through Rate): taxa de cliques — ex: 1000 viram, 50 clicaram = CTR 5%.
CPL (Cost Per Lead): custo por lead — quanto custa cada pessoa que deixou contato.
CPA (Cost Per Acquisition): custo por aquisição — quanto custa cada venda.
ROAS (Return On Ad Spend): retorno sobre investimento em anúncios — ex: gastou R$100, vendeu R$500 = ROAS 5.
TOF (Top of Funnel): topo do funil — campanhas de atração para público frio.
MOF (Middle of Funnel): meio do funil — campanhas de consideração para quem já interagiu.
BOF (Bottom of Funnel): fundo do funil — campanhas de conversão para quem já demonstrou interesse.

PADRÃO DE NOMENCLATURA DE CAMPANHAS:
Formato: Campanha_[Nicho]_[Objetivo]_[CTA/Estratégia]_[Plataforma]
Exemplos:
- Campanha_Imoveis_Leads_CTA_WhatsApp_Meta
- Campanha_CursoIA_Vendas_BOF_Google
- Campanha_Ecommerce_CRO_PaginaVenda_V2_Meta
- Campanha_Servicos_TOF_Awareness_Meta
`.trim();

export async function gemini(
  prompt: string,
  opts: {
    temperature?: number;
    maxOutputTokens?: number;
    systemInstruction?: string;
    jsonMode?: boolean;
    useCache?: boolean;
  } = {},
  retryCount = 0
): Promise<string> {
  // Primeira tentativa usa semáforo para limitar concorrência
  if (retryCount === 0) {
    return withGeminiSemaphore(() => _geminiImpl(prompt, opts, 0));
  }
  return _geminiImpl(prompt, opts, retryCount);
}

async function _geminiImpl(
  prompt: string,
  opts: {
    temperature?: number;
    maxOutputTokens?: number;
    systemInstruction?: string;
    jsonMode?: boolean;
    useCache?: boolean;
  } = {},
  retryCount = 0
): Promise<string> {
  // ── Toggle: se modo "off", vai direto para Groq (sem tentar Gemini) ──────
  if (_llmMode === "off" && retryCount === 0) {
    log.info("ai", "🟡 MECPro AI Categoria B ativada");
    try {
      const groqResult = await callGroqAPI(prompt, opts.systemInstruction, opts.temperature);
      if (groqResult) return groqResult;
    } catch (e: any) {
      log.warn("ai", "Groq falhou no modo OFF", { message: e?.message?.slice(0, 80) });
    }
    // Genspark como último recurso no modo OFF
    try {
      const gsResult = await callGensparkAPI(prompt, opts.systemInstruction, opts.temperature);
      if (gsResult) { log.info("ai", "✅ Genspark fallback OK (modo OFF)"); return gsResult; }
    } catch { /* silencioso */ }
    log.warn("ai", "Groq e Genspark indisponíveis no modo OFF — usando mock");
    return mockResponse(prompt);
  }

  // Cache: evita chamadas repetidas para o mesmo prompt em 5 minutos
  if (opts.useCache !== false && retryCount === 0) {
    const cacheKey = prompt.slice(0, 200) + (opts.temperature || 0.3);
    const cached = getCachedGemini(cacheKey);
    if (cached) {
      log.info("ai", "Gemini cache hit", { promptSlice: prompt.slice(0, 50) });
      return cached;
    }
  }

  // Rotaciona chaves: tentativas 0-4 usam chave 1, 5-9 usam chave 2, etc.
  const keyAttempt = Math.floor(retryCount / GEMINI_MODELS.length);
  const apiKey = getGeminiKey(keyAttempt);
  if (!apiKey) {
    log.warn("ai", "Nenhuma GEMINI_API_KEY configurada — usando Groq como fallback");
    const groqResult = await callGroqAPI(prompt, opts.systemInstruction, opts.temperature);
    if (groqResult) return groqResult;
    const gsResult2 = await callGensparkAPI(prompt, opts.systemInstruction, opts.temperature);
    if (gsResult2) { log.info("ai", "✅ Genspark fallback OK (sem Gemini key)"); return gsResult2; }
    return mockResponse(prompt);
  }

  const temperature       = opts.temperature       ?? 0.3;
  const maxOutputTokens   = opts.maxOutputTokens   ?? 8192;
  const systemInstruction = opts.systemInstruction ?? SYSTEM_MECPRO;
  const jsonMode          = opts.jsonMode          ?? true; // default mantém JSON

  const body: any = {
    system_instruction: { parts: [{ text: systemInstruction }] },
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: {
      temperature,
      maxOutputTokens,
      ...(jsonMode ? { responseMimeType: "application/json" } : {}),
    },
  };

  // Cascata de modelos — avança para o próximo quando sobrecarregado
  const modelIndex = Math.min(retryCount, GEMINI_MODELS.length - 1);
  const model      = GEMINI_MODELS[modelIndex];
  const url        = `${GEMINI_BASE}/${model}:generateContent`;

  log.info("ai", `Gemini request — model: ${model} (tentativa ${retryCount + 1})`);

  const res  = await fetch(`${url}?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(AI_TIMEOUTS.geminiMs),
  });
  const data = await res.json() as any;

  // Modelo sobrecarregado ou rate-limit — tenta próximo modelo da cascata
  const errMsg = (data.error?.message || "").toLowerCase();
  const isOverloaded = res.status === 429
    || res.status === 503
    || res.status === 404   // modelo não encontrado — tenta próximo
    || errMsg.includes("high demand")
    || errMsg.includes("overloaded")
    || errMsg.includes("quota")
    || errMsg.includes("not found")
    || errMsg.includes("resource_exhausted");

  if (isOverloaded && retryCount < GEMINI_MODELS.length - 1) {
    const nextModel = GEMINI_MODELS[retryCount + 1];
    const is404  = res.status === 404 || errMsg.includes("not found");
    const isQuota = res.status === 429 || errMsg.includes("quota") || errMsg.includes("resource_exhausted");

    // Marca chave como esgotada quando for erro de quota
    if (isQuota && apiKey) markGeminiKeyExhausted(apiKey);

    const isCrossFamily = (model.startsWith("gemini-2.5") && nextModel.startsWith("gemini-2.0")) ||
                          (model.startsWith("gemini-2.0") && nextModel.startsWith("gemini-2.5"));
    const delay  = is404 ? 50 : isCrossFamily ? 300 : 1000 * (retryCount + 1);
    log.warn("ai", `Gemini ${is404 ? "modelo inválido" : "sobrecarregado"} (${model}) → ${nextModel} em ${delay}ms`);
    await sleep(delay);
    return gemini(prompt, opts, retryCount + 1);
  }

  // Todos os modelos falharam por quota/overload — aguarda 15s e tenta 1 vez com o último modelo válido
  if (isOverloaded) {
    if (retryCount < GEMINI_MODELS.length) {
      const retryModel = GEMINI_MODELS[Math.max(GEMINI_MODELS.length - 1, 0)];
      log.warn("ai", `Todos os modelos Gemini indisponíveis — aguardando retry final com ${retryModel}`);
      await sleep(AI_TIMEOUTS.geminiFinalRetryDelayMs);
      try {
        const retryUrl = `${GEMINI_BASE}/${retryModel}:generateContent`;
        const retryKey = getGeminiKey(keyAttempt + 1); // tenta chave diferente no retry
        const retryRes = await fetch(`${retryUrl}?key=${retryKey || apiKey}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(AI_TIMEOUTS.geminiFinalRetryMs),
        });
        const retryData = await retryRes.json() as any;
        if (!retryData.error && retryData.candidates?.[0]?.content?.parts?.[0]?.text) {
          log.info("ai", `Gemini retry 15s OK — ${retryModel}`);
          return retryData.candidates[0].content.parts[0].text;
        }
      } catch {}
    }
    log.warn("ai", "Todos os modelos Gemini indisponíveis — tentando Groq (Llama) como fallback");
    try {
      const groqResult = await callGroqAPI(prompt, opts.systemInstruction, opts.temperature);
      if (groqResult) {
        log.info("ai", "✅ Groq API fallback OK");
        return groqResult;
      }
      // Groq também falhou — tentar Genspark
      const gsResult3 = await callGensparkAPI(prompt, opts.systemInstruction, opts.temperature);
      if (gsResult3) {
        log.info("ai", "✅ Genspark fallback OK (Gemini indisponível)");
        return gsResult3;
      }
    } catch (groqErr: any) {
      log.warn("ai", "Groq API fallback falhou", { message: groqErr?.message?.slice(0, 80) });
    }

    // Claude como último recurso (se configurado)
    if (process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY) {
      try {
        const claudeResult = await callClaudeAPI(prompt, opts.systemInstruction, opts.temperature);
        if (claudeResult) {
          log.info("ai", "✅ Claude API fallback OK");
          return claudeResult;
        }
      } catch (claudeErr: any) {
        log.warn("ai", "Claude API fallback falhou", { message: claudeErr?.message?.slice(0, 80) });
      }
    }

    log.warn("ai", "Todos os LLMs indisponíveis — usando mock response");
    return mockResponse(prompt);
  }

  if (data.error) throw new Error(data.error.message);
  const result = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
  // Salva no cache se foi bem-sucedido
  if (result && opts.useCache !== false && retryCount === 0) {
    const cacheKey = prompt.slice(0, 200) + (opts.temperature || 0.3);
    setCachedGemini(cacheKey, result);
  }
  return result;
}

// ── Groq API — fallback principal quando Gemini está indisponível ────────────
// Compatível com OpenAI API format. Modelos Llama 3 gratuitos.
async function callGroqAPI(
  prompt: string,
  systemInstruction?: string,
  temperature: number = 0.3,
): Promise<string | null> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    log.info("ai", "Groq API: GROQ_API_KEY não configurada — pulando fallback");
    return null;
  }

  // Modelo principal: llama-3.3-70b-versatile
  // Fallback interno: llama-3.1-8b-instant (mais rápido, menor quota)
  const models = [
    process.env.GROQ_MODEL || "llama-3.3-70b-versatile",
    "llama-3.1-8b-instant",
  ];

  for (const model of models) {
    try {
      const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type":  "application/json",
          "Authorization": `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          temperature,
          max_tokens: 8192,
          response_format: { type: "json_object" }, // força JSON como o Gemini
          messages: [
            { role: "system",  content: systemInstruction || SYSTEM_MECPRO },
            { role: "user",    content: prompt },
          ],
        }),
        signal: AbortSignal.timeout(30000),
      });

      if (res.status === 429) {
        log.warn("ai", `Groq rate limit no modelo ${model} — tentando próximo`);
        continue;
      }

      if (!res.ok) {
        const errText = await res.text().catch(() => "");
        log.warn("ai", `Groq HTTP ${res.status} no modelo ${model}`, { preview: errText.slice(0, 150) });
        continue;
      }

      const data: any = await res.json().catch(() => null);
      if (!data) continue;

      const text = data.choices?.[0]?.message?.content || "";
      if (!text) {
        log.warn("ai", `Groq: resposta vazia no modelo ${model}`);
        continue;
      }

      log.info("ai", "Groq API OK", {
        model,
        inputTok:   data.usage?.prompt_tokens,
        outputTok:  data.usage?.completion_tokens,
        finishReason: data.choices?.[0]?.finish_reason,
      });

      return text;

    } catch (e: any) {
      log.warn("ai", `Groq erro no modelo ${model}`, { message: e?.message?.slice(0, 80) });
    }
  }

  return null;
}

// ── Genspark API — fallback OpenAI-compatível com modelos avançados ─────────
async function callGensparkAPI(
  prompt: string,
  systemInstruction?: string,
  temperature: number = 0.35,
): Promise<string | null> {
  const apiKey = (process.env.GENSPARK_API_KEY || "").trim();
  if (!apiKey) return null;

  // Genspark suporta múltiplos modelos via API compatível com OpenAI
  const models = [
    process.env.GENSPARK_MODEL || "genspark-auto",
  ];

  for (const model of models) {
    try {
      log.info("ai", "Genspark: tentando", { model });
      const res = await fetch("https://api.genspark.ai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type":  "application/json",
          "Authorization": `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          temperature,
          max_tokens: 8192,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: systemInstruction || "Você é um assistente de marketing digital especializado. Responda sempre em JSON válido." },
            { role: "user",   content: prompt },
          ],
        }),
        signal: AbortSignal.timeout(45000),
      });

      if (!res.ok) {
        const err = await res.text().catch(() => "");
        log.warn("ai", "Genspark HTTP erro", { status: res.status, preview: err.slice(0, 120) });
        continue;
      }

      const data = await res.json() as any;
      const text = data?.choices?.[0]?.message?.content?.trim();

      if (text) {
        log.info("ai", "Genspark OK", { model, chars: text.length });
        return text;
      }
    } catch (err: any) {
      log.warn("ai", "Genspark exception", { model, error: err?.message?.slice(0, 80) });
    }
  }
  return null;
}

// ── Claude API — fallback quando Gemini está totalmente indisponível ──────────
async function callClaudeAPI(
  prompt: string,
  systemInstruction?: string,
  temperature: number = 0.3,
): Promise<string | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY;
  if (!apiKey) {
    log.info("ai", "Claude API: ANTHROPIC_API_KEY não configurada — pulando fallback");
    return null;
  }

  const system = systemInstruction || SYSTEM_MECPRO;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type":         "application/json",
      "x-api-key":            apiKey,
      "anthropic-version":    "2023-06-01",
    },
    body: JSON.stringify({
      model:      "claude-sonnet-4-5",
      max_tokens: 8192,
      temperature,
      system,
      messages: [{ role: "user", content: prompt }],
    }),
    signal: AbortSignal.timeout(60000),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    log.warn("ai", "Claude API HTTP error", { status: res.status, preview: errText.slice(0, 150) });
    return null;
  }

  const data: any = await res.json().catch(() => null);
  if (!data) return null;

  const text = data.content?.[0]?.text || "";
  if (!text) {
    log.warn("ai", "Claude API: resposta vazia", { stopReason: data.stop_reason });
    return null;
  }

  log.info("ai", "Claude API OK", {
    model:      data.model,
    inputTok:   data.usage?.input_tokens,
    outputTok:  data.usage?.output_tokens,
    stopReason: data.stop_reason,
  });

  return text;
}

function mockResponse(prompt: string): string {
  const lower = prompt.toLowerCase();
  const isImoveis   = /imov|imobi|apart|casa|residenc|villa|serena|luxo/i.test(prompt);
  const isServico   = /clinica|saude|beleza|estetica|restaurante|delivery/i.test(prompt);
  const isEcommerce = /loja|produto|compra|varejo/i.test(prompt);
  const nicho = isImoveis ? "imobiliario" : isServico ? "servicos" : isEcommerce ? "e-commerce" : "negocios";

  if (lower.includes("anuncio") || lower.includes("concorrente") || lower.includes("ads") || lower.includes("analyze-competitor")) {
    const ctas = isImoveis
      ? ["Agendar visita", "Falar com corretor", "Ver imovel", "Solicitar proposta"]
      : isServico ? ["Agendar consulta", "Falar no WhatsApp", "Ver disponibilidade", "Saiba mais"]
      : ["Comprar agora", "Ver oferta", "Falar no WhatsApp", "Saiba mais"];
    const positioning = isImoveis
      ? "Tom aspiracional com foco em qualidade de vida e exclusividade. Destaque em localizacao privilegiada e acabamento premium."
      : isServico ? "Tom de autoridade com foco em resultado comprovado e atendimento humanizado."
      : "Tom direto com foco em oferta e urgencia. Preco e frete gratis sao os principais argumentos.";
    return JSON.stringify({
      topFormats: [
        { format: "video", percentage: 65, insight: "Formato dominante para awareness — alta retencao" },
        { format: "imagem", percentage: 25, insight: "Ideal para conversao — CPC mais baixo" },
        { format: "carrossel", percentage: 10, insight: "Bom para showcasing de multiplos beneficios" },
      ],
      topCtaPatterns: ctas,
      estimatedFunnel: "TOF 60%: video 15s publico frio. MOF 25%: carrossel beneficios. BOF 15%: oferta direta CTA WhatsApp.",
      winnerPatterns: "Headlines com numero + beneficio + urgencia. Copy curto (3 linhas). Pergunta retorica na abertura converte mais.",
      positioning,
      competitorWeaknesses: "1. Sem prova social recente. 2. CTAs genericos. 3. Sem segmentacao por estagio do funil.",
      recommendations: "1. Videos 15-30s com depoimento real + resultado. 2. CTA especifico. 3. Separar campanhas por temperatura.",
    });
  }
  if (lower.includes("mercado") || lower.includes("oportunidade") || lower.includes("market-analysis")) {
    return JSON.stringify({
      competitiveGaps: isImoveis
        ? "Concorrentes focam em 30-45 anos. Investidores 50+ sub-atendidos. Poucos exploram tour virtual Reels para geracao de leads."
        : "Publico maduro (40+) com maior poder de compra sub-atendido no segmento " + nicho + ".",
      unexploredOpportunities: isImoveis
        ? "1. Tour virtual 360 via Reels\n2. Parceria arquitetos/decoradores\n3. Remarketing visitantes 30-90 dias\n4. WhatsApp Business automatizado"
        : "1. Stories interativos\n2. Micro-influenciadores regionais\n3. Remarketing por comportamento\n4. Conteudo educativo pre-venda",
      suggestedPositioning: isImoveis
        ? "Premium com foco em estilo de vida e valorizacao. Diferencial: atendimento consultivo e transparencia."
        : "Referencia de qualidade com resultado rapido e suporte proximo. Diferencial: personalizacao e prova social local.",
      threats: isImoveis
        ? "Concorrentes aumentando investimento Meta Ads. Ciclo de decisao longo (90-180 dias) exige funil de nutricao."
        : "Concorrente principal aumentou investimento 40% em 60 dias. Provavel lancamento iminente.",
      competitiveMap: "Lider: alto investimento, tom corporativo. Concorrente 2: preco baixo. Oportunidade: premium com relacionamento.",
    });
  }
  return JSON.stringify({
    strategy: "3 fases: awareness (sem 1-2), consideracao (sem 3-4), conversao (sem 5-8). Lookalike dos melhores clientes.",
    adSets: [
      { name: "Publico Frio", audience: "Lookalike 1-3%, 25-45 anos", budget: "40%", objective: "Alcance" },
      { name: "Publico Morno", audience: "Visitantes site 30 dias, engajados", budget: "35%", objective: "Consideracao" },
      { name: "Remarketing", audience: "Visitantes produto 7 dias", budget: "25%", objective: "Conversao" },
    ],
    creatives: [
      {
        type: "direct_offer", format: "Video 15s", orientation: "vertical_9_16",
        headline: "Resultados reais em 30 dias",
        copy: "Metodo validado por 5.000 clientes. Sem promessa vazia.",
        bodyText: "Metodo validado por 5.000 clientes. Sem promessa vazia.",
        cta: "Comecar agora", hook: "9 em 10 pessoas cometem esse erro",
        pain: "Perder tempo sem resultado", solution: "Metodo comprovado com suporte",
        funnelStage: "TOF", complianceScore: "safe",
        targetAudience: "25-45 anos interessados em " + nicho,
        platforms: ["meta"], budget: 50, duration: 7,
      },
    ],
  });
}



// ══════════════════════════════════════════════════════════════════════════════
// generateCampaign — Gera campanha completa via Gemini
// Chamada por: server/_core/router.ts → campaigns.generate
// ══════════════════════════════════════════════════════════════════════════════
export async function generateCampaign(input: {
  projectId:     number;
  name:          string;
  objective:     string;
  platform:      string;
  budget:        number;
  duration:      number;
  extraContext?: string;
  ageMin?:       number;
  ageMax?:       number;
  regions?:      string[];
  countries?:    string[];
  locationMode?: string;
  geoCity?:      string;
  geoRadius?:    number;
  mediaFormat?:  string;
  leadForm?:     any;
}): Promise<any> {
  const { projectId, name, objective, platform, budget, duration, extraContext } = input;
  log.info("ai", "[generateCampaign] iniciando", { projectId, name, objective, platform });

  // Busca perfil do cliente para contexto
  let clientContext = "";
  try {
    const profile = await db.getClientProfileByProjectId(projectId) as any;
    if (profile) {
      clientContext = `
PERFIL DO CLIENTE:
- Empresa: ${profile.companyName || "N/A"}
- Nicho: ${profile.niche || "N/A"}
- Produto/Serviço: ${profile.productService || "N/A"}
- Público-alvo: ${profile.targetAudience || "N/A"}
- Dor principal: ${profile.mainPain || "N/A"}
- Proposta de valor: ${profile.uniqueValueProposition || "N/A"}
- Budget mensal: ${profile.monthlyBudget ? `R$ ${profile.monthlyBudget}` : "N/A"}
`;
    }
  } catch (e: any) {
    log.warn("ai", "[generateCampaign] erro ao buscar perfil", { message: e?.message });
  }

  const segmentInfo = [
    input.ageMin && input.ageMax ? `Faixa etária: ${input.ageMin}-${input.ageMax} anos` : "",
    input.regions?.length        ? `Regiões: ${input.regions.join(", ")}` : "",
    input.countries?.length      ? `Países: ${input.countries.join(", ")}` : "",
    input.geoCity                ? `Raio de ${input.geoRadius || 15}km em ${input.geoCity}` : "",
    input.mediaFormat && input.mediaFormat !== "mixed" ? `Formato: ${input.mediaFormat}` : "",
  ].filter(Boolean).join(" | ");

  const prompt = `Você é um estrategista sênior de tráfego pago. Crie uma campanha completa de marketing digital.

${clientContext}

DADOS DA CAMPANHA:
- Nome: ${name}
- Objetivo: ${objective}
- Plataforma: ${platform}
- Budget total: R$ ${budget}
- Duração: ${duration} dias
- Budget diário: R$ ${(budget / duration).toFixed(2)}
${segmentInfo ? `- Segmentação: ${segmentInfo}` : ""}
${extraContext ? `- Contexto adicional: ${extraContext}` : ""}

Responda SOMENTE com JSON válido (sem markdown):
{
  "strategy": "string",
  "adSets": [{ "name": "string", "audience": "string", "budget": "string", "objective": "string", "placement": "string" }],
  "creatives": [{
    "type": "string", "format": "string", "orientation": "string",
    "headline": "string", "copy": "string", "bodyText": "string",
    "cta": "string", "hook": "string", "pain": "string", "solution": "string",
    "funnelStage": "string", "complianceScore": "string",
    "targetAudience": "string", "platforms": ["meta"], "budget": 50, "duration": 7
  }],
  "conversionFunnel": "string",
  "executionPlan": "string",
  "kpis": ["string"],
  "abTests": [{ "element": "string", "variantA": "string", "variantB": "string", "hypothesis": "string" }],
  "hooks": ["string"],
  "copies": ["string"],
  "estimatedResults": { "reach": "string", "clicks": "string", "leads": "string", "cpl": "string", "cpc": "string" }
}`;

  try {
    const raw = await gemini(prompt, {
      temperature:       0.3,
      maxOutputTokens:   8192,
      systemInstruction: "Você é um especialista em tráfego pago. Responda sempre em JSON válido sem markdown.",
    });

    let parsed: any;
    try {
      const clean = raw.replace(/```json|```/g, "").trim();
      const match = clean.match(/\{[\s\S]+\}/);
      parsed = JSON.parse(match ? match[0] : clean);
    } catch {
      log.warn("ai", "[generateCampaign] JSON parse falhou — usando mock");
      parsed = JSON.parse(mockResponse("campaign " + objective));
    }

    // Salva no banco com campos aceitos pelo updateCampaignField
    try {
      const saved = await db.createCampaign({
        projectId,
        name,
        objective:             objective as any,
        platform,
        suggestedBudgetDaily:  Math.round(budget / duration),
        suggestedBudgetMonthly: budget,
        durationDays:          duration,
        strategy:              parsed.strategy          || "",
        adSets:                JSON.stringify(parsed.adSets      || []),
        creatives:             JSON.stringify(parsed.creatives    || []),
        conversionFunnel:      parsed.conversionFunnel || "",
        executionPlan:         parsed.executionPlan    || "",
        aiPromptUsed:          prompt.slice(0, 2000),
        aiResponse:            raw.slice(0, 5000),
        status:                "draft",
      } as any);
      log.info("ai", "[generateCampaign] campanha salva", { campaignId: (saved as any)?.id });
      return { ...parsed, id: (saved as any)?.id, campaignId: (saved as any)?.id };
    } catch (dbErr: any) {
      log.warn("ai", "[generateCampaign] erro ao salvar no banco", { message: dbErr?.message });
      return parsed;
    }

  } catch (e: any) {
    log.error("ai", "[generateCampaign] erro crítico", { message: e?.message });
    throw e;
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// generateCampaignPart — Regenera parte específica de uma campanha existente
// Chamada por: server/_core/router.ts → campaigns.regeneratePart
// NOTA: updateCampaignField só aceita "creatives"|"adSets"|"strategy"|"aiResponse"
// Para hooks/abTests/copies salvamos dentro de aiResponse como JSON
// ══════════════════════════════════════════════════════════════════════════════
export async function generateCampaignPart(input: {
  campaignId:    number;
  projectId:     number;
  part:          "creatives" | "adSets" | "hooks" | "abTests" | "copies";
  campaign:      any;
  extraContext?: string;
}): Promise<any> {
  const { campaignId, part, campaign, extraContext } = input;
  log.info("ai", "[generateCampaignPart] iniciando", { campaignId, part });

  const partPrompts: Record<string, string> = {
    creatives: `Gere 3 novos criativos para esta campanha:
Objetivo: ${campaign.objective} | Plataforma: ${campaign.platform} | Budget diário: R$ ${campaign.suggestedBudgetDaily || 50}
${extraContext ? `Contexto: ${extraContext}` : ""}
JSON: { "creatives": [{ "type","format","orientation","headline","copy","bodyText","cta","hook","pain","solution","funnelStage","complianceScore","targetAudience","platforms","budget","duration" }] }`,

    adSets: `Gere 3 novos conjuntos de anúncios:
Objetivo: ${campaign.objective} | Budget: R$ ${campaign.suggestedBudgetMonthly || 1000}
${extraContext ? `Contexto: ${extraContext}` : ""}
JSON: { "adSets": [{ "name","audience","budget","objective","placement" }] }`,

    hooks: `Gere 5 hooks poderosos para esta campanha:
Objetivo: ${campaign.objective}
${extraContext ? `Contexto: ${extraContext}` : ""}
JSON: { "hooks": ["hook1","hook2","hook3","hook4","hook5"] }`,

    abTests: `Gere 3 testes A/B para esta campanha:
Objetivo: ${campaign.objective}
${extraContext ? `Contexto: ${extraContext}` : ""}
JSON: { "abTests": [{ "element","variantA","variantB","hypothesis" }] }`,

    copies: `Gere 5 copies persuasivos:
Objetivo: ${campaign.objective} | Plataforma: ${campaign.platform}
${extraContext ? `Contexto: ${extraContext}` : ""}
JSON: { "copies": ["copy1","copy2","copy3","copy4","copy5"] }`,
  };

  const prompt = partPrompts[part];
  if (!prompt) throw new Error(`Parte desconhecida: ${part}`);

  try {
    const raw = await gemini(prompt, {
      temperature:       0.5,
      maxOutputTokens:   4096,
      systemInstruction: "Responda sempre em JSON válido sem markdown.",
    });

    let parsed: any;
    try {
      const clean = raw.replace(/```json|```/g, "").trim();
      const match = clean.match(/\{[\s\S]+\}/);
      parsed = JSON.parse(match ? match[0] : clean);
    } catch {
      log.warn("ai", "[generateCampaignPart] JSON parse falhou", { part });
      return { [part]: [] };
    }

    // Salva no banco — só campos aceitos pelo updateCampaignField
    try {
      if (part === "creatives" && parsed.creatives) {
        await db.updateCampaignField(campaignId, "creatives", JSON.stringify(parsed.creatives));
      } else if (part === "adSets" && parsed.adSets) {
        await db.updateCampaignField(campaignId, "adSets", JSON.stringify(parsed.adSets));
      } else if (parsed[part]) {
        // hooks/abTests/copies — salva em aiResponse como JSON complementar
        await db.updateCampaignField(campaignId, "aiResponse", JSON.stringify({ [part]: parsed[part] }));
      }
      log.info("ai", "[generateCampaignPart] banco atualizado", { campaignId, part });
    } catch (dbErr: any) {
      log.warn("ai", "[generateCampaignPart] erro ao atualizar banco", { message: dbErr?.message });
    }

    return parsed;

  } catch (e: any) {
    log.error("ai", "[generateCampaignPart] erro", { message: e?.message });
    throw e;
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// analyzeCompetitor — Analisa concorrente via anúncios coletados + Gemini
// Chamada por: server/publicApi.ts e server/_core/router.ts
// NOTA: updateCompetitorInsights(id, insights: string, adsAnalyzed?: number)
// ══════════════════════════════════════════════════════════════════════════════
export async function analyzeCompetitor(
  competitorId: number,
  projectId:    number,
): Promise<any> {
  log.info("ai", "[analyzeCompetitor] iniciando", { competitorId, projectId });

  try {
    const ads = await db.getScrapedAdsByCompetitor(competitorId) as any[];
    if (!ads || ads.length === 0) {
      return { message: "Nenhum anúncio coletado para este concorrente ainda." };
    }

    let clientContext = "";
    try {
      const profile = await db.getClientProfileByProjectId(projectId) as any;
      if (profile) {
        clientContext = `
CONTEXTO DO CLIENTE:
- Nicho: ${profile.niche || "N/A"}
- Produto: ${profile.productService || "N/A"}
- Público-alvo: ${profile.targetAudience || "N/A"}
- Dor principal: ${profile.mainPain || "N/A"}
- UVP: ${profile.uniqueValueProposition || "N/A"}
`;
      }
    } catch {}

    const adsSample = ads.slice(0, 20).map((a: any, i: number) =>
      `[${i+1}] Tipo: ${a.adType || "imagem"} | Ativo: ${a.isActive ? "sim" : "não"}\nHeadline: ${a.headline || "N/A"}\nCopy: ${(a.bodyText || "").slice(0, 200)}\nCTA: ${a.cta || "N/A"}`
    ).join("\n\n");

    const prompt = `Você é um analista de inteligência competitiva em marketing digital.
${clientContext}

Analise os ${ads.length} anúncios abaixo e gere insights estratégicos.

ANÚNCIOS:
${adsSample}

JSON:
{
  "topFormats": [{ "format": "string", "percentage": 0, "insight": "string" }],
  "topCtaPatterns": ["string"],
  "estimatedFunnel": "string",
  "winnerPatterns": "string",
  "positioning": "string",
  "competitorWeaknesses": "string",
  "recommendations": "string",
  "totalAdsAnalyzed": ${ads.length},
  "activeAds": ${ads.filter((a: any) => a.isActive).length}
}`;

    const raw = await gemini(prompt, { temperature: 0.3, maxOutputTokens: 4096 });

    let parsed: any;
    try {
      const clean = raw.replace(/```json|```/g, "").trim();
      const match = clean.match(/\{[\s\S]+\}/);
      parsed = JSON.parse(match ? match[0] : clean);
    } catch {
      parsed = JSON.parse(mockResponse("anuncio concorrente"));
    }

    // Salva com assinatura correta: updateCompetitorInsights(id, insights: string, adsAnalyzed?: number)
    try {
      await db.updateCompetitorInsights(competitorId, JSON.stringify(parsed), ads.length);
    } catch (dbErr: any) {
      log.warn("ai", "[analyzeCompetitor] erro ao salvar insights", { message: dbErr?.message });
    }

    return parsed;

  } catch (e: any) {
    log.error("ai", "[analyzeCompetitor] erro", { message: e?.message });
    throw e;
  }
}
