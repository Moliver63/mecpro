// Model retries only: never race or cancel a campaign action.
export function createChatRetryBudget(now: () => number = Date.now) {
  const started = now();
  let transientFailures = 0;
  return {
    canAttempt: () => now() - started < 12_000,
    nextDelay(): number | null {
      transientFailures += 1;
      return transientFailures < 2 && now() - started < 11_750 ? 250 : null;
    },
  };
}
