# Conversation policy and recovery

## Concise campaign intake

All three chat providers share a short-answer policy: normally 1-3 sentences,
with an exception for initial intake: collect all missing essential facts in one
organized block, reusing confirmed session briefing. Workspace tools return
project choices (existing/new) and campaign choices (new/template/edit).
Template means reference settings to confirm for a new draft, not automatic
cloning of media, offer facts or publication consent. Editing remains limited to
existing editing tools; unsupported changes use the campaign screen.
A requested draft can be generated as soon as the briefing is ready,
without another "may I generate?" turn. Optional recommendations do not justify
repeated questions. Project ambiguity, cover selection, facts and separate
publication authorization still apply. No answer truncation or validator bypass
is used. Prompt regression tests cannot guarantee live model compliance; validate
a multi-turn conversation in production before claiming repetition is eliminated.

The chat separates general explanations, account-data queries, planning and
actions. General questions do not require campaign briefing fields. Account
claims still require tool evidence. No browser/search capability or unrestricted
autonomy is added; current external facts must be qualified when unavailable.

Groq/DeepSeek schemas allow null on optional top-level fields so the provider
does not reject missing values before dispatch. Existing argument cleanup omits
null before business logic. Required fields retain their constraints; budgets
are never converted from null to zero. This does not authorize clearing a field.

Workspace/briefing errors return tool feedback rather than automatically
abandoning that provider. A DeepSeek 402 opens a 15-minute per-credential cooldown
in this process. Key replacement bypasses the old cooldown. Restart and multiple
instances do not share it. Billing and suspended Google credentials still need
administrative resolution; this code cannot restore service or purchase credits.

Without providers, only a small deterministic response set is available: greeting,
stored briefing summary and a truthful limitation notice. It cannot answer arbitrary
questions or execute external actions offline. Tool ownership checks, Fact Guard
and publication controls are retained, not replaced by prompting.

Validation: chatReasoning, chatBriefing and chatWorkspace tests (18 passed).
These are local regression tests, not a live model evaluation. No publication,
provider charge or production deployment is performed by these tests.
The previously audited attachment persistence and publication-idempotency issues
are outside this patch and remain pending.
