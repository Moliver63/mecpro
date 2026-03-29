/**
 * mecpro-dev.ts
 *
 * Script de desenvolvimento MECProAI + Ollama
 * Roda localmente — usa contexto completo do projeto
 *
 * USO:
 *   npx tsx mecpro-dev.ts
 *   npx tsx mecpro-dev.ts --modo componente
 *   npx tsx mecpro-dev.ts --modo layout
 *   npx tsx mecpro-dev.ts --modo debug
 *   npx tsx mecpro-dev.ts --modo integração
 */

import * as readline from "readline";
import * as fs from "fs";
import * as path from "path";

// ─────────────────────────────────────────────────────────────────────────────
// CONFIG
// ─────────────────────────────────────────────────────────────────────────────

const OLLAMA_URL  = "http://localhost:11434/api/generate";
const MODEL       = process.env.OLLAMA_MODEL || "codellama"; // troque por deepseek-coder, llama3, etc
const MODO        = process.argv.includes("--modo") 
  ? process.argv[process.argv.indexOf("--modo") + 1] 
  : "geral";

// ─────────────────────────────────────────────────────────────────────────────
// CONTEXTO COMPLETO DO MECPROAI
// ─────────────────────────────────────────────────────────────────────────────

const MECPRO_CONTEXT = `
Você é um especialista sênior em desenvolvimento do projeto MECProAI.
Responda SEMPRE em português brasileiro.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STACK TÉCNICA
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- Frontend: React + TypeScript + Vite
- Roteamento: Wouter (NÃO React Router)
- Estado servidor: tRPC + TanStack Query
- Estilo: CSS Variables inline (sem Tailwind, sem CSS modules)
- Toasts: Sonner (toast.success, toast.error)
- Banco: SQLite via Drizzle ORM
- Backend: Express + tRPC
- AI: Google Gemini (gemini-2.5-flash)
- Deploy: Render.com via GitHub

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
VARIÁVEIS CSS DISPONÍVEIS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Cores:
  var(--black)      → #0f172a (texto principal)
  var(--dark)       → #1e293b (texto secundário)
  var(--muted)      → #64748b (texto suave)
  var(--border)     → #e2e8f0 (bordas)
  var(--off)        → #f8fafc (fundo suave)
  var(--off2)       → #f1f5f9 (fundo alternativo)
  var(--green)      → #22c55e (primária)
  var(--green-l)    → #dcfce7 (verde claro)
  var(--green-d)    → #15803d (verde escuro)
  var(--green-dk)   → #166534 (verde mais escuro)
  var(--green-xl)   → #f0fdf4 (verde muito claro)
  var(--navy)       → #0f172a (azul escuro)
  var(--red)        → #ef4444
  var(--yellow)     → #f59e0b

Tipografia:
  var(--font-display) → fonte de títulos (Inter/Display)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PADRÕES DE COMPONENTE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Estrutura padrão de página
export default function MinhaPage() {
  const [, setLocation] = useLocation();
  return (
    <Layout>
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontFamily: "var(--font-display)", fontSize: 24, fontWeight: 800, color: "var(--black)" }}>
          Título
        </h1>
        <p style={{ fontSize: 13, color: "var(--muted)" }}>Subtítulo</p>
      </div>
      {/* conteúdo */}
    </Layout>
  );
}

// Card padrão
<div style={{
  background: "white",
  border: "1px solid var(--border)",
  borderRadius: 16,
  padding: 24,
}}>

// Botão primário
<button className="btn btn-md btn-green">Ação</button>
<button className="btn btn-md btn-ghost">Cancelar</button>

// Badge
<span className="badge badge-green">ativo</span>
<span className="badge badge-gray">inativo</span>

// Input
<input className="input" placeholder="..." />
<textarea className="input" rows={4} />

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PADRÕES TRPC
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Query
const { data, isLoading } = trpc.campaigns.list.useQuery({ projectId });

// Mutation
const mutation = trpc.campaigns.generate.useMutation({
  onSuccess: (data) => toast.success("✅ Sucesso!"),
  onError: (e) => toast.error(e.message),
});

// Chamada com cast (para routers novos)
const query = (trpc as any).intelligence?.getDashboardStats?.useQuery?.();

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ROTEAMENTO (WOUTER)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
import { useLocation, useParams } from "wouter";
const [, setLocation] = useLocation();
const { id } = useParams<{ id: string }>();
setLocation("/admin/intelligence");

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ESTRUTURA DO PROJETO
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
client/src/
  pages/          → páginas (uma por rota)
  components/
    layout/       → Layout.tsx (wrapper de página)
    shared/       → ProtectedRoute, ErrorBoundary, etc
  hooks/          → useAuth, usePlanLimit
  lib/            → trpc.ts

server/
  _core/
    router.ts     → appRouter (todos os endpoints)
    context.ts    → contexto tRPC
  ai.ts           → integração Gemini
  schema.ts       → schema Drizzle principal
  adminIntelligenceSchema.ts → tabelas de inteligência

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
MÓDULOS IMPLEMENTADOS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1. AdminCampaignIntelligence → /admin/intelligence
   - Score ponderado de campanhas
   - Ranking, padrões vencedores, base de aprendizado
   - 14 endpoints: intelligence.* no appRouter

2. CreativeDistributionEngine → components/
   - Classificação de proporção (9:16, 4:5, 1:1, 16:9)
   - Compatibilidade formato × placement
   - Alertas de incompatibilidade

3. AdPreviewPanel → components/
   - Preview visual por placement
   - IG Feed, Stories, Reels, FB Feed, TikTok, Google Display

4. CampaignBuilder → /projects/:id/campaign
   - 7 steps: Segmento, Objetivo, Plataforma, Orçamento, Detalhes, Match IA, Gerar
   - Step 3: CreativeDistributionPanel
   - Step 5: IntelligenceRecommendation

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
REGRAS DE CÓDIGO
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- SEMPRE usar style inline (não className para layout)
- NUNCA usar Tailwind (não está configurado)
- NUNCA usar React Router (usa Wouter)
- SEMPRE tipar com TypeScript
- SEMPRE tratar erros com try/catch e toast.error
- SEMPRE usar Layout como wrapper de página
- Bordas: borderRadius 8-18px dependendo do elemento
- Sombras: boxShadow "0 2px 12px rgba(0,0,0,0.05)"
- Transições: transition "all .15s"
`;

