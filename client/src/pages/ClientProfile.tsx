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
  // ── Campos básicos ─────────────────────────────────────────────────────────
  const cnaeDesc  = data.cnae_fiscal_descricao || data.cnae_principal?.descricao || data.cnaes?.[0]?.descricao || "";
  const atividade = data.descricao_atividade_principal?.[0]?.text || cnaeDesc;
  const city      = data.municipio  || data.estabelecimento?.municipio?.descricao || "";
  const state     = data.uf         || data.estabelecimento?.estado?.sigla        || "";
  const phone1    = data.ddd_telefone_1 || (data.estabelecimento?.ddd1 ? "(" + data.estabelecimento.ddd1 + ") " + data.estabelecimento.telefone1 : "");
  const phone2    = data.ddd_telefone_2 || "";
  const email     = data.email || "";
  const website   = data.website || "";  // website ≠ email
  const nomeFantasia = (data.nome_fantasia || "").trim();
  const razaoSocial  = (data.razao_social  || "").trim();

  // ── Situação cadastral — alerta se inativa ─────────────────────────────────
  const situacao = (data.descricao_situacao_cadastral || data.situacao_cadastral || "").toUpperCase();
  const isAtiva  = !situacao || situacao.includes("ATIVA") || situacao === "";

  // ── Detecção de nicho pelo CNAE ─────────────────────────────────────────────
  const c = cnaeDesc.toLowerCase();
  const nicheLabel =
    c.match(/imov|constru|incorpora|loteamen/)          ? "Imóveis" :
    c.match(/saude|medic|clinica|odont|fisio|nutri|farm/)? "Saúde e Bem-estar" :
    c.match(/educa|ensino|curso|escola|treinamento/)     ? "Educação" :
    c.match(/restaur|aliment|lanche|delivery|pizz|bar/)  ? "Alimentação e Delivery" :
    c.match(/vestuário|roupa|moda|calçado|confec/)       ? "Moda e Varejo" :
    c.match(/tecnol|softw|inform|dados|ti |app|digital/) ? "Tecnologia" :
    c.match(/beleza|estetica|cabel|cosmet|spa/)          ? "Beleza e Estética" :
    c.match(/advog|juridic|direito|tabelion/)            ? "Jurídico" :
    c.match(/financ|contab|credit|seguro|invest/)        ? "Financeiro" :
    c.match(/transpor|logist|fretes|mudança/)            ? "Transporte e Logística" :
    c.match(/turismo|hotel|pousada|viagem/)              ? "Turismo e Hospitalidade" :
    c.match(/pet|animal|veterin/)                        ? "Pet Shop e Veterinário" :
    c.match(/auto|veicul|carros|oficina|mecanica/)       ? "Automotivo" :
    c.match(/agro|agricul|pecuaria|fazenda/)             ? "Agronegócio" :
    cnaeDesc.slice(0, 60);

  // ── Porte e escopo ─────────────────────────────────────────────────────────
  const porte = (data.porte || "").toUpperCase();
  const scope: "local"|"regional"|"national"|"global" =
    porte.includes("MEI") || porte.includes("MICRO") ? "local" :
    porte.includes("PEQUENA") ? "regional" :
    porte.includes("MÉDIA") || porte.includes("MEDIA") ? "national" : "national";

  // ── Capital social → sugestão de budget ──────────────────────────────────
  const capitalSocial = Number(data.capital_social || 0);
  const budgetHint = capitalSocial > 1_000_000 ? "R$ 5.000 a R$ 20.000/mês" :
                     capitalSocial > 100_000    ? "R$ 1.500 a R$ 5.000/mês"  :
                     capitalSocial > 10_000     ? "R$ 500 a R$ 1.500/mês"    : "";

  // ── Número de funcionários ─────────────────────────────────────────────────
  const numFuncionarios = data.numero_funcionarios || 0;
  const porteSocial = numFuncionarios > 100 ? "grande empresa" :
                      numFuncionarios > 20  ? "empresa de médio porte" :
                      numFuncionarios > 5   ? "empresa de pequeno porte" : "";

  // ── Anos de mercado ────────────────────────────────────────────────────────
  const anosDeAtividade = (() => {
    if (!data.data_inicio_atividade) return 0;
    const inicio = new Date(data.data_inicio_atividade);
    return Math.floor((Date.now() - inicio.getTime()) / (1000 * 60 * 60 * 24 * 365));
  })();

  // ── Sócios (até 3) ─────────────────────────────────────────────────────────
  const socios = (data.qsa || []).slice(0, 3)
    .map((s: any) => s.nome_socio || s.nome_representante || "")
    .filter(Boolean);
  const socioNome = socios[0] || "";

  // ── Atividades secundárias (até 3) ─────────────────────────────────────────
  const cnaesSecundarios = (data.cnaes_secundarios || [])
    .slice(0, 3)
    .map((cn: any) => cn.descricao || "")
    .filter(Boolean);

  // ── Endereço ───────────────────────────────────────────────────────────────
  const bairro     = data.bairro     || "";
  const logradouro = data.logradouro ? `${data.logradouro}, ${data.numero || "s/n"}` : "";
  const cep        = data.cep        || "";

  // ── Natureza jurídica → tom de copy ───────────────────────────────────────
  const natureza = (data.descricao_natureza_juridica || data.natureza_juridica || "").toLowerCase();
  const copyStructure = natureza.includes("mei") || natureza.includes("individual") ? "emotional"
    : natureza.includes("anônima") || natureza.includes("s/a") ? "rational" : "mixed";

  // ── Provas sociais (automáticas) ───────────────────────────────────────────
  const proofParts: string[] = [];
  if (anosDeAtividade >= 1) proofParts.push(`${anosDeAtividade} anos de mercado`);
  if (socioNome)             proofParts.push(`Fundada por ${socioNome}`);
  if (numFuncionarios > 0)   proofParts.push(`${numFuncionarios} funcionários`);
  if (porteSocial)           proofParts.push(porteSocial);

  // ── Público-alvo automático ────────────────────────────────────────────────
  const targetAudienceHint = nicheLabel !== cnaeDesc.slice(0, 60)
    ? `Consumidores de ${nicheLabel.toLowerCase()} em ${city || "sua região"}`
    : "";

  // ── Diferenciais do produto (automáticos) ──────────────────────────────────
  const diffParts: string[] = [];
  if (cnaesSecundarios.length) diffParts.push("Atuação em: " + cnaesSecundarios.join("; "));
  if (anosDeAtividade >= 3)    diffParts.push(`${anosDeAtividade} anos de experiência`);
  if (budgetHint)              diffParts.push(`Empresa de ${budgetHint.includes("5.000") ? "grande" : "médio"} porte`);

  // ── socialLinks ───────────────────────────────────────────────────────────
  const socialLinksObj: Record<string, string> = {};
  if (phone1)     socialLinksObj.whatsapp  = phone1;
  if (phone2)     socialLinksObj.telefone2 = phone2;
  if (email)      socialLinksObj.email     = email;
  if (bairro)     socialLinksObj.bairro    = bairro;
  if (cep)        socialLinksObj.cep       = cep;
  if (logradouro) socialLinksObj.endereco  = logradouro;

  return {
    // ── Campos principais ──────────────────────────────────────────────────
    companyName:    nomeFantasia || razaoSocial || "",
    niche:          nicheLabel,
    city,
    state,
    businessScope:  scope,
    productService: atividade || (cnaeDesc ? "Empresa atuando em: " + cnaeDesc : ""),
    campaignObjective: "leads" as const,
    copyStructure,
    // ── Website e contatos (CORRIGIDO: email ≠ websiteUrl) ─────────────────
    websiteUrl:     website || "",   // só URL real, não email
    socialLinks:    JSON.stringify(socialLinksObj),
    // ── Produto ───────────────────────────────────────────────────────────
    ...(nomeFantasia && nomeFantasia !== razaoSocial ? { productName: nomeFantasia } : {}),
    ...(diffParts.length ? { productDifferentials: diffParts.join(" · ") } : {}),
    // ── Provas sociais ────────────────────────────────────────────────────
    ...(proofParts.length ? { productProofPoints: proofParts.join(" · ") } : {}),
    // ── Público-alvo ──────────────────────────────────────────────────────
    ...(targetAudienceHint ? { targetAudience: targetAudienceHint } : {}),
    // ── Ticket médio estimado pelo capital social ──────────────────────────
    ...(capitalSocial > 0 ? { averageTicket: Math.round(capitalSocial / 1000) } : {}),
    // ── Situação cadastral ────────────────────────────────────────────────
    _situacaoCadastral: situacao,
    _isAtiva: isAtiva,
    _socios: socios,
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
  const [cnpjResult, setCnpjResult] = useState<any>(null);
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
      let data: any = null;

      // Fonte 1: BrasilAPI — mais completa (capital_social, qsa, cnaes_secundarios)
      try {
        const r1 = await fetch("https://brasilapi.com.br/api/cnpj/v1/" + digits, {
          headers: { "User-Agent": "MecProAI/1.0" },
          signal: AbortSignal.timeout(10000),
        });
        if (r1.ok) { const d = await r1.json(); if (d.cnpj) data = d; }
      } catch { /* tenta próxima */ }

      // Fonte 2: ReceitaWS — fallback gratuito
      if (!data) {
        try {
          const r2 = await fetch("https://www.receitaws.com.br/v1/cnpj/" + digits, {
            signal: AbortSignal.timeout(10000),
          });
          if (r2.ok) {
            const d = await r2.json();
            if (d.status !== "ERROR") {
              data = {
                cnpj: digits,
                razao_social: d.nome,
                nome_fantasia: d.fantasia,
                cnae_fiscal_descricao: d.atividade_principal?.[0]?.text || "",
                cnaes_secundarios: (d.atividades_secundarias || []).map((a: any) => ({ descricao: a.text })),
                municipio: d.municipio,
                uf: d.uf,
                bairro: d.bairro,
                logradouro: d.logradouro,
                numero: d.numero,
                cep: d.cep,
                email: d.email,
                ddd_telefone_1: d.telefone,
                porte: d.porte,
                capital_social: parseFloat((d.capital_social || "0").replace(/[^0-9.,]/g, "").replace(",", ".")),
                data_inicio_atividade: d.abertura ? d.abertura.split("/").reverse().join("-") : "",
                descricao_situacao_cadastral: d.situacao,
                descricao_natureza_juridica: d.natureza_juridica,
                qsa: (d.qsa || []).map((s: any) => ({ nome_socio: s.nome })),
              };
            }
          }
        } catch { /* sem dados */ }
      }

      if (!data) {
        setLookup("error");
        setLookupMsg("CNPJ não encontrado nas bases da Receita Federal. Verifique o número ou preencha manualmente.");
        return;
      }

      const mapped = mapCNPJToForm(data);
      const { _situacaoCadastral, _isAtiva, _socios, ...cleanMapped } = mapped as any;
      setForm(prev => ({ ...prev, ...cleanMapped }));
      setCnpjResult(data);

      if (!_isAtiva && _situacaoCadastral) {
        setLookup("error");
        setLookupMsg("⚠️ CNPJ com situação: \"" + _situacaoCadastral + "\". Dados importados — verifique antes de prosseguir.");
      } else {
        setLookup("ok");
        const socios = (_socios || []).join(", ");
        setLookupMsg("✓ " + cleanMapped.companyName + " importado com sucesso!" +
          (socios ? " Sócio: " + socios + "." : "") +
          " Revise e complemente os campos abaixo.");
      }
    } catch {
      setLookup("error");
      setLookupMsg("Erro ao consultar CNPJ. Verifique sua conexão ou preencha manualmente.");
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
        {/* Prévia dos campos preenchidos automaticamente */}
        {lookupState === "ok" && cnpjResult && (
          <div style={{ marginTop: 12, background: "white", border: "1px solid var(--green-xl)", borderRadius: 12, padding: "12px 14px" }}>
            <p style={{ fontSize: 11, fontWeight: 800, color: "var(--green-dk)", marginBottom: 10, textTransform: "uppercase", letterSpacing: 0.5 }}>
              ✅ Campos preenchidos automaticamente:
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
              {[
                { label: "🏢 Empresa",     value: cnpjResult.companyName },
                { label: "🎯 Nicho",       value: cnpjResult.niche },
                { label: "📍 Cidade/UF",   value: cnpjResult.city && cnpjResult.state ? `${cnpjResult.city}/${cnpjResult.state}` : "" },
                { label: "📦 Produto",     value: cnpjResult.productName },
                { label: "⭐ Prova social",value: cnpjResult.proofPoints },
                { label: "📞 Telefone",    value: cnpjResult.phone },
                { label: "📅 Mercado",     value: cnpjResult.yearsActive ? `${cnpjResult.yearsActive} anos` : "" },
                { label: "👤 Sócio",       value: cnpjResult.socioName },
                { label: "📊 Porte",       value: cnpjResult.porte },
                { label: "🗺️ Bairro",      value: cnpjResult.bairro },
              ].filter(({ value }) => value).map(({ label, value }) => (
                <div key={label} style={{ background: "var(--green-l)", borderRadius: 8, padding: "6px 10px" }}>
                  <p style={{ fontSize: 10, color: "var(--green-dk)", fontWeight: 700, margin: "0 0 1px" }}>{label}</p>
                  <p style={{ fontSize: 11, color: "var(--black)", margin: 0 }}>{String(value).slice(0, 35)}</p>
                </div>
              ))}
            </div>
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
