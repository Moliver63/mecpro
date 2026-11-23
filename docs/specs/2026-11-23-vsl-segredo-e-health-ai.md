# Segredo do servico de video (VSL) e chave publica de /api/health/ai

Continuacao de `2026-11-23-isolamento-rotas-restantes.md` (riscos restantes da
rodada 2). Branch `fix/vsl-segredo-e-health-ai`.

## Problema
- `vslRouter.ts` e `vsl/vsl_service.py` usavam `mecpro-vsl-secret` quando
  `VSL_SECRET_KEY` nao existia; `mecpro-vsl-2026` estava em notebooks, modal e
  tela. Com a URL do servico, qualquer um listava (`GET /jobs`, todos os usuarios),
  baixava e apagava videos.
- `GET /jobs` devolvia os jobs de todos os usuarios.
- `/api/health/ai` aceitava `mecpro-diag-2026` (publico no codigo e no bundle)
  quando `DEBUG_TOKEN` nao estava definido, e rodava o teste completo de IA.

## Mudanca
- `server/vslSecret.ts`: segredo valido = 16+ caracteres e fora da lista de
  valores publicos. `vslRouter` falha fechado (`PRECONDITION_FAILED`) sem
  segredo valido, antes de qualquer chamada de rede. Sem valor padrao.
- `vsl_service.py`: nao sobe sem segredo proprio; `hmac.compare_digest`;
  `/jobs` exige `user_id` e filtra (sem listagem global); `job_id` e nome de
  arquivo sem `..`/separador; `/generate` nao sobrescreve job de outro usuario.
- Isolamento no MecProAI continua por `mecpro_<userId>_` (rodada 2).
- `/api/health/ai`: teste completo so com sessao admin/superadmin ou
  `DEBUG_TOKEN` definido de proposito (diferente da chave padrao). Os demais
  recebem o resumo simples de antes. A tela do agente nao envia mais a chave.
- Notebooks/modal/tela: valor publico trocado por placeholder que o servico recusa.

## Implantacao (acao do dono, fora do codigo)
1. Gerar segredo novo e definir o mesmo `VSL_SECRET_KEY` no MecProAI (Render) e
   no servico de video. Sem isso o recurso de video fica desligado (erro claro).
2. Opcional: definir `DEBUG_TOKEN` proprio se quiser o teste completo sem sessao admin.

## Nao muda
Campanhas, orcamentos, banco, chat, MCP. Admin continua com o diagnostico.

## Como provar
`server/__tests__/segredosVslEHealthAi.test.ts` (8 testes); com o codigo
revertido 7 falham.
