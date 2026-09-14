# Creative rewrite safety

The enrichment path passes the same CampaignFacts used by the final Fact Guard
to the rewrite loop. Current generated copy is explicitly not a fact source.
Visual observations can guide copy but do not prove delivery, price or scarcity.
An empty verifiedFacts list is not an exemption from universal claim checks.

Rewrites accept only five text fields through a strict Zod schema. Lengths,
placeholders and Fact Guard are checked before adoption. Matching text aliases
are synchronized on a clone; IDs, media and cover ordering are not editable by
the rewrite response. Conflicting alternate copy-bank entries still block.

At most two application-level rewrite attempts are made per card. Provider-level
retries remain bounded by the existing provider code. Errors record their cause
with credential redaction. Persistent factual conflicts stop before image work;
the final campaign guard remains in place after subsequent transformations.

Cloudflare images are cached and added to the approved library only after RAG
approval. Pending, rejected or failed validation returns no Cloudflare image to
the caller, which may use its existing fallback flow. This does not redesign or
certify every fallback provider. RAG thresholds were not lowered.

Reference: https://ai.google.dev/gemini-api/docs/structured-output
Structured JSON does not guarantee semantic correctness; application validation
is required. This patch uses local schema validation with the existing JSON mode,
not a new provider or SDK migration.

Local regression tests do not certify live provider behavior. Production smoke
testing with the actual campaign is still needed; no Meta publication is part
of these tests. Missing facts must be collected from the user, not fabricated.
