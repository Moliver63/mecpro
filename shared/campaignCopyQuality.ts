/** Editorial checks shared by generation and the two publication entry points. */
export function normalizeCopyText(value: unknown): string {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

export function trimCopyField(value: unknown, max: number): string {
  const text = normalizeCopyText(value);
  if (text.length <= max) return text;
  const kept: string[] = [];
  const words = text.match(/R\$\s*[\d.,]+|n[ºo]\.?\s*\d+|\d+(?:[,.]\d+)?\s*m(?:²|2)(?=\s|[.,;:]|$)|\S+/gi) || [];
  for (const word of words) {
    if ([...kept, word].join(" ").length > max) break;
    kept.push(word);
  }
  // A field limit must never split an address, amount or hyphenated word.
  let result = kept.join(" ").replace(/[\s,;:|–—-]+$/g, "");
  while (/\s+(?:R\$|n[ºo]\.?|para|com|de|em|na|no|do|da|e|ao)$/i.test(result)) {
    result = result.replace(/\s+\S+$/, "").replace(/[\s,;:|–—-]+$/g, "");
  }
  return result;
}

export function hasInternalCopyLanguage(value: unknown): boolean {
  const text = normalizeCopyText(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  return [
    /\b(?:o|no|do|pelo|conforme|segue|seguem)\s+briefing\b/,
    /\b(?:este|cada|primeiro|ultimo)\s+card\b/,
    /\bcard de abertura\b|\bfechamento do carrossel\b/,
    /\b(?:aqui a narrativa|a copy deve|o texto permanece|a campanha (?:apresenta somente|nao transforma))\b/,
    /\ba foto (?:real )?(?:orienta|funciona como|abre desejo|destaca variedade|tem impacto|traz informacao)\b/,
    /\b(?:sem herdar dados|sem numeros inventados|sem valor inventado|sem acrescentar promessas externas)\b/,
  ].some((pattern) => pattern.test(text));
}

/**
 * True when a hook is redundant with its headline — same text once spaces,
 * case and trivial trailing punctuation are ignored. Used to avoid showing
 * the same line twice in the UI (achado real, campanha 747: "Headline e
 * hook idênticos, exibidos repetidamente na interface"). This only hides
 * the duplicate visually; it never invents a new hook to fill the gap.
 */
export function isRedundantHookText(headline: unknown, hook: unknown): boolean {
  const normalize = (value: unknown) =>
    normalizeCopyText(value).toLowerCase().replace(/[.!?…]+$/g, "").trim();
  const h = normalize(headline);
  const k = normalize(hook);
  return h.length > 0 && h === k;
}

export function isWeakGeneratedCopy(value: unknown, field: "headline" | "description" | "hook" | "copy" = "copy"): boolean {
  const text = normalizeCopyText(value);
  const minimum = { headline: 8, description: 4, hook: 8, copy: 20 }[field];
  return text.length < minimum
    || hasInternalCopyLanguage(text)
    || /^(localiza[cç][aã]o informada|condi[cç][aã]o (?:clara )?para decidir|dados (?:claros|confirmados)|detalhes reais|estrutura confirmada|regi[aã]o confirmada)$/i.test(text)
    || /^(saiba mais|confira|veja detalhes|oportunidade|não perca|nao perca|venha conhecer|clique aqui)$/i.test(text)
    || /milhares de clientes|resultados mensuráveis|mudaram de vida|oportunidade única|[úu]ltimas unidades disponíveis|sinta a transformação/i.test(text);
}

/** Inspect only text that may reach an ad, including the synchronized V2 bank. */
export function getCreativeEditorialIssues(creative: unknown): string[] {
  if (!creative || typeof creative !== "object") return [];
  const record = creative as Record<string, any>;
  const fields = ["headline", "title", "description", "shortDescription", "copy", "bodyText", "primaryText", "text", "hook", "cta", "script"];
  const texts: string[] = fields.map((key) => typeof record[key] === "string" ? record[key] : "");
  const bank = record.creativeSystemV2?.copyBank;
  for (const key of ["headlines", "descriptions", "bodies", "hooks", "ctas"]) {
    if (Array.isArray(bank?.[key])) {
      texts.push(...bank[key].map((entry: any) => typeof entry?.text === "string" ? entry.text : ""));
    }
  }
  return texts.some(hasInternalCopyLanguage)
    ? ["Texto de orientação interna presente na copy; reescreva a mensagem para o interessado."]
    : [];
}

export function getCarouselEditorialIssues(creatives: unknown[]): string[] {
  const issues = creatives.flatMap((creative, index) =>
    getCreativeEditorialIssues(creative).map((issue) => "Card " + (index + 1) + ": " + issue));
  if (creatives.length < 3) return issues;
  const openings = new Map<string, number>();
  for (const creative of creatives) {
    const record = creative && typeof creative === "object" ? creative as Record<string, unknown> : {};
    const body = normalizeCopyText(record.copy || record.bodyText || record.primaryText);
    const opening = (body.split(/[.!?](?:\s|$)/)[0] || "").toLowerCase();
    if (opening.length >= 50) openings.set(opening, (openings.get(opening) || 0) + 1);
  }
  if ([...openings.values()].some((count) => count >= 3)) {
    issues.push("Três ou mais cards repetem a mesma abertura; use um argumento próprio para cada foto.");
  }
  return issues;
}
