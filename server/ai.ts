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
          body:   params,
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

    const kpUrl = `https://googleads.googleapis.com/v19_1/customers/${customerId}:generateKeywordIdeas`;
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
        `https://googleads.googleapis.com/v19_1/customers/${customerId}/googleAds:search`,
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
const GEMINI_API_KEY4 = process.env.GEMINI_API_KEY_4;  // chave adicional (opcional)
const GEMINI_API_KEY5 = process.env.GEMINI_API_KEY_5;  // chave adicional (opcional)

// ── Semáforo para limitar chamadas Gemini simultâneas ───────────────────────
// Evita estourar a quota quando muitas análises rodam ao mesmo tempo
let _geminiConcurrent = 0;
const GEMINI_MAX_CONCURRENT = 2; // máximo 2 chamadas simultâneas — preserva quota

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
const QUOTA_RESET_MS = 60 * 60 * 1000; // 60 min — evita tentar chave esgotada (quota RPM reseta em ~1min, RPD em 24h mas marcamos 60min para balance entre retry e economia)

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
  const allKeys = [GEMINI_API_KEY, GEMINI_API_KEY2, GEMINI_API_KEY3, GEMINI_API_KEY4, GEMINI_API_KEY5].filter(Boolean) as string[];
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
    availableKeys: [GEMINI_API_KEY, GEMINI_API_KEY2, GEMINI_API_KEY3, GEMINI_API_KEY4, GEMINI_API_KEY5]
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
  THRESHOLD:     2,          // abre após 2 falhas de keyword search por permissão
  RESET_MS:      30 * 60 * 1000, // 30min (era 60min — reduzido para retentar mais cedo)
  // Nota: o CB só bloqueia busca por keyword/nome (que requer Ads Library permission)
  // Busca por pageId via ads_archive ainda é tentada mesmo com CB aberto
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

// ── Helpers de classificação de fonte de anúncios ────────────────────────────

function getAdSource(ad: any): string {
  // Tenta campo direto primeiro
  if (ad?.source && ad.source !== "unknown") return (ad.source as string).toLowerCase();
  // Fallback: lê source dentro do rawData JSON
  try {
    const raw = typeof ad?.rawData === "string" ? JSON.parse(ad.rawData) : (ad?.rawData || {});
    if (raw?.source && raw.source !== "unknown") return (raw.source as string).toLowerCase();
  } catch {}
  // Detecta por adId prefix
  const adId = ad?.adId || "";
  if (adId.startsWith("estimated_")) return "estimated";
  if (adId.startsWith("seo_"))       return "seo_analysis";
  if (adId.startsWith("ws_"))        return "website_scraping";
  if (adId.startsWith("site_"))      return "website_scraping";
  if (/^\d{10,}$/.test(adId))        return "meta_ads_archive";
  return (ad?.platform || "unknown").toLowerCase();
}

const REAL_AD_SOURCES = new Set([
  "meta_ads_archive", "meta_ads_library", "meta", "facebook_ads",
  "meta_page_posts",  // Graph API /page/posts — real, sem Ads Library
  "google_ads", "google_ads_transparency", "tiktok_ads",
]);

function isRealAdSource(source: string): boolean {
  return REAL_AD_SOURCES.has((source || "").toLowerCase());
}

function isNonRealAdSource(source: string): boolean {
  return !isRealAdSource(source);
}

async function resolvePageId(
  compName: string,
  websiteUrl?: string,
  igUrl?: string,
  metaToken?: string,
): Promise<string | null> {

  // ── Estratégia 1: extrai pageId do HTML do site (link para FB) ──────────
  if (websiteUrl) {
    try {
      const res = await fetch(websiteUrl, { signal: AbortSignal.timeout(8000) });
      const html = await res.text();
      // Captura facebook.com/pages/nome/ID ou facebook.com/ID numérico direto
      const fbMatch = html.match(/facebook\.com\/(?:pages\/[^/"']+\/)?(\d{10,})/);
      if (fbMatch?.[1]) {
        log.info("ai", "pageId encontrado no HTML do site", { compName, pageId: fbMatch[1] });
        return fbMatch[1];
      }
      // Captura username da página Facebook no HTML
      const fbUser = html.match(/facebook\.com\/((?!sharer|share|login|dialog)[\w.]{3,})["' ]/);
      if (fbUser?.[1] && metaToken) {
        try {
          const r = await fetch(
            `https://graph.facebook.com/v20.0/${fbUser[1]}?fields=id,name&access_token=${metaToken}`,
            { signal: AbortSignal.timeout(6000) }
          );
          const d = await r.json();
          if (d?.id && /^\d+$/.test(d.id)) {
            log.info("ai", "pageId resolvido via username do site", { compName, username: fbUser[1], pageId: d.id });
            return d.id;
          }
        } catch {}
      }
    } catch { /* ignora */ }
  }

  // ── Estratégia 2: Graph API Search por nome da empresa ──────────────────
  if (metaToken) {
    const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
    // Variantes: com e sem sufixos comuns
    const clean = compName.replace(/\s+(imoveis|imóveis|imobiliária|construtora|ltda|me|eireli)$/i, "").trim();
    const queries = [...new Set([clean, compName])];

    for (const query of queries) {
      try {
        const url = `https://graph.facebook.com/v20.0/pages/search?q=${encodeURIComponent(query)}&fields=id,name,link&limit=5&access_token=${metaToken}`;
        const r = await fetch(url, { signal: AbortSignal.timeout(8000) });
        const d = await r.json();

        if (d?.data?.length > 0) {
          const qNorm = norm(query);
          let best: any = null;
          let bestScore = 0;

          for (const page of d.data) {
            const pNorm = norm(page.name || "");
            let score = pNorm === qNorm ? 100
              : (pNorm.includes(qNorm) || qNorm.includes(pNorm)) ? 60
              : Math.round((Math.min(pNorm.length, qNorm.length) / Math.max(pNorm.length || 1, qNorm.length)) * 40);
            // Bonus: domínio do site bate com nome da página
            if (websiteUrl) {
              try {
                const hostname = new URL(websiteUrl).hostname.replace("www.", "");
                if (norm(hostname).includes(norm(page.name?.split(" ")?.[0] || ""))) score += 20;
              } catch {}
            }
            if (score > bestScore) { bestScore = score; best = page; }
          }

          if (best && bestScore >= 40) {
            log.info("ai", "pageId encontrado via Graph API Search", { compName, query, pageId: best.id, pageName: best.name, score: bestScore });
            return best.id;
          }
        }
      } catch (e: any) {
        log.warn("ai", "Graph API pages/search falhou", { query, error: e.message?.slice(0, 60) });
      }
    }
  }

  // ── Estratégia 3: resolve username do Instagram → pageId vinculado ──────
  if (igUrl && metaToken) {
    const igUser = igUrl.match(/instagram\.com\/([\w.]+)/i)?.[1];
    if (igUser) {
      try {
        const r = await fetch(
          `https://graph.facebook.com/v20.0/${igUser}?fields=id,name&access_token=${metaToken}`,
          { signal: AbortSignal.timeout(6000) }
        );
        const d = await r.json();
        if (d?.id && /^\d+$/.test(d.id)) {
          log.info("ai", "pageId via Instagram username", { compName, igUser, pageId: d.id });
          return d.id;
        }
      } catch {}
    }
  }

  log.info("ai", `pageId não encontrado para "${compName}" após 3 estratégias`);
  return null;
}

async function discoverCompetitorData(
  competitorId: number,
  compName: string,
  metaToken?: string,
): Promise<{ pageId?: string; facebookPageUrl?: string; igUrl?: string; websiteUrl?: string }> {
  try {
    const existing = await db.getCompetitorById(competitorId);
    if (existing?.facebookPageId) return { pageId: existing.facebookPageId };
    if (existing?.websiteUrl) {
      const pageId = await resolvePageId(compName, existing.websiteUrl, existing.instagramUrl ?? undefined, metaToken);
      if (pageId) return { pageId };
    }
    log.info("ai", "discoverCompetitorData: sem dados suficientes para", { compName });
  } catch (e: any) {
    log.warn("ai", "discoverCompetitorData erro", { message: e.message?.slice(0, 80) });
  }
  return {};
}

function classifyAnalysisSource(opts: {
  sourceTypes: string[];
  compName: string;
  websiteUrl?: string | null;
  facebookPageId?: string | null;
  pageId?: string | null;
  pageUrl?: string | null;
  igUrl?: string | null;
  metaAccessDenied?: boolean;
  metaPermissionDenied?: boolean;
}): {
  fonte: string;
  hasReal: boolean;
  analysisStatus: string;
  isEstimatedData: boolean;
  integrationRequired: string | null;
} {
  const { sourceTypes, compName, websiteUrl } = opts;
  const pageId = opts.facebookPageId || opts.pageId;
  const hasReal = sourceTypes.some(isRealAdSource);
  const hasWebsite = sourceTypes.some(s => s === "website_scraping" || s === "seo_analysis");
  const hasAnyData = sourceTypes.length > 0;

  if (hasReal) {
    return {
      fonte: pageId ? `Meta Ads Library (pageId: ${pageId})` : "Meta Ads Library",
      hasReal: true,
      analysisStatus: "success",
      isEstimatedData: false,
      integrationRequired: null,
    };
  }
  if (hasWebsite && websiteUrl) {
    return {
      fonte: `Site do concorrente (${websiteUrl})`,
      hasReal: false,
      analysisStatus: "partial",
      isEstimatedData: true,
      integrationRequired: (opts.metaAccessDenied || opts.metaPermissionDenied) ? "Meta Ads Library API" : null,
    };
  }
  if (hasAnyData) {
    return {
      fonte: `Estimativa para "${compName}"`,
      hasReal: false,
      analysisStatus: "partial",
      isEstimatedData: true,
      integrationRequired: "Meta Ads Library API",
    };
  }
  return {
    fonte: `Sem dados para "${compName}"`,
    hasReal: false,
    analysisStatus: "failed",
    isEstimatedData: false,
    integrationRequired: "Meta Ads Library API",
  };
}

// ─────────────────────────────────────────────────────────────────────────────

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

// ── Compressor de prompt leve — remove seções pesadas para caber em modelos com token limit ──
function _compressPromptLight(prompt: string, maxChars: number): string {
  if (prompt.length <= maxChars) return prompt;
  let c = prompt;
  // 1) Remove bloco de políticas Meta Ads (3k chars) — modelos já conhecem as políticas
  const complianceStart = c.indexOf("COMPLIANCE META ADS 2026");
  const complianceEnd   = c.indexOf("VALIDAÇÃO:", complianceStart);
  if (complianceStart >= 0 && complianceEnd >= 0) {
    const lineEnd = c.indexOf("\n", complianceEnd + 10);
    c = c.slice(0, complianceStart)
      + "COMPLIANCE: Siga políticas Meta Ads padrão (sem claims garantidos, linguagem respeitosa).\n"
      + c.slice(lineEnd + 1);
  }
  if (c.length <= maxChars) return c;
  // 2) Remove glossário do schema JSON (800 chars)
  const glossStart = c.lastIndexOf('"glossary": [');
  if (glossStart >= 0) {
    const glossEnd = c.indexOf(']', glossStart + 13);
    if (glossEnd >= 0) c = c.slice(0, glossStart) + '"glossary": []' + c.slice(glossEnd + 1);
  }
  if (c.length <= maxChars) return c;
  // 3) Trunca restante mantendo contexto inicial (mais importante)
  return c.slice(0, maxChars) + "\n\n[CONTEXTO TRUNCADO — gere JSON completo com base nos dados acima]";
}

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
  // ── Atalho: se TODAS as chaves Gemini estão esgotadas, vai direto para fallbacks ──
  // Evita desperdiçar 5-8s tentando 5 modelos com chaves que já falharam
  if (retryCount === 0) {
    const allKeys = [GEMINI_API_KEY, GEMINI_API_KEY2, GEMINI_API_KEY3, GEMINI_API_KEY4, GEMINI_API_KEY5].filter(Boolean) as string[];
    const availableNow = allKeys.filter(k => !_exhaustedKeys.has(k));
    if (allKeys.length > 0 && availableNow.length === 0) {
      log.warn("ai", "Todas as chaves Gemini esgotadas — indo direto para fallbacks sem tentar modelos");
      // Tenta fallbacks em ordem: Groq → Genspark → Claude → mock
      // Comprime prompt para evitar Groq 413
      const _compressedForGroq = _compressPromptLight(prompt, 45000);
      const groqR = await callGroqAPI(_compressedForGroq, opts.systemInstruction, opts.temperature).catch(() => null);
      if (groqR) { log.info("ai", "✅ Groq fallback direto OK (quota Gemini)"); return groqR; }
      const gsR = await callGensparkAPI(prompt, opts.systemInstruction, opts.temperature).catch(() => null);
      if (gsR) { log.info("ai", "✅ Genspark fallback direto OK (quota Gemini)"); return gsR; }
      if (process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY) {
        const clR = await callClaudeAPI(_compressedForGroq, opts.systemInstruction, opts.temperature).catch(() => null);
        if (clR) { log.info("ai", "✅ Claude fallback direto OK (quota Gemini)"); return clR; }
      }
      // Último recurso: tenta OpenRouter (acesso a modelos gratuitos sem rate limit agressivo)
      if (process.env.OPENROUTER_API_KEY) {
        try {
          const orRes = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers: {
              "Content-Type":  "application/json",
              "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY}`,
              "HTTP-Referer":  "https://mecproai.com",
              "X-Title":       "MecProAI",
            },
            body: JSON.stringify({
              model:       "meta-llama/llama-3.1-8b-instruct:free",
              temperature: opts.temperature ?? 0.3,
              max_tokens:  4096,
              messages: [
                { role: "system", content: opts.systemInstruction || SYSTEM_MECPRO },
                { role: "user",   content: _compressPromptLight(prompt, 8000) },
              ],
            }),
            signal: AbortSignal.timeout(25000),
          });
          if (orRes.ok) {
            const orData: any = await orRes.json();
            const orText = orData?.choices?.[0]?.message?.content || "";
            if (orText) {
              log.info("ai", "✅ OpenRouter fallback OK (quota Gemini + Groq esgotados)");
              return orText;
            }
          }
        } catch (orErr: any) {
          log.warn("ai", "OpenRouter fallback falhou", { error: orErr.message?.slice(0,60) });
        }
      }
      log.warn("ai", "Todos os LLMs indisponíveis — usando mock response (quota Gemini esgotada)");
      return mockResponse(prompt);
    }
  }

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
    // Rastreia uso para controle de quota
    const estTokens = Math.round((prompt.length + result.length) / 4);
    trackLLMCall(estTokens);
  }
  return result;
}

// ── Groq API — fallback principal quando Gemini está indisponível ────────────
// Suporte a múltiplas chaves (GROQ_API_KEY, GROQ_API_KEY_01, _02, _03) para contornar rate limits
// Compatível com OpenAI API format. Modelos Llama 3 gratuitos.

// Rastreamento de rate limit por chave Groq
const _groqRateLimited = new Map<string, number>(); // key → timestamp
const GROQ_RATE_RESET_MS = 62 * 1000; // 62s — free tier reseta por minuto

function getAvailableGroqKey(): string | null {
  const keys = [
    process.env.GROQ_API_KEY,
    process.env.GROQ_API_KEY_01,
    process.env.GROQ_API_KEY_02,
    process.env.GROQ_API_KEY_03,
  ].filter(Boolean) as string[];
  if (!keys.length) return null;
  const now = Date.now();
  // Libera chaves cujo rate limit já expirou
  for (const [k, ts] of _groqRateLimited.entries()) {
    if (now - ts > GROQ_RATE_RESET_MS) _groqRateLimited.delete(k);
  }
  // Retorna primeira chave disponível
  const available = keys.filter(k => !_groqRateLimited.has(k));
  if (available.length > 0) return available[0];
  // Todas em rate limit — retorna a mais antiga (provavelmente já liberada)
  const oldest = [..._groqRateLimited.entries()].sort((a,b) => a[1]-b[1])[0];
  return oldest ? oldest[0] : keys[0];
}

async function callGroqAPI(
  prompt: string,
  systemInstruction?: string,
  temperature: number = 0.3,
): Promise<string | null> {
  const apiKey = getAvailableGroqKey();
  if (!apiKey) {
    log.info("ai", "Groq API: nenhuma GROQ_API_KEY configurada — pulando fallback");
    return null;
  }

  // Modelo principal: llama-3.3-70b-versatile (128k ctx)
  // Fallback interno: llama-3.1-8b-instant (8k ctx — só para prompts curtos)
  const models = [
    process.env.GROQ_MODEL || "llama-3.3-70b-versatile",
    "llama-3.1-8b-instant",
  ];

  for (const model of models) {
    try {
      // Groq token limits (chars ≈ tokens * 4):
      // llama-3.3-70b-versatile: 128k ctx → ~100k chars safe
      // llama-3.1-8b-instant: 8k ctx → ~12k chars safe
      // O Groq retorna 413 quando o payload JSON excede ~1MB — truncar mais agressivamente
      const maxChars = model.includes("8b") ? 6000 : 50000;
      const truncatedPrompt = prompt.length > maxChars
        ? prompt.slice(0, maxChars) + "\n\n[CONTEXTO TRUNCADO — gere a resposta JSON completa com base no que foi fornecido acima]"
        : prompt;

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
            { role: "user",    content: truncatedPrompt },
          ],
        }),
        signal: AbortSignal.timeout(30000),
      });

      if (res.status === 429) {
        // Marca esta chave como em rate limit e tenta outra chave imediatamente
        _groqRateLimited.set(apiKey, Date.now());
        const nextKey = getAvailableGroqKey();
        if (nextKey && nextKey !== apiKey) {
          log.warn("ai", `Groq 429 na chave atual — trocando para chave alternativa`, { model });
          // Retenta imediatamente com a nova chave
          const retryRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST",
            headers: { "Content-Type": "application/json", "Authorization": `Bearer ${nextKey}` },
            body: JSON.stringify({ model, temperature, max_tokens: 8192,
              response_format: { type: "json_object" },
              messages: [
                { role: "system", content: systemInstruction || SYSTEM_MECPRO },
                { role: "user",   content: truncatedPrompt },
              ],
            }),
            signal: AbortSignal.timeout(30000),
          }).catch(() => null);
          if (retryRes?.ok) {
            const retryData: any = await retryRes.json().catch(() => null);
            const retryText = retryData?.choices?.[0]?.message?.content || "";
            if (retryText) {
              log.info("ai", "Groq OK com chave alternativa após 429", { model });
              return retryText;
            }
          }
        } else {
          // Sem chave alternativa — espera 5s antes de tentar próximo modelo
          log.warn("ai", `Groq 429 — sem chave alternativa, aguardando 5s`, { model });
          await new Promise(r => setTimeout(r, 5000));
        }
        continue;
      }
      if (res.status === 413) {
        log.warn("ai", `Groq 413 (prompt muito grande) no modelo ${model} — truncando mais`);
        continue; // próximo modelo com prompt ainda menor
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
  const isEcommerce = /loja|compra|varejo/i.test(prompt);
  const nicho = isImoveis ? "imobiliario" : isServico ? "servicos" : isEcommerce ? "e-commerce" : "negocios";

  if (lower.includes("anuncio") || lower.includes("concorrente") || lower.includes("ads") || lower.includes("analyze-competitor")) {
    const ctas = isImoveis
      ? ["Agendar visita", "Falar com corretor", "Ver imovel", "Solicitar proposta"]
      : isServico ? ["Agendar consulta", "Falar no WhatsApp", "Saiba mais", "Ver disponibilidade"]
      : ["Comprar agora", "Ver oferta", "Falar no WhatsApp", "Quero desconto"];
    const positioning = isImoveis
      ? "Tom aspiracional com foco em qualidade de vida e exclusividade. Destaque em localizacao privilegiada."
      : isServico ? "Tom de autoridade com foco em resultado comprovado e atendimento humanizado."
      : "Tom direto com foco em oferta e urgencia.";
    return JSON.stringify({
      topFormats: [
        { format: "video", percentage: 65, insight: "Formato dominante para awareness" },
        { format: "imagem", percentage: 25, insight: "Ideal para conversao" },
        { format: "carrossel", percentage: 10, insight: "Bom para showcasing" },
      ],
      topCtaPatterns: ctas,
      estimatedFunnel: "TOF 60% video frio. MOF 25% carrossel. BOF 15% oferta direta.",
      winnerPatterns: "Headlines com numero e beneficio. Copy curto. Pergunta retorica na abertura.",
      positioning,
      competitorWeaknesses: "1. Sem prova social. 2. CTAs genericos. 3. Sem segmentacao por funil.",
      recommendations: "1. Videos com depoimento real. 2. CTA especifico. 3. Separar por temperatura.",
    });
  }
  if (lower.includes("mercado") || lower.includes("oportunidade") || lower.includes("market-analysis")) {
    return JSON.stringify({
      competitiveGaps: isImoveis
        ? "Concorrentes focam em 30-45 anos. Investidores 50+ sub-atendidos. Poucos usam tour virtual Reels."
        : "Publico maduro (40+) sub-atendido no segmento " + nicho + ".",
      unexploredOpportunities: isImoveis
        ? "1. Tour virtual 360 via Reels\n2. Parceria arquitetos\n3. Remarketing 30-90 dias\n4. WhatsApp automatizado"
        : "1. Stories interativos\n2. Micro-influenciadores\n3. Remarketing comportamental\n4. Conteudo educativo",
      suggestedPositioning: isImoveis
        ? "Premium com foco em estilo de vida e valorizacao. Diferencial: atendimento consultivo."
        : "Referencia de qualidade com resultado rapido. Diferencial: personalizacao e prova social.",
      threats: isImoveis
        ? "Concorrentes aumentando investimento Meta Ads. Ciclo de decisao longo (90-180 dias)."
        : "Concorrente principal aumentou investimento 40% em 60 dias.",
      competitiveMap: "Lider: alto investimento, tom corporativo. Oportunidade: premium com relacionamento.",
    });
  }
  const nichoLabel = isImoveis ? "imóveis" : isServico ? "serviços" : isEcommerce ? "e-commerce" : nicho;
  return JSON.stringify({
    strategy: `Campanha em 3 fases para ${nichoLabel}: Fase 1 (semanas 1-2) — awareness com video curto para público frio. Fase 2 (semanas 3-4) — consideração com carrossel para público morno e visitantes do site. Fase 3 (semanas 5-8) — conversão com oferta direta para remarketing de 7 dias. Orçamento distribuído: 40% frio / 35% morno / 25% quente.`,
    adSets: [
      {
        name: "TOF — Público Frio",
        audience: "Lookalike 1-3% baseado em clientes, 25-45 anos",
        budget: "40%", objective: "Awareness / Alcance",
        placements: ["feed", "stories", "reels"],
        duration: "14 dias",
      },
      {
        name: "MOF — Engajados e Visitantes",
        audience: "Visitantes do site (30 dias) + Engajadores da página (60 dias)",
        budget: "35%", objective: "Consideração / Tráfego",
        placements: ["feed", "stories"],
        duration: "14 dias",
      },
      {
        name: "BOF — Remarketing Quente",
        audience: "Visitantes produto (7 dias) + Iniciaram checkout",
        budget: "25%", objective: "Conversão",
        placements: ["feed", "stories"],
        duration: "Contínuo",
      },
    ],
    creatives: [
      {
        type: "direct_offer", format: "Vídeo 15s", orientation: "vertical_9_16",
        headline: `Descubra por que centenas escolhem ${nichoLabel}`,
        copy: `Resultados reais, sem enrolação. Veja como nossos clientes transformaram sua situação com ${nichoLabel}. Comece hoje mesmo.`,
        bodyText: `Resultados reais, sem enrolação. Veja como nossos clientes transformaram sua situação com ${nichoLabel}. Comece hoje mesmo.`,
        hook: `Você ainda não sabe disso sobre ${nichoLabel}?`,
        pain: "Tempo e dinheiro desperdiçados sem resultado concreto",
        solution: `Método comprovado em ${nichoLabel} com suporte completo`,
        cta: "Saiba Mais", funnelStage: "TOF", complianceScore: "safe",
        targetAudience: `25-45 anos interessados em ${nichoLabel}`,
        platforms: ["meta"], budget: 50, duration: 7,
      },
      {
        type: "social_proof", format: "Carrossel", orientation: "feed_1_1",
        headline: "Veja o que nossos clientes dizem",
        copy: `+500 clientes satisfeitos com nossos serviços de ${nichoLabel}. Resultados reais, histórias verdadeiras.`,
        bodyText: `+500 clientes satisfeitos com nossos serviços de ${nichoLabel}. Resultados reais, histórias verdadeiras.`,
        hook: "Antes e depois: confira os resultados reais",
        pain: "Dificuldade em encontrar uma solução confiável",
        solution: "Provas sociais e depoimentos verificados",
        cta: "Ver Depoimentos", funnelStage: "MOF", complianceScore: "safe",
        targetAudience: `Engajados com ${nichoLabel}, 28-50 anos`,
        platforms: ["meta"], budget: 40, duration: 14,
      },
      {
        type: "urgency_offer", format: "Imagem estática", orientation: "feed_4_5",
        headline: "Oferta especial — vagas limitadas",
        copy: `Não perca essa oportunidade em ${nichoLabel}. Condições especiais disponíveis apenas para quem agir agora.`,
        bodyText: `Não perca essa oportunidade em ${nichoLabel}. Condições especiais disponíveis apenas para quem agir agora.`,
        hook: "Últimas vagas com condições especiais",
        pain: "Risco de perder a oportunidade",
        solution: "Ação imediata com garantia de satisfação",
        cta: "Aproveitar Agora", funnelStage: "BOF", complianceScore: "safe",
        targetAudience: `Remarketing quente — visitaram ${nichoLabel} nos últimos 7 dias`,
        platforms: ["meta"], budget: 30, duration: 7,
      },
    ],
    conversionFunnel: [
      { stage: "Awareness", format: "Vídeo 15s Reels", audience: "Frio — Lookalike 1-3%", budget: "40%", kpi: "CPM < R$8 | Alcance máximo" },
      { stage: "Consideração", format: "Carrossel Feed", audience: "Morno — Engajadores 60d", budget: "35%", kpi: "CTR > 2% | CPC < R$1,50" },
      { stage: "Conversão", format: "Imagem + Oferta", audience: "Quente — Visitantes 7d", budget: "25%", kpi: "ROAS > 3x | CPL < R$15" },
    ],
    executionPlan: [
      { week: "Semana 1-2", action: "Lançar campanha TOF com vídeo criativo", budget: "R$200", kpi: "Alcance mínimo 5.000 pessoas" },
      { week: "Semana 3-4", action: "Ativar MOF com carrossel para público morno", budget: "R$175", kpi: "CTR > 2%, CPC < R$1,50" },
      { week: "Semana 5-8", action: "Remarketing BOF com oferta urgente", budget: "R$125/sem", kpi: "Conversões e ROAS > 3x" },
    ],
    campaignName: `Campanha ${nichoLabel} — Fase 1`,
    metrics: {
      estimatedCPC: isImoveis ? "R$ 1,20" : isServico ? "R$ 0,90" : "R$ 0,60",
      estimatedCPM: isImoveis ? "R$ 9,50" : "R$ 7,00",
      estimatedCTR: "2,8%",
      estimatedReach: "8.000 a 25.000 pessoas/mês",
      recommendedBudget: isImoveis ? "R$ 800 a R$ 2.000/mês" : "R$ 400 a R$ 1.200/mês",
    },
  });
}




// ════════════════════════════════════════════════════════════════════════════
// SISTEMA DE CONTROLE DE QUOTA E MODO ECONÔMICO
// Controla quando usar LLM vs motor determinístico
// ════════════════════════════════════════════════════════════════════════════

// Contadores de uso por janela de 15min
const _quotaWindow = {
  startMs:     Date.now(),
  windowMs:    15 * 60 * 1000,
  calls:       0,
  tokens:      0,
  maxCalls:    50,    // máximo de chamadas por janela (free tier ~60/min mas conservador)
  maxTokens:   500_000, // ~500k tokens por janela (limita custo)
  ecoMode:     false, // ativado automaticamente quando quota está perto do limite
  ecoThreshold: 0.8,  // ativa modo eco quando 80% da quota usada
};

function _resetWindowIfNeeded() {
  const now = Date.now();
  if (now - _quotaWindow.startMs > _quotaWindow.windowMs) {
    _quotaWindow.startMs = now;
    _quotaWindow.calls   = 0;
    _quotaWindow.tokens  = 0;
    _quotaWindow.ecoMode = false;
    log.info("ai", "Quota window resetada", { newWindow: new Date(now).toISOString() });
  }
}

