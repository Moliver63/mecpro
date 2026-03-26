import { useState } from "react";
import { useLocation } from "wouter";

export default function About() {
  const [, setLocation] = useLocation();

  const team = [
    { name: "Equipe de Produto", role: "Desenvolvimento e UX", icon: "💻", desc: "Construímos a plataforma com foco na experiência do usuário." },
    { name: "Equipe de IA MECPro", role: "Inteligência Artificial & Plataforma", icon: "🧠", desc: "Desenvolvemos e evoluímos continuamente a IA MECPro e as integrações com Meta Ads." },
    { name: "Equipe de Suporte", role: "Atendimento ao cliente", icon: "💬", desc: "Prontos para ajudar você a extrair o máximo do MECPro." },
  ];

  const stats = [
    { value: "10.000+", label: "Campanhas geradas" },
    { value: "500+", label: "Agências parceiras" },
    { value: "7", label: "Camadas de análise" },
    { value: "99.9%", label: "Uptime garantido" },
  ];

  return (
    <div style={{ minHeight: "100vh", background: "var(--white)" }}>
      {/* Header */}
      <div style={{ background: "linear-gradient(135deg, #0f172a 0%, #1e3a5f 100%)", padding: "60px 24px", textAlign: "center", color: "white" }}>
        <div style={{ maxWidth: 680, margin: "0 auto" }}>
          <div style={{ display: "inline-block", background: "rgba(255,255,255,.1)", borderRadius: 20, padding: "6px 18px", fontSize: 12, fontWeight: 700, color: "#94a3b8", marginBottom: 20, letterSpacing: 1 }}>
            SOBRE O MECPRO
          </div>
          <h1 style={{ fontFamily: "var(--font-display)", fontSize: 42, fontWeight: 900, marginBottom: 16, lineHeight: 1.1 }}>
            Marketing inteligente,<br />resultados reais
          </h1>
          <p style={{ fontSize: 16, color: "#cbd5e1", lineHeight: 1.7, maxWidth: 520, margin: "0 auto" }}>
            O MECPro é uma plataforma de inteligência de marketing com IA que ajuda agências, e-commerces e profissionais a criar campanhas mais eficientes baseadas em dados reais.
          </p>
        </div>
      </div>

      <div style={{ maxWidth: 900, margin: "0 auto", padding: "60px 24px" }}>
        {/* Missão */}
        <div style={{ marginBottom: 60, textAlign: "center" }}>
          <h2 style={{ fontFamily: "var(--font-display)", fontSize: 28, fontWeight: 800, color: "var(--black)", marginBottom: 12 }}>
            Nossa missão
          </h2>
          <p style={{ fontSize: 16, color: "var(--muted)", lineHeight: 1.8, maxWidth: 600, margin: "0 auto" }}>
            Democratizar o acesso à inteligência de marketing de alta qualidade. Queremos que qualquer profissional — seja um freelancer ou uma grande agência — tenha acesso às mesmas ferramentas de análise que as maiores empresas do mundo.
          </p>
        </div>

        {/* Stats */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 20, marginBottom: 60 }}>
          {stats.map(s => (
            <div key={s.label} style={{
              background: "white", border: "1px solid var(--border)", borderRadius: 16,
              padding: "24px 20px", textAlign: "center"
            }}>
              <p style={{ fontFamily: "var(--font-display)", fontSize: 32, fontWeight: 900, color: "var(--black)", marginBottom: 6 }}>{s.value}</p>
              <p style={{ fontSize: 13, color: "var(--muted)" }}>{s.label}</p>
            </div>
          ))}
        </div>

        {/* O que fazemos */}
        <div style={{ marginBottom: 60 }}>
          <h2 style={{ fontFamily: "var(--font-display)", fontSize: 24, fontWeight: 800, color: "var(--black)", marginBottom: 24 }}>
            O que fazemos
          </h2>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            {[
              { icon: "🔍", title: "Análise de Concorrentes", desc: "Monitoramos os anúncios dos seus concorrentes no Meta Ads Library usando uma cascata proprietária de 7 camadas de análise." },
              { icon: "🚀", title: "Geração de Campanhas com IA", desc: "A IA MECPro analisa o mercado e gera campanhas completas e otimizadas para o Meta Ads — do briefing ao criativo em minutos." },
              { icon: "📊", title: "Inteligência de Mercado", desc: "Análise completa do seu nicho, tendências, sazonalidade e oportunidades de crescimento geradas pela IA MECPro." },
              { icon: "🔗", title: "Integração com Meta", desc: "Conecte sua conta do Meta Ads e publique campanhas diretamente pela plataforma." },
              { icon: "🔎", title: "Consulta CPF/CNPJ", desc: "Verifique dados cadastrais da Receita Federal e processos judiciais do CNJ gratuitamente." },
              { icon: "📚", title: "Educação e Cursos", desc: "Aprenda marketing digital com nossos cursos e e-books exclusivos para profissionais na MECPro Academy." },
            ].map(f => (
              <div key={f.title} style={{
                background: "white", border: "1px solid var(--border)", borderRadius: 14,
                padding: "20px 22px", display: "flex", gap: 14, alignItems: "flex-start"
              }}>
                <div style={{ width: 40, height: 40, borderRadius: 10, background: "var(--green-l)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, flexShrink: 0 }}>
                  {f.icon}
                </div>
                <div>
                  <p style={{ fontSize: 14, fontWeight: 700, color: "var(--dark)", marginBottom: 4 }}>{f.title}</p>
                  <p style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.5 }}>{f.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* IA MECPro — Tecnologia */}
        <div style={{ marginBottom: 60 }}>
          <h2 style={{ fontFamily: "var(--font-display)", fontSize: 24, fontWeight: 800, color: "var(--black)", marginBottom: 12 }}>
            A tecnologia por trás do MECPro
          </h2>
          <p style={{ fontSize: 15, color: "var(--muted)", lineHeight: 1.8, marginBottom: 20 }}>
            O MECPro é movido pela <strong>IA MECPro</strong> — uma camada de inteligência artificial desenvolvida e continuamente aprimorada pela nossa equipe de engenharia, especializada em análise de marketing, geração de campanhas e inteligência de mercado.
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>
            {[
              { icon: "🤖", title: "IA MECPro v2.0", desc: "Modelo de geração de campanhas e análise de concorrentes, atualizado continuamente pela equipe MECPro." },
              { icon: "🔒", title: "Dados protegidos", desc: "Todo processamento de dados é realizado de forma segura. Nenhuma informação sensível é compartilhada externamente." },
              { icon: "⚡", title: "Atualizações constantes", desc: "A inteligência da plataforma é atualizada a cada versão. Confira o changelog em Configurações > Sobre." },
            ].map(t => (
              <div key={t.title} style={{
                background: "linear-gradient(135deg, #f8fafc, #f1f5f9)",
                border: "1px solid var(--border)", borderRadius: 14,
                padding: "20px 22px", textAlign: "center"
              }}>
                <div style={{ fontSize: 32, marginBottom: 10 }}>{t.icon}</div>
                <p style={{ fontSize: 14, fontWeight: 700, color: "var(--dark)", marginBottom: 6 }}>{t.title}</p>
                <p style={{ fontSize: 12, color: "var(--muted)", lineHeight: 1.5 }}>{t.desc}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Time */}
        <div style={{ marginBottom: 60 }}>
          <h2 style={{ fontFamily: "var(--font-display)", fontSize: 24, fontWeight: 800, color: "var(--black)", marginBottom: 24 }}>
            Nossas equipes
          </h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>
            {team.map(t => (
              <div key={t.name} style={{
                background: "white", border: "1px solid var(--border)", borderRadius: 16,
                padding: "24px 22px", textAlign: "center"
              }}>
                <div style={{ fontSize: 40, marginBottom: 14 }}>{t.icon}</div>
                <p style={{ fontSize: 15, fontWeight: 700, color: "var(--dark)", marginBottom: 4 }}>{t.name}</p>
                <p style={{ fontSize: 12, color: "var(--green-d)", fontWeight: 600, marginBottom: 10 }}>{t.role}</p>
                <p style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.5 }}>{t.desc}</p>
              </div>
            ))}
          </div>
        </div>

        {/* CTA */}
        <div style={{
          background: "linear-gradient(135deg, #0f172a 0%, #1e3a5f 100%)",
          borderRadius: 20, padding: "40px 36px", textAlign: "center", color: "white"
        }}>
          <h2 style={{ fontFamily: "var(--font-display)", fontSize: 26, fontWeight: 800, marginBottom: 10 }}>
            Pronto para começar?
          </h2>
          <p style={{ fontSize: 15, color: "#94a3b8", marginBottom: 24 }}>
            Crie sua conta gratuita e experimente o poder do marketing com IA.
          </p>
          <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
            <button
              onClick={() => setLocation("/register")}
              style={{ background: "var(--green)", border: "none", color: "white", padding: "12px 28px", borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: "pointer" }}
            >
              Criar conta grátis
            </button>
            <button
              onClick={() => setLocation("/pricing")}
              style={{ background: "rgba(255,255,255,.1)", border: "1px solid rgba(255,255,255,.2)", color: "white", padding: "12px 28px", borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: "pointer" }}
            >
              Ver planos
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
