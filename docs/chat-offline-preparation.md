# Offline preparation and basic drafts

Send `Preparar campanha` or `/preparar` in the chat to start a deterministic
intake without contacting LLM providers. Existing project names come from the
authenticated account. Send labeled fields, one per line, and `/sair` to return
to the normal chat. Invalid fields leave the briefing unchanged. Money requires
an explicit total without thousands separators; no daily-budget inference occurs.

Send `/rascunho` or `salvar rascunho basico` to explicitly save a basic draft in
an existing owned project. It requires objective, platform, offer, total budget,
duration and a selected cover for multiple photos (`Capa: 2`, one-based).
New projects must first be created through the project screen. Only HTTPS photos
already persisted in the owned session are used; pending photos are not cleared.
No paid provider or advertising API is called.

The campaign is saved with status `pending_enrichment` and a `basic_draft` marker,
an exact briefing snapshot and unreviewed creatives. It is not a publishable ad.
Meta, Google and TikTok publication mutations reject the status/marker before any
advertising API calls. Enrichment must explicitly replace the basic draft and
pass normal validation; changing status alone does not unlock publication.

Reused components: chatSessionMiddleware (ownership, lease and durable state),
mergeChatBriefing, selectChatProject and missingCampaignIntake. The current photo
upload and pending-photo storage paths are unchanged. Preparation alone does not
create a campaign. Explicit basic-draft saving reuses createCampaign, plan limits
and runChatDraftTask idempotency, keyed by the canonical draft and session.
Neither path consumes photos, runs LLM calls, enqueues jobs, or publishes ads.
Switching project clears previous offer facts to avoid cross-project contamination.

`awaiting_ai` is an internal preparation state, NOT a scheduled job.
Fact Guard, quality gates and runChatDraftTask idempotency remain in that path.
The fallback message now offers preparation instead of a technical dead end.

Still pending: a native form for this flow, explicit campaign template/edit
selection without LLM, a durable enrichment
queue with bounded retries and recovery after process restarts. This increment
does not restore unavailable provider credentials, quotas or credit.