export function trackLLMCall(tokens: number) {
  _resetWindowIfNeeded();
  _quotaWindow.calls++;
  _quotaWindow.tokens += tokens;
  const callsPct  = _quotaWindow.calls  / _quotaWindow.maxCalls;
  const tokensPct = _quotaWindow.tokens / _quotaWindow.maxTokens;
  const usage = Math.max(callsPct, tokensPct);
  if (usage >= _quotaWindow.ecoThreshold && !_quotaWindow.ecoMode) {
    _quotaWindow.ecoMode = true;
    log.warn("ai", `🔋 Modo econômico ATIVADO — quota ${Math.round(usage*100)}% usada`, {
      calls: _quotaWindow.calls, tokens: _quotaWindow.tokens,
    });
  }
}

// Retorna true se deve usar LLM, false se deve usar motor determinístico
export function shouldUseLLM(priority: "high" | "medium" | "low" = "medium"): boolean {
  _resetWindowIfNeeded();
  if (_quotaWindow.ecoMode) {
    // No modo econômico: só usa LLM para prioridade alta
    return priority === "high";
  }
  // Modo normal: sempre usa LLM (exceto se todas as chaves esgotadas)
  const allKeys = [GEMINI_API_KEY, GEMINI_API_KEY2, GEMINI_API_KEY3, GEMINI_API_KEY4, GEMINI_API_KEY5].filter(Boolean);
  const available = allKeys.filter(k => !_exhaustedKeys.has(k));
  return available.length > 0;
}

export function getQuotaStatus() {
  _resetWindowIfNeeded();
  const callsPct  = Math.round(_quotaWindow.calls  / _quotaWindow.maxCalls  * 100);
  const tokensPct = Math.round(_quotaWindow.tokens / _quotaWindow.maxTokens * 100);
  return {
    ecoMode:   _quotaWindow.ecoMode,
    callsPct,
    tokensPct,
    calls:     _quotaWindow.calls,
    tokens:    _quotaWindow.tokens,
    maxCalls:  _quotaWindow.maxCalls,
    maxTokens: _quotaWindow.maxTokens,
    windowMinutes: Math.round((_quotaWindow.windowMs - (Date.now() - _quotaWindow.startMs)) / 60000),
  };
}


// ════════════════════════════════════════════════════════════════════════════
// CACHE DE RESPOSTAS LLM — evita chamadas repetidas para prompts similares
// TTL: 15min para insights, 60min para market analysis, 5min para copies
// ════════════════════════════════════════════════════════════════════════════

interface CacheEntry { value: string; expiresAt: number; hits: number; }
const _llmCache = new Map<string, CacheEntry>();
let _cacheHits = 0, _cacheMisses = 0;

function _cacheKey(prompt: string, fn: string): string {
  // Gera chave baseada nos primeiros 200 chars + últimos 100 chars do prompt
  const sig = prompt.slice(0, 200) + "|" + prompt.slice(-100) + "|" + fn;
  // Hash simples por soma de char codes
  let h = 0;
  for (let i = 0; i < sig.length; i++) h = (h * 31 + sig.charCodeAt(i)) & 0xffffffff;
  return fn + "_" + Math.abs(h).toString(36);
}

export function cacheGet(prompt: string, fn: string): string | null {
  const key = _cacheKey(prompt, fn);
  const entry = _llmCache.get(key);
  if (!entry || Date.now() > entry.expiresAt) {
    _llmCache.delete(key);
    _cacheMisses++;
    return null;
  }
  entry.hits++;
  _cacheHits++;
  log.info("ai", `Cache HIT [${fn}]`, { key: key.slice(0, 12), hits: entry.hits });
  return entry.value;
}

export function cacheSet(prompt: string, fn: string, value: string, ttlMs = 15 * 60 * 1000) {
  const key = _cacheKey(prompt, fn);
  _llmCache.set(key, { value, expiresAt: Date.now() + ttlMs, hits: 0 });
  // Limpa entradas expiradas a cada 100 sets
  if (_llmCache.size % 100 === 0) {
    const now = Date.now();
    for (const [k, v] of _llmCache) { if (now > v.expiresAt) _llmCache.delete(k); }
  }
}

export function getCacheStats() {
  const total = _cacheHits + _cacheMisses;
  return {
    size: _llmCache.size,
    hits: _cacheHits,
    misses: _cacheMisses,
    hitRate: total > 0 ? Math.round(_cacheHits / total * 100) : 0,
  };
}


// ── Análise de mercado determinística — usa dados reais do banco ──────────────
// Chamado quando LLMs falham OU modo econômico ativo
function buildMarketAnalysisFromData(
  competitors: any[],
  allAds: any[],
  clientProfile: any,
  adPatterns: any[],
): any {
  const niche   = clientProfile?.niche || "negócios";
  const company = clientProfile?.companyName || "sua empresa";
  const total   = allAds.length;

  if (total === 0) {
    return {
      competitiveGaps:         `Nenhum dado coletado ainda — adicione concorrentes e execute análise.`,
      unexploredOpportunities: `Cadastre concorrentes no Módulo 2 para análise competitiva real.`,
      suggestedPositioning:    `Defina seu nicho no perfil do cliente para análise personalizada.`,
      threats:                 `Sem dados de concorrentes — mercado não mapeado.`,
      competitiveMap:          `0 concorrentes | 0 anúncios`,
    };
  }

  // Analisa dados reais
  const activeAds   = allAds.filter((a: any) => a.isActive);
  const activeRate  = Math.round(activeAds.length / total * 100);

  // Formatos dominantes dos concorrentes
  const fmtCount: Record<string, number> = {};
  for (const a of allAds) { const f = a.adType || "image"; fmtCount[f] = (fmtCount[f]||0)+1; }
  const fmtRanked = Object.entries(fmtCount).sort((x:any,y:any)=>y[1]-x[1]);
  const topFmt    = fmtRanked[0]?.[0] || "image";
  const topFmtPct = Math.round((fmtRanked[0]?.[1]||0) / total * 100);
  const unusedFmts = ["image","video","carousel"].filter(f => !fmtCount[f] || fmtCount[f] < 2);

  // CTAs dominantes
  const ctaCount: Record<string, number> = {};
  for (const a of allAds) { if (a.cta) ctaCount[a.cta] = (ctaCount[a.cta]||0)+1; }
  const topCtas = Object.entries(ctaCount).sort((x:any,y:any)=>y[1]-x[1]).slice(0,3).map(([k])=>k);

  // Padrões de copy (da tabela ad_patterns)
  const patternTones = adPatterns.reduce((acc:any, p:any)=>{acc[p.tone]=(acc[p.tone]||0)+1;return acc;},{});
  const dominantTone = Object.entries(patternTones).sort((x:any,y:any)=>y[1]-x[1])[0]?.[0] || "rational";
  const hasUrgency   = adPatterns.some((p:any) => p.tone === "urgent");
  const hasEmotional = adPatterns.some((p:any) => p.tone === "emotional");
  const hasPremium   = adPatterns.some((p:any) => p.tone === "premium");

  // Concorrente mais ativo
  const compActivity: Record<string, number> = {};
  for (const a of activeAds) { const n = a.competitorName || "?"; compActivity[n] = (compActivity[n]||0)+1; }
  const mostActive = Object.entries(compActivity).sort((x:any,y:any)=>y[1]-x[1])[0];

  // Análise de longevidade (ads mais antigos = mais testados)
  const longRunning = allAds.filter((a:any) => {
    if (!a.startDate) return false;
    const days = (Date.now() - new Date(a.startDate).getTime()) / 86400000;
    return days > 14;
  });

  // Gaps reais baseados nos dados
  const gaps: string[] = [];
  if (unusedFmts.length > 0) gaps.push(`Formatos ${unusedFmts.join("/")} pouco explorados pelos concorrentes (< 2 ads)`);
  if (!hasEmotional) gaps.push("Copy emocional ausente nos concorrentes — oportunidade para diferenciação por identidade");
  if (!hasPremium)   gaps.push("Posicionamento premium não explorado — espaço para oferta de alto valor");
  if (topCtas.length <= 2) gaps.push("Pouca variação de CTA — mercado testando pouco WhatsApp vs formulário vs agendamento");
  if (activeRate < 40) gaps.push("Concorrentes com baixa atividade atual — janela favorável para aumentar pressão");

  // Oportunidades
  const opps: string[] = [];
  if (longRunning.length > 3) opps.push(`${longRunning.length} anúncios rodando há mais de 14 dias — padrões vencedores identificados para replicar`);
  if (!hasEmotional) opps.push("Mercado focado em racional — copy emocional terá baixa competição e maior recall");
  if (unusedFmts.includes("video")) opps.push("Vídeo curto (15-30s) pouco usado pelos concorrentes — alto potencial de engajamento");
  if (unusedFmts.includes("carousel")) opps.push("Carrossel pouco explorado — ideal para mostrar múltiplos produtos/benefícios");

  return {
    competitiveGaps: gaps.length > 0 ? gaps.map((g,i)=>`${i+1}. ${g}`).join("\n") : `Concorrentes bem distribuídos — diferenciação por qualidade de copy e frequência.`,
    unexploredOpportunities: opps.length > 0 ? opps.map((o,i)=>`${i+1}. ${o}`).join("\n") : `Continue monitorando — banco de padrões crescendo com cada análise.`,
    suggestedPositioning: `Diferencie ${company} pelo tom ${dominantTone === "rational" ? "emocional" : "racional"} e formato ${unusedFmts[0]||"vídeo"}. Concorrentes dominam ${topFmt} (${topFmtPct}%) com CTAs ${topCtas.join("/")} — explore o gap.`,
    threats: mostActive ? `${mostActive[0]} mais ativo (${mostActive[1]} anúncios rodando). ${activeRate}% dos anúncios dos concorrentes estão ativos — mercado ${activeRate > 60 ? "aquecido" : "moderado"}.` : `${competitors.length} concorrentes monitorados. ${total} anúncios na base.`,
    competitiveMap: `${competitors.length} concorrentes | ${total} anúncios | ${activeAds.length} ativos (${activeRate}%) | Formato líder: ${topFmt} ${topFmtPct}% | Tom dominante: ${dominantTone} | Padrões salvos: ${adPatterns.length}`,
  };
}

// ════════════════════════════════════════════════════════════════════════════
// MOTOR HÍBRIDO — geração de anúncios sem LLM + refinamento opcional
// Etapas: 1) extrai padrões dos scraped_ads  2) recombina  3) gera variações
//          4) usa LLM APENAS para humanização final (prompt <500 tokens)
// Redução estimada de tokens: 70-80% vs geração 100% via IA
// ════════════════════════════════════════════════════════════════════════════

// ── Classifica estrutura de copy pelo texto ──────────────────────────────────
function detectCopyStructure(headline: string, body: string): "AIDA" | "PAS" | "FAB" | "direct" {
  const h = (headline + " " + body).toLowerCase();
  if (/problema|dor|sofrendo|cansado|difícil/i.test(h)) return "PAS";
  if (/benefício|vantagem|característica|feature/i.test(h))  return "FAB";
  if (/atenção|interesse|desejo|ação/i.test(h))              return "AIDA";
  return "direct";
}

// ── Detecta tom predominante do anúncio ─────────────────────────────────────
function detectTone(headline: string, body: string): "urgent" | "emotional" | "rational" | "premium" {
  const t = (headline + " " + body).toLowerCase();
  if (/agora|hoje|últimas|vagas|limite|expira|acabando/i.test(t))      return "urgent";
  if (/sonho|amor|família|feliz|realiz|transforma|vida/i.test(t))       return "emotional";
  if (/comprove|dado|resultado|garantia|prova|estudos/i.test(t))        return "rational";
  if (/exclusiv|premium|luxo|seleto|único|vip|alto padrão/i.test(t))   return "premium";
  return "rational";
}

// ── Substitui placeholders do template com dados reais do cliente ────────────
function fillTemplate(tpl: string, vars: Record<string, string>): string {
  return tpl.replace(/\{(\w+)\}/g, (_, k) => vars[k] || "");
}

// ── Gera variações de tom sem LLM ────────────────────────────────────────────
function applyToneVariation(
  headline: string, body: string, cta: string,
  targetTone: "urgent" | "emotional" | "rational" | "premium"
): { headline: string; body: string; cta: string } {
  const prefixes: Record<string, string[]> = {
    urgent:    ["⚡ Últimas vagas:", "🔥 Só hoje:", "⏰ Oferta limitada:"],
    emotional: ["✨ Realize o sonho:", "💚 Para quem merece:", "🌟 Transforme sua vida:"],
    rational:  ["📊 Resultado comprovado:", "✅ Dados reais:", "🎯 Eficiência garantida:"],
    premium:   ["👑 Exclusivo:", "💎 Alto padrão:", "🏆 Para quem exige o melhor:"],
  };
  const ctaSuffix: Record<string, string> = {
    urgent:    " — Garanta agora",
    emotional: " e realize seu sonho",
    rational:  " e veja os resultados",
    premium:   " — Acesso exclusivo",
  };
  const prefix = prefixes[targetTone][Math.floor(Math.random() * prefixes[targetTone].length)];
  return {
    headline: `${prefix} ${headline}`,
    body,
    cta: cta + ctaSuffix[targetTone],
  };
}

// ── Extrai e salva padrões de scraped_ads automaticamente ────────────────────
export async function extractAndSavePatterns(
  ads: any[], niche: string
): Promise<number> {
  let saved = 0;
  for (const ad of ads) {
    // Só ads reais e longevos viram padrão
    if (!ad.headline || ad.headline.length < 10) continue;
    const source = (ad.source || "").toLowerCase();
    if (source.includes("estimated") || source.includes("mock")) continue;

    const longevityDays = ad.startDate
      ? Math.round((Date.now() - new Date(ad.startDate).getTime()) / 86400000)
      : 0;

    // Mínimo 7 dias ativo para virar padrão
    if (longevityDays < 7 && !ad.isActive) continue;

    const structure = detectCopyStructure(ad.headline, ad.bodyText || "");
    const tone      = detectTone(ad.headline, ad.bodyText || "");

    // Converte headline em template: substitui nome da empresa por {empresa}
    // e números específicos por {numero}
    const headline_tpl = ad.headline
      .replace(/\d{4,}/g, "{numero}")
      .trim();

    const tags: string[] = [];
    if (/exclusiv|premium|luxo/i.test(ad.headline))   tags.push("exclusividade");
    if (/agora|hoje|limite/i.test(ad.headline))        tags.push("urgência");
    if (/resultado|prova|garantia/i.test(ad.headline)) tags.push("prova_social");
    if (/sonho|família|vida/i.test(ad.headline))       tags.push("emocional");
    if (/\d/.test(ad.headline))                        tags.push("numeros");

    try {
      await db.upsertAdPattern({
        niche, structure, tone,
        headline_tpl,
        body_tpl:      ad.bodyText?.slice(0, 300) || undefined,
        cta_tpl:       ad.cta || undefined,
        tags,
        longevity_days: longevityDays,
        source_ad_id:  ad.id || undefined,
      });
      saved++;
    } catch {}
  }
  if (saved > 0) log.info("ai", "Padrões extraídos e salvos", { niche, saved });
  return saved;
}

// ── Motor principal: gera anúncios sem LLM (ou com LLM mínimo) ──────────────
export async function hybridGenerateAds(opts: {
  niche:         string;
  clientName:    string;
  product:       string;
  targetAudience?: string;
  tones?:        Array<"urgent" | "emotional" | "rational" | "premium">;
  useLLMRefine?: boolean;   // false = 100% local, true = LLM só humaniza
  count?:        number;
}): Promise<{
  ads: Array<{ headline: string; body: string; cta: string; tone: string; structure: string; source: "pattern"|"llm" }>;
  tokensUsed: number;
  source: "hybrid"|"llm_only";
}> {
  const { niche, clientName, product, targetAudience, tones = ["urgent","emotional","rational","premium"], useLLMRefine = false, count = 4 } = opts;

  const vars = { empresa: clientName, produto: product, publico: targetAudience || "seu público" };
  const patternAds: any[] = [];
  let tokensUsed = 0;

  // Busca padrões do banco para este nicho
  for (const tone of tones.slice(0, count)) {
    const patterns = await db.getAdPatterns(niche, tone, 3);

    if (patterns.length > 0) {
      // Usa padrão do banco — sem LLM
      const p = patterns[Math.floor(Math.random() * patterns.length)];
      const varied = applyToneVariation(
        fillTemplate(p.headline_tpl, vars),
        fillTemplate(p.body_tpl || "", vars),
        fillTemplate(p.cta_tpl || "Saiba mais", vars),
        tone
      );
      patternAds.push({ ...varied, tone, structure: p.structure, source: "pattern", patternId: p.id });
      await db.incrementPatternUsage(p.id);
    } else {
      // Sem padrão no banco — gera localmente com template base por nicho
      const base = buildBaseTemplate(niche, tone, vars);
      patternAds.push({ ...base, tone, structure: "direct", source: "pattern" });
    }
  }

  // LLM usado APENAS para humanização — prompt <500 tokens
  if (useLLMRefine && patternAds.length > 0) {
    const refinePrompt = `Humanize e melhore estes anúncios mantendo a estrutura. Responda em JSON array com os mesmos campos (headline, body, cta):
${JSON.stringify(patternAds.map(a => ({ headline: a.headline, body: a.body, cta: a.cta })))}
Contexto: empresa="${clientName}", produto="${product}", nicho="${niche}".
Regra: não mude o tom, apenas torne mais natural e persuasivo. Máx 10 palavras por headline.`;

    tokensUsed = Math.round(refinePrompt.length / 4); // estimativa

    try {
      const raw = await gemini(refinePrompt, { temperature: 0.4, maxOutputTokens: 1000 });
      const refined = JSON.parse(raw.replace(/```json|```/g, "").trim());
      if (Array.isArray(refined)) {
        return {
          ads: refined.map((r: any, i: number) => ({
            headline:  r.headline  || patternAds[i].headline,
            body:      r.body      || patternAds[i].body,
            cta:       r.cta       || patternAds[i].cta,
            tone:      patternAds[i].tone,
            structure: patternAds[i].structure,
            source:    "llm" as const,
          })),
          tokensUsed,
          source: "hybrid",
        };
      }
    } catch {
      log.warn("ai", "LLM refinamento falhou — retornando padrões sem refinamento");
    }
  }

  return { ads: patternAds, tokensUsed, source: "hybrid" };
}

// ── Templates base por nicho (fallback quando banco vazio) ───────────────────
function buildBaseTemplate(
  niche: string, tone: string, vars: Record<string, string>
): { headline: string; body: string; cta: string } {
  const isImoveis  = /imov|imobi|apart|casa/i.test(niche);
  const isServico  = /clinica|saude|beleza|estetica|restaurante/i.test(niche);
  const isTech     = /tech|software|app|saas|digital/i.test(niche);

  const bases: Record<string, Record<string, { h: string; b: string; c: string }>> = {
    urgent: {
      imoveis:  { h: `Última unidade disponível — ${vars.produto}`, b: `Oportunidade única em ${vars.empresa}. Reserve agora antes que acabe.`, c: "Reservar agora" },
      servico:  { h: `Agenda quase cheia — ${vars.produto}`, b: `Poucos horários disponíveis esta semana em ${vars.empresa}.`, c: "Garantir vaga" },
      default:  { h: `Oferta por tempo limitado — ${vars.produto}`, b: `${vars.empresa} com condições especiais só hoje.`, c: "Aproveitar agora" },
    },
    emotional: {
      imoveis:  { h: `O lar que você sempre sonhou está aqui`, b: `${vars.empresa} transforma o sonho da casa própria em realidade.`, c: "Conhecer agora" },
      servico:  { h: `Cuide de quem você ama com ${vars.produto}`, b: `${vars.empresa} — porque você merece o melhor cuidado.`, c: "Agendar consulta" },
      default:  { h: `Transforme sua vida com ${vars.produto}`, b: `Milhares de clientes já mudaram de vida com ${vars.empresa}.`, c: "Quero mudar" },
    },
    rational: {
      imoveis:  { h: `${vars.produto}: rentabilidade comprovada`, b: `Valorização média de 15% ao ano. Dados reais de ${vars.empresa}.`, c: "Ver análise" },
      servico:  { h: `Resultado garantido ou dinheiro de volta`, b: `${vars.empresa} com taxa de satisfação de 98% comprovada.`, c: "Ver resultados" },
      default:  { h: `Dados reais: ${vars.produto} funciona`, b: `${vars.empresa} — resultados mensuráveis em 30 dias.`, c: "Ver dados" },
    },
    premium: {
      imoveis:  { h: `Exclusivo: ${vars.produto} para quem exige o melhor`, b: `${vars.empresa} — alto padrão com atendimento consultivo personalizado.`, c: "Solicitar proposta" },
      servico:  { h: `Experiência premium em ${vars.produto}`, b: `Atendimento VIP em ${vars.empresa}. Seleto por natureza.`, c: "Agendar VIP" },
      default:  { h: `${vars.produto} — nível executivo`, b: `${vars.empresa} para quem não aceita menos que o melhor.`, c: "Quero o premium" },
    },
  };

  const category = isImoveis ? "imoveis" : isServico ? "servico" : "default";
  const tpl = bases[tone]?.[category] || bases["rational"]["default"];
  return { headline: tpl.h, body: tpl.b, cta: tpl.c };
}


// ── Gemini com Google Search grounding ────────────────────────────────────────
export async function geminiWithGrounding(prompt: string): Promise<any | null> {
  const allKeys = [GEMINI_API_KEY, GEMINI_API_KEY2, GEMINI_API_KEY3, GEMINI_API_KEY4, GEMINI_API_KEY5].filter(Boolean) as string[];
  const availableKeys = allKeys.filter(k => !_exhaustedKeys.has(k));
  const apiKey = availableKeys[0] || allKeys[0];
  if (!apiKey) return null;

  for (const model of ["gemini-2.0-flash", "gemini-2.5-flash"]) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: AbortSignal.timeout(20000),
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          tools: [{ google_search: {} }],
          generationConfig: { temperature: 0, maxOutputTokens: 256 },
        }),
      });
      const data: any = await res.json();
      if (data.error) { log.warn("ai", "geminiWithGrounding erro", { model, error: data.error.message?.slice(0, 60) }); continue; }

      const text = (data.candidates?.[0]?.content?.parts || []).map((p: any) => p.text || "").join("").trim();
      const queries = data.candidates?.[0]?.groundingMetadata?.webSearchQueries || [];
      if (queries.length > 0) log.info("ai", "geminiWithGrounding buscas", { model, queries });
      if (!text) continue;

      try {
        return JSON.parse(text.replace(/```json|```/g, "").trim());
      } catch {
        const m = text.match(/"pageId"\s*:\s*"?(\d{10,16})"?/);
        if (m?.[1]) return { pageId: m[1], confidence: "medium" };
        return null;
      }
    } catch {}
  }
  return null;
}


// ── Parser HTML determinístico — extrai ads do site sem LLM ─────────────────
function parseHtmlIntoAds(html: string, competitorId: number, websiteUrl: string): any[] {
  const ads: any[] = [];
  if (!html || html.length < 50) return ads;
  const title   = html.match(/<title[^>]*>([^<]{3,120})<\/title>/i)?.[1]?.trim() || "";
  const metaDesc= html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']{10,300})["']/i)?.[1]?.trim()
    || html.match(/<meta[^>]+content=["']([^"']{10,300})["'][^>]+name=["']description["']/i)?.[1]?.trim() || "";
  const ogTitle = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']{3,120})["']/i)?.[1]?.trim() || "";
  const ogDesc  = html.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']{10,300})["']/i)?.[1]?.trim() || "";
  const h1s = [...html.matchAll(/<h1[^>]*>([^<]{5,120})<\/h1>/gi)].map(m => m[1].replace(/<[^>]+>/g,"").trim()).filter(Boolean);
  const h2s = [...html.matchAll(/<h2[^>]*>([^<]{5,100})<\/h2>/gi)].map(m => m[1].replace(/<[^>]+>/g,"").trim()).filter(Boolean).slice(0,5);
  const ctaRx  = /saiba mais|fale conosco|entre em contato|agendar|comprar|ver mais|solicitar|whatsapp|contato|orçamento/i;
  const ctas   = [...html.matchAll(/<a[^>]*>([^<]{3,40})<\/a>/gi)].map(m=>m[1].replace(/<[^>]+>/g,"").trim()).filter(t=>ctaRx.test(t)).slice(0,5);
  const best   = ogTitle || h1s[0] || title.split("|")[0].trim() || title.split("-")[0].trim() || "";
  const desc   = ogDesc  || metaDesc || h2s[0] || "";
  const cta    = ctas[0] || "Saiba mais";
  if (best.length > 5) {
    ads.push({ competitorId, adType:"image", isActive:1, headline:best.slice(0,120), bodyText:desc.slice(0,300)||null, cta, landingPageUrl:websiteUrl, source:"website_scraping", rawData:JSON.stringify({source:"website_scraping",via:"html_parser",url:websiteUrl}) });
  }
  for (const h2 of h2s.slice(0,3)) {
    if (h2===best||h2.length<10) continue;
    ads.push({ competitorId, adType:"image", isActive:1, headline:h2.slice(0,120), bodyText:desc.slice(0,300)||null, cta:ctas[ads.length]||cta, landingPageUrl:websiteUrl, source:"website_scraping", rawData:JSON.stringify({source:"website_scraping",via:"html_parser_h2",url:websiteUrl}) });
  }
  return ads;
}

