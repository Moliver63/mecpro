# OmniRoute — Padrões de Arquitetura de Referência

> Fonte: github.com/diegosouzapw/OmniRoute (MIT, ~45k stars, 500+ contribuidores)
> Extraído em: 2026-08-12 — conceitual apenas, nenhum código copiado.
> **NÃO instalar o pacote.** Ver seção de Riscos no final.

## O que é

Gateway/proxy que unifica 290+ provedores de IA (OpenAI, Anthropic, Gemini, etc.)
atrás de um único endpoint local (`localhost:20128/v1`), com fallback automático
entre provedores quando um esgota a cota ou falha.

## Padrões arquiteturais que valem a pena estudar

### 1. Resiliência em 3 camadas independentes
Cada camada trata um tipo diferente de falha, sem interferir nas outras:
- **Circuit breaker por provedor** — abre só em erros 408/5xx, com threshold
  diferente por tipo de conexão (OAuth 3x, API-key 5x, local 2x), fecha depois
  de um período de resfriamento com sonda HALF-OPEN.
- **Cooldown por conexão** — uma chave individual entra em "resfriamento"
  exponencial sem derrubar as chaves irmãs do mesmo provedor.
- **Lockout por modelo** — um erro 429 específico de um modelo tranca só aquele
  modelo, não a conexão inteira.

**Aplicação no MecProAI:** quando o MCP server crescer para múltiplos clientes
simultâneos usando a mesma chave Gemini, esse padrão de 3 camadas evita que uma
falha de um cliente derrube o serviço para os outros.

### 2. Estratégias de roteamento como plugins compostos ("combo")
Um "combo" é uma cadeia configurável de alvos com uma estratégia de seleção
(prioridade, round-robin, custo-otimizado, cache-otimizado, etc.) — a lógica de
seleção é separada da lista de alvos, então trocar a estratégia não exige
reescrever o roteamento.

**Aplicação:** separar "qual modelo Gemini usar" de "como decidir entre eles"
no pipeline `learning_base`/`generate_campaign` do MecProAI.

### 3. Cache-aware routing
Uma estratégia específica (`cache-optimized`) fixa cada prefixo de prompt
reutilizável na mesma conta/conexão para maximizar hits de cache do provedor —
em vez de round-robin, que quebra o cache a cada troca.

**Aplicação direta:** você já documentou RAM cache bug de colisão de prefixo
entre clientes — esse padrão (pin por prefixo) é a solução estrutural pra isso.

## Riscos identificados (não ignorar)

- O projeto tem um recurso de **MITM transparente (TPROXY)** que instala uma
  CA própria para interceptar tráfego de CLIs que ignoram variáveis de proxy.
  Isso significa interceptação de tráfego criptografado com certificado
  instalado na máquina — inaceitável em ambiente com dados de cliente.
- Memória "opt-in" e telemetria de custo (`X-OmniRoute-*` headers) — verificar
  o que é enviado antes de qualquer uso real.
- Extenso sistema de afiliados/patrocínio dentro do próprio README — não é
  motivo de desconfiança por si só, mas mostra que o projeto tem incentivo
  comercial para maximizar instalações, não só qualidade técnica.

**Conclusão:** vale estudar os padrões de resiliência e roteamento para aplicar
no seu próprio MCP server. Não vale instalar e rodar tráfego de cliente por ele.
