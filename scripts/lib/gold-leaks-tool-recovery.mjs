export function createGoldLeaksToolRecoveryGate(maxRecoveries = 1) {
  if (!Number.isSafeInteger(maxRecoveries) || maxRecoveries < 0 || maxRecoveries > 1) {
    throw new RangeError("gold leaks tool recovery budget 必须是 0 或 1");
  }

  const recoveries = [];
  return Object.freeze({
    async run(attempt, context) {
      const firstResult = await attempt();
      if (
        recoveries.length >= maxRecoveries ||
        !isPureLeaksToolFailure(firstResult) ||
        context.hasNonRetryableEvidence(firstResult)
      ) {
        return Object.freeze({ result: firstResult, retried: false });
      }

      const recovery = Object.freeze({ label: context.label });
      recoveries.push(recovery);
      context.onRecovery(recovery);
      return Object.freeze({ result: await attempt(), retried: true });
    },
    get recoveries() {
      return Object.freeze([...recoveries]);
    },
  });
}

export function isPureLeaksToolFailure(result) {
  return (
    typeof result === "object" &&
    result !== null &&
    result.ok === false &&
    result.termination === "process-exit" &&
    result.exitCode === 0 &&
    result.signal === null &&
    typeof result.error === "object" &&
    result.error !== null &&
    result.error.code === "PROCESS_CONTROL_FAILED" &&
    typeof result.leakCheck === "object" &&
    result.leakCheck !== null &&
    result.leakCheck.ok === false &&
    result.leakCheck.verdict === "tool-error"
  );
}
