# Autonomia de rascunhos - implementacao inicial

Estado: alteracoes locais, sem deploy. Testes de runtime bloqueados por EPERM no Node.

O chat reutiliza evaluateCampaignBriefingReadiness antes de criar projeto ou preparar midia. Dados ausentes retornam perguntas. Contato explicitamente informado e gravado no perfil para o gate posterior reconhecer o mesmo destino.

runChatDraftTask reutiliza mcp_idempotency_keys com namespace chat_draft e isolamento por usuario. A chave e um hash do historico e anexos: o registro nao armazena fotos/base64. Durante a execucao, repeticoes retornam processamento em andamento. Ao terminar, guarda o resultado para reutilizacao, inclusive erros controlados. Nao reabre tarefas automaticamente.

Timeout limita a espera, nao cancela generateCampaign. A tarefa permanece reservada e pode terminar em segundo plano. Se o processo morrer ou a gravacao do resultado falhar, exige reconciliacao manual com as campanhas existentes; nao repetir automaticamente uma acao cujo resultado e incerto.

Limites: idempotencia cobre o mesmo payload, nao uma nova conversa ou mensagem diferente. O mecanismo nao e uma fila duravel de execucao, nem oferece retomada automatica depois de reinicio. Nao existe ainda limite monetario agregado de inferencia, painel de tarefas, memoria de licoes aprovadas ou otimizacao autonoma de campanhas publicadas. Reparo e validacao continuam os do motor existente; esta frente nao certifica sua qualidade.

Proximas entregas: testes de concorrencia com PostgreSQL isolado, identificador de tarefa persistido no cliente, endpoint autenticado de acompanhamento, reconciliacao de resultado incerto, limites de custo e tentativas de reparo. Nenhuma permissao de publicacao automatica e adicionada.
