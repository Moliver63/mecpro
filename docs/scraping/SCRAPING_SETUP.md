# Setup técnico — scrapegraph-mcp (referência, não ativado)

Guia rápido para quando o piloto (ver SCRAPING_RESEARCH.md) for autorizado.

## 1. Clonar e instalar
```bash
git clone https://github.com/ScrapeGraphAI/scrapegraph-mcp
cd scrapegraph-mcp
pip install -e ".[dev]"
```

## 2. Configurar API key
Criar conta e pegar chave em: https://scrapegraphai.com/dashboard

```bash
export SGAI_API_KEY=your-api-key
```

## 3. Rodar o servidor
```bash
scrapegraph-mcp
# ou
python -m scrapegraph_mcp.server
```

## 4. Testar localmente
```bash
npx @modelcontextprotocol/inspector scrapegraph-mcp
```
Abre uma interface web pra testar as tools disponíveis antes de plugar em produção.

## Variáveis de ambiente relevantes
| Variável | Default | Uso |
|---|---|---|
| `SGAI_API_KEY` | — | chave de auth (obrigatória) |
| `SGAI_API_URL` | `https://v2-api.scrapegraphai.com/api` | override do endpoint base |
| `SGAI_TIMEOUT` | 120s | timeout de request |

Auth via header `SGAI-APIKEY`.

## Onde plugar no MecProAI (quando aprovado)
- Servidor MCP do MecProAI já suporta múltiplos clients (Kimi CLI, ChatGPT, OAuth 2.1) com tiers de API key (read/write/publish) — seguir o mesmo padrão de escopo para a integração de scraping, tratando como uma tool adicional read-only inicialmente.
- Não commitar `SGAI_API_KEY` em nenhum arquivo — seguir o mesmo padrão de segurança usado para os outros tokens do projeto (nunca salvar em texto plano no repo, só em variável de ambiente / secret manager).

## Alternativa sem MCP (se preferir testar via lib direta)
```bash
pip install scrapegraphai --break-system-packages
playwright install
```
Uso local, sem depender da API gerenciada — mais controle, mas mais manutenção (browser, proxy, etc).
