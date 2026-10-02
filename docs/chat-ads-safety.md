# Chat: metricas e publicacao protegida

## Correcao local - 2026-10-02

- Saida compartilhada intercepta pedidos de pageId ou instrucao para executar
  consultar_paginas_meta e consulta a conta autenticada, exibindo nomes.
- Recuperacao somente leitura; nao declara campanha pronta, nao publica e nao
  substitui a confirmacao de snapshot exigida por publishChatAds.
- Testes simulados: uma pagina, varias, nenhuma, falha e respostas normais.
- Validacao real na conta Meta e deploy ainda necessarios.

## Correcao Codex - 2026-10-01

- Pagina omitida e resolvida apos verificar propriedade e antes da confirmacao.
- Uma Pagina gera preview; varias exigem escolha; nenhuma impede publicacao.
- Confirmacao e execucao usam o mesmo ID resolvido. Mudanca de Pagina exige
  nova confirmacao. Idempotencia e destino HTTPS explicito permanecem.
- Geracao salva os objetivos alinhados que passaram pelo Fact Guard, em vez
  dos metadados originais conflitantes. Nenhuma campanha existente foi editada.
- Testes de regressao adicionados com dependencias simuladas; nao houve
  publicacao real. Validacao local pode exigir permissoes do runtime Node.

Atualizacao local Codex, 2026-09-23.

- Gemini, DeepSeek e Groq recebem as mesmas duas consultas: metricas diarias
  salvas de uma campanha e relatorio unificado Meta/Google/TikTok via tRPC.
- Consulta de campanha verifica propriedade; periodos e plataformas sao
  validados no servidor. Ausencia/falha nao representa resultado zero.
- Respostas sao resumidas (ate 8 itens por lista, limite de tamanho). Nao
  somar essa amostra como se fosse o total. Consulta externa aguarda ate 10s;
  o timeout nao cancela as requisicoes internas do relatorio.
- Publicacao Meta pelo chat exige frase exata na mensagem atual, vinculada
  ao usuario, campanha, snapshot e parametros. Mudancas invalidam a frase.
- Destino HTTPS explicito obrigatorio. Formulario instantaneo deve usar a
  tela de publicacao; o chat nao resolve um destino implicitamente.
- Reserva persistente por usuario/campanha impede repeticao via chat, inclusive
  entre provedores. Resultado parcial ou incerto requer verificacao manual;
  nao libera nova tentativa automatica. A reserva nao cobre publicacoes feitas
  por outros caminhos (interface/MCP).
- Auditorias existentes e publicacao pausada continuam no servico compartilhado.

Testes locais com dependencias simuladas cobrem propriedade, entradas,
ausencia de dados, confirmacao, alteracao de orcamento, concorrencia, cache
e erro incerto. Nao foi feita publicacao real nem validacao das APIs em producao.
