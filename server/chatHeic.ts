/**
 * chatHeic.ts — fotos HEIC/HEIF (padrao da camera do iPhone) viram JPEG no servidor antes de seguir o fluxo normal.
 * Detecta pelo CONTEUDO (caixa ftyp com marca de HEIF), nunca pela extensao. O Safari do iPhone ja converte para JPEG
 * quando o seletor so aceita JPEG/PNG; isto cobre HEIC vindo de "Escolher arquivos", Android, Windows e macOS.
 */
const MARCAS_HEIF = new Set(["heic", "heix", "hevc", "hevx", "heim", "heis", "hevm", "hevs", "mif1", "msf1", "heif"]);
const LIMITE_ENTRADA = 20 * 1024 * 1024;
const LIMITE_SAIDA = 12 * 1024 * 1024;

export function ehHeic(b: Buffer): boolean {
  if (b.length < 16 || b.subarray(4, 8).toString("ascii") !== "ftyp") return false;
  const marcas = [b.subarray(8, 12).toString("ascii")];
  const tamanho = Math.min(b.readUInt32BE(0), 64, b.length);
  for (let i = 16; i + 4 <= tamanho; i += 4) marcas.push(b.subarray(i, i + 4).toString("ascii"));
  return marcas.some((m) => MARCAS_HEIF.has(m));
}

export type ResultadoHeic = { ok: true; jpeg: Buffer } | { ok: false; erro: string };

export async function converterHeicParaJpeg(b: Buffer, conversor?: (o: { buffer: Buffer; format: "JPEG"; quality: number }) => Promise<ArrayBuffer | Uint8Array>): Promise<ResultadoHeic> {
  if (b.length > LIMITE_ENTRADA) return { ok: false, erro: "A foto HEIC é grande demais para converter. Use JPEG ou reduza o tamanho." };
  try {
    const converter = conversor ?? ((await import("heic-convert")) as any).default;
    const saida = Buffer.from(await converter({ buffer: b, format: "JPEG", quality: 0.88 }));
    if (saida.length < 200 || saida[0] !== 0xff || saida[1] !== 0xd8) return { ok: false, erro: "Não consegui converter essa foto HEIC. Exporte como JPEG e envie de novo." };
    if (saida.length > LIMITE_SAIDA) return { ok: false, erro: "A foto convertida ficou grande demais. Reduza a resolução e envie de novo." };
    return { ok: true, jpeg: saida };
  } catch {
    return { ok: false, erro: "Não consegui ler essa foto HEIC (arquivo incompleto ou protegido). Exporte como JPEG e envie de novo." };
  }
}
