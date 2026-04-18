import { useState } from "react";
import { useLocation } from "wouter";
import Layout from "@/components/layout/Layout";

const MOCK_EBOOKS = [
  { id: "1", title: "Guia Completo do Meta Ads 2026", desc: "O guia definitivo para anunciar no Facebook e Instagram em 2026, com as últimas atualizações do algoritmo.", pages: 87, category: "Tráfego Pago", thumb: "📘", isPro: false, tags: ["Meta Ads", "Facebook", "Instagram"] },
  { id: "2", title: "Copy que Converte: 50 Frameworks", desc: "50 templates de copywriting testados e aprovados para anúncios, landing pages e e-mails.", pages: 124, category: "Copy & Vendas", thumb: "✍️", isPro: true, tags: ["Copy", "Conversão", "Templates"] },
  { id: "3", title: "Análise Competitiva: Da Teoria à Prática", desc: "Como analisar concorrentes de forma sistemática e transformar dados em estratégias vencedoras.", pages: 68, category: "Estratégia", thumb: "🔍", isPro: true, tags: ["Competidores", "Análise", "IA"] },
  { id: "4", title: "E-commerce: Escala com Tráfego Pago", desc: "Estratégias avançadas de tráfego pago para e-commerces que querem escalar de forma sustentável.", pages: 95, category: "E-commerce", thumb: "🛒", isPro: true, tags: ["E-commerce", "Meta Ads", "Escala"] },
  { id: "5", title: "Relatórios que Impressionam Clientes", desc: "Como criar relatórios de marketing visual e profissional que demonstram valor para os clientes.", pages: 52, category: "Gestão", thumb: "📊", isPro: false, tags: ["Relatórios", "KPIs", "Clientes"] },
  { id: "6", title: "SEO + Tráfego Pago: A Combinação Perfeita", desc: "Integre SEO orgânico com campanhas pagas para maximizar o retorno sobre o investimento.", pages: 76, category: "SEO & Tráfego", thumb: "🟢", isPro: false, tags: ["SEO", "Google Ads", "Tráfego"] },
];

const CATEGORIES = ["Todos", "Tráfego Pago", "Copy & Vendas", "Estratégia", "E-commerce", "Gestão", "SEO & Tráfego"];

