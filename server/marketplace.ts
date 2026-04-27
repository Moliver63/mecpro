// ============ server/marketplace.ts — Router completo do Marketplace ============
// Adicionar ao projeto MecProAI como novo módulo

import { Router, Request, Response } from "express";
import * as db from "./db";
import { gemini } from "./ai";
import { log } from "./_core/logger";

const router = Router();

// ── Tipos auxiliares ──────────────────────────────────────────────────────────
interface GenerateLandingInput {
  campaignId?: number;
  title: string;
  niche: string;
  description: string;
  price?: number;
  priceType?: string;
  benefits?: string[];
  checkoutType?: string;
  whatsappNumber?: string;
  region?: string;
}

// ── Gerador de landing page via IA ────────────────────────────────────────────
async function generateLandingPage(input: GenerateLandingInput): Promise<any> {
  const nicheThemes: Record<string, { primaryColor: string; accentColor: string; font: string }> = {
    imobiliario:     { primaryColor: "#1a3a5c", accentColor: "#e8a020", font: "Playfair Display" },
    servicos:        { primaryColor: "#0f2744", accentColor: "#00b4d8", font: "Syne" },
    produtos_fisicos:{ primaryColor: "#1a1a2e", accentColor: "#e94560", font: "Bebas Neue" },
    infoprodutos:    { primaryColor: "#0d0d0d", accentColor: "#7c3aed", font: "DM Sans" },
    negocios_locais: { primaryColor: "#1b4332", accentColor: "#52b788", font: "Outfit" },
    saude_beleza:    { primaryColor: "#2d1b4e", accentColor: "#f72585", font: "Cormorant Garamond" },
    educacao:        { primaryColor: "#023e8a", accentColor: "#48cae4", font: "Plus Jakarta Sans" },
    alimentacao:     { primaryColor: "#3d0000", accentColor: "#e63946", font: "Nunito" },
    ecommerce:       { primaryColor: "#10002b", accentColor: "#e0aaff", font: "Urbanist" },
    outros:          { primaryColor: "#0d1b2a", accentColor: "#00f5d4", font: "Inter" },
  };

  const theme = nicheThemes[input.niche] || nicheThemes.outros;

  const prompt = `Você é um copywriter de alto nível especializado em landing pages de alta conversão.
Crie uma landing page completa para a seguinte oferta:

TÍTULO: ${input.title}
NICHO: ${input.niche}
DESCRIÇÃO: ${input.description}
PREÇO: ${input.price ? `R$ ${input.price}` : "A negociar"}
BENEFÍCIOS FORNECIDOS: ${input.benefits?.join(", ") || "não especificado"}

Gere em JSON com TODOS os campos preenchidos de forma persuasiva e específica para o nicho:
{
  "sections": {
    "hero": {
      "headline": "headline PODEROSA de até 10 palavras que para o scroll",
      "subheadline": "subheadline de 1-2 frases explicando o valor único",
      "cta": "texto do botão principal (máx 5 palavras)"
    },
    "problem": {
      "title": "Você está cansado de...?",
      "points": ["dor 1 específica do nicho", "dor 2", "dor 3"]
    },
    "solution": {
      "title": "A solução que você precisava",
      "description": "2-3 frases descrevendo a transformação"
    },
    "benefits": {
      "title": "O que você vai ter:",
      "items": [
        {"icon": "✓", "title": "Benefício 1", "desc": "explicação curta"},
        {"icon": "✓", "title": "Benefício 2", "desc": "explicação curta"},
        {"icon": "✓", "title": "Benefício 3", "desc": "explicação curta"},
        {"icon": "✓", "title": "Benefício 4", "desc": "explicação curta"}
      ]
    },
    "social": {
      "testimonials": [
        {"name": "Nome Sobrenome", "text": "depoimento convincente e específico", "rating": 5},
        {"name": "Nome Sobrenome", "text": "resultado concreto obtido", "rating": 5},
        {"name": "Nome Sobrenome", "text": "transformação vivida", "rating": 5}
      ]
    },
    "pricing": {
      "title": "Investimento",
      "price": "${input.price ? `R$ ${input.price}` : "Consulte"}",
      "installments": "${input.price && input.price > 100 ? `ou ${Math.ceil(input.price / 12)}x de R$ ${(input.price / 12).toFixed(2)}` : ""}",
      "guarantee": "garantia específica e convincente para o nicho (ex: 7 dias de garantia)"
    },
    "faq": {
      "items": [
        {"q": "pergunta frequente 1 do nicho", "a": "resposta persuasiva"},
        {"q": "pergunta frequente 2", "a": "resposta"},
        {"q": "pergunta frequente 3", "a": "resposta"},
        {"q": "Como funciona o pagamento?", "a": "resposta sobre pagamento"}
      ]
    },
    "finalCta": {
      "headline": "headline final de urgência",
      "cta": "texto do botão final"
    }
  },
  "aiScore": 85,
  "aiSuggestions": ["sugestão de melhoria 1", "sugestão 2", "sugestão 3"]
}`;

  try {
    const raw = await gemini(prompt, { temperature: 0.7 });
    const clean = raw.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(clean);
    return { ...parsed, theme, niche: input.niche };
  } catch (e: any) {
    log.warn("marketplace", "generateLandingPage IA falhou — usando estrutura mínima", { error: e.message });
    // Fallback estruturado quando IA não está disponível
    return {
      sections: {
        hero:     { headline: input.title, subheadline: input.description || "Entre em contato para saber mais", cta: "Entrar em contato" },
        problem:  { title: "Você precisa de uma solução?", points: ["Dificuldade em encontrar o produto certo", "Preços altos no mercado", "Falta de atendimento personalizado"] },
        solution: { title: "Apresentamos a solução ideal", description: input.description || "Temos a solução que você precisa com qualidade e atendimento diferenciado." },
        benefits: { title: "Por que escolher nossa oferta:", items: (input.benefits || ["Qualidade garantida", "Atendimento personalizado", "Melhor preço"]).slice(0,4).map((b: string) => ({ icon: "✓", title: typeof b === "string" ? b : String(b), desc: "" })) },
        social:   { testimonials: [{ name: "Cliente satisfeito", text: "Excelente produto e atendimento. Recomendo!", rating: 5 }, { name: "Usuário verificado", text: "Superou minhas expectativas. Vale cada centavo.", rating: 5 }] },
        pricing:  { title: "Investimento", price: input.price ? `R$ ${input.price}` : "Consulte", installments: "", guarantee: "Satisfação garantida ou seu dinheiro de volta" },
        faq:      { items: [{ q: "Como faço para adquirir?", a: "Entre em contato conosco pelo botão abaixo e nossa equipe te atenderá rapidamente." }, { q: "Qual o prazo de entrega/atendimento?", a: "Entramos em contato em até 24 horas após seu pedido." }] },
        finalCta: { headline: "Pronto para começar?", cta: "Quero saber mais" },
      },
      theme,
      niche: input.niche,
      aiScore: 60,
      aiSuggestions: ["Adicione mais detalhes na descrição para melhorar a landing page", "Inclua preço específico para aumentar conversão", "Adicione fotos do produto/serviço"],
    };
  }
}

