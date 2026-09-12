import test from "node:test";
import assert from "node:assert/strict";
import { GeminiCredentialHealth, redactProviderSecrets } from "../providerSafety";

test("suspended credential is excluded from subsequent generation and improvement calls", () => {
  const health = new GeminiCredentialHealth();
  const keys = ["first", "second"];
  assert.equal(health.reject("first", 403, { message: "Consumer has been suspended." }), true);
  assert.deepEqual(keys.filter(key => health.available(key)), ["second"]);
  assert.equal(health.reject("second", 400, { details: [{ reason: "API_KEY_INVALID" }] }), true);
  assert.deepEqual(keys.filter(key => health.available(key)), []);
  assert.equal(health.available("replacement"), true);
});

test("quota, overload and model permission errors do not permanently reject credentials", () => {
  const health = new GeminiCredentialHealth();
  for (const [status, message] of [[429, "RESOURCE_EXHAUSTED"], [503, "UNAVAILABLE"], [403, "Model permission denied"]] as const) {
    assert.equal(health.reject("key", status, message), false);
    assert.equal(health.available("key"), true);
  }
  assert.equal(health.reject("key", 401, "Unauthorized"), true);
});

test("redacts provider credentials in errors, URLs and serialized log metadata", () => {
  const secret = "AIza" + "synthetic_test_key_123";
  const message = JSON.stringify({ error: `Consumer 'api_key:${secret}' has been suspended.`, url: "https://example.test?api_key=example-secret&model=test" });
  const clean = redactProviderSecrets(message);
  assert.ok(!clean.includes(secret));
  assert.ok(!clean.includes("example-secret"));
  assert.ok(clean.includes("suspended"));
  assert.ok(clean.includes("model=test"));
  assert.equal(redactProviderSecrets("status=403"), "status=403");
});