// ── Gera campanha a partir dos ads coletados — sem LLM ──────────────────────
async function buildCampaignFromAds(projectId: number, objective: string, clientProfile: any, ads: any[]): Promise<any> {
  const niche   = clientProfile?.niche || "negócios";
  const company = clientProfile?.companyName || "sua empresa";
  const product = clientProfile?.productService || "seu produto";
  const budget  = clientProfile?.monthlyBudget || 1500;

  const formats = ads.reduce((acc:any,a:any)=>{acc[a.adType||"image"]=(acc[a.adType||"image"]||0)+1;return acc;},{});
  const topFmt  = Object.entries(formats).sort((x:any,y:any)=>y[1]-x[1])[0]?.[0]||"image";
  const realCtas= [...new Set(ads.map((a:any)=>a.cta).filter(Boolean))].slice(0,4) as string[];
  const topCta  = realCtas[0]||"Saiba mais";
  const activeAds = ads.filter((a:any) => a.isActive);
  const avgActivity = ads.length > 0 ? Math.round(activeAds.length / ads.length * 100) : 50;

  const tones: Array<"urgent"|"emotional"|"rational"|"premium"> = ["urgent","emotional","rational","premium"];
  const hybrid  = await hybridGenerateAds({niche,clientName:company,product,tones,useLLMRefine:false,count:4});
  const budgets: Record<string,number> = {leads:40,sales:50,traffic:30,engagement:25,branding:20};
  const total   = budgets[objective]||30;

  // Métricas estimadas baseadas no nicho e dados reais de concorrentes
  const isImoveis = /imov|imobi|apart|casa/i.test(niche);
  const isServico = /clinica|saude|beleza|academia|restaurante/i.test(niche);
  const estimatedCPC = isImoveis ? 1.80 : isServico ? 0.90 : 1.20;
  const estimatedCTR = isImoveis ? 2.8  : isServico ? 3.5  : 2.5;
  const estimatedCPM = Math.round(estimatedCPC * estimatedCTR * 10) / 10;
  const monthlyLeads = budget > 0 ? Math.round((budget * 0.7) / (estimatedCPC * 15)) : 0;

  // Funil de conversão baseado no objetivo
  const funnelByObjective: Record<string, any[]> = {
    leads: [
      { stage: "Awareness",     format: topFmt === "video" ? "Vídeo 15s" : "Imagem", audience: `Lookalike 1-3%, ${niche}`, budget: "40%", kpi: `CPM < R$${estimatedCPM.toFixed(2)}` },
      { stage: "Consideração",  format: "Carrossel",                                  audience: "Engajados 30 dias",         budget: "35%", kpi: `CTR > ${estimatedCTR}%` },
      { stage: "Conversão",     format: "Imagem c/ CTA",                              audience: "Remarketing 7 dias",        budget: "25%", kpi: `CPL < R$${(estimatedCPC * 15).toFixed(2)}` },
    ],
    sales: [
      { stage: "Descoberta",    format: topFmt === "video" ? "Vídeo 30s" : "Imagem", audience: `Lookalike 1-3%, ${niche}`, budget: "35%", kpi: `Alcance > 10.000/semana` },
      { stage: "Engajamento",   format: "Carrossel",                                  audience: "Visitantes 14 dias",        budget: "35%", kpi: `CPC < R$${estimatedCPC.toFixed(2)}` },
      { stage: "Compra",        format: "Imagem produto",                             audience: "Carrinho abandonado 3 dias",budget: "30%", kpi: `ROAS > 3x` },
    ],
    traffic: [
      { stage: "Alcance",       format: "Imagem",                                     audience: `Interesses ${niche}`,      budget: "60%", kpi: `CPC < R$${(estimatedCPC * 0.7).toFixed(2)}` },
      { stage: "Retargeting",   format: "Vídeo curto",                                audience: "Visitantes 7 dias",         budget: "40%", kpi: `CTR > ${(estimatedCTR + 1).toFixed(1)}%` },
    ],
  };
  const conversionFunnel = funnelByObjective[objective] || funnelByObjective["leads"];

  // Plano de execução semanal
  const executionPlan = [
    { week: "Semana 1", action: `Configurar públicos: Lookalike 1-3% de clientes atuais + Interesses ${niche}. Subir 2 criativos TOF (${topFmt}).`, budget: `R$${Math.round(budget*0.25)}`, kpi: `CPM < R$${estimatedCPM.toFixed(2)}, alcance > 5.000` },
    { week: "Semana 2", action: `Analisar CTR dos criativos TOF. Pausar CTR < 1.5%. Ativar carrossel MOF para engajados.`,                           budget: `R$${Math.round(budget*0.25)}`, kpi: `CTR > ${estimatedCTR}%, CPC < R$${(estimatedCPC*1.2).toFixed(2)}` },
    { week: "Semana 3", action: `Escalar criativo vencedor (+30% budget). Ativar remarketing BOF 7 dias. Testar novo hook.`,                          budget: `R$${Math.round(budget*0.28)}`, kpi: `CPL < R$${(estimatedCPC*12).toFixed(2)}, conversão > 2%` },
    { week: "Semana 4", action: `Consolidar: manter top 2 conjuntos, pausar resto. Planejar ciclo seguinte com novos criativos.`,                      budget: `R$${Math.round(budget*0.22)}`, kpi: `ROAS > 2.5x, leads mensais: ${monthlyLeads}` },
  ];

  // aiResponse com métricas para a auditoria
  const metrics = {
    estimatedCPC: `R$${estimatedCPC.toFixed(2)}`,
    estimatedCTR: `${estimatedCTR}%`,
    estimatedCPM: `R$${estimatedCPM.toFixed(2)}`,
    estimatedLeads: monthlyLeads,
    insight: `Baseado em ${ads.length} anúncios de concorrentes (${avgActivity}% ativos). Formato dominante: ${topFmt}. Benchmark do nicho ${niche}.`,
  };

  return {
    strategy: `Campanha ${objective} — análise de ${ads.length} anúncios de concorrentes. Formato dominante: ${topFmt}. CTAs mais usados: ${realCtas.join(", ")||topCta}. ${avgActivity}% dos anúncios dos concorrentes estão ativos — mercado ${avgActivity > 60 ? "aquecido" : "moderado"}.`,
    adSets:[
      { name:"Público Frio",    audience:`Lookalike 1-3%, 25-50 anos, ${niche}`, budget:`${Math.round(total*0.4)}%`, objective:"Alcance",       funnelStage:"TOF" },
      { name:"Público Morno",   audience:"Visitantes 30 dias",                   budget:`${Math.round(total*0.35)}%`,objective:"Consideração",   funnelStage:"MOF" },
      { name:"Remarketing Hot", audience:"Engajamento 7 dias",                   budget:`${Math.round(total*0.25)}%`,objective:"Conversão",      funnelStage:"BOF" },
    ],
    creatives: hybrid.ads.map((ad,i)=>({
      type:["direct_offer","emotional","social_proof","educational"][i],
      format:topFmt==="video"?"Video 15s":"Imagem Feed", orientation:"vertical_9_16",
      headline:ad.headline, bodyText:ad.body, copy:ad.body, cta:ad.cta,
      hook:ad.headline, pain:"Dificuldade em encontrar solução", solution:`${company} — ${product}`,
      funnelStage:["TOF","MOF","BOF","BOF"][i], complianceScore:"safe",
      targetAudience:`25-50 anos, ${niche}`, platforms:["meta"], budget:Math.round(total/4), duration:7, tone:ad.tone, source:"hybrid",
    })),
    conversionFunnel,
    executionPlan,
    metrics,
    generatedBy: "hybrid_engine",
  };
}

// ── Geração local de insights a partir dos ads coletados (sem LLM) ────────────
// Usado quando todos os LLMs estão indisponíveis mas há dados reais coletados
function generateLocalInsights(ads: any[], competitorName: string, isEstimated: boolean, clientProfile?: any): string {
  const total  = ads.length;
  const ativos = ads.filter((a: any) => a.isActive).length;

  // Contagem de formatos
  const fmtCount: Record<string, number> = {};
  for (const a of ads) {
    const f = (a.adType || "image").toLowerCase();
    fmtCount[f] = (fmtCount[f] || 0) + 1;
  }
  const fmtSorted = Object.entries(fmtCount).sort((x, y) => y[1] - x[1]);
  const fmtStr = fmtSorted.map(([f, n]) => `${f} (${Math.round(n / total * 100)}%)`).join(" | ") || "—";

  // CTAs únicos coletados
  const ctas = [...new Set(ads.map((a: any) => a.cta).filter(Boolean))].slice(0, 5);
  const ctaStr = ctas.length ? ctas.join(", ") : "—";

  // Headlines — extrai padrões reais
  const headlines = ads.map((a: any) => a.headline).filter(Boolean);
  const hasNumeros    = headlines.filter((h: string) => /\d/.test(h)).length;
  const hasPerguntas  = headlines.filter((h: string) => h.includes("?")).length;
  const hasExclamacao = headlines.filter((h: string) => h.includes("!")).length;
  const temExclusivo  = headlines.filter((h: string) => /exclusiv|premium|único|especial/i.test(h)).length;
  const temUrgencia   = headlines.filter((h: string) => /agora|hoje|último|limite|vagas/i.test(h)).length;

  const padroes: string[] = [];
  if (hasNumeros > total * 0.3)    padroes.push(`Headlines com números (${hasNumeros}/${total})`);
  if (hasPerguntas > total * 0.2)  padroes.push(`Perguntas retóricas (${hasPerguntas}/${total})`);
  if (hasExclamacao > total * 0.3) padroes.push(`Chamadas urgentes (${hasExclamacao}/${total})`);
  if (temExclusivo > 0)            padroes.push(`Tom de exclusividade (${temExclusivo} ads)`);
  if (temUrgencia > 0)             padroes.push(`Gatilho de urgência (${temUrgencia} ads)`);
  const padroesStr = padroes.length ? padroes.join(". ") : "Copy direto e objetivo";

  // Funil por taxa ativo/inativo
  const taxaAtivo = total > 0 ? Math.round(ativos / total * 100) : 0;
  const funil = taxaAtivo > 60
    ? `Alta atividade (${taxaAtivo}% ativos) — foco em tráfego e conversão contínua`
    : taxaAtivo > 30
    ? `Atividade moderada (${taxaAtivo}% ativos) — mix de awareness e conversão`
    : `Baixa atividade atual (${taxaAtivo}% ativos) — possível pausa estratégica ou teste`;

  // Amostras reais de headlines (máx 3)
  const sampleHeadlines = headlines.slice(0, 3).map((h: string) => `"${h}"`).join("; ");

  // Pontos fracos inferidos
  const fracos: string[] = [];
  if (ctas.length <= 2)     fracos.push("CTAs pouco variados — poucas variações testadas");
  if (hasNumeros < 2)       fracos.push("Poucas headlines com dados numéricos — menor credibilidade");
  if (ativos < 3)           fracos.push("Poucos anúncios ativos — baixa pressão competitiva agora");
  if (fmtSorted.length < 2) fracos.push("Pouca diversidade de formatos — vulnerável a fadiga criativa");
  if (fracos.length === 0)  fracos.push("Volume de anúncios limitado para análise de fraquezas");
  const fracosStr = fracos.map((f, i) => `${i + 1}. ${f}`).join(". ");

  // Recomendações específicas
  const recs: string[] = [];
  if (ctas.length <= 2)               recs.push("Teste CTAs diferentes: WhatsApp, agendamento, formulário — variando tom e urgência");
  if (hasNumeros < 2)                 recs.push("Inclua números concretos nas headlines: metragem, preço, prazo, ROI");
  if (ativos < 3)                     recs.push(`Momento favorável — concorrente com apenas ${ativos} anúncio(s) ativo(s) agora`);
  if (fmtSorted[0]?.[0] === "image") recs.push("Invista em vídeo curto (15-30s) — formato menos explorado pelo concorrente");
  if (recs.length < 3)                recs.push("Crie variações de copy baseadas nos padrões identificados e faça A/B estruturado");
  const recsStr = recs.slice(0, 3).map((r, i) => `${i + 1}. ${r}`).join(". ");

  // Contexto do cliente
  const clientCtx = clientProfile
    ? `\n\n📊 Gap para ${(clientProfile as any).companyName}: posicione-se explorando os pontos fracos acima em ${(clientProfile as any).productService || "seu segmento"}.`
    : "";

  const prefix = isEstimated
    ? `⚠️ Dados inferidos do site — padrões típicos do nicho para ${competitorName}.\n\n`
    : `✅ Análise de ${total} anúncio(s) coletado(s) de ${competitorName} (${ativos} ativo(s)).\n\n`;

  return (
    prefix +
    `🎨 Formatos: ${fmtStr}\n\n` +
    `📢 CTAs predominantes: ${ctaStr}\n\n` +
    `🔀 Atividade / Funil: ${funil}\n\n` +
    `🏆 Padrões vencedores: ${padroesStr}${sampleHeadlines ? `\nExemplos coletados: ${sampleHeadlines}` : ""}\n\n` +
    `⚠️ Pontos fracos detectados: ${fracosStr}\n\n` +
    `💡 Recomendações para o cliente: ${recsStr}` +
    clientCtx
  );
}

// ── Lock global para evitar análises simultâneas do mesmo concorrente ────────
const _analyzingLock = new Map<number, Promise<any>>();

export async function analyzeCompetitor(competitorId: number, projectId: number, force = false) {
  // Se já está analisando este concorrente, aguarda e retorna o mesmo resultado
  // force=true pula o lock para garantir nova análise imediata
  if (!force) {
    const existing = _analyzingLock.get(competitorId);
    if (existing) {
      log.info("ai", "[M2] analyzeCompetitor já em andamento — aguardando", { competitorId });
      try { return await existing; } catch { /* ignora erro da análise anterior */ }
    }
  }

  const promise = _analyzeCompetitorImpl(competitorId, projectId, force);
  _analyzingLock.set(competitorId, promise);
  try {
    return await promise;
  } finally {
    _analyzingLock.delete(competitorId);
  }
}

// ── Exporta status interno para o health check ───────────────────────────────
export function getHealthStatus() {
  return {
    metaCircuitBreaker: {
      state:    _metaCB.state,
      failures: _metaCB.failures,
      openedAt: _metaCB.openedAt ? new Date(_metaCB.openedAt).toISOString() : null,
      resetsIn: _metaCB.state === "OPEN"
        ? Math.max(0, Math.round((_metaCB.openedAt + _metaCB.RESET_MS - Date.now()) / 60000)) + "min"
        : null,
    },
    hfDnsBlocked: {
      blocked:  _hfDnsBlocked,
      blockedAt: _hfDnsBlockedAt ? new Date(_hfDnsBlockedAt).toISOString() : null,
    },
    competitorCache: {
      size: _competitorCache.size,
    },
    geminiKeys: {
      exhausted: _exhaustedKeys.size,
    },
    llmMode: {
      current:    _llmMode,
      label:      _llmMode === "on" ? "🟢 IA Categoria A" : "🟡 IA Categoria B",
      principal:  _llmMode === "on" ? "IA Categoria A" : "IA Categoria B",
    },
    groqFallback: {
      configured: !!process.env.GROQ_API_KEY,
      model:      process.env.GROQ_MODEL || "llama-3.3-70b-versatile",
    },
    claudeFallback: {
      configured: !!(process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY),
    },
  };
}

async function _analyzeCompetitorImpl(competitorId: number, projectId: number, force = false) {
  log.info("ai", "[M2] analyzeCompetitor start", { competitorId, projectId });

  const competitor    = await db.getCompetitorById(competitorId);
  if (!competitor) throw new Error("Concorrente não encontrado");

  const clientProfile = await db.getClientProfile(projectId);

  // ── Busca token Meta do usuário dono do projeto (multi-tenant) ────────────
  const project          = await db.getProjectById(projectId);
  const userId           = (project as any)?.userId;
  const metaIntegration  = userId ? await db.getApiIntegration(userId, "meta") : null;
  const userMetaToken    = (metaIntegration as any)?.accessToken  || process.env.META_ACCESS_TOKEN || undefined;
  const tokenExpiresAt   = (metaIntegration as any)?.tokenExpiresAt;

  // Verifica se o token está expirado
  const tokenExpired = tokenExpiresAt && new Date() > new Date(tokenExpiresAt);
  const effectiveToken = tokenExpired ? (process.env.META_ACCESS_TOKEN || undefined) : userMetaToken;

  if (userMetaToken && !tokenExpired) {
    log.info("ai", "Usando token Meta do usuário", { userId, expiresAt: tokenExpiresAt });
  } else if (tokenExpired) {
    log.warn("ai", "⚠️ Token Meta EXPIRADO — vá em Configurações → Meta Ads → atualizar token", { userId, tokenExpiresAt });
  } else if (process.env.META_ACCESS_TOKEN) {
    log.info("ai", "Usando token Meta global (.env)");
  } else {
    log.warn("ai", "⚠️ Nenhum token Meta disponível — configure em Configurações → Meta Ads para dados reais");
  }

  // ── Limpa anúncios estimados antigos para re-tentar coleta real ──────────
  const existingAds = await db.getScrapedAdsByCompetitor(competitorId);

  // Considera "apenas estimado" quando TODOS os ads são de fontes não-reais
  const isNonReal = (a: any) => isNonRealAdSource(getAdSource(a));

  const hasRealAds   = existingAds.some((a: any) => isRealAdSource(getAdSource(a)));
  const onlyEstimated = existingAds.length > 0 && existingAds.every(isNonReal);

  // Só limpa e re-coleta se:
  // (a) não há ads ainda, OU
  // (b) TODOS os ads são estimados/SEO — nunca apaga dados reais
  if (onlyEstimated && !hasRealAds) {
    log.info("ai", "Limpando dados estimados/SEO para nova tentativa real", { competitorId, count: existingAds.length });
    for (const ad of existingAds) {
      try { await db.deleteScrapedAd((ad as any).id); } catch {}
    }
  }

  // Re-coleta se: force=true, sem ads, OU todos estimados/SEO (nunca derruba dados reais)
  const shouldFetch = force || existingAds.length === 0 || (onlyEstimated && !hasRealAds);
  if (force) {
    log.info("ai", "Re-análise forçada — coletando novamente independente de dados existentes", { competitorId, existingCount: existingAds.length });
  }

  let pageId       = (competitor as any).facebookPageId;
  const pageUrl    = (competitor as any).facebookPageUrl;
  const igUrl      = (competitor as any).instagramUrl;
  const websiteUrl = (competitor as any).websiteUrl;
  const compName   = (competitor as any).name || "";

  // ── Auto-descoberta de dados quando concorrente só tem o nome ───────────────
  if (shouldFetch && !pageId && !pageUrl && !igUrl && !websiteUrl) {
    log.info("ai", "Concorrente sem dados — tentando descoberta automática", { compName });
    const discovered = await discoverCompetitorData(competitorId, compName, effectiveToken);
    if (discovered.pageId) pageId = discovered.pageId;
    if (discovered.facebookPageUrl && !pageUrl) (competitor as any).facebookPageUrl = discovered.facebookPageUrl;
    if (discovered.igUrl    && !igUrl)    (competitor as any).instagramUrl = discovered.igUrl;
    if (discovered.websiteUrl && !websiteUrl) (competitor as any).websiteUrl = discovered.websiteUrl;
  }

  // ── Extrai pageId da pageUrl quando disponível ──────────────────────────────
  if (shouldFetch && !pageId && pageUrl) {
    // Tenta extrair ID numérico direto da URL (view_all_page_id=NUMERO)
    const urlIdMatch = pageUrl.match(/view_all_page_id=(\d{10,})/);
    if (urlIdMatch?.[1]) {
      pageId = urlIdMatch[1];
      await db.updateCompetitor(competitorId, { facebookPageId: pageId }).catch(() => {});
      log.info("ai", `pageId ${pageId} extraído da pageUrl para "${compName}"`);
    } else {
      // pageUrl pode ser facebook.com/NomeEmpresa — resolve via Graph API
      const fbHandleMatch = pageUrl.match(/facebook\.com\/(?!ads\/|pages\/|sharer)([\w.]+)/);
      if (fbHandleMatch?.[1] && effectiveToken) {
        const resolved = await resolvePageId(compName, undefined, undefined, effectiveToken);
        if (resolved) {
          pageId = resolved;
          await db.updateCompetitor(competitorId, { facebookPageId: resolved }).catch(() => {});
          log.info("ai", `pageId ${resolved} resolvido do handle da pageUrl para "${compName}"`);
        }
      }
    }
  }

  // ── Auto-resolve pageId se não foi cadastrado ─────────────────────────────
  if (shouldFetch && !pageId && !pageUrl) {
    const resolved = await resolvePageId(compName, websiteUrl, igUrl, effectiveToken);
    if (resolved) {
      pageId = resolved;
      try {
        await db.updateCompetitor(competitorId, { facebookPageId: resolved });
        log.info("ai", `pageId ${resolved} salvo automaticamente para "${compName}"`);
      } catch {}
    }
  }

  // ── Tenta resolver pageId via igUrl se ainda não temos ───────────────────
  if (shouldFetch && !pageId && igUrl && effectiveToken) {
    const resolved = await resolvePageId(compName, websiteUrl, igUrl, effectiveToken);
    if (resolved) {
      pageId = resolved;
      await db.updateCompetitor(competitorId, { facebookPageId: resolved }).catch(() => {});
      log.info("ai", `pageId ${resolved} resolvido via Instagram para "${compName}"`);
    }
  }

  // ── Último recurso: Gemini com Google Search para descobrir pageId ─────────
  if (shouldFetch && !pageId && effectiveToken) {
    try {
      const searchPrompt = `Encontre o Facebook Page ID numérico (10-16 dígitos) da empresa:
Nome: "${compName}"
${websiteUrl ? `Site: ${websiteUrl}` : ""}
${igUrl ? `Instagram: ${igUrl}` : ""}
País: Brasil

Retorne APENAS JSON: {"pageId":"NUMERO_OU_null","confidence":"high|medium|low"}
REGRA: só retorne pageId se tiver certeza absoluta. Nunca invente.`;

      const grounded = await geminiWithGrounding(searchPrompt);
      if (grounded?.pageId && /^\d{10,16}$/.test(String(grounded.pageId))) {
        pageId = String(grounded.pageId);
        await db.updateCompetitor(competitorId, { facebookPageId: pageId }).catch(() => {});
        log.info("ai", `pageId ${pageId} encontrado via Gemini grounding para "${compName}"`,
          { confidence: grounded.confidence });
      }
    } catch {}
  }

  // ── Pipeline de coleta em cascata ────────────────────────────────────────
  //
  //  ①  Google Ads Keyword Planner             → keywords reais do nicho/concorrente
  //  ②  Meta Ads Archive API (token oficial)   → dados 100% reais
  //  ③  Ads Library pública via HF proxy       → dados reais sem token
  //  ④  Ads Library direto do Render            → dados reais (às vezes bloqueado)
  //  ⑤  Scraping do site do concorrente         → anúncios INFERIDOS do site
  //  ⑥  Análise SEO via IA                     → anúncios estimados c/ contexto
  //  ⑦  generateMockAds                         → estimativas genéricas de nicho
  //

  // ── Cache check — evita re-análise completa em menos de 10 min ──────────
  if (!shouldFetch) {
    const cached = getCompetitorCache(competitorId);
    if (cached) {
      log.info("ai", "[Cache] Resultado recente encontrado — retornando sem re-análise", {
        competitorId, adsCount: cached.adsCount, fonte: cached.fonte,
      });
      return cached;
    }
  }

  // ── Status do Circuit Breaker Meta ──────────────────────────────────────
  if (metaCBisOpen() && shouldFetch) {
    log.info("ai", "Meta CB: OPEN — pulando Meta API, indo direto para fallback SEO", { competitorId });
  }

  // ① Google Ads Keyword Planner — keywords do concorrente
  // Roda SEMPRE (independe de shouldFetch) pois keywords enriquecem qualquer análise
  // Só pula se já tiver keywords Google salvas recentemente
  const hasGoogleKeywords = existingAds.some((a: any) =>
    a.source === "google_keyword_planner" || a.platform === "google"
  );
  if (!hasGoogleKeywords) {
    log.info("ai", "[Google] Iniciando busca de keywords do concorrente", { competitorId, compName });
    const googleOk = await fetchGoogleCompetitorInsights(
      competitorId, projectId, compName, websiteUrl, userId
    );
    if (googleOk) {
      log.info("ai", "✅ Google Keyword Planner OK", { competitorId });
    }
  } else {
    log.info("ai", "[Google] Keywords já coletadas — pulando", { competitorId, count: existingAds.filter((a: any) => a.platform === "google").length });
  }

  let metaOk = false;
  let metaAccessDenied = false;
  let metaTokenInvalid = false;
  let metaPermissionDenied = false;

  if (shouldFetch) {
    log.info("ai", "Pipeline coleta iniciado", {
      competitorId, compName,
      hasPageId: !!pageId, hasPageUrl: !!pageUrl, hasIgUrl: !!igUrl,
      hasWebsite: !!websiteUrl, hasToken: !!effectiveToken,
    });

    // ① + ② + ③: tentativas Meta (pageId → pageUrl → igUrl → nome)
    // Circuit Breaker: se Meta está falhando por permissão, pula direto pro SEO
    let pipelineShortCircuited = false;
    if (metaCBisOpen()) {
      log.info("ai", "Meta CB OPEN — keyword search bloqueado, mas tentando pageId e /posts", { competitorId, hasPageId: !!pageId, hasWebsite: !!websiteUrl });
      metaPermissionDenied = true;

      // Mesmo com CB aberto: se temos pageId E token, tenta /posts (não usa Ads Library)
      if (pageId && effectiveToken) {
        const postsOk = await fetchViaGraphAPIPosts(competitorId, projectId, pageId, effectiveToken);
        if (postsOk) {
          metaOk = true;
          pipelineShortCircuited = true;
          log.info("ai", "✅ Graph API /posts OK com CB aberto — dados reais obtidos", { competitorId });
        }
      }

      // Se /posts falhou ou sem pageId, tenta site
      if (!pipelineShortCircuited && websiteUrl) {
        const websiteOk = await fetchViaWebsiteScraping(competitorId, projectId, websiteUrl, compName);
        if (websiteOk) {
          log.info("ai", "✅ Site direto OK (CB aberto, sem pageId)", { competitorId });
          pipelineShortCircuited = true;
        }
      }
    }
    // Mesmo com CB aberto, tenta com pageId — code=10 só afeta keyword search
    if (!pipelineShortCircuited && pageId) {
      const result = await fetchMetaAdsById(competitorId, projectId, pageId, effectiveToken);
      metaOk = result.ok;
      metaAccessDenied = metaAccessDenied || !!result.accessDenied;
      metaTokenInvalid = metaTokenInvalid || !!result.tokenInvalid;
      metaPermissionDenied = metaPermissionDenied || !!result.permissionDenied;

      // Se Ads Archive falhou por permissão mas temos token, tenta /posts da página
      // /posts não requer Ads Library API — retorna dados reais da página pública
      if (!metaOk && result.permissionDenied && effectiveToken) {
        log.info("ai", "[M2] Ads Archive negado — tentando Graph API /posts como camada real", { competitorId, pageId });
        const postsOk = await fetchViaGraphAPIPosts(competitorId, projectId, pageId, effectiveToken);
        if (postsOk) {
          metaOk = true;
          metaPermissionDenied = false; // posts funcionou — não é falha total
          log.info("ai", "✅ Camada 4 (Graph API posts) OK — dados reais sem Ads Library", { competitorId });
        }
      }
    } else if (!pipelineShortCircuited && pageUrl) {
      const result = await fetchMetaAdsByUrl(competitorId, projectId, pageUrl, effectiveToken);
      metaOk = result.ok;
      metaAccessDenied = metaAccessDenied || !!result.accessDenied;
      metaTokenInvalid = metaTokenInvalid || !!result.tokenInvalid;
      metaPermissionDenied = metaPermissionDenied || !!result.permissionDenied;
      if (!metaOk && compName) {
        log.info("ai", "pageUrl não retornou ads — tentando pelo nome", { compName });
        const found = await fetchMetaAdsByName(competitorId, projectId, compName, effectiveToken);
        metaOk = found.ok;
        metaAccessDenied = metaAccessDenied || !!found.accessDenied;
        metaTokenInvalid = metaTokenInvalid || !!found.tokenInvalid;
        metaPermissionDenied = metaPermissionDenied || !!found.permissionDenied;
      }
      // Se pageUrl falhou por permissão e temos pageId (extraído acima), tenta /posts
      if (!metaOk && (result.permissionDenied || metaPermissionDenied) && pageId && effectiveToken) {
        log.info("ai", "[M2] pageUrl negada — tentando Graph API /posts com pageId", { competitorId, pageId });
        const postsOk = await fetchViaGraphAPIPosts(competitorId, projectId, pageId, effectiveToken);
        if (postsOk) {
          metaOk = true;
          metaPermissionDenied = false;
          log.info("ai", "✅ /posts OK via pageUrl path", { competitorId, pageId });
        }
      }
    } else if (!pipelineShortCircuited && igUrl) {
      const result = await fetchMetaAdsByInstagram(competitorId, projectId, igUrl, effectiveToken);
      metaOk = result.ok;
      metaAccessDenied = metaAccessDenied || !!result.accessDenied;
      metaTokenInvalid = metaTokenInvalid || !!result.tokenInvalid;
      metaPermissionDenied = metaPermissionDenied || !!result.permissionDenied;
      if (!metaOk && compName) {
        log.info("ai", "Instagram não retornou ads — tentando pelo nome", { igUrl, compName });
        const found = await fetchMetaAdsByName(competitorId, projectId, compName, effectiveToken);
        metaOk = found.ok;
        metaAccessDenied = metaAccessDenied || !!found.accessDenied;
        metaTokenInvalid = metaTokenInvalid || !!found.tokenInvalid;
        metaPermissionDenied = metaPermissionDenied || !!found.permissionDenied;
      }
      // Se igUrl falhou e resolvemos pageId via Instagram, tenta /posts
      if (!metaOk && (result.permissionDenied || metaPermissionDenied) && pageId && effectiveToken) {
        log.info("ai", "[M2] igUrl negada — tentando Graph API /posts com pageId", { competitorId, pageId });
        const postsOk = await fetchViaGraphAPIPosts(competitorId, projectId, pageId, effectiveToken);
        if (postsOk) {
          metaOk = true;
          metaPermissionDenied = false;
          log.info("ai", "✅ /posts OK via igUrl path", { competitorId, pageId });
        }
      }
    } else if (compName) {
      const found = await fetchMetaAdsByName(competitorId, projectId, compName, effectiveToken);
      metaOk = found.ok;
      metaAccessDenied = metaAccessDenied || !!found.accessDenied;
      metaTokenInvalid = metaTokenInvalid || !!found.tokenInvalid;
      metaPermissionDenied = metaPermissionDenied || !!found.permissionDenied;
    }
    // fim bloco pipeline Meta

    if (!metaOk && !pipelineShortCircuited) {
      log.info("ai", "Meta Ads Library sem resultado — tentando fallback site/SEO", { compName, websiteUrl });

      let websiteOk = false;
      if (websiteUrl) {
        websiteOk = await fetchViaWebsiteScraping(competitorId, projectId, websiteUrl, compName);
        if (websiteOk) log.info("ai", "✅ Fallback site OK", { competitorId });
      }

      if (!websiteOk) {
        const seoOk = await fetchViaSEOAnalysis(competitorId, projectId, compName, websiteUrl, igUrl);
        if (seoOk) {
          log.info("ai", "✅ Fallback SEO OK", { competitorId });
        } else {
          // Sempre gera mock como último recurso — o usuário precisa de dados para trabalhar
          // O badge ⚠️ "Estimado" nos cards deixa claro que não são dados reais
          log.warn("ai", "Todos os fallbacks falharam — gerando mock por nicho", {
            compName, metaAccessDenied, metaPermissionDenied,
          });
          await generateMockAds(competitorId, projectId, compName);
        }
      }
    }

  }

  const updatedAds = await db.getScrapedAdsByCompetitor(competitorId);
  const sourceTypes = updatedAds.map((a: any) => getAdSource(a));
    const sourceMeta = classifyAnalysisSource({
      sourceTypes,
      compName,
      websiteUrl,
      pageId,
      pageUrl,
      igUrl,
      metaAccessDenied,
      metaPermissionDenied,
    });

    const { fonte, hasReal, analysisStatus, isEstimatedData } = sourceMeta;

    if (metaTokenInvalid) {
      log.warn("ai", "Token Meta inválido/expirado durante a análise do concorrente", { competitorId, userId });
    }

    if (sourceMeta.integrationRequired) {
      log.warn("ai", "Integração Meta Ads Library pendente — sem dados oficiais para este concorrente", { competitorId, compName, pageId });
    }

  const clientContext = clientProfile ? `
CONTEXTO DO CLIENTE (use para identificar gaps competitivos):
- Empresa: ${(clientProfile as any).companyName}
- Nicho: ${(clientProfile as any).niche}
- Produto/Serviço: ${(clientProfile as any).productService}
- Público-alvo: ${(clientProfile as any).targetAudience || "não informado"}
- Dor principal: ${(clientProfile as any).mainPain || "não informado"}
- Proposta de valor: ${(clientProfile as any).uniqueValueProposition || "não informado"}
- Objeções dos clientes: ${(clientProfile as any).mainObjections || "não informado"}
- Budget mensal: R$ ${(clientProfile as any).monthlyBudget || "não informado"}
` : "";

  const prompt = `
CONCORRENTE: ${(competitor as any).name}
FONTE DOS DADOS: ${fonte}
${isEstimatedData ? "⚠️ ATENÇÃO: Os dados abaixo são inferidos/parciais e não devem ser tratados como anúncios oficiais confirmados deste concorrente." : "✅ Dados reais coletados da Meta Ads Library."}
TOTAL DE ANÚNCIOS: ${updatedAds.length} (${updatedAds.filter((a: any) => a.isActive).length} ativos)
${clientContext}
ANÚNCIOS ${isEstimatedData ? "DE REFERÊNCIA DO NICHO" : "COLETADOS"}:
${updatedAds.slice(0, 25).map((a: any, i: number) => `
[${i + 1}] Formato: ${a.adType || "image"} | Status: ${a.isActive ? "ATIVO" : "inativo"} | Desde: ${a.startDate ? new Date(a.startDate).toLocaleDateString("pt-BR") : "?"}
Headline: ${a.headline || "—"}
Copy: ${a.bodyText?.slice(0, 250) || "—"}
CTA: ${a.cta || "—"}
`).join("")}

${isEstimatedData
  ? `IMPORTANTE: Como os dados são estimados para o nicho, suas respostas devem:
- Usar linguagem como "empresas do setor costumam..." em vez de "${(competitor as any).name} usa..."
- Focar em padrões típicos do nicho, não em afirmações diretas sobre o concorrente
- Nas recomendações, focar em oportunidades de diferenciação no nicho`
  : ""}

Responda OBRIGATORIAMENTE em JSON com TODOS estes campos:
{
  "resumo": "resumo executivo em 2-3 linhas do que o concorrente está fazendo",
  "topFormats": [{"format": "string", "percentage": 0, "insight": "insight acionável sobre este formato"}],
  "topCtaPatterns": ["CTA mais usado com contexto"],
  "estimatedFunnel": "mapa TOF→MOF→BOF com formatos por etapa",
  "winnerPatterns": "padrões validados pelo mercado nos anúncios ativos",
  "positioning": "posicionamento: tom de voz, promessa central, diferencial percebido",
  "competitorWeaknesses": "3 pontos fracos identificados e exploráveis",
  "recommendations": "3 ações concretas para o cliente superar o concorrente em 30 dias",
  "interpretacao": {
    "nicho": "nicho identificado",
    "produto": "produto/serviço principal",
    "publico": "público-alvo com perfil e dor",
    "funil": "TOF | MOF | BOF",
    "objetivo": "awareness | leads | conversão | remarketing",
    "nivelConsciencia": "inconsciente | com problema | com solução | com produto | pronto para comprar"
  },
  "avaliacao": {
    "clareza": 7,
    "persuasao": 6,
    "oferta": 7,
    "diferenciacao": 5,
    "conversao": 6,
    "justificativa": "explicação baseada nos anúncios"
  },
  "falhas": ["falha 1", "falha 2", "falha 3"],
  "oportunidades": ["oportunidade 1", "oportunidade 2", "oportunidade 3"],
  "gatilhos": [
    {"nome": "Urgência / Escassez", "status": "forte", "observacao": "como aparece ou por que está fraco"},
    {"nome": "Prova Social", "status": "fraco", "observacao": "como aparece ou deveria aparecer"},
    {"nome": "Autoridade", "status": "ausente", "observacao": "como aparece ou deveria aparecer"},
    {"nome": "Reciprocidade", "status": "fraco", "observacao": "como aparece ou deveria aparecer"},
    {"nome": "Curiosidade", "status": "forte", "observacao": "como aparece ou deveria aparecer"}
  ],
  "estrategia": {
    "promessa": "promessa central",
    "oferta": "tipo de oferta usada",
    "posicionamento": "posicionamento no mercado",
    "angulo": "ângulo de venda principal",
    "emocao": "emoção dominante explorada",
    "logica": "estrutura lógica do anúncio"
  },
  "score_final": 7,
  "conclusao": "como ganhar desse concorrente em 3-4 linhas práticas"
}
`;

  let insights = "";
  if (updatedAds.length === 0) {
    insights = sourceMeta.integrationRequired
      ? "Não foi possível concluir a análise oficial porque o app Meta ainda não possui acesso válido à Ads Library API para este fluxo."
      : "Não foi possível coletar dados suficientes do concorrente nesta tentativa. Verifique page ID, URL da página, site e integrações configuradas.";
  } else try {
    // Tenta MECPro AI Service (Groq gratuito) primeiro
    // Nota: mecproAI retorna data.data ou data — normaliza para garantir campos no nível raiz
    let p: any = await mecproAI("analyze-competitor", {
      competitorName: (competitor as any).name,
      fonte,
      ads: updatedAds.slice(0, 25).map((a: any) => ({
        adType:   a.adType,
        isActive: a.isActive,
        startDate: a.startDate ? new Date(a.startDate).toLocaleDateString("pt-BR") : null,
        headline: a.headline,
        bodyText: a.bodyText?.slice(0, 250),
        cta:      a.cta,
      })),
      clientProfile: clientProfile || undefined,
    });

    // Fallback para Gemini direto se o serviço HF estiver fora
    if (!p) {
      log.info("ai", "HF Space indisponível — usando Gemini direto para insights", { competitorId });
      const raw = await gemini(prompt, { temperature: 0.3 });
      const clean = raw.replace(/```json|```/g, "").trim();
      const parsed = JSON.parse(clean);
      // Se gemini retornou mock (sem LLM real), usa análise local dos dados reais
      const isMock = !parsed.topFormats || (Array.isArray(parsed.topFormats) && parsed.topFormats[0]?.insight === "Formato dominante para awareness");
      if (isMock) {
        log.info("ai", "LLMs indisponíveis — gerando insights locais dos dados coletados", { competitorId, adsCount: updatedAds.length });
        insights = generateLocalInsights(updatedAds, (competitor as any).name, isEstimatedData, clientProfile);
        await db.updateCompetitorInsights(competitorId, insights, updatedAds.length);
        log.info("ai", "[M2] analyzeCompetitor done (insights locais)", { competitorId, adsCount: updatedAds.length, fonte, status: analysisStatus });
        return {
          success:     analysisStatus === "success" || analysisStatus === "partial",
          adsCount:    updatedAds.length,
          insights,
          fonte,
          status:      analysisStatus,
          isEstimatedData,
          integrationRequired: sourceMeta.integrationRequired,
        };
      }
      p = parsed;
    }

    // Normaliza resposta: se veio aninhada em data/result/response, extrai nível raiz
    if (p && !p.topFormats && (p.data || p.result || p.response)) {
      p = p.data ?? p.result ?? p.response;
    }

    // Serializa o JSON completo como aiInsights para o frontend poder reutilizar
    // Monta também string legível como fallback para exibição textual
    const insightsJson = JSON.stringify(p);
    const insightsText =
      `## 🎨 Formatos\n${p?.topFormats?.map((f: any) => `**${f.format}** (${f.percentage}%): ${f.insight || ""}`).join("\n") || "—"}\n\n` +
      `## 📢 CTAs predominantes\n${p?.topCtaPatterns?.join("\n") || "—"}\n\n` +
      `## 🔀 Funil estimado\n${p?.estimatedFunnel || "—"}\n\n` +
      `## 🏆 Padrões vencedores\n${p?.winnerPatterns || "—"}\n\n` +
      `## 🎯 Posicionamento\n${p?.positioning || "—"}\n\n` +
      `## ⚠️ Pontos fracos\n${p?.competitorWeaknesses || "—"}\n\n` +
      `## 💡 Recomendações\n${p?.recommendations || "—"}\n\n` +
      `## 🔬 Análise detalhada\n${p?.conclusao || ""}`;

    // Salva tanto o JSON estruturado quanto o texto — o frontend detecta qual usar
    insights = `__JSON__${insightsJson}__ENDjson__\n\n${insightsText}`;
  } catch (e: any) {
    log.warn("ai", "Failed to parse AI response — gerando insights locais", { error: e.message });
    insights = generateLocalInsights(updatedAds, (competitor as any).name, isEstimatedData, clientProfile);
  }

  await db.updateCompetitorInsights(competitorId, insights, updatedAds.length);

  // ── Motor Híbrido: extrai padrões automaticamente dos ads reais coletados ──
  const niche = (clientProfile as any)?.niche || "geral";
  const realAdsForPatterns = updatedAds.filter((a: any) => {
    const src = (a.source || "").toLowerCase();
    return !src.includes("estimated") && !src.includes("mock") && a.headline;
  });
  if (realAdsForPatterns.length > 0) {
    extractAndSavePatterns(realAdsForPatterns, niche).catch(() => {});
  }

  log.info("ai", "[M2] analyzeCompetitor done", { competitorId, adsCount: updatedAds.length, fonte, status: analysisStatus });

  const result = {
    success:     analysisStatus === "success" || analysisStatus === "partial",
    adsCount:    updatedAds.length,
    insights,
    fonte,
    status:      analysisStatus,
    isEstimated: isEstimatedData,
    integrationRequired: sourceMeta.integrationRequired,
  };

  // Só cacheia se tiver dados reais ou SEO (não cacheia falha total)
  if (result.adsCount > 0) {
    setCompetitorCache(competitorId, result);
  }

  return result;
}

