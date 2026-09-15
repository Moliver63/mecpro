import test from "node:test";
import assert from "node:assert/strict";
import { createChatRetryBudget } from "../chatRetryBudget";

test("allows only one short pause for transient provider errors", () => {
  const budget = createChatRetryBudget(() => 0);
  assert.equal(budget.nextDelay(), 250);
  assert.equal(budget.nextDelay(), null);
});

test("credential rotation does not consume transient retries", () => {
  const budget = createChatRetryBudget(() => 0);
  for (let i = 0; i < 8; i++) assert.equal(budget.canAttempt(), true);
  assert.equal(budget.nextDelay(), 250);
});

test("does not start another attempt after the retry window", () => {
  let now = 100;
  const budget = createChatRetryBudget(() => now);
  now += 12_000;
  assert.equal(budget.canAttempt(), false);
  assert.equal(budget.nextDelay(), null);
});

test("does not schedule a pause at the end of the window", () => {
  let now = 0;
  const budget = createChatRetryBudget(() => now);
  now = 11_750;
  assert.equal(budget.nextDelay(), null);
});
