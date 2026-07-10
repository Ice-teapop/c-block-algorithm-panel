export function createGoldWallTimeRecoveryGate(maxRecoveries = 1) {
  if (!Number.isSafeInteger(maxRecoveries) || maxRecoveries < 0 || maxRecoveries > 1) {
    throw new RangeError("gold wall-time recovery budget 必须是 0 或 1");
  }

  const recoveries = [];
  return Object.freeze({
    async run(attempt, context) {
      const firstResult = await attempt();
      if (
        recoveries.length >= maxRecoveries ||
        !isPureGoldWallTimeLimit(firstResult) ||
        context.hasNonRetryableEvidence(firstResult)
      ) {
        return Object.freeze({ result: firstResult, retried: false });
      }

      const recovery = Object.freeze({
        label: context.label,
        durationMs:
          typeof firstResult.durationMs === "number" && Number.isFinite(firstResult.durationMs)
            ? firstResult.durationMs
            : null,
      });
      recoveries.push(recovery);
      context.onRecovery(recovery);
      return Object.freeze({ result: await attempt(), retried: true });
    },
    get recoveries() {
      return Object.freeze([...recoveries]);
    },
  });
}

export function isPureGoldWallTimeLimit(result) {
  return (
    typeof result === "object" &&
    result !== null &&
    result.ok === false &&
    result.termination === "wall-time-limit" &&
    result.exitCode === null &&
    result.signal === "SIGKILL" &&
    typeof result.error === "object" &&
    result.error !== null &&
    result.error.code === "RESOURCE_LIMIT"
  );
}
