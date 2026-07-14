import type { ProgramAnalysisSnapshot } from "../analysis/index.js";

/** Existing partial functions may remain locked, but no previously complete function may degrade. */
export function assertNoCompleteCfgRegression(
  before: ProgramAnalysisSnapshot,
  after: ProgramAnalysisSnapshot,
): void {
  const occurrenceByName = new Map<string, number>();
  for (const previous of before.functions) {
    const occurrence = occurrenceByName.get(previous.name) ?? 0;
    occurrenceByName.set(previous.name, occurrence + 1);
    if (previous.partial) continue;
    const candidates = after.functions.filter((candidate) => candidate.name === previous.name);
    const candidate = candidates[occurrence];
    if (candidate === undefined || candidate.partial) {
      throw new Error(`候选源码会把完整函数“${previous.name}”降级为 partial CFG`);
    }
  }
}
