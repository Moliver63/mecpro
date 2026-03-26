import { useState } from "react";
import { useLocation, useParams } from "wouter";

const MOCK_EBOOKS: Record<string, any> = {
  "1": {
    id: "1", title: "Guia Completo do Meta Ads 2026",
    category: "Tráfego Pago", pages: 87, isPro: false,
    chapters: [
      { id: 1, title: "Introdução ao Meta Ads", pages: "1-12", content: `<h2>Capítulo 1: Introdução ao Meta Ads</h2><p>O Meta Ads é uma das plataformas de publicidade digital mais poderosas do mundo, com acesso a mais de 3 bilhões de usuários ativos mensais em Facebook, Instagram, WhatsApp e Messenger.</p><h3>Por que anunciar no Meta?</h3><p>O Meta oferece segmentação precisa baseada em comportamentos, interesses, dados demográficos e conexões sociais. Isso permite que você alcance exatamente o público certo no momento certo.</p><h3>A estrutura básica</h3><ul><li><strong>Campanha:</strong> Define o objetivo (conversão, tráfego, alcance)</li><li><strong>Conjunto de Anúncios:</strong> Define público, orçamento e programação</li><li><strong>Anúncio:</strong> O criativo que o usuário vê (imagem, vídeo, texto)</li></ul>` },
      { id: 2, title: "Objetivos de Campanha", pages: "13-28", content: `<h2>Capítulo 2: Objetivos de Campanha</h2><p>Escolher o objetivo correto é fundamental para o sucesso das suas campanhas...</p>` },
      { id: 3, title: "Públicos e Segmentação", pages: "29-45", content: `<h2>Capítulo 3: Públicos e Segmentação</h2><p>A segmentação avançada do Meta permite criar públicos altamente qualificados...</p>` },
      { id: 4, title: "Criativos e Formatos", pages: "46-65", content: `<h2>Capítulo 4: Criativos e Formatos</h2><p>Os criativos são o coração de qualquer campanha de sucesso...</p>` },
      { id: 5, title: "Métricas e Otimização", pages: "66-87", content: `<h2>Capítulo 5: Métricas e Otimização</h2><p>Entender e otimizar as métricas corretas é o que diferencia campanhas medíocres de campanhas excelentes...</p>` },
    ]
  },
  "2": {
    id: "2", title: "Copy que Converte: 50 Frameworks",
    category: "Copy & Vendas", pages: 124, isPro: true,
    chapters: [
      { id: 1, title: "Os Fundamentos do Copywriting", pages: "1-20", content: `<h2>Os Fundamentos do Copywriting</h2><p>Copy que converte começa com entender profundamente o seu cliente ideal...</p>` },
    ]
  }
};

