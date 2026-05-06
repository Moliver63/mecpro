import { useState, useEffect, useRef } from "react";
import { useSafeMutation } from "@/hooks/useSafeMutation";
import { useLocation } from "wouter";
import Layout from "@/components/layout/Layout";
import { trpc } from "@/lib/trpc";
import WhatsAppField from "@/components/WhatsAppField";

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
  // Suporte BrasilAPI (campos flat) e OpenCNPJ (campos nested)
  const cnaeDesc = data.cnae_fiscal_descricao                         // BrasilAPI
    || data.cnae_principal?.descricao                                 // OpenCNPJ
    || data.cnaes?.[0]?.descricao || "";
  const atividade = data.descricao_atividade_principal?.[0]?.text    // BrasilAPI
    || cnaeDesc;
  const city  = data.municipio                                        // BrasilAPI
    || data.estabelecimento?.municipio?.descricao || "";
  const state = data.uf                                               // BrasilAPI
    || data.estabelecimento?.estado?.sigla || "";
  const phone = data.ddd_telefone_1                                   // BrasilAPI
    || (data.estabelecimento?.ddd1 ? "(" + data.estabelecimento.ddd1 + ") " + data.estabelecimento.telefone1 : "");
  const email = data.email || "";

  // Detecta nicho pelo CNAE
  const c = cnaeDesc.toLowerCase();
  const nicheLabel =
    c.match(/imov|constru|incorpora/)            ? "Imóveis" :
    c.match(/saude|medic|clinica|odont|fisio|nutri/) ? "Saúde e Bem-estar" :
    c.match(/educa|ensino|curso|escola/)         ? "Educação" :
    c.match(/restaur|aliment|lanche|delivery|pizz/) ? "Alimentação e Delivery" :
    c.match(/vestuário|roupa|moda|calçado/)      ? "Moda e Varejo" :
    c.match(/tecnol|softw|inform|dados|ti |app/) ? "Tecnologia" :
    c.match(/beleza|estetica|cabel|cosmet/)      ? "Beleza e Estética" :
    c.match(/advog|juridic|direito/)             ? "Jurídico" :
    c.match(/financ|contab|credit|seguro/)       ? "Financeiro" :
    cnaeDesc.slice(0, 60);

  // Escopo pelo porte
  const porte = (data.porte || "").toUpperCase();
  const scope: "local"|"regional"|"national"|"global" =
    porte.includes("MEI") || porte.includes("MICRO") ? "local" :
    porte.includes("PEQUENA") ? "regional" : "national";

  const socialLinks = JSON.stringify({
    whatsapp: phone,
    ...(email ? { email } : {}),
  });

  return {
    companyName:    data.nome_fantasia || data.razao_social || "",
    niche:          nicheLabel,
    city,
    state,
    businessScope:  scope,
    websiteUrl:     email || "",
    socialLinks,
    productService: atividade || (cnaeDesc ? "Empresa atuando no segmento: " + cnaeDesc : ""),
    campaignObjective: "leads" as const,
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
  // tRPC mutation raw
  const upsertMutation = trpc.clientProfile.upsert.useMutation();

  // useSafeMutation — sem redirect, com invalidação de cache e re-sync do form
  const { execute: executeSave, loading: saving } = useSafeMutation(
    (input: any) => upsertMutation.mutateAsync(input),
    {
      invalidateKeys:  [refetch],
      successMessage:  "✓ Perfil salvo com sucesso!",
      onSuccess: () => {
        // Reset initialized para que useEffect re-sincronize o form com dados frescos
        initialized.current = false;
        setSaved(true);
        setTimeout(() => setSaved(false), 2500);
      },
      onError: (e: any) => {
        console.error("[ClientProfile] save error:", e?.message);
      },
    }
  );

  const [saved, setSaved]         = useState(false);
  const [form, setForm]           = useState<Record<string, any>>({});
  const [cnpjInput, setCnpjInput] = useState("");
  const [docType, setDocType]     = useState<"cnpj" | "cpf">("cnpj");
  const [lookupState, setLookup]  = useState<"idle" | "loading" | "ok" | "error">("idle");
  const [lookupMsg, setLookupMsg] = useState("");
  const [waPhone,   setWaPhone]   = useState("");
  const initialized               = useRef(false);

  // Sincroniza waPhone quando profile carrega
  useEffect(() => {
    if (profile?.socialLinks) {
      try {
        const s = JSON.parse(profile.socialLinks);
        if (s.whatsapp) setWaPhone(s.whatsapp);
      } catch {}
    }
  }, [profile?.socialLinks]);

  useEffect(() => {
    if (profile && !initialized.current) {
      initialized.current = true;
      setForm({ ...profile });
      try {
        const social = JSON.parse((profile as any).socialLinks || "{}");
        if (social.whatsapp) setWaPhone(social.whatsapp);
      } catch {}
    }
  }, [profile]); // re-runs when profile changes (e.g. after refetch post-save)

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
      // BrasilAPI — gratuita, sem auth, funciona do Render.com
      const res = await fetch("https://brasilapi.com.br/api/cnpj/v1/" + digits, {
        headers: { "User-Agent": "MecProAI/1.0" },
        signal: AbortSignal.timeout(10000),
      });
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
    // Converte null → undefined para campos string (Zod .nullish() aceita ambos)
    const stringFields = ["productName","productPrice","productDifferentials",
      "productProofPoints","productCTA","copyStructure",
      "targetAudience","mainPain","desiredTransformation",
      "uniqueValueProposition","mainObjections","websiteUrl","socialLinks",
      "businessScope","city","state","country","companyName","niche","productService"];
    const cleanForm: any = { ...form };
    for (const k of stringFields) {
      if (cleanForm[k] === null) cleanForm[k] = undefined;
    }
    executeSave({ projectId, ...cleanForm });
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
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: "var(--black)", display: "block", marginBottom: 6 }}>Ticket médio (R$)</label>
              <input className="input" type="number" placeholder="Ex: 500"
                value={(form as any).averageTicket ?? ""}
                onChange={e => set("averageTicket" as any, e.target.value === "" ? null : Number(e.target.value))}
                style={{ width: "100%" }} />
            </div>
          </div>

          {/* Escopo geográfico */}
          <div style={{ background: "white", border: "1px solid var(--border)", borderRadius: 16, padding: 24 }}>
            <p style={{ fontSize: 14, fontWeight: 800, color: "var(--navy)", marginBottom: 18, fontFamily: "var(--font-display)" }}>📍 Localização e Alcance</p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: "var(--black)", display: "block", marginBottom: 6 }}>Escopo do negócio</label>
                <select className="input" value={(form as any).businessScope ?? "local"} onChange={e => set("businessScope" as any, e.target.value)} style={{ width: "100%" }}>
                  <option value="local">🏠 Local — uma cidade/bairro</option>
                  <option value="regional">🗺️ Regional — estado ou região</option>
                  <option value="national">🇧🇷 Nacional — Brasil inteiro</option>
                  <option value="global">🌍 Global — internacional</option>
                </select>
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: "var(--black)", display: "block", marginBottom: 6 }}>Estado (UF)</label>
                <input className="input" placeholder="Ex: SC" maxLength={2}
                  value={(form as any).state ?? ""}
                  onChange={e => set("state" as any, e.target.value.toUpperCase())}
                  style={{ width: "100%" }} />
              </div>
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: "var(--black)", display: "block", marginBottom: 6 }}>Cidade principal</label>
              <input className="input" placeholder="Ex: Balneário Camboriú"
                value={(form as any).city ?? ""}
                onChange={e => set("city" as any, e.target.value)}
                style={{ width: "100%" }} />
            </div>
            <p style={{ fontSize: 11, color: "var(--muted)", marginTop: 10, margin: "10px 0 0" }}>
              💡 Negócios locais recebem copy com menção à cidade e targeting geográfico otimizado.
            </p>
          </div>

          <div style={{ background: "white", border: "1px solid var(--border)", borderRadius: 16, padding: 24 }}>
            <p style={{ fontSize: 14, fontWeight: 800, color: "var(--navy)", marginBottom: 18, fontFamily: "var(--font-display)" }}>🎯 Produto / Serviço</p>

            {/* NOVO: Nome do produto em destaque */}
            <div style={{ background: "#eff6ff", border: "2px solid #3b82f6", borderRadius: 12, padding: 16, marginBottom: 16 }}>
              <p style={{ fontSize: 11, fontWeight: 700, color: "#1d4ed8", margin: "0 0 10px" }}>
                📦 PRODUTO ANUNCIADO — este nome aparecerá em destaque nos anúncios
              </p>
              <Field label="Nome do produto / serviço anunciado *"
                placeholder="Ex: CEG Lofts, Curso Tráfego Pro, Clínica Dra. Ana..."
                value={(form as any).productName ?? ""}
                onChange={v => set("productName" as any, v)} />
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <Field label="Preço / Faixa de preço"
                  placeholder="Ex: R$ 997, a partir de R$ 200/mês, consulte"
                  value={(form as any).productPrice ?? ""}
                  onChange={v => set("productPrice" as any, v)} />
                <Field label="CTA principal preferido"
                  placeholder="Ex: Falar no WhatsApp, Garantir vaga, Ver imóvel"
                  value={(form as any).productCTA ?? ""}
                  onChange={v => set("productCTA" as any, v)} />
              </div>
            </div>

            <Field label="O que você vende?" required placeholder="Descreva seu produto ou serviço principal..." textarea
              value={form.productService ?? ""} onChange={v => set("productService", v)} />

            <Field label="3 diferenciais do produto" textarea
              placeholder="1. O único com garantia de X dias&#10;2. Resultado em Y semanas&#10;3. Sem contrato de fidelidade"
              value={(form as any).productDifferentials ?? ""}
              onChange={v => set("productDifferentials" as any, v)} />

            <Field label="Provas sociais / Resultados" textarea
              placeholder="Ex: +500 clientes, 92% de aprovação, R$ 2M em vendas, case: cliente X atingiu Y"
              value={(form as any).productProofPoints ?? ""}
              onChange={v => set("productProofPoints" as any, v)} />

            <Field label="Proposta única de valor" placeholder="O que te diferencia dos concorrentes?" textarea
              value={form.uniqueValueProposition ?? ""} onChange={v => set("uniqueValueProposition", v)} />

            {/* Estrutura narrativa preferida */}
            <div style={{ marginTop: 8 }}>
              <label style={{ fontSize: 12, fontWeight: 700, color: "var(--black)", display: "block", marginBottom: 6 }}>
                Estrutura de copy preferida
              </label>
              <select className="input"
                value={(form as any).copyStructure ?? "mixed"}
                onChange={e => set("copyStructure" as any, e.target.value)}
                style={{ width: "100%" }}>
                <option value="mixed">🔀 Mista — IA escolhe a melhor para cada criativo</option>
                <option value="AIDA">📢 AIDA — Atenção → Interesse → Desejo → Ação</option>
                <option value="PAS">🎯 PAS — Problema → Agitação → Solução</option>
                <option value="STORYTELLING">📖 Storytelling — narrativa emocional</option>
                <option value="CONTRASTE">⚡ Contraste — antes vs depois</option>
                <option value="URGENCIA">⏰ Urgência — escassez e prazo</option>
              </select>
              <p style={{ fontSize: 11, color: "var(--muted)", marginTop: 6 }}>
                💡 A estrutura escolhida será usada pela IA para gerar os textos dos anúncios.
              </p>
            </div>
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

            {/* Personas geradas automaticamente pela IA */}
            {(() => {
              try {
                const raw = (form as any).personas;
                if (!raw) return (
                  <div style={{ marginTop: 12, padding: "10px 14px", background: "#f8fafc", borderRadius: 10, border: "1px dashed var(--border)" }}>
                    <p style={{ fontSize: 12, color: "var(--muted)", margin: 0 }}>
                      🤖 Salve o perfil com público-alvo preenchido para a IA gerar 3 personas automaticamente.
                    </p>
                  </div>
                );
                const personas = JSON.parse(raw);
                if (!Array.isArray(personas) || personas.length === 0) return null;
                return (
                  <div style={{ marginTop: 16 }}>
                    <p style={{ fontSize: 12, fontWeight: 800, color: "var(--navy)", marginBottom: 10 }}>
                      🎭 Personas geradas pela IA
                    </p>
                    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                      {personas.map((p: any, i: number) => (
                        <div key={i} style={{ background: "#f0f9ff", border: "1px solid #bae6fd", borderRadius: 10, padding: "12px 14px" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                            <span style={{ fontSize: 18 }}>👤</span>
                            <div>
                              <p style={{ fontSize: 13, fontWeight: 800, color: "#0c4a6e", margin: 0 }}>{p.name}</p>
                              <p style={{ fontSize: 11, color: "#0369a1", margin: 0 }}>{p.age} · {p.occupation}</p>
                            </div>
                          </div>
                          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                            {[
                              { label: "😤 Dor", value: p.pain },
                              { label: "✨ Desejo", value: p.desire },
                              { label: "🛡️ Objeção", value: p.objection },
                              { label: "⚡ Gatilho", value: p.trigger },
                            ].map(({ label, value }) => value ? (
                              <div key={label} style={{ background: "white", borderRadius: 8, padding: "6px 8px" }}>
                                <p style={{ fontSize: 10, fontWeight: 700, color: "#0369a1", margin: "0 0 2px" }}>{label}</p>
                                <p style={{ fontSize: 11, color: "#0c4a6e", margin: 0, lineHeight: 1.4 }}>{value}</p>
                              </div>
                            ) : null)}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              } catch { return null; }
            })()}
          </div>
          <div style={{ background: "white", border: "1px solid var(--border)", borderRadius: 16, padding: 24 }}>
            <p style={{ fontSize: 14, fontWeight: 800, color: "var(--navy)", marginBottom: 18, fontFamily: "var(--font-display)" }}>🚧 Objeções & Contatos</p>
            <Field label="Principais objeções de compra" placeholder="Ex: Preço alto, não tenho tempo..." textarea
              value={form.mainObjections ?? ""} onChange={v => set("mainObjections", v)} />
            {/* WhatsApp dedicado para anúncios */}
            <div style={{ marginBottom: 16 }}>
              <WhatsAppField
                label="WhatsApp para Anúncios (Meta Ads)"
                value={waPhone}
                onChange={v => {
                  setWaPhone(v);
                  // Sincroniza automaticamente no socialLinks
                  try {
                    const social = JSON.parse(form.socialLinks || "{}");
                    social.whatsapp = v;
                    set("socialLinks", JSON.stringify(social));
                  } catch {
                    set("socialLinks", JSON.stringify({ whatsapp: v }));
                  }
                }}
                onSaved={(phone, waUrl) => {
                  setWaPhone(phone);
                  try {
                    const social = JSON.parse(form.socialLinks || "{}");
                    social.whatsapp = waUrl;
                    social.whatsappUrl = waUrl;
                    set("socialLinks", JSON.stringify(social));
                  } catch {
                    set("socialLinks", JSON.stringify({ whatsapp: waUrl, whatsappUrl: waUrl }));
                  }
                }}
              />
            </div>
            <Field label="Redes sociais / Contatos" placeholder="Ex: Instagram: @suaempresa · Site: https://..." textarea
              value={form.socialLinks ?? ""} onChange={v => set("socialLinks", v)} />
            <p style={{ fontSize: 11, color: "var(--muted)", marginTop: -10 }}>
              Dica: o WhatsApp acima é usado automaticamente como destino dos anúncios Meta.
            </p>
          </div>
        </div>
      </div>

      <div style={{ marginTop: 24, display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 14 }}>
        {saved && <span style={{ fontSize: 13, color: "var(--green-d)", fontWeight: 600 }}>✓ Salvo com sucesso!</span>}
        {upsertMutation.isError && <span style={{ fontSize: 13, color: "#dc2626" }}>Erro ao salvar. Tente novamente.</span>}
        <button className="btn btn-lg btn-green" onClick={handleSubmit} disabled={saving || upsertMutation.isPending}>
          {saving || upsertMutation.isPending ? "Salvando..." : profile ? "💾 Atualizar perfil" : "💾 Salvar perfil"}
        </button>
        {profile && (
          <div style={{
            background: "linear-gradient(135deg, var(--navy) 0%, #1a3a6e 100%)",
            borderRadius: 16, padding: "18px 24px", marginTop: 24,
            display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16,
          }}>
            <div>
              <p style={{ fontSize: 15, fontWeight: 700, color: "white", marginBottom: 4 }}>
                ◎ Perfil salvo! Próximo passo:
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
