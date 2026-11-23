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
