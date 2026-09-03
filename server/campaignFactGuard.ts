import {
  compactText,
  equivalentCanonicalFact,
  normalizeAreaValue,
  normalizeAddressValue,
  normalizeMoneyValue,
  normalizeText,
} from "./factNormalizer";

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
  // Texto normalizado de productProofPoints (briefing atual + perfil do
  // cliente) — usado para checar se uma alegacao de prova social na copy
  // (numero de clientes, avaliacao, depoimento) tem lastro real informado
  // pelo cliente, em qualquer nicho (nao so imoveis).
  socialProofRaw: string;
  // Preço do produto/serviço declarado pelo cliente (productPrice), fora do
  // contexto imobiliário — cobre qualquer nicho (confeitaria, B2B, e-commerce
  // etc). Achado real (auditoria 03/09): o Fact Guard só valida price dentro
  // de facts.realEstate, então uma campanha de outro nicho com preço errado
  // na copy nunca era pega estruturalmente.
  genericProductPrice?: string;
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

function equivalentFactValue(key: keyof ReturnType<typeof extractRealEstateFacts>, left: string, right: string): boolean {
  if (key === "areaM2") {
    return equivalentCanonicalFact("area_m2", left, right);
  }
  if (key === "price") {
    return equivalentCanonicalFact("money_brl", left, right);
  }
  if (key === "address") {
    return equivalentCanonicalFact("address_br", left, right);
  }
  if (["bedrooms", "suites", "bathrooms", "parkingSpots"].includes(key)) {
    return equivalentCanonicalFact("count", left, right);
  }
  return normalizeText(left) === normalizeText(right);
}

function unique(values: string[]): string[] {
  return [...new Set(values.map(compactText).filter(Boolean))];
}

function firstMatch(text: string, patterns: RegExp[]): string | undefined {
  // Prefere o match mais completo (mais longo) entre TODAS as ocorrências
  // do padrão no texto combinado — não literalmente a primeira que aparece.
  // Achado real (auditoria 03/09, regressão do teste "accepts confirmed
  // address variants"): o texto combinado começa pelo campo `name` da
  // campanha (ex: "...Rua 902", sem número) e só depois vem o briefing
  // completo (ex: "Rua 902, nº 144"). A primeira ocorrência vencia mesmo
  // sendo menos específica, fazendo o Fact Guard esperar o endereço errado
  // (mais curto) e nunca bloquear divergência de número de rua de verdade.
  for (const pattern of patterns) {
    const flags = pattern.flags.includes("g") ? pattern.flags : pattern.flags + "g";
    const matches = [...text.matchAll(new RegExp(pattern.source, flags))]
      .map((m) => m[0])
      .filter(Boolean);
    if (matches.length > 0) {
      const longest = matches.reduce((best, current) => (current.length > best.length ? current : best));
      return compactText(longest);
    }
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
    input?.["productName"],
    input?.["productService"],
    input?.["productPrice"],
    input?.["productDifferentials"],
    input?.["productProofPoints"],
    input?.["uniqueValueProposition"],
    input?.["mainPain"],
    input?.["mainObjections"],
    input?.["targetAudience"],
    input?.["city"],
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

const numberWordPattern = "(?:\\d+|um|uma|dois|duas|tres|três|quatro|cinco|seis|sete|oito|nove|dez|cinquenta)";
const areaPattern = new RegExp(`\\b(?:\\d{1,4}(?:[,.]\\d+)?|${numberWordPattern})\\s*(?:m(?:2|²)|metros?\\s+quadrados?)(?=\\s|[.,;:]|$)`, "i");
const moneyPattern = /\b(?:R\$\s*(?:\d{1,3}(?:\.\d{3})+|\d+)(?:,\d{1,2})?|(?:\d{1,3}(?:\.\d{3})+|\d+)(?:,\d{1,2})?\s*reais|\d{1,3}(?:[,.]\d+)?\s*mil(?:\s+reais)?|(?:valor|pre[cç]o|aluguel|loca[cç][aã]o|mensal|mensais|por)\D{0,20}\d{4,6}(?:,\d{1,2})?)\b/i;
const addressPattern = /\b(?:rua|avenida|av\.?|r\.?)\s+[a-z0-9]+(?:[\s,]+(?:n[ºo]\.?\s*)?\d{1,6})?\b/i;
const bedroomsPattern = new RegExp(`\\b${numberWordPattern}\\s+(?:quartos?|dormit[oó]rios?)\\b`, "i");
const suitesPattern = new RegExp(`\\b${numberWordPattern}\\s+su[ií]tes?\\b`, "i");
const bathroomsPattern = new RegExp(`\\b${numberWordPattern}\\s+banheiros?\\b`, "i");
const parkingSpotsPattern = new RegExp(`\\b${numberWordPattern}\\s+vagas?\\b`, "i");

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
    "fase final",
    "processo avancado",
    "processo avançado",
    "condicao especial",
    "condição especial",
    "por tempo limitado",
    "nao perder esta chance",
    "não perder esta chance",
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
      "escritorio",
      "escritório",
      "salao",
      "salão",
      "studio",
      "estudio",
      "estúdio",
    ]) {
      if (!n.includes(normalizeText(claim))) forbidden.push(claim);
    }
  }
  return unique(forbidden);
}

