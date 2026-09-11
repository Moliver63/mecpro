# Auditoria de arquitetura de IA

Data: 2026-09-10. Branch: feat/model-agnostic-ai-kimi-modal.
Estado: levantamento inicial de codigo; nao representa certificacao completa ou benchmark de producao.

## Arquitetura encontrada

- Express/tRPC e MCP convergem em server/ai.ts:generateCampaign. O chat tambem usa esse motor.
- server/ai.ts mistura transporte Gemini REST, DeepSeek, Groq, Anthropic, OpenRouter e GenSpark com prompts, estrategia, recuperacao SQL, reparo e geracao.
- server/chat.ts tem outra cadeia de providers, usando Google GenAI SDK, Groq SDK e DeepSeek HTTP. A saude desses providers nao e compartilhada com o gerador.
- server/imageRAG.ts faz transporte de visao diretamente. server/imageGeneration.ts administra transporte de imagens e armazenamento.
- server/campaignFactGuard.ts fornece CampaignFacts, buildCampaignFacts e validateCampaignFactIntegrity: preservar como autoridade deterministica.
- shared/campaignQualityGate.ts separa estagios generate/media/publish/optimize. A publicacao passa ainda por server/mcpServer.ts e server/_core/router.ts; os dois caminhos precisam de testes de equivalencia.
- shared/segmentConfig.ts possui registro, fallback e deteccao; server/ai.ts ainda possui SEGMENT_COPY_RULES e deteccao relacionada. campaignProfile.ts importa inferOfferType do modulo monolitico.
- learning_base e winner_patterns sao consultados em ai.ts, inclusive em buildCampaignFromAds e generateCampaign. Esse conhecimento e persistido fora dos providers; sua recuperacao ainda esta acoplada ao orquestrador.

## Diagnostico e riscos

Classificacao preliminar: B, parcialmente multi-segmento. Existem registros e testes para diferentes segmentos, mas regras e deteccao duplicadas impedem afirmar independencia completa.

1. chat.ts reconstruia somente functionCall da primeira ferramenta, descartando parts e assinaturas da resposta Gemini. Chamadas paralelas tambem ficavam sem resposta.
2. O log fornecido mostra DeepSeek HTTP 402, Gemini suspenso e Groq interpretado com zero criativos, seguido de normalizacao para quatro cards. Resposta HTTP valida nao equivale a campanha valida.
3. O aprimoramento tenta Gemini novamente apos falha permanente; o contador de tentativas no log nao corresponde necessariamente ao executado.
4. destinationUrl e opcional na declaracao do chat, mas falta verificar o contrato em todos os pontos de entrada. Omissao e null nao sao equivalentes.
5. imageGeneration.ts envia width/height em dois caminhos Cloudflare. Validar o modelo configurado e seu schema antes de modificar os parametros.
6. Os logs registram erros externos crus: o exemplo fornecido expoe credencial Gemini. Sanitizacao central e necessaria.
7. Nao ha evidencia neste levantamento de benchmark de alinhamento visual ou de isolamento semantico completo entre preco e verba em todos os prompts.
8. O bloqueio de destino de leads ocorre depois da geracao custosa. Antecipar prontidao e retornar perguntas estruturadas.

## Arquitetura proposta

Core (fatos, segmentos, aprendizado, validacao, publicacao) -> roteador por tarefa -> gateway -> adapters. Transportes e metadados de protocolo pertencem aos adapters. Nao executar ferramentas com efeitos colaterais em shadow mode.

Contrato deve declarar tarefa, contexto factual separado da verba, schema, capacidades, deadline e limite de tokens. Resposta deve declarar provider/modelo, uso, latencia, resultado validado e erro tipado. Fallback deve receber o mesmo contexto factual e schema, sem reduzir silenciosamente o briefing.

## Plano e arquivos

1. Testar e corrigir protocolo Gemini em server/chat.ts e adapter isolado.
2. Extrair transportes de ai.ts/chat.ts/imageRAG.ts sem mudar prompts ou regras; manter compatibilidade via wrappers temporarios.
3. Implementar gateway, registro, roteamento e circuit breaker com testes de timeout, erro permanente, fallback e schema invalido.
4. Fortalecer campanha factual: testes de preco 5000 versus verba 6, especializacao nao confirmada, destino ausente e reparo revalidado.
5. Consolidar shared/segmentConfig.ts e regras de ai.ts; medir alinhamento de imagens com exemplos positivos e negativos.
6. Adicionar adapter OpenAI-compatible para Kimi e configuracao por tarefa, inicialmente desativado.
7. Selecionar modelo e infraestrutura somente apos conferir fontes oficiais, memoria GPU, licenca e custo. Deploy Modal e benchmark real dependem de conta, GPU e endpoint; nao foram executados.
8. Shadow mode somente para inferencia, sem salvar/publicar campanhas; registrar metricas sem copiar dados pessoais para logs.
9. Benchmark por segmento e comparacao de custos; recomendar migracao apenas com resultados medidos.

## Validacao e limites

Nao alterar producao nem publicar campanhas nesta branch. Preservar alteracoes locais preexistentes em chat.ts. Auditoria completa de todos os consumidores, schemas, aprendizagem e imagens ainda pendente. Nao declarar Kimi funcionando ou independencia de Gemini enquanto os transportes diretos persistirem.

Referencia de protocolo: https://ai.google.dev/gemini-api/docs/generate-content/thought-signatures
