import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";

// ── Planos com preços anuais (20% desconto sobre mensal) ──────────────────────
const PLANS = [
  { name: "Basic",   monthly: 97,  slug: "basic"   },
  { name: "Premium", monthly: 197, slug: "premium" },
  { name: "VIP",     monthly: 397, slug: "vip"     },
];

function annualTotal(monthly: number) { return Math.floor(monthly * 0.8) * 12; }
function credit60(monthly: number)    { return Math.round(annualTotal(monthly) * 0.6); }

// ── Utilitário ────────────────────────────────────────────────────────────────
function R(v: number) { return `R$\u00a0${v.toLocaleString("pt-BR")}`; }

// ── Contador regressivo (72h) ─────────────────────────────────────────────────
function useCountdown(hours = 72) {
  const end = useRef(Date.now() + hours * 3600 * 1000);
  const [left, setLeft] = useState(end.current - Date.now());
  useEffect(() => {
    const id = setInterval(() => setLeft(Math.max(0, end.current - Date.now())), 1000);
    return () => clearInterval(id);
  }, []);
  const h  = Math.floor(left / 3600000);
  const m  = Math.floor((left % 3600000) / 60000);
  const s  = Math.floor((left % 60000)   / 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return { h: pad(h), m: pad(m), s: pad(s) };
}

// ── Barra de vagas ────────────────────────────────────────────────────────────
const TOTAL_VAGAS = 50;
const USADAS      = 37; // simula vagas ocupadas

// ── Componente principal ──────────────────────────────────────────────────────
export default function PromoAnual() {
  const [, setLocation] = useLocation();
  const [planIdx, setPlanIdx] = useState(1); // Premium selecionado por padrão
  const { h, m, s } = useCountdown(72);

  const plan   = PLANS[planIdx];
  const total  = annualTotal(plan.monthly);
  const credit = credit60(plan.monthly);
  const vagas  = TOTAL_VAGAS - USADAS;
  const pct    = Math.round((USADAS / TOTAL_VAGAS) * 100);

  const goToCheckout = () => setLocation("/pricing");

  return (
    <div style={{
      minHeight: "100vh",
      background: "#050505",
      color: "#f0f0f0",
      fontFamily: "'Geist', -apple-system, 'SF Pro Display', sans-serif",
      overflowX: "hidden",
    }}>

      {/* ── ESTILOS GLOBAIS ── */}
      <style>{`
        @keyframes pulse-green { 0%,100%{box-shadow:0 0 0 0 rgba(48,209,88,.4)} 50%{box-shadow:0 0 0 12px rgba(48,209,88,0)} }
        @keyframes float { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-6px)} }
        @keyframes fadeUp { from{opacity:0;transform:translateY(24px)} to{opacity:1;transform:translateY(0)} }
        @keyframes shimmer { 0%{background-position:-400px 0} 100%{background-position:400px 0} }
        @keyframes blink { 0%,100%{opacity:1} 50%{opacity:.4} }
        .btn-promo {
          background: linear-gradient(135deg, #30d158, #248a3d);
          color: #fff;
          font-weight: 800;
          font-size: 18px;
          padding: 18px 40px;
          border: none;
          border-radius: 14px;
          cursor: pointer;
          width: 100%;
          max-width: 480px;
          letter-spacing: -.3px;
          animation: pulse-green 2.5s infinite;
          transition: transform .15s, filter .15s;
        }
        .btn-promo:hover { transform: scale(1.03); filter: brightness(1.1); }
        .btn-promo-sm {
          background: linear-gradient(135deg, #30d158, #248a3d);
          color: #fff;
          font-weight: 700;
          font-size: 15px;
          padding: 13px 28px;
          border: none;
          border-radius: 10px;
          cursor: pointer;
          transition: transform .15s, filter .15s;
        }
        .btn-promo-sm:hover { transform: scale(1.03); filter: brightness(1.1); }
        .card { background: #111; border: 1px solid #222; border-radius: 20px; padding: 32px; }
        .tag-red { background: #ff3b30; color: #fff; font-size: 11px; font-weight: 800; padding: 4px 10px; border-radius: 99px; letter-spacing: .5px; text-transform: uppercase; }
        .tag-green { background: rgba(48,209,88,.15); color: #30d158; font-size: 11px; font-weight: 800; padding: 4px 10px; border-radius: 99px; letter-spacing: .5px; text-transform: uppercase; }
        .section { padding: 80px 24px; max-width: 720px; margin: 0 auto; }
        .fade-up { animation: fadeUp .6s ease both; }
        .ticker { font-variant-numeric: tabular-nums; }
        @media(max-width:600px){
          .btn-promo { font-size:16px; padding:16px 24px; }
          .section { padding:60px 20px; }
          .card { padding:24px 20px; }
        }
      `}</style>

      {/* ══════════════════════════════════════════════
          NAV
      ══════════════════════════════════════════════ */}
      <nav style={{
        position: "sticky", top: 0, zIndex: 100,
        background: "rgba(5,5,5,.92)", backdropFilter: "blur(20px)",
        borderBottom: "1px solid #1a1a1a",
        padding: "0 24px", height: 60,
        display: "flex", alignItems: "center", justifyContent: "space-between",
      }}>
        <a href="/" style={{ fontFamily: "var(--font-display, inherit)", fontSize: 20, fontWeight: 800, color: "#f0f0f0", textDecoration: "none" }}>
          MEC<span style={{ color: "#30d158" }}>PRO</span>
        </a>
        <button className="btn-promo-sm" onClick={goToCheckout}>
          Ativar 60% de crédito ↗
        </button>
      </nav>

      {/* ══════════════════════════════════════════════
          BANNER URGÊNCIA (topo)
      ══════════════════════════════════════════════ */}
      <div style={{
        background: "linear-gradient(90deg,#ff3b30,#ff6b35)",
        textAlign: "center", padding: "10px 16px",
        fontSize: 13, fontWeight: 700, color: "#fff",
        display: "flex", alignItems: "center", justifyContent: "center", gap: 10, flexWrap: "wrap",
      }}>
        <span style={{ animation: "blink 1.4s infinite" }}>🔴</span>
        OFERTA ENCERRA EM:
        <span className="ticker" style={{ background: "rgba(0,0,0,.3)", padding: "3px 10px", borderRadius: 6, letterSpacing: 2, fontSize: 15 }}>
          {h}:{m}:{s}
        </span>
        — Apenas <strong>{vagas} vagas</strong> restantes
      </div>

      {/* ══════════════════════════════════════════════
          HERO
      ══════════════════════════════════════════════ */}
      <section style={{ padding: "80px 24px 64px", textAlign: "center", maxWidth: 760, margin: "0 auto" }}>

        {/* Selo oferta limitada */}
        <div style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "rgba(48,209,88,.12)", border: "1px solid rgba(48,209,88,.3)", borderRadius: 99, padding: "6px 16px", marginBottom: 32 }}>
          <span style={{ fontSize: 14 }}>🎯</span>
          <span style={{ fontSize: 12, fontWeight: 700, color: "#30d158", textTransform: "uppercase", letterSpacing: 1 }}>Oferta exclusiva · Tempo limitado</span>
        </div>

        {/* Headline */}
        <h1 style={{
          fontSize: "clamp(36px, 6vw, 68px)", fontWeight: 900,
          lineHeight: 1.05, letterSpacing: -2, marginBottom: 24,
          background: "linear-gradient(135deg, #fff 30%, #30d158 100%)",
          WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
        }}>
          Assine o plano anual e ganhe{" "}
          <span style={{
            background: "linear-gradient(135deg,#30d158,#34d399)",
            WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
          }}>
            60% em créditos
          </span>{" "}
          para suas campanhas
        </h1>

        {/* Subheadline */}
        <p style={{ fontSize: "clamp(16px,2.5vw,20px)", color: "#888", lineHeight: 1.7, marginBottom: 40, maxWidth: 560, margin: "0 auto 40px" }}>
          Você investe no plano anual e recebe de volta <strong style={{ color: "#f0f0f0" }}>60% do valor pago</strong> em créditos para impulsionar suas campanhas direto na plataforma. Dinheiro que volta para o seu tráfego.
        </p>

        {/* Calculadora de plano */}
        <div className="card" style={{ marginBottom: 32, textAlign: "left", maxWidth: 560, margin: "0 auto 32px" }}>
          <p style={{ fontSize: 12, fontWeight: 700, color: "#666", textTransform: "uppercase", letterSpacing: 1, marginBottom: 14 }}>Calcule seu retorno</p>
          <div style={{ display: "flex", gap: 8, marginBottom: 24 }}>
            {PLANS.map((p, i) => (
              <button key={p.slug} onClick={() => setPlanIdx(i)} style={{
                flex: 1, padding: "10px 8px", borderRadius: 10, border: `2px solid ${planIdx === i ? "#30d158" : "#222"}`,
                background: planIdx === i ? "rgba(48,209,88,.1)" : "transparent",
                color: planIdx === i ? "#30d158" : "#666",
                fontWeight: 700, fontSize: 13, cursor: "pointer", transition: "all .15s",
              }}>
                {p.name}
              </button>
            ))}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
            <div style={{ background: "#0a0a0a", borderRadius: 12, padding: 16, textAlign: "center" }}>
              <div style={{ fontSize: 11, color: "#555", marginBottom: 4 }}>Você paga/ano</div>
              <div style={{ fontSize: 22, fontWeight: 900, color: "#f0f0f0" }}>{R(total)}</div>
            </div>
            <div style={{ background: "#0d1f12", border: "1px solid rgba(48,209,88,.3)", borderRadius: 12, padding: 16, textAlign: "center" }}>
              <div style={{ fontSize: 11, color: "#30d158", marginBottom: 4 }}>Créditos que recebe</div>
              <div style={{ fontSize: 22, fontWeight: 900, color: "#30d158" }}>+ {R(credit)}</div>
            </div>
            <div style={{ background: "#0a0a0a", borderRadius: 12, padding: 16, textAlign: "center" }}>
              <div style={{ fontSize: 11, color: "#555", marginBottom: 4 }}>Custo real</div>
              <div style={{ fontSize: 22, fontWeight: 900, color: "#f0f0f0" }}>{R(total - credit)}</div>
            </div>
          </div>

          <p style={{ fontSize: 12, color: "#555", marginTop: 12, textAlign: "center" }}>
            * Créditos creditados em até 10 dias após confirmação do pagamento
          </p>
        </div>

        {/* CTA principal */}
        <button className="btn-promo" onClick={goToCheckout} style={{ display: "block", margin: "0 auto 16px" }}>
          ⚡ Quero ativar meu crédito agora
        </button>
        <p style={{ fontSize: 13, color: "#555" }}>
          Disponível por tempo limitado · Apenas {vagas} vagas com crédito restantes
        </p>
      </section>

      {/* ══════════════════════════════════════════════
          BARRA DE ESCASSEZ
      ══════════════════════════════════════════════ */}
      <section style={{ padding: "0 24px 80px", maxWidth: 720, margin: "0 auto" }}>
        <div className="card" style={{ border: "1px solid #ff3b3033" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 20 }}>🔥</span>
              <span style={{ fontWeight: 700, fontSize: 15, color: "#f0f0f0" }}>Vagas com crédito promocional</span>
            </div>
            <span className="tag-red">{vagas} restantes</span>
          </div>
          <div style={{ background: "#1a1a1a", borderRadius: 99, height: 12, overflow: "hidden" }}>
            <div style={{
              width: `${pct}%`, height: "100%",
              background: "linear-gradient(90deg,#ff6b35,#ff3b30)",
              borderRadius: 99, transition: "width 1s ease",
            }} />
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8 }}>
            <span style={{ fontSize: 12, color: "#666" }}>{USADAS} vagas preenchidas</span>
            <span style={{ fontSize: 12, color: "#ff6b35", fontWeight: 700 }}>{pct}% ocupado</span>
          </div>
          <p style={{ fontSize: 13, color: "#666", marginTop: 14, lineHeight: 1.6 }}>
            Quando as vagas acabarem, o plano anual continua disponível — mas <strong style={{ color: "#f0f0f0" }}>sem o crédito de 60%</strong>. Não tem segunda chance.
          </p>
          <div style={{ textAlign: "center", marginTop: 20 }}>
            <button className="btn-promo-sm" onClick={goToCheckout}>Garantir minha vaga agora →</button>
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════
          SEÇÃO: COMO FUNCIONA
      ══════════════════════════════════════════════ */}
      <section className="section" style={{ borderTop: "1px solid #111" }}>
        <div style={{ textAlign: "center", marginBottom: 48 }}>
          <span className="tag-green" style={{ marginBottom: 16, display: "inline-block" }}>Simples assim</span>
          <h2 style={{ fontSize: "clamp(28px,4vw,42px)", fontWeight: 800, letterSpacing: -1, color: "#f0f0f0", marginBottom: 12 }}>
            Como funciona em 4 passos
          </h2>
          <p style={{ fontSize: 16, color: "#666" }}>Sem burocracia. Sem letras miúdas.</p>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {[
            { n: "01", title: "Assina o plano anual", desc: "Escolha Basic, Premium ou VIP. O desconto de 20% já é aplicado automaticamente.", icon: "✍️" },
            { n: "02", title: "Aguarda até 10 dias úteis", desc: "Nossa equipe confirma o pagamento e processa os créditos na sua conta.", icon: "⏳" },
            { n: "03", title: "Recebe 60% em créditos", desc: `No plano Premium anual você paga ${R(annualTotal(197))} e recebe ${R(credit60(197))} em créditos para campanhas.`, icon: "💰" },
            { n: "04", title: "Usa nas suas campanhas", desc: "Os créditos ficam disponíveis para impulsionar campanhas dentro do MECPro — Meta, Google e TikTok.", icon: "🚀" },
          ].map((step, i) => (
            <div key={i} className="card" style={{ display: "flex", gap: 20, alignItems: "flex-start" }}>
              <div style={{
                width: 52, height: 52, borderRadius: 14,
                background: "rgba(48,209,88,.1)", border: "1px solid rgba(48,209,88,.2)",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 24, flexShrink: 0,
              }}>
                {step.icon}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                  <span style={{ fontSize: 11, fontWeight: 800, color: "#30d158", letterSpacing: 1 }}>{step.n}</span>
                  <span style={{ fontWeight: 700, fontSize: 16, color: "#f0f0f0" }}>{step.title}</span>
                </div>
                <p style={{ fontSize: 14, color: "#666", lineHeight: 1.6, margin: 0 }}>{step.desc}</p>
              </div>
            </div>
          ))}
        </div>

        <div style={{ textAlign: "center", marginTop: 40 }}>
          <button className="btn-promo" onClick={goToCheckout} style={{ display: "inline-block" }}>
            Quero começar agora →
          </button>
        </div>
      </section>

      {/* ══════════════════════════════════════════════
          SEÇÃO: BENEFÍCIOS
      ══════════════════════════════════════════════ */}
      <section className="section" style={{ borderTop: "1px solid #111" }}>
        <div style={{ textAlign: "center", marginBottom: 48 }}>
          <span className="tag-green" style={{ marginBottom: 16, display: "inline-block" }}>Por que vale a pena</span>
          <h2 style={{ fontSize: "clamp(28px,4vw,42px)", fontWeight: 800, letterSpacing: -1, color: "#f0f0f0" }}>
            Você sai no lucro desde o primeiro mês
          </h2>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 16 }}>
          {[
            { icon: "📈", title: "Mais alcance", desc: "Com créditos de campanha você aparece para mais pessoas sem tirar dinheiro do bolso." },
            { icon: "⚡", title: "Mais campanhas", desc: "Crie e teste mais campanhas com a verba que você já pagou. Mais teste = mais resultado." },
            { icon: "🛡️", title: "Menor risco", desc: "O dinheiro que você investiu volta em crédito. O custo real cai quase pela metade." },
            { icon: "🎯", title: "Vantagem competitiva", desc: "Seus concorrentes pagam tráfego do próprio bolso. Você usa o crédito que a plataforma te deu." },
            { icon: "🔒", title: "Preço travado", desc: "Assinou anual? Seu preço não sobe mesmo que os planos sejam reajustados." },
            { icon: "🏆", title: "Suporte prioritário", desc: "Assinantes anuais têm prioridade no suporte e acesso a recursos beta antes de todo mundo." },
          ].map((b, i) => (
            <div key={i} className="card" style={{ textAlign: "center" }}>
              <div style={{ fontSize: 36, marginBottom: 12 }}>{b.icon}</div>
              <div style={{ fontWeight: 700, fontSize: 15, color: "#f0f0f0", marginBottom: 8 }}>{b.title}</div>
              <p style={{ fontSize: 13, color: "#666", lineHeight: 1.6, margin: 0 }}>{b.desc}</p>
            </div>
          ))}
        </div>

        <div style={{ textAlign: "center", marginTop: 40 }}>
          <button className="btn-promo" onClick={goToCheckout} style={{ display: "inline-block" }}>
            Ativar meu crédito agora ⚡
          </button>
        </div>
      </section>

      {/* ══════════════════════════════════════════════
          SEÇÃO: COMPARATIVO / ANCORAGEM
      ══════════════════════════════════════════════ */}
      <section className="section" style={{ borderTop: "1px solid #111" }}>
        <div style={{ textAlign: "center", marginBottom: 48 }}>
          <span className="tag-red" style={{ marginBottom: 16, display: "inline-block" }}>Antes que acabe</span>
          <h2 style={{ fontSize: "clamp(28px,4vw,42px)", fontWeight: 800, letterSpacing: -1, color: "#f0f0f0" }}>
            Quem entrar agora leva vantagem.<br />
            <span style={{ color: "#ff3b30" }}>Quem esperar paga mais caro.</span>
          </h2>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, maxWidth: 600, margin: "0 auto 40px" }}>
          {/* Coluna: agora */}
          <div style={{ background: "#0d1f12", border: "1.5px solid rgba(48,209,88,.4)", borderRadius: 20, padding: 28, textAlign: "center" }}>
            <div className="tag-green" style={{ marginBottom: 16 }}>AGORA</div>
            <div style={{ fontSize: 13, color: "#888", marginBottom: 8 }}>Plano anual Premium</div>
            <div style={{ fontSize: 36, fontWeight: 900, color: "#30d158", marginBottom: 4 }}>{R(annualTotal(197))}</div>
            <div style={{ fontSize: 12, color: "#30d158", marginBottom: 16 }}>+ {R(credit60(197))} em créditos</div>
            <div style={{ fontSize: 13, color: "#555" }}>Custo real efetivo:</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: "#f0f0f0" }}>{R(annualTotal(197) - credit60(197))}</div>
          </div>

          {/* Coluna: depois */}
          <div style={{ background: "#1a0a0a", border: "1.5px solid #ff3b3033", borderRadius: 20, padding: 28, textAlign: "center" }}>
            <div className="tag-red" style={{ marginBottom: 16 }}>DEPOIS</div>
            <div style={{ fontSize: 13, color: "#888", marginBottom: 8 }}>Plano anual Premium</div>
            <div style={{ fontSize: 36, fontWeight: 900, color: "#ff3b30", marginBottom: 4 }}>{R(annualTotal(197))}</div>
            <div style={{ fontSize: 12, color: "#ff3b30", marginBottom: 16 }}>sem créditos</div>
            <div style={{ fontSize: 13, color: "#555" }}>Custo real efetivo:</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: "#f0f0f0" }}>{R(annualTotal(197))}</div>
          </div>
        </div>

        <div className="card" style={{ border: "1px solid #ff3b3022", background: "#0f0505", maxWidth: 600, margin: "0 auto" }}>
          <p style={{ fontSize: 15, color: "#ff6b35", fontWeight: 700, marginBottom: 8 }}>⚠️ Após encerrar a promoção:</p>
          <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 8 }}>
            {[
              "O plano anual continua disponível — mas sem nenhum crédito",
              "Você paga o mesmo valor e não recebe nada de volta",
              "Quem entrou agora já estará rodando campanhas com crédito grátis",
              "Não haverá segunda chance com essa condição",
            ].map((t, i) => (
              <li key={i} style={{ fontSize: 14, color: "#888", display: "flex", gap: 10 }}>
                <span style={{ color: "#ff3b30", flexShrink: 0 }}>✕</span>{t}
              </li>
            ))}
          </ul>
        </div>

        <div style={{ textAlign: "center", marginTop: 40 }}>
          <button className="btn-promo" onClick={goToCheckout} style={{ display: "inline-block" }}>
            Não quero perder essa oportunidade →
          </button>
          <p style={{ fontSize: 12, color: "#444", marginTop: 12 }}>
            Cancele quando quiser · Pagamento seguro via Stripe
          </p>
        </div>
      </section>

      {/* ══════════════════════════════════════════════
          BANNERS INTERNOS
      ══════════════════════════════════════════════ */}
      <section style={{ padding: "0 24px 80px", maxWidth: 720, margin: "0 auto" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 12 }}>
          {[
            { text: "Ganhe 60% em crédito agora", emoji: "💰" },
            { text: "Ative seu bônus de campanha", emoji: "🎯" },
            { text: "Comece com vantagem no tráfego", emoji: "🚀" },
          ].map((b, i) => (
            <button key={i} onClick={goToCheckout} style={{
              background: "linear-gradient(135deg,#111,#1a2a1a)",
              border: "1px solid rgba(48,209,88,.25)",
              borderRadius: 14, padding: "18px 20px",
              cursor: "pointer", textAlign: "left",
              transition: "all .2s",
              display: "flex", alignItems: "center", gap: 12,
            }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = "rgba(48,209,88,.6)"; (e.currentTarget as HTMLElement).style.background = "linear-gradient(135deg,#141a14,#1a2a1a)"; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = "rgba(48,209,88,.25)"; (e.currentTarget as HTMLElement).style.background = "linear-gradient(135deg,#111,#1a2a1a)"; }}
            >
              <span style={{ fontSize: 28 }}>{b.emoji}</span>
              <span style={{ fontSize: 14, fontWeight: 700, color: "#30d158", lineHeight: 1.4 }}>{b.text} →</span>
            </button>
          ))}
        </div>
      </section>

      {/* ══════════════════════════════════════════════
          RODAPÉ
      ══════════════════════════════════════════════ */}
      <footer style={{
        borderTop: "1px solid #111",
        background: "#030303",
        padding: "60px 24px",
        textAlign: "center",
      }}>
        <div style={{ maxWidth: 600, margin: "0 auto" }}>
          <div style={{
            display: "inline-flex", alignItems: "center", gap: 8,
            background: "rgba(255,59,48,.1)", border: "1px solid rgba(255,59,48,.3)",
            borderRadius: 99, padding: "6px 16px", marginBottom: 24,
          }}>
            <span style={{ fontSize: 14, animation: "blink 1.4s infinite" }}>🔴</span>
            <span style={{ fontSize: 12, fontWeight: 700, color: "#ff6b35", textTransform: "uppercase", letterSpacing: 1 }}>
              Oferta encerra em {h}:{m}:{s}
            </span>
          </div>

          <h3 style={{ fontSize: "clamp(24px,4vw,36px)", fontWeight: 800, letterSpacing: -1, color: "#f0f0f0", marginBottom: 16 }}>
            Última chance de assinar com <span style={{ color: "#30d158" }}>60% de crédito</span>
          </h3>
          <p style={{ fontSize: 16, color: "#666", marginBottom: 32, lineHeight: 1.7 }}>
            Depois que essa campanha encerrar, o plano anual volta ao valor normal — sem crédito, sem bônus. Essa condição nunca mais vai se repetir.
          </p>

          <button className="btn-promo" onClick={goToCheckout} style={{ display: "inline-block", marginBottom: 16 }}>
            ⚡ Ativar 60% de crédito agora
          </button>

          <div style={{ display: "flex", justifyContent: "center", gap: 24, flexWrap: "wrap", marginTop: 32 }}>
            {["Pagamento seguro", "Cancele quando quiser", "Suporte em português"].map(t => (
              <div key={t} style={{ fontSize: 12, color: "#444", display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ color: "#30d158" }}>✓</span>{t}
              </div>
            ))}
          </div>

          <p style={{ fontSize: 12, color: "#333", marginTop: 32 }}>
            © 2025 MECPro · <a href="/terms" style={{ color: "#444", textDecoration: "none" }}>Termos</a> · <a href="/privacy" style={{ color: "#444", textDecoration: "none" }}>Privacidade</a>
          </p>
        </div>
      </footer>

      {/* ══════════════════════════════════════════════
          CTA FLUTUANTE
      ══════════════════════════════════════════════ */}
      <div style={{
        position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)",
        zIndex: 200, animation: "float 3s ease-in-out infinite",
        filter: "drop-shadow(0 8px 32px rgba(48,209,88,.4))",
      }}>
        <button onClick={goToCheckout} style={{
          background: "linear-gradient(135deg,#30d158,#248a3d)",
          color: "#fff", fontWeight: 800, fontSize: 15,
          padding: "14px 32px", borderRadius: 99, border: "none",
          cursor: "pointer", whiteSpace: "nowrap",
          display: "flex", alignItems: "center", gap: 10,
          boxShadow: "0 4px 32px rgba(48,209,88,.5)",
        }}>
          <span style={{ fontSize: 18 }}>⚡</span>
          Ativar 60% de crédito
          <span style={{
            background: "rgba(0,0,0,.25)", borderRadius: 99,
            fontSize: 11, fontWeight: 700, padding: "2px 8px",
          }}>
            {vagas} vagas
          </span>
        </button>
      </div>

    </div>
  );
}
