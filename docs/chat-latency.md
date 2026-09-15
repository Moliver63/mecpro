# Chat retry latency

Gemini and Groq application-level transient retries allow one 250ms pause per
model round. Gemini can still rotate past rejected or exhausted credentials,
but no additional attempt starts after 12 seconds. Previously eight temporary
failures could add 33.6 seconds of sleep alone.

This is a retry budget, not a hard timeout: an in-flight SDK request can outlive
the window. SDK retries, database time, DeepSeek timeout and campaign generation
time are unchanged. No streaming is added.

The budget wraps model calls, never tool execution. Fact Guard, ownership and
publication confirmation are unchanged. End-to-end latency needs production
measurement; these tests validate retry decisions only.
