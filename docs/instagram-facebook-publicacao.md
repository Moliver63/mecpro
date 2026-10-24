# Publicar no Instagram e no Facebook pelo MecProAI

> Estado em 2026-10-24: **nao implementado, e bloqueado por revisao da Meta.**
> Este documento existe pra que o pedido de revisao comece agora, porque ele e
> o caminho critico. Codigo sem permissao e porta pra parede.

## O que ja esta pronto

As habilidades de conteudo (`server/skills/`, carregadas por
`server/aiSkills.ts`) funcionam hoje e nao dependem de permissao nenhuma. Elas
melhoram o texto que o produto gera, em qualquer modelo da cadeia.

O resto da infraestrutura tambem ja existe e sera reaproveitada:

| Necessario pra publicar | Onde ja esta |
|---|---|
| Gerar copy com guarda de fato | `ai.ts` + `campaignFactGuard.ts` |
| Pontuar qualidade do criativo | `creativeScoringEngine.ts` |
| Gerar e validar imagem | `imageGeneration.ts` + `campaignImageValidator.ts` |
| Hospedar midia em URL publica | Cloudinary (a Meta busca a midia por URL) |
| OAuth da Meta e guarda de token | `router.ts` `getMetaAuthUrl` / `exchangeMetaCode` |
| Resolver a Pagina do Facebook | `list_meta_pages`, e `ai.ts` ja resolve username do Instagram pra pageId |
| Confirmacao amarrada ao conteudo | `chatCreativeEdit.ts` `tokenDeAprovacao` |
| Protecao contra duplicata | `db.reserveMcpIdempotencyKey` |

## O que falta, e e com a Meta

### Permissoes a acrescentar

Hoje o OAuth pede (`router.ts`, `getMetaAuthUrl`):

```
ads_management, ads_read, business_management, pages_read_engagement,
pages_show_list, leads_retrieval, whatsapp_business_management, public_profile
```

Para publicar, faltam:

| Permissao | Pra que |
|---|---|
| `instagram_basic` | ler a conta do Instagram vinculada a Pagina |
| `instagram_content_publish` | publicar imagem, carrossel, reels e stories |
| `instagram_manage_insights` | metricas do perfil e dos posts |
| `pages_manage_posts` | publicar no feed da Pagina do Facebook |

No codigo isso e acrescentar strings naquela lista. O trabalho real e a
revisao.

### Por que isso e mais facil do que parece

O app ja passou por App Review. `ads_management` e `business_management` com
Acesso Avancado nao sao concedidos sem revisao e sem verificacao de negocio, e
o produto publica campanha real de cliente. Entao nao e comecar do zero: e
submissao incremental de permissoes novas num app ja verificado.

### Requisitos da conta do cliente

- Conta do Instagram **profissional** (Business ou Creator).
- Vinculada a uma Pagina do Facebook.
- Autorizacao de Publicacao da Pagina concluida, quando a Pagina exigir. Sem
  isso a publicacao e bloqueada mesmo com permissao concedida.

## Como a publicacao funciona

Duas chamadas, sempre:

1. `POST /<IG_ID>/media` com `image_url` ou `video_url` e `media_type`
   (`IMAGE`, `REELS`, `STORIES`, `CAROUSEL`). Devolve um id de conteiner.
   Carrossel cria um conteiner filho por item e depois um conteiner
   `CAROUSEL` com os filhos em `children`.
2. `POST /<IG_ID>/media_publish` com `creation_id` igual ao id do conteiner.

Se a publicacao nao devolver id de midia, consulta-se o `status_code` do
conteiner. A recomendacao da Meta e checar uma vez por minuto, por no maximo
cinco minutos.

A midia precisa estar acessivel publicamente por URL no momento da
publicacao, porque quem busca e a Meta. Cloudinary atende.

Limite: 100 publicacoes por conta em 24h corridas. Carrossel conta como uma.
Da pra consultar o consumo no endpoint `content_publishing_limit`.

## Desenho sugerido das ferramentas MCP

Post, reel e carrossel usam o mesmo fluxo, mudando `media_type`. Entao nao
fazem cinco ferramentas, fazem duas:

- `criar_conteudo_social` — monta o conteiner, devolve preview e o id, **sem
  publicar**. Roda as mesmas validacoes de copy e imagem que a campanha roda.
- `publicar_conteudo_social` — publica um conteiner ja criado, exigindo a
  frase de confirmacao amarrada ao conteudo, no padrao de
  `tokenDeAprovacao`.

Mais `consultar_insights_social`, que e leitura.

Essa separacao e o que atende a Etapa 5 do pedido: previsualizacao antes,
confirmacao explicita depois, e a confirmacao validada no backend contra o
conteudo aprovado.

**Importante:** copie o padrao de confirmacao do CHAT, nao o do MCP. O
`publish_campaign` do MCP publica na primeira chamada, sem token; a protecao
dele e a instrucao na descricao, nao o codigo. Para conteudo organico, que vai
pro perfil do cliente, a protecao tem que estar no codigo.

## O que nao da, por API oficial

- Automacao de engajamento (seguir, curtir em massa, responder em volume).
  Nao existe na API e, por fora, viola os termos e poe a conta em risco.
- Publicar em conta pessoal. So profissional.

## Ordem recomendada

1. Abrir a submissao de App Review com as quatro permissoes. O relogio e da
   Meta, entao comeca primeiro.
2. Enquanto espera, usar as habilidades de conteudo, que ja funcionam.
3. Implementar as ferramentas quando a permissao sair.