// ── 1. Meta Ads Library API oficial — paginada, multi-estratégia ──
//
//  Hierarquia de tentativas (em ordem de qualidade):
//  A) Token disponível + pageId  → ads_archive (Graph API v20 — oficial)
//  B) Token disponível + keyword → ads_archive search_terms
//  C) Sem token + pageId          → endpoint público /ads/library/async (scraping leve)
//  D) Sem token + keyword         → mesmo endpoint público por keyword
//  E) Tudo falhou                 → generateMockAds()
//
async function fetchMetaAdsById(competitorId: number, projectId: number, pageId: string, tokenOverride?: string): Promise<MetaFetchResult> {
  const metaToken = tokenOverride || process.env.META_ACCESS_TOKEN;

  log.info("ai", "fetchMetaAdsById", {
    competitorId,
    pageId,
    hasToken: !!metaToken,
    tokenSource: tokenOverride ? "user_integration" : process.env.META_ACCESS_TOKEN ? "env" : "none",
  });

  const result: MetaFetchResult = { ok: false };

  if (metaToken) {
    const official = await fetchViaOfficialAPI(competitorId, projectId, { pageId, token: metaToken });
    if (official.ok) {
      log.info("ai", "✅ Camada 1 — Meta API Oficial OK", { competitorId, pageId });
      return official;
    }
    result.accessDenied = official.accessDenied;
    result.tokenInvalid = official.tokenInvalid;
    result.permissionDenied = official.permissionDenied;
    log.warn("ai", "❌ Camada 1 — Meta API falhou mesmo com token", { competitorId, pageId, ...official });
  } else {
    log.warn("ai", "❌ Camada 1 — sem token Meta, pulando para endpoint público", { competitorId });
  }

  const ok = await fetchViaPublicEndpoint(competitorId, projectId, { pageId });
  return { ...result, ok };
}

// ── Função central: Meta Graph API v20 ads_archive ──────────────────────────
async function fetchViaOfficialAPI(
  competitorId: number,
  projectId: number,
  opts: { pageId?: string; keyword?: string; token: string }
): Promise<MetaFetchResult> {

  const BASE = "https://graph.facebook.com/v20.0/ads_archive";
  log.info("ai", "[M2] fetchViaOfficialAPI iniciado", {
    competitorId,
    strategy: opts.pageId ? "page_id" : "keyword",
    hasToken: !!opts.token,
  });

  // Campos que a API retorna (sem campos que precisam de permissão adicional)
  const FIELDS = [
    "id",
    "ad_creation_time",
    "ad_creative_bodies",
    "ad_creative_link_titles",
    "ad_creative_link_captions",
    "ad_creative_link_descriptions",
    "ad_creative_media",           // imagens/vídeos do criativo
    "ad_snapshot_url",             // URL pública do snapshot
    "impressions",                 // faixa: e.g. "1000-4999"
    "spend",                       // faixa: e.g. "100-199"
    "page_name",
    "page_id",
    "publisher_platforms",         // ["facebook","instagram",...]
    "demographic_distribution",    // [{percentage,age,gender}]
    "delivery_by_region",          // [{percentage,region}]
    "target_ages",
    "target_gender",
    "target_locations",
    "languages",
    "content_delivery_stops",      // data de término (se agendado)
  ].join(",");

  let totalSaved = 0;
  let hasError   = false;

  const fetchPage = async (activeStatus: "ACTIVE" | "INACTIVE", after?: string) => {
    const params = new URLSearchParams({
      access_token:        opts.token,
      ad_reached_countries: "BR",
      ad_active_status:    activeStatus,
      fields:              FIELDS,
      limit:               "200",
    });

    if (opts.pageId)  params.set("search_page_ids", opts.pageId);
    if (opts.keyword) params.set("search_terms",    opts.keyword);
    if (after)        params.set("after",            after);

    const res = await fetch(`${BASE}?${params}`, {
      headers: { "User-Agent": "MECPro/2.0 (ads-library-integration)" },
      signal: AbortSignal.timeout(AI_TIMEOUTS.metaOfficialMs),
    });

    // Circuit Breaker: registra sucesso se chegarmos até aqui
    if (_metaCB.state === "HALF_OPEN") metaCBrecordSuccess();

    log.info("ai", `[M2] Meta API ${activeStatus}`, {
      status: res.status,
      hasPageId: !!opts.pageId,
      hasKeyword: !!opts.keyword,
      cursor: !!after,
    });

    if (res.status === 401 || res.status === 403) {
      log.warn("ai", `Meta API auth error ${res.status} — token inválido ou sem permissão ads_read`, { activeStatus });
      hasError = true;
      return { accessDenied: res.status === 403, tokenInvalid: res.status === 401, permissionDenied: res.status === 403 } as any;
    }

    const data = await res.json() as any;

    if (data.error) {
      const code = data.error?.code;
      const msg  = data.error?.message || "";
      const type = data.error?.type    || "";

      // Log completo do erro para diagnóstico
      log.warn("ai", `Meta API error — code=${code} type=${type}`, { msg, pageId: opts.pageId });

      if (code === 190) {
        log.warn("ai", "META ERRO 190: Token expirado/inválido. Vá em Configurações → Meta Ads → atualizar token.");
        hasError = true;
        return { tokenInvalid: true } as any;
      }
      if (code === 10 || code === 200) {
        log.warn("ai", "META ERRO 10: App não tem acesso à Ads Library API. Solicite em developers.facebook.com → seu App → Ads Library API.");
        metaCBrecordFailure("permission"); // Circuit Breaker
        hasError = true;
        return { accessDenied: true, permissionDenied: true } as any;
      }
      if (code === 368 || code === 100) {
        log.warn("ai", `META ERRO ${code}: Permissão insuficiente. Verifique escopo ads_read no token.`);
        hasError = true;
        return { permissionDenied: true } as any;
      }
      log.warn("ai", "Meta ads_archive API error", { code, msg, type });
      return null;
    }

    log.info("ai", `Meta API OK — ${data.data?.length || 0} anúncios retornados`, { activeStatus });

    const ads: any[] = data.data || [];
    for (const ad of ads) {
      await upsertScrapedAd({
        competitorId,
        projectId,
        platform: "meta",
        adId:     ad.id,
        adType:   detectAdType(ad),
        headline: ad.ad_creative_link_titles?.[0]
               || ad.ad_creative_link_captions?.[0]
               || null,
        bodyText: ad.ad_creative_bodies?.[0] || null,
        cta:      ad.ad_creative_link_descriptions?.[0] || null,
        startDate: ad.ad_creation_time ? new Date(ad.ad_creation_time) : null,
        isActive:  activeStatus === "ACTIVE" ? 1 : 0,
        rawData:   JSON.stringify({
          source:      "meta_ads_archive",
          pageName:    ad.page_name,
          pageId:      ad.page_id,
          platforms:   ad.publisher_platforms,
          demographic: ad.demographic_distribution,
          regions:     ad.delivery_by_region,
          spend:       ad.spend,
          impressions: ad.impressions,
          targetAges:  ad.target_ages,
          targetGender:ad.target_gender,
          snapshotUrl: ad.ad_snapshot_url,
          media:       ad.ad_creative_media?.slice(0, 2),
          stopDate:    ad.content_delivery_stops,
        }).slice(0, 3000),
        // Campos dedicados para queries e insights
        pageName:           ad.page_name    || null,
        pageId:             ad.page_id      || null,
        publisherPlatforms: ad.publisher_platforms ? JSON.stringify(ad.publisher_platforms) : null,
        demographicData:    ad.demographic_distribution ? JSON.stringify(ad.demographic_distribution) : null,
        regionData:         ad.delivery_by_region ? JSON.stringify(ad.delivery_by_region) : null,
        spendRange:         ad.spend?.range     || (typeof ad.spend === "string" ? ad.spend : null),
        reachEstimate:      ad.impressions?.range || (typeof ad.impressions === "string" ? ad.impressions : null),
      });
    }

    totalSaved += ads.length;
    return data.paging?.cursors?.after || null;
  };

  try {
    // ACTIVE — até 10 páginas (2.000 anúncios ativos)
    let afterActive: string | undefined;
    for (let p = 0; p < 10; p++) {
      const next = await fetchPage("ACTIVE", afterActive);
      if (next && typeof next === "object") return { ok: false, ...next };
      if (!next || hasError) break;
      afterActive = next as string;
      await new Promise(r => setTimeout(r, 120)); // rate-limit gentil
    }

    if (hasError) return { ok: false };

    log.info("ai", "Meta API ACTIVE done", { competitorId, totalSaved });

    // INACTIVE — só busca se encontrou ativos (contexto histórico)
    if (totalSaved > 0) {
      let afterInactive: string | undefined;
      for (let p = 0; p < 5; p++) {
        const next = await fetchPage("INACTIVE", afterInactive);
        if (next && typeof next === "object") return { ok: false, ...next };
        if (!next || hasError) break;
        afterInactive = next as string;
        await new Promise(r => setTimeout(r, 120));
      }
      log.info("ai", "Meta API INACTIVE done", { competitorId });
    }

    return { ok: totalSaved > 0 };
  } catch (e: any) {
    log.error("ai", "fetchViaOfficialAPI error", { message: e.message });
    return { ok: false };
  }
}

// ── Endpoint público da Ads Library (sem autenticação) ──────────────────────
//
//  Facebook mantém um endpoint interno para o feed da Ads Library que pode
//  responder sem login — mas pode ser bloqueado por rate-limit ou em servidores
//  sem cabeçalhos de browser. Tentamos múltiplas variantes.
//
async function fetchViaPublicEndpoint(
  competitorId: number,
  projectId: number,
  opts: { pageId?: string; keyword?: string }
): Promise<boolean> {

  // ── Estratégia 0: Proxy via MECPro AI (pula se DNS confirmado bloqueado) ─────
  if (MECPRO_AI_URL && !isHfDnsBlocked()) {
    try {
      log.info("ai", "[M2] fetchViaPublicEndpoint proxy iniciado", { hasPageId: !!opts.pageId, hasKeyword: !!opts.keyword });
      const res = await fetch(`${MECPRO_AI_URL}/scrape-ads-library`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        signal:  AbortSignal.timeout(AI_TIMEOUTS.publicProxyMs),
        body: JSON.stringify({
          pageId:    opts.pageId   || null,
          keyword:   opts.keyword  || null,
          country:   "BR",
          count:     50,
          activeOnly: true,
        }),
      });

      if (res.ok) {
        const data = await res.json() as any;

        // DNS bloqueado no HF Space — setar flag e pular para tentativa direta
        if (data.source === "dns_blocked_hf") {
          _hfDnsBlocked = true;
          _hfDnsBlockedAt = Date.now();
          log.warn("ai", "HF Space: DNS facebook.com BLOQUEADO — tentará novamente em 30min");
          // Cai para tentativa direta do Render abaixo
        } else if (data.success && Array.isArray(data.ads) && data.ads.length > 0) {
          for (const ad of data.ads) {
            await db.upsertScrapedAd({
              competitorId, projectId, platform: "meta",
              adId:     ad.adId      || `hf_${Date.now()}_${Math.random().toString(36).slice(2)}`,
              adType:   ad.adType    || "image",
              headline: ad.headline  || null,
              bodyText: ad.bodyText  || null,
              cta:      ad.cta       || null,
              startDate: ad.startDate ? new Date(ad.startDate) : null,
              isActive: ad.isActive  ?? 1,
              rawData:  ad.rawData   || JSON.stringify({ source: "ads_library_public", via: "mecpro-hf-proxy" }),
            });
          }
          log.info("ai", `MECPro proxy retornou ${data.ads.length} anúncios reais`, { competitorId });
          return true;
        } else {
          log.info("ai", "MECPro proxy HF: sem anúncios encontrados para este concorrente", {
            success: data.success, adsCount: data.ads?.length ?? 0, source: data.source || "—",
          });
        }
      } else {
        const errText = await res.text().catch(() => "");
        log.warn("ai", `MECPro proxy HF HTTP ${res.status}`, { body: errText.slice(0, 200) });
      }
    } catch (e: any) {
      log.warn("ai", "MECPro proxy /scrape-ads-library falhou — tentando direto", { message: e.message });
    }
  }

  // Tentativa direta do Render (pode ser bloqueado pelo Facebook com 302/403)
  if (isHfDnsBlocked()) {
    log.info("ai", "HF DNS bloqueado (temporário) — tentando Ads Library direto do servidor Render", { ...opts });
  }

  const UA_LIST = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
  ];

  const HEADERS_BASE = (ua: string) => ({
    "User-Agent":         ua,
    "Accept":             "application/json, text/javascript, */*; q=0.01",
    "Accept-Language":    "pt-BR,pt;q=0.9,en-US;q=0.7,en;q=0.5",
    "Accept-Encoding":    "gzip, deflate, br",
    "Referer":            "https://www.facebook.com/ads/library/",
    "X-Requested-With":  "XMLHttpRequest",
    "sec-fetch-dest":    "empty",
    "sec-fetch-mode":    "cors",
    "sec-fetch-site":    "same-origin",
    "Connection":        "keep-alive",
  });

  const tryFetch = async (url: string): Promise<any[] | null> => {
    for (const ua of UA_LIST) {
      try {
        const res = await fetch(url, { headers: HEADERS_BASE(ua), signal: AbortSignal.timeout(AI_TIMEOUTS.publicDirectMs) });
        if (!res.ok) continue;
        const text = await res.text();
        if (!text || text.length < 20) continue;

        const ads = parseAdsLibraryResponse(text);
        if (ads.length > 0) return ads;
      } catch {}
    }
    return null;
  };

  let saved = 0;

  // Estratégia A: busca por pageId
  if (opts.pageId) {
    const url = "https://www.facebook.com/ads/library/async/search_ads/?" +
      new URLSearchParams({
        q:                       "",
        count:                   "50",
        active_status:           "active",
        ad_type:                 "all",
        "countries[0]":          "BR",
        search_type:             "page",
        view_all_page_id:        opts.pageId,
        "content_languages[0]": "br",
      });

    const ads = await tryFetch(url);
    if (ads && ads.length > 0) {
      for (const ad of ads) {
        await db.upsertScrapedAd({ competitorId, projectId, platform: "meta", ...ad });
      }
      saved += ads.length;
      log.info("ai", "Public endpoint pageId OK", { competitorId, count: ads.length });
    }
  }

  // Estratégia B: busca por keyword (nome do concorrente)
  // Usa os mesmos parâmetros do link público da Ads Library no navegador
  if (opts.keyword && saved === 0) {
    const variants = [
      opts.keyword,
      `@${opts.keyword.replace(/^@/, "")}`,   // tenta com @handle
    ];

    for (const q of variants) {
      if (saved > 0) break;

      // Params idênticos ao link do navegador para maximizar chance de resultado
      const url = "https://www.facebook.com/ads/library/async/search_ads/?" +
        new URLSearchParams({
          q,
          count:                    "50",
          active_status:            "active",
          ad_type:                  "all",
          "countries[0]":           "BR",
          is_targeted_country:      "false",
          media_type:               "all",
          search_type:              "keyword_unordered",
          "sort_data[mode]":        "total_impressions",
          "sort_data[direction]":   "desc",
          "content_languages[0]":   "br",
        });

      const ads = await tryFetch(url);
      if (ads && ads.length > 0) {
        for (const ad of ads) {
          await db.upsertScrapedAd({ competitorId, projectId, platform: "meta", ...ad });
        }
        saved += ads.length;
        log.info("ai", "Public endpoint keyword OK", { competitorId, count: ads.length, q });
      }
    }
  }

  // Estratégia C: busca alternativa por page_id via URL diferente
  if (opts.pageId && saved === 0) {
    const altUrl = `https://www.facebook.com/ads/library/async/search_ads/?` +
      `q=&count=30&active_status=all&ad_type=political_and_issue_ads&countries%5B0%5D=BR` +
      `&search_type=page&view_all_page_id=${opts.pageId}`;
    const ads = await tryFetch(altUrl);
    if (ads && ads.length > 0) {
      for (const ad of ads) {
        await db.upsertScrapedAd({ competitorId, projectId, platform: "meta", ...ad });
      }
      saved += ads.length;
      log.info("ai", "Public endpoint alt OK", { competitorId, count: ads.length });
    }
  }

  // Estratégia D: Graph API — posts públicos da página (não precisa de permissão Ads Library)
  if (opts.pageId && saved === 0) {
    try {
      // Busca posts e conteúdo público da página via Graph API
      // Este endpoint usa apenas 'pages_read_engagement' que é mais comum
      const token = process.env.META_ACCESS_TOKEN;
      if (token) {
        const fields = "message,story,attachments{title,description,media,subattachments},created_time,permalink_url";
        const postsUrl = `https://graph.facebook.com/v20.0/${opts.pageId}/posts?` +
          `fields=${encodeURIComponent(fields)}&limit=25&access_token=${token}`;

        const postsRes = await fetch(postsUrl, {
          signal: AbortSignal.timeout(8000),
          headers: { "User-Agent": "MECPro/2.0" },
        });

        if (postsRes.ok) {
          const postsData: any = await postsRes.json();
          if (!postsData.error && Array.isArray(postsData.data)) {
            const posts = postsData.data;
            for (const post of posts.slice(0, 20)) {
              const attachment = post.attachments?.data?.[0];
              const entry: any = {
                adId:      post.id || `page_post_${Date.now()}_${Math.random().toString(36).slice(2)}`,
                adType:    attachment?.media?.image ? "image" : attachment?.subattachments ? "carousel" : "text",
                headline:  attachment?.title || null,
                bodyText:  post.message || post.story || null,
                cta:       null,
                startDate: post.created_time ? new Date(post.created_time) : null,
                isActive:  1,
                rawData:   JSON.stringify({
                  source:      "page_posts",
                  pageId:      opts.pageId,
                  permalink:   post.permalink_url,
                  description: attachment?.description,
                  mediaUrl:    attachment?.media?.image?.src,
                }).slice(0, 2000),
              };
              if (entry.headline || entry.bodyText) {
                await db.upsertScrapedAd({ competitorId, projectId, platform: "meta", ...entry });
                saved++;
              }
            }
            if (saved > 0) log.info("ai", "Page posts API OK", { competitorId, count: saved, pageId: opts.pageId });
          }
        }
      }
    } catch (e: any) {
      log.warn("ai", "Page posts API falhou", { message: e.message });
    }
  }

  return saved > 0;
}

