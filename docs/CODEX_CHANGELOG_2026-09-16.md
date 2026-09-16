# Entrega Codex - 2026-09-16

Registro das alteracoes feitas pelo Codex nesta sequencia de trabalho. Os hashes
abaixo foram conferidos no historico local. Commit local nao comprova push,
deploy no Render nem validacao em producao. Nenhuma campanha foi publicada ou
alterada na Meta durante estas mudancas.

## Commits

| Commit | Entrega | Validacao local registrada |
| --- | --- | --- |
| cf38880 | Chat responde perguntas gerais, distingue consultas de acoes, recupera erros de ferramentas e aceita null apenas em campos opcionais do schema. DeepSeek com erro de saldo entra em cooldown por credencial por 15 minutos. | 18 testes de chat, briefing e workspace |
| 71ba7a9 | Prompt de imagem prioriza produto e fatos confirmados; remove suposicoes visuais de luxo/mobilia e pessoas obrigatorias. Cache inclui contexto da oferta. Busca de sala comercial prioriza o tipo do imovel sobre a cidade. | 6 testes de imagem/prompt |
| 7f2df58 | Gemini/Groq: uma pausa de 250 ms por rodada em erros temporarios e janela de 12 s para iniciar novas tentativas. Rotacao de credenciais preservada dentro da janela. | 8 testes de retry e politica do chat |
| 01276de | Chat orientado a responder em 1-3 frases, agrupar ate 3 dados obrigatorios ausentes e gerar o rascunho solicitado sem confirmacao redundante. Reutiliza briefing e preserva autorizacao separada para publicar. | 12 testes de politica e briefing |
| f57f3ec | Recuperacao local de regras por segmento, ampliacao do Fact Guard, snapshot completo dos fatos e revalidacao na publicacao Meta. Bloqueia troca automatica do objetivo. | 61 testes de fatos, intencao e quality gates; sintaxe dos cinco modulos alterados verificada |

Os totais acima pertencem a execucoes diferentes e sobrepostas; nao devem ser
somados como quantidade de testes distintos. Verificacao de sintaxe nao equivale
a typecheck completo nem a teste de integracao com provedores.

## Validacao de campanhas

- Ja existiam `imageRAG` e recuperacao de licoes operacionais. Foi acrescentada
  recuperacao deterministica de regras de `shared/segmentConfig`, com origem e
  versao, sem base vetorial nova e sem trazer exemplos de outros clientes.
- Regras editoriais e fatos comerciais ficam separados no prompt. RAG nao
  transforma uma sugestao em fato confirmado nem garante ausencia de alucinacao.
- `CampaignFacts.intent` registra segmento resolvido e objetivo. O Fact Guard
  rejeita metadados conflitantes e falhas de alinhamento de segmento registradas.
- Sala comercial nao aceita expressoes como "novo lar", "sua familia" ou
  "prontas para morar". Alegacoes como disponibilidade imediata, sem burocracia
  e tranquilidade garantida precisam de suporte no contexto confirmado.
- A validacao final de geracao inclui criativos e conjuntos de anuncios.
- A geracao salva o snapshot completo de fatos em `aiResponse.campaignFacts`.
- A mutation compartilhada `publishToMeta` revalida criativos salvos e overrides
  textuais antes da publicacao; criativos com `needsReview` nao passam.
- O objetivo Meta resolvido deve preservar o objetivo da campanha. O alias
  branding/awareness e aceito; mudar sales para traffic automaticamente nao e.

## Impactos operacionais

Campanhas antigas sem snapshot completo precisam ser regeneradas antes de uma
nova publicacao. O perfil atual nao e usado como prova retroativa do briefing.
Anuncios ja ativos nao sao pausados nem alterados por estas regras.

Uma combinacao de destino/pixel antes atendida por troca automatica de objetivo
agora pode ser bloqueada. Corrija a configuracao ou escolha explicitamente o
objetivo adequado em uma nova campanha; nao contorne a validacao.

A janela de retry do chat NAO e timeout total: chamadas SDK em andamento,
retries internos dos SDKs, banco, DeepSeek e geracao de campanha podem demorar
mais. Nao foi implementado streaming. A concisao e uma instrucao compartilhada
entre provedores, nao truncamento de texto nem garantia de obediencia do modelo.

## Pendencias e limites

- Confirmar no GitHub/Render quais hashes foram enviados e implantados.
- Testar conversa real com briefing completo e incompleto, anexos e correcoes.
- Medir latencia real e validar imagens geradas nos provedores configurados.
- Revalidar campanhas antigas e testar publicacao controlada com autorizacao.
- Auditar caminhos de publicacao Google/TikTok separadamente; a nova checagem de
  publicacao foi integrada ao caminho Meta, nao a todas as plataformas.
- Regras lexicais nao detectam toda parafrase ou troca semantica de segmento.
  Heranca de dados do perfil e veracidade visual ainda precisam de auditoria.
- Rotulo de orcamento mensal versus total e checklist visual de aprovacao/pixel
  permanecem pendencias de interface, nao foram corrigidos por esta entrega.
- Permanecem os achados anteriores de anexos: URLs arbitrarias, persistencia
  antes de existir sessao, remocao somente local, erros de banco silenciados e
  concorrencia na lista de fotos. Nao atribuir sua correcao a estes commits.

## Documentacao detalhada

- [Politica do chat](chat-conversation-policy.md)
- [Latencia e retries](chat-latency.md)
- [Alinhamento visual](visual-prompt-alignment.md)
- [Integridade de intencao e publicacao](campaign-intent-integrity.md)

## Regressao local

```powershell
node --preserve-symlinks --preserve-symlinks-main --import tsx --test --experimental-test-isolation=none server/__tests__/chatReasoning.test.ts server/__tests__/chatBriefing.test.ts server/__tests__/chatRetryBudget.test.ts
node --preserve-symlinks --preserve-symlinks-main --import tsx --test --experimental-test-isolation=none server/__tests__/visualPrompt.test.ts server/__tests__/imageGeneration.test.ts
node --preserve-symlinks --preserve-symlinks-main --import tsx --test --experimental-test-isolation=none server/__tests__/campaignIntent.test.ts server/__tests__/campaignFactGuard.test.ts server/__tests__/campaignQualityGate.test.ts
```
