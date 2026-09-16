# Campaign intent integrity

The existing imageRAG and operational-lesson retrieval do not validate campaign
text by themselves. campaignRuleRetrieval adds deterministic local retrieval
from shared/segmentConfig, identified by source/version, without retrieving
headlines, client examples or offer facts. No vector database or paid call is
introduced. Unknown segments receive universal guidance, not an invented niche.

CampaignFacts captures resolved segment and objective. The prompt receives
retrieved rules separately from verified facts. Existing rewrite guards and the
final generation guard share the expanded Fact Guard: conflicting metadata,
recorded segment audit failures, unsupported offer claims, and residential
language on commercial property are rejected. Final validation includes ad sets.

Generation persists the full facts snapshot, not only the three prompt arrays.
Meta's shared publishToMeta mutation revalidates stored creatives and supplied
text overrides, and blocks pending review. Legacy campaigns without a complete
snapshot must be regenerated: a live profile is not proof of their old briefing.
This intentionally changes publication eligibility, not existing live ads.

The final Meta objective must match the campaign objective (branding/awareness
are aliases). An incompatible destination/pixel configuration now fails instead
of silently switching sales/engagement to traffic. The user must correct the
configuration or explicitly create a campaign with the desired objective.

Limits: rule-based checks are not a universal semantic proof. Current profile
inheritance, visual truth, all possible paraphrases and other platform publishing
paths still require audits. No live provider, Meta publication, database migration
or existing campaign update was performed. Budget labels and UI checklist claims
are separate pending UI issues, not evidence of approval by this validator.
