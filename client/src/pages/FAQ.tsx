import { useState } from "react";
import AnnualPromoBanner from "@/components/promo/AnnualPromoBanner";
import { useLocation } from "wouter";

const FAQ_DATA = [
  {
    category: "Geral",
    icon: "❓",
    items: [
      { q: "O que é o MECPro?", a: "O MECPro é uma plataforma de inteligência de marketing com IA que ajuda profissionais a analisar concorrentes, criar campanhas e entender o mercado usando dados reais do Meta Ads Library e análise gerada pela IA MECPro." },
      { q: "Para quem é o MECPro?", a: "Para agências de marketing, e-commerces, SaaS, consultores freelancers e qualquer profissional que precise criar campanhas mais eficientes baseadas em dados reais de mercado." },
      { q: "O MECPro é gratuito?", a: "Sim, existe um plano gratuito com recursos básicos. Para funcionalidades avançadas como análise ilimitada de concorrentes e geração de campanhas com IA, é necessário um dos nossos planos pagos." },
    ]
  },
  {
    category: "Funcionalidades",
    icon: "⚙️",
    items: [
      { q: "O que é a cascata de 7 camadas?", a: "É nosso sistema proprietário de análise de concorrentes que usa 7 métodos diferentes em sequência: API oficial do Meta, busca avançada na Ads Library, rastreamento por Instagram, scraping do site, análise SEO, geração de insights por IA MECPro e geração de mockups por nicho. Isso garante a maior cobertura possível de dados." },
      { q: "Como funciona a análise de concorrentes?", a: "Você adiciona um concorrente pelo link do Facebook, nome da página ou @Instagram. Nossa cascata de 7 camadas busca automaticamente os anúncios ativos no Meta Ads Library e apresenta um 'Raio-X' completo com insights gerados pela IA MECPro." },
      { q: "Qual tecnologia de IA o MECPro usa?", a: "O MECPro utiliza sua própria camada de inteligência artificial — a IA MECPro — desenvolvida especificamente para análise de marketing, geração de campanhas e inteligência de mercado. Toda a geração de conteúdo, insights e sugestões são processados internamente pela nossa plataforma." },
      { q: "Posso publicar campanhas direto no Meta?", a: "Sim! Conecte sua conta do Meta Ads em Configurações > Meta Integration e você poderá criar e publicar campanhas diretamente pela plataforma." },
      { q: "O que é a consulta CPF/CNPJ?", a: "Uma ferramenta gratuita integrada que consulta dados cadastrais da Receita Federal e processos judiciais do CNJ, útil para verificar parceiros e clientes antes de fechar negócios." },
    ]
  },
  {
    category: "Planos e Pagamento",
    icon: "💳",
    items: [
      { q: "Quais são os planos disponíveis?", a: "Temos 3 planos pagos: Basic (R$ 97/mês), Premium (R$ 197/mês) e VIP (R$ 397/mês), além do plano gratuito com recursos limitados. Todos têm desconto de 20% no plano anual." },
      { q: "Como funciona o pagamento?", a: "Aceitamos cartão de crédito e PIX via Stripe. O pagamento é recorrente (mensal ou anual) e você pode cancelar a qualquer momento." },
      { q: "Existe garantia de reembolso?", a: "Sim! Oferecemos garantia de 7 dias. Se não ficar satisfeito nos primeiros 7 dias após a assinatura, devolvemos 100% do valor sem perguntas." },
      { q: "Posso mudar de plano?", a: "Sim, você pode fazer upgrade ou downgrade do seu plano a qualquer momento. O valor será ajustado proporcionalmente." },
    ]
  },
  {
    category: "Técnico",
    icon: "🔧",
    items: [
      { q: "Quais dados do Meta Ads são acessados?", a: "Acessamos a Ads Library pública do Meta, que mostra anúncios ativos e inativos de qualquer página. Não acessamos dados privados ou métricas confidenciais de anunciantes." },
      { q: "Os dados são armazenados com segurança?", a: "Sim. Usamos criptografia em trânsito (HTTPS/TLS) e em repouso. Não compartilhamos seus dados com terceiros. Leia nossa Política de Privacidade para mais detalhes." },
      { q: "O MECPro funciona em dispositivos móveis?", a: "A plataforma é responsiva e funciona em tablets e celulares, mas recomendamos o uso em desktop para a melhor experiência, especialmente para análise de concorrentes." },
      { q: "Como a IA MECPro é atualizada?", a: "Nossa equipe de engenharia atualiza continuamente os modelos de inteligência artificial da plataforma. A versão atual está indicada no rodapé da plataforma e em Configurações > Sobre." },
    ]
  }
];

