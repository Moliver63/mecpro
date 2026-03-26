import { useState } from "react";
import Layout from "@/components/layout/Layout";

const MOCK = [
  { id: 1, name: "Acelerador de Agências",  courses: 4, students: 87,  price: 997,  status: "active"   },
  { id: 2, name: "Expert em Tráfego Pago",  courses: 3, students: 124, price: 597,  status: "active"   },
  { id: 3, name: "Mentoria VIP 2026",       courses: 6, students: 12,  price: 2997, status: "draft"    },
];

export default function AdminPrograms() {
  return (
    <Layout>
      <div style={{ marginBottom: 24, display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <h1 style={{ fontFamily: "var(--font-display)", fontSize: 24, fontWeight: 800, color: "var(--black)", marginBottom: 4 }}>Programas</h1>
          <p style={{ fontSize: 13, color: "var(--muted)" }}>Trilhas e programas de aprendizado</p>
        </div>
        <button className="btn btn-md btn-green" onClick={() => alert("Criador de programa em breve.")}>+ Novo programa</button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>
        {MOCK.map(p => (
          <div key={p.id} style={{ background: "white", border: "1px solid var(--border)", borderRadius: 14, padding: 22 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
              <span style={{ fontSize: 22 }}>🎓</span>
              <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 4, background: p.status === "active" ? "var(--green-xl)" : "#fef9c3", color: p.status === "active" ? "var(--green-dk)" : "#713f12" }}>
                {p.status === "active" ? "ATIVO" : "RASCUNHO"}
              </span>
            </div>
            <p style={{ fontSize: 15, fontWeight: 800, color: "var(--black)", fontFamily: "var(--font-display)", marginBottom: 12 }}>{p.name}</p>
            <div style={{ display: "flex", gap: 16, marginBottom: 14 }}>
              <div><p style={{ fontSize: 16, fontWeight: 800, color: "var(--black)" }}>{p.courses}</p><p style={{ fontSize: 11, color: "var(--muted)" }}>Cursos</p></div>
              <div><p style={{ fontSize: 16, fontWeight: 800, color: "var(--black)" }}>{p.students}</p><p style={{ fontSize: 11, color: "var(--muted)" }}>Alunos</p></div>
              <div><p style={{ fontSize: 16, fontWeight: 800, color: "var(--navy)" }}>R${p.price}</p><p style={{ fontSize: 11, color: "var(--muted)" }}>Preço</p></div>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button className="btn btn-sm btn-outline btn-full">Editar</button>
            </div>
          </div>
        ))}
      </div>
    </Layout>
  );
}