// ── Gerador de HTML da landing page ──────────────────────────────────────────
function renderLandingHtml(data: any, listing: any): string {
  const { sections, theme } = data;
  const s = sections;
  const ctaHref = listing.checkoutUrl || 
    (listing.whatsappNumber ? `https://wa.me/55${listing.whatsappNumber.replace(/\D/g,'')}` : "#contact");

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${listing.title} | MecProAI Marketplace</title>
<link href="https://fonts.googleapis.com/css2?family=${theme.font.replace(' ','+')}&display=swap" rel="stylesheet">
<style>
:root{--primary:${theme.primaryColor};--accent:${theme.accentColor};--font:'${theme.font}',sans-serif}
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:var(--font);background:#0a0a0a;color:#f0f0f0;line-height:1.6}
.hero{background:linear-gradient(135deg,var(--primary),#000);min-height:100vh;display:flex;align-items:center;justify-content:center;text-align:center;padding:60px 20px;position:relative}
.hero::before{content:'';position:absolute;inset:0;background:radial-gradient(circle at 50% 50%,${theme.accentColor}22,transparent 70%)}
.hero h1{font-size:clamp(2rem,6vw,4.5rem);font-weight:900;color:#fff;margin-bottom:20px;line-height:1.1;position:relative}
.hero h1 span{color:var(--accent)}
.hero p{font-size:clamp(1rem,2.5vw,1.4rem);color:#ccc;max-width:600px;margin:0 auto 40px}
.btn{display:inline-block;background:var(--accent);color:#000;font-weight:800;font-size:1.1rem;padding:18px 48px;border-radius:50px;text-decoration:none;transition:.3s;letter-spacing:1px;text-transform:uppercase}
.btn:hover{transform:translateY(-3px);box-shadow:0 20px 40px ${theme.accentColor}44}
section{padding:80px 20px;max-width:900px;margin:0 auto}
.problems{background:#0f0f0f;padding:80px 20px}
.problems-inner{max-width:900px;margin:0 auto}
h2{font-size:clamp(1.6rem,4vw,2.8rem);font-weight:800;margin-bottom:40px;color:#fff}
h2 span{color:var(--accent)}
.problems ul{list-style:none;display:grid;gap:16px}
.problems li{background:#1a1a1a;border-left:4px solid var(--accent);padding:16px 20px;border-radius:8px;font-size:1.05rem;color:#ddd}
.benefits-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:20px;margin-top:40px}
.benefit-card{background:#111;border:1px solid #222;border-radius:16px;padding:24px;transition:.3s}
.benefit-card:hover{border-color:var(--accent);transform:translateY(-4px)}
.benefit-card .icon{font-size:1.8rem;margin-bottom:12px;color:var(--accent)}
.benefit-card h3{font-size:1rem;font-weight:700;margin-bottom:8px;color:#fff}
.benefit-card p{font-size:.9rem;color:#999}
.testimonials{background:#0f0f0f;padding:80px 20px}
.testimonials-inner{max-width:900px;margin:0 auto}
.testimonials-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:20px;margin-top:40px}
.testimonial{background:#1a1a1a;border-radius:16px;padding:24px;position:relative}
.testimonial::before{content:'"';position:absolute;top:-10px;left:20px;font-size:4rem;color:var(--accent);line-height:1;font-family:serif}
.testimonial p{color:#ddd;font-style:italic;margin-bottom:16px;padding-top:20px}
.testimonial .author{font-weight:700;color:var(--accent);font-size:.9rem}
.stars{color:var(--accent);font-size:.8rem;margin-bottom:8px}
.pricing-box{background:linear-gradient(135deg,var(--primary),#000);border:2px solid var(--accent);border-radius:24px;padding:48px;text-align:center;margin-top:40px}
.pricing-box .price{font-size:3.5rem;font-weight:900;color:var(--accent);margin:20px 0}
.pricing-box .installments{color:#999;margin-bottom:30px}
.guarantee{background:#111;border:1px solid #333;border-radius:12px;padding:20px;margin-top:20px;font-size:.9rem;color:#aaa}
.guarantee span{color:var(--accent);font-weight:700}
.faq-item{background:#111;border:1px solid #222;border-radius:12px;padding:20px 24px;margin-bottom:12px}
.faq-item h4{font-weight:700;color:#fff;margin-bottom:8px;font-size:.95rem}
.faq-item p{color:#999;font-size:.9rem}
.final-cta{background:linear-gradient(135deg,var(--primary),#000);text-align:center;padding:100px 20px;position:relative;overflow:hidden}
.final-cta::before{content:'';position:absolute;inset:0;background:radial-gradient(circle at 50% 50%,${theme.accentColor}33,transparent 70%)}
.final-cta h2{color:#fff;position:relative;margin-bottom:40px}
.badge{display:inline-block;background:var(--accent)22;border:1px solid var(--accent);color:var(--accent);font-size:.75rem;font-weight:700;padding:4px 12px;border-radius:20px;letter-spacing:2px;text-transform:uppercase;margin-bottom:20px}
.brand{text-align:center;padding:24px;background:#000;color:#444;font-size:.8rem}
.brand a{color:var(--accent);text-decoration:none}
</style>
</head>
<body>
<div class="hero">
  <div style="position:relative;z-index:1">
    <div class="badge">🤖 Gerado com MecProAI</div>
    <h1>${s.hero.headline}</h1>
    <p>${s.hero.subheadline}</p>
    <a href="${ctaHref}" class="btn" target="_blank">${s.hero.cta}</a>
  </div>
</div>

<div class="problems">
  <div class="problems-inner">
    <h2>${s.problem.title}</h2>
    <ul>${s.problem.points.map((p: string) => `<li>❌ ${p}</li>`).join("")}</ul>
  </div>
</div>

<section>
  <h2>${s.solution.title}</h2>
  <p style="color:#ccc;font-size:1.1rem">${s.solution.description}</p>
  <div class="benefits-grid" style="margin-top:40px">
    ${s.benefits.items.map((b: any) => `
    <div class="benefit-card">
      <div class="icon">${b.icon}</div>
      <h3>${b.title}</h3>
      <p>${b.desc}</p>
    </div>`).join("")}
  </div>
</section>

<div class="testimonials">
  <div class="testimonials-inner">
    <h2>O que dizem os clientes</h2>
    <div class="testimonials-grid">
      ${s.social.testimonials.map((t: any) => `
      <div class="testimonial">
        <div class="stars">${"★".repeat(t.rating)}</div>
        <p>${t.text}</p>
        <div class="author">— ${t.name}</div>
      </div>`).join("")}
    </div>
  </div>
</div>

<section>
  <h2>Investimento</h2>
  <div class="pricing-box">
    <p style="color:#999;font-size:.9rem;text-transform:uppercase;letter-spacing:2px">${s.pricing.title}</p>
    <div class="price">${s.pricing.price}</div>
    ${s.pricing.installments ? `<div class="installments">${s.pricing.installments}</div>` : ""}
    <a href="${ctaHref}" class="btn" target="_blank" style="font-size:1.2rem;padding:20px 60px">${s.hero.cta}</a>
    <div class="guarantee"><span>🛡️ Garantia:</span> ${s.pricing.guarantee}</div>
  </div>
</section>

<section>
  <h2>Perguntas Frequentes</h2>
  ${s.faq.items.map((f: any) => `
  <div class="faq-item">
    <h4>❓ ${f.q}</h4>
    <p>${f.a}</p>
  </div>`).join("")}
</section>

<div class="final-cta">
  <div style="position:relative;z-index:1">
    <h2>${s.finalCta.headline}</h2>
    <a href="${ctaHref}" class="btn" target="_blank" style="font-size:1.3rem;padding:22px 70px">${s.finalCta.cta}</a>
  </div>
</div>

<div class="brand">
  Powered by <a href="https://mecproai.com" target="_blank">MecProAI</a> — Inteligência em Performance
</div>
</body>
</html>`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// ROTAS DA API
// ═══════════════════════════════════════════════════════════════════════════════

// GET /api/marketplace — Vitrine pública (sem auth)
router.get("/", async (req: Request, res: Response) => {
  try {
    const { niche, region, search, page = "1", limit = "24" } = req.query;
    const offset = (parseInt(page as string) - 1) * parseInt(limit as string);
    
    // Query com filtros — implementar no db.ts
    const listings = await (db as any).getMarketplaceListings({
      niche: niche as string,
      region: region as string,
      search: search as string,
      status: "active",
      limit: parseInt(limit as string),
      offset,
    });
    
    res.json({ success: true, listings, page: parseInt(page as string) });
  } catch (e: any) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// GET /api/marketplace/seller/dashboard — Dashboard do vendedor (auth required)
router.get("/seller/dashboard", async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id;
    if (!userId) return res.status(401).json({ success: false, error: "Não autenticado" });
    
    const [listings, orders, totalRevenue] = await Promise.all([
      (db as any).getListingsByUser(userId),
      (db as any).getOrdersBySeller(userId),
      (db as any).getTotalRevenueByUser(userId),
    ]);
    
    res.json({
      success: true,
      stats: {
        totalListings:  listings.length,
        activeListings: listings.filter((l: any) => l.status === "active").length,
        totalViews:     listings.reduce((s: number, l: any) => s + (l.views || 0), 0),
        totalClicks:    listings.reduce((s: number, l: any) => s + (l.clicks || 0), 0),
        totalOrders:    orders.length,
        totalRevenue:   totalRevenue || 0,
      },
      listings,
      recentOrders: orders.slice(0, 10),
    });
  } catch (e: any) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// GET /api/marketplace/seller/my-listings — Lista as ofertas do seller logado
router.get("/seller/my-listings", async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id;
    if (!userId) return res.status(401).json({ success: false, error: "Não autenticado" });
    const listings = await (db as any).getListingsByUser(userId);
    res.json({ success: true, listings });
  } catch (e: any) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// GET /api/marketplace/:slug — Landing page de um produto
router.get("/:slug", async (req: Request, res: Response) => {
  try {
    const listing = await (db as any).getListingBySlug(req.params.slug);
    if (!listing) return res.status(404).json({ success: false, error: "Listing não encontrado" });
    
    // Incrementa view count (fire and forget)
    (db as any).incrementListingViews(listing.id).catch(() => {});
    
    // Se tem HTML estático gerado, retorna direto
    if (req.query.html === "1" && listing.landingPageHtml) {
      res.setHeader("Content-Type", "text/html");
      return res.send(listing.landingPageHtml);
    }
    
    res.json({ success: true, listing });
  } catch (e: any) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// POST /api/marketplace/publish-direct — Gera landing + Publica em 1 única chamada (sem preview)
// Usado pelo botão "Publicar automaticamente" — fluxo simplificado
router.post("/publish-direct", async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id;
    if (!userId) return res.status(401).json({ success: false, error: "Não autenticado" });

    const { title, niche, description, price, priceType, campaignId,
            benefits, checkoutType, whatsappNumber, checkoutUrl,
            contactEmail, region, city, state, isNational } = req.body;

    if (!title || !niche) return res.status(400).json({ success: false, error: "title e niche são obrigatórios" });

    log.info("marketplace", "publish-direct start", { userId, title, niche, hasWhatsapp: !!whatsappNumber, hasCheckout: !!checkoutUrl, priceType });

    // Gera slug único
    const baseSlug = title.toLowerCase()
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    const slug = `${baseSlug}-${Date.now().toString(36)}`;

    // Gera landing page (com fallback se IA falhar)
    const toJson = (v: any) => v != null ? JSON.stringify(v) : null;
    const benefitsList = Array.isArray(benefits) ? benefits : (typeof benefits === "string" ? benefits.split("\n").filter(Boolean) : []);
    const landingData = await generateLandingPage({ title, niche, description, price: price ? Number(price) : undefined, priceType, benefits: benefitsList, checkoutType, whatsappNumber });
    const mockListing = { title, checkoutUrl, whatsappNumber };
    const html = renderLandingHtml(landingData, mockListing);

    const listing = await (db as any).createMarketplaceListing({
      userId,
      campaignId:     campaignId ? Number(campaignId) : null,
      title,
      slug,
      niche,
      status:         "active",
      price:          price != null ? Number(price) : null,
      priceType:      priceType || "fixed",
      headline:       landingData.sections?.hero?.headline || title,
      subheadline:    landingData.sections?.hero?.subheadline || "",
      description:    description || "",
      benefits:       toJson(benefitsList),
      ctaText:        landingData.sections?.hero?.cta || "Entrar em contato",
      guarantee:      landingData.sections?.pricing?.guarantee || "",
      faq:            toJson(landingData.sections?.faq?.items || []),
      testimonials:   toJson(landingData.sections?.social?.testimonials || []),
      checkoutUrl:    checkoutUrl || null,
      whatsappNumber: whatsappNumber || null,
      contactEmail:   contactEmail || null,
      checkoutType:   checkoutType || "whatsapp",
      region:         region || null,
      city:           city || null,
      state:          state || null,
      isNational:     isNational !== false,
      landingPage:    toJson(landingData),
      landingPageHtml: html,
      aiScore:        landingData.aiScore || null,
      aiSuggestions:  toJson(landingData.aiSuggestions || []),
      publishedAt:    new Date(),
    });

    log.info("marketplace", "publish-direct done", { listingId: listing?.id, userId, slug });
    res.json({ success: true, listing, slug, url: `/marketplace/${slug}`, landingPage: landingData });
  } catch (e: any) {
    log.warn("marketplace", "publish-direct error", {
      error:   e.message,
      stack:   e.stack?.slice(0, 300),
      code:    e.code,   // código de erro do PostgreSQL
      detail:  e.detail, // detalhe do PostgreSQL (ex: chave duplicada)
    });
    // Mensagem amigável baseada no tipo de erro
    let friendlyError = e.message || "Erro desconhecido ao publicar";
    if (e.code === "23505") friendlyError = "Título muito similar a outra oferta já publicada. Altere ligeiramente o título.";
    if (e.code === "23502") friendlyError = "Campo obrigatório não preenchido: " + (e.column || "verifique os dados");
    if (e.message?.includes("DB unavailable")) friendlyError = "Banco de dados temporariamente indisponível. Tente novamente em instantes.";
    res.status(500).json({ success: false, error: friendlyError, _debug: e.message });
  }
});

// POST /api/marketplace/generate-landing — Gera landing page via IA (auth required)
router.post("/generate-landing", async (req: Request, res: Response) => {
  try {
    const input: GenerateLandingInput = req.body;
    if (!input.title || !input.niche) {
      return res.status(400).json({ success: false, error: "title e niche são obrigatórios" });
    }
    
    log.info("marketplace", "generateLandingPage start", { title: input.title, niche: input.niche });
    const landingData = await generateLandingPage(input);
    log.info("marketplace", "generateLandingPage done", { aiScore: landingData.aiScore });
    
    res.json({ success: true, landingPage: landingData });
  } catch (e: any) {
    log.warn("marketplace", "generateLandingPage error", { error: e.message });
    res.status(500).json({ success: false, error: e.message });
  }
});

// POST /api/marketplace/publish — Publica uma oferta (auth required)
router.post("/publish", async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id;
    if (!userId) return res.status(401).json({ success: false, error: "Não autenticado" });
    
    const { title, niche, description, price, priceType, campaignId,
            benefits, checkoutType, whatsappNumber, checkoutUrl,
            contactEmail, region, city, state, isNational } = req.body;
    
    // Gera slug único
    const baseSlug = title.toLowerCase()
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    const slug = `${baseSlug}-${Date.now().toString(36)}`;
    
    // Gera landing page com IA
    const landingData = await generateLandingPage({ title, niche, description, price, priceType, benefits, checkoutType, whatsappNumber });
    const mockListing = { title, checkoutUrl, whatsappNumber };
    const html = renderLandingHtml(landingData, mockListing);
    
    // Serializa campos JSONB para string antes de inserir no PostgreSQL
    const toJson = (v: any) => v != null ? JSON.stringify(v) : null;

    // Salva no banco
    const listing = await (db as any).createMarketplaceListing({
      userId,
      campaignId:     campaignId ? Number(campaignId) : null,
      title,
      slug,
      niche,
      status:         "active",
      price:          price != null ? Number(price) : null,
      priceType:      priceType || "fixed",
      headline:       landingData.sections?.hero?.headline || title,
      subheadline:    landingData.sections?.hero?.subheadline || "",
      description:    description || "",
      benefits:       toJson(Array.isArray(benefits) ? benefits : []),
      ctaText:        landingData.sections?.hero?.cta || "Entrar em contato",
      guarantee:      landingData.sections?.pricing?.guarantee || "",
      faq:            toJson(landingData.sections?.faq?.items || []),
      testimonials:   toJson(landingData.sections?.social?.testimonials || []),
      checkoutUrl:    checkoutUrl || null,
      whatsappNumber: whatsappNumber || null,
      contactEmail:   contactEmail || null,
      checkoutType:   checkoutType || "whatsapp",
      region:         region || null,
      city:           city || null,
      state:          state || null,
      isNational:     isNational !== false,
      landingPage:    toJson(landingData),
      landingPageHtml: html,
      aiScore:        landingData.aiScore || null,
      aiSuggestions:  toJson(landingData.aiSuggestions || []),
      publishedAt:    new Date(),
    });
    
    log.info("marketplace", "Listing publicado", { listingId: listing.id, userId, slug });
    res.json({ success: true, listing, slug, url: `/marketplace/${slug}` });
  } catch (e: any) {
    log.warn("marketplace", "Publish error", { error: e.message });
    res.status(500).json({ success: false, error: e.message });
  }
});

// POST /api/marketplace/:id/optimize — IA otimiza listing com baixo desempenho
router.post("/:id/optimize", async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id;
    const listing = await (db as any).getListingById(parseInt(req.params.id));
    if (!listing || listing.userId !== userId) {
      return res.status(403).json({ success: false, error: "Sem permissão" });
    }
    
    const ctr = listing.views > 0 ? (listing.clicks / listing.views * 100).toFixed(1) : "0";
    const prompt = `Esta landing page tem CTR de ${ctr}% (${listing.clicks} cliques em ${listing.views} views).
Headline atual: "${listing.headline}"
CTA atual: "${listing.ctaText}"
Nicho: ${listing.niche}

Sugira melhorias ESPECÍFICAS e ACIONÁVEIS em JSON:
{
  "newHeadline": "headline melhorada",
  "newSubheadline": "subheadline melhorada", 
  "newCta": "CTA melhorado",
  "improvements": ["melhoria 1 específica", "melhoria 2", "melhoria 3"],
  "urgencyTactic": "tática de urgência para o nicho",
  "estimatedCtrImprovement": "X% de aumento estimado"
}`;
    
    const raw = await gemini(prompt, { temperature: 0.6 });
    const suggestions = JSON.parse(raw.replace(/```json|```/g, "").trim());
    
    await (db as any).updateListingOptimization(listing.id, suggestions);
    res.json({ success: true, suggestions });
  } catch (e: any) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// POST /api/marketplace/order — Registra pedido (chamado pelo checkout)
router.post("/order", async (req: Request, res: Response) => {
  try {
    const { listingId, buyerEmail, buyerName, buyerPhone, paymentMethod, paymentId, amount } = req.body;
    const listing = await (db as any).getListingById(listingId);
    if (!listing) return res.status(404).json({ success: false, error: "Listing não encontrado" });
    
    const commission = parseFloat(listing.commissionRate) / 100 * parseFloat(amount);
    const netAmount  = parseFloat(amount) - commission;
    
    const order = await (db as any).createMarketplaceOrder({
      listingId, buyerEmail, buyerName, buyerPhone,
      sellerId: listing.userId, status: "paid",
      amount, commission: commission.toFixed(2), netAmount: netAmount.toFixed(2),
      paymentMethod, paymentId, paidAt: new Date(),
    });
    
    // Atualiza métricas do listing
    await (db as any).incrementListingConversions(listingId, amount);
    
    log.info("marketplace", "Order criada", { orderId: order.id, listingId, amount });
    res.json({ success: true, order });
  } catch (e: any) {
    res.status(500).json({ success: false, error: e.message });
  }
});


// PATCH /api/marketplace/:id/status — Ativa/pausa listing (auth required)
router.patch("/:id/status", async (req: Request, res: Response) => {
  try {
    const userId  = (req as any).user?.id;
    const listing = await (db as any).getListingById(parseInt(req.params.id));
    if (!listing || listing.userId !== userId) {
      return res.status(403).json({ success: false, error: "Sem permissão" });
    }
    const { status } = req.body;
    if (!["active", "paused"].includes(status)) {
      return res.status(400).json({ success: false, error: "Status inválido" });
    }
    await (db as any).updateListingStatus(listing.id, status);
    log.info("marketplace", "Listing status atualizado", { listingId: listing.id, status });
    res.json({ success: true, status });
  } catch (e: any) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// DELETE /api/marketplace/:id — Remove listing (auth required)
router.delete("/:id", async (req: Request, res: Response) => {
  try {
    const userId  = (req as any).user?.id;
    const listing = await (db as any).getListingById(parseInt(req.params.id));
    if (!listing || listing.userId !== userId) {
      return res.status(403).json({ success: false, error: "Sem permissão" });
    }
    await (db as any).deleteMarketplaceListing(listing.id);
    log.info("marketplace", "Listing removido", { listingId: listing.id, userId });
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// POST /api/marketplace/boost — Ativa boost pago para um listing
router.post("/boost", async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id;
    if (!userId) return res.status(401).json({ success: false, error: "Não autenticado" });
    const { listingId, boostType, days, paymentId } = req.body;
    const listing = await (db as any).getListingById(listingId);
    if (!listing || listing.userId !== userId) {
      return res.status(403).json({ success: false, error: "Sem permissão" });
    }
    const BOOST_PRICES: Record<string, number> = {
      featured_home:    97,
      featured_niche:   47,
      priority_search:  27,
      banner_top:      197,
    };
    const price = BOOST_PRICES[boostType] || 47;
    const startDate = new Date();
    const endDate   = new Date(startDate.getTime() + (days || 7) * 24 * 60 * 60 * 1000);
    const boost = await (db as any).createMarketplaceBoost({
      listingId, userId, boostType, startDate, endDate,
      price, isActive: true, paymentId,
    });
    log.info("marketplace", "Boost ativado", { listingId, boostType, days });
    res.json({ success: true, boost });
  } catch (e: any) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// POST /api/marketplace/:id/click — Registra clique na landing page
router.post("/:id/click", async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    if (!isNaN(id)) {
      const pool = await (db as any).getPool?.();
      if (pool) {
        await pool.query(
          `UPDATE marketplace_listings SET clicks = COALESCE(clicks, 0) + 1 WHERE id = $1`,
          [id]
        ).catch(() => {});
      }
    }
    res.json({ success: true });
  } catch {
    res.json({ success: true }); // nunca falha visivelmente
  }
});

export default router;