function extractRealEstateFacts(raw: string) {
  const propertyType = detectPropertyType(raw);
  return {
    purpose: detectPurpose(raw),
    propertyType,
    areaM2: firstMatch(raw, [areaPattern]),
    price: firstMatch(raw, [moneyPattern]),
    address: firstMatch(raw, [
      addressPattern,
    ]),
    floors: firstMatch(raw, [
      /\b\d+\s+pavimentos?\b/i,
      /\b(?:dois|duas|tres|três|quatro)\s+pavimentos?\b/i,
    ]),
    suites: firstMatch(raw, [suitesPattern]),
    bedrooms: firstMatch(raw, [bedroomsPattern]),
    bathrooms: firstMatch(raw, [bathroomsPattern]),
    parkingSpots: firstMatch(raw, [parkingSpotsPattern]),
    includedFees: detectIncludedFees(raw),
    furnished: has(raw, /\bmobiliad[ao]\b/i) ? "mobiliado" : undefined,
  };
}

function preferCurrentFact(current?: string, inherited?: string): string | undefined {
  return current || inherited;
}

function collectStaleInheritedClaims(
  current: ReturnType<typeof extractRealEstateFacts>,
  inherited: ReturnType<typeof extractRealEstateFacts>,
): string[] {
  const stale: string[] = [];
  const keys = [
    "propertyType",
    "purpose",
    "areaM2",
    "price",
    "address",
    "floors",
    "suites",
    "bedrooms",
    "bathrooms",
    "parkingSpots",
    "includedFees",
    "furnished",
  ] as const;

  for (const key of keys) {
    const currentValue = current[key];
    const inheritedValue = inherited[key];
    if (currentValue && inheritedValue && !equivalentFactValue(key, currentValue, inheritedValue)) {
      stale.push(inheritedValue);
    }
  }

  return unique(stale);
}

// ── Prova social não verificada (regra estrutural, funciona pra qualquer nicho) ──
// Cobre o que o Fact Guard historicamente não pegava: alegações de número de
// clientes/alunos/pacientes, avaliação em estrelas, "depoimentos reais" etc,
// quando o cliente não informou nada equivalente em productProofPoints.
// Achado real (auditoria 03/09): campanha da Gra Kau Delícias (confeitaria)
// publicou "Milhares de clientes já mudaram de vida" sem nenhuma base no
// briefing — passou pelo Fact Guard porque ele só validava fatos de imóvel.
const socialProofClaimPatterns: RegExp[] = [
  // quantidade de clientes/alunos/pacientes/pedidos/vendas/famílias
  new RegExp(`\b(?:\d[\d.,]*|${numberWordPattern}|milhares?|centenas?|dezenas?)\s+(?:de\s+)?(clientes?|alunos?|pacientes?|pedidos?|vendas?|fam[ií]lias?|unidades?\s+vendidas?|projetos?\s+entregues?|casos?\s+de\s+sucesso)\b`, "i"),
  // "mais de X anos/clientes/unidades..."
  /\bmais\s+de\s+\d[\d.,]*\s*(anos?|clientes?|alunos?|pacientes?|unidades?|vendas?)\b/i,
  // avaliação em estrelas / nota
  /\b(?:\d(?:[.,]\d)?\s*(?:estrelas?|\/\s*5)|nota\s*(?:m[aá]xima|\d(?:[.,]\d)?))\b/i,
  // linguagem de depoimento genérico sem citação real
  /\bdepoimentos?\s+(?:reais?|de\s+clientes?|de\s+quem\s+j[aá])\b/i,
  // superlativo de resultado sem número específico do cliente
  /\bmilhares\s+de\s+(?:pessoas|clientes)\s+j[aá]\b/i,
];