// ─────────────────────────────────────────────────────────────────────────────
// PROMPTS POR MODO
// ─────────────────────────────────────────────────────────────────────────────

const MODO_PROMPTS: Record<string, string> = {
  componente: `
Foque em criar componentes React reutilizáveis.
Sempre entregue:
1. O componente completo com TypeScript
2. Interface de Props tipada
3. Exemplo de uso
4. Onde colocar o arquivo no projeto
`,
  layout: `
Foque em layout, design visual e UX.
Sempre entregue:
1. Código com style inline usando variáveis CSS do MECProAI
2. Responsividade (grid/flex)
3. Estados: hover, disabled, loading
4. Consistência com o padrão visual existente
`,
  debug: `
Foque em identificar e resolver problemas.
Sempre entregue:
1. Causa raiz do problema
2. Solução com código corrigido
3. Como prevenir no futuro
4. Comandos para testar a correção
`,
  integracao: `
Foque em integração entre partes do sistema.
Sempre entregue:
1. Código de integração completo
2. Mudanças necessárias no router.ts
3. Mudanças necessárias no App.tsx
4. Como testar a integração
`,
  geral: `
Responda com código completo, tipado e pronto para usar no MECProAI.
Sempre entregue código funcional, não pseudocódigo.
`,
};

// ─────────────────────────────────────────────────────────────────────────────
// OLLAMA
// ─────────────────────────────────────────────────────────────────────────────

