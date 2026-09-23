# Chat: metricas e publicacao protegida

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
