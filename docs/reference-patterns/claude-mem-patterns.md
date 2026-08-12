# Claude-Mem — Padrões de Memória Persistente

> Fonte: github.com/thedotmack/claude-mem (Apache 2.0, ~90k stars)
> Extraído em: 2026-08-12 — conceitual apenas, nenhum código copiado.
> **Não recomendado instalar** — você já tem um sistema equivalente manual.

## O que é

Sistema que captura observações durante sessões do Claude Code, comprime com
IA, e injeta de volta em sessões futuras. Usa 5 hooks de ciclo de vida
(SessionStart, UserPromptSubmit, PostToolUse, Stop, SessionEnd), um serviço
worker local, SQLite + banco vetorial Chroma para busca híbrida.

## Padrões que valem a pena estudar

### 1. Divulgação progressiva em 3 camadas (economia de ~10x tokens)
Em vez de recuperar o histórico completo, o sistema busca em camadas:
1. `search` → índice compacto (~50-100 tokens/resultado)
2. `timeline` → contexto cronológico ao redor de um resultado específico
3. `get_observations` → detalhe completo, só para os IDs já filtrados

**Aplicação direta no seu workflow:** ao invés de sempre reler `docs/`
(SYSTEM_MEMORY.md, FRAMEWORK_EXCELENCIA.md) inteiro antes de cada sessão de
código — que é seu padrão atual — um índice leve com IDs/resumos, seguido de
leitura completa só do que for relevante à tarefa do dia, economizaria
contexto sem perder a regra de "sempre ler docs/ antes de codar".

### 2. Tags de privacidade explícitas (`<private>`)
O sistema permite marcar trechos de conversa para excluir da memória
persistente — controle manual e explícito do que entra na base, em vez de
gravar tudo por padrão.

**Aplicação:** se você formalizar seu `SYSTEM_MEMORY.md` como um sistema mais
estruturado no futuro, vale adotar esse princípio — dados de cliente (KYC,
tokens, contratos) nunca entram na camada de "memória de longo prazo" por
padrão, só ficam nela se explicitamente marcados.

## Por que não vale instalar no seu caso

Você já resolve o problema central (continuidade entre sessões) de forma
manual e mais controlada: `SYSTEM_MEMORY.md`, `FRAMEWORK_EXCELENCIA.md`, e a
prática de sempre ler `docs/` antes de codar já cumprem a função que essa
ferramenta automatiza. A ferramenta adiciona: um worker sempre ativo, um banco
SQLite + vetorial rodando localmente, e captura automática de "tudo que o
agente faz" — mais superfície de risco pra dados de múltiplos clientes sem
ganho proporcional, já que seu problema de memória já está coberto.

**Conclusão:** o único padrão com valor real de importar é a divulgação
progressiva em camadas — pode informar como você estrutura os `docs/` para
leitura mais eficiente, sem precisar do sistema inteiro.