export default function FAQ() {
  const [, setLocation] = useLocation();
  const [openItem, setOpenItem] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState("Todos");

  const categories = ["Todos", ...FAQ_DATA.map(c => c.category)];

  const filteredData = FAQ_DATA
    .filter(cat => activeCategory === "Todos" || cat.category === activeCategory)
    .map(cat => ({
      ...cat,
      items: cat.items.filter(
        item =>
          !search ||
          item.q.toLowerCase().includes(search.toLowerCase()) ||
          item.a.toLowerCase().includes(search.toLowerCase())
      )
    }))
    .filter(cat => cat.items.length > 0);

  return (
    <div style={{ minHeight: "100vh", background: "var(--white)" }}>
      {/* Header */}
      <div style={{
        background: "linear-gradient(135deg, #0f172a 0%, #1e3a5f 100%)",
        padding: "60px 24px 80px", textAlign: "center", color: "white"
      }}>
        <div style={{ maxWidth: 640, margin: "0 auto" }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>❓</div>
          <h1 style={{ fontFamily: "var(--font-display)", fontSize: 38, fontWeight: 900, marginBottom: 12 }}>
            Perguntas Frequentes
          </h1>
          <p style={{ fontSize: 16, color: "#cbd5e1", marginBottom: 28 }}>
            Encontre respostas para as dúvidas mais comuns sobre o MECPro
          </p>
          {/* Busca */}
          <div style={{ position: "relative", maxWidth: 480, margin: "0 auto" }}>
            <span style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", fontSize: 16 }}>🔍</span>
            <input
              type="text"
              placeholder="Buscar pergunta..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{
                width: "100%", padding: "14px 14px 14px 42px",
                borderRadius: 12, border: "none", fontSize: 14,
                background: "rgba(255,255,255,.15)", color: "white",
                outline: "none", boxSizing: "border-box"
              }}
            />
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 800, margin: "-24px auto 0", padding: "0 24px 60px" }}>
        {/* Filtros de categoria */}
        <div style={{
          background: "white", borderRadius: 14, padding: "14px 20px",
          marginBottom: 28, display: "flex", gap: 8, flexWrap: "wrap",
          boxShadow: "0 4px 16px rgba(0,0,0,.06)"
        }}>
          {categories.map(cat => (
            <button key={cat} onClick={() => setActiveCategory(cat)} style={{
              padding: "7px 16px", borderRadius: 8, border: "1px solid var(--border)",
              cursor: "pointer", fontSize: 12, fontWeight: 600,
              background: activeCategory === cat ? "var(--black)" : "transparent",
              color: activeCategory === cat ? "white" : "var(--muted)",
              transition: "all .15s"
            }}>
              {cat}
            </button>
          ))}
        </div>

        <div style={{ marginBottom: 28 }}>
          <AnnualPromoBanner
            title="Ative seu bônus de campanha"
            description="Se a sua dúvida principal é financeira, aqui está a resposta curta: no anual, 60% do valor pago volta para você em crédito para campanhas dentro da plataforma."
            ctaLabel="Quero ativar meu crédito agora"
            tone="light"
            compact
          />
        </div>

        {/* FAQ Accordion */}
        {filteredData.length === 0 ? (
          <div style={{ textAlign: "center", padding: 60 }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>🔍</div>
            <p style={{ fontSize: 15, color: "var(--muted)" }}>Nenhuma pergunta encontrada para "{search}"</p>
          </div>
        ) : (
          filteredData.map(cat => (
            <div key={cat.category} style={{ marginBottom: 32 }}>
              <h2 style={{
                fontFamily: "var(--font-display)", fontSize: 18, fontWeight: 800,
                color: "var(--black)", marginBottom: 14, display: "flex", alignItems: "center", gap: 8
              }}>
                <span>{cat.icon}</span> {cat.category}
              </h2>
              <div style={{ background: "white", border: "1px solid var(--border)", borderRadius: 16, overflow: "hidden" }}>
                {cat.items.map((item, idx) => {
                  const key = `${cat.category}-${idx}`;
                  const isOpen = openItem === key;
                  return (
                    <div key={key} style={{ borderBottom: idx < cat.items.length - 1 ? "1px solid var(--border)" : "none" }}>
                      <button
                        onClick={() => setOpenItem(isOpen ? null : key)}
                        style={{
                          width: "100%", padding: "18px 24px",
                          display: "flex", justifyContent: "space-between", alignItems: "center",
                          background: "none", border: "none", cursor: "pointer", textAlign: "left",
                          transition: "background .1s"
                        }}
                        onMouseEnter={e => (e.currentTarget.style.background = "var(--off)")}
                        onMouseLeave={e => (e.currentTarget.style.background = "none")}
                      >
                        <span style={{ fontSize: 14, fontWeight: 600, color: "var(--dark)", flex: 1, paddingRight: 16 }}>
                          {item.q}
                        </span>
                        <span style={{
                          fontSize: 18, color: "var(--muted)", flexShrink: 0,
                          transform: isOpen ? "rotate(45deg)" : "none",
                          transition: "transform .2s", display: "inline-block"
                        }}>
                          +
                        </span>
                      </button>
                      {isOpen && (
                        <div style={{ padding: "0 24px 20px", fontSize: 14, color: "var(--muted)", lineHeight: 1.7 }}>
                          {item.a}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))
        )}

        {/* CTA Contato */}
        <div style={{
          background: "linear-gradient(135deg, #0f172a 0%, #1e3a5f 100%)",
          borderRadius: 20, padding: "36px", textAlign: "center", color: "white"
        }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>💬</div>
          <h2 style={{ fontFamily: "var(--font-display)", fontSize: 22, fontWeight: 800, marginBottom: 8 }}>
            Ainda tem dúvidas?
          </h2>
          <p style={{ fontSize: 14, color: "#94a3b8", marginBottom: 20 }}>
            Fale diretamente com <strong style={{ color: "white" }}>Michel Leal</strong>, nosso Gerente de Relacionamento.
          </p>
          <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
            <button
              onClick={() => setLocation("/contact")}
              style={{ background: "var(--green)", border: "none", color: "white", padding: "11px 24px", borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: "pointer" }}
            >
              📧 Falar com suporte
            </button>
            <button
              onClick={() => window.open("https://wa.me/554799465824", "_blank")}
              style={{ background: "rgba(255,255,255,.1)", border: "1px solid rgba(255,255,255,.2)", color: "white", padding: "11px 24px", borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: "pointer" }}
            >
              📱 WhatsApp
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
