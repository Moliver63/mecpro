import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import Layout from "@/components/layout/Layout";
import { trpc } from "@/lib/trpc";

const OBJECTIVES = [
  { value: "leads",      label: "Captação de leads" },
  { value: "sales",      label: "Vendas diretas" },
  { value: "branding",   label: "Branding / Alcance" },
  { value: "traffic",    label: "Tráfego para site" },
  { value: "engagement", label: "Engajamento" },
];

function formatCNPJ(v: string) {
  const d = v.replace(/\D/g, "").slice(0, 14);
  return d
    .replace(/^(\d{2})(\d)/, "$1.$2")
    .replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d)/, ".$1/$2")
    .replace(/(\d{4})(\d)/, "$1-$2");
}

function formatCPF(v: string) {
  const d = v.replace(/\D/g, "").slice(0, 11);
  return d
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d{1,2})$/, "$1-$2");
}

function mapCNPJToForm(data: any) {
  const niche = data.cnae_principal?.descricao || data.cnaes?.[0]?.descricao || "";
  const city  = data.estabelecimento?.municipio?.descricao || "";
  const state = data.estabelecimento?.estado?.sigla || "";
  const phone = data.estabelecimento?.ddd1 && data.estabelecimento?.telefone1
    ? "(" + data.estabelecimento.ddd1 + ") " + data.estabelecimento.telefone1 : "";
  return {
    companyName:       data.razao_social || data.nome_fantasia || "",
    niche:             niche.toLowerCase(),
    websiteUrl:        "",
    socialLinks:       phone ? JSON.stringify({ whatsapp: phone, city, state }) : "",
    productService:    niche ? "Empresa atuando no segmento: " + niche : "",
    campaignObjective: "leads",
  };
}

// Field declarado FORA do componente pai — evita remount a cada render
interface FieldProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  required?: boolean;
  textarea?: boolean;
  rows?: number;
}
function Field({ label, value, onChange, placeholder, required, textarea, rows = 3 }: FieldProps) {
  return (
    <div style={{ marginBottom: 18 }}>
      <label style={{ fontSize: 12, fontWeight: 700, color: "var(--black)", display: "block", marginBottom: 6 }}>
        {label} {required && <span style={{ color: "#ef4444" }}>*</span>}
      </label>
      {textarea ? (
        <textarea className="input" rows={rows} placeholder={placeholder} value={value}
          onChange={e => onChange(e.target.value)} style={{ width: "100%", resize: "vertical" }} />
      ) : (
        <input className="input" placeholder={placeholder} value={value}
          onChange={e => onChange(e.target.value)} style={{ width: "100%" }} />
      )}
    </div>
  );
}

