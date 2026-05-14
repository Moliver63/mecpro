import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";

// ── Planos ────────────────────────────────────────────────────────────────────
const PLANS = [
  { name: "Basic",   monthly: 97,  slug: "basic",   desc: "Para quem está começando",       color: "#2563eb" },
  { name: "Premium", monthly: 197, slug: "premium", desc: "O preferido das agências",       color: "#16a34a" },
  { name: "VIP",     monthly: 397, slug: "vip",     desc: "Para quem escala de verdade",    color: "#7c3aed" },
];

function annualPrice(monthly: number) { return Math.floor(monthly * 0.8); }   // 20% off
function annualTotal(monthly: number) { return annualPrice(monthly) * 12; }
function saving(monthly: number)      { return monthly * 12 - annualTotal(monthly); }
function pctOff(monthly: number)      { return Math.round((1 - annualPrice(monthly) / monthly) * 100); }

function R(v: number) { return `R$\u00a0${v.toLocaleString("pt-BR")}`; }

// ── Contador ──────────────────────────────────────────────────────────────────
function useCountdown(hours = 72) {
  const end = useRef(Date.now() + hours * 3600 * 1000);
  const [left, setLeft] = useState(end.current - Date.now());
  useEffect(() => {
    const id = setInterval(() => setLeft(Math.max(0, end.current - Date.now())), 1000);
    return () => clearInterval(id);
  }, []);
  const pad = (n: number) => String(Math.floor(n)).padStart(2, "0");
  return {
    h: pad(left / 3600000),
    m: pad((left % 3600000) / 60000),
    s: pad((left % 60000) / 1000),
  };
}

const TOTAL_VAGAS = 50;
const USADAS      = 37;

// ── Cores (mesma paleta da LandingNormal) ────────────────────────────────────
const GREEN   = "#16a34a";
const GREENBG = "#f0fdf4";
const DARK    = "#111827";
const MUTED   = "#6b7280";
const BORDER  = "#e5e7eb";
const BG      = "#ffffff";
const OFFBG   = "#f9fafb";

const FEATURES = [
  { icon: "01", t: "Perfil do Cliente",       d: "Mapeie dores, desejos e objeções com profundidade estratégica." },
  { icon: "02", t: "Análise de Concorrentes", d: "Monitore anúncios ativos via Meta Ads Library em tempo real." },
  { icon: "03", t: "Inteligência de Mercado", d: "A IA revela gaps, oportunidades e posicionamento ideal." },
  { icon: "04", t: "Campanha Automática",     d: "Ad sets, copy, orçamento e funil prontos para publicar." },
  { icon: "05", t: "Relatórios PDF e XLSX",   d: "Documentos profissionais para clientes ou implementação." },
  { icon: "06", t: "Meta, Google e TikTok",   d: "Publique direto do MECProAI sem copiar e colar." },
];

