# Vendas reais por campanha (Kiwify / Hotmart)

Base do ROAS real e do futuro preset de funil perpetuo. Antes disto o MecProAI
nao media venda: `campaign_scores` tinha zero linhas com `roas > 0`.

## Como funciona

1. **Atribuicao no anuncio.** `publishToMeta` (router.ts) envia `url_tags` no
   criativo: `utm_source=mecproai&utm_medium=paid_social&utm_campaign=mp{campaignId}&utm_content={{ad.id}}&utm_term={{adset.id}}&src=mp{campaignId}`.
   Os `{{...}}` sao trocados pela Meta no clique. So aplica quando o destino e
   link de site (`shouldApplyUrlTags`): nunca em WhatsApp, formulario nativo,
   link de Facebook/Instagram ou link que ja tem `utm_*`/`src`/`sck` do cliente.
   Se a Meta recusar o criativo com `url_tags`, tenta uma vez sem (rastreio
   nunca bloqueia publicacao).
2. **Webhook.** `POST /api/webhook/sales/:provider/:token` (index.ts, antes do
   json parser global). Uma URL por projeto e plataforma, criada em
   `trpc.sales.createIntegration` ou pela tool MCP `create_sales_webhook`.
   Token de 192 bits na URL e a autenticacao. `verifySecret` opcional:
   Hotmart compara `X-HOTMART-HOTTOK`; Kiwify valida `?signature=` como
   HMAC-SHA1 do corpo (**nao confirmado com evento real**).
3. **Gravacao.** `sales_events`, idempotente por `(integrationId, externalOrderId)`:
   o mesmo pedido muda de status (aprovado -> reembolsado) na mesma linha.
   Atribuicao sempre restrita ao projeto da integracao, na ordem:
   `mp{id}` em utm_campaign/src/sck > `metaAdId` > `metaCampaignId`.
4. **Relatorio.** `trpc.sales.summary` / tool MCP `get_sales_report`: vendas,
   receita, reembolsos, gasto (campaign_metrics), custo por venda e ROAS por
   campanha. Linha `campaignId: null` = venda sem atribuicao.

## Privacidade (LGPD)

E-mail do comprador vira sha256. `raw` e gravado sem chaves pessoais
(`sanitizePayload`: customer, buyer, email, cpf, phone, address...).

## Pontos nao confirmados

- Caminhos dos campos dos payloads (Kiwify `Commissions.charge_amount` em
  centavos, `TrackingParameters`; Hotmart v2 `data.purchase.price.value` em
  reais, `data.purchase.origin.src`). Conferir no primeiro evento de teste
  (`recentEvents` mostra o que chegou; `raw` guarda o payload sanitizado).
- A Hotmart nao repassa `utm_*` de forma confirmada; por isso `src=mp{id}`.
- A pagina de venda do cliente precisa repassar UTMs/`src` ao link de checkout.
  Sem isso a venda chega, mas sem atribuicao.
- O relatorio nao muda o otimizador da Meta: para a Meta otimizar por compra,
  o evento Purchase precisa chegar via Pixel no checkout ou API de Conversoes.

## Proximos passos

- Regra diaria de pausar/escalar por custo por venda (gasta dinheiro: exige
  confirmacao explicita antes de agir na Meta).
- Preset "Vendas no automatico para cursos" em cima deste dado.
- Tela no projeto para criar a URL e ver o relatorio.
