# Reference Patterns — Cérebro de Referência MecProAI

Padrões arquiteturais extraídos de projetos de terceiros, para consulta e
aplicação no MecProAI e projetos correlatos — **sem instalar ou executar**
o código-fonte original.

| Arquivo | Fonte | Vale aplicar? |
|---|---|---|
| `omniroute-patterns.md` | diegosouzapw/OmniRoute | Sim — resiliência 3 camadas, cache-aware routing |
| `headroom-patterns.md` | headroomlabs-ai/headroom | Sim — compressão por tipo de conteúdo, live-zone |
| `claude-mem-patterns.md` | thedotmack/claude-mem | Parcial — divulgação progressiva em camadas |
| `task-observer-ALERTA.md` | rebelytics/one-skill-to-rule-them-all | **Não** — padrão de auto-ativação suspeito |

## Regra geral desta pasta

Cada arquivo aqui documenta **conceitos e arquitetura em português, com
palavras próprias** — nunca código-fonte copiado, scripts de instalação, ou
configs executáveis dos repositórios originais. O objetivo é aprender com o
ecossistema open-source sem herdar a superfície de risco de rodar código de
terceiros não auditado em ambiente com dados de cliente.

Atualizado em: 2026-08-12.