// ── 2. Entry point por URL da Ads Library ───────────────────────────────────
async function fetchMetaAdsByUrl(competitorId: number, projectId: number, adsLibraryUrl: string, tokenOverride?: string): Promise<MetaFetchResult> {
  try {
    log.info("ai", "fetchMetaAdsByUrl", { url: adsLibraryUrl.slice(0, 100) });

    const pageIdMatch  = adsLibraryUrl.match(/view_all_page_id=(\d+)/);
    const keywordMatch = adsLibraryUrl.match(/[?&]q=([^&]+)/);
    const pageId       = pageIdMatch?.[1];
    const keyword      = keywordMatch ? decodeURIComponent(keywordMatch[1]) : null;

    const metaToken = tokenOverride || process.env.META_ACCESS_TOKEN;

    const result: MetaFetchResult = { ok: false };

    if (metaToken) {
      if (pageId) {
        const official = await fetchViaOfficialAPI(competitorId, projectId, { pageId, token: metaToken });
        if (official.ok) return official;
        result.accessDenied = result.accessDenied || official.accessDenied;
        result.tokenInvalid = result.tokenInvalid || official.tokenInvalid;
        result.permissionDenied = result.permissionDenied || official.permissionDenied;
      }
      if (keyword) {
        const official = await fetchViaOfficialAPI(competitorId, projectId, { keyword, token: metaToken });
        if (official.ok) return official;
        result.accessDenied = result.accessDenied || official.accessDenied;
        result.tokenInvalid = result.tokenInvalid || official.tokenInvalid;
        result.permissionDenied = result.permissionDenied || official.permissionDenied;
      }
    }

    const ok = await fetchViaPublicEndpoint(competitorId, projectId, {
      pageId:  pageId   || undefined,
      keyword: keyword  || undefined,
    });
    return { ...result, ok };

  } catch (e: any) {
    log.error("ai", "fetchMetaAdsByUrl error", { message: e.message });
    return { ok: false };
  }
}

// ── 3. Busca por Instagram handle ───────────────────────────────────────────
async function fetchMetaAdsByInstagram(competitorId: number, projectId: number, igUrl: string, tokenOverride?: string): Promise<MetaFetchResult> {
  const handle = igUrl
    .replace(/.*instagram\.com\//, "")
    .replace(/^@/, "")
    .split("/")[0]
    .split("?")[0]
    .trim();

  log.info("ai", "fetchMetaAdsByInstagram", { handle });

  const metaToken = tokenOverride || process.env.META_ACCESS_TOKEN;

  const result: MetaFetchResult = { ok: false };

  if (metaToken) {
    const official = await fetchViaOfficialAPI(competitorId, projectId, { keyword: handle, token: metaToken });
    if (official.ok) return official;
    result.accessDenied = official.accessDenied;
    result.tokenInvalid = official.tokenInvalid;
    result.permissionDenied = official.permissionDenied;
  }

  const ok = await fetchViaPublicEndpoint(competitorId, projectId, { keyword: handle });
  return { ...result, ok };
}

// ── 4. Busca automática por nome (sem nenhum identificador) ─────────────────
async function fetchMetaAdsByName(competitorId: number, projectId: number, name: string, tokenOverride?: string): Promise<MetaFetchResult> {
  log.info("ai", "fetchMetaAdsByName", { name });

  const metaToken = tokenOverride || process.env.META_ACCESS_TOKEN;

  // Gera variantes inteligentes do nome para aumentar chances de match
  const variants: string[] = [];

  // 1. Nome original
  variants.push(name);

  // 2. Capitalizado (embraed → Embraed)
  const cap = name.charAt(0).toUpperCase() + name.slice(1).toLowerCase();
  if (cap !== name) variants.push(cap);

  // 3. Uppercase (embraed → EMBRAED)
  const upper = name.toUpperCase();
  if (upper !== name && upper !== cap) variants.push(upper);

  // 4. Palavras individuais (se nome composto)
  const words = name.trim().split(/\s+/);
  if (words.length > 1) {
    variants.push(words[0]);
    variants.push(words[0].charAt(0).toUpperCase() + words[0].slice(1).toLowerCase());
    if (words.length > 2) variants.push(words.slice(0, 2).join(" "));
  }

  // 5. Remove acentos e caracteres especiais
  const normalized = name.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  if (normalized !== name.toLowerCase()) variants.push(normalized);

  // Deduplica mantendo ordem
  const seen = new Set<string>();
  const uniqueVariants = variants.filter(v => { if (seen.has(v)) return false; seen.add(v); return true; });

  log.info("ai", "fetchMetaAdsByName variantes", { variants: uniqueVariants });

  const result: MetaFetchResult = { ok: false };

  for (const variant of uniqueVariants) {
    if (metaToken) {
      const official = await fetchViaOfficialAPI(competitorId, projectId, { keyword: variant, token: metaToken });
      if (official.ok) {
        log.info("ai", "fetchMetaAdsByName: API oficial OK", { variant });
        return official;
      }
      result.accessDenied = result.accessDenied || official.accessDenied;
      result.tokenInvalid = result.tokenInvalid || official.tokenInvalid;
      result.permissionDenied = result.permissionDenied || official.permissionDenied;
      // Se code=10, não adianta tentar outras variantes com token
      if (result.permissionDenied) break;
    }

    const ok = await fetchViaPublicEndpoint(competitorId, projectId, { keyword: variant });
    if (ok) {
      log.info("ai", "fetchMetaAdsByName: público OK", { variant });
      return { ...result, ok: true };
    }
  }

  return result;
}

// ── Parser de resposta da Ads Library (endpoint público) ────────────────────
function parseAdsLibraryResponse(text: string): any[] {
  const ads: any[] = [];

  // Tenta 1: JSON com prefixo de segurança do FB
  try {
    const clean = text.replace(/^for\s*\(;;\);/, "").trim();
    const data  = JSON.parse(clean);

    // Navega pelas estruturas conhecidas da Ads Library
    const cards =
      data?.payload?.results           ||
      data?.data?.ad_cards             ||
      data?.results                    ||
      data?.payload?.ad_cards          ||
      [];

    for (const card of (Array.isArray(cards) ? cards : []).slice(0, 50)) {
      const snapshot  = card?.snapshot || card?.ad_snapshot || card;
      const archiveId = card?.adArchiveID || card?.ad_archive_id || card?.id;

      const entry: any = {
        adId:      archiveId || `pub_${Date.now()}_${Math.random().toString(36).slice(2)}`,
        adType:    detectAdTypeFromSnapshot(snapshot),
        headline:  snapshot?.title      || snapshot?.link_title || snapshot?.caption || null,
        bodyText:  snapshot?.body?.markup?.__html?.replace(/<[^>]+>/g, "")
                || snapshot?.body_text  || snapshot?.message || null,
        cta:       snapshot?.cta_text   || snapshot?.call_to_action?.value || null,
        startDate: card.startDate       ? new Date(card.startDate * 1000)
                 : card.ad_creation_time ? new Date(card.ad_creation_time)
                 : null,
        isActive:  1,
        rawData:   JSON.stringify({
          source:   "ads_library_public",
          pageName: card?.page_name || snapshot?.page_name,
          pageId:   card?.page_id,
          spend:    card?.spend,
          reach:    card?.reach,
          snapshot: card?.ad_snapshot_url,
        }).slice(0, 2000),
      };

      // Só inclui se tem ao menos headline ou bodyText
      if (entry.headline || entry.bodyText) ads.push(entry);
    }

    if (ads.length > 0) return ads;
  } catch {}

  // Tenta 2: parsing com regex (HTML/formato desconhecido)
  try {
    const patterns = {
      headlines: [
        /\"title\":\s*\"((?:[^"\\]|\\.)*)\"/, // title
        /\"link_title\":\s*\"((?:[^"\\]|\\.)*)\"/,
        /\"caption\":\s*\"((?:[^"\\]|\\.)*)\"/,
      ],
      bodies: [
        /\"body_text\":\s*\"((?:[^"\\]|\\.)*)\"/, 
        /\"message\":\s*\"((?:[^"\\]|\\.)*)\"/,
      ],
      ctas: [
        /\"cta_text\":\s*\"((?:[^"\\]|\\.)*)\"/,
      ],
    };

    const extractAll = (text: string, pats: RegExp[]) => {
      const results: string[] = [];
      for (const p of pats) {
        const matches = [...text.matchAll(new RegExp(p.source, "g"))];
        matches.forEach(m => m[1] && results.push(m[1]));
      }
      return [...new Set(results)]; // deduplica
    };

    const headlines = extractAll(text, patterns.headlines);
    const bodies    = extractAll(text, patterns.bodies);
    const ctas      = extractAll(text, patterns.ctas);

    const max = Math.min(Math.max(headlines.length, bodies.length), 20);
    for (let i = 0; i < max; i++) {
      const h = headlines[i] || null;
      const b = bodies[i]    || null;
      if (!h && !b) continue;
      ads.push({
        adId:     `regex_${Date.now()}_${i}`,
        adType:   "image",
        headline: h,
        bodyText: b,
        cta:      ctas[i] || null,
        startDate: null,
        isActive: 1,
        rawData:  JSON.stringify({ source: "ads_library_public_regex" }),
      });
    }
  } catch {}

  return ads;
}

// ── detectAdType: Graph API (ads_archive) ────────────────────────────────────
function detectAdType(ad: any): string {
  const mediaType = ad?.ad_creative_media?.[0]?.type?.toLowerCase();
  if (mediaType?.includes("video"))    return "video";
  if (mediaType?.includes("carousel")) return "carousel";
  if (mediaType?.includes("image"))    return "image";
  // Fallbacks
  const media = ad.ad_creative_media?.[0];
  if (media?.video_sd_url || media?.video_hd_url) return "video";
  if (ad.ad_creative_media?.length > 1) return "carousel";
  if ((ad.ad_creative_link_titles?.length ?? 0) > 1) return "carousel";
  return ad?.adType || "image";
}

// ── detectAdTypeFromSnapshot: endpoint público ───────────────────────────────
function detectAdTypeFromSnapshot(snapshot: any): string {
  if (!snapshot) return "image";
  if (snapshot.videos?.length > 0)                               return "video";
  if (snapshot.cards?.length  > 1 || snapshot.images?.length > 1) return "carousel";
  if (snapshot.video_hd_url || snapshot.video_sd_url)            return "video";
  return "image";
}

// ── upsertScrapedAd: evita duplicatas por adId ──────────────────────────────
async function upsertScrapedAd(data: any) {
  // Delega para db.upsertScrapedAd que tem a lógica completa de upsert
  // incluindo os campos novos: pageName, pageId, publisherPlatforms, etc.
  return db.upsertScrapedAd(data);
}


// ── Fallback ⑤: scraping do site do concorrente → anúncios inferidos ────────
//
// Quando todas as tentativas da Meta Ads Library falham, raspa o site do
// concorrente para extrair sinais de marketing (headings, CTAs, preços)
// e usa a IA para inferir os anúncios prováveis.
// source: "website_scraping" (mais confiável que estimado puro)
//

// ── Graph API /page/posts — dados reais da página sem precisar Ads Library ──
// Camada 4: extrai posts públicos da página como anúncios (fonte real)
async function fetchViaGraphAPIPosts(
  competitorId: number,
  projectId: number,
  pageId: string,
  token: string,
): Promise<boolean> {
  try {
    log.info("ai", "[M2] fetchViaGraphAPIPosts iniciado", { competitorId, pageId });
    const fields = "id,message,story,full_picture,permalink_url,created_time,attachments";
    const url = `https://graph.facebook.com/v20.0/${pageId}/posts?fields=${fields}&limit=20&access_token=${token}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(12000) });
    const data = await res.json();

    if (data?.error) {
      log.warn("ai", "[M2] Graph API /posts erro", { code: data.error.code, msg: data.error.message?.slice(0, 80) });
      return false;
    }

    const posts: any[] = data?.data || [];
    if (posts.length === 0) {
      log.info("ai", "[M2] Graph API /posts: sem posts públicos", { competitorId, pageId });
      return false;
    }

    let saved = 0;
    for (const post of posts) {
      const text = post.message || post.story || "";
      if (!text && !post.attachments) continue;

      // Extrai headline do attachment se disponível
      const attachment = post.attachments?.data?.[0];
      const headline = attachment?.title || attachment?.name ||
        (text.split("\n")[0]?.slice(0, 120)) || "Post orgânico";
      const bodyText = text.slice(0, 500) || null;
      const imageUrl = post.full_picture || attachment?.media?.image?.src || null;
      const landingUrl = attachment?.url || post.permalink_url || null;

      // CTA inferido do texto
      const cta = /link na bio|saiba mais|clique|acesse|veja mais/i.test(text) ? "Saiba mais"
        : /whatsapp|chame|fale/i.test(text) ? "Falar no WhatsApp"
        : /agende|marque|reserve/i.test(text) ? "Agendar"
        : /compre|adquira|garanta/i.test(text) ? "Comprar agora"
        : "Ver mais";

      await db.upsertScrapedAd({
        competitorId, projectId,
        platform: "meta",
        adId: `fbpost_${post.id}`,
        adType: imageUrl ? "image" : "text",
        headline,
        bodyText,
        cta,
        imageUrl,
        landingPageUrl: landingUrl,
        isActive: 1,
        startDate: post.created_time ? new Date(post.created_time) : new Date(),
        source: "meta_page_posts",
        rawData: JSON.stringify({ source: "meta_page_posts", postId: post.id, pageId }),
      });
      saved++;
    }

    if (saved > 0) {
      log.info("ai", "✅ Graph API /posts OK — posts como anúncios", { competitorId, pageId, saved });
      return true;
    }
    return false;
  } catch (e: any) {
    log.warn("ai", "[M2] fetchViaGraphAPIPosts erro", { message: e.message?.slice(0, 80) });
    return false;
  }
}

async function fetchViaWebsiteScraping(
  competitorId: number,
  projectId:    number,
  websiteUrl:   string,
  compName:     string,
): Promise<boolean> {
  if (!MECPRO_AI_URL || !websiteUrl) return false;

  try {
    log.info("ai", "[M2] fetchViaWebsiteScraping start", { websiteUrl, compName });
    // Tenta direto antes do HF Space para economizar tempo
    try {
      const directRes = await fetch(websiteUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/123.0.0.0 Safari/537.36",
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8",
        },
        signal: AbortSignal.timeout(8000),
      });
      if (directRes.ok) {
        const html = await directRes.text();
        // Extrai título, meta description, headings e parágrafos do HTML
        const title    = html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]?.trim() || "";
        const desc     = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)/i)?.[1]?.trim() || "";
        const ogDesc   = html.match(/<meta[^>]*property=["']og:description["'][^>]*content=["']([^"']+)/i)?.[1]?.trim() || "";
        const h1s      = [...html.matchAll(/<h1[^>]*>([^<]{3,})<\/h1>/gi)].map(m => m[1].replace(/<[^>]+>/g,"").trim()).filter(Boolean).slice(0, 4);
        const h2s      = [...html.matchAll(/<h2[^>]*>([^<]{3,})<\/h2>/gi)].map(m => m[1].replace(/<[^>]+>/g,"").trim()).filter(Boolean).slice(0, 6);
        const h3s      = [...html.matchAll(/<h3[^>]*>([^<]{3,})<\/h3>/gi)].map(m => m[1].replace(/<[^>]+>/g,"").trim()).filter(Boolean).slice(0, 4);
        const paras    = [...html.matchAll(/<p[^>]*>([^<]{20,})<\/p>/gi)].map(m => m[1].replace(/<[^>]+>/g,"").trim()).filter(t => t.length > 20 && !t.includes("©")).slice(0, 4);
        const siteText = [title, desc || ogDesc, ...h1s, ...h2s, ...h3s, ...paras].filter(Boolean).join(" | ");
        if (siteText.length > 30) {
          log.info("ai", "Website scraping direto OK", { competitorId, chars: siteText.length });
          // Usa Gemini para inferir anúncios a partir do conteúdo do site
          const sitePrompt = `Com base no conteúdo do site "${compName}" (${websiteUrl}):
"${siteText.slice(0, 1500)}"

Gere 8 anúncios variados para Meta Ads que esta empresa provavelmente usa.
Baseie-se no negócio real detectado: produto, público, diferenciais.
Responda SOMENTE em JSON:
{"ads": [{"adType":"image|video|carousel","headline":"max 40 chars","bodyText":"max 125 chars","cta":"Saiba Mais|Falar no WhatsApp|Ver opções|Agendar|Comprar Agora","daysAgo":20,"isActive":1}]}`;
          const siteRaw  = await gemini(sitePrompt, { temperature: 0.4 });
          const siteParsed = JSON.parse(siteRaw.replace(/```json|```/g, "").trim());
          let siteAds = siteParsed?.ads;
          const isMockSite = !Array.isArray(siteAds)||siteAds.length===0||/resultado|metodo|validado|5.000|3 fases/i.test(siteAds[0]?.headline||"");
          if (isMockSite) {
            log.info("ai","LLM retornou mock para site — parser HTML local",{competitorId});
            siteAds = parseHtmlIntoAds(siteText, competitorId, websiteUrl);
          }
          if (Array.isArray(siteAds) && siteAds.length > 0) {
            for (const ad of siteAds) {
              await db.upsertScrapedAd({
                competitorId, projectId, platform: "meta",
                adId:      `site_direct_${Date.now()}_${Math.random().toString(36).slice(2)}`,
                adType:    ad.adType   || "image",
                headline:  ad.headline || null,
                bodyText:  ad.bodyText || null,
                cta:       ad.cta      || null,
                startDate: ad.daysAgo ? new Date(Date.now() - ad.daysAgo * 24 * 60 * 60 * 1000) : new Date(),
                isActive:  ad.isActive ?? 1,
                rawData: JSON.stringify({ source: "website_scraping", via: "direct+gemini", url: websiteUrl }),
              });
            }
            log.info("ai", "fetchViaWebsiteScraping direto+Gemini OK", { competitorId, count: siteAds.length });
            return true;
          }
        }
      }
    } catch (e: any) {
      log.info("ai", "Website scraping direto falhou — tentando HF Space", { message: e.message?.slice(0, 60) });
    }

    // ① Raspa o site
    const scrapeRes = await fetch(`${MECPRO_AI_URL}/scrape-website`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      signal:  AbortSignal.timeout(AI_TIMEOUTS.websiteScrapeMs),
      body: JSON.stringify({ url: websiteUrl, competitorName: compName, maxPages: 3 }),
    });

    if (!scrapeRes.ok) {
      log.warn("ai", "scrape-website falhou", { status: scrapeRes.status });
      return false;
    }

    const scrapeData = await scrapeRes.json() as any;
    if (!scrapeData.success || !scrapeData.data?.title) {
      log.warn("ai", "scrape-website retornou vazio", { success: scrapeData.success });
      return false;
    }

    log.info("ai", "scrape-website OK", {
      pages: scrapeData.pagesScraped,
      title: scrapeData.data.title?.slice(0, 40),
    });

    // ② Busca o perfil do cliente para contexto do nicho
    const clientProfile = await db.getClientProfile(projectId) as any;
    const niche = clientProfile?.niche || "";

    // ③ Pede à IA para inferir anúncios a partir dos dados do site
    const adsRes = await fetch(`${MECPRO_AI_URL}/analyze-website-ads`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      signal:  AbortSignal.timeout(AI_TIMEOUTS.websiteAnalyzeMs),
      body: JSON.stringify({
        competitorName: compName,
        niche,
        websiteData:    scrapeData.data,
        count:          7,
        mode:           "fast",
      }),
    });

    if (!adsRes.ok) {
      log.warn("ai", "analyze-website-ads falhou", { status: adsRes.status });
      return false;
    }

    const adsData = await adsRes.json() as any;
    const ads     = adsData?.data?.ads || adsData?.ads;

    if (!Array.isArray(ads) || ads.length === 0) {
      log.warn("ai", "analyze-website-ads sem anúncios", {});
      return false;
    }

    // ④ Persiste no banco com source = "website_scraping"
    const siteTitle = scrapeData.data.title || websiteUrl;
    for (const ad of ads) {
      await db.upsertScrapedAd({
        competitorId, projectId, platform: "meta",
        adId:      `ws_${Date.now()}_${Math.random().toString(36).slice(2)}`,
        adType:    ad.adType   || "image",
        headline:  ad.headline || null,
        bodyText:  ad.bodyText || null,
        cta:       ad.cta      || null,
        startDate: ad.daysAgo
          ? new Date(Date.now() - ad.daysAgo * 24 * 60 * 60 * 1000)
          : new Date(Date.now() - Math.floor(Math.random() * 45) * 24 * 60 * 60 * 1000),
        isActive:  (ad.isActive ?? ((ad.daysAgo ?? 30) < 45 ? 1 : 0)),
        rawData: JSON.stringify({
          source:      "website_scraping",
          confidence:  ad.confidence || "medium",
          siteTitle,
          pagesScraped: scrapeData.pagesScraped,
          motor:       adsData.motor,
          note:        "Inferido do site do concorrente — mais preciso que estimado por nicho",
        }),
      });
    }

    log.info("ai", "fetchViaWebsiteScraping OK", {
      competitorId, count: ads.length, niche, pagesScraped: scrapeData.pagesScraped,
    });
    return true;

  } catch (e: any) {
    log.warn("ai", "fetchViaWebsiteScraping erro", { message: e.message });
    return false;
  }
}

// ── Fallback ⑥: análise SEO via IA ─────────────────────────────────────────
//
// Usa Gemini diretamente para inferir anúncios e estratégia digital baseado
// no nome da empresa, URL, nicho e perfil do cliente.
// source: "seo_analysis"
//
async function fetchViaSEOAnalysis(
  competitorId: number,
  projectId:    number,
  compName:     string,
  websiteUrl?:  string,
  igUrl?:       string,
): Promise<boolean> {

  // Tenta MECPro AI primeiro se disponível
  if (MECPRO_AI_URL) {
    try {
      log.info("ai", "[M2] fetchViaSEOAnalysis via MECPro AI start", { compName });
      const clientProfile = await db.getClientProfile(projectId) as any;
      const niche         = clientProfile?.niche || "";
      const res = await fetch(`${MECPRO_AI_URL}/seo-analysis`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ competitorName: compName, websiteUrl: websiteUrl || null, instagramUrl: igUrl || null, niche, clientProfile: clientProfile || null, mode: "fast" }),
        signal: AbortSignal.timeout(AI_TIMEOUTS.seoAnalysisMs),
      });
      if (res.ok) {
        const data = await res.json() as any;
        const ads  = data?.data?.ads;
        if (!data.success && data.error?.includes?.("503")) {
          log.warn("ai", "HF Space retornou 503 no /seo-analysis — usando Gemini direto");
        }
        if (Array.isArray(ads) && ads.length > 0) {
          for (const ad of ads) {
            await db.upsertScrapedAd({
              competitorId, projectId, platform: "meta",
              adId:      `seo_${Date.now()}_${Math.random().toString(36).slice(2)}`,
              adType:    ad.adType   || "image",
              headline:  ad.headline || null,
              bodyText:  ad.bodyText || null,
              cta:       ad.cta      || null,
              startDate: ad.daysAgo ? new Date(Date.now() - ad.daysAgo * 24 * 60 * 60 * 1000) : new Date(),
              isActive:  ad.isActive ?? 1,
              rawData: JSON.stringify({ source: "seo_analysis", via: "mecpro-ai", motor: data.motor }),
            });
          }
          log.info("ai", "fetchViaSEOAnalysis via MECPro AI OK", { competitorId, count: ads.length });
          return true;
        }
      }
    } catch (e: any) {
      const isTimeout = e.message?.includes("timeout") || e.message?.includes("aborted");
      log.warn("ai", `seo-analysis HF ${isTimeout ? "timeout" : "falhou"} — tentando Gemini direto`, { message: e.message });
    }
  }

  // Fallback: Gemini direto (independente do serviço externo)
  if (!GEMINI_API_KEY) {
    log.warn("ai", "Camada 6 indisponível — GEMINI_API_KEY não configurado");
    return false;
  }

  let niche = "marketing digital";
  let prompt = "";

  try {
    log.info("ai", "[M2] fetchViaSEOAnalysis via Gemini start", { compName });
    const clientProfile = await db.getClientProfile(projectId) as any;
    niche               = clientProfile?.niche || "marketing digital";
    const product       = clientProfile?.productService || "";
    const audience      = clientProfile?.targetAudience || "";
    const pain          = clientProfile?.mainPain || "";
    const uvp           = clientProfile?.uniqueValueProposition || "";

    prompt = `Você é um analista sênior de inteligência competitiva especializado em Meta Ads.

Sua tarefa é inferir os anúncios REAIS que a empresa "${compName}" está provavelmente veiculando no Facebook e Instagram Ads.

CONTEXTO DO MERCADO:
- Nicho: ${niche}
- Produto/Serviço concorrente ao cliente: ${product}
- Público-alvo do mercado: ${audience}
- Dor principal do público: ${pain}
- Proposta de valor do mercado: ${uvp}
${websiteUrl ? `- Site do concorrente: ${websiteUrl}` : ""}
${igUrl ? `- Instagram do concorrente: ${igUrl}` : ""}

INSTRUÇÕES:
1. Analise o nome "${compName}" e infira o posicionamento provável desta empresa
2. Gere 8 anúncios variados que representem a estratégia real de uma empresa deste porte neste nicho
3. Varie os formatos (image, video, carousel), CTAs e abordagens criativas
4. Use linguagem natural e persuasiva como apareceria num anúncio real do Facebook
5. Headlines com no máximo 40 caracteres e bodyText com no máximo 125 caracteres
6. Distribua entre diferentes estágios do funil: TOF (frio), MOF (morno), BOF (quente)

Responda SOMENTE com JSON válido:
{
  "ads": [
    {
      "adType": "image|video|carousel",
      "headline": "título persuasivo (máx 40 chars)",
      "bodyText": "texto principal real (máx 125 chars)",
      "cta": "Saiba Mais|Falar no WhatsApp|Agendar visita|Ver opções|Garantir vaga",
      "hook": "frase de gancho dos primeiros 3 segundos",
      "funnelStage": "TOF|MOF|BOF",
      "angle": "exclusividade|urgência|prova_social|educação|oferta|dor|transformação",
      "daysAgo": 15,
      "isActive": 1
    }
  ]
}`;

    const raw   = await gemini(prompt, { temperature: 0.5 });
    const clean = raw.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(clean);
    const ads = parsed?.ads;

    if (!Array.isArray(ads) || ads.length === 0) return false;

    for (const ad of ads) {
      await db.upsertScrapedAd({
        competitorId, projectId, platform: "meta",
        adId:      `seo_gemini_${Date.now()}_${Math.random().toString(36).slice(2)}`,
        adType:    ad.adType   || "image",
        headline:  ad.headline || null,
        bodyText:  ad.bodyText || null,
        cta:       ad.cta      || null,
        startDate: ad.daysAgo ? new Date(Date.now() - ad.daysAgo * 24 * 60 * 60 * 1000) : new Date(),
        isActive:  ad.isActive ?? 1,
        rawData: JSON.stringify({
          source:      "seo_analysis",
          via:         "gemini-direct",
          niche,
          hook:        ad.hook        || null,
          funnelStage: ad.funnelStage || null,
          angle:       ad.angle       || null,
          note:        "Inferido por IA com base no nome/nicho/contexto do concorrente",
        }),
      });
    }

    log.info("ai", "fetchViaSEOAnalysis via Gemini OK", { competitorId, count: ads.length });
    return true;

  } catch (e: any) {
    const msg = e.message || "";
    // Se foi quota (429), aguardar 8s e tentar uma última vez com modelo diferente
    if (msg.includes("429") || msg.includes("quota") || msg.includes("overloaded")) {
      try {
        log.info("ai", "[M2] fetchViaSEOAnalysis quota esgotada; aguardando retry", { compName });
        await sleep(8000);
        const retryRaw = await gemini(prompt, { temperature: 0.5 }, 2); // começa do modelo 3
        const retryClean = retryRaw.replace(/```json|```/g, "").trim();
        const retryParsed = JSON.parse(retryClean);
        const retryAds = retryParsed?.ads;
        if (Array.isArray(retryAds) && retryAds.length > 0) {
          for (const ad of retryAds) {
            await db.upsertScrapedAd({
              competitorId, projectId, platform: "meta",
              adId:      `seo_retry_${Date.now()}_${Math.random().toString(36).slice(2)}`,
              adType:    ad.adType   || "image",
              headline:  ad.headline || null,
              bodyText:  ad.bodyText || null,
              cta:       ad.cta      || null,
              startDate: ad.daysAgo ? new Date(Date.now() - ad.daysAgo * 24 * 60 * 60 * 1000) : new Date(),
              isActive:  ad.isActive ?? 1,
              rawData: JSON.stringify({ source: "seo_analysis", via: "gemini-retry", niche }),
            });
          }
          log.info("ai", "fetchViaSEOAnalysis retry OK", { competitorId, count: retryAds.length });
          return true;
        }
      } catch (retryErr: any) {
        log.warn("ai", "fetchViaSEOAnalysis retry também falhou", { message: retryErr.message });
      }
    }
    log.warn("ai", "fetchViaSEOAnalysis Gemini falhou", { message: e.message });
    return false;
  }
}
// ── generateMockAds: fallback com dados estimados POR NICHO ─────────────────
// 1º tenta MECPro AI /generate-mock-ads (qualquer nicho via IA)
// 2º fallback estático com 13 nichos cobertos
async function generateMockAds(competitorId: number, projectId: number, competitorName?: string) {
  // Busca nome real do concorrente no banco se não fornecido — evita usar "Concorrente" genérico
  let name = competitorName;
  if (!name) {
    try {
      const comp = await db.getCompetitorById(competitorId) as any;
      name = comp?.name || "Concorrente";
    } catch { name = "Concorrente"; }
  }

  // Antes de salvar, limpar mocks/SEO anteriores para evitar duplicatas
  // NUNCA apaga anúncios com fonte real (meta_ads_archive, ads_library_public, etc.)
  try {
    const existing = await db.getScrapedAdsByCompetitor(competitorId);
    const NON_REAL = new Set(["estimated", "estimated_ai", "seo_analysis", "website_scraping"]);
    const estimatedIds = existing
      .filter((a: any) => {
        try {
          const src = JSON.parse(a.rawData || "{}").source || "";
          return NON_REAL.has(src) || src.startsWith("estimated") || !src;
        } catch { return false; }
      })
      .map((a: any) => (a as any).id);
    for (const id of estimatedIds) {
      try { await db.deleteScrapedAd(id); } catch {}
    }
  } catch {}

  const clientProfile = await db.getClientProfile(projectId) as any;
  const niche         = clientProfile?.niche          || "";
  const product       = clientProfile?.productService  || "";
  const audience      = clientProfile?.targetAudience  || "";
  const pain          = clientProfile?.mainPain         || "";

  // ── 1. Tenta MECPro AI para gerar anúncios específicos do nicho ──────────
  let selectedAds: any[] | null = null;
  let generator = "static";

  if (MECPRO_AI_URL) {
    try {
      log.info("ai", "[M2] generateMockAds via MECPro AI start", { name, niche });
      const res = await fetch(`${MECPRO_AI_URL}/generate-mock-ads`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        signal:  AbortSignal.timeout(AI_TIMEOUTS.mockGenerationMs),
        body: JSON.stringify({
          competitorName: name,
          niche,
          productService: product,
          targetAudience: audience,
          mainPain:       pain,
          count:          7,
          mode:           "fast",
        }),
      });
      if (res.ok) {
        const data = await res.json() as any;
        const ads  = data?.data?.ads || data?.ads;
        if (Array.isArray(ads) && ads.length > 0) {
          selectedAds = ads;
          generator   = `mecpro-ai (motor: ${data.motor || "?"})`;
          log.info("ai", `MECPro AI gerou ${ads.length} mock ads para nicho="${niche}"`, { motor: data.motor });
        }
      }
    } catch (e: any) {
      log.warn("ai", "MECPro AI /generate-mock-ads falhou — usando estático", { message: e.message });
    }
  }

  // ── 2. Fallback estático com 13 nichos ────────────────────────────────────
  if (!selectedAds) {
    selectedAds = _staticMockAds(name, niche);
  }

  // ── 3. Persiste no banco ──────────────────────────────────────────────────
  for (const ad of selectedAds) {
    await db.upsertScrapedAd({
      competitorId, projectId, platform: "meta",
      adId:     `estimated_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      adType:   ad.adType   || "image",
      headline: ad.headline || null,
      bodyText: ad.bodyText || null,
      cta:      ad.cta      || null,
      startDate: ad.daysAgo
        ? new Date(Date.now() - ad.daysAgo * 24 * 60 * 60 * 1000)
        : new Date(Date.now() - Math.floor(Math.random() * 60) * 24 * 60 * 60 * 1000),
      isActive: (ad.daysAgo ?? 30) < 60 ? 1 : 0,
      rawData: JSON.stringify({
        source:    "estimated",
        niche,
        generator,
        note: "Dados estimados — configure META_ACCESS_TOKEN para anúncios reais",
      }),
    });
  }
  log.info("ai", "Mock ads saved", { count: selectedAds.length, competitorId, niche, generator });
}

