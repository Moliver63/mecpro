content = open('client/src/pages/About.tsx', 'r', encoding='utf-8', errors='replace').read()

# Bloco de dados legais para inserir antes do CTA
legal_section = '''        {/* Informações Legais da Empresa — necessário para Google Ads API */}
        <div style={{ marginBottom: 60 }}>
          <h2 style={{ fontFamily: "var(--font-display)", fontSize: 24, fontWeight: 800, color: "var(--black)", marginBottom: 24 }}>
            Informações da Empresa
          </h2>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>

            {/* Dados cadastrais */}
            <div style={{ background: "white", border: "1px solid var(--border)", borderRadius: 16, padding: 24 }}>
              <h3 style={{ fontSize: 14, fontWeight: 800, color: "var(--black)", marginBottom: 16 }}>📋 Dados Cadastrais</h3>
              {[
                { label: "Razão Social",  value: "MECPro Tecnologia Ltda" },
                { label: "Nome Fantasia", value: "MECProAI" },
                { label: "CNPJ",          value: "13.122.473/0001-03" },
                { label: "Fundação",      value: "2011" },
                { label: "Segmento",      value: "Software / SaaS / Marketing Digital" },
                { label: "CEO & Founder", value: "Michel Leal de Oliveira" },
              ].map(item => (
                <div key={item.label} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid var(--border)" }}>
                  <span style={{ fontSize: 12, color: "var(--muted)", fontWeight: 600 }}>{item.label}</span>
                  <span style={{ fontSize: 12, color: "var(--dark)", fontWeight: 700 }}>{item.value}</span>
                </div>
              ))}
            </div>

            {/* Endereço e Contato */}
            <div style={{ background: "white", border: "1px solid var(--border)", borderRadius: 16, padding: 24 }}>
              <h3 style={{ fontSize: 14, fontWeight: 800, color: "var(--black)", marginBottom: 16 }}>📍 Endereço e Contato</h3>
              {[
                { label: "Endereço",  value: "Rua José Damásio Duarte, 46" },
                { label: "Bairro",    value: "Barra" },
                { label: "Cidade",    value: "Balneário Camboriú, SC" },
                { label: "CEP",       value: "88330-000" },
                { label: "País",      value: "Brasil" },
                { label: "E-mail",    value: "contato@mecproai.com" },
                { label: "WhatsApp",  value: "(47) 99465-8248" },
                { label: "Website",   value: "www.mecproai.com" },
              ].map(item => (
                <div key={item.label} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid var(--border)" }}>
                  <span style={{ fontSize: 12, color: "var(--muted)", fontWeight: 600 }}>{item.label}</span>
                  <span style={{ fontSize: 12, color: "var(--dark)", fontWeight: 700 }}>{item.value}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Integrações de API */}
          <div style={{ marginTop: 20, background: "white", border: "1px solid var(--border)", borderRadius: 16, padding: 24 }}>
            <h3 style={{ fontSize: 14, fontWeight: 800, color: "var(--black)", marginBottom: 16 }}>🔗 Integrações de API</h3>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14 }}>
              {[
                { icon: "📘", name: "Meta Ads API", color: "#1877f2", desc: "Criação e publicação de campanhas no Facebook e Instagram, gestão de conjuntos de anúncios, upload de criativos e relatórios de performance." },
                { icon: "🔍", name: "Google Ads API", color: "#4285f4", desc: "Criação de campanhas Search e Display, gestão de palavras-chave, otimização de lances e relatórios de ROI — tudo direto da plataforma MECProAI." },
                { icon: "🎵", name: "TikTok Ads API", color: "#ff0050", desc: "Criação e gestão de campanhas, upload de vídeos, segmentação de audiência e relatórios de performance para anúncios no TikTok." },
              ].map(api => (
                <div key={api.name} style={{ border: `1px solid ${api.color}30`, borderRadius: 12, padding: 16, background: `${api.color}05` }}>
                  <div style={{ fontSize: 22, marginBottom: 6 }}>{api.icon}</div>
                  <div style={{ fontSize: 13, fontWeight: 800, color: api.color, marginBottom: 8 }}>{api.name}</div>
                  <div style={{ fontSize: 11, color: "var(--muted)", lineHeight: 1.5 }}>{api.desc}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Documentos legais */}
          <div style={{ marginTop: 20, display: "flex", gap: 12, flexWrap: "wrap" }}>
            {[
              { label: "🔒 Política de Privacidade", href: "/privacy" },
              { label: "📄 Termos de Uso", href: "/terms" },
              { label: "💬 Contato", href: "/contact" },
            ].map(doc => (
              <a key={doc.label} href={doc.href} style={{
                fontSize: 13, padding: "8px 18px", borderRadius: 10,
                border: "1px solid var(--border)", color: "var(--dark)",
                textDecoration: "none", fontWeight: 600, background: "white",
              }}>
                {doc.label}
              </a>
            ))}
          </div>
        </div>

'''

# Inserir antes do bloco CTA
old = '        {/* CTA */}'
if old in content:
    content = content.replace(old, legal_section + old)
    open('client/src/pages/About.tsx', 'w', encoding='utf-8').write(content)
    print('OK - secao legal adicionada ao About.tsx')
else:
    print('ERRO - bloco CTA nao encontrado')
    # Debug
    idx = content.find('Pronto para come')
    print('Contexto CTA:', repr(content[idx-50:idx+50]) if idx >= 0 else 'nao encontrado')
