type FactSource = Record<string, unknown>;

export type CampaignFactConflict = {
  field: string;
  value: string;
  reason: string;
};

export type CampaignFacts = {
  verifiedFacts: string[];
  allowedInferences: string[];
  forbiddenClaims: string[];
  realEstate: {
    purpose?: string;
    propertyType?: string;
    areaM2?: string;
    price?: string;
    address?: string;
    bedrooms?: string;
    suites?: string;
    bathrooms?: string;
    parkingSpots?: string;
    floors?: string;
    furnished?: string;
    includedFees?: string;
    structuralFeatures: string[];
    usagePossibilities: string[];
  };
};

export type CampaignFactValidation = {
  status: "passed" | "failed";
  verifiedFactsCount: number;
  conflicts: CampaignFactConflict[];
};

function normalizeText(value: unknown): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function compactText(value: unknown): string {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function unique(values: string[]): string[] {
  return [...new Set(values.map(compactText).filter(Boolean))];
}

function firstMatch(text: string, patterns: RegExp[]): string | undefined {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[0]) return compactText(match[0]);
  }
  return undefined;
}

function has(text: string, pattern: RegExp): boolean {
  return pattern.test(text);
}

function sourceText(input: FactSource, profile: FactSource): string {
  return [
    input?.["name"],
    input?.["extraContext"],
    profile?.["companyName"],
    profile?.["niche"],
    profile?.["productName"],
    profile?.["productService"],
    profile?.["productPrice"],
    profile?.["productDifferentials"],
    profile?.["productProofPoints"],
    profile?.["uniqueValueProposition"],
    profile?.["mainPain"],
    profile?.["mainObjections"],
    profile?.["targetAudience"],
    profile?.["city"],
  ].map(compactText).filter(Boolean).join(". ");
}

function detectPropertyType(raw: string): string | undefined {
  if (has(raw, /\bsala comercial\b/i)) return "sala comercial";
  if (has(raw, /\bcobertura\b/i)) return "cobertura";
  if (has(raw, /\btriplex\b/i)) return "triplex";
  if (has(raw, /\bapartamento\b/i)) return "apartamento";
  if (has(raw, /\bcasa\b/i)) return "casa";
  if (has(raw, /\bterreno\b/i)) return "terreno";
  if (has(raw, /\bimovel comercial\b/i)) return "imovel comercial";
  if (has(raw, /\bimovel\b/i)) return "imovel";
  return undefined;
}

function detectPurpose(raw: string): string | undefined {
  if (has(raw, /\b(locacao|aluguel|alugar|locar)\b/i)) return "locacao";
  if (has(raw, /\b(venda|comprar|financiamento|a venda|vende-se)\b/i)) return "venda";
  if (has(raw, /\btemporada|diaria|airbnb\b/i)) return "temporada";
  return undefined;
}

function detectIncludedFees(raw: string): string | undefined {
  if (has(raw, /\btudo incluso\b/i)) return "tudo incluso";
  if (has(raw, /\btaxas inclusas\b/i)) return "taxas inclusas";
  if (has(raw, /\bcondominio incluso\b/i)) return "condominio incluso";
  return undefined;
}

function buildForbiddenClaims(raw: string, propertyType?: string): string[] {
  const n = normalizeText(raw);
  const candidates = [
    "190 m2",
    "190 m²",
    "tres pavimentos",
    "três pavimentos",
    "planta triplex",
    "triplex",
    "3 suites",
    "3 suítes",
    "alto padrao",
    "alto padrão",
    "praia brava",
    "r$ 18.000",
    "4 vagas",
    "ultimas unidades",
    "últimas unidades",
    "seguranca 24h",
    "segurança 24h",
  ];
  const forbidden = candidates.filter((claim) => !n.includes(normalizeText(claim)));

  if (propertyType === "sala comercial") {
    for (const claim of [
      "apartamento",
      "cobertura",
      "triplex",
      "suite",
      "suíte",
      "quarto",
      "vaga de garagem",
      "pavimento",
      "mobiliada",
      "clinica",
      "clínica",
      "consultorio",
      "consultório",
    ]) {
      if (!n.includes(normalizeText(claim))) forbidden.push(claim);
    }
  }
  return unique(forbidden);
}

