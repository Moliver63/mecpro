/** Strict BRL daily amount, not a percentage or a monthly budget. */
export function parseDailyBudget(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) && value > 0 && Number.isSafeInteger(Math.round(value * 100)) && Math.abs(value * 100 - Math.round(value * 100)) < 0.00001 ? value : null;
  if (typeof value !== "string") return null;
  const match = /^(?:R\$\s*)?(\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|\d+(?:[.,]\d{1,2})?)\s*(?:\/dia)?$/i.exec(value.trim());
  if (!match) return null;
  const raw = match[1];
  const normalized = /\.\d{3}(?:\.|,|$)/.test(raw) ? raw.replace(/\./g, "").replace(",", ".") : raw.replace(",", ".");
  return parseDailyBudget(Number(normalized));
}

export function formatDailyBudget(value: number): string {
  return `R$ ${value.toFixed(2).replace(".", ",")}/dia`;
}
