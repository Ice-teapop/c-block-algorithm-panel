import { textRange, type TextRange } from "../model.js";
import type { EditApplication, EditDiff, EditPlan, TextPatch } from "./model.js";

interface IndexedPatch {
  readonly index: number;
  readonly patch: TextPatch;
}

/** Creates a defensive, immutable replacement in UTF-16 source coordinates. */
export function createTextPatch(range: TextRange, newText: string): TextPatch {
  if (typeof newText !== "string") {
    throw new TypeError("patch 的 newText 必须是字符串");
  }
  return Object.freeze({
    range: textRange(range.from, range.to),
    newText,
  });
}

/**
 * Sorts and validates patches against one old source snapshot.
 *
 * Insertions at the same point are concatenated in caller order. An insertion
 * may sit on a replacement boundary, but never strictly inside its old range.
 */
export function createEditPlan(source: string, patches: readonly TextPatch[]): EditPlan {
  assertSource(source);
  if (!Array.isArray(patches)) {
    throw new TypeError("patches 必须是只读数组");
  }

  const sorted = patches
    .map((patch, index): IndexedPatch => ({
      index,
      patch: copyAndValidatePatch(patch, source.length, index),
    }))
    .sort(compareIndexedPatches);
  const merged = mergeSamePointInsertions(sorted);
  assertNonOverlapping(merged);

  const effective = merged.filter(
    (patch) => source.slice(patch.range.from, patch.range.to) !== patch.newText,
  );
  let candidateLength = source.length;
  for (const patch of effective) {
    candidateLength += patch.newText.length - (patch.range.to - patch.range.from);
    if (!Number.isSafeInteger(candidateLength) || candidateLength < 0) {
      throw new RangeError("补丁结果长度超出 JavaScript 安全整数范围");
    }
  }

  return Object.freeze({
    sourceLength: source.length,
    candidateLength,
    patches: Object.freeze(effective),
  });
}

/** Applies a normalized plan without touching any source slice outside its ranges. */
export function applyEditPlan(source: string, plan: EditPlan): EditApplication {
  assertSource(source);
  if (source.length !== plan.sourceLength) {
    throw new RangeError(
      `edit plan 绑定长度 ${plan.sourceLength}，实际源码长度为 ${source.length}`,
    );
  }

  const canonicalPlan = createEditPlan(source, plan.patches);
  assertPlanIsCanonical(plan, canonicalPlan);

  const output: string[] = [];
  const diffs: EditDiff[] = [];
  const inversePatches: TextPatch[] = [];
  let sourceCursor = 0;
  let candidateCursor = 0;

  for (const patch of plan.patches) {
    const unchanged = source.slice(sourceCursor, patch.range.from);
    output.push(unchanged, patch.newText);
    candidateCursor += unchanged.length;

    const beforeText = source.slice(patch.range.from, patch.range.to);
    const afterRange = textRange(candidateCursor, candidateCursor + patch.newText.length);
    const diff = Object.freeze({
      beforeRange: patch.range,
      afterRange,
      beforeText,
      afterText: patch.newText,
    });
    diffs.push(diff);
    inversePatches.push(createTextPatch(afterRange, beforeText));

    sourceCursor = patch.range.to;
    candidateCursor = afterRange.to;
  }

  output.push(source.slice(sourceCursor));
  const candidateSource = output.join("");
  if (candidateSource.length !== plan.candidateLength) {
    throw new Error("补丁结果长度与 edit plan 不一致");
  }

  return Object.freeze({
    source: candidateSource,
    plan,
    diffs: Object.freeze(diffs),
    inversePatches: Object.freeze(inversePatches),
  });
}

/** Normalizes and applies a patch group in one call. */
export function applyTextPatches(source: string, patches: readonly TextPatch[]): EditApplication {
  return applyEditPlan(source, createEditPlan(source, patches));
}

function assertSource(source: string): void {
  if (typeof source !== "string") {
    throw new TypeError("source 必须是字符串");
  }
}

function copyAndValidatePatch(value: TextPatch, sourceLength: number, index: number): TextPatch {
  if (typeof value !== "object" || value === null) {
    throw new TypeError(`patch[${index}] 必须是对象`);
  }
  const { range, newText } = value;
  if (typeof range !== "object" || range === null) {
    throw new TypeError(`patch[${index}].range 必须是对象`);
  }
  if (typeof newText !== "string") {
    throw new TypeError(`patch[${index}].newText 必须是字符串`);
  }

  const copiedRange = textRange(range.from, range.to);
  if (copiedRange.to > sourceLength) {
    throw new RangeError(
      `patch[${index}] range [${copiedRange.from}, ${copiedRange.to}) 越出源码长度 ${sourceLength}`,
    );
  }
  return createTextPatch(copiedRange, newText);
}

function compareIndexedPatches(left: IndexedPatch, right: IndexedPatch): number {
  const startOrder = left.patch.range.from - right.patch.range.from;
  if (startOrder !== 0) return startOrder;

  const leftInsertion = left.patch.range.from === left.patch.range.to;
  const rightInsertion = right.patch.range.from === right.patch.range.to;
  if (leftInsertion !== rightInsertion) return leftInsertion ? -1 : 1;
  if (leftInsertion) return left.index - right.index;

  return left.patch.range.to - right.patch.range.to || left.index - right.index;
}

function mergeSamePointInsertions(sorted: readonly IndexedPatch[]): readonly TextPatch[] {
  const merged: TextPatch[] = [];
  let position = 0;
  while (position < sorted.length) {
    const current = sorted[position];
    if (current === undefined) break;

    const { patch } = current;
    if (patch.range.from !== patch.range.to) {
      merged.push(patch);
      position += 1;
      continue;
    }

    let newText = patch.newText;
    let nextPosition = position + 1;
    while (nextPosition < sorted.length) {
      const next = sorted[nextPosition]?.patch;
      if (
        next === undefined ||
        next.range.from !== patch.range.from ||
        next.range.from !== next.range.to
      ) {
        break;
      }
      newText += next.newText;
      nextPosition += 1;
    }
    merged.push(createTextPatch(patch.range, newText));
    position = nextPosition;
  }
  return Object.freeze(merged);
}

function assertNonOverlapping(patches: readonly TextPatch[]): void {
  let occupiedFrom = -1;
  let occupiedTo = -1;

  for (const patch of patches) {
    const { from, to } = patch.range;
    if (from === to) {
      if (occupiedFrom < from && from < occupiedTo) {
        throw new RangeError(
          `insertion ${from} 严格位于已有补丁 [${occupiedFrom}, ${occupiedTo}) 内`,
        );
      }
      continue;
    }
    if (from < occupiedTo) {
      throw new RangeError(`补丁 [${from}, ${to}) 与已有补丁重叠`);
    }
    occupiedFrom = from;
    occupiedTo = to;
  }
}

function assertPlanIsCanonical(plan: EditPlan, canonical: EditPlan): void {
  if (
    plan.candidateLength !== canonical.candidateLength ||
    plan.patches.length !== canonical.patches.length
  ) {
    throw new TypeError("edit plan 不是当前源码的规范化计划");
  }
  for (let index = 0; index < plan.patches.length; index += 1) {
    const actual = plan.patches[index];
    const expected = canonical.patches[index];
    if (
      actual === undefined ||
      expected === undefined ||
      actual.range.from !== expected.range.from ||
      actual.range.to !== expected.range.to ||
      actual.newText !== expected.newText
    ) {
      throw new TypeError("edit plan 不是当前源码的规范化计划");
    }
  }
}