export function buildCampaignFacts({
  input,
  clientProfile,
}: {
  input: FactSource;
  clientProfile: FactSource;
  campaignName?: string;
  segment?: string;
}): CampaignFacts {
  const raw = sourceText(input, clientProfile);
  const n = normalizeText(raw);
  const propertyType = detectPropertyType(raw);
  const purpose = detectPurpose(raw);
  const areaM2 = firstMatch(raw, [/\b\d{1,4}(?:[,.]\d+)?\s*m(?:2|²)\b/i]);
  const price = firstMatch(raw, [/\bR\$\s*\d{1,3}(?:\.\d{3})*(?:,\d{2})?\b/i]);
  const address = firstMatch(raw, [
    /\b(?:rua|avenida|av\.?|r\.?)\s+[^\n,.]+(?:,\s*(?:n[ºo]\.?\s*)?\d+)?/i,
  ]);
  const floors = firstMatch(raw, [
    /\b\d+\s+pavimentos?\b/i,
    /\b(?:dois|duas|tres|três|quatro)\s+pavimentos?\b/i,
  ]);
  const suites = firstMatch(raw, [/\b\d+\s+su[ií]tes?\b/i]);
  const bedrooms = firstMatch(raw, [/\b\d+\s+(?:quartos?|dormit[oó]rios?)\b/i]);
  const bathrooms = firstMatch(raw, [/\b\d+\s+banheiros?\b/i]);
  const parkingSpots = firstMatch(raw, [/\b\d+\s+vagas?\b/i]);
  const includedFees = detectIncludedFees(raw);
  const furnished = has(raw, /\bmobiliad[ao]\b/i) ? "mobiliado" : undefined;

  const structuralFeatures = unique([
    has(raw, /ar[- ]condicionado/i) ? firstMatch(raw, [/\b(?:dois|duas|2)\s+aparelhos? de ar[- ]condicionado\b/i]) || "ar-condicionado" : "",
    has(raw, /pe[- ]direito alto|pé[- ]direito alto/i) ? "pe-direito alto" : "",
    has(raw, /massoterapia/i) ? "estrutura para massoterapia" : "",
  ]);
  const usagePossibilities = unique([
    has(n, /profissionais? de saude/) ? "profissionais de saude" : "",
    has(n, /estetica/) ? "estetica" : "",
    has(n, /bem-estar|bem estar/) ? "bem-estar" : "",
  ]);

  const verifiedFacts = unique([
    purpose ? `Finalidade: ${purpose}` : "",
    propertyType ? `Tipo de imovel: ${propertyType}` : "",
    areaM2 ? `Area: ${areaM2}` : "",
    price ? `Preco: ${price}` : "",
    address ? `Endereco: ${address}` : "",
    floors ? `Pavimentos: ${floors}` : "",
    suites ? `Suites: ${suites}` : "",
    bedrooms ? `Quartos: ${bedrooms}` : "",
    bathrooms ? `Banheiros: ${bathrooms}` : "",
    parkingSpots ? `Vagas: ${parkingSpots}` : "",
    furnished ? `Mobilia: ${furnished}` : "",
    includedFees ? `Taxas: ${includedFees}` : "",
    ...structuralFeatures.map((feature) => `Caracteristica: ${feature}`),
  ]);

  const allowedInferences = unique([
    usagePossibilities.length ? `Uso possivel: ${usagePossibilities.join(", ")}` : "",
    propertyType === "sala comercial" ? "Pode falar em uso profissional, mas nao pode trocar o tipo do imovel por clinica ou consultorio." : "",
  ]);

  return {
    verifiedFacts,
    allowedInferences,
    forbiddenClaims: buildForbiddenClaims(raw, propertyType),
    realEstate: {
      purpose,
      propertyType,
      areaM2,
      price,
      address,
      bedrooms,
      suites,
      bathrooms,
      parkingSpots,
      floors,
      furnished,
      includedFees,
      structuralFeatures,
      usagePossibilities,
    },
  };
}

