# ScrapeGraphAI — Pesquisa e Decisão (não implementado)

**Status:** 🔴 Em espera — NÃO integrar ainda. Ver bloqueios abaixo.
**Data da análise:** 19/08/2026
**Contexto:** Análise feita via Conselho de LLMs (5 conselheiros + revisão por pares + veredito presidencial).

---

## O que é

ScrapeGraphAI é uma ferramenta de web scraping com IA (lê uma página e extrai dados estruturados a partir de um prompt em linguagem natural). Existe em 4 formatos:

| Formato | Repo | Uso |
|---|---|---|
| Lib Python open-source (roda local) | `ScrapeGraphAI/Scrapegraph-ai` | `pip install scrapegraphai` — controle total, LLM local (Ollama), sem custo por request |
| API gerenciada + SDK Python | `ScrapeGraphAI/scrapegraph-py` | Zero infra, anti-bot pronto, cobrado por crédito |
| API gerenciada + SDK JS/TS | `ScrapeGraphAI/scrapegraph-js` | Idem, para stack Node/TS |
| **Servidor MCP** | `ScrapeGraphAI/scrapegraph-mcp` | Plugável direto como tool MCP — é o caminho mais rápido pra testar dentro do fluxo do MecProAI |
| CLI | `ScrapeGraphAI/just-scrape` | Scraping via terminal, sem integrar nada |

Docs: https://docs.scrapegraphai.com/introduction

---

## Decisão do Conselho de LLMs

### Aplicação recomendada (quando for a hora)
**Inteligência competitiva via Meta Ads Library** — não geração de leads frios, não scraping de portais privados de imóveis (ZAP, VivaReal, OLX = risco de ToS).

Ideia: puxar via scraping os anúncios públicos dos concorrentes dos clientes atuais (ex: outras imobiliárias de alto padrão anunciando na mesma região) e gerar relatório automático — "quem tá anunciando no seu bairro, com que criativos, que frequência". Vira upsell recorrente sobre a base de clientes existente, reaproveitando o `get_full_ads_report` MCP tool que já existe.

Por que essa e não outras:
- Dado público (Ads Library), sem violação agressiva de ToS de portal privado.
- Diferenciação real: nenhum concorrente pequeno de "gerador de campanha com IA" entrega isso.
- Reuso direto do stack MCP que já existe — baixo custo de implementação quando chegar a hora.

### Aplicações descartadas
- ❌ Scraping de portais de imóveis privados (ZAP/VivaReal/OLX) para popular briefs — risco jurídico de ToS.
- ❌ Scraping para geração de leads frios — baixa conversão, e indicação direta dos clientes atuais (Eduardo, Shadia) é caminho mais barato e rápido pra "mais clientes".

### 🔴 Bloqueio antes de qualquer implementação
O conselho identificou (via revisão por pares) que há bugs de produção ativos que devem ser resolvidos **antes** de qualquer feature nova:
1. Upload de fotos reais falhando na campanha 672 (Cloudinary / Google Drive share link retornando HTML em vez de bytes de imagem).
2. Validar que o fix do spend incorreto (R$6/dia) da campanha 672 está de fato aplicado em produção.

**Regra:** não tocar em scraping até esses dois itens estarem fechados.

### Próximo passo concreto (quando desbloqueado)
Piloto de uma tarde, fora de produção:
1. Clonar `scrapegraph-mcp`, configurar API key (tem free tier).
2. Puxar manualmente dados do Meta Ads Library de 2-3 concorrentes do Eduardo (região Praia Brava).
3. Montar um relatório de 1 página e mandar de graça pro Eduardo como bônus.
4. Medir reação real antes de construir qualquer automação dentro do MCP server do MecProAI.

---

## Pontos levantados na análise (para referência futura)
- Verificar se o dado que o scraping traria já não é coberto pelas APIs Meta/Google/TikTok já integradas (evitar redundância).
- Scraping como serviço avulso pode ter aplicação além do nicho imobiliário (ex: Caro Vargas / e-commerce) — não explorado ainda.
- Meta Ads Library tem rate-limit próprio; qualquer integração precisa respeitar isso, especialmente considerando o histórico recente de bugs de integração Meta no projeto.
