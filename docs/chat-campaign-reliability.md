# Chat and campaign creation reliability

## Merge with origin/main 2125058

The merged implementation retains upstream response-speed modes and their tool selection. Groq now reserves 2048 output tokens and uses an estimated input budget of 5400 (superseding the original 1000/6500 limits below). The structured rewrite schema now requests six fields, including pain, so the upstream pain repair remains reachable. Existing optional-pain input compatibility is preserved by local validation. Schema errors retain root/field details and retry feedback. The briefing error test accepts the updated upstream wording without changing production messages.

Local changes, 2026-09-22. Deployment and live provider calls are not validated by unit tests.

- Groq uses a compact campaign policy, the persisted briefing and a request-size estimate including tool schemas. Older conversation turns are dropped as complete groups. The latest user request and its tool calls/results are never silently cut. Output is limited to 1000 tokens, with an estimated input budget of 6500 tokens. This is an estimate, not a provider tokenizer or a guarantee against account-level rate limits. Oversized mandatory context fails safely.
- Existing project selection normalizes accents, punctuation and whitespace, but still rejects different names/addresses, unauthorized IDs and ambiguous matches. Canonical names are saved only after selection validation; rejected updates do not poison the briefing.
- Creative rewrites use a five-field response schema, explicit field-level validation feedback, no cache, and a bounded two-attempt repair loop. Gemini rewrite responses must finish with STOP; thought text is excluded. Flash 2.5 rewrite calls disable thinking to reserve output capacity for JSON. Local schema, fact and segment checks remain authoritative.
- Segment issues are recomputed after a rewrite rather than inheriting stale failure metadata. An actual new conflict remains blocked. Images, ordering and the original creative are preserved.
- Gemini telemetry now records the actual selected model and elapsed request time instead of a fixed model label and prompt-length estimate.

Focused verification: 35 tests passed across creativeRewriteGuard, chatRequestBudget, chatWorkspace, chatBriefing, chatReasoning and campaignIntent. No campaign was created or published by these tests.

Full server typecheck did not pass in the local environment: missing @google/genai and groq-sdk, plus errors reported in router, MCP and an imageGeneration import. Deployment readiness is not established. git diff --check passed.

External limits remain: DeepSeek requires available credit, and Gemini/Groq can still reject calls for service availability or account quotas. Never interpret unit-test success as proof of production availability.
