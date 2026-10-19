// Prova de ponta a ponta do gerador Hugging Face, pra rodar no Shell do Render:
//
//   npx tsx server/scripts/testar-huggingface-imagem.ts
//
// Gera UMA imagem (consome credito do HF, centavos), mede e descarta. Nao grava
// nada no banco nem no Cloudinary. Nao imprime o token.
import { gerarImagemHuggingFace, HF_IMAGE_MODEL_PADRAO, HF_IMAGE_PROVIDER_PADRAO } from "../ai-providers/huggingFaceImage";
import { redactProviderSecrets } from "../providerSafety";

const modelo = process.env.HF_IMAGE_MODEL || HF_IMAGE_MODEL_PADRAO;
const provedor = process.env.HF_IMAGE_PROVIDER || HF_IMAGE_PROVIDER_PADRAO;
console.log(`Testando Hugging Face: modelo=${modelo} provedor=${provedor} chave=${process.env.HUGGINGFACE_API_KEY ? "presente" : "AUSENTE"}`);

const inicio = Date.now();
const r = await gerarImagemHuggingFace(
  "Editorial photograph of a calm woman by a window in soft morning light, warm neutral tones, minimalist room",
  "feed",
);
const segundos = ((Date.now() - inicio) / 1000).toFixed(1);

if (r.buffer) {
  const assinatura = r.buffer.subarray(0, 4).toString("hex");
  const tipo = assinatura.startsWith("89504e47") ? "PNG" : assinatura.startsWith("ffd8") ? "JPEG" : assinatura.startsWith("52494646") ? "WEBP" : `desconhecido (${assinatura})`;
  console.log(`✅ FUNCIONANDO: imagem ${tipo} de ${(r.buffer.length / 1024).toFixed(0)} KB em ${segundos}s`);
} else {
  console.log(`❌ SEM IMAGEM em ${segundos}s — motivo: ${r.motivo}`);
  if (r.detalhe) console.log(`   detalhe: ${redactProviderSecrets(r.detalhe)}`);
  const dicas: Record<string, string> = {
    sem_chave: "HUGGINGFACE_API_KEY nao esta no ambiente deste servico.",
    sem_credito: "Conta sem credito. Compre credito ou assine o PRO em huggingface.co/settings/billing.",
    token_sem_permissao: "Token sem permissao 'Make calls to Inference Providers'. Gere outro token fine-grained.",
    modelo_ou_provedor_indisponivel: "Modelo ou provedor fora. Teste outro com HF_IMAGE_PROVIDER=nscale ou wavespeed.",
    limite_de_taxa: "Limite de taxa. Espere um minuto e rode de novo.",
    provedor_fora: "Provedor com erro no momento. Tente de novo ou troque HF_IMAGE_PROVIDER.",
    timeout: "Passou de 60s. Provedor lento; tente de novo.",
  };
  if (r.motivo && dicas[r.motivo]) console.log(`   o que fazer: ${dicas[r.motivo]}`);
  process.exitCode = 1;
}
