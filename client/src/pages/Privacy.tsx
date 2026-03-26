export default function Privacy() {
  return (
    <div style={{ minHeight: "100vh", background: "var(--white)" }}>
      {/* Header */}
      <header style={{ borderBottom: "1px solid var(--border)", background: "var(--white)", padding: "16px 0", position: "sticky", top: 0, zIndex: 50 }}>
        <div style={{ maxWidth: 900, margin: "0 auto", padding: "0 24px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 20, color: "var(--black)" }}>MECPro</span>
          <a href="/login" style={{ fontSize: 14, color: "var(--muted)", textDecoration: "none", fontWeight: 500 }}>← Voltar</a>
        </div>
      </header>

      {/* Content */}
      <main style={{ maxWidth: 900, margin: "0 auto", padding: "48px 24px 80px" }}>
        {/* Title */}
        <div style={{ marginBottom: 40 }}>
          <p style={{ fontSize: 13, fontWeight: 600, color: "var(--muted)", letterSpacing: 1, textTransform: "uppercase", marginBottom: 8 }}>MECPro · Campaign Intelligence Builder</p>
          <h1 style={{ fontFamily: "var(--font-display)", fontSize: 36, fontWeight: 800, color: "var(--black)", marginBottom: 8 }}>Política de Privacidade</h1>
          <p style={{ color: "var(--muted)", fontSize: 14 }}>Versão 1.0 · Última atualização: 14/03/2026</p>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 40 }}>

          {/* Section 1 */}
          <section>
            <h2 style={{ fontFamily: "var(--font-display)", fontSize: 20, fontWeight: 700, color: "var(--black)", marginBottom: 12, paddingBottom: 8, borderBottom: "2px solid var(--border)" }}>1. Quem Somos</h2>
            <p style={{ color: "var(--muted)", lineHeight: 1.7, fontSize: 15 }}>
              O MECPro (Campaign Intelligence Builder) é uma plataforma de inteligência de campanhas digitais operada por <strong style={{ color: "var(--black)" }}>Michel Leal ME</strong>, CNPJ a ser informado, com sede em Balneário Camboriú – SC, Brasil. Nosso site é acessível em <strong style={{ color: "var(--black)" }}>mecpro-ai.onrender.com</strong> e <strong style={{ color: "var(--black)" }}>www.mecpro.com</strong>.
            </p>
            <p style={{ color: "var(--muted)", lineHeight: 1.7, fontSize: 15, marginTop: 10 }}>
              Para dúvidas sobre esta política, entre em contato pelo e-mail: <a href="mailto:contato@mecproai.com" style={{ color: "var(--black)", fontWeight: 600 }}>contato@mecproai.com</a>.
            </p>
          </section>

          {/* Section 2 */}
          <section>
            <h2 style={{ fontFamily: "var(--font-display)", fontSize: 20, fontWeight: 700, color: "var(--black)", marginBottom: 12, paddingBottom: 8, borderBottom: "2px solid var(--border)" }}>2. Dados que Coletamos</h2>

            <h3 style={{ fontSize: 15, fontWeight: 700, color: "var(--black)", marginBottom: 8 }}>2.1 Dados fornecidos por você</h3>
            <ul style={{ paddingLeft: 20, color: "var(--muted)", lineHeight: 1.9, fontSize: 15 }}>
              <li>Nome completo e endereço de e-mail ao criar uma conta</li>
              <li>Informações de pagamento processadas via Stripe (não armazenamos dados de cartão)</li>
              <li>Dados de projetos e campanhas criados na plataforma</li>
              <li>Informações sobre sua empresa, nicho de mercado e público-alvo</li>
              <li>URLs de concorrentes e dados relacionados à análise competitiva</li>
            </ul>

            <h3 style={{ fontSize: 15, fontWeight: 700, color: "var(--black)", marginBottom: 8, marginTop: 16 }}>2.2 Dados coletados automaticamente</h3>
            <ul style={{ paddingLeft: 20, color: "var(--muted)", lineHeight: 1.9, fontSize: 15 }}>
              <li>Endereço IP e informações do dispositivo</li>
              <li>Logs de acesso e uso da plataforma</li>
              <li>Cookies de sessão e autenticação</li>
              <li>Dados de integração com Meta Ads (token de acesso e ID da conta de anúncios)</li>
            </ul>

            <h3 style={{ fontSize: 15, fontWeight: 700, color: "var(--black)", marginBottom: 8, marginTop: 16 }}>2.3 Dados de terceiros</h3>
            <ul style={{ paddingLeft: 20, color: "var(--muted)", lineHeight: 1.9, fontSize: 15 }}>
              <li>Informações de perfil do Google quando você faz login com Google OAuth</li>
              <li>Dados da API do Meta Ads quando você conecta sua conta de anúncios</li>
              <li>Métricas de campanhas obtidas via API do Meta Ads</li>
            </ul>
          </section>

          {/* Section 3 */}
          <section>
            <h2 style={{ fontFamily: "var(--font-display)", fontSize: 20, fontWeight: 700, color: "var(--black)", marginBottom: 12, paddingBottom: 8, borderBottom: "2px solid var(--border)" }}>3. Como Usamos seus Dados</h2>
            <ul style={{ paddingLeft: 20, color: "var(--muted)", lineHeight: 1.9, fontSize: 15 }}>
              <li>Fornecer e melhorar os serviços da plataforma MECPro</li>
              <li>Gerar análises de campanhas e insights com a IA MECPro, nossa inteligência artificial proprietária</li>
              <li>Autenticar sua identidade e proteger sua conta</li>
              <li>Processar pagamentos e gerenciar assinaturas</li>
              <li>Enviar notificações relacionadas ao serviço via e-mail (Resend)</li>
              <li>Publicar campanhas no Meta Ads em seu nome, quando autorizado</li>
              <li>Cumprir obrigações legais e regulatórias</li>
              <li>Prevenir fraudes e garantir a segurança da plataforma</li>
            </ul>
          </section>

          {/* Section 4 */}
          <section>
            <h2 style={{ fontFamily: "var(--font-display)", fontSize: 20, fontWeight: 700, color: "var(--black)", marginBottom: 12, paddingBottom: 8, borderBottom: "2px solid var(--border)" }}>4. Compartilhamento de Dados</h2>
            <p style={{ color: "var(--muted)", lineHeight: 1.7, fontSize: 15, marginBottom: 12 }}>Não vendemos seus dados pessoais. Compartilhamos informações apenas nas seguintes situações:</p>
            <ul style={{ paddingLeft: 20, color: "var(--muted)", lineHeight: 1.9, fontSize: 15 }}>
              <li><strong style={{ color: "var(--black)" }}>Stripe:</strong> processamento de pagamentos e assinaturas</li>
              <li><strong style={{ color: "var(--black)" }}>IA MECPro:</strong> geração de conteúdo de campanhas — processado internamente pela plataforma com segurança e confidencialidade</li>
              <li><strong style={{ color: "var(--black)" }}>Meta Platforms:</strong> publicação de campanhas quando você autoriza a integração</li>
              <li><strong style={{ color: "var(--black)" }}>Resend:</strong> envio de e-mails transacionais</li>
              <li><strong style={{ color: "var(--black)" }}>Render.com:</strong> hospedagem da aplicação e banco de dados</li>
              <li><strong style={{ color: "var(--black)" }}>Autoridades legais:</strong> quando exigido por lei ou ordem judicial</li>
            </ul>
          </section>

          {/* Section 5 */}
          <section>
            <h2 style={{ fontFamily: "var(--font-display)", fontSize: 20, fontWeight: 700, color: "var(--black)", marginBottom: 12, paddingBottom: 8, borderBottom: "2px solid var(--border)" }}>5. Seus Direitos (LGPD)</h2>
            <p style={{ color: "var(--muted)", lineHeight: 1.7, fontSize: 15, marginBottom: 12 }}>De acordo com a Lei Geral de Proteção de Dados (Lei nº 13.709/2018), você tem direito a:</p>
            <ul style={{ paddingLeft: 20, color: "var(--muted)", lineHeight: 1.9, fontSize: 15 }}>
              <li>Confirmação da existência de tratamento de seus dados</li>
              <li>Acesso aos seus dados pessoais</li>
              <li>Correção de dados incompletos, inexatos ou desatualizados</li>
              <li>Anonimização, bloqueio ou eliminação de dados desnecessários</li>
              <li>Portabilidade dos dados a outro fornecedor de serviço</li>
              <li>Eliminação dos dados pessoais tratados com seu consentimento</li>
              <li>Informação sobre compartilhamento com terceiros</li>
              <li>Revogação do consentimento a qualquer momento</li>
            </ul>
            <p style={{ color: "var(--muted)", lineHeight: 1.7, fontSize: 15, marginTop: 12 }}>
              Para exercer esses direitos, envie uma solicitação para: <a href="mailto:contato@mecproai.com" style={{ color: "var(--black)", fontWeight: 600 }}>contato@mecproai.com</a>
            </p>
          </section>

          {/* Section 6 */}
          <section>
            <h2 style={{ fontFamily: "var(--font-display)", fontSize: 20, fontWeight: 700, color: "var(--black)", marginBottom: 12, paddingBottom: 8, borderBottom: "2px solid var(--border)" }}>6. Segurança dos Dados</h2>
            <p style={{ color: "var(--muted)", lineHeight: 1.7, fontSize: 15, marginBottom: 12 }}>Adotamos medidas técnicas e organizacionais para proteger seus dados, incluindo:</p>
            <ul style={{ paddingLeft: 20, color: "var(--muted)", lineHeight: 1.9, fontSize: 15 }}>
              <li>Transmissão de dados via HTTPS/TLS</li>
              <li>Senhas armazenadas com hash bcrypt</li>
              <li>Tokens JWT com expiração de 7 dias</li>
              <li>Banco de dados PostgreSQL com acesso restrito</li>
              <li>Tokens de integração armazenados de forma segura no banco de dados</li>
              <li>Logs de auditoria para ações administrativas</li>
            </ul>
          </section>

          {/* Section 7 */}
          <section>
            <h2 style={{ fontFamily: "var(--font-display)", fontSize: 20, fontWeight: 700, color: "var(--black)", marginBottom: 12, paddingBottom: 8, borderBottom: "2px solid var(--border)" }}>7. Retenção de Dados</h2>
            <p style={{ color: "var(--muted)", lineHeight: 1.7, fontSize: 15 }}>
              Mantemos seus dados enquanto sua conta estiver ativa. Após o cancelamento da conta, os dados são excluídos em até <strong style={{ color: "var(--black)" }}>90 dias</strong>, exceto quando a retenção for exigida por lei.
            </p>
          </section>

          {/* Section 8 */}
          <section>
            <h2 style={{ fontFamily: "var(--font-display)", fontSize: 20, fontWeight: 700, color: "var(--black)", marginBottom: 12, paddingBottom: 8, borderBottom: "2px solid var(--border)" }}>8. Cookies</h2>
            <p style={{ color: "var(--muted)", lineHeight: 1.7, fontSize: 15, marginBottom: 12 }}>
              Utilizamos cookies essenciais para autenticação e funcionamento da plataforma. Não utilizamos cookies de rastreamento de terceiros para fins publicitários.
            </p>
            <ul style={{ paddingLeft: 20, color: "var(--muted)", lineHeight: 1.9, fontSize: 15 }}>
              <li><strong style={{ color: "var(--black)" }}>Cookie de sessão (token JWT httpOnly):</strong> necessário para manter sua sessão autenticada</li>
              <li><strong style={{ color: "var(--black)" }}>Preferências do usuário:</strong> armazenadas localmente para melhor experiência</li>
            </ul>
          </section>

          {/* Section 9 */}
          <section>
            <h2 style={{ fontFamily: "var(--font-display)", fontSize: 20, fontWeight: 700, color: "var(--black)", marginBottom: 12, paddingBottom: 8, borderBottom: "2px solid var(--border)" }}>9. Transferência Internacional</h2>
            <p style={{ color: "var(--muted)", lineHeight: 1.7, fontSize: 15 }}>
              Seus dados podem ser processados nos Estados Unidos (Render.com, Google, Meta, Stripe). Essas transferências são realizadas com base em cláusulas contratuais padrão e garantias adequadas de proteção.
            </p>
          </section>

          {/* Section 10 */}
          <section>
            <h2 style={{ fontFamily: "var(--font-display)", fontSize: 20, fontWeight: 700, color: "var(--black)", marginBottom: 12, paddingBottom: 8, borderBottom: "2px solid var(--border)" }}>10. Crianças e Adolescentes</h2>
            <p style={{ color: "var(--muted)", lineHeight: 1.7, fontSize: 15 }}>
              O MECPro não é direcionado a menores de 18 anos. Não coletamos intencionalmente dados de crianças. Se identificarmos tal coleta, os dados serão excluídos imediatamente.
            </p>
          </section>

          {/* Section 11 */}
          <section>
            <h2 style={{ fontFamily: "var(--font-display)", fontSize: 20, fontWeight: 700, color: "var(--black)", marginBottom: 12, paddingBottom: 8, borderBottom: "2px solid var(--border)" }}>11. Alterações nesta Política</h2>
            <p style={{ color: "var(--muted)", lineHeight: 1.7, fontSize: 15 }}>
              Podemos atualizar esta política periodicamente. Notificaremos você por e-mail sobre alterações significativas. O uso continuado da plataforma após as alterações constitui aceitação da nova política.
            </p>
          </section>

          {/* Section 12 */}
          <section>
            <h2 style={{ fontFamily: "var(--font-display)", fontSize: 20, fontWeight: 700, color: "var(--black)", marginBottom: 12, paddingBottom: 8, borderBottom: "2px solid var(--border)" }}>12. Contato</h2>
            <p style={{ color: "var(--muted)", lineHeight: 1.7, fontSize: 15, marginBottom: 12 }}>Para dúvidas, solicitações ou reclamações relacionadas à privacidade:</p>
            <ul style={{ listStyle: "none", padding: 0, color: "var(--muted)", lineHeight: 2, fontSize: 15 }}>
              <li>📧 <a href="mailto:contato@mecproai.com" style={{ color: "var(--black)", fontWeight: 600 }}>contato@mecproai.com</a></li>
              <li>📱 <a href="https://wa.me/554799465824" style={{ color: "var(--black)", fontWeight: 600 }}>(47) 99465-824</a> — Michel Leal, Gerente de Relacionamento</li>
              <li>🌐 <a href="https://www.mecproai.com" style={{ color: "var(--black)", fontWeight: 600 }}>www.mecproai.com</a></li>
              <li>📍 Balneário Camboriú – SC | Centro</li>
            </ul>
          </section>

        </div>

        {/* Back button */}
        <div style={{ marginTop: 56, paddingTop: 32, borderTop: "1px solid var(--border)", textAlign: "center" }}>
          <a href="/login" style={{ display: "inline-block", padding: "12px 32px", background: "var(--black)", color: "white", borderRadius: 10, textDecoration: "none", fontWeight: 600, fontSize: 14 }}>← Voltar ao login</a>
        </div>
      </main>
    </div>
  );
}