export default function PromoAnual() {
  const [, setLocation] = useLocation();
  const [planIdx, setPlanIdx] = useState(1);
  const { h, m, s } = useCountdown(72);
  const vagas = TOTAL_VAGAS - USADAS;
  const pct   = Math.round((USADAS / TOTAL_VAGAS) * 100);

  const plan = PLANS[planIdx];
  const goToCheckout = () => setLocation("/pricing");

  return (
    <div style={{ minHeight: "100vh", background: BG, color: DARK,
      fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
      overflowX: "hidden" }}>

      <style>{`
        * { box-sizing: border-box; }
        body { margin: 0; padding: 0; }
        @keyframes fadeUp { from{opacity:0;transform:translateY(20px)} to{opacity:1;transform:translateY(0)} }
        @keyframes pulse  { 0%,100%{box-shadow:0 0 0 0 rgba(22,163,74,.35)} 50%{box-shadow:0 0 0 10px rgba(22,163,74,0)} }
        @keyframes blink  { 0%,100%{opacity:1} 50%{opacity:.4} }
        @keyframes float  { 0%,100%{transform:translateX(-50%) translateY(0)} 50%{transform:translateX(-50%) translateY(-5px)} }
        .lfu  { animation: fadeUp .6s ease both; }
        .lfu1 { animation-delay:.1s } .lfu2 { animation-delay:.2s } .lfu3 { animation-delay:.32s }
        .lhover { transition: all .18s; }
        .lhover:hover { transform: translateY(-2px); box-shadow: 0 8px 24px rgba(0,0,0,.09)!important; }
        .btn-primary {
          background: ${GREEN}; color: #fff; font-weight: 700; font-size: 15px;
          padding: 14px 32px; border: none; border-radius: 10px; cursor: pointer;
          box-shadow: 0 4px 16px rgba(22,163,74,.3); animation: pulse 2.5s infinite;
          transition: filter .15s; width: 100%; max-width: 480px;
        }
        .btn-primary:hover { filter: brightness(.93); }
        .btn-sec {
          background: transparent; color: ${DARK}; border: 1px solid ${BORDER};
          font-weight: 600; font-size: 14px; padding: 12px 28px; border-radius: 10px;
          cursor: pointer; transition: all .15s;
        }
        .btn-sec:hover { background: ${OFFBG}; }
        .tag-green { display:inline-block; background:${GREENBG}; color:${GREEN}; font-size:11px; font-weight:700;
          padding:4px 12px; border-radius:99px; border:1px solid #bbf7d0; letter-spacing:.5px; text-transform:uppercase; }
        .tag-red { display:inline-block; background:#fef2f2; color:#dc2626; font-size:11px; font-weight:700;
          padding:4px 12px; border-radius:99px; border:1px solid #fecaca; letter-spacing:.5px; }
        .ticker { font-variant-numeric: tabular-nums; }
        @media(max-width:680px){
          .lg3{ grid-template-columns:1fr!important }
          .hero h1{ font-size:clamp(32px,9vw,52px)!important }
          .section{ padding:64px 20px!important }
          .plan-grid{ grid-template-columns:1fr!important }
        }
      `}</style>

      {/* ── NAV ── */}
      <nav style={{ position:"sticky", top:0, zIndex:100, height:64,
        background:"rgba(255,255,255,.97)", backdropFilter:"blur(12px)",
        borderBottom:`1px solid ${BORDER}` }}>
        <div style={{ maxWidth:1080, margin:"0 auto", padding:"0 24px", height:"100%",
          display:"flex", alignItems:"center", justifyContent:"space-between" }}>
          <a href="/" style={{ textDecoration:"none" }}>
            <img src="/logo-512.png" alt="MECProAI" height={42} style={{ display:"block", borderRadius:10 }}/>
          </a>
          <div style={{ display:"flex", alignItems:"center", gap:8 }}>
            <div style={{ display:"flex", alignItems:"center", gap:6, background:"#fef2f2",
              border:"1px solid #fecaca", borderRadius:99, padding:"5px 14px" }}>
              <span style={{ animation:"blink 1.4s infinite", fontSize:10 }}>🔴</span>
              <span className="ticker" style={{ fontSize:12, fontWeight:700, color:"#dc2626" }}>
                Oferta encerra em {h}:{m}:{s}
              </span>
            </div>
            <button onClick={goToCheckout} className="btn-primary"
              style={{ width:"auto", maxWidth:"none", padding:"9px 20px", fontSize:13, animation:"none",
                boxShadow:"0 2px 8px rgba(22,163,74,.3)" }}>
              Assinar anual →
            </button>
          </div>
        </div>
      </nav>

      {/* ── BANNER ── */}
      <div style={{ background:`linear-gradient(90deg,${GREEN},#15803d)`,
        textAlign:"center", padding:"10px 16px", fontSize:13, fontWeight:700, color:"#fff",
        display:"flex", alignItems:"center", justifyContent:"center", gap:10, flexWrap:"wrap" }}>
        🎁 OFERTA ESPECIAL — Assine o plano anual e economize até {R(saving(397))} + 20% de desconto em todos os planos
      </div>

      {/* ── HERO ── */}
      <header className="section hero" style={{ padding:"80px 24px 72px", textAlign:"center",
        maxWidth:760, margin:"0 auto" }}>
        <div className="lfu">
          <span className="tag-green" style={{ marginBottom:24 }}>Oferta exclusiva · Tempo limitado</span>
        </div>
        <h1 className="lfu lfu1" style={{ fontSize:"clamp(36px,5.5vw,60px)", fontWeight:800,
          lineHeight:1.1, letterSpacing:"-1.5px", marginBottom:20, color:DARK }}>
          Assine anual e pague<br/>
          <span style={{ color:GREEN }}>20% menos em todos os planos</span>
        </h1>
        <p className="lfu lfu2" style={{ fontSize:17, color:MUTED, maxWidth:520, margin:"0 auto 40px",
          lineHeight:1.7 }}>
          Economize de {R(saving(97))} a {R(saving(397))} por ano. Trave seu preço agora e não pague reajuste. Cancele quando quiser.
        </p>

        {/* Countdown */}
        <div className="lfu lfu2" style={{ display:"inline-flex", gap:12, marginBottom:40,
          background:OFFBG, border:`1px solid ${BORDER}`, borderRadius:16, padding:"16px 28px" }}>
          {[{ v:h, l:"horas" }, { v:m, l:"minutos" }, { v:s, l:"segundos" }].map((t, i) => (
            <div key={i} style={{ textAlign:"center", minWidth:52 }}>
              <div className="ticker" style={{ fontSize:36, fontWeight:800, color:DARK, lineHeight:1 }}>{t.v}</div>
              <div style={{ fontSize:11, color:MUTED, marginTop:4 }}>{t.l}</div>
            </div>
          ))}
        </div>

        {/* Vagas */}
        <div className="lfu lfu3" style={{ maxWidth:480, margin:"0 auto 40px",
          background:OFFBG, border:`1px solid ${BORDER}`, borderRadius:14, padding:"14px 20px" }}>
          <div style={{ display:"flex", justifyContent:"space-between", marginBottom:8 }}>
            <span style={{ fontSize:13, fontWeight:600, color:DARK }}>🔥 Vagas com desconto</span>
            <span className="tag-red">{vagas} restantes</span>
          </div>
          <div style={{ background:BORDER, borderRadius:99, height:8, overflow:"hidden" }}>
            <div style={{ width:`${pct}%`, height:"100%", borderRadius:99,
              background:"linear-gradient(90deg,#f97316,#dc2626)", transition:"width 1s" }}/>
          </div>
          <p style={{ fontSize:11, color:MUTED, margin:"8px 0 0" }}>{USADAS} de {TOTAL_VAGAS} vagas preenchidas</p>
        </div>

        <div className="lfu lfu3" style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:10 }}>
          <button className="btn-primary" onClick={goToCheckout} style={{ display:"block" }}>
            ⚡ Ver planos e assinar agora
          </button>
          <p style={{ fontSize:13, color:"#9ca3af", margin:0 }}>
            Sem cartão de crédito para criar conta · Cancele quando quiser
          </p>
        </div>
      </header>

      {/* ── PLANOS COM DESCONTO ── */}
      <section id="planos" style={{ background:OFFBG, borderTop:`1px solid ${BORDER}`,
        borderBottom:`1px solid ${BORDER}`, padding:"80px 24px" }}>
        <div style={{ maxWidth:1080, margin:"0 auto" }}>
          <div style={{ textAlign:"center", marginBottom:48 }}>
            <span className="tag-green" style={{ marginBottom:16 }}>Preços anuais</span>
            <h2 style={{ fontSize:"clamp(26px,3.5vw,40px)", fontWeight:800, letterSpacing:"-1px",
              color:DARK, marginBottom:10, lineHeight:1.2 }}>
              Escolha seu plano anual
            </h2>
            <p style={{ fontSize:15, color:MUTED }}>
              Todos com 20% de desconto. Economize meses inteiros comparado ao mensal.
            </p>
          </div>

          <div className="plan-grid" style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:16 }}>
            {PLANS.map((p, i) => {
              const annual  = annualPrice(p.monthly);
              const total   = annualTotal(p.monthly);
              const economy = saving(p.monthly);
              const pct_off = pctOff(p.monthly);
              const isPop   = p.slug === "premium";
              return (
                <article key={p.slug} className="lhover" style={{
                  background:BG, border: isPop ? `2px solid ${GREEN}` : `1px solid ${BORDER}`,
                  borderRadius:20, padding:"28px 24px", position:"relative",
                  boxShadow: isPop ? "0 4px 24px rgba(22,163,74,.12)" : "0 1px 4px rgba(0,0,0,.04)",
                }}>
                  {isPop && (
                    <div style={{ position:"absolute", top:-12, left:"50%", transform:"translateX(-50%)",
                      background:GREEN, color:"#fff", fontSize:10, fontWeight:700,
                      padding:"4px 14px", borderRadius:99, whiteSpace:"nowrap" }}>
                      ⭐ Mais popular
                    </div>
                  )}

                  {/* Header */}
                  <div style={{ marginBottom:20 }}>
                    <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:4 }}>
                      <span style={{ fontSize:12, fontWeight:700, color:MUTED, textTransform:"uppercase", letterSpacing:".5px" }}>
                        {p.name}
                      </span>
                      <span style={{ background: isPop ? GREENBG : OFFBG,
                        color: isPop ? GREEN : MUTED, fontSize:11, fontWeight:800,
                        padding:"3px 10px", borderRadius:99, border:`1px solid ${isPop ? "#bbf7d0" : BORDER}` }}>
                        -{pct_off}% OFF
                      </span>
                    </div>
                    <p style={{ fontSize:12, color:MUTED, margin:0 }}>{p.desc}</p>
                  </div>

                  {/* Preço riscado + novo */}
                  <div style={{ marginBottom:6 }}>
                    <span style={{ fontSize:13, color:"#9ca3af", textDecoration:"line-through" }}>
                      {R(p.monthly)}/mês
                    </span>
                  </div>
                  <div style={{ display:"flex", alignItems:"baseline", gap:2, marginBottom:4 }}>
                    <span style={{ fontSize:13, color:MUTED }}>R$</span>
                    <span style={{ fontSize:48, fontWeight:800, color: isPop ? GREEN : DARK,
                      letterSpacing:"-2px", lineHeight:1 }}>
                      {annual}
                    </span>
                    <span style={{ fontSize:13, color:MUTED }}>/mês</span>
                  </div>
                  <div style={{ fontSize:12, color:MUTED, marginBottom:4 }}>
                    cobrado anualmente · {R(total)}/ano
                  </div>
                  <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:24 }}>
                    <span style={{ color:GREEN, fontWeight:700, fontSize:13 }}>✓</span>
                    <span style={{ fontSize:13, fontWeight:700, color:GREEN }}>
                      Você economiza {R(economy)} por ano
                    </span>
                  </div>

                  {/* Features */}
                  <div style={{ marginBottom:24 }}>
                    {(p.slug === "basic" ? [
                      "3 projetos ativos",
                      "5 concorrentes/projeto",
                      "10 campanhas/mês",
                      "Academy gratuita incluída",
                      "Suporte por e-mail",
                    ] : p.slug === "premium" ? [
                      "10 projetos ativos",
                      "Concorrentes ilimitados",
                      "Campanhas ilimitadas",
                      "Academy completa + certificados",
                      "Relatórios PDF e XLSX",
                      "Suporte prioritário",
                    ] : [
                      "Projetos ilimitados",
                      "Tudo do Premium",
                      "Academy VIP + mentoria",
                      "API access",
                      "Manager dedicado",
                      "Onboarding personalizado",
                    ]).map(f => (
                      <div key={f} style={{ display:"flex", gap:8, fontSize:13, color:DARK,
                        marginBottom:10, alignItems:"flex-start" }}>
                        <span style={{ color:GREEN, fontWeight:700, flexShrink:0 }}>✓</span>{f}
                      </div>
                    ))}
                  </div>

                  <button onClick={goToCheckout}
                    style={{ width:"100%", background: isPop ? GREEN : "transparent",
                      color: isPop ? "#fff" : DARK,
                      border: isPop ? "none" : `1px solid ${BORDER}`,
                      borderRadius:10, padding:"12px 0", fontSize:13, fontWeight:700, cursor:"pointer",
                      boxShadow: isPop ? "0 4px 14px rgba(22,163,74,.3)" : "none",
                      transition:"all .15s" }}>
                    Assinar {p.name} anual
                  </button>
                </article>
              );
            })}
          </div>

          <p style={{ textAlign:"center", fontSize:13, color:MUTED, marginTop:20 }}>
            Não tem certeza? <a href="/register" style={{ color:GREEN, fontWeight:600 }}>Comece grátis</a> sem cartão de crédito.
          </p>
        </div>
      </section>

      {/* ── CALCULADORA ── */}
      <section style={{ padding:"80px 24px", maxWidth:760, margin:"0 auto" }}>
        <div style={{ textAlign:"center", marginBottom:40 }}>
          <span className="tag-green" style={{ marginBottom:16 }}>Calcule sua economia</span>
          <h2 style={{ fontSize:"clamp(26px,3.5vw,38px)", fontWeight:800, letterSpacing:"-1px",
            color:DARK, lineHeight:1.2 }}>
            Quanto você vai economizar?
          </h2>
        </div>

        {/* Seletor de plano */}
        <div style={{ display:"flex", gap:8, marginBottom:28, justifyContent:"center" }}>
          {PLANS.map((p, i) => (
            <button key={p.slug} onClick={() => setPlanIdx(i)} style={{
              flex:1, maxWidth:160, padding:"10px 12px", borderRadius:10,
              border: `2px solid ${planIdx === i ? p.color : BORDER}`,
              background: planIdx === i ? p.color + "12" : "transparent",
              color: planIdx === i ? p.color : MUTED,
              fontWeight:700, fontSize:14, cursor:"pointer", transition:"all .15s",
            }}>
              {p.name}
            </button>
          ))}
        </div>

        {/* Cards de cálculo */}
        <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:12, marginBottom:20 }}>
          {[
            { label:"Preço mensal original", value: R(plan.monthly) + "/mês",  sub:"sem desconto", highlight:false },
            { label:"Preço anual",           value: R(annualPrice(plan.monthly)) + "/mês", sub: R(annualTotal(plan.monthly)) + " à vista", highlight:true },
            { label:"Você economiza",        value: R(saving(plan.monthly)) + "/ano", sub:`${pctOff(plan.monthly)}% de desconto`, highlight:false },
          ].map((c, i) => (
            <div key={i} style={{
              background: c.highlight ? GREENBG : OFFBG,
              border: `1px solid ${c.highlight ? "#bbf7d0" : BORDER}`,
              borderRadius:14, padding:"18px 16px", textAlign:"center",
            }}>
              <div style={{ fontSize:11, color: c.highlight ? GREEN : MUTED, marginBottom:6, fontWeight:600 }}>
                {c.label}
              </div>
              <div style={{ fontSize:22, fontWeight:800,
                color: c.highlight ? GREEN : DARK, lineHeight:1, marginBottom:4 }}>
                {c.value}
              </div>
              <div style={{ fontSize:11, color: c.highlight ? GREEN : "#9ca3af" }}>{c.sub}</div>
            </div>
          ))}
        </div>

        <div style={{ textAlign:"center", marginTop:32 }}>
          <button className="btn-primary" onClick={goToCheckout} style={{ display:"inline-block" }}>
            Assinar {plan.name} anual — Economize {R(saving(plan.monthly))}
          </button>
        </div>
      </section>

      {/* ── PLATAFORMA ── */}
      <section style={{ background:OFFBG, borderTop:`1px solid ${BORDER}`,
        borderBottom:`1px solid ${BORDER}`, padding:"80px 24px" }}>
        <div style={{ maxWidth:1080, margin:"0 auto" }}>
          <div style={{ marginBottom:48 }}>
            <span className="tag-green" style={{ marginBottom:12 }}>Plataforma</span>
            <h2 style={{ fontSize:"clamp(26px,3.5vw,40px)", fontWeight:800, letterSpacing:"-1px",
              color:DARK, marginBottom:12, lineHeight:1.2 }}>
              4 módulos. 1 campanha pronta.
            </h2>
            <p style={{ fontSize:15, color:MUTED, maxWidth:480, lineHeight:1.7 }}>
              Cada módulo alimenta o próximo. A IA pensa a campanha por você.
            </p>
          </div>
          <div className="lg3" style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)",
            gap:1, background:BORDER, borderRadius:16, overflow:"hidden", border:`1px solid ${BORDER}` }}>
            {FEATURES.map(f => (
              <article key={f.icon} className="lhover"
                style={{ background:BG, padding:"24px 20px",
                  borderBottom:`1px solid ${BORDER}`, borderRight:`1px solid ${BORDER}`, cursor:"default" }}>
                <div style={{ fontSize:11, fontWeight:800, color:GREEN, marginBottom:8, letterSpacing:".5px" }}>{f.icon}</div>
                <h3 style={{ fontSize:14, fontWeight:700, color:DARK, marginBottom:6 }}>{f.t}</h3>
                <p style={{ fontSize:12, color:MUTED, lineHeight:1.6, margin:0 }}>{f.d}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* ── COMPARATIVO MENSAL VS ANUAL ── */}
      <section style={{ padding:"80px 24px", maxWidth:760, margin:"0 auto" }}>
        <div style={{ textAlign:"center", marginBottom:40 }}>
          <span className="tag-red" style={{ marginBottom:16 }}>Antes que acabe</span>
          <h2 style={{ fontSize:"clamp(24px,3.5vw,38px)", fontWeight:800, letterSpacing:"-1px",
            color:DARK, lineHeight:1.2 }}>
            Mensal ou anual? <span style={{ color:GREEN }}>Veja a diferença.</span>
          </h2>
        </div>

        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, maxWidth:600, margin:"0 auto 40px" }}>
          <div style={{ background:OFFBG, border:`1px solid ${BORDER}`,
            borderRadius:18, padding:"28px 24px", textAlign:"center" }}>
            <div style={{ fontSize:12, fontWeight:700, color:MUTED, marginBottom:16,
              textTransform:"uppercase", letterSpacing:".5px" }}>Plano Mensal</div>
            {PLANS.map(p => (
              <div key={p.slug} style={{ display:"flex", justifyContent:"space-between",
                padding:"8px 0", borderBottom:`1px solid ${BORDER}`, fontSize:13 }}>
                <span style={{ color:MUTED }}>{p.name}</span>
                <span style={{ fontWeight:700, color:DARK }}>{R(p.monthly)}/mês</span>
              </div>
            ))}
            <p style={{ fontSize:11, color:"#9ca3af", marginTop:12 }}>cobrado mês a mês</p>
          </div>

          <div style={{ background:GREENBG, border:`1.5px solid #bbf7d0`,
            borderRadius:18, padding:"28px 24px", textAlign:"center", position:"relative" }}>
            <div style={{ position:"absolute", top:-10, left:"50%", transform:"translateX(-50%)",
              background:GREEN, color:"#fff", fontSize:10, fontWeight:700,
              padding:"3px 12px", borderRadius:99, whiteSpace:"nowrap" }}>
              MELHOR OPÇÃO
            </div>
            <div style={{ fontSize:12, fontWeight:700, color:GREEN, marginBottom:16,
              textTransform:"uppercase", letterSpacing:".5px" }}>Plano Anual</div>
            {PLANS.map(p => (
              <div key={p.slug} style={{ display:"flex", justifyContent:"space-between",
                padding:"8px 0", borderBottom:"1px solid #bbf7d0", fontSize:13 }}>
                <span style={{ color:GREEN }}>{p.name}</span>
                <div style={{ textAlign:"right" }}>
                  <span style={{ fontWeight:800, color:GREEN }}>{R(annualPrice(p.monthly))}/mês</span>
                  <span style={{ fontSize:10, color:"#86efac", marginLeft:6 }}>
                    -{pctOff(p.monthly)}%
                  </span>
                </div>
              </div>
            ))}
            <p style={{ fontSize:11, color:GREEN, marginTop:12, fontWeight:600 }}>cobrado anualmente · trave seu preço</p>
          </div>
        </div>

        <div style={{ textAlign:"center" }}>
          <button className="btn-primary" onClick={goToCheckout} style={{ display:"inline-block" }}>
            Quero o desconto anual →
          </button>
          <p style={{ fontSize:12, color:MUTED, marginTop:12 }}>
            Cancele quando quiser · Pagamento seguro
          </p>
        </div>
      </section>

      {/* ── COMO FUNCIONA ── */}
      <section style={{ background:OFFBG, borderTop:`1px solid ${BORDER}`,
        borderBottom:`1px solid ${BORDER}`, padding:"80px 24px" }}>
        <div style={{ maxWidth:1080, margin:"0 auto" }}>
          <div style={{ textAlign:"center", marginBottom:48 }}>
            <span className="tag-green" style={{ marginBottom:12 }}>Como funciona</span>
            <h2 style={{ fontSize:"clamp(26px,3.5vw,38px)", fontWeight:800, letterSpacing:"-1px",
              color:DARK, lineHeight:1.2 }}>
              Simples e sem burocracia
            </h2>
          </div>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:20 }}>
            {[
              { n:"1", c:"#16a34a", t:"Escolha seu plano anual", d:"Basic, Premium ou VIP com 20% de desconto automático já aplicado." },
              { n:"2", c:"#2563eb", t:"Pague e acesse na hora",  d:"Acesso imediato à plataforma completa. Sem espera, sem aprovação manual." },
              { n:"3", c:"#7c3aed", t:"Crie campanhas com IA",  d:"Perfil do cliente, análise de concorrentes e campanha pronta em minutos." },
            ].map(s => (
              <div key={s.n} style={{ background:BG, borderRadius:14, padding:"28px 24px",
                border:`1px solid ${BORDER}`, borderTop:`3px solid ${s.c}` }}>
                <div style={{ width:36, height:36, borderRadius:10, background:s.c + "18",
                  display:"flex", alignItems:"center", justifyContent:"center", marginBottom:14 }}>
                  <span style={{ fontWeight:800, fontSize:15, color:s.c }}>{s.n}</span>
                </div>
                <h3 style={{ fontSize:15, fontWeight:700, color:DARK, marginBottom:8 }}>{s.t}</h3>
                <p style={{ fontSize:13, color:MUTED, lineHeight:1.65, margin:0 }}>{s.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── BENEFÍCIOS ── */}
      <section style={{ padding:"80px 24px", maxWidth:1080, margin:"0 auto" }}>
        <div style={{ textAlign:"center", marginBottom:48 }}>
          <span className="tag-green" style={{ marginBottom:12 }}>Por que vale a pena</span>
          <h2 style={{ fontSize:"clamp(26px,3.5vw,38px)", fontWeight:800, letterSpacing:"-1px",
            color:DARK, lineHeight:1.2 }}>
            Você sai no lucro desde o dia 1
          </h2>
        </div>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(200px,1fr))", gap:16 }}>
          {[
            { icon:"📈", t:"Mais testes",          d:"Campanhas ilimitadas no Premium. Teste mais variações sem custo extra." },
            { icon:"⚡", t:"Tudo em um lugar",      d:"Meta, Google e TikTok integrados. Publique com 1 clique sem trocar de ferramenta." },
            { icon:"🛡️", t:"Preço travado",         d:"Assinou anual? Seu preço não sobe mesmo que os planos sejam reajustados." },
            { icon:"🎯", t:"IA com contexto local", d:"Prompts em português com benchmarks BR. Não é IA genérica — é para o seu mercado." },
            { icon:"🎓", t:"Academy inclusa",       d:"Mini cursos em todos os planos. Do básico ao avançado, tudo dentro da plataforma." },
            { icon:"🏆", t:"Suporte em PT",         d:"Equipe brasileira. Suporte em português sem tradução automática nem espera eterna." },
          ].map((b, i) => (
            <div key={i} className="lhover" style={{ background:OFFBG, border:`1px solid ${BORDER}`,
              borderRadius:14, padding:"24px 20px", textAlign:"center",
              boxShadow:"0 1px 4px rgba(0,0,0,.04)" }}>
              <div style={{ fontSize:32, marginBottom:12 }}>{b.icon}</div>
              <div style={{ fontWeight:700, fontSize:15, color:DARK, marginBottom:8 }}>{b.t}</div>
              <p style={{ fontSize:13, color:MUTED, lineHeight:1.6, margin:0 }}>{b.d}</p>
            </div>
          ))}
        </div>
        <div style={{ textAlign:"center", marginTop:40 }}>
          <button className="btn-primary" onClick={goToCheckout} style={{ display:"inline-block" }}>
            Começar com desconto agora ⚡
          </button>
        </div>
      </section>

      {/* ── CTA FINAL ── */}
      <section style={{ padding:"0 24px 72px" }}>
        <div style={{ background:`linear-gradient(135deg,${GREENBG},#eff6ff)`,
          border:`1px solid #bbf7d0`, borderRadius:20, maxWidth:1080, margin:"0 auto",
          padding:"64px 48px", textAlign:"center" }}>
          <span className="tag-green" style={{ marginBottom:20 }}>Oferta encerra em {h}:{m}:{s}</span>
          <h2 style={{ fontSize:"clamp(26px,3.5vw,44px)", fontWeight:800, letterSpacing:"-1px",
            color:DARK, marginBottom:12, lineHeight:1.15 }}>
            Pronto para pagar menos e fazer mais?
          </h2>
          <p style={{ fontSize:15, color:MUTED, marginBottom:32, maxWidth:500, margin:"0 auto 32px" }}>
            Assine qualquer plano anual e garanta 20% de desconto imediato. Sem complicação, sem pegadinha.
          </p>
          <div style={{ display:"flex", gap:12, justifyContent:"center", flexWrap:"wrap" }}>
            <button className="btn-primary" onClick={goToCheckout}
              style={{ display:"inline-block", animation:"none",
                boxShadow:"0 4px 16px rgba(22,163,74,.3)" }}>
              Ver planos com desconto
            </button>
            <button className="btn-sec" onClick={() => setLocation("/register")}>
              Criar conta grátis
            </button>
          </div>
          <div style={{ display:"flex", justifyContent:"center", gap:24,
            flexWrap:"wrap", marginTop:24 }}>
            {["Pagamento seguro", "Cancele quando quiser", "Suporte em português"].map(t => (
              <div key={t} style={{ fontSize:12, color:MUTED, display:"flex", alignItems:"center", gap:6 }}>
                <span style={{ color:GREEN, fontWeight:700 }}>✓</span>{t}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer style={{ borderTop:`1px solid ${BORDER}`, padding:"28px 24px" }}>
        <div style={{ maxWidth:1080, margin:"0 auto",
          display:"flex", alignItems:"center", justifyContent:"space-between", flexWrap:"wrap", gap:16 }}>
          <a href="/" style={{ textDecoration:"none" }}>
            <img src="/logo-512.png" alt="MECProAI" height={38} style={{ display:"block", borderRadius:8 }}/>
          </a>
          <nav style={{ display:"flex", gap:18, flexWrap:"wrap" }}>
            {[
              { l:"Plataforma", h:"/#plataforma" }, { l:"Academy",    h:"/courses" },
              { l:"Preços",     h:"/#planos" },      { l:"Termos",     h:"/terms" },
              { l:"Privacidade",h:"/privacy" },      { l:"Contato",    h:"/contact" },
            ].map(x => (
              <a key={x.l} href={x.h} style={{ fontSize:12, color:"#9ca3af", textDecoration:"none" }}>{x.l}</a>
            ))}
          </nav>
          <span style={{ fontSize:12, color:"#9ca3af" }}>© 2026 MECProAI</span>
        </div>
      </footer>

      {/* ── CTA FLUTUANTE ── */}
      <div style={{ position:"fixed", bottom:24, left:"50%", transform:"translateX(-50%)",
        zIndex:200, animation:"float 3s ease-in-out infinite",
        filter:"drop-shadow(0 6px 24px rgba(22,163,74,.35))" }}>
        <button onClick={goToCheckout} style={{
          background:GREEN, color:"#fff", fontWeight:700, fontSize:14,
          padding:"12px 28px", borderRadius:99, border:"none", cursor:"pointer",
          whiteSpace:"nowrap", display:"flex", alignItems:"center", gap:10,
          boxShadow:"0 4px 24px rgba(22,163,74,.4)",
        }}>
          ⚡ Assinar com 20% OFF
          <span style={{ background:"rgba(255,255,255,.2)", borderRadius:99,
            fontSize:11, fontWeight:700, padding:"2px 8px" }}>
            {vagas} vagas
          </span>
        </button>
      </div>

    </div>
  );
}
