import Layout from "@/components/layout/Layout";
import AnnualPromoBanner from "@/components/promo/AnnualPromoBanner";
import { useLocation } from "wouter";

export default function About() {
  const [, setLocation] = useLocation();

  return (
    <Layout>
      {/* Hero */}
      <div style={{
        background: "linear-gradient(135deg, #0f172a 0%, #1e3a5f 60%, #1d4ed8 100%)",
        borderRadius: 20, padding: "48px 40px", marginBottom: 32, color: "white",
      }}>
        <div style={{ maxWidth: 700 }}>
          <div style={{
            fontSize: 11, fontWeight: 800, letterSpacing: 2,
            color: "rgba(255,255,255,0.5)", textTransform: "uppercase", marginBottom: 12,
          }}>
            Sobre a empresa
          </div>
          <h1 style={{
            fontFamily: "var(--font-display)", fontSize: 36, fontWeight: 900,
            color: "white", marginBottom: 16, lineHeight: 1.2,
          }}>
            MECPro Tecnologia Ltda
          </h1>
          <p style={{ fontSize: 16, color: "rgba(255,255,255,0.75)", lineHeight: 1.7, marginBottom: 24 }}>
            Plataforma SaaS de inteligência artificial para criação, gestão e otimização 
            de campanhas de marketing digital. Fundada em 2011 em Balneário Camboriú, SC, 
            a MECPro é pioneira na automação de campanhas para Meta Ads, Google Ads e TikTok Ads 
            no mercado brasileiro.
          </p>
          <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
            {[
              { label: "Fundação", value: "2011" },
              { label: "Sede", value: "Balneário Camboriú, SC" },
              { label: "CNPJ", value: "13.122.473/0001-03" },
              { label: "Plataforma", value: "mecproai.com" },
            ].map(item => (
              <div key={item.label}>
                <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: 1 }}>
                  {item.label}
                </div>
                <div style={{ fontSize: 14, fontWeight: 700, color: "white", marginTop: 2 }}>
                  {item.value}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div style={{ marginBottom: 24 }}>
        <AnnualPromoBanner
          title="Ganhe 60% em crédito agora"
          description="Se você já entendeu o valor da plataforma, esse é o melhor momento para entrar no anual: parte do valor pago volta em crédito para suas campanhas dentro do MecproAI."
          ctaLabel="Ative seu bônus de campanha"
          tone="emerald"
        />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 24, marginBottom: 24 }}>

        {/* Sobre o MECProAI */}
        <div style={{ background: "white", border: "1px solid var(--border)", borderRadius: 16, padding: 28 }}>
          <h2 style={{ fontFamily: "var(--font-display)", fontSize: 20, fontWeight: 800, color: "var(--black)", marginBottom: 16 }}>
            O que é o MECProAI
          </h2>
          <p style={{ fontSize: 14, color: "var(--dark)", lineHeight: 1.8, marginBottom: 16 }}>
            O MECProAI é uma plataforma de software como serviço (SaaS) que utiliza inteligência 
            artificial para automatizar a criação e gestão de campanhas de marketing digital. 
            A plataforma integra-se nativamente com Meta Ads (Facebook e Instagram), Google Ads 
            e TikTok Ads, permitindo que agências e anunciantes criem, publiquem e otimizem 
            campanhas completas em minutos.
          </p>
          <p style={{ fontSize: 14, color: "var(--dark)", lineHeight: 1.8, marginBottom: 16 }}>
            A integração com a Google Ads API permite que nossos usuários criem campanhas de 
            Search e Display diretamente da nossa plataforma, gerenciem lances de palavras-chave, 
            recuperem relatórios de performance e otimizem o ROI — tudo sem precisar acessar 
            o Google Ads diretamente.
          </p>
          <p style={{ fontSize: 14, color: "var(--dark)", lineHeight: 1.8 }}>
            Nossa tecnologia de IA analisa mais de 20 variáveis de mercado, concorrência e 
            comportamento do público para gerar estratégias de campanha personalizadas, copies 
            persuasivos, segmentações inteligentes e previsões de performance antes da publicação.
          </p>
        </div>

        {/* Fundador */}
        <div style={{ background: "white", border: "1px solid var(--border)", borderRadius: 16, padding: 28 }}>
          <h2 style={{ fontFamily: "var(--font-display)", fontSize: 20, fontWeight: 800, color: "var(--black)", marginBottom: 20 }}>
            Fundador & CEO
          </h2>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center" }}>
            <div style={{
              width: 72, height: 72, borderRadius: "50%",
              background: "linear-gradient(135deg, #0f172a, #1d4ed8)",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 28, fontWeight: 900, color: "white", marginBottom: 14,
            }}>
              M
            </div>
            <div style={{ fontSize: 16, fontWeight: 800, color: "var(--black)", marginBottom: 4 }}>
              Michel Leal de Oliveira
            </div>
            <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 16 }}>
              CEO & Founder — MECPro Tecnologia
            </div>
            <div style={{ fontSize: 13, color: "var(--dark)", lineHeight: 1.6, textAlign: "left" }}>
              Empreendedor digital com mais de 13 anos de experiência em marketing digital, 
              tecnologia e automação de campanhas. Fundou a MECPro em 2011 com a visão de 
              democratizar o acesso à inteligência artificial no marketing brasileiro.
            </div>
          </div>
        </div>
      </div>

      {/* Funcionalidades da plataforma */}
      <div style={{ background: "white", border: "1px solid var(--border)", borderRadius: 16, padding: 28, marginBottom: 24 }}>
        <h2 style={{ fontFamily: "var(--font-display)", fontSize: 20, fontWeight: 800, color: "var(--black)", marginBottom: 20 }}>
          Funcionalidades da Plataforma
        </h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 16 }}>
          {[
            {
              icon: "🤖", title: "Geração Automática de Campanhas",
              desc: "IA cria estratégia completa com conjuntos de anúncios, copies, criativos, orçamento e funil de conversão para Meta Ads, Google Ads e TikTok Ads.",
            },
            {
              icon: "🔍", title: "Análise de Concorrentes",
              desc: "Pipeline de 7 camadas coleta e analisa anúncios ativos dos concorrentes via Meta Ads Library, identificando estratégias, copies e oportunidades de mercado.",
            },
            {
              icon: "📊", title: "Inteligência de Mercado",
              desc: "Mapeamento de forças, fraquezas e gaps de mercado usando IA para posicionamento estratégico e diferenciação competitiva.",
            },
            {
              icon: "📱", title: "Publicação Direta nas Plataformas",
              desc: "Integração nativa com Meta Ads API e Google Ads API para publicar campanhas diretamente das plataformas sem necessidade de acesso manual.",
            },
            {
              icon: "📈", title: "Relatórios e Analytics",
              desc: "Geração automática de relatórios em PDF com métricas de performance, benchmarks do setor e recomendações de otimização orientadas por dados.",
            },
            {
              icon: "🎯", title: "Validação de Placements",
              desc: "Sistema de validação automática de compatibilidade entre criativos e posicionamentos da Meta Ads para evitar erros de veiculação antes da publicação.",
            },
            {
              icon: "✍️", title: "Copywriting com IA",
              desc: "Geração de copies persuasivos para anúncios, e-mails e redes sociais baseados em análise de concorrentes e perfil do público-alvo.",
            },
            {
              icon: "🎬", title: "Geração de Vídeos",
              desc: "Pipeline de criação de VSL e vídeos para anúncios com IA generativa: roteiro, narração, imagens e montagem automatizados para múltiplos formatos.",
            },
            {
              icon: "🧠", title: "Motor de Inteligência",
              desc: "Score ponderado de campanhas com aprendizado contínuo para identificar padrões vencedores e recomendar estratégias baseadas em dados históricos.",
            },
          ].map(f => (
            <div key={f.title} style={{
              background: "var(--off)", borderRadius: 12, padding: 18,
              border: "1px solid var(--border)",
            }}>
              <div style={{ fontSize: 24, marginBottom: 8 }}>{f.icon}</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: "var(--black)", marginBottom: 6 }}>{f.title}</div>
              <div style={{ fontSize: 12, color: "var(--muted)", lineHeight: 1.5 }}>{f.desc}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Integrações de API */}
      <div style={{ background: "white", border: "1px solid var(--border)", borderRadius: 16, padding: 28, marginBottom: 24 }}>
        <h2 style={{ fontFamily: "var(--font-display)", fontSize: 20, fontWeight: 800, color: "var(--black)", marginBottom: 8 }}>
          Integrações de API
        </h2>
        <p style={{ fontSize: 13, color: "var(--muted)", marginBottom: 20 }}>
          O MECProAI integra-se com as principais plataformas de publicidade digital via API oficial.
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 14 }}>
          {[
            {
              icon: "📘", name: "Meta Ads API", color: "#1877f2",
              features: ["Criação de campanhas", "Gestão de conjuntos de anúncios", "Upload de criativos", "Relatórios de performance", "Publicação direta"],
            },
            {
              icon: "🔍", name: "Google Ads API", color: "#4285f4",
              features: ["Criação de campanhas Search", "Gestão de palavras-chave", "Campanhas Display", "Otimização de lances", "Relatórios de ROI"],
            },
            {
              icon: "🎵", name: "TikTok Ads API", color: "#ff0050",
              features: ["Criação de campanhas", "Gestão de anúncios", "Upload de vídeos", "Segmentação de audiência", "Relatórios"],
            },
            {
              icon: "🤖", name: "Google Gemini AI", color: "#0ea5e9",
              features: ["Geração de estratégias", "Criação de copies", "Análise de mercado", "Roteiros de vídeo", "Recomendações"],
            },
          ].map(api => (
            <div key={api.name} style={{
              border: `1px solid ${api.color}30`, borderRadius: 12, padding: 16,
              background: `${api.color}05`,
            }}>
              <div style={{ fontSize: 28, marginBottom: 8 }}>{api.icon}</div>
              <div style={{ fontSize: 13, fontWeight: 800, color: api.color, marginBottom: 10 }}>{api.name}</div>
              {api.features.map(f => (
                <div key={f} style={{ fontSize: 11, color: "var(--dark)", marginBottom: 4, display: "flex", gap: 6 }}>
                  <span style={{ color: api.color }}>✓</span> {f}
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* Planos */}
      <div style={{ background: "white", border: "1px solid var(--border)", borderRadius: 16, padding: 28, marginBottom: 24 }}>
        <h2 style={{ fontFamily: "var(--font-display)", fontSize: 20, fontWeight: 800, color: "var(--black)", marginBottom: 20 }}>
          Planos e Preços
        </h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 14 }}>
          {[
            { name: "Free",    price: "Gratuito", color: "#64748b", features: ["3 projetos", "5 campanhas/mês", "Análise básica"] },
            { name: "Basic",   price: "R$ 97/mês", color: "#0891b2", features: ["10 projetos", "20 campanhas/mês", "Análise de concorrentes"] },
            { name: "Premium", price: "R$ 197/mês", color: "#7c3aed", features: ["Projetos ilimitados", "Campanhas ilimitadas", "Todos os módulos"] },
            { name: "VIP",     price: "R$ 397/mês", color: "#16a34a", features: ["Tudo do Premium", "API access", "Suporte prioritário"] },
          ].map(plan => (
            <div key={plan.name} style={{
              border: `1px solid ${plan.color}40`, borderRadius: 12, padding: 18,
              background: `${plan.color}05`, textAlign: "center",
            }}>
              <div style={{ fontSize: 15, fontWeight: 800, color: plan.color, marginBottom: 4 }}>{plan.name}</div>
              <div style={{ fontSize: 18, fontWeight: 900, color: "var(--black)", marginBottom: 12 }}>{plan.price}</div>
              {plan.features.map(f => (
                <div key={f} style={{ fontSize: 11, color: "var(--dark)", marginBottom: 4 }}>✓ {f}</div>
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* Informações legais e contato */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, marginBottom: 24 }}>

        {/* Dados da empresa */}
        <div style={{ background: "white", border: "1px solid var(--border)", borderRadius: 16, padding: 28 }}>
          <h2 style={{ fontFamily: "var(--font-display)", fontSize: 18, fontWeight: 800, color: "var(--black)", marginBottom: 20 }}>
            Informações da Empresa
          </h2>
          {[
            { label: "Razão Social",      value: "MECPro Tecnologia Ltda" },
            { label: "Nome Fantasia",     value: "MECProAI" },
            { label: "CNPJ",              value: "13.122.473/0001-03" },
            { label: "Fundação",          value: "2011" },
            { label: "Endereço",          value: "Rua José Damásio Duarte, 46" },
            { label: "Bairro",            value: "Barra" },
            { label: "Cidade",            value: "Balneário Camboriú, SC" },
            { label: "CEP",               value: "88330-000" },
            { label: "País",              value: "Brasil" },
            { label: "Segmento",          value: "Software / Marketing Digital / SaaS" },
          ].map(item => (
            <div key={item.label} style={{
              display: "flex", justifyContent: "space-between",
              padding: "8px 0", borderBottom: "1px solid var(--border)",
            }}>
              <span style={{ fontSize: 12, color: "var(--muted)", fontWeight: 600 }}>{item.label}</span>
              <span style={{ fontSize: 12, color: "var(--dark)", fontWeight: 700 }}>{item.value}</span>
            </div>
          ))}
        </div>

        {/* Contato */}
        <div style={{ background: "white", border: "1px solid var(--border)", borderRadius: 16, padding: 28 }}>
          <h2 style={{ fontFamily: "var(--font-display)", fontSize: 18, fontWeight: 800, color: "var(--black)", marginBottom: 20 }}>
            Contato
          </h2>
          {[
            { icon: "📧", label: "E-mail Comercial", value: "contato@mecproai.com", href: "mailto:contato@mecproai.com" },
            { icon: "🌐", label: "Website", value: "www.mecproai.com", href: "https://www.mecproai.com" },
            { icon: "📱", label: "WhatsApp", value: "(47) 99999-9999", href: "https://wa.me/5547999999999" },
            { icon: "📸", label: "Instagram", value: "@mecproaibrl", href: "https://instagram.com/mecproaibrl" },
            { icon: "📘", label: "Facebook", value: "@mecproai", href: "https://facebook.com/mecproai" },
            { icon: "🎵", label: "TikTok", value: "@mecproaibrl", href: "https://tiktok.com/@mecproaibrl" },
          ].map(item => (
            <a key={item.label} href={item.href} target="_blank" rel="noreferrer" style={{
              display: "flex", alignItems: "center", gap: 12,
              padding: "10px 0", borderBottom: "1px solid var(--border)",
              textDecoration: "none",
            }}>
              <span style={{ fontSize: 18 }}>{item.icon}</span>
              <div>
                <div style={{ fontSize: 10, color: "var(--muted)", fontWeight: 600 }}>{item.label}</div>
                <div style={{ fontSize: 13, color: "var(--black)", fontWeight: 700 }}>{item.value}</div>
              </div>
            </a>
          ))}

          <div style={{ marginTop: 20 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", marginBottom: 10 }}>
              Documentos legais
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <a href="/privacy" style={{
                fontSize: 12, padding: "6px 14px", borderRadius: 8,
                border: "1px solid var(--border)", color: "var(--dark)",
                textDecoration: "none", fontWeight: 600,
              }}>
                🔒 Privacidade
              </a>
              <a href="/terms" style={{
                fontSize: 12, padding: "6px 14px", borderRadius: 8,
                border: "1px solid var(--border)", color: "var(--dark)",
                textDecoration: "none", fontWeight: 600,
              }}>
                📄 Termos de Uso
              </a>
              <a href="/contact" style={{
                fontSize: 12, padding: "6px 14px", borderRadius: 8,
                border: "1px solid var(--border)", color: "var(--dark)",
                textDecoration: "none", fontWeight: 600,
              }}>
                💬 Contato
              </a>
            </div>
          </div>
        </div>
      </div>

      {/* CTA */}
      <div style={{
        background: "linear-gradient(135deg, #0f172a, #1e3a5f)",
        borderRadius: 16, padding: "28px 32px",
        display: "flex", justifyContent: "space-between", alignItems: "center",
      }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 800, color: "white", marginBottom: 6 }}>
            Pronto para automatizar suas campanhas?
          </div>
          <div style={{ fontSize: 13, color: "rgba(255,255,255,0.6)" }}>
            Comece gratuitamente. Sem cartão de crédito.
          </div>
        </div>
        <button
          onClick={() => setLocation("/register")}
          style={{
            background: "var(--green)", color: "white",
            border: "none", borderRadius: 12, padding: "12px 28px",
            fontSize: 14, fontWeight: 800, cursor: "pointer",
          }}
        >
          Começar grátis →
        </button>
      </div>
    </Layout>
  );
}
