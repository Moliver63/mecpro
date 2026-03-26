export default function Terms() {
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
          <h1 style={{ fontFamily: "var(--font-display)", fontSize: 36, fontWeight: 800, color: "var(--black)", marginBottom: 8 }}>Termos de Uso</h1>
          <p style={{ color: "var(--muted)", fontSize: 14 }}>Versão 1.0 · Última atualização: 14/03/2026</p>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 40 }}>

          {/* Section 1 */}
          <section>
            <h2 style={{ fontFamily: "var(--font-display)", fontSize: 20, fontWeight: 700, color: "var(--black)", marginBottom: 12, paddingBottom: 8, borderBottom: "2px solid var(--border)" }}>1. Aceitação dos Termos</h2>
            <p style={{ color: "var(--muted)", lineHeight: 1.7, fontSize: 15 }}>
              Ao acessar ou utilizar o MECPro (Campaign Intelligence Builder), você concorda com estes Termos de Uso. Se você não concordar com qualquer parte destes termos, não utilize a plataforma.
            </p>
            <p style={{ color: "var(--muted)", lineHeight: 1.7, fontSize: 15, marginTop: 10 }}>
              Estes termos constituem um contrato legal entre você (<strong style={{ color: "var(--black)" }}>"Usuário"</strong>) e <strong style={{ color: "var(--black)" }}>Michel Leal ME</strong> (<strong style={{ color: "var(--black)" }}>"MECPro"</strong>, "nós" ou "nosso").
            </p>
          </section>

          {/* Section 2 */}
          <section>
            <h2 style={{ fontFamily: "var(--font-display)", fontSize: 20, fontWeight: 700, color: "var(--black)", marginBottom: 12, paddingBottom: 8, borderBottom: "2px solid var(--border)" }}>2. Descrição do Serviço</h2>
            <p style={{ color: "var(--muted)", lineHeight: 1.7, fontSize: 15, marginBottom: 12 }}>O MECPro é uma plataforma SaaS de inteligência de campanhas digitais que oferece:</p>
            <ul style={{ paddingLeft: 20, color: "var(--muted)", lineHeight: 1.9, fontSize: 15 }}>
              <li>Análise de concorrentes e inteligência de mercado</li>
              <li>Geração automatizada de campanhas com inteligência artificial</li>
              <li>Integração com Meta Ads para publicação de campanhas</li>
              <li>Relatórios e métricas de performance estimadas</li>
              <li>Ferramentas de planejamento estratégico de marketing digital</li>
            </ul>
          </section>

          {/* Section 3 */}
          <section>
            <h2 style={{ fontFamily: "var(--font-display)", fontSize: 20, fontWeight: 700, color: "var(--black)", marginBottom: 12, paddingBottom: 8, borderBottom: "2px solid var(--border)" }}>3. Cadastro e Conta</h2>

            <h3 style={{ fontSize: 15, fontWeight: 700, color: "var(--black)", marginBottom: 8 }}>3.1 Elegibilidade</h3>
            <p style={{ color: "var(--muted)", lineHeight: 1.7, fontSize: 15, marginBottom: 16 }}>
              Você deve ter pelo menos 18 anos e capacidade legal para celebrar contratos para usar o MECPro.
            </p>

            <h3 style={{ fontSize: 15, fontWeight: 700, color: "var(--black)", marginBottom: 8 }}>3.2 Responsabilidade da conta</h3>
            <ul style={{ paddingLeft: 20, color: "var(--muted)", lineHeight: 1.9, fontSize: 15, marginBottom: 16 }}>
              <li>Você é responsável por manter a confidencialidade de suas credenciais</li>
              <li>Notifique-nos imediatamente sobre qualquer uso não autorizado da sua conta</li>
              <li>Você é responsável por todas as atividades realizadas na sua conta</li>
              <li>Não é permitido compartilhar credenciais entre múltiplos usuários</li>
            </ul>

            <h3 style={{ fontSize: 15, fontWeight: 700, color: "var(--black)", marginBottom: 8 }}>3.3 Informações precisas</h3>
            <p style={{ color: "var(--muted)", lineHeight: 1.7, fontSize: 15 }}>
              Você concorda em fornecer informações precisas, completas e atualizadas durante o cadastro e uso da plataforma.
            </p>
          </section>

          {/* Section 4 */}
          <section>
            <h2 style={{ fontFamily: "var(--font-display)", fontSize: 20, fontWeight: 700, color: "var(--black)", marginBottom: 12, paddingBottom: 8, borderBottom: "2px solid var(--border)" }}>4. Planos e Pagamentos</h2>

            <h3 style={{ fontSize: 15, fontWeight: 700, color: "var(--black)", marginBottom: 8 }}>4.1 Planos disponíveis</h3>
            <p style={{ color: "var(--muted)", lineHeight: 1.7, fontSize: 15, marginBottom: 16 }}>
              O MECPro oferece planos Free, Basic, Premium e VIP. Os recursos disponíveis variam conforme o plano contratado.
            </p>

            <h3 style={{ fontSize: 15, fontWeight: 700, color: "var(--black)", marginBottom: 8 }}>4.2 Cobrança</h3>
            <ul style={{ paddingLeft: 20, color: "var(--muted)", lineHeight: 1.9, fontSize: 15, marginBottom: 16 }}>
              <li>Os valores são cobrados antecipadamente, conforme o ciclo escolhido (mensal ou anual)</li>
              <li>Pagamentos são processados via Stripe com segurança PCI-DSS</li>
              <li>Preços podem ser alterados com aviso prévio de 30 dias</li>
            </ul>

            <h3 style={{ fontSize: 15, fontWeight: 700, color: "var(--black)", marginBottom: 8 }}>4.3 Cancelamento e reembolso</h3>
            <ul style={{ paddingLeft: 20, color: "var(--muted)", lineHeight: 1.9, fontSize: 15 }}>
              <li>Você pode cancelar sua assinatura a qualquer momento</li>
              <li>O cancelamento entra em vigor ao final do período já pago</li>
              <li>Reembolsos são avaliados caso a caso para falhas técnicas graves</li>
              <li>Não há reembolso proporcional para cancelamentos antecipados</li>
            </ul>
          </section>

          {/* Section 5 */}
          <section>
            <h2 style={{ fontFamily: "var(--font-display)", fontSize: 20, fontWeight: 700, color: "var(--black)", marginBottom: 12, paddingBottom: 8, borderBottom: "2px solid var(--border)" }}>5. Uso Aceitável</h2>

            <h3 style={{ fontSize: 15, fontWeight: 700, color: "var(--black)", marginBottom: 8 }}>5.1 Você concorda em NÃO:</h3>
            <ul style={{ paddingLeft: 20, color: "var(--muted)", lineHeight: 1.9, fontSize: 15, marginBottom: 16 }}>
              <li>Usar a plataforma para fins ilegais ou não autorizados</li>
              <li>Violar direitos de propriedade intelectual de terceiros</li>
              <li>Tentar acessar sistemas ou dados não autorizados</li>
              <li>Realizar engenharia reversa ou descompilar o software</li>
              <li>Criar contas falsas ou usar informações enganosas</li>
              <li>Sobrecarregar os servidores com requisições automatizadas excessivas</li>
              <li>Usar a plataforma para criar campanhas enganosas, fraudulentas ou ilegais</li>
              <li>Compartilhar, revender ou sublicenciar o serviço sem autorização</li>
            </ul>

            <h3 style={{ fontSize: 15, fontWeight: 700, color: "var(--black)", marginBottom: 8 }}>5.2 Conteúdo do usuário</h3>
            <p style={{ color: "var(--muted)", lineHeight: 1.7, fontSize: 15 }}>
              Você retém a propriedade do conteúdo que cria na plataforma. Ao utilizar o MECPro, você nos concede uma licença limitada para processar esse conteúdo exclusivamente para fornecer o serviço.
            </p>
          </section>

          {/* Section 6 */}
          <section>
            <h2 style={{ fontFamily: "var(--font-display)", fontSize: 20, fontWeight: 700, color: "var(--black)", marginBottom: 12, paddingBottom: 8, borderBottom: "2px solid var(--border)" }}>6. Integrações com Terceiros</h2>

            <h3 style={{ fontSize: 15, fontWeight: 700, color: "var(--black)", marginBottom: 8 }}>6.1 Meta Ads</h3>
            <p style={{ color: "var(--muted)", lineHeight: 1.7, fontSize: 15, marginBottom: 8 }}>
              A integração com Meta Ads requer que você autorize o MECPro a agir em seu nome. Você é responsável por:
            </p>
            <ul style={{ paddingLeft: 20, color: "var(--muted)", lineHeight: 1.9, fontSize: 15, marginBottom: 16 }}>
              <li>Garantir que tem permissão para anunciar na conta Meta conectada</li>
              <li>Revisar e aprovar campanhas antes de ativá-las</li>
              <li>Cumprir as Políticas de Publicidade do Meta</li>
              <li>Manter os tokens de acesso atualizados</li>
            </ul>

            <h3 style={{ fontSize: 15, fontWeight: 700, color: "var(--black)", marginBottom: 8 }}>6.2 Inteligência Artificial</h3>
            <p style={{ color: "var(--muted)", lineHeight: 1.7, fontSize: 15 }}>
              O MECPro utiliza a IA MECPro, nossa inteligência artificial proprietária, para geração de conteúdo de campanhas. Os resultados gerados por IA são sugestões e devem ser revisados antes do uso. Não garantimos a precisão, adequação ou conformidade legal do conteúdo gerado.
            </p>
          </section>

          {/* Section 7 */}
          <section>
            <h2 style={{ fontFamily: "var(--font-display)", fontSize: 20, fontWeight: 700, color: "var(--black)", marginBottom: 12, paddingBottom: 8, borderBottom: "2px solid var(--border)" }}>7. Propriedade Intelectual</h2>
            <p style={{ color: "var(--muted)", lineHeight: 1.7, fontSize: 15, marginBottom: 10 }}>
              O MECPro, incluindo seu código, design, marca, logos e conteúdo da plataforma, é propriedade exclusiva de <strong style={{ color: "var(--black)" }}>Michel Leal ME</strong> e está protegido por leis de propriedade intelectual.
            </p>
            <p style={{ color: "var(--muted)", lineHeight: 1.7, fontSize: 15 }}>
              O conteúdo gerado pela IA com base nos seus dados de entrada pertence a você, sujeito às limitações dos termos dos provedores de IA utilizados.
            </p>
          </section>

          {/* Section 8 */}
          <section>
            <h2 style={{ fontFamily: "var(--font-display)", fontSize: 20, fontWeight: 700, color: "var(--black)", marginBottom: 12, paddingBottom: 8, borderBottom: "2px solid var(--border)" }}>8. Limitação de Responsabilidade</h2>
            <p style={{ color: "var(--muted)", lineHeight: 1.7, fontSize: 15, marginBottom: 12 }}>Na máxima extensão permitida por lei:</p>
            <ul style={{ paddingLeft: 20, color: "var(--muted)", lineHeight: 1.9, fontSize: 15 }}>
              <li>O MECPro é fornecido "como está" e "conforme disponível"</li>
              <li>Não garantimos que o serviço será ininterrupto, seguro ou livre de erros</li>
              <li>Não somos responsáveis por resultados de campanhas publicitárias</li>
              <li>Nossa responsabilidade total não excederá o valor pago nos últimos 3 meses</li>
              <li>Não somos responsáveis por perdas indiretas, incidentais ou consequentes</li>
              <li>Métricas estimadas são projeções e não garantias de resultados</li>
            </ul>
          </section>

          {/* Section 9 */}
          <section>
            <h2 style={{ fontFamily: "var(--font-display)", fontSize: 20, fontWeight: 700, color: "var(--black)", marginBottom: 12, paddingBottom: 8, borderBottom: "2px solid var(--border)" }}>9. Disponibilidade do Serviço</h2>
            <p style={{ color: "var(--muted)", lineHeight: 1.7, fontSize: 15 }}>
              Buscamos disponibilidade de <strong style={{ color: "var(--black)" }}>99,5%</strong> mensalmente. Manutenções programadas serão comunicadas com antecedência. O plano gratuito pode ter limitações adicionais de disponibilidade.
            </p>
          </section>

          {/* Section 10 */}
          <section>
            <h2 style={{ fontFamily: "var(--font-display)", fontSize: 20, fontWeight: 700, color: "var(--black)", marginBottom: 12, paddingBottom: 8, borderBottom: "2px solid var(--border)" }}>10. Suspensão e Encerramento</h2>
            <p style={{ color: "var(--muted)", lineHeight: 1.7, fontSize: 15, marginBottom: 12 }}>Podemos suspender ou encerrar sua conta por:</p>
            <ul style={{ paddingLeft: 20, color: "var(--muted)", lineHeight: 1.9, fontSize: 15, marginBottom: 12 }}>
              <li>Violação destes Termos de Uso</li>
              <li>Falta de pagamento</li>
              <li>Atividade fraudulenta ou suspeita</li>
              <li>Solicitação sua de cancelamento</li>
            </ul>
            <p style={{ color: "var(--muted)", lineHeight: 1.7, fontSize: 15 }}>Você pode exportar seus dados antes do encerramento da conta.</p>
          </section>

          {/* Section 11 */}
          <section>
            <h2 style={{ fontFamily: "var(--font-display)", fontSize: 20, fontWeight: 700, color: "var(--black)", marginBottom: 12, paddingBottom: 8, borderBottom: "2px solid var(--border)" }}>11. Privacidade</h2>
            <p style={{ color: "var(--muted)", lineHeight: 1.7, fontSize: 15 }}>
              O uso do MECPro está sujeito à nossa{" "}
              <a href="/privacy" style={{ color: "var(--black)", fontWeight: 600 }}>Política de Privacidade</a>,
              disponível em <strong style={{ color: "var(--black)" }}>www.mecpro.com/privacy</strong>, que é incorporada a estes Termos por referência.
            </p>
          </section>

          {/* Section 12 */}
          <section>
            <h2 style={{ fontFamily: "var(--font-display)", fontSize: 20, fontWeight: 700, color: "var(--black)", marginBottom: 12, paddingBottom: 8, borderBottom: "2px solid var(--border)" }}>12. Modificações dos Termos</h2>
            <p style={{ color: "var(--muted)", lineHeight: 1.7, fontSize: 15 }}>
              Podemos modificar estes Termos a qualquer momento. Notificaremos você por e-mail com pelo menos <strong style={{ color: "var(--black)" }}>15 dias de antecedência</strong> para mudanças materiais. O uso continuado após a vigência das alterações constitui aceitação.
            </p>
          </section>

          {/* Section 13 */}
          <section>
            <h2 style={{ fontFamily: "var(--font-display)", fontSize: 20, fontWeight: 700, color: "var(--black)", marginBottom: 12, paddingBottom: 8, borderBottom: "2px solid var(--border)" }}>13. Lei Aplicável e Foro</h2>
            <p style={{ color: "var(--muted)", lineHeight: 1.7, fontSize: 15 }}>
              Estes Termos são regidos pelas leis da República Federativa do Brasil. Fica eleito o foro da comarca de <strong style={{ color: "var(--black)" }}>Balneário Camboriú – SC</strong> para dirimir quaisquer controvérsias decorrentes destes Termos, renunciando as partes a qualquer outro por mais privilegiado que seja.
            </p>
          </section>

          {/* Section 14 */}
          <section>
            <h2 style={{ fontFamily: "var(--font-display)", fontSize: 20, fontWeight: 700, color: "var(--black)", marginBottom: 12, paddingBottom: 8, borderBottom: "2px solid var(--border)" }}>14. Contato</h2>
            <p style={{ color: "var(--muted)", lineHeight: 1.7, fontSize: 15, marginBottom: 12 }}>Para dúvidas sobre estes Termos de Uso:</p>
            <ul style={{ listStyle: "none", padding: 0, color: "var(--muted)", lineHeight: 2, fontSize: 15 }}>
              <li>📧 <a href="mailto:contato@mecproai.com" style={{ color: "var(--black)", fontWeight: 600 }}>contato@mecproai.com</a></li>
              <li>🌐 <a href="https://www.mecproai.com" style={{ color: "var(--black)", fontWeight: 600 }}>www.mecproai.com</a></li>
              <li>📍 Balneário Camboriú – SC, Brasil</li>
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
