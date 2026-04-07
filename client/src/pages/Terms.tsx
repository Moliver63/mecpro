import { useLocation } from "wouter";

export default function Terms() {
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
        <div style={{ background: "linear-gradient(135deg, #064e3b, #065f46)", borderRadius: 16, padding: "32px 36px", marginBottom: 32, color: "white" }}>
          <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: 2, color: "rgba(255,255,255,0.5)", textTransform: "uppercase", marginBottom: 8 }}>
            Documento Legal
          </div>
          <h1 style={{ fontSize: 28, fontWeight: 900, margin: "0 0 8px" }}>Termos de Uso</h1>
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
            { label: "E-mail", value: "contato@mecproai.com" },
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
            num: "1", title: "Aceitação dos Termos",
            content: `Ao acessar ou utilizar a plataforma MECProAI (www.mecproai.com), você ("Usuário") concorda integralmente com estes Termos de Uso. Caso não concorde com qualquer disposição, não utilize nossos serviços.

Estes Termos constituem um contrato vinculante entre você e a MECPro Tecnologia Ltda, pessoa jurídica de direito privado inscrita no CNPJ 13.122.473/0001-03, com sede na Rua José Damásio Duarte, 46, Barra, Balneário Camboriú — SC, CEP 88330-000.`,
          },
          {
            num: "2", title: "Descrição dos Serviços",
            content: `A MECProAI é uma plataforma SaaS (Software as a Service) de marketing digital com inteligência artificial que oferece:

• **Geração automática de campanhas:** criação de estratégias, copies, criativos e segmentações via IA
• **Análise de concorrentes:** monitoramento de anúncios via Meta Ads Library e outras fontes públicas
• **Integração com plataformas de anúncios:** publicação de campanhas no Meta Ads (Facebook/Instagram), Google Ads e TikTok Ads via API oficial, em nome do usuário autenticado
• **Inteligência de mercado:** análise de nichos, benchmarks e oportunidades
• **Relatórios:** geração de relatórios de performance em PDF e XLSX
• **Academy:** cursos e materiais educacionais sobre marketing digital
• **Geração de vídeos:** criação de VSL e conteúdos em vídeo para anúncios

Os serviços são prestados "como estão" e podem ser modificados, suspensos ou encerrados a qualquer momento, com aviso prévio sempre que possível.`,
          },
          {
            num: "3", title: "Cadastro e Conta",
            content: `Para utilizar a MECProAI, você deve:

• Ter pelo menos 18 anos de idade
• Fornecer informações verdadeiras, precisas e completas no cadastro
• Manter suas credenciais de acesso em sigilo
• Notificar imediatamente qualquer uso não autorizado da sua conta

Você é responsável por todas as atividades realizadas em sua conta. A MECProAI não se responsabiliza por danos decorrentes do uso não autorizado de credenciais por negligência do usuário.

Reservamo-nos o direito de recusar cadastros, suspender ou encerrar contas que violem estes Termos.`,
          },
          {
            num: "4", title: "Planos e Pagamentos",
            content: `A MECProAI oferece planos de assinatura com funcionalidades e limites distintos:

• **Free:** acesso básico gratuito, sem necessidade de cartão de crédito
• **Basic:** R$ 97/mês — recursos intermediários
• **Premium:** R$ 197/mês — acesso completo à plataforma
• **VIP:** R$ 397/mês — todos os recursos + suporte prioritário

**Condições de pagamento:**
• Cobranças realizadas mensalmente de forma antecipada
• Pagamentos processados por gateway seguro (não armazenamos dados de cartão)
• Não há reembolso por períodos parcialmente utilizados
• O cancelamento pode ser feito a qualquer momento; o acesso permanece até o fim do período pago

Os preços podem ser alterados com aviso prévio de 30 dias por e-mail.`,
          },
          {
            num: "5", title: "Integrações com Plataformas de Terceiros",
            content: `A MECProAI integra-se com plataformas de anúncios mediante autorização expressa do usuário via OAuth 2.0. Ao conectar suas contas, você:

**Autoriza a MECProAI a:**
• Criar, editar e publicar campanhas em seu nome nas plataformas conectadas
• Acessar métricas e relatórios de performance das suas contas
• Fazer upload de criativos e configurar segmentações

**Reconhece que:**
• Os tokens de acesso são armazenados de forma criptografada e utilizados exclusivamente para prestar os serviços contratados
• Você permanece o titular e responsável por suas contas nas plataformas de anúncios
• A MECProAI não acessa dados de outras contas além das expressamente autorizadas
• Você pode revogar o acesso a qualquer momento nas configurações da plataforma

**Conformidade com termos de terceiros:**
O uso das APIs está sujeito aos termos de uso de cada plataforma:
• Meta Business Tools Terms: developers.facebook.com/devpolicy
• Google Ads API Terms: developers.google.com/google-ads/api/terms
• TikTok Ads API Terms: ads.tiktok.com/marketing_api/terms`,
          },
          {
            num: "6", title: "Uso Aceitável",
            content: `É proibido utilizar a MECProAI para:

• Criar campanhas com conteúdo ilegal, fraudulento, enganoso ou que viole direitos de terceiros
• Anunciar produtos ou serviços proibidos pelas políticas das plataformas de anúncios
• Praticar spam, phishing ou qualquer forma de comunicação não solicitada em massa
• Tentar acessar sistemas, dados ou contas de outros usuários
• Fazer engenharia reversa, descompilar ou copiar o código da plataforma
• Revender acesso à plataforma ou às APIs integradas sem autorização expressa
• Utilizar a plataforma para fins que violem a LGPD, GDPR ou outras legislações de proteção de dados

A violação destas regras pode resultar em suspensão ou encerramento imediato da conta, sem direito a reembolso.`,
          },
          {
            num: "7", title: "Propriedade Intelectual",
            content: `**Da MECProAI:**
Todo o código, design, algoritmos de IA, metodologias, marcas e conteúdos da plataforma são propriedade exclusiva da MECPro Tecnologia Ltda. É proibida sua reprodução, distribuição ou uso comercial sem autorização prévia por escrito.

**Do Usuário:**
Os dados, criativos, copies e conteúdos criados pelo usuário dentro da plataforma permanecem de sua propriedade. A MECProAI não reivindica qualquer direito sobre o conteúdo criado pelos usuários.

**Licença de uso:**
Concedemos ao usuário uma licença não exclusiva, intransferível e revogável para uso da plataforma durante o período de assinatura ativa.`,
          },
          {
            num: "8", title: "Limitação de Responsabilidade",
            content: `A MECProAI não se responsabiliza por:

• Resultados específicos de campanhas de marketing — a performance depende de múltiplos fatores externos
• Decisões de aprovação ou reprovação de anúncios pelas plataformas de terceiros
• Alterações nas APIs ou políticas das plataformas integradas que afetem os serviços
• Perdas decorrentes de uso indevido das credenciais de acesso
• Interrupções no serviço por motivos de força maior, manutenção ou falhas de terceiros
• Danos indiretos, consequenciais ou lucros cessantes

Nossa responsabilidade total perante o usuário está limitada ao valor pago pelo plano no mês em que ocorreu o dano.`,
          },
          {
            num: "9", title: "Privacidade e Proteção de Dados",
            content: `O tratamento de dados pessoais é regido pela nossa Política de Privacidade, disponível em www.mecproai.com/privacy, que é parte integrante destes Termos.

Em resumo: não vendemos seus dados, utilizamos suas informações apenas para prestar os serviços contratados, e você pode solicitar acesso, correção ou exclusão de seus dados a qualquer momento pelo e-mail contato@mecproai.com.`,
          },
          {
            num: "10", title: "Prazo e Rescisão",
            content: `Estes Termos vigoram por prazo indeterminado a partir da aceitação pelo usuário.

**O usuário pode rescindir** a qualquer momento, cancelando a assinatura nas configurações da conta. O acesso permanece ativo até o fim do período pago.

**A MECProAI pode rescindir** imediatamente, sem aviso prévio, em caso de:
• Violação destes Termos
• Uso fraudulento ou ilegal da plataforma
• Solicitação de autoridades competentes

**A MECProAI pode encerrar** os serviços com aviso prévio de 30 dias por e-mail em caso de descontinuação da plataforma.`,
          },
          {
            num: "11", title: "Modificações dos Termos",
            content: `Podemos atualizar estes Termos periodicamente. Notificaremos você por e-mail ou por aviso na plataforma sobre mudanças significativas com antecedência mínima de 15 dias.

O uso continuado da plataforma após as modificações constitui aceitação dos novos Termos. Caso não concorde, você pode cancelar sua conta antes da entrada em vigor das alterações.

**Última atualização:** ${updated}
**Versão:** 3.0`,
          },
          {
            num: "12", title: "Lei Aplicável e Foro",
            content: `Estes Termos são regidos pelas leis da República Federativa do Brasil. Fica eleito o foro da Comarca de Balneário Camboriú — SC para dirimir quaisquer conflitos, com renúncia expressa a qualquer outro foro, por mais privilegiado que seja.

Para usuários localizados na União Europeia, aplicam-se adicionalmente as disposições do GDPR.`,
          },
          {
            num: "13", title: "Disposições Gerais",
            content: `• **Integralidade:** Estes Termos, juntamente com a Política de Privacidade, constituem o acordo completo entre as partes
• **Nulidade parcial:** A invalidade de qualquer cláusula não afeta as demais
• **Não renúncia:** O não exercício de qualquer direito não constitui renúncia
• **Cessão:** A MECProAI pode ceder estes Termos a um sucessor ou adquirente; o usuário não pode ceder seus direitos sem autorização prévia`,
          },
          {
            num: "14", title: "Contato",
            content: `Para dúvidas, solicitações ou notificações relacionadas a estes Termos:

• **E-mail:** contato@mecproai.com
• **Endereço:** Rua José Damásio Duarte, 46, Barra, Balneário Camboriú — SC, CEP 88330-000
• **Site:** www.mecproai.com/contact

Respondemos em até 5 dias úteis.`,
          },
        ].map(section => (
          <div key={section.num} style={{ background: "white", border: "1px solid #e2e8f0", borderRadius: 14, padding: "24px 28px", marginBottom: 16 }}>
            <div style={{ display: "flex", alignItems: "flex-start", gap: 14, marginBottom: 12 }}>
              <div style={{ width: 28, height: 28, borderRadius: 8, background: "#064e3b", color: "white", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 800, flexShrink: 0 }}>
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
            <a href="/privacy" style={{ fontSize: 13, color: "#1d4ed8", textDecoration: "none" }}>Política de Privacidade</a>
            <a href="/about" style={{ fontSize: 13, color: "#1d4ed8", textDecoration: "none" }}>Sobre nós</a>
            <a href="/contact" style={{ fontSize: 13, color: "#1d4ed8", textDecoration: "none" }}>Contato</a>
          </div>
        </div>
      </div>
    </div>
  );
}