// ── Templates estáticos — 13 nichos + genérico universal ──────────────────────
function _staticMockAds(name: string, rawNiche: string): any[] {
  const n = rawNiche.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

  const detect = (): string => {
    if (n.includes("imov") || n.includes("imobil") || n.includes("aparta") || n.includes("real estate")) return "imoveis";
    if (n.includes("educa") || n.includes("curso") || n.includes("escola") || n.includes("ensino") || n.includes("infoprod")) return "educacao";
    if (n.includes("saude") || n.includes("medic") || n.includes("clinica") || n.includes("estetica") || n.includes("beleza")) return "saude";
    if (n.includes("ecomm") || n.includes("loja") || n.includes("varejo") || n.includes("moda") || n.includes("produto")) return "ecommerce";
    if (n.includes("financ") || n.includes("invest") || n.includes("banco") || n.includes("credit") || n.includes("seguro")) return "financeiro";
    if (n.includes("restaur") || n.includes("aliment") || n.includes("comida") || n.includes("food")) return "alimentacao";
    if (n.includes("academia") || n.includes("fitness") || n.includes("treino") || n.includes("esporte")) return "fitness";
    if (n.includes("advoca") || n.includes("juridic") || n.includes("direito")) return "juridico";
    if (n.includes("pet") || n.includes("animal") || n.includes("veterinar")) return "pet";
    if (n.includes("construc") || n.includes("reforma") || n.includes("arquitet")) return "construcao";
    if (n.includes("turismo") || n.includes("viagem") || n.includes("hotel") || n.includes("travel")) return "turismo";
    if (n.includes("tecnolog") || n.includes("software") || n.includes("saas") || n.includes("app") || n.includes("b2b")) return "tech";
    // Fallback: tenta detectar pelo nome do concorrente
    const nl = name.toLowerCase();
    if (nl.includes("imov") || nl.includes("imobil") || nl.includes("aparta")) return "imoveis";
    if (nl.includes("edu") || nl.includes("escola") || nl.includes("coleg"))   return "educacao";
    if (nl.includes("saude") || nl.includes("medic") || nl.includes("clinic")) return "saude";
    if (nl.includes("financ") || nl.includes("invest") || nl.includes("bank")) return "financeiro";
    return "generico";
  };

  const key = detect();

  const templates: Record<string, any[]> = {
    imoveis: [
      { adType: "video",    headline: `${name}: Apartamento frente mar em Balneário Camboriú`,  bodyText: "Vista permanente para o mar, 2 e 3 suítes. Pronto para morar.",             cta: "Ver imóvel",        daysAgo: 10 },
      { adType: "image",    headline: `${name}: Alto padrão com localização privilegiada`,      bodyText: "Empreendimento de luxo no centro. 4 vagas, lazer completo.",                 cta: "Agendar visita",    daysAgo: 21 },
      { adType: "carousel", headline: `${name}: 5 imóveis de alto padrão disponíveis agora`,   bodyText: "De studios a coberturas. Financiamento facilitado.",                         cta: "Ver opções",        daysAgo: 35 },
      { adType: "video",    headline: `${name}: Invista no metro mais valorizado do Brasil`,    bodyText: "Valoriza acima da média nacional. Rentabilidade comprovada.",                cta: "Quero investir",    daysAgo: 18 },
      { adType: "image",    headline: `${name}: Oportunidade — últimas unidades`,              bodyText: "Últimas unidades. Condições exclusivas para fechar.",                        cta: "Garantir agora",    daysAgo: 7  },
      { adType: "carousel", headline: `${name}: Apartamentos com lazer completo`,              bodyText: "Piscina, academia, salão de festas, spa. Conheça o projeto.",               cta: "Conhecer projeto",  daysAgo: 45 },
      { adType: "video",    headline: `${name}: Depoimento de cliente satisfeito`,             bodyText: "Valorizou 32% em 18 meses. Veja histórias reais de quem investiu.",         cta: "Ver depoimentos",   daysAgo: 60 },
    ],
    educacao: [
      { adType: "video",    headline: `${name}: Certificação reconhecida em 6 semanas`,        bodyText: "Aulas ao vivo + gravadas. Suporte individual. Certificado válido.",          cta: "Quero me inscrever", daysAgo: 12 },
      { adType: "image",    headline: `${name}: Bolsa de 50% para novos alunos`,               bodyText: "Última turma com desconto. Parcele em até 12x sem juros.",                   cta: "Garantir bolsa",    daysAgo: 5  },
      { adType: "carousel", headline: `${name}: O que você vai aprender`,                      bodyText: "Módulo 1 ao 8 — do básico ao avançado. Material atualizado.",                cta: "Ver grade",         daysAgo: 30 },
      { adType: "video",    headline: `${name}: Aluno empregado em 3 meses`,                   bodyText: "Nossos alunos conseguem emprego 3x mais rápido.",                            cta: "Saiba mais",        daysAgo: 20 },
      { adType: "image",    headline: `${name}: Mentoria incluída no plano`,                   bodyText: "Acesso direto ao professor. Dúvidas respondidas em até 24h.",               cta: "Começar agora",     daysAgo: 45 },
    ],
    saude: [
      { adType: "video",    headline: `${name}: Transforme seu corpo em 90 dias`,              bodyText: "Protocolo personalizado. Acompanhamento diário. +3.000 resultados.",         cta: "Quero começar",     daysAgo: 15 },
      { adType: "image",    headline: `${name}: Consulta online no mesmo dia`,                 bodyText: "Sem fila de espera. Atendimento humanizado. Planos a partir de R$ 79/mês.", cta: "Agendar agora",     daysAgo: 8  },
      { adType: "carousel", headline: `${name}: Tratamentos que realmente funcionam`,          bodyText: "Antes e depois reais. Mais de 2.000 pacientes satisfeitos.",                 cta: "Ver resultados",    daysAgo: 22 },
      { adType: "video",    headline: `${name}: Procedimento sem dor e resultado rápido`,      bodyText: "Tecnologia de última geração. Resultado em 1 sessão.",                       cta: "Agendar avaliação", daysAgo: 45 },
    ],
    ecommerce: [
      { adType: "image",    headline: `${name}: Frete grátis para todo o Brasil`,             bodyText: "Compre hoje, receba amanhã em capitais. Parcele em até 10x.",                cta: "Comprar agora",     daysAgo: 3  },
      { adType: "carousel", headline: `${name}: Coleção nova chegou`,                          bodyText: "Mais de 200 novidades. Preços de lançamento por 48h.",                       cta: "Ver coleção",       daysAgo: 7  },
      { adType: "video",    headline: `${name}: Mais de 4.500 avaliações 5 estrelas`,          bodyText: "Veja por que é o favorito dos clientes.",                                    cta: "Ver produto",       daysAgo: 18 },
      { adType: "image",    headline: `${name}: Desconto relâmpago — só hoje`,                 bodyText: "Até 50% off em produtos selecionados. Estoque limitado.",                    cta: "Aproveitar",        daysAgo: 4  },
    ],
    financeiro: [
      { adType: "video",    headline: `${name}: Seu dinheiro rendendo mais`,                   bodyText: "Rentabilidade acima do CDI. Zero taxa de administração. Resgate diário.",    cta: "Simular agora",     daysAgo: 10 },
      { adType: "image",    headline: `${name}: Crédito aprovado em minutos`,                 bodyText: "Taxa a partir de 1,49% ao mês. Sem consulta ao SPC.",                        cta: "Solicitar crédito", daysAgo: 6  },
      { adType: "carousel", headline: `${name}: Invista com segurança`,                       bodyText: "CDB, LCI, Fundos e mais. Garantia do FGC.",                                  cta: "Abrir conta",       daysAgo: 25 },
      { adType: "video",    headline: `${name}: Proteja seu patrimônio`,                       bodyText: "Seguros e previdência para você e sua família. Cotação grátis.",             cta: "Cotar agora",       daysAgo: 14 },
    ],
    alimentacao: [
      { adType: "image",    headline: `${name}: Sabor de verdade, entrega rápida`,             bodyText: "Ingredientes frescos. Entrega em 30 minutos.",                               cta: "Pedir agora",       daysAgo: 4  },
      { adType: "video",    headline: `${name}: O prato favorito de quem ama comer bem`,       bodyText: "Mais de 5.000 pedidos no mês. Veja o que os clientes falam.",               cta: "Ver cardápio",      daysAgo: 12 },
      { adType: "carousel", headline: `${name}: 5 pratos que você precisa experimentar`,       bodyText: "Feitos na hora, com ingredientes selecionados.",                             cta: "Pedir já",          daysAgo: 8  },
      { adType: "image",    headline: `${name}: Combo especial com 20% de desconto`,           bodyText: "Válido até domingo. Retire ou receba em casa.",                              cta: "Pegar oferta",      daysAgo: 3  },
    ],
    fitness: [
      { adType: "video",    headline: `${name}: -10kg em 90 dias com método comprovado`,       bodyText: "Treino personalizado + nutrição. Mais de 800 alunos transformados.",         cta: "Começar agora",     daysAgo: 15 },
      { adType: "image",    headline: `${name}: Primeira semana grátis`,                       bodyText: "Sem fidelidade. Cancele quando quiser. Venha conhecer.",                     cta: "Agendar aula",      daysAgo: 5  },
      { adType: "carousel", headline: `${name}: Estrutura completa para seu treino`,           bodyText: "Musculação, cardio, funcional e mais. Tudo em um lugar.",                    cta: "Conhecer",          daysAgo: 20 },
      { adType: "video",    headline: `${name}: Resultados reais de alunos reais`,             bodyText: "Veja as transformações dos nossos alunos em 3 meses.",                       cta: "Ver histórias",     daysAgo: 30 },
    ],
    juridico: [
      { adType: "image",    headline: `${name}: Seus direitos protegidos sem burocracia`,      bodyText: "Atendimento online em todo o Brasil. Primeira consulta gratuita.",           cta: "Falar com advogado", daysAgo: 10 },
      { adType: "video",    headline: `${name}: Você sabia que tem direito a isso?`,           bodyText: "Milhares de pessoas não conhecem seus direitos. Consulte agora.",            cta: "Quero saber mais",  daysAgo: 20 },
      { adType: "carousel", headline: `${name}: Casos resolvidos em menos de 30 dias`,         bodyText: "Trabalhista, cível, família. Especialistas em cada área.",                   cta: "Consultar agora",   daysAgo: 35 },
      { adType: "image",    headline: `${name}: Honorários só com resultado`,                  bodyText: "Sem cobrança antecipada. Você paga apenas se ganharmos.",                    cta: "Consultar grátis",  daysAgo: 7  },
    ],
    pet: [
      { adType: "image",    headline: `${name}: Seu pet merece o melhor cuidado`,              bodyText: "Banho e tosa, veterinário e hotel. Tudo em um lugar.",                       cta: "Agendar agora",     daysAgo: 7  },
      { adType: "video",    headline: `${name}: Ração premium com entrega em casa`,            bodyText: "Marcas top com frete grátis. Seu pet vai adorar.",                           cta: "Comprar agora",     daysAgo: 14 },
      { adType: "carousel", headline: `${name}: Cuidado completo para seu melhor amigo`,       bodyText: "Vacinas, consultas, petshop. Especialistas certificados.",                   cta: "Conhecer",          daysAgo: 25 },
      { adType: "video",    headline: `${name}: Veterinário online 24h`,                       bodyText: "Tire dúvidas sobre seu pet a qualquer hora. Planos a partir de R$ 29/mês.", cta: "Assinar agora",     daysAgo: 18 },
    ],
    construcao: [
      { adType: "video",    headline: `${name}: Reforma sem dor de cabeça`,                    bodyText: "Orçamento grátis em 24h. Material + mão de obra. Garantia de 5 anos.",      cta: "Pedir orçamento",   daysAgo: 12 },
      { adType: "image",    headline: `${name}: Sua casa nova sem obra interminável`,           bodyText: "Prazo garantido no contrato. Mais de 500 projetos entregues.",               cta: "Falar agora",       daysAgo: 22 },
      { adType: "carousel", headline: `${name}: Antes e depois — projetos reais`,              bodyText: "Veja a transformação que fizemos na casa dos nossos clientes.",               cta: "Ver projetos",      daysAgo: 40 },
      { adType: "video",    headline: `${name}: Construção do zero com preço justo`,           bodyText: "Do projeto à entrega. Engenheiros e arquitetos dedicados.",                  cta: "Solicitar visita",  daysAgo: 15 },
    ],
    turismo: [
      { adType: "carousel", headline: `${name}: Pacotes incríveis com tudo incluído`,          bodyText: "Voos, hotel e passeios. Parcele em até 12x sem juros.",                      cta: "Ver pacotes",       daysAgo: 8  },
      { adType: "video",    headline: `${name}: A viagem dos seus sonhos pelo melhor preço`,   bodyText: "Mais de 10.000 viajantes satisfeitos. Nacionais e internacionais.",           cta: "Quero viajar",      daysAgo: 18 },
      { adType: "image",    headline: `${name}: Promoção relâmpago — 48h`,                     bodyText: "Passagens + hotel com até 40% de desconto. Só hoje.",                        cta: "Garantir agora",    daysAgo: 3  },
      { adType: "video",    headline: `${name}: Lua de mel inesquecível`,                      bodyText: "Roteiros exclusivos para casais. Resorts e experiências únicas.",             cta: "Planejar viagem",   daysAgo: 30 },
    ],
    tech: [
      { adType: "video",    headline: `${name}: Automatize e escale seu negócio`,              bodyText: "Software que integra, automatiza e cresce com você. Teste 14 dias grátis.",  cta: "Testar grátis",     daysAgo: 10 },
      { adType: "image",    headline: `${name}: Reduza custos em 40% com IA`,                  bodyText: "Empresas economizam em média 40% em operações com nossa solução.",            cta: "Ver demonstração",  daysAgo: 20 },
      { adType: "carousel", headline: `${name}: Do caos à produtividade em 1 semana`,          bodyText: "Gestão de tarefas, CRM e relatórios em um único lugar.",                     cta: "Começar agora",     daysAgo: 30 },
      { adType: "video",    headline: `${name}: Integração com todas as ferramentas`,          bodyText: "Conecta com WhatsApp, CRM, ERP e mais. Setup em 1 hora.",                    cta: "Ver integrações",   daysAgo: 14 },
    ],
    generico: [
      { adType: "video",    headline: `${name}: A solução que você procurava`,                 bodyText: "Descubra como centenas de clientes transformaram seus resultados.",           cta: "Saiba mais",        daysAgo: 45 },
      { adType: "image",    headline: `${name}: Oferta por tempo limitado`,                    bodyText: "Condições especiais para novos clientes. Vagas limitadas.",                  cta: "Aproveitar",        daysAgo: 12 },
      { adType: "carousel", headline: `${name}: 5 razões para nos escolher`,                   bodyText: "Qualidade, atendimento, resultado, suporte e preço justo.",                  cta: "Conhecer",          daysAgo: 67 },
      { adType: "video",    headline: `${name}: Depoimentos reais de clientes`,                bodyText: "Veja o que nossos clientes falam sobre os resultados obtidos.",               cta: "Ver depoimentos",   daysAgo: 8  },
      { adType: "image",    headline: `${name}: Comece hoje mesmo`,                            bodyText: "Processo simples e rápido. Suporte completo desde o primeiro dia.",           cta: "Começar agora",     daysAgo: 23 },
      { adType: "carousel", headline: `${name}: Conheça nossas soluções`,                      bodyText: "Opções para todos os perfis e orçamentos.",                                  cta: "Ver mais",          daysAgo: 35 },
      { adType: "video",    headline: `${name}: O diferencial que muda tudo`,                  bodyText: "Descubra a estratégia que nos coloca à frente do mercado.",                  cta: "Descobrir",         daysAgo: 91 },
    ],
  };

  return templates[key] || templates.generico;
}



// ── Módulo 3: Market Intelligence ──
// ── Lock para evitar generateMarketAnalysis simultâneas do mesmo projeto ─────
const _marketAnalysisLock = new Map<number, Promise<any>>();

export async function generateMarketAnalysis(projectId: number) {
  const existing = _marketAnalysisLock.get(projectId);
  if (existing) {
    log.info("ai", "generateMarketAnalysis já em andamento — aguardando", { projectId });
    try { return await existing; } catch { /* ignora */ }
  }
  const promise = _generateMarketAnalysisImpl(projectId);
  _marketAnalysisLock.set(projectId, promise);
  try {
    return await promise;
  } finally {
    _marketAnalysisLock.delete(projectId);
  }
}

async function _generateMarketAnalysisImpl(projectId: number) {
  log.info("ai", "generateMarketAnalysis start", { projectId });

  const project       = await db.getProjectById(projectId);
  const clientProfile = await db.getClientProfile(projectId);
  const competitors   = await db.getCompetitorsByProjectId(projectId);
  const allAds: any[] = [];
  for (const comp of competitors) {
    const ads = await db.getScrapedAdsByCompetitor((comp as any).id);
    allAds.push(...ads.map((a: any) => ({ ...a, competitorName: (comp as any).name })));
  }

  // Monta seção detalhada com textos reais de cada concorrente
  const competitorsDetail = competitors.map((c: any) => {
    const compAds    = allAds.filter((a: any) => a.competitorName === c.name);
    const activeAds  = compAds.filter((a: any) => a.isActive);
    const ctaFreq    = compAds.reduce((acc: any, a: any) => { if (a.cta) acc[a.cta] = (acc[a.cta] || 0) + 1; return acc; }, {});
    const topCtas    = Object.entries(ctaFreq).sort((a: any, b: any) => b[1] - a[1]).slice(0, 3).map(([cta]) => cta);
    const fmtFreq    = compAds.reduce((acc: any, a: any) => { if (a.adType) acc[a.adType] = (acc[a.adType] || 0) + 1; return acc; }, {});
    const topFmts    = Object.entries(fmtFreq).sort((a: any, b: any) => b[1] - a[1]).map(([fmt, n]) => `${fmt}(${n})`).join(", ");

    // Headlines deduplicadas (max 3 para reduzir tamanho do prompt)
    const headlines  = [...new Set(compAds.map((a: any) => a.headline).filter(Boolean))].slice(0, 3);
    // Copies deduplicadas, primeiros 100 chars para caber no Groq
    const copies     = [...new Set(compAds.filter((a: any) => a.bodyText).map((a: any) => (a.bodyText as string).slice(0, 100)))].slice(0, 2);
    // Faixas de investimento
    const spends     = compAds.map((a: any) => { try { return JSON.parse(a.rawData || "{}").spend; } catch { return null; } }).filter(Boolean).slice(0, 5);

    return `CONCORRENTE: ${c.name}
  Website: ${(c as any).website || "n/a"}
  Total de anúncios: ${compAds.length} | Ativos: ${activeAds.length} | Formatos: ${topFmts || "n/a"}
  CTAs mais usados: ${topCtas.join(", ") || "n/a"}
  Investimento (faixas Meta): ${spends.join(", ") || "n/a"}

  Top headlines:
${headlines.map((h: any, i: number) => `    [${i + 1}] ${h}`).join("\n") || "    (sem headlines)"}

  Top copies:
${copies.map((cp: any, i: number) => `    [${i + 1}] ${cp}`).join("\n") || "    (sem copies)"}

  CTAs: ${topCtas.join(" | ") || "n/a"}`;
  }).join("\n\n");

  const prompt = `
PROJETO: ${(project as any)?.name || "Sem nome"}

PERFIL DO CLIENTE:
- Empresa: ${(clientProfile as any)?.companyName || "—"}
- Nicho: ${(clientProfile as any)?.niche || "—"}
- Produto/Serviço: ${(clientProfile as any)?.productService || "—"}
- Público-alvo: ${(clientProfile as any)?.targetAudience || "—"}
- Dor principal: ${(clientProfile as any)?.mainPain || "—"}
- Proposta de valor: ${(clientProfile as any)?.uniqueValueProposition || "—"}
- Transformação desejada: ${(clientProfile as any)?.desiredTransformation || "—"}
- Objeções dos clientes: ${(clientProfile as any)?.mainObjections || "—"}
- Objetivo da campanha: ${(clientProfile as any)?.campaignObjective || "leads"}
- Budget mensal: R$ ${(clientProfile as any)?.monthlyBudget || "não informado"}

CENÁRIO COMPETITIVO (${competitors.length} concorrentes | ${allAds.length} anúncios analisados):
${competitorsDetail || "Nenhum concorrente cadastrado ainda."}

Gere uma análise de mercado completa em JSON:
{
  "competitiveGaps": "string: lacunas que os concorrentes deixam abertas — seja específico com base nos anúncios reais",
  "unexploredOpportunities": "string: oportunidades inexploradas identificadas nos dados",
  "suggestedPositioning": "string: posicionamento recomendado com base nas fraquezas dos concorrentes",
  "threats": "string: ameaças concretas identificadas (quem está mais ativo, o que está escalando)",
  "competitiveMap": "string: mapa do cenário atual — quem lidera, quem é nicho, onde há espaço"
}
`;

  let result: any;
  try {
    // Monta payload para o MECPro AI Service
    const competitorsPayload = competitors.map((c: any) => ({
      name: c.name,
      ads:  allAds
        .filter((a: any) => a.competitorName === c.name)
        .slice(0, 8)
        .map((a: any) => ({
          adType:   a.adType,
          isActive: a.isActive,
          headline: a.headline,
          bodyText: a.bodyText?.slice(0, 200),
          cta:      a.cta,
        })),
    }));

    // Tenta MECPro AI Service (Groq gratuito) primeiro
    result = await mecproAI("market-analysis", {
      projectName:   (project as any)?.name || "Projeto",
      clientProfile: clientProfile || undefined,
      competitors:   competitorsPayload,
    });

    // Fallback para Gemini direto (com controle de quota)
    if (!result) {
      if (shouldUseLLM("medium")) {
        const raw = await gemini(prompt, { temperature: 0.3 });
        result = JSON.parse(raw);
      } else {
        log.info("ai", "Market analysis: modo econômico ativo — usando dados locais do banco");
        result = null; // força fallback local abaixo
        throw new Error("eco_mode");
      }
    }

    // Normaliza resposta aninhada (ex: { data: { competitiveGaps: ... } })
    if (result && !result.competitiveGaps && (result.data || result.result || result.response)) {
      result = result.data ?? result.result ?? result.response;
    }
  } catch (e: any) {
    const isEcoMode = e.message === "eco_mode";
    log.warn("ai", isEcoMode ? "Market analysis: modo econômico — usando dados locais" : "Market analysis parse error", { error: e.message });
    // Usa dados REAIS do banco em vez de mensagens genéricas
    const adPatterns = await db.getAdPatterns(clientProfile?.niche || "geral", undefined, 50).catch(() => [] as any[]);
    result = buildMarketAnalysisFromData(competitors, allAds, clientProfile, adPatterns);
  }

  const aiModel = MECPRO_AI_URL ? "mecpro-ai/groq" : GEMINI_API_KEY ? "gemini-2.5-flash" : "mock";
  const analysis = await db.upsertMarketAnalysis({
    projectId,
    ...result,
    aiModel,
  });

  log.info("ai", "generateMarketAnalysis done", { projectId });
  return analysis;
}

