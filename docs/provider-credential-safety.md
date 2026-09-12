# Provider credential safety

The campaign generator excludes suspended/invalid Gemini credentials for the
process lifetime. Subsequent generation and creative improvement calls use the
remaining keys or the existing provider fallback chain. Quota cooldowns are
refreshed before the availability check; exhausted keys are not forcibly reused.

The shared logger redacts recognized provider key patterns before console/file
output. Gemini errors thrown by the generator are also redacted. This is not a
complete audit of all direct console output or telemetry in the application.

The final campaign Fact Guard remains enabled after creative enrichment. No
factual claim or publication restriction is relaxed by this change.

Operations: revoke exposed keys, replace suspended credentials in Render, then
redeploy. This code cannot reactivate a suspended Google account. Verify a real
generation after deployment; unit tests do not prove provider availability.
