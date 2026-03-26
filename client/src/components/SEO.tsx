import { useEffect } from "react";

interface SEOProps {
  title?: string;
  description?: string;
  keywords?: string;
  ogImage?: string;
  ogType?: string;
  canonical?: string;
  noindex?: boolean;
  structuredData?: object;
}

const BASE_URL = "https://www.mecproai.com";
const DEFAULT_OG_IMAGE = `${BASE_URL}/og-image.jpg`;
const SITE_NAME = "MECPro";

/**
 * SEO component — injects/updates meta tags dynamically per-page.
 * Works for SPA (React) and is compatible with Google's JavaScript rendering.
 *
 * Usage:
 *   <SEO
 *     title="Preços — MECPro"
 *     description="Veja os planos e preços do MECPro..."
 *     canonical="/pricing"
 *   />
 */
export default function SEO({
  title,
  description,
  keywords,
  ogImage = DEFAULT_OG_IMAGE,
  ogType = "website",
  canonical,
  noindex = false,
  structuredData,
}: SEOProps) {
  useEffect(() => {
    // ── Title ──
    if (title) {
      document.title = title.includes(SITE_NAME) ? title : `${title} | ${SITE_NAME}`;
    }

    const setMeta = (name: string, content: string, attr: "name" | "property" = "name") => {
      if (!content) return;
      let el = document.querySelector(`meta[${attr}="${name}"]`) as HTMLMetaElement;
      if (!el) {
        el = document.createElement("meta");
        el.setAttribute(attr, name);
        document.head.appendChild(el);
      }
      el.setAttribute("content", content);
    };

    const setLink = (rel: string, href: string) => {
      let el = document.querySelector(`link[rel="${rel}"]`) as HTMLLinkElement;
      if (!el) {
        el = document.createElement("link");
        el.setAttribute("rel", rel);
        document.head.appendChild(el);
      }
      el.setAttribute("href", href);
    };

    const removeJsonLd = (id: string) => {
      const existing = document.getElementById(id);
      if (existing) existing.remove();
    };

    const injectJsonLd = (id: string, data: object) => {
      removeJsonLd(id);
      const script = document.createElement("script");
      script.type = "application/ld+json";
      script.id = id;
      script.text = JSON.stringify(data);
      document.head.appendChild(script);
    };

    // ── Description ──
    if (description) {
      setMeta("description", description);
      setMeta("og:description", description, "property");
      setMeta("twitter:description", description, "name");
    }

    // ── Keywords ──
    if (keywords) setMeta("keywords", keywords);

    // ── Robots ──
    setMeta("robots", noindex ? "noindex, nofollow" : "index, follow, max-snippet:-1, max-image-preview:large");

    // ── Open Graph ──
    if (title) {
      const ogTitle = title.includes(SITE_NAME) ? title : `${title} | ${SITE_NAME}`;
      setMeta("og:title", ogTitle, "property");
      setMeta("twitter:title", ogTitle, "name");
    }
    setMeta("og:type", ogType, "property");
    setMeta("og:image", ogImage, "property");
    setMeta("og:image:alt", `${title || SITE_NAME} — Plataforma de Inteligência de Campanhas com IA`, "property");
    setMeta("twitter:image", ogImage, "name");
    setMeta("og:site_name", SITE_NAME, "property");

    // ── Canonical ──
    if (canonical) {
      const href = canonical.startsWith("http") ? canonical : `${BASE_URL}${canonical}`;
      setLink("canonical", href);
      setMeta("og:url", href, "property");
    }

    // ── Custom JSON-LD ──
    if (structuredData) {
      injectJsonLd("seo-page-jsonld", structuredData);
    }

    // Cleanup on unmount
    return () => {
      if (structuredData) removeJsonLd("seo-page-jsonld");
    };
  }, [title, description, keywords, ogImage, ogType, canonical, noindex, structuredData]);

  return null;
}

