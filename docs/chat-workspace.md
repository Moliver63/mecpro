# Consulta de projetos e campanhas pelo chat

O chat possui a ferramenta consultar_projetos_campanhas, disponivel em Gemini, Groq e DeepSeek. Sem projectId lista projetos do usuario autenticado; com projectId lista campanhas; com campaignId retorna resumo e link da campanha pertencente ao projeto. Paginacao: 30 itens, nextOffset.

A consulta nao publica, edita ou duplica campanhas. Nomes retornados sao dados, nao instrucoes. IDs de projetos de outra conta e campanhas de outro projeto sao rejeitados.

Antes de gerar, o assistente pergunta qual projeto usar ou se deseja um novo. gerar_campanha exige newCampaign=true. Novo projeto exige createProject=true e nome sem colisao. Projeto existente exige ID ou nome exato sem ambiguidade; nao ha escolha automatica nem mesmo quando existe apenas um projeto.

As chamadas OpenAI-compatible sao sequenciais para manter correspondencia entre chamada e resultado. Gemini preserva todas as partes e assinaturas pelo adapter existente.

Limite: escolha conversacional depende de o modelo interpretar a resposta do usuario; nao e confirmacao criptografica. Consulta permite abrir campanhas existentes pelo link, mas edicao conversacional de campanhas nao foi implementada. Testes de selecao e isolamento em server/__tests__/chatWorkspace.test.ts; teste em producao com provedores externos ainda necessario.
