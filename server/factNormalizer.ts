export type CanonicalFactKind =
  | "area_m2"
  | "money_brl"
  | "address_br"
  | "count"
  | "duration_min"
  | "volume_ml"
  | "weight_kg";

export function normalizeText(value: unknown): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export function compactText(value: unknown): string {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function normalizeNumericLabel(value: number, suffix: string): string {
  return `${Number(value.toFixed(4))} ${suffix}`;
}

function parseBrazilianNumber(value: string): number | null {
  const raw = value.trim();
  if (!raw) return null;
  const hasComma = raw.includes(",");
  const hasDot = raw.includes(".");

  if (hasComma && hasDot) {
    return Number(raw.replace(/\./g, "").replace(",", "."));
  }

  if (hasComma) {
    return Number(raw.replace(",", "."));
  }

  if (hasDot) {
    const parts = raw.split(".");
    if (parts.length > 1 && parts[parts.length - 1].length === 3) {
      return Number(raw.replace(/\./g, ""));
    }
  }

  return Number(raw);
}

function numberFromWords(value: string): number | null {
  const n = normalizeText(value);
  const words: Record<string, number> = {
    um: 1,
    uma: 1,
    dois: 2,
    duas: 2,
    tres: 3,
    quatro: 4,
    cinco: 5,
    seis: 6,
    sete: 7,
    oito: 8,
    nove: 9,
    dez: 10,
    cinquenta: 50,
  };
  const digit = n.match(/\b\d{1,6}(?:[,.]\d+)?\b/);
  if (digit) return parseBrazilianNumber(digit[0]);
  for (const [word, number] of Object.entries(words)) {
    if (new RegExp(`\\b${word}\\b`).test(n)) return number;
  }
  return null;
}

export function normalizeAreaValue(value: unknown): string {
  const raw = normalizeText(value)
    .replace(/m²/g, "m2")
    .replace(/\bmetros?\s+quadrados?\b/g, "m2");
  const digit = raw.match(/\b(\d{1,4}(?:[,.]\d+)?)\s*m2\b/);
  const word = raw.match(/\b([a-z]+)\s*m2\b/);
  const parsed = digit ? parseBrazilianNumber(digit[1]) : word ? numberFromWords(word[1]) : null;
  return parsed !== null && Number.isFinite(parsed) ? normalizeNumericLabel(parsed, "m2") : "";
}

export function normalizeMoneyValue(value: unknown): string {
  const raw = normalizeText(value);
  const explicitCurrency = raw.match(/\br\$\s*(\d{1,3}(?:\.\d{3})+|\d+)(?:,(\d{1,2}))?\b/);
  if (explicitCurrency) {
    const integer = explicitCurrency[1].replace(/\./g, "");
    const decimal = (explicitCurrency[2] || "").padEnd(2, "0").slice(0, 2);
    const parsed = Number(`${integer}.${decimal || "00"}`);
    return Number.isFinite(parsed) ? normalizeNumericLabel(parsed, "brl") : "";
  }

  const reais = raw.match(/\b(\d{1,3}(?:\.\d{3})+|\d+)(?:,(\d{1,2}))?\s*reais\b/);
  if (reais) {
    const integer = reais[1].replace(/\./g, "");
    const decimal = (reais[2] || "").padEnd(2, "0").slice(0, 2);
    const parsed = Number(`${integer}.${decimal || "00"}`);
    return Number.isFinite(parsed) ? normalizeNumericLabel(parsed, "brl") : "";
  }

  const thousandText = raw.match(/\b(\d{1,3}(?:[,.]\d+)?|[a-z]+)\s*mil(?:\s+reais)?\b/);
  if (thousandText) {
    const base = numberFromWords(thousandText[1]);
    const parsed = base === null ? null : base * 1000;
    return parsed !== null && Number.isFinite(parsed) ? normalizeNumericLabel(parsed, "brl") : "";
  }

  const contextualNumber = raw.match(/\b(?:valor|preco|aluguel|locacao|mensal|mensais|por)\D{0,20}(\d{4,6})(?:,(\d{1,2}))?\b/);
  if (contextualNumber) {
    const parsed = Number(`${contextualNumber[1]}.${(contextualNumber[2] || "").padEnd(2, "0").slice(0, 2) || "00"}`);
    return Number.isFinite(parsed) ? normalizeNumericLabel(parsed, "brl") : "";
  }

  return "";
}

export function normalizeAddressValue(value: unknown): string {
  const raw = normalizeText(value)
    .replace(/\bavenida\b/g, "av")
    .replace(/\bav\./g, "av")
    .replace(/\br\./g, "rua")
    .replace(/\bn\s*[ºo]?\.?/g, "")
    .replace(/º/g, "")
    .replace(/[.,;:]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const match = raw.match(/\b(rua|av)\s+([a-z0-9]+(?:\s+[a-z0-9]+){0,6})\b/);
  if (!match) return "";

  const parts = match[2]
    .split(/\s+/)
    .filter((part) => part && !["numero", "num"].includes(part));
  const number = parts.length > 1 && /^\d{1,6}$/.test(parts[parts.length - 1]) ? parts.pop() || "" : "";
  const street = parts.join(" ");
  return [match[1], street, number].filter(Boolean).join(" ");
}

function equivalentAddressValue(left: unknown, right: unknown): boolean {
  const normalizedLeft = normalizeAddressValue(left);
  const normalizedRight = normalizeAddressValue(right);
  if (!normalizedLeft || !normalizedRight) return false;
  if (normalizedLeft === normalizedRight) return true;

  const leftParts = normalizedLeft.split(" ");
  const rightParts = normalizedRight.split(" ");
  const leftTail = leftParts[leftParts.length - 1] || "";
  const rightTail = rightParts[rightParts.length - 1] || "";
  const leftNumber = /^\d+$/.test(leftTail) && leftParts.length > 2 ? leftTail : "";
  const rightNumber = /^\d+$/.test(rightTail) && rightParts.length > 2 ? rightTail : "";
  const leftStreet = leftNumber ? leftParts.slice(0, -1).join(" ") : normalizedLeft;
  const rightStreet = rightNumber ? rightParts.slice(0, -1).join(" ") : normalizedRight;

  if (leftStreet !== rightStreet) return false;
  return !leftNumber || !rightNumber || leftNumber === rightNumber;
}

export function normalizeCountValue(value: unknown): string {
  const parsed = numberFromWords(String(value ?? ""));
  return parsed !== null && Number.isFinite(parsed) ? normalizeNumericLabel(parsed, "count") : "";
}

export function normalizeDurationValue(value: unknown): string {
  const raw = normalizeText(value);
  const hours = raw.match(/\b(\d{1,3}(?:[,.]\d+)?)\s*(?:h|horas?)\b/);
  if (hours) {
    const parsed = parseBrazilianNumber(hours[1]);
    return parsed !== null && Number.isFinite(parsed) ? normalizeNumericLabel(parsed * 60, "min") : "";
  }
  const minutes = raw.match(/\b(\d{1,4})\s*(?:min|mins|minutos?)\b/);
  if (minutes) return normalizeNumericLabel(Number(minutes[1]), "min");
  return "";
}

export function normalizeVolumeValue(value: unknown): string {
  const raw = normalizeText(value);
  const liters = raw.match(/\b(\d{1,4}(?:[,.]\d+)?)\s*l\b/);
  if (liters) {
    const parsed = parseBrazilianNumber(liters[1]);
    return parsed !== null && Number.isFinite(parsed) ? normalizeNumericLabel(parsed * 1000, "ml") : "";
  }
  const ml = raw.match(/\b(\d{1,6})\s*ml\b/);
  if (ml) return normalizeNumericLabel(Number(ml[1]), "ml");
  return "";
}

export function normalizeWeightValue(value: unknown): string {
  const raw = normalizeText(value);
  if (/\bmeio\s+quilo\b/.test(raw)) return normalizeNumericLabel(0.5, "kg");
  const tons = raw.match(/\b(\d{1,6}(?:[,.]\d+)?)\s*(?:ton|tons|toneladas?)\b/);
  if (tons) {
    const parsed = parseBrazilianNumber(tons[1]);
    return parsed !== null && Number.isFinite(parsed) ? normalizeNumericLabel(parsed * 1000, "kg") : "";
  }
  const grams = raw.match(/\b(\d{1,6})\s*g\b/);
  if (grams) return normalizeNumericLabel(Number(grams[1]) / 1000, "kg");
  const kg = raw.match(/\b(\d{1,6}(?:[,.]\d+)?)\s*kg\b/);
  if (kg) {
    const parsed = parseBrazilianNumber(kg[1]);
    return parsed !== null && Number.isFinite(parsed) ? normalizeNumericLabel(parsed, "kg") : "";
  }
  return "";
}

export function normalizeCanonicalFact(kind: CanonicalFactKind, value: unknown): string {
  switch (kind) {
    case "area_m2":
      return normalizeAreaValue(value);
    case "money_brl":
      return normalizeMoneyValue(value);
    case "address_br":
      return normalizeAddressValue(value);
    case "count":
      return normalizeCountValue(value);
    case "duration_min":
      return normalizeDurationValue(value);
    case "volume_ml":
      return normalizeVolumeValue(value);
    case "weight_kg":
      return normalizeWeightValue(value);
  }
}

export function equivalentCanonicalFact(kind: CanonicalFactKind, left: unknown, right: unknown): boolean {
  if (kind === "address_br") return equivalentAddressValue(left, right);
  const normalizedLeft = normalizeCanonicalFact(kind, left);
  const normalizedRight = normalizeCanonicalFact(kind, right);
  return Boolean(normalizedLeft && normalizedRight && normalizedLeft === normalizedRight);
}
