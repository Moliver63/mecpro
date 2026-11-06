/**
 * googleAdsImagens.ts — imagens de campanha de Pesquisa (extensao de imagem, AD_IMAGE).
 *
 * O Google aceita nesta extensao so imagem quadrada (1:1, minimo 300x300) e
 * paisagem (1,91:1, minimo 600x314). Arte vertical 9:16 e recusada, entao a
 * validacao acontece antes de qualquer chamada ao Google.
 */
import { createHash } from "node:crypto";

export const GOOGLE_IMAGEM_MAX_BYTES = 5 * 1024 * 1024;
export const GOOGLE_IMAGENS_MAX = 20;

export type TipoImagemGoogle = "QUADRADA" | "PAISAGEM";
export type ImagemValidada = { dados: Buffer; largura: number; altura: number; tipo: TipoImagemGoogle; formato: "jpeg" | "png"; nome: string };

/** Largura e altura lidas do cabecalho; null quando nao e JPEG nem PNG. */
export function lerDimensoes(b: Buffer): { largura: number; altura: number; formato: "jpeg" | "png" } | null {
  if (b.length > 24 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return { largura: b.readUInt32BE(16), altura: b.readUInt32BE(20), formato: "png" };
  }
  if (b.length > 4 && b[0] === 0xff && b[1] === 0xd8) {
    let i = 2;
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) { i++; continue; }
      const marcador = b[i + 1];
      if (marcador === 0xff) { i++; continue; }
      if (marcador >= 0xd0 && marcador <= 0xd9) { i += 2; continue; }
      const tamanho = b.readUInt16BE(i + 2);
      const sof = marcador >= 0xc0 && marcador <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marcador);
      if (sof) return { altura: b.readUInt16BE(i + 5), largura: b.readUInt16BE(i + 7), formato: "jpeg" };
      i += 2 + tamanho;
    }
  }
  return null;
}

/** QUADRADA, PAISAGEM ou o motivo da recusa. */
export function classificarImagem(largura: number, altura: number): { tipo: TipoImagemGoogle } | { erro: string } {
  if (!largura || !altura) return { erro: "dimensoes ilegiveis" };
  const r = largura / altura;
  if (Math.abs(r - 1) <= 0.01) {
    return largura >= 300 ? { tipo: "QUADRADA" } : { erro: `quadrada ${largura}x${altura} abaixo do minimo 300x300` };
  }
  if (Math.abs(r - 1.91) <= 0.03) {
    return largura >= 600 && altura >= 314 ? { tipo: "PAISAGEM" } : { erro: `paisagem ${largura}x${altura} abaixo do minimo 600x314` };
  }
  return { erro: `proporcao ${largura}x${altura} (${r.toFixed(2)}:1) nao aceita; use 1:1 ou 1,91:1` };
}

export function validarImagem(dados: Buffer, nome: string): ImagemValidada {
  if (dados.length > GOOGLE_IMAGEM_MAX_BYTES) throw new Error(`${nome}: excede 5 MB.`);
  const d = lerDimensoes(dados);
  if (!d) throw new Error(`${nome}: nao e JPEG nem PNG.`);
  const c = classificarImagem(d.largura, d.altura);
  if ("erro" in c) throw new Error(`${nome}: ${c.erro}.`);
  return { dados, largura: d.largura, altura: d.altura, tipo: c.tipo, formato: d.formato, nome };
}

export function urlImagemValida(u: string): boolean {
  try {
    const p = new URL(u);
    if (p.protocol !== "https:") return false;
    const h = p.hostname.toLowerCase();
    return !(h === "localhost" || /^\d+\.\d+\.\d+\.\d+$/.test(h) || h.endsWith(".local") || h.endsWith(".internal"));
  } catch { return false; }
}

export async function baixarImagem(url: string, nome: string): Promise<ImagemValidada> {
  if (!urlImagemValida(url)) throw new Error(`${nome}: use uma URL https publica.`);
  const res = await fetch(url, { signal: AbortSignal.timeout(20000), redirect: "error" });
  if (!res.ok) throw new Error(`${nome}: download falhou (HTTP ${res.status}).`);
  if (Number(res.headers.get("content-length") || 0) > GOOGLE_IMAGEM_MAX_BYTES) throw new Error(`${nome}: excede 5 MB.`);
  const dados = Buffer.from(await res.arrayBuffer());
  return validarImagem(dados, nome);
}

/** Operacao de criacao do asset (assets:mutate). */
export function operacaoAsset(img: ImagemValidada, prefixo: string) {
  const sufixo = createHash("md5").update(img.dados).digest("hex").slice(0, 8);
  return { create: { name: `${prefixo} ${img.tipo === "QUADRADA" ? "1x1" : "1.91x1"} ${sufixo}`.slice(0, 128), type: "IMAGE", imageAsset: { data: img.dados.toString("base64") } } };
}

/** Operacao de vinculo asset→campanha (campaignAssets:mutate). */
export function operacaoVinculo(customerId: string, campaignId: string, assetResource: string) {
  const cid = String(customerId).replace(/\D/g, "");
  return { create: { campaign: `customers/${cid}/campaigns/${campaignId}`, asset: assetResource, fieldType: "AD_IMAGE" } };
}

/** Resumo exigido pelo Google: ao menos 1 quadrada e 1 paisagem. */
export function conferirConjunto(imgs: ImagemValidada[]): string[] {
  const av: string[] = [];
  if (imgs.length > GOOGLE_IMAGENS_MAX) av.push(`Maximo ${GOOGLE_IMAGENS_MAX} imagens.`);
  if (!imgs.some((i) => i.tipo === "QUADRADA")) av.push("Falta ao menos 1 imagem quadrada (1:1).");
  if (!imgs.some((i) => i.tipo === "PAISAGEM")) av.push("Falta 1 imagem paisagem (1,91:1); o Google recomenda uma de cada.");
  return av;
}