function valuesInText(pattern: RegExp, text: string): string[] {
  const out: string[] = [];
  for (const match of text.matchAll(pattern)) {
    if (match[0]) out.push(compactText(match[0]));
  }
  return unique(out);
}

function collectTextFields(value: unknown, prefix = "root", out: Array<{ field: string; text: string }> = []) {
  if (typeof value === "string") {
    if (value.trim()) out.push({ field: prefix, text: value });
    return out;
  }
  if (!value || typeof value !== "object") return out;
  if (Array.isArray(value)) {
    value.forEach((item, index) => collectTextFields(item, `${prefix}[${index}]`, out));
    return out;
  }
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (/^(headline|description|shortDescription|bodyText|copy|hook|pain|solution|script|text)$/i.test(key)
      || prefix.includes("creativeSystemV2.copyBank")) {
      collectTextFields(item, `${prefix}.${key}`, out);
    }
  }
  return out;
}

export function validateCampaignFactIntegrity(
  creatives: unknown[],
  facts: CampaignFacts,
): CampaignFactValidation {
  const conflicts: CampaignFactConflict[] = [];
  const fields = collectTextFields(creatives, "creatives");

  for (const { field, text } of fields) {
    const n = normalizeText(text);

    for (const claim of facts.forbiddenClaims) {
      if (n.includes(normalizeText(claim))) {
        conflicts.push({ field, value: claim, reason: "forbidden_claim_not_in_current_briefing" });
      }
    }

    const areas = valuesInText(/\b\d{1,4}(?:[,.]\d+)?\s*m(?:2|²)\b/gi, text);
    for (const area of areas) {
      if (facts.realEstate.areaM2 && normalizeText(area) !== normalizeText(facts.realEstate.areaM2)) {
        conflicts.push({ field, value: area, reason: `area_conflict_expected_${facts.realEstate.areaM2}` });
      }
    }

    const prices = valuesInText(/\bR\$\s*\d{1,3}(?:\.\d{3})*(?:,\d{2})?\b/gi, text);
    for (const price of prices) {
      if (facts.realEstate.price && normalizeText(price) !== normalizeText(facts.realEstate.price)) {
        conflicts.push({ field, value: price, reason: `price_conflict_expected_${facts.realEstate.price}` });
      }
    }

    if (facts.realEstate.propertyType === "sala comercial") {
      if (/\b(apartamento|cobertura|triplex)\b/i.test(n)) {
        conflicts.push({
          field,
          value: text.match(/\b(apartamento|cobertura|triplex)\b/i)?.[0] || "wrong_property_type",
          reason: "property_type_conflict_expected_sala_comercial",
        });
      }
    }
  }

  return {
    status: conflicts.length ? "failed" : "passed",
    verifiedFactsCount: facts.verifiedFacts.length,
    conflicts,
  };
}

export function formatCampaignFactsForPrompt(facts: CampaignFacts): string {
  return [
    "========================",
    "FATOS VERIFICADOS DA CAMPANHA ATUAL",
    "========================",
    facts.verifiedFacts.length ? facts.verifiedFacts.map((fact) => `- ${fact}`).join("\n") : "- Nenhum fato protegido informado.",
    facts.allowedInferences.length ? `\nINFERENCIAS PERMITIDAS:\n${facts.allowedInferences.map((fact) => `- ${fact}`).join("\n")}` : "",
    facts.forbiddenClaims.length ? `\nPROIBIDO NESTA CAMPANHA:\n${facts.forbiddenClaims.slice(0, 30).map((claim) => `- ${claim}`).join("\n")}` : "",
    "\nREGRA: padroes vencedores e exemplos podem emprestar estrutura persuasiva, mas nunca fatos, numeros, enderecos, precos, metragem ou caracteristicas de outro projeto.",
  ].filter(Boolean).join("\n");
}
