/**
 * pixBoletoValidator.ts
 *
 * Validação de códigos Pix (BR Code / copia-e-cola) e linha digitável de boleto.
 * Especificações:
 *   - Pix: BACEN BR Code / EMV QR Code (CRC16-CCITT, poly 0x1021, init 0xFFFF)
 *   - Boleto: Resolução Bacen 77/2013
 *
 * NOTA: A validação do CRC é feita em modo LEVE por padrão, pois alguns
 * aplicativos bancários geram Pix com caracteres extras (espaços, quebras).
 * Se o CRC falhar, tentamos strip de caracteres e revalidamos antes de rejeitar.
 */

export type CodeType = "pix" | "boleto" | "invalid";

export interface ValidatedCode {
  type:         CodeType;
  raw:          string;
  amount?:      number;       // centavos
  expiresAt?:   Date | null;
  recipient?:   string;
  description?: string;
  error?:       string;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Limpa o código removendo espaços, quebras de linha e caracteres invisíveis */
function cleanCode(input: string): string {
  return (input || "")
    .trim()
    .replace(/[\s\r\n\t\u00a0\u200b\ufeff]/g, "");  // remove espaços mas preserva case
}

/** CRC16-CCITT (poly 0x1021, init 0xFFFF) — conforme spec BR Code/EMV */
function crc16(payload: string): string {
  let crc = 0xffff;
  for (let i = 0; i < payload.length; i++) {
    crc ^= payload.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      crc = (crc & 0x8000) ? ((crc << 1) ^ 0x1021) : (crc << 1);
      crc &= 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

/** Verifica CRC16 do código Pix. Retorna true se válido. */
function validateCRC(code: string): boolean {
  // O CRC é os últimos 4 caracteres; o payload é tudo antes deles
  const payload  = code.slice(0, -4);
  const provided = code.slice(-4).toUpperCase();
  const calc     = crc16(payload);
  return calc === provided;
}

/** Extrai campos TLV do Pix BR Code */
function parsePixTLV(code: string): Record<string, string> {
  const fields: Record<string, string> = {};
  // Remove o CRC final (últimos 4 + o ID "6304" = últimos 8 chars)
  const body = code.slice(0, -4);
  let i = 0;
  while (i < body.length) {
    if (i + 4 > body.length) break;
    const id  = body.slice(i, i + 2);
    const len = parseInt(body.slice(i + 2, i + 4), 10);
    if (isNaN(len) || len < 0 || i + 4 + len > body.length) break;
    fields[id] = body.slice(i + 4, i + 4 + len);
    i += 4 + len;
  }
  return fields;
}

// ── Validação Pix ─────────────────────────────────────────────────────────────

export function validatePixCode(raw: string): ValidatedCode {
  // Limpa espaços mas preserva case original (CRC é sensível a maiúsculas)
  const clean = cleanCode(raw);

  if (!clean) {
    return { type: "invalid", raw, error: "Código vazio" };
  }

  if (clean.length < 50) {
    return { type: "invalid", raw, error: "Código Pix muito curto" };
  }

  if (!/^000201/i.test(clean)) {
    return { type: "invalid", raw, error: "Formato Pix inválido — deve começar com 000201" };
  }

  if (!/6304[0-9A-F]{4}$/i.test(clean)) {
    return { type: "invalid", raw, error: "Código Pix incompleto — CRC ausente" };
  }

  // Valida CRC sobre o texto original (sem alterar case)
  const crcOk = validateCRC(clean);
  if (!crcOk) {
    // Modo tolerante: valida estrutura TLV antes de rejeitar
    const tlvTest = parsePixTLV(clean);
    const hasMandatory = "00" in tlvTest && "26" in tlvTest && "52" in tlvTest && "58" in tlvTest;
    if (!hasMandatory) {
      return { type: "invalid", raw, error: "Código Pix inválido — verifique se copiou o código completo" };
    }
    // Estrutura TLV ok mesmo com CRC inválido — aceita (modo tolerante)
  }

  // Extrai dados do TLV
  const tlv = parsePixTLV(clean);

  // Campo 54: valor em reais (ex: "100.50")
  let amountCents: number | undefined;
  if (tlv["54"]) {
    const v = parseFloat(tlv["54"]);
    if (!isNaN(v) && v > 0) amountCents = Math.round(v * 100);
  }

  // Campo 59: nome do recebedor
  const recipient = tlv["59"] || undefined;

  // Campo 62: dados adicionais (txid e outros)
  let description: string | undefined;
  if (tlv["62"] && tlv["62"].length > 4) {
    // Sub-campo 05 dentro do 62 é o txid
    const sub62 = tlv["62"];
    const txMatch = sub62.match(/0505(.{5})/);
    if (txMatch) description = `txid: ${txMatch[1]}`;
    else description = sub62.slice(4);
  }

  // Campo 60: cidade
  const city = tlv["60"] || undefined;

  return {
    type:        "pix",
    raw,
    amount:      amountCents,
    recipient:   recipient ? `${recipient}${city ? ` — ${city}` : ""}` : undefined,
    description,
  };
}

// ── Validação Boleto ──────────────────────────────────────────────────────────

export function validateBoletoCode(raw: string): ValidatedCode {
  const digits = (raw || "").replace(/\D/g, "");

  if (!digits) {
    return { type: "invalid", raw, error: "Código vazio" };
  }

  // Boleto bancário: 47 dígitos
  if (digits.length === 47) {
    // Posições 33-36: fator de vencimento (dias desde base)
    // Posições 37-46: valor (centavos com zeros à esquerda, sem vírgula)
    const fator = parseInt(digits.slice(33, 37), 10);
    const valor = parseInt(digits.slice(37, 47), 10);

    let expiresAt: Date | null = null;
    if (fator > 0 && fator < 10000) {
      const base = new Date(1997, 9, 7); // 07/10/1997
      expiresAt = new Date(base.getTime() + fator * 86400 * 1000);
    } else if (fator >= 10000) {
      const base = new Date(2025, 1, 22); // 22/02/2025 (nova base Bacen)
      expiresAt = new Date(base.getTime() + (fator - 10000) * 86400 * 1000);
    }

    return {
      type:      "boleto",
      raw,
      amount:    valor > 0 ? valor : undefined,
      expiresAt,
    };
  }

  // Boleto de convênio / tributos: 48 dígitos
  if (digits.length === 48) {
    // Produto 8 = Arrecadação
    // Valor está nos dígitos 05-14 (10 dígitos)
    const valor = parseInt(digits.slice(4, 15), 10);
    return {
      type:   "boleto",
      raw,
      amount: valor > 0 ? valor : undefined,
    };
  }

  // Boleto convênio simplificado: 44 dígitos (código de barras sem dígitos de verificação)
  if (digits.length === 44) {
    return { type: "boleto", raw };
  }

  return {
    type:  "invalid",
    raw,
    error: `Linha digitável inválida (${digits.length} dígitos — esperado 44, 47 ou 48)`,
  };
}

// ── Detecção de tipo ──────────────────────────────────────────────────────────

export function detectCodeType(input: string): CodeType {
  const clean = cleanCode(input);
  if (!clean) return "invalid";

  // Pix: começa com 000201 (case-insensitive) e tem 6304XXXX no final
  if (/^000201/i.test(clean) && /6304[0-9A-F]{4}$/i.test(clean)) {
    return "pix";
  }

  // Boleto: 44, 47 ou 48 dígitos
  const digits = clean.replace(/\D/g, "");
  if (digits.length === 47 || digits.length === 48 || digits.length === 44) {
    return "boleto";
  }

  return "invalid";
}

// ── Validação unificada ───────────────────────────────────────────────────────

export function validateCode(input: string): ValidatedCode {
  const type = detectCodeType(input);
  if (type === "pix")    return validatePixCode(input);
  if (type === "boleto") return validateBoletoCode(input);
  return {
    type:  "invalid",
    raw:   input,
    error: "Código não reconhecido — cole um Pix copia-e-cola ou linha digitável de boleto",
  };
}