// ── Módulo 4: Gerar campanha ──
export async function generateCampaign(input: {
  projectId: number; name: string; objective: string;
  platform: string; budget: number; duration: number; extraContext?: string;
  ageMin?: number; ageMax?: number; regions?: string[]; countries?: string[];
  locationMode?: "brasil" | "paises" | "raio"; geoCity?: string; geoRadius?: number;
  mediaFormat?: string; audienceProfile?: string; leadForm?: any;
}) {
  log.info("ai", "generateCampaign start", { projectId: input.projectId, objective: input.objective });

  const clientProfile = await db.getClientProfile(input.projectId);
  const competitors   = await db.getCompetitorsByProjectId(input.projectId);
  const marketAnalysis = await db.getMarketAnalysis(input.projectId);
  const allAds: any[] = [];
  for (const comp of competitors) {
    const ads = await db.getScrapedAdsByCompetitor((comp as any).id);
    allAds.push(...ads.map((a: any) => ({ ...a, competitorName: (comp as any).name })));
  }

  const budgetDaily = Math.round(input.budget / 30);
  const objectiveLabels: Record<string, string> = {
    leads: "captação de leads", sales: "vendas diretas", branding: "branding e alcance",
    traffic: "tráfego para site", engagement: "engajamento"
  };

  // ── Benchmarks: Meta Insights API (real) + fallback por nicho ──
  const niche      = (clientProfile as any)?.niche || "";
  const benchmarks = resolveNicheBenchmarks(niche);

  // Busca integração Meta do usuário dono do projeto — multi-tenant
  const project        = await db.getProjectById(input.projectId);
  const userId         = (project as any)?.userId;
  const metaIntegration = userId ? await db.getApiIntegration(userId, "meta") : null;
  const userMetaToken     = (metaIntegration as any)?.accessToken  || undefined;
  const userMetaAccountId = (metaIntegration as any)?.adAccountId  || undefined;

  const metaInsights = await fetchMetaInsightsBenchmarks(userMetaToken, userMetaAccountId);
  const activeAds      = allAds.filter((a: any) => a.isActive);
  const longRunningAds = allAds.filter((a: any) => {
    if (!a.startDate) return false;
    const days = (Date.now() - new Date(a.startDate).getTime()) / (1000 * 60 * 60 * 24);
    return days >= 30;
  });
  const ctaFreq = allAds.reduce((acc: any, a: any) => {
    if (a.cta) acc[a.cta] = (acc[a.cta] || 0) + 1;
    return acc;
  }, {});
  const topCtas = Object.entries(ctaFreq).sort((a: any, b: any) => b[1] - a[1]).slice(0, 3).map(([cta]) => cta);
  const fmtFreq = allAds.reduce((acc: any, a: any) => {
    if (a.adType) acc[a.adType] = (acc[a.adType] || 0) + 1;
    return acc;
  }, {});
  const dominantFormat = Object.entries(fmtFreq).sort((a: any, b: any) => (b[1] as number) - (a[1] as number))[0]?.[0] || "image";
  const monthlyBudget  = (clientProfile as any)?.monthlyBudget || input.budget;
  const campaignObjective = (clientProfile as any)?.campaignObjective || input.objective;
  const targetingConfig = {
    ageMin: input.ageMin ?? 18,
    ageMax: input.ageMax ?? 65,
    locationMode: input.locationMode || (input.countries?.length ? "paises" : input.geoCity ? "raio" : "brasil"),
    regions: Array.isArray(input.regions) ? input.regions : [],
    countries: Array.isArray(input.countries) ? input.countries : [],
    geoCity: input.geoCity?.trim() || "",
    geoRadius: input.geoRadius ?? 15,
  };
  const normalizedLeadFormDraft = input.leadForm
    ? {
        name: String(input.leadForm?.name || `Leads - ${input.name}`).trim(),
        fields: Array.isArray(input.leadForm?.fields) && input.leadForm.fields.length > 0
          ? input.leadForm.fields
          : ["FULL_NAME", "EMAIL", "PHONE"],
        customQuestion: typeof input.leadForm?.customQuestion === "string" ? input.leadForm.customQuestion.trim() : "",
        thankYouMessage: typeof input.leadForm?.thankYouMessage === "string" ? input.leadForm.thankYouMessage.trim() : "",
        privacyUrl: typeof input.leadForm?.privacyUrl === "string" ? input.leadForm.privacyUrl.trim() : "",
      }
    : null;
  const publishPreferences = {
    destination: input.objective === "leads" || !!normalizedLeadFormDraft ? "lead_form" : "website",
    mediaFormat: input.mediaFormat || null,
    audienceProfile: input.audienceProfile || null,
  };

  const prompt = `
Você é um estrategista de marketing digital sênior especializado em performance.
Crie uma campanha completa e detalhada para o seguinte briefing:

CAMPANHA: ${input.name}
OBJETIVO: ${objectiveLabels[input.objective] || input.objective}
PLATAFORMA: ${
  input.platform === "both"   ? "Meta Ads + Google Ads" :
  input.platform === "meta"   ? "Meta Ads (Facebook + Instagram)" :
  input.platform === "tiktok" ? "TikTok Ads (vídeos curtos, In-Feed Ads, TopView)" :
  input.platform === "all"    ? "Meta Ads + Google Ads + TikTok Ads" :
  "Google Ads"
}${input.platform === "tiktok" || input.platform === "all" ? `
DIRETRIZES TIKTOK:
- Formato principal: vídeo vertical 9:16, 15-60 segundos
- Hook nos primeiros 3 segundos (essencial para retenção)
- Texto na tela + narração + música trending
- CTA claro e direto
- Tom: autêntico, dinâmico, menos "publicitário"
- Hashtags relevantes (#fyp + nicho)
- Considerar TikTok In-Feed Ads, TopView e Branded Hashtag Challenge` : ""}
ORÇAMENTO: R$ ${input.budget}/mês (R$ ${budgetDaily}/dia)
DURAÇÃO: ${input.duration} dias

PERFIL DO CLIENTE:
- Empresa: ${(clientProfile as any)?.companyName || "—"}
- Nicho: ${(clientProfile as any)?.niche || "—"}
- Produto: ${(clientProfile as any)?.productService || "—"}
- Público-alvo: ${(clientProfile as any)?.targetAudience || "—"}
- Dor principal: ${(clientProfile as any)?.mainPain || "—"}
- Transformação desejada: ${(clientProfile as any)?.desiredTransformation || "—"}
- Proposta única de valor: ${(clientProfile as any)?.uniqueValueProposition || "—"}
- Principais objeções: ${(clientProfile as any)?.mainObjections || "—"}
- Budget mensal declarado: R$ ${monthlyBudget}
- Objetivo principal: ${campaignObjective}

INTELIGÊNCIA COMPETITIVA (dados reais coletados):
- Concorrentes analisados: ${competitors.map((c: any) => c.name).join(", ") || "nenhum"}
- Total de anúncios coletados: ${allAds.length}
- Anúncios ativos agora: ${activeAds.length}
- Anúncios rodando há 30+ dias (validados): ${longRunningAds.length}
- CTAs mais usados pelos concorrentes: ${topCtas.join(", ") || "não disponível"}
- Formato dominante nos anúncios: ${dominantFormat}
- Taxa de sobrevivência (ativos/total): ${allAds.length > 0 ? Math.round((activeAds.length / allAds.length) * 100) : 0}%
${marketAnalysis ? `
- Posicionamento recomendado: ${(marketAnalysis as any).suggestedPositioning || "—"}
- Gaps competitivos: ${(marketAnalysis as any).competitiveGaps || "—"}
- Oportunidades: ${(marketAnalysis as any).unexploredOpportunities || "—"}
- Ameaças: ${(marketAnalysis as any).threats || "—"}
` : ""}
${input.extraContext ? `CONTEXTO ADICIONAL DO CLIENTE:
${input.extraContext}` : ""}

DADOS REAIS DE PERFORMANCE — META ADS INSIGHTS API (últimos 30 dias da conta):
${metaInsights ? `
✅ Fonte: ${metaInsights.source}
- Investimento real (30d): R$ ${metaInsights.spend.toFixed(2)}
- Impressões: ${metaInsights.impressions.toLocaleString("pt-BR")}
- Cliques: ${metaInsights.clicks.toLocaleString("pt-BR")}
- CPC real da conta: R$ ${metaInsights.cpc.toFixed(2)}
- CPM real da conta: R$ ${metaInsights.cpm.toFixed(2)}
- CTR real da conta: ${metaInsights.ctr.toFixed(2)}%
- CPL real da conta: ${metaInsights.cpl > 0 ? "R$ " + metaInsights.cpl.toFixed(2) : "sem dados de lead"}
- ROAS real da conta: ${metaInsights.roas > 0 ? metaInsights.roas.toFixed(2) + "x" : "sem dados de compra"}
- Leads gerados (30d): ${metaInsights.leads}
USE ESSES VALORES REAIS como base principal para as métricas estimadas da campanha.
` : `⚠️ Meta Insights indisponível — usando benchmarks do nicho como referência.`}

BENCHMARKS DO NICHO "${benchmarks.label}" (referência secundária — WordStream BR 2025):
- CPC referência: ${fmtRange(benchmarks.cpc)}
- CPL referência: ${fmtRange(benchmarks.cpl)}
- CPA referência: ${fmtRange(benchmarks.cpa)}
- CPM referência: ${fmtRange(benchmarks.cpm)}
- CTR referência: ${fmtRange(benchmarks.ctr, "")}%
- ROAS referência: ${benchmarks.roas[0]}x — ${benchmarks.roas[1]}x

INSTRUÇÃO PARA MÉTRICAS:
- Priorize os dados reais da Meta Insights API se disponíveis
- Budget desta campanha: R$ ${input.budget}/mês (R$ ${budgetDaily}/dia)
- ${longRunningAds.length} anúncios dos concorrentes rodando 30+ dias = mercado ativo
- Formato dominante dos concorrentes: "${dominantFormat}" → ajuste CPM (vídeo +20%, imagem = base)
- Leads estimados = R$ ${input.budget} ÷ CPL ${metaInsights?.cpl > 0 ? "real R$ " + metaInsights.cpl.toFixed(2) : "referência do nicho"}
- breakEvenROAS baseado no produto: "${(clientProfile as any)?.productService || "não informado"}"
- O insight deve mencionar se os dados são reais (Meta API) ou estimados (benchmark)

COMPLIANCE META ADS 2026 — APLIQUE OBRIGATORIAMENTE:
${META_POLICY_RULES_2026}

VALIDAÇÃO: Antes de gerar cada criativo, verifique conformidade com as regras acima.
Gere campo "complianceScore": "safe"|"warning"|"danger" e "complianceNotes" em cada criativo.
Se warning/danger, gere versão alternativa segura no campo "safeAlternative".

Crie uma campanha COMPLETA como Campaign Intelligence System. Responda APENAS em JSON válido:
{
  "strategy": "estratégia geral da campanha em 3-4 parágrafos baseada nos dados dos concorrentes",
  "campaignName": "nomenclatura padrão: Campanha_[Nicho]_[Objetivo]_[CTA]_[Plataforma]",
  "adSets": [
    {"name": "...", "audience": "descrição detalhada do público", "budget": "R$ X/dia (Y% do total)", "objective": "...", "funnelStage": "TOF|MOF|BOF|SCALE"}
  ],
  "creatives": [
    {
      "type": "testimonial|storytelling|authority|lead_magnet|social_proof|direct_offer",
      "format": "Vídeo 15s|Vídeo 30s|Carrossel|Imagem estática|Stories 9:16|Reels 9:16",
      "orientation": "vertical_9_16|quadrado_1_1|feed_4_5|horizontal_16_9",
      "headline": "headline REAL max 40 chars — específica para o nicho, NUNCA use [placeholder]",
      "copy": "copy REAL max 125 chars — texto do anúncio completo e persuasivo",
      "bodyText": "MESMO valor de copy — campo obrigatório para compatibilidade",
      "cta": "para LEADS: Quero meu guia grátis|Cadastrar grátis. Para SALES: Comprar agora|Garantir desconto. NUNCA apenas Saiba mais",
      "hook": "gancho real dos primeiros 3 segundos que para o scroll",
      "pain": "dor específica do público deste nicho",
      "solution": "solução que o produto oferece",
      "script": "roteiro de 30s para vídeo (se format for vídeo) — cenas, narração e CTA",
      "funnelStage": "TOF|MOF|BOF",
      "complianceScore": "safe|warning|danger",
      "complianceNotes": "notas de conformidade Meta",
      "safeAlternative": "versão alternativa segura se warning ou danger"
    }
  ],
  INSTRUÇÃO CRÍTICA: Gere EXATAMENTE 4 criativos com formatos DIFERENTES entre si:
    criativo 1: Imagem Feed (4:5) — TOF (público frio)
    criativo 2: Vídeo 15s Reels/Stories (9:16) — TOF ou MOF
    criativo 3: Carrossel — MOF (consideração)
    criativo 4: Imagem ou Vídeo — BOF (conversão/fundo de funil)
  NUNCA repita o mesmo format+funnelStage. NUNCA use [placeholder] em nenhum campo.
  TODOS os campos são obrigatórios — especialmente headline, copy, bodyText, hook, pain, solution, cta.
  "hooks": [
    {"type": "curiosidade", "text": "..."},
    {"type": "dor", "text": "..."},
    {"type": "choque", "text": "..."},
    {"type": "identificação", "text": "..."},
    {"type": "promessa", "text": "..."}
  ],
  "abTests": [
    {"test": "hook", "variationA": "...", "variationB": "...", "metric": "CTR"},
    {"test": "criativo", "variationA": "...", "variationB": "...", "metric": "CPL"},
    {"test": "público", "variationA": "...", "variationB": "...", "metric": "CPA"},
    {"test": "copy", "variationA": "...", "variationB": "...", "metric": "CTR"},
    {"test": "landing_page", "variationA": "...", "variationB": "...", "metric": "conversão"}
  ],
  "tracking": {
    "pixel": {"events": ["ViewContent", "Lead", "InitiateCheckout", "Purchase"], "priority": "instalar pixel antes de ativar campanha"},
    "ga4": "configurar evento de conversão principal",
    "recommendation": "..."
  },
  "optimization": [
    {"condition": "CTR < 1.5%", "action": "trocar criativo", "priority": "alta"},
    {"condition": "CPC > referência do nicho", "action": "revisar segmentação de público", "priority": "média"},
    {"condition": "CPL alto", "action": "otimizar landing page com CRO", "priority": "alta"}
  ],
  "scaling": {
    "lookalike": [
      {"audience": "1% leads", "budget": "+20%"},
      {"audience": "3% visitantes", "budget": "+30%"},
      {"audience": "5% compradores", "budget": "+50%"}
    ],
    "strategy": "aumentar budget 20% a cada 3 dias nos conjuntos vencedores"
  },
  "conversionFunnel": [
    {"stage": "TOF | MOF | BOF | RETENÇÃO", "action": "...", "format": "..."}
  ],
  "executionPlan": [
    {"week": "...", "title": "...", "description": "..."}
  ],
  "metrics": {
    "estimatedCPC": "R$ X,XX — baseado no nicho ${(clientProfile as any)?.niche || ''} e formato ${dominantFormat}",
    "estimatedCPL": "R$ X,XX — baseado no budget R$ ${input.budget} e objetivo ${input.objective}",
    "estimatedCPA": "R$ X,XX — estimativa para conversão no nicho",
    "estimatedCTR": "X,X% — referência: ${longRunningAds.length} anúncios validados (30+ dias) dos concorrentes",
    "estimatedCPM": "R$ X,XX — baseado no formato ${dominantFormat} no mercado brasileiro",
    "expectedROAS": "X,X — calculado para objetivo ${input.objective} com budget R$ ${input.budget}",
    "breakEvenROAS": "X,X — mínimo para cobrir investimento de R$ ${input.budget}",
    "leadsPerMonth": "XX leads estimados com R$ ${input.budget}/mês",
    "insight": "recomendação prática baseada nos ${allAds.length} anúncios coletados e budget de R$ ${input.budget}"
  },
  "glossary": [
    {"term": "CTA", "meaning": "Call To Action — chamada para ação", "example": "${topCtas[0] || 'Falar no WhatsApp'}"},
    {"term": "CPC", "meaning": "Custo por Clique", "example": "valor calculado acima para este nicho"},
    {"term": "CPL", "meaning": "Custo por Lead", "example": "valor calculado acima para este objetivo"},
    {"term": "CPA", "meaning": "Custo por Aquisição", "example": "valor calculado acima"},
    {"term": "ROAS", "meaning": "Retorno sobre investimento em anúncios", "example": "ROAS ${Math.round(input.budget > 0 ? 3 : 5)} = meta mínima para este budget"},
    {"term": "CTR", "meaning": "Taxa de cliques", "example": "referência dos ${longRunningAds.length} anúncios validados dos concorrentes"},
    {"term": "CPM", "meaning": "Custo por mil impressões", "example": "varia por formato: vídeo > imagem > carrossel"},
    {"term": "TOF", "meaning": "Top of Funnel — topo do funil", "example": "atração de público frio — ${Math.round(input.budget * 0.4)}/mês (40%)"},
    {"term": "MOF", "meaning": "Middle of Funnel — meio do funil", "example": "consideração — ${Math.round(input.budget * 0.35)}/mês (35%)"},
    {"term": "BOF", "meaning": "Bottom of Funnel — fundo do funil", "example": "conversão — ${Math.round(input.budget * 0.25)}/mês (25%)"},
    {"term": "CRO", "meaning": "Conversion Rate Optimization", "example": "melhorar página de vendas para aumentar % de conversão"}
  ]
}
`;

  let adSets, creatives, conversionFunnel, executionPlan, strategy = "";
  let aiResponse: string | null = null;
  let campaignName: string | null = null;

  // Usa o helper global para comprimir prompts grandes antes de enviar ao Groq
  const compressPromptForGroq = (p: string, maxChars: number) => _compressPromptLight(p, maxChars);


  // Tenta reparar JSON truncado fechando chaves/colchetes abertos e strings
  function repairJson(raw: string): string {
    let s = raw.replace(/```json|```/g, "").trim();
    // Remove trailing vírgulas antes de fechar
    s = s.replace(/,\s*([}\]])/g, "$1");

    // Detecta string truncada no meio: termina com " sem fechar
    // Ex: "text": "valor truncado aqui   → fecha a string
    const lastQuote = s.lastIndexOf('"');
    const secondLast = s.lastIndexOf('"', lastQuote - 1);
    if (lastQuote > 0 && secondLast > 0) {
      const afterLastQuote = s.slice(lastQuote + 1).trim();
      // Se depois da última aspas não há : , } ] significa string aberta
      if (!afterLastQuote.match(/^[\s]*[:,}\]]/)) {
        s = s.slice(0, lastQuote) + '"'; // fecha a string
      }
    }

    // Remove última propriedade incompleta (chave sem valor)
    s = s.replace(/,?\s*"[^"]*"\s*:\s*$/, "");
    s = s.replace(/,?\s*"[^"]*"\s*$/, "");

    // Conta colchetes e chaves abertas e fecha se necessário
    const opens = (s.match(/\[/g) || []).length - (s.match(/\]/g) || []).length;
    const braces = (s.match(/\{/g) || []).length - (s.match(/\}/g) || []).length;
    for (let i = 0; i < opens; i++)  s += "]";
    for (let i = 0; i < braces; i++) s += "}";
    return s;
  }

  try {
    const raw = await gemini(prompt, { temperature: 0.6 });
    let parsed: any;
    try {
      parsed = JSON.parse(raw);
    } catch {
      // Tenta reparar e parsear novamente
      parsed = JSON.parse(repairJson(raw));
      log.warn("ai", "Campaign JSON reparado automaticamente");
    }
    // Valida que o Gemini retornou dados de campanha reais (não mock de concorrente)
    if (!parsed.strategy && !parsed.adSets && !parsed.creatives) {
      log.warn("ai", "Gemini retornou resposta sem campos de campanha — pode ser mock interno");
      throw new Error("Gemini response missing campaign fields — triggering Groq fallback");
    }
    strategy         = parsed.strategy || "";
    adSets           = JSON.stringify(parsed.adSets || []);
    // Normalizar criativos — garantir bodyText + campos obrigatórios
    const rawCreatives = parsed.creatives || [];
    const normalizedCreatives = rawCreatives.map((cr: any) => ({
      ...cr,
      // bodyText = copy (compatibilidade com frontend)
      bodyText: cr.bodyText || cr.copy || cr.description || "",
      copy:     cr.copy     || cr.bodyText || cr.description || "",
      // Garantir campos obrigatórios
      headline:    cr.headline    || cr.hook || "Confira agora",
      hook:        cr.hook        || cr.headline || "",
      pain:        cr.pain        || "",
      solution:    cr.solution    || "",
      cta:         cr.cta         || "Saiba Mais",
      funnelStage: cr.funnelStage || "TOF",
      format:      cr.format      || "Imagem estática",
      type:        cr.type        || "direct_offer",
      orientation: cr.orientation || "feed_4_5",
    }));
    creatives = JSON.stringify(normalizedCreatives);
    conversionFunnel = JSON.stringify(parsed.conversionFunnel || []);
    executionPlan    = JSON.stringify(parsed.executionPlan || []);
    aiResponse = JSON.stringify({
      campaignName: parsed.campaignName || null,
      metrics:      parsed.metrics      || null,
      glossary:     parsed.glossary     || null,
      hooks:        parsed.hooks        || null,
      abTests:      parsed.abTests      || null,
      tracking:     parsed.tracking     || null,
      optimization: parsed.optimization || null,
      scaling:      parsed.scaling      || null,
      targetingConfig,
      leadFormDraft: normalizedLeadFormDraft,
      publishPreferences,
    });
  } catch (e: any) {
    log.warn("ai", "Campaign parse error — tentando Groq como fallback", { error: e.message });

    // Tenta Groq quando Gemini retorna JSON truncado
    // Para Groq: usa prompt mínimo focado nos dados essenciais — evita 413
    const groqMinimalPrompt = (() => {
      const p = (clientProfile as any);
      const compSummary = competitors.slice(0, 3).map((c: any) => {
        const cAds = allAds.filter((a: any) => a.competitorName === (c as any).name);
        const cHeadlines = cAds.map((a: any) => a.headline).filter(Boolean).slice(0, 2).join("; ");
        const cCtas = [...new Set(cAds.map((a: any) => a.cta).filter(Boolean))].slice(0, 3).join(", ");
        return `${(c as any).name}: ${cAds.length} ads, CTAs: ${cCtas || "n/a"}, headlines: ${cHeadlines || "n/a"}`;
      }).join("\n");
      return `Crie uma campanha de ${input.objective} para "${p?.companyName || input.name}" (nicho: ${p?.niche || "geral"}).
Produto: ${p?.productService || "não informado"}. Público: ${p?.targetAudience || "não definido"}.
Budget: R$${input.budget}/mês. Plataforma: ${input.platform}.
Dor: ${p?.mainPain || "—"}. Proposta: ${p?.uniqueValueProposition || "—"}.
Concorrentes:
${compSummary || "Nenhum cadastrado."}
${metaInsights ? `Performance real: CPC R$${metaInsights.cpc.toFixed(2)}, CPM R$${metaInsights.cpm.toFixed(2)}, CTR ${metaInsights.ctr.toFixed(2)}%` : ""}
${marketAnalysis ? `Oportunidade: ${(marketAnalysis as any).unexploredOpportunities?.slice(0,200) || ""}` : ""}

Gere JSON com: strategy(string), campaignName(string), adSets(array com name/audience/budget/objective/funnelStage), creatives(array com type/format/orientation/headline/copy/bodyText/hook/pain/solution/cta/funnelStage/complianceScore/targetAudience/platforms/budget/duration), conversionFunnel(array com stage/format/audience/budget/kpi), executionPlan(array com week/action/budget/kpi), metrics(objeto com estimatedCPC/CPM/CTR/leads/ROAS/breakEven/insight).`;
    })();
    try {
      const groqRaw = await callGroqAPI(groqMinimalPrompt, undefined, 0.6);
      if (groqRaw) {
        let groqParsed: any;
        try { groqParsed = JSON.parse(groqRaw); }
        catch { groqParsed = JSON.parse(repairJson(groqRaw)); }
        strategy         = groqParsed.strategy || "";
        adSets           = JSON.stringify(groqParsed.adSets || []);
        const groqRawCreatives = groqParsed.creatives || [];
        creatives = JSON.stringify(groqRawCreatives.map((cr: any) => ({
          ...cr,
          bodyText: cr.bodyText || cr.copy || "",
          copy:     cr.copy     || cr.bodyText || "",
          headline:    cr.headline    || cr.hook || "Confira agora",
          hook:        cr.hook        || cr.headline || "",
          pain:        cr.pain        || "",
          solution:    cr.solution    || "",
          cta:         cr.cta         || "Saiba Mais",
          funnelStage: cr.funnelStage || "TOF",
          format:      cr.format      || "Imagem estática",
          type:        cr.type        || "direct_offer",
          orientation: cr.orientation || "feed_4_5",
        })));
        conversionFunnel = JSON.stringify(groqParsed.conversionFunnel || []);
        executionPlan    = JSON.stringify(groqParsed.executionPlan || []);
        // Salva dados extras do Groq no aiResponse imediatamente
        campaignName = groqParsed.campaignName || input.name;
        aiResponse = JSON.stringify({
          campaignName,
          metrics:      groqParsed.metrics      || null,
          glossary:     groqParsed.glossary      || null,
          hooks:        groqParsed.hooks         || null,
          abTests:      groqParsed.abTests       || null,
          tracking:     groqParsed.tracking      || null,
          optimization: groqParsed.optimization  || null,
          scaling:      groqParsed.scaling       || null,
          targetingConfig,
          leadFormDraft: normalizedLeadFormDraft,
          publishPreferences,
        });
        log.info("ai", "Campaign gerada via Groq fallback — todos os campos salvos", {
          hasMetrics: !!groqParsed.metrics,
          hasHooks: !!groqParsed.hooks,
          creativesCount: groqParsed.creatives?.length || 0,
        });
      } else {
        throw new Error("Groq sem resposta");
      }
    } catch (groqErr: any) {
      log.warn("ai", "Groq fallback falhou — tentando MECPro AI Service antes do mock", { error: groqErr.message });
      // Última tentativa: MECPro AI Service com prompt comprimido
      try {
        const miniPrompt = compressPromptForGroq(prompt, 10000); // mini para MECPro
        const mecResult: any = await mecproAI("generate-campaign", {
          prompt: miniPrompt,
          projectId: input.projectId,
          objective: input.objective,
          budget: input.budget,
          niche: (clientProfile as any)?.niche || "",
          companyName: (clientProfile as any)?.companyName || "",
        });
        if (mecResult && mecResult.strategy) {
          strategy         = mecResult.strategy || "";
          adSets           = JSON.stringify(mecResult.adSets || []);
          const mcRaw = mecResult.creatives || [];
          creatives = JSON.stringify(mcRaw.map((cr: any) => ({
            ...cr,
            bodyText: cr.bodyText || cr.copy || "",
            copy: cr.copy || cr.bodyText || "",
            headline: cr.headline || cr.hook || "Confira agora",
            hook: cr.hook || cr.headline || "",
            pain: cr.pain || "",
            solution: cr.solution || "",
            cta: cr.cta || "Saiba Mais",
            funnelStage: cr.funnelStage || "TOF",
            format: cr.format || "Imagem estática",
            type: cr.type || "direct_offer",
            orientation: cr.orientation || "feed_4_5",
          })));
          conversionFunnel = JSON.stringify(mecResult.conversionFunnel || []);
          executionPlan    = JSON.stringify(mecResult.executionPlan || []);
          campaignName = mecResult.campaignName || input.name;
          aiResponse = JSON.stringify({
            campaignName,
            metrics:      mecResult.metrics      || null,
            glossary:     mecResult.glossary      || null,
            hooks:        mecResult.hooks         || null,
            abTests:      mecResult.abTests       || null,
            tracking:     mecResult.tracking      || null,
            optimization: mecResult.optimization  || null,
            scaling:      mecResult.scaling       || null,
            targetingConfig,
            leadFormDraft: normalizedLeadFormDraft,
            publishPreferences,
          });
          log.info("ai", "Campaign gerada via MECPro AI Service (fallback final) — campos salvos");
        } else {
          throw new Error("MECPro AI retornou resposta inválida");
        }
      } catch (mecErr: any) {
        log.warn("ai", "Todos os LLMs falharam — usando motor híbrido", { error: mecErr.message });
        try {
          const [scrapedAds, profile] = await Promise.all([
            db.getScrapedAdsByProject(projectId).catch(()=>[] as any[]),
            db.getClientProfile(projectId).catch(()=>null),
          ]);
          const hybrid = await buildCampaignFromAds(projectId, objective, profile, scrapedAds);
          strategy         = hybrid.strategy;
          adSets           = JSON.stringify(hybrid.adSets);
          creatives        = JSON.stringify(hybrid.creatives);
          conversionFunnel = JSON.stringify(hybrid.conversionFunnel || []);
          executionPlan    = JSON.stringify(hybrid.executionPlan    || []);
          aiResponse       = JSON.stringify({ metrics: hybrid.metrics, generatedBy: "hybrid_engine", _isMock: false });
          log.info("ai", "✅ Motor híbrido gerou campanha completa", { projectId, creatives: hybrid.creatives.length, hasFunnel: !!(hybrid.conversionFunnel?.length), hasPlan: !!(hybrid.executionPlan?.length) });
        } catch {
          const mock=JSON.parse(mockResponse("campanha"));
          strategy=mock.strategy; adSets=JSON.stringify(mock.adSets); creatives=JSON.stringify(mock.creatives);
          conversionFunnel=JSON.stringify([]); executionPlan=JSON.stringify([]);
        }
      }
    } // fim catchch groqErr
    // aiResponse já foi setado em cada branch (Groq/MECPro/mock) — apenas garante fallback
    if (!aiResponse) {
      aiResponse = JSON.stringify({
        campaignName: campaignName || input.name,
        metrics: null, glossary: null, hooks: null, abTests: null,
        tracking: null, optimization: null, scaling: null,
        targetingConfig, leadFormDraft: normalizedLeadFormDraft, publishPreferences,
      });
    }
  }

  try {
    const parsedCreatives = JSON.parse(creatives || "[]");
    if (Array.isArray(parsedCreatives) && parsedCreatives.length > 0) {
      const enrichedCreatives = await enrichCreativesWithScoresAndImages(parsedCreatives, {
        objective: input.objective,
        segment: input.extraContext || (clientProfile as any)?.niche || input.name,
      });
      const creativesWithV2 = enrichedCreatives.map((rawCreative: any) => {
        let creative = rawCreative as CampaignCreative;
        creative = syncCreativeTextToV2(creative);
        if (creative.feedImageUrl || creative.feedImageHash) {
          creative = syncCreativeImageToV2(creative, "feed", {
            imageUrl: creative.feedImageUrl ?? null,
            imageHash: creative.feedImageHash ?? null,
          });
        }
        if (creative.storyImageUrl || creative.storyImageHash) {
          creative = syncCreativeImageToV2(creative, "stories", {
            imageUrl: creative.storyImageUrl ?? null,
            imageHash: creative.storyImageHash ?? null,
          });
        }
        if (creative.squareImageUrl || creative.squareImageHash) {
          creative = syncCreativeImageToV2(creative, "square", {
            imageUrl: creative.squareImageUrl ?? null,
            imageHash: creative.squareImageHash ?? null,
          });
        }
        return creative;
      });
      creatives = JSON.stringify(creativesWithV2);
    }
  } catch (error: any) {
    log.warn("ai", "Falha ao enriquecer criativos com score/imagem", { error: error?.message });
  }

  const campaign = await db.createCampaign({
    projectId: input.projectId,
    name: input.name,
    objective: input.objective as any,
    platform: input.platform,
    suggestedBudgetDaily: budgetDaily,
    suggestedBudgetMonthly: input.budget,
    durationDays: input.duration,
    strategy,
    adSets,
    creatives,
    conversionFunnel,
    executionPlan,
    aiPromptUsed: prompt.slice(0, 500),
    aiResponse,
    status: "draft",
  });

  log.info("ai", "generateCampaign done", { campaignId: (campaign as any).id });
  return campaign;
}