function detectSocialProofClaims(text: string): string[] {
  const found: string[] = [];
  for (const pattern of socialProofClaimPatterns) {
    const match = text.match(pattern);
    if (match?.[0]) found.push(compactText(match[0]));
  }
  return unique(found);
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
  const currentRaw = sourceText(input, {});
  const inheritedRaw = sourceText({}, clientProfile);
  const raw = sourceText(input, clientProfile);
  const n = normalizeText(raw);
  const socialProofRaw = normalizeText(
    compactText(
      [input?.["productProofPoints"], clientProfile?.["productProofPoints"]]
        .map(compactText)
        .filter(Boolean)
        .join(". "),
    ),
  );
  const genericProductPrice = compactText(input?.["productPrice"] || clientProfile?.["productPrice"] || "") || undefined;
  const currentFacts = extractRealEstateFacts(currentRaw);
  const inheritedFacts = extractRealEstateFacts(inheritedRaw);
  const propertyType = preferCurrentFact(currentFacts.propertyType, inheritedFacts.propertyType);
  const purpose = preferCurrentFact(currentFacts.purpose, inheritedFacts.purpose);
  const areaM2 = preferCurrentFact(currentFacts.areaM2, inheritedFacts.areaM2);
  const price = preferCurrentFact(currentFacts.price, inheritedFacts.price);
  const address = preferCurrentFact(currentFacts.address, inheritedFacts.address);
  const floors = preferCurrentFact(currentFacts.floors, inheritedFacts.floors);
  const suites = preferCurrentFact(currentFacts.suites, inheritedFacts.suites);
  const bedrooms = preferCurrentFact(currentFacts.bedrooms, inheritedFacts.bedrooms);
  const bathrooms = preferCurrentFact(currentFacts.bathrooms, inheritedFacts.bathrooms);
  const parkingSpots = preferCurrentFact(currentFacts.parkingSpots, inheritedFacts.parkingSpots);
  const includedFees = preferCurrentFact(currentFacts.includedFees, inheritedFacts.includedFees);
  const furnished = preferCurrentFact(currentFacts.furnished, inheritedFacts.furnished);

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
    propertyType === "sala comercial" ? "Pode falar em uso profissional amplo, atividade profissional, negocio ou espaco comercial, mas nao pode trocar o tipo do imovel por clinica, consultorio, escritorio, salao ou studio sem confirmacao literal." : "",
  ]);

  return {
    verifiedFacts,
    allowedInferences,
    forbiddenClaims: unique([
      ...buildForbiddenClaims(currentRaw || raw, propertyType),
      ...collectStaleInheritedClaims(currentFacts, inheritedFacts),
    ]),
    socialProofRaw,
    genericProductPrice,
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
    const nextPrefix = `${prefix}.${key}`;
    const isTextField = /^(headline|description|shortDescription|bodyText|copy|hook|pain|solution|script|text)$/i.test(key);
    const isRelevantContainer = /^(creativeSystemV2|copyBank|hooks|bodies|headlines|ctas|descriptions|creativeVariants|channels|placements)$/i.test(key)
      || prefix.includes("creativeSystemV2.copyBank");
    if (isTextField || isRelevantContainer || (item && typeof item === "object")) {
      collectTextFields(item, nextPrefix, out);
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

    // Prova social não verificada — regra estrutural, aplica a qualquer nicho
    // (não só imóveis). Uma alegação quantificada de clientes/avaliação/
    // depoimento só passa se o núcleo do texto também aparecer em
    // productProofPoints (facts.socialProofRaw). Sem prova cadastrada pelo
    // cliente, qualquer alegação desse tipo é bloqueada por padrão.
    for (const claim of detectSocialProofClaims(text)) {
      const claimNormalized = normalizeText(claim);
      const substantiated = facts.socialProofRaw.length > 0 && facts.socialProofRaw.includes(claimNormalized);
      if (!substantiated) {
        conflicts.push({ field, value: claim, reason: "unverified_social_proof_claim" });
      }
    }

    const areas = valuesInText(new RegExp(areaPattern.source, "gi"), text);
    for (const area of areas) {
      if (facts.realEstate.areaM2 && normalizeAreaValue(area) !== normalizeAreaValue(facts.realEstate.areaM2)) {
        conflicts.push({ field, value: area, reason: `area_conflict_expected_${facts.realEstate.areaM2}` });
      }
    }

    const prices = valuesInText(new RegExp(moneyPattern.source, "gi"), text);
    // Preço esperado: prioriza o fato imobiliário estruturado; se não houver
    // (nicho não-imóvel), cai pro productPrice genérico do cliente. Mesma
    // checagem, duas fontes possíveis — funciona pra qualquer segmento.
    const expectedPrice = facts.realEstate.price || facts.genericProductPrice;
    for (const price of prices) {
      if (expectedPrice && normalizeMoneyValue(price) !== normalizeMoneyValue(expectedPrice)) {
        conflicts.push({ field, value: price, reason: `price_conflict_expected_${expectedPrice}` });
      }
    }

    const addresses = valuesInText(new RegExp(addressPattern.source, "gi"), text);
    for (const address of addresses) {
      if (facts.realEstate.address && !equivalentCanonicalFact("address_br", address, facts.realEstate.address)) {
        conflicts.push({ field, value: address, reason: `address_conflict_expected_${facts.realEstate.address}` });
      }
      if (!facts.realEstate.address && normalizeAddressValue(address)) {
        conflicts.push({ field, value: address, reason: "address_not_confirmed_in_current_briefing" });
      }
    }

    const countFactChecks: Array<[
      "bedrooms" | "suites" | "bathrooms" | "parkingSpots",
      RegExp,
      string,
    ]> = [
      ["bedrooms", bedroomsPattern, "bedrooms_conflict_expected"],
      ["suites", suitesPattern, "suites_conflict_expected"],
      ["bathrooms", bathroomsPattern, "bathrooms_conflict_expected"],
      ["parkingSpots", parkingSpotsPattern, "parking_spots_conflict_expected"],
    ];
    for (const [factKey, pattern, reasonPrefix] of countFactChecks) {
      const expected = facts.realEstate[factKey];
      if (!expected) continue;
      for (const value of valuesInText(new RegExp(pattern.source, "gi"), text)) {
        if (!equivalentCanonicalFact("count", value, expected)) {
          conflicts.push({ field, value, reason: `${reasonPrefix}_${expected}` });
        }
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

    // Checagem inversa — achado real (auditoria 03/09, campanha "Cobertura
    // Triplex Praia Brava | Locação Residencial"): um dos 9 criativos saiu
    // como "Espaço Comercial 190m² em Itajaí" / "Otimize seu negócio" /
    // "imóvel comercial" para um imóvel RESIDENCIAL. A checagem acima só
    // cobria sala comercial → não pode virar apartamento/cobertura/triplex;
    // faltava o sentido contrário: apartamento/cobertura/triplex/casa → não
    // pode virar copy de imóvel comercial.
    const residentialPropertyTypes = ["apartamento", "cobertura", "triplex", "casa"];
    if (residentialPropertyTypes.includes(facts.realEstate.propertyType || "")) {
      const commercialFramingPattern = /\b(sala comercial|im[oó]vel comercial|espa[cç]o comercial|ponto comercial|loja comercial|escrit[oó]rio|seu neg[oó]cio)\b/i;
      const match = text.match(commercialFramingPattern);
      if (match?.[0]) {
        conflicts.push({
          field,
          value: compactText(match[0]),
          reason: `property_type_conflict_expected_${facts.realEstate.propertyType}`,
        });
      }
    }

    // Inversão de finalidade — mesmo tipo de bug do tipo de imóvel, mas em
    // "purpose" (locação/venda/temporada), que era capturado e citado no
    // prompt mas nunca validado. Anúncio de locação virar linguagem de
    // venda (ou vice-versa) é erro factual grave — pode enganar o
    // consumidor sobre a natureza real da oferta.
    if (facts.realEstate.purpose === "locacao") {
      const salePattern = /\b(a venda|vende-se|financiamento|financie|compre (?:agora|j[aá])|entrada \+ parcelas|parcele em)\b/i;
      const match = text.match(salePattern);
      if (match?.[0]) {
        conflicts.push({ field, value: compactText(match[0]), reason: "purpose_conflict_expected_locacao" });
      }
    }
    if (facts.realEstate.purpose === "venda") {
      const rentPattern = /\b(alugue (?:agora|j[aá])|para alugar|loca[cç][aã]o mensal|valor do aluguel|aluguel mensal)\b/i;
      const match = text.match(rentPattern);
      if (match?.[0]) {
        conflicts.push({ field, value: compactText(match[0]), reason: "purpose_conflict_expected_venda" });
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