// ─────────────────────────────────────────────────────
// PRE-BUILT SEO CONFIGS FOR EACH PAGE
// ─────────────────────────────────────────────────────

export const SEO_CONFIGS = {
  landing: {
    title: "MECPro — Da análise à campanha em minutos com IA",
    description:
      "Crie campanhas de marketing completas com IA em minutos. Analise concorrentes, perfis de cliente e mercado. Gere copy, ad sets, orçamento e funil prontos para Meta e Google Ads. Plano gratuito disponível.",
    keywords:
      "inteligência de campanhas IA, análise de concorrentes marketing, campanha automática IA, geração de copy IA, meta ads library análise, google ads automação, plataforma marketing digital, MECPro",
    canonical: "/",
  },
  pricing: {
    title: "Preços e Planos — MECPro",
    description:
      "Conheça os planos do MECPro: Basic (R$97/mês), Premium (R$197/mês) e VIP (R$397/mês). Comece grátis sem cartão de crédito. Análise de concorrentes e geração de campanhas com IA.",
    keywords:
      "preço MECPro, planos MECPro, quanto custa MECPro, assinatura ferramenta marketing IA",
    canonical: "/pricing",
  },
  about: {
    title: "Sobre o MECPro — Nossa Missão",
    description:
      "Conheça a missão e a equipe por trás do MECPro. Ajudamos agências e profissionais de marketing a criar campanhas melhores com inteligência artificial.",
    keywords:
      "sobre MECPro, quem somos, missão MECPro, equipe MECPro, plataforma IA marketing",
    canonical: "/about",
  },
  faq: {
    title: "Perguntas Frequentes — MECPro",
    description:
      "Tire suas dúvidas sobre o MECPro: como funciona, preços, integrações com Meta e Google Ads, exportação de relatórios e muito mais.",
    keywords:
      "FAQ MECPro, perguntas frequentes MECPro, como funciona MECPro, dúvidas MECPro",
    canonical: "/faq",
  },
  contact: {
    title: "Contato — MECPro",
    description:
      "Entre em contato com a equipe do MECPro. Suporte técnico, dúvidas comerciais e parcerias.",
    keywords: "contato MECPro, suporte MECPro, falar com MECPro",
    canonical: "/contact",
  },
  courses: {
    title: "Cursos de Marketing Digital com IA — MECPro Academy",
    description:
      "Aprenda marketing digital com IA na MECPro Academy. Cursos sobre análise de concorrentes, criação de campanhas, Meta Ads e Google Ads.",
    keywords:
      "cursos marketing digital IA, MECPro academy, aprender campanhas IA, curso meta ads, curso google ads",
    canonical: "/courses",
  },
  ebooks: {
    title: "E-books de Marketing Digital — MECPro",
    description:
      "Baixe e-books gratuitos e premium sobre marketing digital, análise de concorrentes, criação de campanhas com IA e estratégias para Meta e Google Ads.",
    keywords:
      "ebooks marketing digital, ebooks grátis marketing IA, materiais marketing digital",
    canonical: "/ebooks",
  },
  register: {
    title: "Criar Conta Grátis — MECPro",
    description:
      "Crie sua conta gratuita no MECPro e comece a gerar campanhas de marketing com IA agora mesmo. Sem cartão de crédito.",
    keywords: "cadastro MECPro, criar conta MECPro, registro MECPro",
    canonical: "/register",
    noindex: false,
  },
  login: {
    title: "Entrar — MECPro",
    description: "Acesse sua conta MECPro e comece a criar campanhas com inteligência artificial.",
    canonical: "/login",
    noindex: false,
  },
  terms: {
    title: "Termos de Uso — MECPro",
    description: "Leia os termos de uso da plataforma MECPro.",
    canonical: "/terms",
  },
  privacy: {
    title: "Política de Privacidade — MECPro",
    description: "Saiba como o MECPro coleta, usa e protege seus dados pessoais.",
    canonical: "/privacy",
  },
} as const;
