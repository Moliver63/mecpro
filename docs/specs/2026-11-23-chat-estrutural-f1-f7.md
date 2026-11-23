# Chat: correcao estrutural F1 a F7

Branch `fix/chat-estrutural-f1-f7` (a partir de `main` em 7945c4d). Sem migracao de banco.

## Problema (auditoria de 23/11)
- F1/F2: o verificador de fatos so protegia imoveis e profissoes reguladas. Em `outro`
  (agro, logistica, B2B...) preco, premio, percentual e cliente inventados passavam. Segmento
  `outro` era o destino de quase tudo que nao casava palavra-chave.
- F3/F4: cada provedor de IA tinha seu proprio laco de ferramentas, sem memoria entre eles.
  Uma troca de provedor no meio do turno podia repetir ferramenta com efeito. A resposta sem IA
  era a mesma sempre.
- F5/F6: `selecionar_conta_meta` exigia `campaignId`; o chat nao listava contas antes do rascunho.
  O piso de R$ 5,11/conjunto/dia era apresentado como regra da Meta.
- F7: video anexado nao sobrevivia a recarregar a pagina; o dono do video era checado so em memoria.

## Mudanca
| Item | Arquivos | Regra |
|---|---|---|
| F1/F2 | `factualClaimGate.ts`, `campaignFactGuard.ts`, `chatBriefing.ts`, `shared/segmentInference.ts`, `ai.ts` | Alegacao factual (credencial, percentual, garantia, prova social numerica, tempo de mercado, ranking, cliente nomeado) so passa se estiver no briefing/perfil. Linguagem comum de anuncio nao e alegacao. Forma regulada (saude, juridico, financeiro) continua proibida mesmo confirmada. Segmento inferido por lexico quando cai em `outro`. |
| F3/F4 | `chatToolLedger.ts`, `chatProviderChain.ts`, `chatReasoning.ts`, `chat.ts` | Ferramenta com efeito roda uma vez por atendimento (so sucesso e cacheado). Cadeia com saude por provedor (janela 90 s), teto de 75 s. Resposta sem IA varia por intencao e nunca repete a anterior. |
| F5/F6 | `metaAdAccountChoice.ts`, `shared/metaBudgetRules.ts`, `shared/campaignQualityGate.ts`, `chat.ts` | Conta listada e escolhida na sessao sem `campaignId`, aplicada ao rascunho na criacao. Cada numero de orcamento leva a origem: `api_meta`, `regra_interna` ou `recomendacao_comercial`. Orcamento nunca e alterado sozinho; soma dos conjuntos acima do total bloqueia. |
| F7 | `chatAttachments.ts`, `db.ts`, `chat.ts` (`/upload-video`), `chatCreativeVideo.ts`, `useCampaignChat.ts` | Video guardado em `pendingPhotoUrls` com `kind:"video"` (sem migracao), dedupe por URL e sha256. Dono do video: memoria OU sessao do proprio usuario no banco; falha na consulta nega. Gerar campanha consome fotos e preserva videos. Nota de etapa e anexos injetada no turno. |

## Fora do escopo
Publicar, alterar campanha publicada (819 intacta), mexer em orcamento, segredos ou deploy.

## Riscos conhecidos
- Sem Postgres nem LLM no ambiente de teste: o handler Express real nao foi exercitado; propagacao do
  `AsyncLocalStorage` do livro de ferramentas so por teste de unidade.
- `min_daily_budget` da Meta (unidade) nao foi lido ao vivo.
- Saude dos provedores e em memoria, por instancia.
- Inferencia de segmento e lexico, nao classificador.

## Tabela Goldfish
| # | Classe | Apontamento | Decisao |
|---|---|---|---|
| 1 | BLOQUEANTE | `cliente_nomeado` bloqueava "Atendemos Via WhatsApp/Segunda a Sexta"; "sem riscos" tratado como garantia | Corrigido: lista de palavras que nao sao cliente; "sem risco" removido da garantia. Teste de regressao. |
| 2 | BLOQUEANTE | Area regulada detectada por qualquer palavra do briefing | Corrigido: segmento conhecido manda; so `outro` olha o que o anunciante vende (`negocioRaw`). Teste. |
| 3 | BLOQUEANTE | "+10 mil alunos", "milhoes", "satisfacao garantida", parceiro oficial, marcas como X, "somos a maior", registro, premio passavam | Corrigido nos padroes. Teste. |
| 4 | RISCO | Soma dos conjuntos e piso da conta nao ligados a porta de qualidade (nada preenche os campos) | Corrigido: o gate usa `planoDeOrcamento` (mesmo plano da publicacao) para a soma dos conjuntos; moeda e minimo da conta entram no gate; texto da readiness deixou de chamar R$ 5,11 de exigencia da Meta. Testes. |
| 5 | RISCO | Saude dos provedores global entre usuarios; teto so checado antes de cada provedor | Corrigido: o provedor so entra em espera apos 2 falhas de modelo em 30 s. O provedor em andamento continua sem corte (cortar deixaria ferramenta rodando solta). |
| 6 | RISCO | Livro de ferramentas: mesmos argumentos repetidos depois de outro valor devolvem "ja executado" | Corrigido: livro por tentativa; repeticao entre provedores consome em ordem, pedido novo no mesmo provedor executa. Testes. |
| 7 | RISCO | `clearPendingChatPhotos` nao atomico; 10 fotos expulsavam o video | Corrigido: UPDATE unico; limite de 10 por tipo. |
| 8 | RISCO | `/upload-video` com sessao invalida criava sessao nova; upload antes do dedupe | Corrigido: 400/404, dedupe por sha antes do upload. |
| 9 | RISCO | Nota de retomada contradizia nova campanha e usava campos errados | Corrigido. |
| 10 | RISCO | Conta da sessao aplicada a cada `gerar_campanha` sem reconfirmar | Corrigido: a escolha vale para a primeira campanha; a segunda pede confirmacao e nao troca a conta da conexao em silencio. |

## Adendo 23/11 (final): segurança do chat antes do deploy

| # | Pendência | Resolução | Evidência |
|---|---|---|---|
| 1 | Orçamento | `shared/orcamentoDoRascunho.ts` liga a soma dos conjuntos à geração (`ai.ts`, com rebalanceamento) e à edição (`chatWorkspace`, `campaignDraftEdit`). Tolerância zero acima do aprovado; total do período = diário × dias. | `orcamentoDoRascunho.test.ts` |
| 2 | Conta Meta | Confirmação por campanha (`CONFIRMAR CONTA META`); conta anterior só como sugestão; conexão nunca muda em silêncio; Instagram vinculado exibido. | `chatVideoEContaMeta.test.ts` |
| 3 | Comandos repetidos | Livro por tentativa: 100/200/100 executa; falha técnica não é memorizada; usuários isolados. | `chatResilience.test.ts` |
| 4 | Saúde dos provedores | Circuito: 429 abre na hora (Retry-After), falhas de modelo exigem 3 falhas de ≥2 usuários, sonda única, sucesso fecha. Estado por instância. | `chatResilience.test.ts` |

Riscos restantes: circuito não abre com um único usuário ativo e falha de modelo (teto de 75 s limita o custo); estado por instância; ordem do livro entre tentativas com ferramentas no mesmo campo; conexão Meta continua global por usuário (campanhas confirmadas em outra conta ficam bloqueadas até reconfirmar); rascunhos antigos sem `confirmada` pedem confirmação uma vez; Page x conta não verificadas como mesmo negócio.