// ── generateCampaignPart — regenera apenas uma parte da campanha ────────────
export async function generateCampaignPart(input: {
  campaignId:   number;
  projectId:    number;
  part:         "creatives" | "adSets" | "hooks" | "abTests" | "copies";
  campaign:     any;
  extraContext?: string;
}) {
  const clientProfile  = await db.getClientProfile(input.projectId) as any;
  const competitors    = await db.getCompetitorsByProjectId(input.projectId);
  const allAds: any[]  = [];
  for (const comp of competitors) {
    const ads = await db.getScrapedAdsByCompetitor((comp as any).id);
    allAds.push(...ads.map((a: any) => ({ ...a, competitorName: (comp as any).name })));
  }

  const c          = input.campaign;
  const objective  = c.objective  || "leads";
  const platform   = c.platform   || "meta";
  const budget     = c.suggestedBudgetMonthly || 1000;
  const niche      = clientProfile?.niche      || "";
  const product    = clientProfile?.productService || "";
  const audience   = clientProfile?.targetAudience  || "";
  const pain       = clientProfile?.mainPain         || "";
  const uvp        = clientProfile?.uniqueValueProposition || "";
  const topCtas    = [...new Set(allAds.map((a: any) => a.cta).filter(Boolean))].slice(0, 3).join(", ");

  const partPrompts: Record<string, string> = {
    creatives: `
Você é um especialista em criativos de alta performance para ${platform === "both" ? "Meta Ads + Google Ads" : platform === "meta" ? "Meta Ads" : "Google Ads"}.

Campanha: ${c.name}
Objetivo: ${objective}
Nicho: ${niche}
Produto: ${product}
Público: ${audience}
Dor principal: ${pain}
Proposta de valor: ${uvp}
CTAs mais usados pelos concorrentes: ${topCtas || "Saiba Mais, Falar no WhatsApp"}
Anúncios coletados dos concorrentes: ${allAds.length}
${input.extraContext ? `\nContexto adicional: ${input.extraContext}` : ""}

Gere 5 criativos NOVOS e DIFERENTES dos anteriores. Responda SOMENTE em JSON:
{
  "INSTRUCAO_CRIATIVOS": "IMPORTANTE: O objetivo desta campanha e ${objective}. Para LEADS: copies focados em cadastro, material gratuito, sem compromisso, CTA de baixo atrito. Para SALES: copies focados em oferta, preco, urgencia, garantia, CTA de compra direta. NUNCA use placeholders como [problema], [resultado], [marca] — use textos REAIS baseados no nicho e perfil do cliente.",
  "creatives": [
    {
      "type": "testimonial|storytelling|authority|lead_magnet|social_proof|direct_offer",
      "format": "image|video|carousel|stories",
      "headline": "título persuasivo (máx 40 chars)",
      "copy": "texto principal (máx 125 chars)",
      "cta": "botão de ação",
      "hook": "frase de gancho para os primeiros 3 segundos",
      "pain": "dor que este criativo endereça",
      "solution": "solução apresentada"
    }
  ]
}`,

    adSets: `
Você é um especialista em segmentação de públicos para ${platform === "both" ? "Meta Ads + Google Ads" : platform === "meta" ? "Meta Ads" : "Google Ads"}.

Campanha: ${c.name}
Objetivo: ${objective}
Nicho: ${niche}
Público-alvo: ${audience}
Budget mensal: R$ ${budget}
${input.extraContext ? `\nContexto adicional: ${input.extraContext}` : ""}

Gere 4 conjuntos de anúncios com segmentações diferentes e estratégicas. Responda SOMENTE em JSON:
{
  "adSets": [
    {
      "name": "nome do conjunto",
      "audience": "descrição detalhada do público (idade, interesses, comportamentos)",
      "budget": "R$ X/dia (Y% do total)",
      "objective": "objetivo específico deste conjunto",
      "funnelStage": "TOF|MOF|BOF|SCALE"
    }
  ]
}`,

    hooks: `
Você é um copywriter especialista em hooks para anúncios digitais.

Nicho: ${niche}
Produto: ${product}
Dor principal: ${pain}
Proposta de valor: ${uvp}
${input.extraContext ? `\nContexto adicional: ${input.extraContext}` : ""}

Gere 8 hooks de alta conversão, variados e criativos. Responda SOMENTE em JSON:
{
  "hooks": [
    { "type": "curiosidade|dor|choque|identificação|promessa|pergunta|contra-intuitivo|urgência", "text": "texto do hook" }
  ]
}`,

    abTests: `
Você é um especialista em testes A/B para campanhas de performance.

Campanha: ${c.name}
Objetivo: ${objective}
Nicho: ${niche}
Budget mensal: R$ ${budget}
${input.extraContext ? `\nContexto adicional: ${input.extraContext}` : ""}

Gere 6 hipóteses de teste A/B priorizadas por impacto. Responda SOMENTE em JSON:
{
  "abTests": [
    {
      "test": "hook|criativo|público|copy|cta|landing_page|formato|oferta",
      "hypothesis": "se mudarmos X, esperamos Y porque Z",
      "variationA": "controle (atual)",
      "variationB": "variação a testar",
      "metric": "CTR|CPL|CPA|ROAS|conversão",
      "priority": "alta|média|baixa",
      "estimatedImpact": "estimativa de melhoria"
    }
  ]
}`,

    copies: `
Você é um copywriter especialista em anúncios de alta conversão.

Nicho: ${niche}
Produto: ${product}
Público: ${audience}
Dor: ${pain}
Proposta de valor: ${uvp}
Objetivo da campanha: ${objective}
${input.extraContext ? `\nContexto adicional: ${input.extraContext}` : ""}

Gere copies para 3 estágios do funil. Responda SOMENTE em JSON:
{
  "copies": [
    {
      "funnelStage": "TOF|MOF|BOF",
      "format": "image|video|carousel",
      "primaryText": "texto principal do anúncio (máx 125 chars)",
      "headline": "título (máx 40 chars)",
      "description": "descrição secundária (máx 30 chars)",
      "cta": "botão de ação",
      "angle": "ângulo persuasivo usado"
    }
  ]
}`,
  };

  const prompt = partPrompts[input.part];
  if (!prompt) throw new Error(`Parte inválida: ${input.part}`);

  log.info("ai", `generateCampaignPart start`, { campaignId: input.campaignId, part: input.part });

  const raw    = await gemini(prompt, { temperature: 0.7 });
  const clean  = raw.replace(/```json|```/g, "").trim();
  const parsed = JSON.parse(clean);

  // Salva no banco o campo correspondente
  if (input.part === "creatives" && parsed.creatives) {
    const enrichedCreatives = await enrichCreativesWithScoresAndImages(parsed.creatives, {
      objective,
      segment: input.extraContext || niche || c.name || "segmento geral",
    });
    const creativesWithV2 = enrichedCreatives.map((rawCreative: any) => {
      let creative = rawCreative as CampaignCreative;
      creative = syncCreativeTextToV2(creative);
      if (creative.feedImageUrl || creative.feedImageHash) {
        creative = syncCreativeImageToV2(creative, "feed", {
          imageUrl: creative.feedImageUrl ?? null,
          imageHash: creative.feedImageHash ?? null,
        });
      }
      if (creative.storyImageUrl || creative.storyImageHash) {
        creative = syncCreativeImageToV2(creative, "stories", {
          imageUrl: creative.storyImageUrl ?? null,
          imageHash: creative.storyImageHash ?? null,
        });
      }
      if (creative.squareImageUrl || creative.squareImageHash) {
        creative = syncCreativeImageToV2(creative, "square", {
          imageUrl: creative.squareImageUrl ?? null,
          imageHash: creative.squareImageHash ?? null,
        });
      }
      return creative;
    });
    await db.updateCampaignField(input.campaignId, "creatives", JSON.stringify(creativesWithV2));
  } else if (input.part === "adSets" && parsed.adSets) {
    await db.updateCampaignField(input.campaignId, "adSets", JSON.stringify(parsed.adSets));
  } else if (["hooks", "abTests", "copies"].includes(input.part)) {
    // Salva dentro do aiResponse
    const existing = JSON.parse(c.aiResponse || "{}");
    if (input.part === "hooks")   existing.hooks   = parsed.hooks;
    if (input.part === "abTests") existing.abTests = parsed.abTests;
    if (input.part === "copies")  existing.copies  = parsed.copies;
    await db.updateCampaignField(input.campaignId, "aiResponse", JSON.stringify(existing));
  }

  log.info("ai", `generateCampaignPart done`, { campaignId: input.campaignId, part: input.part });
  return { ok: true, part: input.part, data: parsed };
}

// ═══════════════════════════════════════════════════════════════════════════
// MECPro Analyzer — análise de anúncio por input manual
// Não depende de API Meta, HF, DNS — usa Gemini direto
// ═══════════════════════════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════════════════════════════
// MECPro Analyzer — lógica idêntica ao MECPro AI (HF Space main.py)
// Usa: SYSTEM_MECPRO, fmt_ads, fmt_client, fmt_benchmarks, super_ai cascata
// ═══════════════════════════════════════════════════════════════════════════════

// Reutiliza MARKET_NICHE_BENCHMARKS/resolveNicheBenchmarks definidos no topo do arquivo.

function fmtBenchmarks(niche: string): string {
  const b = resolveNicheBenchmarks(niche);
  return (
    `BENCHMARKS DO NICHO '${b.label}' (WordStream BR 2025):\n` +
    `  CPC: R$ ${b.cpc[0].toFixed(2)}–${b.cpc[1].toFixed(2)} | ` +
    `CPL: R$ ${b.cpl[0]}–${b.cpl[1]} | ` +
    `CPA: R$ ${b.cpa[0]}–${b.cpa[1]}\n` +
    `  CPM: R$ ${b.cpm[0]}–${b.cpm[1]} | ` +
    `CTR: ${b.ctr[0]}%–${b.ctr[1]}% | ` +
    `ROAS: ${b.roas[0]}x–${b.roas[1]}x`
  );
}

function resolveCreativeImageFormat(creative: any): CreativeImageFormat {
  const format = String(creative?.format || creative?.type || creative?.orientation || "").toLowerCase();
  if (/(story|stories|reels|9:16)/i.test(format)) return "stories";
  if (/(1:1|square|quadrado)/i.test(format)) return "square";
  return "feed";
}

function resolveImageProviderConfig(): { provider: ImageProvider; apiKey: string } {
  const explicitProvider = String(process.env.IMAGE_PROVIDER || "").toLowerCase();
  const hfKey     = (process.env.HUGGINGFACE_API_KEY || "").trim();
  const heygenKey = (process.env.HEYGEN_API_KEY      || "").trim();

  const gsKey = (process.env.GENSPARK_API_KEY || "").trim();

  // Prioridade: IMAGE_PROVIDER explícito > HeyGen > Genspark > HuggingFace > mock
  if (explicitProvider === "heygen" || (!explicitProvider && heygenKey)) {
    return { provider: "heygen", apiKey: heygenKey };
  }
  if (explicitProvider === "genspark" || (!explicitProvider && gsKey && !heygenKey)) {
    return { provider: "genspark" as any, apiKey: gsKey };
  }
  if (explicitProvider === "huggingface" || (!explicitProvider && hfKey)) {
    return { provider: "huggingface", apiKey: hfKey };
  }
  if (explicitProvider === "heygen") {
    return { provider: "heygen", apiKey: heygenKey };
  }
  return { provider: "mock", apiKey: "" };
}

async function enrichCreativesWithScoresAndImages(creatives: any[], context: {
  objective: string;
  segment: string;
}) {
  const scored = scoreCreativeList(Array.isArray(creatives) ? creatives : []).map((creative, index) => ({
    ...creative,
    creativeIndex: creative?.creativeIndex ?? index,
  }));

  const config = resolveImageProviderConfig();
  const diagnostics = getImageGenerationDiagnostics(config.provider);

  for (let index = 0; index < scored.length; index++) {
    scored[index].imageProviderUsed = diagnostics.provider;
    scored[index].imageGenerationReason = diagnostics.reason;
    scored[index].imageGenerationWarnings = diagnostics.warnings;
    scored[index].imageGenerationMode = diagnostics.canGenerateRealImages ? "real" : "fallback";
  }

  // Gera apenas 1 imagem por campanha para não bloquear a resposta
  // O usuário pode gerar mais depois individualmente
  // Se nenhum provider disponível, pula completamente (evita 30-60s de timeout)
  const maxImages = diagnostics.canGenerateRealImages ? Math.min(1, scored.length) : 0;

  if (!diagnostics.canGenerateRealImages) {
    log.warn("ai", "Geração de imagens pulada — provider indisponível", {
      reason: diagnostics.reason, warnings: diagnostics.warnings,
    });
  }

  for (let index = 0; index < maxImages; index++) {
    const creative = scored[index];
    const format = resolveCreativeImageFormat(creative);
    // Timeout de 20s por imagem — evita bloquear campanha inteira
    const imageUrl = await Promise.race([
      generateAdImage(creative, context.segment, context.objective, config, format),
      new Promise<null>(resolve => setTimeout(() => resolve(null), 20000)),
    ]);
    if (imageUrl) {
      if (format === "stories") creative.storyImageUrl = imageUrl;
      if (format === "feed")    creative.feedImageUrl = imageUrl;
      if (format === "square")  creative.squareImageUrl = imageUrl;
      creative.imageUpdatedAt = new Date().toISOString();
    }
  }

  return scored;
}

function fmtAds(ads: any[], limit = 25): string {
  return ads.slice(0, limit).map((a: any, i: number) => {
    const status = a.isActive ? "ATIVO" : "inativo";
    return (
      `[${i+1}] ${a.adType || "image"} | ${status}\n` +
      `Headline: ${a.headline || "—"}\n` +
      `Copy: ${(a.bodyText || "—").slice(0, 250)}\n` +
      `CTA: ${a.cta || "—"}`
    );
  }).join("\n\n");
}

function fmtClient(p: any): string {
  if (!p) return "";
  const fields: [string, string][] = [
    ["companyName","Empresa"],["niche","Nicho"],["productService","Produto"],
    ["targetAudience","Público-alvo"],["mainPain","Dor principal"],
    ["uniqueValueProposition","Proposta de valor"],["desiredTransformation","Transformação desejada"],
    ["mainObjections","Objeções"],["campaignObjective","Objetivo"],["monthlyBudget","Budget mensal"],
  ];
  const lines = fields
    .filter(([k]) => p[k])
    .map(([k, label]) => {
      const v = k === "monthlyBudget" ? `R$ ${p[k]}` : p[k];
      return `• ${label}: ${v}`;
    });
  return lines.length ? "PERFIL DO CLIENTE:\n" + lines.join("\n") : "";
}

export async function analyzeAdInput(opts: {
  input:        string;
  nicho?:       string;
  localizacao?: string;
  publico?:     string;
  projectId?:   number;
  userId?:      number;
  existingAds?: any[];
}): Promise<any> {
  const { input, nicho, localizacao, publico, existingAds = [] } = opts;

  // Busca perfil do cliente para enriquecer contexto (igual ao main.py)
  let clientProfile: any = null;
  if (opts.projectId) {
    try { clientProfile = await db.getClientProfile(opts.projectId); } catch {}
  }
  const niche = nicho || (clientProfile as any)?.niche || "";

  // Detecta modo: nome de empresa ou texto de anúncio
  const isCompanyName = input.trim().length < 60
    && !/[.!?]/.test(input)
    && !/\b(descubra|aproveite|garanta|clique|saiba|conheça|venha|ligue|acesse|cadastre|compre|ganhe|economize)\b/i.test(input);

  const hasRealAds = existingAds.length > 0;
  const adsForAnalysis = existingAds.slice(0, 25);

  // Monta seção de anúncios (idêntico ao fmt_ads do main.py)
  const adsSection = hasRealAds
    ? `\nANÚNCIOS COLETADOS (analise cada um detalhadamente):\n${fmtAds(adsForAnalysis)}\n`
    : "";

  // Monta contexto completo (idêntico ao main.py)
  const contextParts = [
    hasRealAds || isCompanyName
      ? `CONCORRENTE PARA ANÁLISE: ${input}`
      : `ANÚNCIO PARA ANÁLISE:\n${input}`,
    hasRealAds
      ? `TOTAL DE ANÚNCIOS: ${existingAds.length} (${existingAds.filter((a:any) => a.isActive).length} ativos)`
      : "",
    localizacao ? `LOCALIZAÇÃO: ${localizacao}` : "",
    fmtClient(clientProfile),
    fmtBenchmarks(niche),
    adsSection,
  ].filter(Boolean).join("\n\n");

  // Prompt completo com todos os campos que o frontend renderiza
  const prompt = `${contextParts}

${isCompanyName && !hasRealAds
  ? `Você está analisando a empresa "${input}" com base no nome e nicho.\nInfira com inteligência a estratégia provável de anúncios, usando os benchmarks do nicho acima.`
  : ""}

Gere uma análise competitiva COMPLETA e acionável em JSON com TODOS os campos abaixo preenchidos:
{
  "resumo": "resumo executivo em 2-3 linhas do que o concorrente está fazendo e como se posiciona",
  "interpretacao": {
    "nicho": "nicho de mercado identificado",
    "produto": "produto ou serviço principal anunciado",
    "publico": "público-alvo inferido: idade, perfil, dor principal",
    "funil": "etapa dominante: TOF (awareness) | MOF (consideração) | BOF (conversão)",
    "objetivo": "objetivo da campanha: awareness | geração de leads | conversão | remarketing",
    "nivelConsciencia": "nível: inconsciente do problema | consciente do problema | consciente da solução | consciente do produto | pronto para comprar"
  },
  "avaliacao": {
    "clareza": 7,
    "persuasao": 6,
    "oferta": 7,
    "diferenciacao": 5,
    "conversao": 6,
    "justificativa": "explicação das notas baseada nos anúncios analisados e benchmarks do nicho"
  },
  "falhas": [
    "falha crítica 1 identificada nos anúncios ou estratégia",
    "falha crítica 2",
    "falha crítica 3"
  ],
  "oportunidades": [
    "oportunidade concreta 1 para superar o concorrente",
    "oportunidade concreta 2",
    "oportunidade concreta 3"
  ],
  "gatilhos": [
    {"nome": "Urgência / Escassez", "status": "forte", "observacao": "como aparece ou por que está fraco/ausente"},
    {"nome": "Prova Social", "status": "fraco", "observacao": "como aparece ou deveria aparecer"},
    {"nome": "Autoridade", "status": "ausente", "observacao": "como aparece ou deveria aparecer"},
    {"nome": "Reciprocidade", "status": "fraco", "observacao": "como aparece ou deveria aparecer"},
    {"nome": "Curiosidade / Storytelling", "status": "forte", "observacao": "como aparece ou deveria aparecer"}
  ],
  "estrategia": {
    "promessa": "promessa central do anúncio ou empresa",
    "oferta": "tipo de oferta: desconto | trial | consultoria | garantia | bônus | etc",
    "posicionamento": "como se posiciona e diferencial percebido",
    "angulo": "ângulo de venda principal explorado",
    "emocao": "emoção dominante: medo | desejo | aspiração | alívio | status | etc",
    "logica": "estrutura lógica: problema-solução | antes-depois | prova | autoridade | etc"
  },
  "topFormats": [
    {"format": "vídeo", "percentage": 60, "insight": "insight acionável sobre como usar esse formato"},
    {"format": "imagem", "percentage": 30, "insight": "insight sobre o formato"},
    {"format": "carrossel", "percentage": 10, "insight": "insight sobre o formato"}
  ],
  "topCtaPatterns": ["CTA mais usado com contexto", "segundo CTA mais frequente", "terceiro CTA"],
  "estimatedFunnel": "mapa TOF→MOF→BOF: formato e mensagem por etapa com base nos anúncios",
  "winnerPatterns": "padrões nos anúncios ativos há 30+ dias — validados pelo mercado",
  "positioning": "posicionamento: tom de voz, promessa central, diferencial percebido pelo público",
  "competitorWeaknesses": "3 pontos fracos concretos que podem ser atacados estrategicamente",
  "recommendations": "3 ações concretas para superar este concorrente nos próximos 30 dias",
  "campanha_melhorada": {
    "angulo": "novo ângulo estratégico diferenciado do concorrente",
    "promessa": "nova promessa forte, específica e verificável",
    "headline": "headline principal pronto para usar",
    "texto": "copy completo com 2-3 parágrafos prontos para usar",
    "cta": "CTA ideal para este nicho e funil",
    "criativo": "sugestão detalhada de criativo — o que mostrar na imagem/vídeo",
    "prova_social": "sugestão de prova social aplicável ao nicho",
    "urgencia": "sugestão de urgência ou escassez crível"
  },
  "variacoes": {
    "headlines": ["headline variação 1", "headline variação 2", "headline variação 3"],
    "textos": ["texto variação 1 completo", "texto variação 2 completo", "texto variação 3 completo"],
    "ctas": ["CTA variação 1", "CTA variação 2", "CTA variação 3"]
  },
  "versao_agressiva": {
    "headline": "headline direto, provocador e de alta conversão",
    "texto": "copy agressivo orientado a venda imediata",
    "cta": "CTA urgente e direto"
  },
  "score_final": 7,
  "conclusao": "como ganhar desse concorrente: 3-4 linhas práticas baseadas nos dados analisados"
}`.trim();

  log.info("ai", "analyzeAdInput start", {
    mode: isCompanyName ? "company" : "ad",
    hasAds: hasRealAds,
    adsCount: adsForAnalysis.length,
    niche,
  });

  // 1. Tenta HF Space (super_ai com Gemini+Groq — cota separada)
  if (MECPRO_AI_URL) {
    try {
      const res = await fetch(`${MECPRO_AI_URL}/analyze-competitor`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        signal:  AbortSignal.timeout(35000),
        body: JSON.stringify({
          competitorName: isCompanyName ? input : "Anúncio analisado",
          fonte:          hasRealAds ? "anúncios coletados" : isCompanyName ? "nome da empresa" : "input manual",
          ads: hasRealAds
            ? adsForAnalysis.map((a: any) => ({
                adType:   a.adType,
                isActive: a.isActive,
                startDate: a.startDate ? new Date(a.startDate).toLocaleDateString("pt-BR") : null,
                headline: a.headline,
                bodyText: a.bodyText?.slice(0, 250),
                cta:      a.cta,
              }))
            : [{ headline: input.slice(0, 100), bodyText: input, adType: "input", isActive: 1 }],
          clientProfile: clientProfile || undefined,
          mode: "fast",
        }),
      });
      if (res.ok) {
        const data = await res.json() as any;
        if (data.success && data.data?.topFormats) {
          // HF retornou análise completa — enriquecer com campos extras do Analyzer
          log.info("ai", "analyzeAdInput via HF Space OK", { motor: data.motor });
          const d = data.data;
          // Adiciona campos do Analyzer que o HF não tem, via Gemini rápido
          const extraPrompt = `Baseado nesta análise do concorrente "${input}", gere em JSON com todos os campos preenchidos:
{
  "resumo": "resumo executivo em 2-3 linhas do que o concorrente está fazendo",
  "interpretacao": {"nicho":"${niche || "não especificado"}","produto":"produto principal","publico":"público-alvo com dor e perfil","funil":"TOF|MOF|BOF","objetivo":"awareness|leads|conversão","nivelConsciencia":"nível de consciência do público"},
  "falhas": ["falha 1 identificada","falha 2","falha 3"],
  "oportunidades": ["oportunidade 1 para superar o concorrente","oportunidade 2","oportunidade 3"],
  "gatilhos": [
    {"nome":"Urgência / Escassez","status":"forte|fraco|ausente","observacao":"como aparece"},
    {"nome":"Prova Social","status":"forte|fraco|ausente","observacao":"como aparece"},
    {"nome":"Autoridade","status":"forte|fraco|ausente","observacao":"como aparece"},
    {"nome":"Reciprocidade","status":"forte|fraco|ausente","observacao":"como aparece"},
    {"nome":"Curiosidade","status":"forte|fraco|ausente","observacao":"como aparece"}
  ],
  "estrategia": {"promessa":"promessa central","oferta":"tipo de oferta","posicionamento":"como se posiciona","angulo":"ângulo de venda","emocao":"emoção dominante","logica":"estrutura lógica do anúncio"},
  "campanha_melhorada": {"angulo":"novo ângulo diferenciado","promessa":"nova promessa forte","headline":"headline pronto","texto":"copy completo em 2-3 parágrafos","cta":"CTA ideal","criativo":"sugestão de criativo","prova_social":"sugestão de prova social","urgencia":"sugestão de urgência"},
  "variacoes": {"headlines":["variação 1","variação 2","variação 3"],"textos":["texto 1","texto 2","texto 3"],"ctas":["CTA 1","CTA 2","CTA 3"]},
  "versao_agressiva": {"headline":"headline agressivo","texto":"copy direto para venda","cta":"CTA urgente"},
  "avaliacao": {"clareza":0,"persuasao":0,"oferta":0,"diferenciacao":0,"conversao":0,"justificativa":"justificativa das notas"},
  "score_final": 0,
  "conclusao": "como ganhar desse concorrente em 3-4 linhas práticas"
}
Contexto: posicionamento="${d.positioning || ""}" | fraquezas="${d.competitorWeaknesses || ""}" | nicho="${niche}" | recomendações="${d.recommendations || ""}"`;
          try {
            const extraRaw = await gemini(extraPrompt, { temperature: 0.4 });
            const extraParsed = JSON.parse(extraRaw.replace(/\`\`\`json|\`\`\`/g, "").trim());
            return { success: true, motor: data.motor, data: { ...d, ...extraParsed, resumo: d.resumo || extraParsed.resumo || d.positioning || "" } };
          } catch {
            return { success: true, motor: data.motor, data: { ...d, resumo: d.resumo || d.positioning || "" } };
          }
        }
      }
    } catch (e: any) {
      log.warn("ai", "analyzeAdInput HF falhou — Gemini direto", { message: e.message?.slice(0,60) });
    }
  }

  // 2. Gemini direto com system prompt do MECPro AI
  const raw = await gemini(prompt, {
    temperature: 0.3,
    systemInstruction: SYSTEM_MECPRO,
  });

  let result: any;
  try {
    const clean = raw.replace(/\`\`\`json|\`\`\`/g, "").trim();
    result = JSON.parse(clean);
  } catch {
    const match = raw.match(/\{[\s\S]+\}/);
    if (match) result = JSON.parse(match[0]);
    else throw new Error("Não foi possível gerar a análise. Tente novamente.");
  }

  log.info("ai", "analyzeAdInput done via Gemini", { score: result?.score_final, niche });
  return { success: true, motor: "gemini-direct", data: result };
}