export default function Ebooks() {
  const [, setLocation] = useLocation();
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("Todos");
  const [filter, setFilter] = useState<"all" | "free" | "pro">("all");

  const filtered = MOCK_EBOOKS.filter(e => {
    const matchSearch = !search || e.title.toLowerCase().includes(search.toLowerCase());
    const matchCat = category === "Todos" || e.category === category;
    const matchFilter = filter === "all" || (filter === "free" && !e.isPro) || (filter === "pro" && e.isPro);
    return matchSearch && matchCat && matchFilter;
  });

  return (
    <Layout>
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontFamily: "var(--font-display)", fontSize: 26, fontWeight: 800, color: "var(--black)", marginBottom: 4 }}>
          E-books MECPro
        </h1>
        <p style={{ fontSize: 14, color: "var(--muted)" }}>Materiais aprofundados para levar seu marketing ao próximo nível</p>
      </div>

      {/* Stats rápidos */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 14, marginBottom: 24 }}>
        {[
          { icon: "📚", label: "E-books disponíveis", value: MOCK_EBOOKS.length, color: "#eff6ff" },
          { icon: "🆓", label: "E-books gratuitos", value: MOCK_EBOOKS.filter(e => !e.isPro).length, color: "#f0fdf4" },
          { icon: "◈", label: "E-books exclusivos Pro", value: MOCK_EBOOKS.filter(e => e.isPro).length, color: "#fef3c7" },
        ].map(s => (
          <div key={s.label} style={{ background: "white", border: "1px solid var(--border)", borderRadius: 14, padding: "18px 20px", display: "flex", gap: 12, alignItems: "center" }}>
            <div style={{ width: 44, height: 44, borderRadius: 12, background: s.color, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, flexShrink: 0 }}>{s.icon}</div>
            <div>
              <p style={{ fontFamily: "var(--font-display)", fontSize: 22, fontWeight: 800, color: "var(--black)", lineHeight: 1 }}>{s.value}</p>
              <p style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>{s.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Filtros */}
      <div style={{ display: "flex", gap: 12, marginBottom: 22, flexWrap: "wrap", alignItems: "center" }}>
        <input
          type="text" value={search} onChange={e => setSearch(e.target.value)}
          placeholder="🔍 Buscar e-book..."
          style={{ flex: 1, minWidth: 180, padding: "10px 14px", borderRadius: 10, border: "1px solid var(--border)", fontSize: 13, outline: "none" }}
        />
        <select value={category} onChange={e => setCategory(e.target.value)}
          style={{ padding: "10px 14px", borderRadius: 10, border: "1px solid var(--border)", fontSize: 13, background: "white", cursor: "pointer" }}>
          {CATEGORIES.map(c => <option key={c}>{c}</option>)}
        </select>
        <div style={{ display: "flex", gap: 6 }}>
          {(["all", "free", "pro"] as const).map(f => (
            <button key={f} onClick={() => setFilter(f)} style={{
              padding: "8px 14px", borderRadius: 8, border: "1px solid var(--border)",
              cursor: "pointer", fontSize: 12, fontWeight: 600,
              background: filter === f ? "var(--black)" : "transparent",
              color: filter === f ? "white" : "var(--muted)"
            }}>
              {f === "all" ? "Todos" : f === "free" ? "Grátis" : "Pro"}
            </button>
          ))}
        </div>
      </div>

      {/* Lista de e-books */}
      {filtered.length === 0 ? (
        <div style={{ textAlign: "center", padding: 60 }}>
          <div style={{ fontSize: 40, marginBottom: 10 }}>📚</div>
          <p style={{ fontSize: 14, color: "var(--muted)" }}>Nenhum e-book encontrado</p>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 18 }}>
          {filtered.map(ebook => (
            <div key={ebook.id}
              style={{ background: "white", border: "1px solid var(--border)", borderRadius: 16, overflow: "hidden", display: "flex" }}
            >
              {/* Capa */}
              <div style={{
                width: 100, background: "linear-gradient(135deg, #0f172a 0%, #1e3a5f 100%)",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 36, flexShrink: 0, position: "relative"
              }}>
                {ebook.thumb}
                {ebook.isPro && (
                  <div style={{
                    position: "absolute", top: 8, left: 8,
                    background: "var(--green)", color: "white", fontSize: 9,
                    fontWeight: 700, padding: "2px 6px", borderRadius: 4
                  }}>PRO</div>
                )}
              </div>

              {/* Info */}
              <div style={{ padding: "18px 20px", flex: 1 }}>
                <div style={{ display: "flex", gap: 6, marginBottom: 8, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 10, fontWeight: 700, color: "var(--muted)", background: "var(--off)", padding: "2px 8px", borderRadius: 5 }}>{ebook.category}</span>
                  <span style={{ fontSize: 10, color: "var(--muted)" }}>📄 {ebook.pages} páginas</span>
                </div>
                <p style={{ fontSize: 14, fontWeight: 700, color: "var(--dark)", marginBottom: 6, lineHeight: 1.4 }}>{ebook.title}</p>
                <p style={{ fontSize: 12, color: "var(--muted)", lineHeight: 1.5, marginBottom: 14 }}>{ebook.desc}</p>
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    className="btn btn-sm btn-green"
                    onClick={() => setLocation(`/ebook/${ebook.id}`)}
                  >
                    {ebook.isPro ? "⭐ Ver com Pro" : "📖 Ler grátis"}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* CTA upgrade */}
      <div style={{
        marginTop: 28, background: "linear-gradient(135deg, #0f172a 0%, #1e3a5f 100%)",
        borderRadius: 16, padding: "24px 28px", display: "flex", alignItems: "center", justifyContent: "space-between", color: "white"
      }}>
        <div>
          <p style={{ fontFamily: "var(--font-display)", fontSize: 16, fontWeight: 800, marginBottom: 4 }}>
            ⭐ Acesse todos os e-books exclusivos
          </p>
          <p style={{ fontSize: 13, color: "#94a3b8" }}>
            Assine o plano Premium ou VIP e tenha acesso ilimitado a todos os e-books.
          </p>
        </div>
        <button
          className="btn btn-md"
          style={{ background: "var(--green)", color: "white", flexShrink: 0 }}
          onClick={() => setLocation("/billing")}
        >
          Ver planos →
        </button>
      </div>
    </Layout>
  );
}
