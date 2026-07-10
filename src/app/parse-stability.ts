import type { ParseSummary, TextRange } from "../core/model.js";

export interface ParseStabilityAssessment {
  readonly affectedCodeUnits: number;
  readonly sourceLength: number;
  readonly affectedRatio: number;
  readonly holdPreviousTree: boolean;
}

/** Measures parser recovery impact without trusting overlapping ERROR ranges twice. */
export function assessParseStability(
  parse: ParseSummary,
  sourceLength: number,
  holdThreshold = 0.3,
): ParseStabilityAssessment {
  if (!Number.isSafeInteger(sourceLength) || sourceLength < 0) {
    throw new RangeError("sourceLength 必须是非负安全整数");
  }
  if (!Number.isFinite(holdThreshold) || holdThreshold < 0 || holdThreshold > 1) {
    throw new RangeError("holdThreshold 必须位于 [0, 1]");
  }
  if (!parse.hasError) {
    return Object.freeze({
      affectedCodeUnits: 0,
      sourceLength,
      affectedRatio: 0,
      holdPreviousTree: false,
    });
  }

  const intervals = parse.errorRanges.map((range) => clippedInterval(range, sourceLength));
  for (const offset of parse.missingOffsets) {
    if (!Number.isSafeInteger(offset) || offset < 0 || offset > sourceLength) continue;
    intervals.push({ from: Math.min(offset, Math.max(0, sourceLength - 1)), to: offset + 1 });
  }
  const affectedCodeUnits =
    intervals.length === 0 ? sourceLength : mergedLength(intervals, sourceLength);
  const affectedRatio = sourceLength === 0 ? 1 : Math.min(1, affectedCodeUnits / sourceLength);

  return Object.freeze({
    affectedCodeUnits,
    sourceLength,
    affectedRatio,
    holdPreviousTree: affectedRatio > holdThreshold,
  });
}

function clippedInterval(range: TextRange, sourceLength: number): { from: number; to: number } {
  return {
    from: Math.max(0, Math.min(sourceLength, range.from)),
    to: Math.max(0, Math.min(sourceLength, range.to)),
  };
}

function mergedLength(
  intervals: readonly { readonly from: number; readonly to: number }[],
  sourceLength: number,
): number {
  const ordered = intervals
    .map((interval) => ({
      from: Math.max(0, Math.min(sourceLength, interval.from)),
      to: Math.max(0, Math.min(sourceLength, interval.to)),
    }))
    .filter((interval) => interval.from < interval.to)
    .sort((left, right) => left.from - right.from || left.to - right.to);
  let total = 0;
  let currentFrom = 0;
  let currentTo = 0;
  for (const interval of ordered) {
    if (interval.from > currentTo) {
      total += currentTo - currentFrom;
      currentFrom = interval.from;
      currentTo = interval.to;
    } else {
      currentTo = Math.max(currentTo, interval.to);
    }
  }
  return total + currentTo - currentFrom;
}