export default function EbookReader() {
  const [, setLocation] = useLocation();
  const params = useParams<{ id: string }>();
  const ebookId = params?.id ?? "1";
  const ebook = MOCK_EBOOKS[ebookId] ?? MOCK_EBOOKS["1"];

  const [currentChapter, setCurrentChapter] = useState(0);
  const [fontSize, setFontSize] = useState(16);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [darkMode, setDarkMode] = useState(false);

  const chapter = ebook.chapters[currentChapter];
  const progress = Math.round(((currentChapter + 1) / ebook.chapters.length) * 100);

  const bg = darkMode ? "#1a1a2e" : "#fafaf8";
  const textColor = darkMode ? "#e8e6df" : "#2c2c2c";
  const sidebarBg = darkMode ? "#16213e" : "white";
  const borderColor = darkMode ? "#334155" : "var(--border)";

  if (ebook.isPro) {
    return (
      <div style={{ minHeight: "100vh", background: bg, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
        <div style={{ background: "white", borderRadius: 20, padding: "48px 40px", maxWidth: 440, textAlign: "center", boxShadow: "0 16px 48px rgba(0,0,0,.08)" }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>🔒</div>
          <h2 style={{ fontFamily: "var(--font-display)", fontSize: 22, fontWeight: 800, color: "var(--black)", marginBottom: 8 }}>
            Conteúdo exclusivo Pro
          </h2>
          <p style={{ fontSize: 14, color: "var(--muted)", marginBottom: 24, lineHeight: 1.6 }}>
            Este e-book está disponível apenas para assinantes dos planos Premium ou VIP.
          </p>
          <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
            <button className="btn btn-md btn-green" onClick={() => setLocation("/billing")}>⭐ Assinar agora</button>
            <button className="btn btn-md btn-outline" onClick={() => setLocation("/ebooks")}>← Voltar</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: bg, display: "flex", flexDirection: "column" }}>
      {/* Top bar */}
      <div style={{
        background: sidebarBg, borderBottom: `1px solid ${borderColor}`,
        padding: "12px 20px", display: "flex", alignItems: "center", justifyContent: "space-between",
        position: "sticky", top: 0, zIndex: 10
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <button onClick={() => setLocation("/ebooks")} style={{ background: "none", border: "none", color: "var(--muted)", cursor: "pointer", fontSize: 13 }}>
            ← E-books
          </button>
          <div style={{ width: 1, height: 18, background: borderColor }} />
          <p style={{ fontSize: 13, fontWeight: 700, color: darkMode ? "#e8e6df" : "var(--dark)" }}>{ebook.title}</p>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          {/* Progress */}
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ width: 100, height: 4, background: darkMode ? "#334155" : "var(--border)", borderRadius: 2, overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${progress}%`, background: "var(--green)" }} />
            </div>
            <span style={{ fontSize: 11, color: "var(--muted)" }}>{progress}%</span>
          </div>
          {/* Font size */}
          <div style={{ display: "flex", gap: 4 }}>
            <button onClick={() => setFontSize(f => Math.max(12, f - 2))}
              style={{ background: darkMode ? "#334155" : "var(--off)", border: "none", cursor: "pointer", width: 28, height: 28, borderRadius: 6, fontSize: 12, color: darkMode ? "#e8e6df" : "var(--body)" }}>A-</button>
            <button onClick={() => setFontSize(f => Math.min(24, f + 2))}
              style={{ background: darkMode ? "#334155" : "var(--off)", border: "none", cursor: "pointer", width: 28, height: 28, borderRadius: 6, fontSize: 14, fontWeight: 700, color: darkMode ? "#e8e6df" : "var(--body)" }}>A+</button>
          </div>
          <button onClick={() => setDarkMode(!darkMode)}
            style={{ background: darkMode ? "#334155" : "var(--off)", border: "none", cursor: "pointer", padding: "6px 12px", borderRadius: 8, fontSize: 13, color: darkMode ? "#e8e6df" : "var(--body)" }}>
            {darkMode ? "☀️" : "🌙"}
          </button>
          <button onClick={() => setSidebarOpen(!sidebarOpen)}
            style={{ background: darkMode ? "#334155" : "var(--off)", border: "none", cursor: "pointer", padding: "6px 12px", borderRadius: 8, fontSize: 12, color: darkMode ? "#e8e6df" : "var(--body)" }}>
            📋
          </button>
        </div>
      </div>

      <div style={{ display: "flex", flex: 1 }}>
        {/* Sidebar sumário */}
        {sidebarOpen && (
          <div style={{
            width: 260, background: sidebarBg, borderRight: `1px solid ${borderColor}`,
            overflowY: "auto", flexShrink: 0, padding: "20px 0"
          }}>
            <p style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 1, padding: "0 20px", marginBottom: 12 }}>
              Sumário
            </p>
            {ebook.chapters.map((ch: any, idx: number) => (
              <div key={ch.id}
                onClick={() => setCurrentChapter(idx)}
                style={{
                  padding: "12px 20px", cursor: "pointer",
                  background: currentChapter === idx ? (darkMode ? "#0f172a" : "var(--green-l)") : "transparent",
                  borderLeft: currentChapter === idx ? "3px solid var(--green)" : "3px solid transparent"
                }}
                onMouseEnter={e => { if (currentChapter !== idx) e.currentTarget.style.background = darkMode ? "#0f172a" : "var(--off)"; }}
                onMouseLeave={e => { if (currentChapter !== idx) e.currentTarget.style.background = "transparent"; }}
              >
                <p style={{ fontSize: 12, fontWeight: currentChapter === idx ? 700 : 500, color: currentChapter === idx ? "var(--green-dk)" : (darkMode ? "#94a3b8" : "var(--dark)") }}>
                  {ch.title}
                </p>
                <p style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>Pág. {ch.pages}</p>
              </div>
            ))}
          </div>
        )}

        {/* Conteúdo */}
        <div style={{ flex: 1, overflowY: "auto", padding: "48px 64px" }}>
          <div style={{ maxWidth: 680, margin: "0 auto" }}>
            <div
              style={{ fontSize, color: textColor, lineHeight: 1.9, fontFamily: "Georgia, 'Times New Roman', serif" }}
              dangerouslySetInnerHTML={{ __html: chapter.content }}
            />

            {/* Navegação */}
            <div style={{ marginTop: 48, paddingTop: 24, borderTop: `1px solid ${borderColor}`, display: "flex", justifyContent: "space-between" }}>
              <button
                disabled={currentChapter === 0}
                onClick={() => setCurrentChapter(c => c - 1)}
                style={{ background: darkMode ? "#334155" : "var(--off)", border: `1px solid ${borderColor}`, cursor: "pointer", padding: "10px 20px", borderRadius: 10, fontSize: 13, color: textColor, opacity: currentChapter === 0 ? .4 : 1 }}
              >
                ← Capítulo anterior
              </button>
              <button
                disabled={currentChapter === ebook.chapters.length - 1}
                onClick={() => setCurrentChapter(c => c + 1)}
                style={{ background: "var(--green)", border: "none", cursor: "pointer", padding: "10px 20px", borderRadius: 10, fontSize: 13, color: "white", fontWeight: 700, opacity: currentChapter === ebook.chapters.length - 1 ? .4 : 1 }}
              >
                Próximo capítulo →
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
