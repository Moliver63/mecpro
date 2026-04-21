/**
 * pixBoletoValidator.ts
 *
 * Validação de códigos Pix (BR Code / copia-e-cola) e linha digitável de boleto
 * sem dependências externas. Baseado nas especificações:
 *   - Pix: ABNT NBR 16.569:2021 (EMV QR Code)
 *   - Boleto: Resolução Bacen 77/2013
 */

export type CodeType = "pix" | "boleto" | "invalid";

export interface ValidatedCode {
  type:        CodeType;
  raw:         string;
  amount?:     number;       // centavos
  expiresAt?:  Date | null;
  recipient?:  string;       // nome ou ID do destinatário (se disponível)
  description?: string;
  error?:      string;
}

/**
 * Detecta o tipo do código colado
 */
export function detectCodeType(input: string): CodeType {
  const clean = (input || "").trim().replace(/\s+/g, "");
  if (!clean) return "invalid";

  // Pix BR Code: começa com "000201" e tem CRC16 no final "6304XXXX"
  if (/^0002\d{2}/.test(clean) && /6304[0-9A-F]{4}$/i.test(clean)) {
    return "pix";
  }

  // Linha digitável de boleto: 47 ou 48 dígitos (bancário) ou 44 (convênio)
  const digitsOnly = clean.replace(/\D/g, "");
  if (digitsOnly.length === 47 || digitsOnly.length === 48 || digitsOnly.length === 44) {
    return "boleto";
  }

  return "invalid";
}

/**
 * Valida CRC16-CCITT do Pix BR Code (polinomial 0x1021, inicial 0xFFFF)
 */
function validatePixCRC(code: string): boolean {
  const payload = code.slice(0, -4);         // tudo exceto o CRC
  const providedCRC = code.slice(-4).toUpperCase();

  let crc = 0xFFFF;
  for (let i = 0; i < payload.length; i++) {
    crc ^= payload.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      crc = (crc & 0x8000) ? ((crc << 1) ^ 0x1021) : (crc << 1);
      crc &= 0xFFFF;
    }
  }
  const calculated = crc.toString(16).toUpperCase().padStart(4, "0");
  return calculated === providedCRC;
}

/**
 * Extrai campos TLV do Pix BR Code
 */
function parsePixTLV(code: string): Record<string, string> {
  const fields: Record<string, string> = {};
  let i = 0;
  const body = code.slice(0, -4);  // remove CRC

  while (i < body.length - 4) {
    const id  = body.substr(i, 2);
    const len = parseInt(body.substr(i + 2, 2), 10);
    if (isNaN(len) || i + 4 + len > body.length) break;
    fields[id] = body.substr(i + 4, len);
    i += 4 + len;
  }
  return fields;
}

/**
 * Valida código Pix completo
 */
export function validatePixCode(input: string): ValidatedCode {
  const raw = (input || "").trim().replace(/\s+/g, "");

  if (!raw) return { type: "invalid", raw, error: "Código vazio" };
  if (raw.length < 60 || raw.length > 512) {
    return { type: "invalid", raw, error: "Tamanho inválido para código Pix" };
  }
  if (!/^0002\d{2}/.test(raw)) {
    return { type: "invalid", raw, error: "Formato Pix inválido (header errado)" };
  }
  if (!validatePixCRC(raw)) {
    return { type: "invalid", raw, error: "Código Pix corrompido (CRC16 inválido)" };
  }

  const tlv = parsePixTLV(raw);

  // Campo 54: valor da transação em reais (ex: "100.50")
  let amountCents: number | undefined;
  if (tlv["54"]) {
    const v = parseFloat(tlv["54"]);
    if (!isNaN(v) && v > 0) amountCents = Math.round(v * 100);
  }

  // Campo 59: nome do recebedor
  const recipient = tlv["59"] || undefined;

  // Campo 62: dados adicionais (incluindo txid)
  const additional = tlv["62"] || "";

  return {
    type:        "pix",
    raw,
    amount:      amountCents,
    recipient,
    description: additional.length > 4 ? additional.slice(4) : undefined,
  };
}

/**
 * Valida linha digitável de boleto bancário (47 dígitos)
 *
 * Estrutura:
 *   Campo 1: banco(3) + moeda(1) + inicio(5) + DV(1)  = 10 dig
 *   Campo 2: meio(10) + DV(1)                         = 11 dig
 *   Campo 3: fim(10) + DV(1)                          = 11 dig
 *   Campo 4: DV geral(1)                              = 1 dig
 *   Campo 5: fator vencimento(4) + valor(10)          = 14 dig
 */
export function validateBoletoCode(input: string): ValidatedCode {
  const raw    = (input || "").trim();
  const digits = raw.replace(/\D/g, "");

  if (!digits) return { type: "invalid", raw, error: "Código vazio" };

  if (digits.length === 47) {
    // Boleto bancário
    const valor = parseInt(digits.slice(37, 47), 10);
    const fator = parseInt(digits.slice(33, 37), 10);

    // Fator vencimento: dias desde 07/10/1997 (para fator < 10000)
    // ou 22/02/2025 (para fator >= 10000) — Bacen mudou a base
    let expiresAt: Date | null = null;
    if (fator > 0) {
      const base = fator < 10000
        ? new Date(1997, 9, 7)
        : new Date(2025, 1, 22);
      expiresAt = new Date(base.getTime() + fator * 86400 * 1000);
    }

    return {
      type:      "boleto",
      raw,
      amount:    valor > 0 ? valor : undefined,  // valor em centavos
      expiresAt,
    };
  }

  if (digits.length === 48 || digits.length === 44) {
    // Boleto de convênio (tributos, concessionárias)
    return {
      type:  "boleto",
      raw,
      // valor e vencimento têm estrutura diferente em convênios
    };
  }

  return { type: "invalid", raw, error: `Linha digitável inválida (${digits.length} dígitos, esperado 44/47/48)` };
}

/**
 * Validação unificada — detecta o tipo e chama o validador apropriado
 */
export function validateCode(input: string): ValidatedCode {
  const type = detectCodeType(input);
  if (type === "pix")    return validatePixCode(input);
  if (type === "boleto") return validateBoletoCode(input);
  return { type: "invalid", raw: input, error: "Código não reconhecido (não é Pix nem boleto válido)" };
}