async function askOllama(prompt: string): Promise<string> {
  const systemPrompt = MECPRO_CONTEXT + "\n\n" + (MODO_PROMPTS[MODO] || MODO_PROMPTS.geral);
  const fullPrompt   = systemPrompt + "\n\n━━━ PERGUNTA ━━━\n" + prompt;

  const res = await fetch(OLLAMA_URL, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({ model: MODEL, prompt: fullPrompt, stream: false }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Erro Ollama: ${res.status} — ${text}`);
  }

  const data = await res.json() as { response: string; done: boolean };
  return data.response?.trim() || "(sem resposta)";
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

// Lê arquivo do projeto para incluir no contexto
function lerArquivo(caminho: string): string {
  try {
    const fullPath = path.join(process.cwd(), caminho);
    const content  = fs.readFileSync(fullPath, "utf-8");
    return `\n\n━━━ ARQUIVO: ${caminho} ━━━\n${content.slice(0, 3000)}${content.length > 3000 ? "\n...(truncado)" : ""}`;
  } catch {
    return `\n(arquivo ${caminho} não encontrado)`;
  }
}

// Salva resposta em arquivo
function salvarResposta(conteudo: string, pergunta: string): void {
  const dir  = "mecpro-dev-output";
  if (!fs.existsSync(dir)) fs.mkdirSync(dir);
  const nome = `${Date.now()}-${pergunta.slice(0, 30).replace(/[^a-zA-Z0-9]/g, "-")}.md`;
  const file = path.join(dir, nome);
  fs.writeFileSync(file, `# Pergunta\n${pergunta}\n\n# Resposta\n${conteudo}`);
  console.log(`\n💾 Salvo em: ${file}`);
}

// Formata resposta no terminal
function printResposta(texto: string): void {
  console.log("\n" + "─".repeat(60));
  console.log("🤖 MECPro Dev Assistant:");
  console.log("─".repeat(60));
  console.log(texto);
  console.log("─".repeat(60) + "\n");
}

// ─────────────────────────────────────────────────────────────────────────────
// COMANDOS ESPECIAIS
// ─────────────────────────────────────────────────────────────────────────────

async function handleComando(input: string): Promise<boolean> {
  const cmd = input.trim().toLowerCase();

  // /arquivo <caminho> — inclui arquivo no próximo contexto
  if (cmd.startsWith("/arquivo ")) {
    const caminho = input.slice(9).trim();
    const conteudo = lerArquivo(caminho);
    console.log(`📄 Arquivo carregado: ${caminho} (${conteudo.length} chars)`);
    return true;
  }

  // /modelo <nome> — troca o modelo
  if (cmd.startsWith("/modelo ")) {
    const novoModelo = input.slice(8).trim();
    console.log(`🔄 Modelo trocado para: ${novoModelo}`);
    process.env.OLLAMA_MODEL = novoModelo;
    return true;
  }

  // /status — verifica se Ollama está rodando
  if (cmd === "/status") {
    try {
      const res = await fetch("http://localhost:11434/api/tags");
      const data = await res.json() as { models: { name: string }[] };
      console.log("✅ Ollama rodando. Modelos disponíveis:");
      data.models?.forEach(m => console.log(`  • ${m.name}`));
    } catch {
      console.log("❌ Ollama não está rodando. Execute: ollama serve");
    }
    return true;
  }

  // /componente <nome> — gera componente do zero
  if (cmd.startsWith("/componente ")) {
    const nome = input.slice(12).trim();
    const prompt = `Crie o componente React "${nome}" completo para o MECProAI.
    Inclua: interface Props, lógica, JSX com style inline, e onde colocar o arquivo.`;
    const resposta = await askOllama(prompt);
    printResposta(resposta);
    salvarResposta(resposta, `componente-${nome}`);
    return true;
  }

  // /debug <erro> — analisa e resolve erro
  if (cmd.startsWith("/debug ")) {
    const erro = input.slice(7).trim();
    const prompt = `Analise este erro do MECProAI e forneça a solução:\n\n${erro}`;
    const resposta = await askOllama(prompt);
    printResposta(resposta);
    return true;
  }

  // /ajuda — lista comandos
  if (cmd === "/ajuda" || cmd === "/help") {
    console.log(`
📋 COMANDOS DISPONÍVEIS:
  /status              → verifica se Ollama está rodando e modelos disponíveis
  /modelo <nome>       → troca o modelo (ex: /modelo llama3)
  /arquivo <caminho>   → carrega arquivo do projeto no contexto
  /componente <nome>   → gera componente completo do zero
  /debug <erro>        → analisa e resolve um erro
  /ajuda               → mostra esta lista
  /sair                → encerra o programa

MODOS DISPONÍVEIS (passar como argumento):
  npx tsx mecpro-dev.ts --modo componente
  npx tsx mecpro-dev.ts --modo layout
  npx tsx mecpro-dev.ts --modo debug
  npx tsx mecpro-dev.ts --modo integracao
  npx tsx mecpro-dev.ts --modo geral (padrão)

EXEMPLOS DE PERGUNTAS:
  "Crie um modal de confirmação reutilizável"
  "Como adicionar paginação na tabela de usuários?"
  "Qual o padrão de erro handling no tRPC do MECProAI?"
  "Refatore este componente para seguir o padrão do projeto: [cole o código]"
`);
    return true;
  }

  return false;
}

// ─────────────────────────────────────────────────────────────────────────────
// LOOP PRINCIPAL
// ─────────────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`
╔══════════════════════════════════════════════════════╗
║         MECProAI Dev Assistant — Ollama              ║
║         Modelo: ${MODEL.padEnd(35)}║
║         Modo: ${MODO.padEnd(37)}║
╚══════════════════════════════════════════════════════╝

✅ Contexto do MECProAI carregado (stack, padrões, módulos)
💡 Digite /ajuda para ver comandos especiais
💡 Digite /status para verificar o Ollama
  `);

  // Verifica Ollama antes de iniciar
  try {
    await fetch("http://localhost:11434/api/tags");
    console.log("✅ Ollama conectado em localhost:11434\n");
  } catch {
    console.log("⚠️  Ollama não detectado. Execute: ollama serve\n");
  }

  const rl = readline.createInterface({
    input:  process.stdin,
    output: process.stdout,
  });

  const extraContextos: string[] = [];

  const perguntar = () => {
    rl.question("🧑 Você: ", async (input) => {
      input = input.trim();

      if (!input) { perguntar(); return; }
      if (input.toLowerCase() === "/sair") {
        console.log("👋 Até mais!");
        rl.close();
        return;
      }

      // Verifica comandos especiais
      const foiComando = await handleComando(input);
      if (foiComando) { perguntar(); return; }

      // Pergunta normal — envia para Ollama
      console.log("\n⏳ Processando...\n");
      try {
        const contextoExtra = extraContextos.join("\n");
        const resposta = await askOllama(contextoExtra + "\n\n" + input);
        printResposta(resposta);

        // Pergunta se quer salvar
        rl.question("💾 Salvar resposta? (s/N): ", (resp) => {
          if (resp.toLowerCase() === "s") {
            salvarResposta(resposta, input);
          }
          perguntar();
        });
      } catch (err: any) {
        console.error("❌ Erro:", err.message);
        perguntar();
      }
    });
  };

  perguntar();
}

main().catch(console.error);