export default function ClientProfile() {
  const [loc] = useLocation();
  const [, setLocation] = useLocation();
  const projectId = Number(loc.split("/projects/")[1]?.split("/")[0] || 0);

  const { data: profile, refetch } = trpc.clientProfile.get.useQuery({ projectId }, { enabled: !!projectId });
  const upsert = trpc.clientProfile.upsert.useMutation({
    onSuccess: () => { refetch(); setSaved(true); setTimeout(() => setSaved(false), 2500); }
  });

  const [saved, setSaved]         = useState(false);
  const [form, setForm]           = useState<Record<string, any>>({});
  const [cnpjInput, setCnpjInput] = useState("");
  const [docType, setDocType]     = useState<"cnpj" | "cpf">("cnpj");
  const [lookupState, setLookup]  = useState<"idle" | "loading" | "ok" | "error">("idle");
  const [lookupMsg, setLookupMsg] = useState("");
  const initialized               = useRef(false);

  useEffect(() => {
    if (profile && !initialized.current) {
      initialized.current = true;
      setForm({ ...profile });
    }
  }, [profile]);

  function set(k: string, v: any) {
    setForm(prev => ({ ...prev, [k]: v }));
  }

  async function handleLookup() {
    const digits = cnpjInput.replace(/\D/g, "");
    if (docType === "cpf") {
      setLookupMsg("Dados de CPF/pessoa física são limitados. Preencha manualmente.");
      return;
    }
    if (digits.length !== 14) { setLookupMsg("CNPJ inválido."); return; }
    setLookup("loading"); setLookupMsg("");
    try {
      const res = await fetch("https://api.opencnpj.org/" + digits);
      if (!res.ok) throw new Error();
      const data = await res.json();
      if (!data.cnpj) throw new Error();
      const mapped = mapCNPJToForm(data);
      setForm(prev => ({ ...prev, ...mapped }));
      setLookup("ok");
      setLookupMsg("✓ Dados de \"" + mapped.companyName + "\" importados! Revise e complemente.");
    } catch {
      setLookup("error");
      setLookupMsg("CNPJ não encontrado. Verifique o número ou preencha manualmente.");
    }
  }

  function handleSubmit() {
    if (!form.companyName || !form.niche || !form.productService) {
      alert("Preencha os campos obrigatórios: Empresa, Nicho e Produto/Serviço.");
      return;
    }
    upsert.mutate({ projectId, ...form });
  }

  const isValidDoc = docType === "cnpj"
    ? cnpjInput.replace(/\D/g, "").length === 14
    : cnpjInput.replace(/\D/g, "").length === 11;

  return (
    <Layout>
      <div style={{ marginBottom: 24 }}>
        <button className="btn btn-sm btn-ghost" onClick={() => setLocation("/projects/" + projectId)} style={{ paddingLeft: 0, marginBottom: 10 }}>← Projeto</button>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 40, height: 40, borderRadius: 12, background: "var(--green-l)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20 }}>👤</div>
          <div>
            <h1 style={{ fontFamily: "var(--font-display)", fontSize: 22, fontWeight: 800, color: "var(--black)", marginBottom: 2 }}>Perfil do Cliente</h1>
            <p style={{ fontSize: 13, color: "var(--muted)" }}>Módulo 1 — Dados estratégicos que alimentam toda a IA</p>
          </div>
        </div>
      </div>

      {/* Busca CNPJ */}
      <div style={{ background: "white", border: "1.5px solid var(--green-xl)", borderRadius: 16, padding: 22, marginBottom: 22 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
          <span style={{ fontSize: 20 }}>🔍</span>
          <div>
            <p style={{ fontSize: 14, fontWeight: 800, color: "var(--black)", fontFamily: "var(--font-display)" }}>Preenchimento automático</p>
            <p style={{ fontSize: 12, color: "var(--muted)" }}>Digite o CNPJ para importar dados da Receita Federal automaticamente</p>
          </div>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <div style={{ display: "flex", background: "var(--off)", borderRadius: 8, padding: 3, gap: 2 }}>
            {(["cnpj", "cpf"] as const).map(t => (
              <button key={t}
                onClick={() => { setDocType(t); setCnpjInput(""); setLookup("idle"); setLookupMsg(""); }}
                style={{ padding: "6px 14px", borderRadius: 6, border: "none", cursor: "pointer", fontSize: 12, fontWeight: 700, background: docType === t ? "var(--navy)" : "transparent", color: docType === t ? "white" : "var(--muted)" }}>
                {t.toUpperCase()}
              </button>
            ))}
          </div>
          <input className="input"
            placeholder={docType === "cnpj" ? "00.000.000/0001-00" : "000.000.000-00"}
            value={cnpjInput}
            onChange={e => {
              const raw = e.target.value.replace(/\D/g, "");
              setCnpjInput(docType === "cnpj" ? formatCNPJ(raw) : formatCPF(raw));
              setLookup("idle"); setLookupMsg("");
            }}
            onKeyDown={e => e.key === "Enter" && handleLookup()}
            style={{ width: 210, fontFamily: "monospace", letterSpacing: 1 }} />
          <button className="btn btn-md btn-green" onClick={handleLookup} disabled={lookupState === "loading" || !isValidDoc}>
            {lookupState === "loading" ? "⏳ Buscando..." : "🔍 Buscar"}
          </button>
        </div>
        {lookupMsg && (
          <div style={{ marginTop: 12, padding: "10px 14px", borderRadius: 10, fontSize: 13, fontWeight: 500,
            background: lookupState === "ok" ? "var(--green-l)" : lookupState === "error" ? "#fef2f2" : "#fef9c3",
            color:      lookupState === "ok" ? "var(--green-dk)" : lookupState === "error" ? "#dc2626" : "#713f12",
            border:     "1px solid " + (lookupState === "ok" ? "var(--green-xl)" : lookupState === "error" ? "#fecaca" : "#fde047") }}>
            {lookupMsg}
          </div>
        )}
      </div>

      {/* Formulário */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
        <div>
          <div style={{ background: "white", border: "1px solid var(--border)", borderRadius: 16, padding: 24, marginBottom: 16 }}>
            <p style={{ fontSize: 14, fontWeight: 800, color: "var(--navy)", marginBottom: 18, fontFamily: "var(--font-display)" }}>🏢 Empresa</p>
            <Field label="Nome da empresa" required placeholder="Ex: TechSolutions Ltda"
              value={form.companyName ?? ""} onChange={v => set("companyName", v)} />
            <Field label="Nicho de mercado" required placeholder="Ex: SaaS para PMEs, e-commerce de moda"
              value={form.niche ?? ""} onChange={v => set("niche", v)} />
            <Field label="Site" placeholder="https://..."
              value={form.websiteUrl ?? ""} onChange={v => set("websiteUrl", v)} />
            <div style={{ marginBottom: 18 }}>
              <label style={{ fontSize: 12, fontWeight: 700, color: "var(--black)", display: "block", marginBottom: 6 }}>Objetivo da campanha</label>
              <select className="input" value={form.campaignObjective ?? "leads"} onChange={e => set("campaignObjective", e.target.value)} style={{ width: "100%" }}>
                {OBJECTIVES.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: "var(--black)", display: "block", marginBottom: 6 }}>Orçamento mensal (R$)</label>
              <input className="input" type="number" placeholder="Ex: 3000"
                value={form.monthlyBudget ?? ""}
                onChange={e => set("monthlyBudget", e.target.value === "" ? null : Number(e.target.value))}
                style={{ width: "100%" }} />
            </div>
          </div>
          <div style={{ background: "white", border: "1px solid var(--border)", borderRadius: 16, padding: 24 }}>
            <p style={{ fontSize: 14, fontWeight: 800, color: "var(--navy)", marginBottom: 18, fontFamily: "var(--font-display)" }}>🎯 Produto / Serviço</p>
            <Field label="O que você vende?" required placeholder="Descreva seu produto ou serviço principal..." textarea
              value={form.productService ?? ""} onChange={v => set("productService", v)} />
            <Field label="Proposta única de valor" placeholder="O que te diferencia dos concorrentes?" textarea
              value={form.uniqueValueProposition ?? ""} onChange={v => set("uniqueValueProposition", v)} />
          </div>
        </div>

        <div>
          <div style={{ background: "white", border: "1px solid var(--border)", borderRadius: 16, padding: 24, marginBottom: 16 }}>
            <p style={{ fontSize: 14, fontWeight: 800, color: "var(--navy)", marginBottom: 18, fontFamily: "var(--font-display)" }}>👥 Público-alvo</p>
            <Field label="Quem é seu cliente ideal?" placeholder="Ex: Donos de PMEs, 30-50 anos..." textarea rows={4}
              value={form.targetAudience ?? ""} onChange={v => set("targetAudience", v)} />
            <Field label="Principal dor / problema" placeholder="Qual é a maior dor que você resolve?" textarea
              value={form.mainPain ?? ""} onChange={v => set("mainPain", v)} />
            <Field label="Transformação desejada" placeholder="Como a vida do cliente muda?" textarea
              value={form.desiredTransformation ?? ""} onChange={v => set("desiredTransformation", v)} />
          </div>
          <div style={{ background: "white", border: "1px solid var(--border)", borderRadius: 16, padding: 24 }}>
            <p style={{ fontSize: 14, fontWeight: 800, color: "var(--navy)", marginBottom: 18, fontFamily: "var(--font-display)" }}>🚧 Objeções & Contatos</p>
            <Field label="Principais objeções de compra" placeholder="Ex: Preço alto, não tenho tempo..." textarea
              value={form.mainObjections ?? ""} onChange={v => set("mainObjections", v)} />
            <Field label="Redes sociais / Contatos" placeholder="Ex: Instagram: @suaempresa · WhatsApp: (11) 99999-9999" textarea
              value={form.socialLinks ?? ""} onChange={v => set("socialLinks", v)} />
            <p style={{ fontSize: 11, color: "var(--muted)", marginTop: -10 }}>
              Dica: informe pelo menos um destino válido para publicação automática, como site, WhatsApp ou Instagram.
            </p>
          </div>
        </div>
      </div>

      <div style={{ marginTop: 24, display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 14 }}>
        {saved && <span style={{ fontSize: 13, color: "var(--green-d)", fontWeight: 600 }}>✓ Salvo com sucesso!</span>}
        {upsert.isError && <span style={{ fontSize: 13, color: "#dc2626" }}>Erro ao salvar. Tente novamente.</span>}
        <button className="btn btn-lg btn-green" onClick={handleSubmit} disabled={upsert.isLoading}>
          {upsert.isLoading ? "Salvando..." : profile ? "💾 Atualizar perfil" : "💾 Salvar perfil"}
        </button>
        {profile && (
          <div style={{
            background: "linear-gradient(135deg, var(--navy) 0%, #1a3a6e 100%)",
            borderRadius: 16, padding: "18px 24px", marginTop: 24,
            display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16,
          }}>
            <div>
              <p style={{ fontSize: 15, fontWeight: 700, color: "white", marginBottom: 4 }}>
                ✅ Perfil salvo! Próximo passo:
              </p>
              <p style={{ fontSize: 13, color: "rgba(255,255,255,.7)", lineHeight: 1.5 }}>
                Adicione os concorrentes para a IA ter dados reais para analisar.
              </p>
            </div>
            <button
              className="btn btn-green"
              style={{ whiteSpace: "nowrap", fontWeight: 700, fontSize: 14, padding: "12px 24px" }}
              onClick={() => setLocation(`/projects/${projectId}/competitors`)}
            >
              Ir para Módulo 2 →
            </button>
          </div>
        )}
      </div>
    </Layout>
  );
}
