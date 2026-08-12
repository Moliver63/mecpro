# Headroom — Padrões de Compressão de Contexto

> Fonte: github.com/headroomlabs-ai/headroom (Apache 2.0, ~65k stars)
> Extraído em: 2026-08-12 — conceitual apenas, nenhum código copiado.
> **Cauteloso antes de instalar.** Ver seção de Riscos.

## O que é

Camada de compressão que fica entre o agente e o LLM, comprimindo saídas de
ferramentas, logs, arquivos e chunks de RAG antes de chegar ao modelo.
Resultados documentados: 20% de economia em código, 60-95% em JSON, mantendo
a mesma qualidade de resposta em benchmarks (GSM8K, TruthfulQA, SQuAD v2).

## Padrões que valem a pena estudar

### 1. ContentRouter — detectar tipo de conteúdo antes de comprimir
Em vez de um compressor genérico, o Headroom detecta se o conteúdo é JSON,
código (AST-aware) ou prosa, e aplica um compressor específico pra cada tipo.
Compressão de JSON não é a mesma técnica que compressão de código.

**Aplicação no MecProAI:** você já lida com prompts longos pro Gemini
(`shared/subsegments.ts`, `learning_base`). Separar "compressão de dados
estruturados da API Meta" de "compressão de texto livre do cliente" antes de
montar o prompt final economiza tokens sem perder precisão.

### 2. Live-zone compression (não quebrar cache de prefixo)
Só o conteúdo novo (última saída de ferramenta, último turno) é comprimido —
o prefixo "congelado" do prompt permanece byte-idêntico, preservando o cache
de prompt do provedor. Comprimir o histórico inteiro a cada chamada destrói
o cache e aumenta custo, não diminui.

**Aplicação direta:** isso conecta com seu bug de cache de RAM já corrigido —
o princípio geral é "nunca reescreva o que já está em cache, só o que é novo".

### 3. Compressão reversível (CCR)
O original comprimido fica guardado localmente; se o modelo precisar do
detalhe completo depois, ele pode "pedir de volta" via uma ferramenta de
retrieval, em vez de a informação ser perdida permanentemente.

**Aplicação:** útil para o seu `pendency question module` — resumir o perfil
do cliente pro prompt, mas manter o dado completo recuperável se precisar
depois numa auditoria de campanha.

### 4. Redução de tokens de saída, não só de entrada
Ideia pouco óbvia: você paga também pelo que o modelo *escreve de volta*, e em
modelos classe Opus, a saída custa ~5x mais que a entrada por token. Reduzir
preâmbulos ("Ótimo, deixa eu...") e reformulação desnecessária de código já
mostrado economiza uma fatia real do custo que ninguém otimiza.

**Aplicação:** revisar os prompts de sistema do MecProAI para instruir
respostas diretas do Gemini, sem preâmbulo — mesmo princípio, sem precisar da
ferramenta.

## Riscos identificados

- Roda como proxy local com acesso a todo o tráfego entre seus agentes e os
  provedores de LLM — mesma categoria de risco do OmniRoute (interceptação de
  tráfego), mesmo sendo Apache 2.0 e tecnicamente mais transparente.
- Tem modo de "aprendizado" (`headroom learn`) que analisa sessões passadas e
  escreve automaticamente em `CLAUDE.md`/`CLAUDE.local.md` — ou seja, ele pode
  alterar as instruções que o Claude segue no seu projeto sem você editar
  manualmente. Vale revisar esses arquivos depois de qualquer uso.
- Se decidir testar, testar primeiro em modo **library** (`compress()` chamado
  explicitamente no seu código) em vez de `wrap`/`proxy`, que interceptam tudo
  automaticamente.

**Conclusão:** os padrões de compressão por tipo de conteúdo e "live-zone" são
diretamente aplicáveis ao seu pipeline Gemini sem precisar da ferramenta.
