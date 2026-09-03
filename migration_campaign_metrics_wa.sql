-- MECPro: adiciona coluna waConversations em campaign_metrics
-- Registra conversas de WhatsApp iniciadas (action_type
-- "onsite_conversion.messaging_conversation_started_7d" da Meta), separado
-- de "leads" — são sinais de conversão diferentes e não devem ser somados
-- no mesmo campo, senão fica impossível saber depois qual campanha
-- converteu via formulário nativo e qual converteu via WhatsApp.
--
-- Contexto: o sync principal de campaign_metrics só gravava "lead"
-- (action_type === "lead"), então toda campanha de Clique-para-WhatsApp
-- aparecia com leads=0 mesmo convertendo bem — dado real ficava invisível
-- pro usuário no dashboard/relatório.
--
-- Execute UMA VEZ manualmente no banco (psql / console do Render),
-- mesmo padrão de migration_fine_tuning_examples.sql.

ALTER TABLE campaign_metrics
  ADD COLUMN IF NOT EXISTS "waConversations" INTEGER NOT NULL DEFAULT 0;
