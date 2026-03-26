import { useState } from "react";
import { useLocation } from "wouter";
import Layout from "@/components/layout/Layout";
import { useAuth } from "@/hooks/useAuth";

const MOCK_CERTS = [
  {
    id: "cert-001", course: "Relatórios e Métricas que Importam", completedAt: "10/03/2026",
    instructor: "Equipe MECPro", duration: "4h 30min", thumb: "📊",
    credentialId: "MEC-2026-001-ANALYTICS"
  },
];

export default function MyCertificates() {
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const [downloaded, setDownloaded] = useState<string | null>(null);

  function downloadCert(id: string, courseName: string) {
    setDownloaded(id);
    // Simula download
    const a = document.createElement("a");
    a.href = `data:text/plain;charset=utf-8,CERTIFICADO MECPro%0A%0A${user?.name ?? "Usuário"} concluiu o curso:%0A${courseName}`;
    a.download = `certificado-mecpro-${id}.txt`;
    a.click();
    setTimeout(() => setDownloaded(null), 2000);
  }

  return (
    <Layout>
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontFamily: "var(--font-display)", fontSize: 26, fontWeight: 800, color: "var(--black)", marginBottom: 4 }}>
          Meus Certificados
        </h1>
        <p style={{ fontSize: 14, color: "var(--muted)" }}>Certificados de conclusão dos seus cursos MECPro</p>
      </div>

      {MOCK_CERTS.length === 0 ? (
        /* Estado vazio */
        <div style={{ background: "white", border: "1px solid var(--border)", borderRadius: 20, padding: "60px 40px", textAlign: "center" }}>
          <div style={{ fontSize: 56, marginBottom: 16 }}>🏆</div>
          <h2 style={{ fontFamily: "var(--font-display)", fontSize: 20, fontWeight: 800, color: "var(--black)", marginBottom: 8 }}>
            Nenhum certificado ainda
          </h2>
          <p style={{ fontSize: 14, color: "var(--muted)", marginBottom: 24, lineHeight: 1.6, maxWidth: 400, margin: "0 auto 24px" }}>
            Conclua um curso para ganhar seu primeiro certificado. Os certificados comprovam seu conhecimento e podem ser compartilhados no LinkedIn.
          </p>
          <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
            <button className="btn btn-md btn-green" onClick={() => setLocation("/my-courses")}>Ver meus cursos</button>
            <button className="btn btn-md btn-outline" onClick={() => setLocation("/courses")}>Explorar cursos</button>
          </div>
        </div>
      ) : (
        <>
          {/* Stats */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14, marginBottom: 24 }}>
            {[
              { icon: "🏆", label: "Certificados obtidos", value: MOCK_CERTS.length, color: "#fef3c7" },
              { icon: "📚", label: "Cursos concluídos", value: MOCK_CERTS.length, color: "#f0fdf4" },
              { icon: "🔗", label: "Compartilhados", value: 0, color: "#eff6ff" },
            ].map(s => (
              <div key={s.label} style={{ background: "white", border: "1px solid var(--border)", borderRadius: 14, padding: "18px 20px" }}>
                <div style={{ width: 40, height: 40, borderRadius: 10, background: s.color, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, marginBottom: 10 }}>{s.icon}</div>
                <p style={{ fontFamily: "var(--font-display)", fontSize: 22, fontWeight: 800, color: "var(--black)", lineHeight: 1 }}>{s.value}</p>
                <p style={{ fontSize: 12, color: "var(--muted)", marginTop: 4 }}>{s.label}</p>
              </div>
            ))}
          </div>

          {/* Lista de certificados */}
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {MOCK_CERTS.map(cert => (
              <div key={cert.id} style={{
                background: "white", border: "2px solid var(--green)",
                borderRadius: 20, overflow: "hidden",
                boxShadow: "0 0 0 4px rgba(34,197,94,.06)"
              }}>
                {/* Banner do certificado */}
                <div style={{
                  background: "linear-gradient(135deg, #0f172a 0%, #1e3a5f 100%)",
                  padding: "28px 32px", color: "white", display: "flex", alignItems: "center", gap: 20
                }}>
                  <div style={{ fontSize: 48 }}>{cert.thumb}</div>
                  <div>
                    <p style={{ fontSize: 11, color: "#94a3b8", fontWeight: 700, letterSpacing: 1, marginBottom: 4 }}>
                      CERTIFICADO DE CONCLUSÃO
                    </p>
                    <p style={{ fontFamily: "var(--font-display)", fontSize: 20, fontWeight: 800, marginBottom: 4 }}>
                      {cert.course}
                    </p>
                    <p style={{ fontSize: 13, color: "#94a3b8" }}>
                      Concluído por <strong style={{ color: "white" }}>{user?.name ?? "Usuário"}</strong> em {cert.completedAt}
                    </p>
                  </div>
                  <div style={{ marginLeft: "auto", textAlign: "right" }}>
                    <div style={{
                      width: 60, height: 60, borderRadius: "50%",
                      background: "var(--green)", display: "flex", alignItems: "center",
                      justifyContent: "center", fontSize: 24
                    }}>
                      🏆
                    </div>
                  </div>
                </div>

                {/* Info do certificado */}
                <div style={{ padding: "20px 32px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <div style={{ display: "flex", gap: 24 }}>
                    <div>
                      <p style={{ fontSize: 11, color: "var(--muted)", fontWeight: 700, textTransform: "uppercase", letterSpacing: .5, marginBottom: 2 }}>Instrutor</p>
                      <p style={{ fontSize: 13, fontWeight: 600, color: "var(--dark)" }}>{cert.instructor}</p>
                    </div>
                    <div>
                      <p style={{ fontSize: 11, color: "var(--muted)", fontWeight: 700, textTransform: "uppercase", letterSpacing: .5, marginBottom: 2 }}>Duração</p>
                      <p style={{ fontSize: 13, fontWeight: 600, color: "var(--dark)" }}>{cert.duration}</p>
                    </div>
                    <div>
                      <p style={{ fontSize: 11, color: "var(--muted)", fontWeight: 700, textTransform: "uppercase", letterSpacing: .5, marginBottom: 2 }}>ID</p>
                      <p style={{ fontSize: 13, fontWeight: 600, color: "var(--dark)", fontFamily: "monospace" }}>{cert.credentialId}</p>
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 10 }}>
                    <button
                      className="btn btn-sm btn-green"
                      onClick={() => downloadCert(cert.id, cert.course)}
                    >
                      {downloaded === cert.id ? "✅ Baixado!" : "⬇️ Baixar PDF"}
                    </button>
                    <button
                      className="btn btn-sm btn-outline"
                      onClick={() => window.open(`https://www.linkedin.com/shareArticle?mini=true&url=https://mecpro.com.br/cert/${cert.id}&title=Certificado+MECPro`, "_blank")}
                    >
                      🔗 Compartilhar
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* CTA mais cursos */}
      <div style={{
        marginTop: 24, background: "var(--off)", borderRadius: 16,
        padding: "20px 24px", display: "flex", alignItems: "center", justifyContent: "space-between"
      }}>
        <div>
          <p style={{ fontSize: 14, fontWeight: 700, color: "var(--dark)", marginBottom: 3 }}>
            📚 Continue aprendendo
          </p>
          <p style={{ fontSize: 13, color: "var(--muted)" }}>
            Termine mais cursos para ganhar novos certificados.
          </p>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button className="btn btn-sm btn-green" onClick={() => setLocation("/my-courses")}>
            Meus cursos
          </button>
          <button className="btn btn-sm btn-outline" onClick={() => setLocation("/courses")}>
            Explorar catálogo
          </button>
        </div>
      </div>
    </Layout>
  );
}
