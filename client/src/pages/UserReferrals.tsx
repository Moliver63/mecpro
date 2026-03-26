import { useState } from "react";
import { useLocation } from "wouter";
import Layout from "@/components/layout/Layout";
import { useAuth } from "@/hooks/useAuth";

export default function UserReferrals() {
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const [copied, setCopied] = useState(false);

  const referralCode = `MECPRO-${((user as any)?.id ?? "USER")}`.toUpperCase();
  const referralLink = `https://mecpro.com.br/register?ref=${referralCode}`;

  function copyLink() {
    navigator.clipboard?.writeText(referralLink).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const mockReferrals = [
    { name: "João S.", plan: "Premium", date: "15/03/2026", reward: "R$ 30", status: "paid" },
    { name: "Maria L.", plan: "Basic", date: "10/03/2026", reward: "R$ 15", status: "paid" },
    { name: "Carlos M.", plan: "VIP", date: "02/03/2026", reward: "R$ 60", status: "pending" },
  ];

  const totalEarned = mockReferrals.filter(r => r.status === "paid").reduce((acc, r) => acc + parseFloat(r.reward.replace("R$ ", "")), 0);

  return (
    <Layout>
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontFamily: "var(--font-display)", fontSize: 26, fontWeight: 800, color: "var(--black)", marginBottom: 4 }}>
          Programa de Indicações
        </h1>
        <p style={{ fontSize: 14, color: "var(--muted)" }}>Indique amigos e ganhe recompensas por cada assinatura</p>
      </div>

      {/* Banner de ganhos */}
      <div style={{
        background: "linear-gradient(135deg, #0f172a 0%, #1e3a5f 100%)",
        borderRadius: 20, padding: "28px 32px", marginBottom: 24, color: "white",
        display: "flex", alignItems: "center", justifyContent: "space-between"
      }}>
        <div>
          <p style={{ fontSize: 12, color: "#94a3b8", marginBottom: 4, fontWeight: 600 }}>TOTAL GANHO</p>
          <p style={{ fontFamily: "var(--font-display)", fontSize: 40, fontWeight: 900 }}>
            R$ {totalEarned},00
          </p>
          <p style={{ fontSize: 13, color: "#94a3b8", marginTop: 4 }}>{mockReferrals.length} indicações realizadas</p>
        </div>
        <div style={{ textAlign: "right" }}>
          <p style={{ fontSize: 12, color: "#94a3b8", marginBottom: 8 }}>Comissões por plano</p>
          {[
            { plan: "Basic", value: "R$ 15" },
            { plan: "Premium", value: "R$ 30" },
            { plan: "VIP", value: "R$ 60" },
          ].map(c => (
            <div key={c.plan} style={{ display: "flex", justifyContent: "space-between", gap: 20, marginBottom: 4 }}>
              <span style={{ fontSize: 12, color: "#cbd5e1" }}>{c.plan}</span>
              <span style={{ fontSize: 12, color: "var(--green)", fontWeight: 700 }}>{c.value}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Código de indicação */}
      <div style={{ background: "white", border: "1px solid var(--border)", borderRadius: 16, padding: 24, marginBottom: 24 }}>
        <h2 style={{ fontFamily: "var(--font-display)", fontSize: 16, fontWeight: 700, color: "var(--black)", marginBottom: 16 }}>
          🔗 Seu link de indicação
        </h2>
        <div style={{ display: "flex", gap: 10 }}>
          <div style={{
            flex: 1, background: "var(--off)", border: "1px solid var(--border)",
            borderRadius: 10, padding: "12px 16px", fontSize: 13, color: "var(--body)",
            fontFamily: "monospace", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap"
          }}>
            {referralLink}
          </div>
          <button className="btn btn-md btn-green" onClick={copyLink} style={{ flexShrink: 0 }}>
            {copied ? "✅ Copiado!" : "📋 Copiar"}
          </button>
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
          <div style={{
            background: "var(--green-l)", border: "1px solid var(--green-xl)",
            borderRadius: 8, padding: "8px 16px", fontSize: 12, color: "var(--green-dk)", fontWeight: 600
          }}>
            Código: {referralCode}
          </div>
        </div>
        <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
          <button
            className="btn btn-sm btn-outline"
            onClick={() => window.open(`https://wa.me/?text=Conheça o MECPro, plataforma de marketing com IA! Use meu link: ${referralLink}`, "_blank")}
          >
            📱 Compartilhar no WhatsApp
          </button>
          <button
            className="btn btn-sm btn-outline"
            onClick={() => window.open(`mailto:?subject=Convite MECPro&body=Olá! Conheça o MECPro: ${referralLink}`, "_blank")}
          >
            📧 Enviar por e-mail
          </button>
        </div>
      </div>

      {/* Como funciona */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14, marginBottom: 24 }}>
        {[
          { step: "1", icon: "🔗", title: "Compartilhe seu link", desc: "Envie seu link único para amigos e contatos." },
          { step: "2", icon: "✅", title: "Eles se cadastram", desc: "Seu amigo cria uma conta usando seu link." },
          { step: "3", icon: "💰", title: "Você ganha comissão", desc: "Receba até R$ 60 por cada assinatura paga." },
        ].map(s => (
          <div key={s.step} style={{
            background: "white", border: "1px solid var(--border)", borderRadius: 14,
            padding: 20, textAlign: "center"
          }}>
            <div style={{
              width: 40, height: 40, borderRadius: "50%", background: "var(--black)",
              color: "white", fontFamily: "var(--font-display)", fontSize: 16, fontWeight: 800,
              display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 10px"
            }}>
              {s.step}
            </div>
            <div style={{ fontSize: 24, marginBottom: 8 }}>{s.icon}</div>
            <p style={{ fontSize: 13, fontWeight: 700, color: "var(--dark)", marginBottom: 4 }}>{s.title}</p>
            <p style={{ fontSize: 12, color: "var(--muted)", lineHeight: 1.5 }}>{s.desc}</p>
          </div>
        ))}
      </div>

      {/* Histórico */}
      <div style={{ background: "white", border: "1px solid var(--border)", borderRadius: 16, overflow: "hidden" }}>
        <div style={{ padding: "16px 24px", borderBottom: "1px solid var(--border)" }}>
          <h2 style={{ fontFamily: "var(--font-display)", fontSize: 15, fontWeight: 700, color: "var(--black)" }}>
            Histórico de indicações
          </h2>
        </div>
        {mockReferrals.length === 0 ? (
          <div style={{ padding: 48, textAlign: "center" }}>
            <div style={{ fontSize: 36, marginBottom: 10 }}>👥</div>
            <p style={{ fontSize: 13, color: "var(--muted)" }}>Nenhuma indicação ainda. Compartilhe seu link!</p>
          </div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "var(--off)" }}>
                {["Indicado", "Plano", "Data", "Comissão", "Status"].map(h => (
                  <th key={h} style={{ padding: "10px 20px", textAlign: "left", fontSize: 11, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: .5 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {mockReferrals.map((r, i) => (
                <tr key={i} style={{ borderBottom: "1px solid var(--border)" }}>
                  <td style={{ padding: "12px 20px", fontSize: 13, color: "var(--dark)", fontWeight: 500 }}>{r.name}</td>
                  <td style={{ padding: "12px 20px" }}>
                    <span className="badge badge-navy" style={{ fontSize: 10 }}>{r.plan}</span>
                  </td>
                  <td style={{ padding: "12px 20px", fontSize: 13, color: "var(--muted)" }}>{r.date}</td>
                  <td style={{ padding: "12px 20px", fontSize: 13, fontWeight: 700, color: "var(--green-dk)" }}>{r.reward}</td>
                  <td style={{ padding: "12px 20px" }}>
                    <span className={`badge ${r.status === "paid" ? "badge-green" : "badge-gray"}`} style={{ fontSize: 10 }}>
                      {r.status === "paid" ? "✅ Pago" : "⏳ Pendente"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </Layout>
  );
}
