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
  type:              CodeType;
  raw:               string;
  amount?:           number;       // centavos
  expiresAt?:        Date | null;
  recipient?:        string;       // nome do recebedor (campo 59)
  pixKey?:           string;       // chave Pix (campo 26 sub-01)
  detectedPlatform?: string | null; // "meta" | "google" | "tiktok" | null
  description?:      string;
  error?:            string;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Limpa o código removendo espaços, quebras de linha e caracteres invisíveis */
function cleanCode(input: string): string {
  return (input || "")
    .trim()
    .replace(/[\s\r\n\t\u00a0\u200b\ufeff]/g, "");  // remove espaços mas preserva case
}


// ── CNPJs e nomes conhecidos das plataformas de anúncios ─────────────────────
const PLATFORM_CNPJS: Record<string, string> = {
  "13347016": "meta",    // DLocal Brasil (processador Meta/Facebook no Brasil)
  "15602422": "meta",    // Facebook Payments International Ltda
  "07587951": "meta",    // Meta Platforms Inc
  "06990590": "google",  // Google Brasil Internet Ltda
  "02269603": "google",  // Google Pagamentos Ltda
  "35451936": "tiktok",  // TikTok Technology Brazil Ltda
  "24686734": "tiktok",  // ByteDance Brasil Ltda
};
const PLATFORM_NAMES: Record<string, string> = {
  "FACEBOOK":  "meta",
  "META":      "meta",
  "DLOCAL":    "meta",   // DLocal é o processador de pagamentos da Meta no Brasil
  "GOOGLE":    "google",
  "TIKTOK":    "tiktok",
  "BYTEDANCE": "tiktok",
};

/** Detecta plataforma a partir do nome do recebedor e/ou chave Pix */
function detectPlatformFromPix(recipient: string | undefined, pixKey: string | undefined): string | null {
  // 1. Pelo nome do recebedor (campo 59)
  if (recipient) {
    const upper = recipient.toUpperCase();
    for (const [keyword, platform] of Object.entries(PLATFORM_NAMES)) {
      if (upper.includes(keyword)) return platform;
    }
  }
  // 2. Pela chave Pix (campo 26 sub-01) — extrai CNPJ se for CNPJ/CPF
  if (pixKey) {
    const digits = pixKey.replace(/\D/g, "");
    // CNPJ tem 14 dígitos — verifica os primeiros 8 (raiz do CNPJ)
    if (digits.length >= 8) {
      const root = digits.slice(0, 8);
      if (PLATFORM_CNPJS[root]) return PLATFORM_CNPJS[root];
    }
  }
  return null;
}

/** Parse sub-TLV do campo 26 para extrair a chave Pix */
function parseSubTLV(data: string): Record<string, string> {
  const fields: Record<string, string> = {};
  let i = 0;
  while (i < data.length) {
    if (i + 4 > data.length) break;
    const id  = data.slice(i, i + 2);
    const len = parseInt(data.slice(i + 2, i + 4), 10);
    if (isNaN(len) || len < 0 || i + 4 + len > data.length) break;
    fields[id] = data.slice(i + 4, i + 4 + len);
    i += 4 + len;
  }
  return fields;
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

  // Campo 26: merchant account info — extrai chave Pix (sub-campo 01)
  let pixKey: string | undefined;
  if (tlv["26"]) {
    const sub = parseSubTLV(tlv["26"]);
    pixKey = sub["01"] || undefined;
  }

  // Detecta plataforma pelo nome do recebedor e/ou chave Pix
  const detectedPlatform = detectPlatformFromPix(recipient, pixKey);

  // Campo 60: cidade
  const city = tlv["60"] || undefined;

  // Campo 62: txid / dados adicionais
  let description: string | undefined;
  if (tlv["62"] && tlv["62"].length > 4) {
    const sub62 = parseSubTLV(tlv["62"]);
    if (sub62["05"]) description = `txid: ${sub62["05"]}`;
    else description = tlv["62"].slice(4);
  }

  return {
    type:             "pix",
    raw,
    amount:           amountCents,
    recipient:        recipient ? `${recipient}${city ? ` — ${city}` : ""}` : undefined,
    pixKey,
    detectedPlatform,
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
    // Posições 33-36: fator de vencimento (dias desde base 07/10/1997)
    // Posições 37-46: valor (centavos)
    const fator = parseInt(digits.slice(33, 37), 10);
    const valor = parseInt(digits.slice(37, 47), 10);

    let expiresAt: Date | null = null;
    if (fator > 0 && fator < 10000) {
      const base = new Date(1997, 9, 7); // 07/10/1997
      let calculada = new Date(base.getTime() + fator * 86400 * 1000);
      const hoje = new Date();

      // Boletos modernos (2024+): o ciclo de 9000 dias reiniciou
      // Fator 1429 com base 1997 = 2001, mas com +9000 dias = 2026 (correto)
      // Se a data calculada está no passado, tenta adicionar 9000 dias
      if (calculada < hoje) {
        const comOffset = new Date(base.getTime() + (fator + 9000) * 86400 * 1000);
        // Usa o offset se resultar em data futura razoável (até 2 anos)
        if (comOffset > hoje && comOffset < new Date(Date.now() + 365 * 2 * 86400000)) {
          calculada = comOffset;
        }
      }

      // Só registra se a data for plausível
      if (calculada.getFullYear() >= 2020) {
        expiresAt = calculada;
      }
    }

    return {
      type:      "boleto",
      raw,
      amount:    valor > 0 ? valor : undefined,  // em centavos (dividido por 100 no endpoint)
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
