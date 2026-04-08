import { useLocation } from "wouter";

export default function Privacy() {
  const [, setLocation] = useLocation();
  const updated = "07 de abril de 2026";

  return (
    <div style={{ minHeight: "100vh", background: "#f8fafc", fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" }}>

      {/* Header */}
      <header style={{ borderBottom: "1px solid #e2e8f0", background: "white", padding: "16px 0", position: "sticky", top: 0, zIndex: 50 }}>
        <div style={{ maxWidth: 860, margin: "0 auto", padding: "0 24px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontWeight: 800, fontSize: 18, color: "#0f172a", cursor: "pointer" }} onClick={() => setLocation("/")}>MECProAI</span>
          <a href="/login" style={{ fontSize: 14, color: "#64748b", textDecoration: "none", fontWeight: 500 }}>← Voltar</a>
        </div>
      </header>

      <div style={{ maxWidth: 860, margin: "0 auto", padding: "40px 24px 80px" }}>

        {/* Title */}
        <div style={{ background: "linear-gradient(135deg, #0f172a, #1e3a5f)", borderRadius: 16, padding: "32px 36px", marginBottom: 32, color: "white" }}>
          <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: 2, color: "rgba(255,255,255,0.5)", textTransform: "uppercase", marginBottom: 8 }}>
            Documento Legal
          </div>
          <h1 style={{ fontSize: 28, fontWeight: 900, margin: "0 0 8px" }}>Política de Privacidade</h1>
          <p style={{ fontSize: 14, color: "rgba(255,255,255,0.7)", margin: 0 }}>
            Última atualização: {updated} · MECPro Tecnologia Ltda · CNPJ 13.122.473/0001-03
          </p>
        </div>

        {/* Company info box */}
        <div style={{ background: "white", border: "1px solid #e2e8f0", borderRadius: 12, padding: "16px 20px", marginBottom: 28, display: "flex", gap: 20, flexWrap: "wrap" }}>
          {[
            { label: "Razão Social", value: "MECPro Tecnologia Ltda" },
            { label: "CNPJ", value: "13.122.473/0001-03" },
            { label: "Endereço", value: "Rua José Damásio Duarte, 46 — Barra, Balneário Camboriú, SC" },
            { label: "E-mail DPO", value: "contato@mecproai.com" },
            { label: "Site", value: "www.mecproai.com" },
          ].map(item => (
            <div key={item.label}>
              <div style={{ fontSize: 10, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", marginBottom: 2 }}>{item.label}</div>
              <div style={{ fontSize: 13, fontWeight: 600, color: "#0f172a" }}>{item.value}</div>
            </div>
          ))}
        </div>

        {/* Sections */}
        {[
          {
            num: "1", title: "Introdução e Controlador dos Dados",
            content: `A MECPro Tecnologia Ltda, desenvolvedora e operadora do aplicativo e plataforma MECProAI ("MECProAI", "nós", "nosso"), pessoa jurídica de direito privado inscrita no CNPJ 13.122.473/0001-03, com sede na Rua José Damásio Duarte, 46, Barra, Balneário Camboriú — SC, CEP 88330-000, é a controladora dos dados pessoais coletados por meio do aplicativo MECProAI, acessível em www.mecproai.com e disponível como plataforma web.

Esta Política de Privacidade descreve como o aplicativo MECProAI coleta, usa, armazena e protege seus dados pessoais, em conformidade com a Lei Geral de Proteção de Dados (LGPD — Lei nº 13.709/2018), o Regulamento Geral de Proteção de Dados da União Europeia (GDPR) e demais legislações aplicáveis, incluindo as políticas da TikTok Ads API, Meta Ads API e Google Ads API.

Ao utilizar nossa plataforma, você concorda com os termos desta Política. Caso não concorde, não utilize nossos serviços.`,
          },
          {
            num: "2", title: "Dados Coletados",
            content: `Coletamos os seguintes dados pessoais:

**Dados fornecidos diretamente:**
• Nome completo e e-mail (cadastro e autenticação)
• Dados da empresa (nome, CNPJ, segmento, site)
• Informações de pagamento (processadas por gateway seguro — não armazenamos dados de cartão)
• Tokens de acesso a plataformas de anúncios (Meta Ads, Google Ads, TikTok Ads) fornecidos pelo usuário via OAuth 2.0

**Dados coletados automaticamente:**
• Endereço IP e dados de navegação
• Logs de acesso e uso da plataforma
• Cookies técnicos necessários para funcionamento

**Dados de terceiros:**
• Métricas de campanhas das contas de anúncios conectadas (acessadas via API em nome do usuário)
• Dados públicos de anúncios de concorrentes via Meta Ads Library (dados públicos)`,
          },
          {
            num: "3", title: "Finalidade do Tratamento",
            content: `Tratamos seus dados pessoais para as seguintes finalidades:

**a) Prestação dos serviços contratados:**
• Criação e gestão de campanhas de marketing digital via IA
• Análise de concorrentes e inteligência de mercado
• Geração de relatórios de performance
• Publicação de campanhas nas plataformas conectadas

**b) Integração com APIs de terceiros:**
• Meta Ads API: criação de campanhas, upload de criativos, publicação de anúncios e recuperação de métricas em nome do usuário autenticado
• Google Ads API: criação e gestão de campanhas Search e Display, gestão de palavras-chave e relatórios de ROI em nome do usuário autenticado via OAuth 2.0
• TikTok Ads API: criação e gestão de campanhas de vídeo

**c) Melhoria contínua do serviço:**
• Análise agregada e anonimizada de uso para aprimoramento da IA

**d) Comunicações:**
• Notificações sobre o serviço, atualizações e suporte técnico

**e) Cumprimento de obrigações legais**`,
          },
          {
            num: "4", title: "Base Legal para o Tratamento (LGPD)",
            content: `O tratamento dos seus dados pessoais é realizado com base nas seguintes hipóteses legais previstas na LGPD:

• **Execução de contrato** (Art. 7º, V): dados necessários para prestação dos serviços contratados
• **Legítimo interesse** (Art. 7º, IX): melhoria dos serviços e segurança da plataforma
• **Consentimento** (Art. 7º, I): comunicações de marketing e cookies não essenciais
• **Cumprimento de obrigação legal** (Art. 7º, II): quando exigido por lei ou autoridade competente`,
          },
          {
            num: "5", title: "Compartilhamento de Dados",
            content: `Não vendemos, alugamos ou compartilhamos seus dados pessoais com terceiros para fins comerciais próprios.

Compartilhamos dados exclusivamente nas seguintes situações:

**Plataformas de anúncios (mediante autorização do usuário):**
• Meta Platforms (Facebook/Instagram): dados de campanhas enviados via API em nome do usuário autenticado
• Google LLC: dados de campanhas enviados via Google Ads API em nome do usuário autenticado via OAuth 2.0
• TikTok For Business (TikTok Ads API): o aplicativo MECProAI utiliza a TikTok Ads API para criação e gestão de campanhas de vídeo, upload de criativos, segmentação de audiência e recuperação de métricas de performance, em nome do usuário autenticado

**Provedores de serviços essenciais:**
• Render.com: hospedagem da plataforma (servidores nos EUA)
• Google Cloud (Gemini AI): processamento de inteligência artificial para geração de estratégias

**Autoridades competentes:**
• Quando exigido por lei, decisão judicial ou regulação aplicável

Todos os dados compartilhados com plataformas de anúncios são processados em nome e sob controle do usuário, seguindo as políticas de privacidade de cada plataforma.`,
          },
          {
            num: "6", title: "Transferência Internacional de Dados",
            content: `A MECProAI processa dados em servidores localizados nos Estados Unidos (Render.com e Google Cloud). Essa transferência é realizada com base em cláusulas contratuais padrão e mecanismos de adequação reconhecidos pela ANPD e pelo GDPR.

Ao utilizar nossas integrações com Meta Ads, Google Ads e TikTok Ads, seus dados de campanha são transferidos para os servidores dessas plataformas, localizados globalmente, conforme suas respectivas políticas de privacidade.`,
          },
          {
            num: "7", title: "Retenção de Dados",
            content: `Mantemos seus dados pelo período necessário para:

• Prestação dos serviços contratados (durante toda a vigência do contrato)
• Cumprimento de obrigações legais (até 5 anos após encerramento da conta)
• Defesa em eventuais processos judiciais ou administrativos

Tokens de acesso a APIs de terceiros são armazenados de forma criptografada e eliminados imediatamente após o cancelamento da integração pelo usuário.`,
          },
          {
            num: "8", title: "Segurança dos Dados",
            content: `Adotamos medidas técnicas e organizacionais para proteger seus dados:

• Criptografia em trânsito (HTTPS/TLS 1.3) e em repouso
• Tokens de acesso armazenados de forma criptografada
• Autenticação por JWT com expiração configurada
• Controle de acesso por função (RBAC)
• Logs de auditoria de operações sensíveis
• Backups regulares com retenção controlada

Em caso de incidente de segurança que afete seus dados, notificaremos você e a ANPD conforme exigido pela LGPD.`,
          },
          {
            num: "9", title: "Seus Direitos como Titular (LGPD/GDPR)",
            content: `Você tem os seguintes direitos em relação aos seus dados pessoais:

• **Confirmação e acesso**: saber se tratamos seus dados e obter cópia
• **Correção**: atualizar dados incompletos, inexatos ou desatualizados
• **Anonimização, bloqueio ou eliminação**: de dados desnecessários ou tratados em desconformidade
• **Portabilidade**: receber seus dados em formato estruturado
• **Informação sobre compartilhamento**: saber com quem compartilhamos seus dados
• **Revogação do consentimento**: a qualquer momento, sem prejuízo dos tratamentos anteriores
• **Oposição**: contestar tratamentos realizados com base em legítimo interesse

Para exercer seus direitos, entre em contato pelo e-mail: contato@mecproai.com. Responderemos em até 15 dias úteis.`,
          },
          {
            num: "10", title: "Uso de Cookies",
            content: `Utilizamos cookies técnicos essenciais para o funcionamento da plataforma (autenticação, sessão, preferências). Não utilizamos cookies de rastreamento de terceiros para fins publicitários.

Ao utilizar a plataforma, você consente com o uso de cookies essenciais. Você pode configurar seu navegador para recusar cookies, mas isso pode afetar a funcionalidade da plataforma.`,
          },
          {
            num: "11", title: "Encarregado de Proteção de Dados (DPO)",
            content: `Nosso Encarregado de Proteção de Dados pode ser contatado em:

**Nome:** Michel Leal de Oliveira
**E-mail:** contato@mecproai.com
**Endereço:** Rua José Damásio Duarte, 46, Barra, Balneário Camboriú — SC, CEP 88330-000, Brasil`,
          },
          {
            num: "12", title: "Alterações nesta Política",
            content: `Esta Política pode ser atualizada periodicamente. Notificaremos você por e-mail ou por aviso na plataforma sobre mudanças significativas. A versão mais atual estará sempre disponível em www.mecproai.com/privacy.

**Última atualização:** ${updated}
**Versão:** 3.0`,
          },
          {
            num: "13", title: "Contato e Reclamações",
            content: `Para dúvidas, solicitações ou reclamações sobre esta Política:

• **E-mail:** contato@mecproai.com
• **Endereço:** Rua José Damásio Duarte, 46, Barra, Balneário Camboriú — SC, CEP 88330-000
• **Site:** www.mecproai.com/contact

Você também pode apresentar reclamação à Autoridade Nacional de Proteção de Dados (ANPD): www.gov.br/anpd`,
          },
        ].map(section => (
          <div key={section.num} style={{ background: "white", border: "1px solid #e2e8f0", borderRadius: 14, padding: "24px 28px", marginBottom: 16 }}>
            <div style={{ display: "flex", alignItems: "flex-start", gap: 14, marginBottom: 12 }}>
              <div style={{ width: 28, height: 28, borderRadius: 8, background: "#0f172a", color: "white", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 800, flexShrink: 0 }}>
                {section.num}
              </div>
              <h2 style={{ fontSize: 16, fontWeight: 800, color: "#0f172a", margin: 0 }}>{section.title}</h2>
            </div>
            <div style={{ paddingLeft: 42 }}>
              {section.content.split("\n").map((line, i) => {
                if (!line.trim()) return <div key={i} style={{ height: 8 }} />;
                const isBold = line.startsWith("**") && line.includes(":**");
                const isBullet = line.startsWith("•");
                return (
                  <p key={i} style={{
                    fontSize: 14, color: isBold ? "#0f172a" : "#475569",
                    lineHeight: 1.7, margin: "0 0 4px",
                    fontWeight: isBold ? 700 : 400,
                    paddingLeft: isBullet ? 8 : 0,
                  }}>
                    {line.replace(/\*\*/g, "")}
                  </p>
                );
              })}
            </div>
          </div>
        ))}

        {/* Footer */}
        <div style={{ textAlign: "center", marginTop: 32, padding: "20px", background: "white", borderRadius: 12, border: "1px solid #e2e8f0" }}>
          <p style={{ fontSize: 13, color: "#94a3b8", margin: "0 0 8px" }}>
            MECPro Tecnologia Ltda · CNPJ 13.122.473/0001-03
          </p>
          <div style={{ display: "flex", gap: 16, justifyContent: "center" }}>
            <a href="/terms" style={{ fontSize: 13, color: "#1d4ed8", textDecoration: "none" }}>Termos de Uso</a>
            <a href="/about" style={{ fontSize: 13, color: "#1d4ed8", textDecoration: "none" }}>Sobre nós</a>
            <a href="/contact" style={{ fontSize: 13, color: "#1d4ed8", textDecoration: "none" }}>Contato</a>
          </div>
        </div>
      </div>
    </div>
  );
}
