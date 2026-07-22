export const INSERTION_SORT_LAB_ENTRY_ID = "tutorial.insertion-sort-lab";

export const INSERTION_SORT_TEXTBOOK_SOURCE = `#include <stdio.h>

enum { MAX_VALUES = 256 };

int main(void) {
  size_t count;
  if (scanf("%zu", &count) != 1 || count == 0 || count > MAX_VALUES) {
    fputs("count must be between 1 and 256\\n", stderr);
    return 1;
  }

  int values[MAX_VALUES];
  for (size_t i = 0; i < count; i++) {
    if (scanf("%d", &values[i]) != 1) {
      fputs("missing value\\n", stderr);
      return 1;
    }
  }

  for (size_t i = 1; i < count; i++) {
    size_t j = i;
    while (j > 0 && values[j - 1] > values[j]) {
      int temporary = values[j - 1];
      values[j - 1] = values[j];
      values[j] = temporary;
      j--;
    }
  }

  for (size_t i = 0; i < count; i++) {
    printf("%d%c", values[i], i + 1 == count ? '\\n' : ' ');
  }
  return 0;
}`;

/** One-write-per-shift optimization shown only after the textbook adjacent-swap path. */
export const INSERTION_SORT_SHIFT_OPTIMIZED_SOURCE = `#include <stdio.h>

enum { MAX_VALUES = 256 };

int main(void) {
  size_t count;
  if (scanf("%zu", &count) != 1 || count == 0 || count > MAX_VALUES) {
    fputs("count must be between 1 and 256\\n", stderr);
    return 1;
  }

  int values[MAX_VALUES];
  for (size_t i = 0; i < count; i++) {
    if (scanf("%d", &values[i]) != 1) {
      fputs("missing value\\n", stderr);
      return 1;
    }
  }

  for (size_t i = 1; i < count; i++) {
    int key = values[i];
    size_t j = i;
    while (j > 0 && values[j - 1] > key) {
      values[j] = values[j - 1];
      j--;
    }
    values[j] = key;
  }

  for (size_t i = 0; i < count; i++) {
    printf("%d%c", values[i], i + 1 == count ? '\\n' : ' ');
  }
  return 0;
}`;

/** Primary source presented by the Library and FOA curriculum. */
export const INSERTION_SORT_LAB_SOURCE = INSERTION_SORT_TEXTBOOK_SOURCE;

export type InsertionSortFramePhase =
  "ready" | "select-key" | "compare" | "shift" | "insert" | "complete";

export type InsertionSortRelationId =
  "array-to-key" | "predecessor-to-condition" | "predecessor-to-slot" | "key-to-slot";

export interface InsertionSortMetrics {
  readonly comparisons: number;
  readonly shifts: number;
  readonly writes: number;
}

export interface InsertionSortFrame {
  readonly phase: InsertionSortFramePhase;
  readonly values: readonly number[];
  readonly sortedEnd: number;
  readonly outerIndex: number | null;
  readonly slotIndex: number | null;
  readonly compareIndex: number | null;
  readonly key: number | null;
  readonly comparisonResult: boolean | null;
  readonly activeRelationId: InsertionSortRelationId | null;
  readonly metrics: InsertionSortMetrics;
}

export type InsertionSortTeachingEventKind = "pick-key" | "compare" | "shift" | "insert" | "settle";

export const INSERTION_SORT_TEACHING_EVENT_DURATIONS: Readonly<
  Record<InsertionSortTeachingEventKind, number>
> = Object.freeze({
  "pick-key": 260,
  compare: 180,
  shift: 280,
  insert: 320,
  settle: 180,
});

export interface InsertionSortTeachingToken {
  readonly id: string;
  readonly value: number;
  readonly originIndex: number;
}

export interface InsertionSortTeachingSlot {
  readonly index: number;
  readonly tokenId: string | null;
}

export interface InsertionSortHeldKey {
  readonly tokenId: string;
  readonly value: number;
  readonly originSlot: number;
}

export interface InsertionSortHole {
  readonly index: number;
}

interface InsertionSortTeachingEventBase {
  readonly id: string;
  readonly sequence: number;
  readonly kind: InsertionSortTeachingEventKind;
  /** Alias used by the generic task-lesson engine. */
  readonly type: InsertionSortTeachingEventKind;
  readonly durationMs: number;
  readonly outerIndex: number;
  readonly sourceLine: number;
  readonly relationId: InsertionSortRelationId | null;
}

export interface InsertionSortPickKeyEvent extends InsertionSortTeachingEventBase {
  readonly kind: "pick-key";
  readonly type: "pick-key";
  readonly tokenId: string;
  readonly fromSlot: number;
}

export interface InsertionSortCompareEvent extends InsertionSortTeachingEventBase {
  readonly kind: "compare";
  readonly type: "compare";
  readonly predecessorTokenId: string;
  readonly keyTokenId: string;
  readonly compareSlot: number;
  readonly holeIndex: number;
  readonly shouldShift: boolean;
}

export interface InsertionSortShiftEvent extends InsertionSortTeachingEventBase {
  readonly kind: "shift";
  readonly type: "shift";
  readonly tokenId: string;
  readonly fromSlot: number;
  readonly toSlot: number;
}

export interface InsertionSortInsertEvent extends InsertionSortTeachingEventBase {
  readonly kind: "insert";
  readonly type: "insert";
  readonly tokenId: string;
  readonly toSlot: number;
}

export interface InsertionSortSettleEvent extends InsertionSortTeachingEventBase {
  readonly kind: "settle";
  readonly type: "settle";
  readonly completed: boolean;
}

export type InsertionSortTeachingEvent =
  | InsertionSortPickKeyEvent
  | InsertionSortCompareEvent
  | InsertionSortShiftEvent
  | InsertionSortInsertEvent
  | InsertionSortSettleEvent;

export interface InsertionSortTeachingSnapshot {
  readonly tokens: readonly InsertionSortTeachingToken[];
  readonly slots: readonly InsertionSortTeachingSlot[];
  readonly key: InsertionSortHeldKey | null;
  readonly hole: InsertionSortHole | null;
  readonly sortedEnd: number;
  readonly outerIndex: number | null;
  readonly compareIndex: number | null;
  readonly comparisonResult: boolean | null;
  readonly activeRelationId: InsertionSortRelationId | null;
  readonly metrics: InsertionSortMetrics;
  readonly appliedEventCount: number;
  readonly complete: boolean;
}

export interface InsertionSortTeachingTimeline {
  readonly input: readonly number[];
  readonly initialState: InsertionSortTeachingSnapshot;
  readonly events: readonly InsertionSortTeachingEvent[];
  /** Index 0 is the initial state; index n is the state after n events. */
  readonly states: readonly InsertionSortTeachingSnapshot[];
  readonly finalState: InsertionSortTeachingSnapshot;
}

export type InsertionSortLearnerAction =
  | {
      readonly type: "pick-key";
      readonly tokenId: string;
      readonly fromSlot: number;
    }
  | {
      readonly type: "shift";
      readonly tokenId: string;
      readonly fromSlot: number;
      readonly toSlot: number;
    }
  | {
      readonly type: "insert";
      readonly tokenId: string;
      readonly toSlot: number;
    }
  | {
      readonly type: "prediction";
      readonly shouldShift: boolean;
    };

export type InsertionSortActionValidationCode =
  | "accepted"
  | "not-actionable"
  | "wrong-action"
  | "wrong-token"
  | "wrong-source"
  | "wrong-target"
  | "wrong-prediction";

export interface InsertionSortActionValidation {
  readonly accepted: boolean;
  readonly code: InsertionSortActionValidationCode;
  readonly expectedKind: InsertionSortLearnerAction["type"] | null;
}

export type InsertionSortCustomInputErrorCode =
  "empty" | "invalid-token" | "unsafe-integer" | "too-few" | "too-many";

export type InsertionSortCustomInputResult =
  | { readonly ok: true; readonly values: readonly number[] }
  | { readonly ok: false; readonly code: InsertionSortCustomInputErrorCode };

export interface InsertionSortSemanticRelation {
  readonly id: InsertionSortRelationId;
  readonly from: string;
  readonly to: string;
  readonly role: "snapshot" | "predicate" | "shift" | "insert";
  readonly sourceLine: number;
}

export interface InsertionSortSignatureEvidence {
  readonly id: string;
  readonly label: string;
  readonly sourceLine: number | null;
  readonly matched: boolean;
}

export interface InsertionSortSignatureMatch {
  readonly status: "matched" | "partial" | "not-matched";
  readonly matchedCount: number;
  readonly totalCount: number;
  readonly evidence: readonly InsertionSortSignatureEvidence[];
}

export interface InsertionSortLabCase {
  readonly id: "normal" | "reverse" | "duplicates";
  readonly input: readonly number[];
  readonly expected: readonly number[];
}

export const INSERTION_SORT_LAB_CASES: readonly InsertionSortLabCase[] = Object.freeze([
  labCase("normal", [5, 2, 4, 6, 1], [1, 2, 4, 5, 6]),
  labCase("reverse", [5, 4, 3, 2, 1], [1, 2, 3, 4, 5]),
  labCase("duplicates", [3, 1, 3, 2, 1, 2], [1, 1, 2, 2, 3, 3]),
]);

export const INSERTION_SORT_SEMANTIC_RELATIONS: readonly InsertionSortSemanticRelation[] =
  Object.freeze([
    semanticRelation("array-to-key", "values[i]", "key", "snapshot", "int key = values[i];"),
    semanticRelation(
      "predecessor-to-condition",
      "values[j - 1] + key",
      "while condition",
      "predicate",
      "while (j > 0 && values[j - 1] > key)",
    ),
    semanticRelation(
      "predecessor-to-slot",
      "values[j - 1]",
      "values[j]",
      "shift",
      "values[j] = values[j - 1];",
    ),
    semanticRelation("key-to-slot", "key", "values[j]", "insert", "values[j] = key;"),
  ]);

const INSERTION_SORT_SIGNATURES = Object.freeze([
  signature("sorted-prefix", "outer loop starts at index 1", "for (size_t i = 1; i < count; i++)"),
  signature("key-snapshot", "current value is preserved as key", "int key = values[i];"),
  signature(
    "larger-predecessor",
    "larger predecessors control the inner loop",
    "while (j > 0 && values[j - 1] > key)",
  ),
  signature("right-shift", "a predecessor moves one slot right", "values[j] = values[j - 1];"),
  signature("key-insert", "key is written into the opened slot", "values[j] = key;"),
]);

const TEXTBOOK_INSERTION_SORT_SIGNATURES = Object.freeze([
  signature("sorted-prefix", "outer loop starts at index 1", "for (size_t i = 1; i < count; i++)"),
  signature(
    "adjacent-condition",
    "adjacent values are compared",
    "while (j > 0 && values[j - 1] > values[j])",
  ),
  signature("temporary", "left value is saved temporarily", "int temporary = values[j - 1];"),
  signature("swap-left", "right value moves left", "values[j - 1] = values[j];"),
  signature("swap-right", "saved value moves right", "values[j] = temporary;"),
]);

/**
 * Tutorial-local structure matching only. This deliberately does not claim to recognize arbitrary
 * insertion-sort implementations or to replace the platform's CFG/def-use analysis.
 */
export function matchInsertionSortTutorialSignature(source: string): InsertionSortSignatureMatch {
  if (typeof source !== "string") throw new TypeError("插入排序结构匹配要求源码字符串");
  const evidence = Object.freeze(
    INSERTION_SORT_SIGNATURES.map((item) => {
      const sourceLine = exactSourceLine(source, item.fragment);
      return Object.freeze({
        id: item.id,
        label: item.label,
        sourceLine,
        matched: sourceLine !== null,
      });
    }),
  );
  const matchedCount = evidence.filter((item) => item.matched).length;
  return Object.freeze({
    status:
      matchedCount === evidence.length ? "matched" : matchedCount === 0 ? "not-matched" : "partial",
    matchedCount,
    totalCount: evidence.length,
    evidence,
  });
}

/** Tutorial-local matcher for the textbook adjacent-swap implementation. */
export function matchTextbookInsertionSortTutorialSignature(
  source: string,
): InsertionSortSignatureMatch {
  if (typeof source !== "string") throw new TypeError("插入排序结构匹配要求源码字符串");
  const evidence = Object.freeze(
    TEXTBOOK_INSERTION_SORT_SIGNATURES.map((item) => {
      const sourceLine = exactSourceLine(source, item.fragment);
      return Object.freeze({
        id: item.id,
        label: item.label,
        sourceLine,
        matched: sourceLine !== null,
      });
    }),
  );
  const matchedCount = evidence.filter((item) => item.matched).length;
  return Object.freeze({
    status:
      matchedCount === evidence.length ? "matched" : matchedCount === 0 ? "not-matched" : "partial",
    matchedCount,
    totalCount: evidence.length,
    evidence,
  });
}

/**
 * Builds the stable-token teaching timeline used by the interactive lesson. The timeline models
 * insertion sort semantics; it is not sampled runtime state and must not be written to Trace or
 * performance history.
 */
export function createInsertionSortTeachingTimeline(
  input: readonly number[],
): InsertionSortTeachingTimeline {
  assertTeachingInput(input);
  const initialState = createInsertionSortTeachingInitialState(input);
  const events: InsertionSortTeachingEvent[] = [];
  const states: InsertionSortTeachingSnapshot[] = [initialState];
  let state = initialState;

  const append = (event: InsertionSortTeachingEvent): void => {
    events.push(event);
    state = reduceInsertionSortTeachingEvent(state, event);
    states.push(state);
  };

  for (let outerIndex = 1; outerIndex < input.length; outerIndex += 1) {
    const keyTokenId = state.slots[outerIndex]?.tokenId;
    if (keyTokenId === null || keyTokenId === undefined) {
      throw new Error("插入排序教学时间线缺少待选 key");
    }
    append(
      freezeTeachingEvent({
        ...eventBase(events.length + 1, "pick-key", outerIndex, "array-to-key"),
        kind: "pick-key",
        type: "pick-key",
        tokenId: keyTokenId,
        fromSlot: outerIndex,
      }),
    );

    let holeIndex = outerIndex;
    while (holeIndex > 0) {
      const predecessorTokenId = state.slots[holeIndex - 1]?.tokenId;
      if (predecessorTokenId === null || predecessorTokenId === undefined) {
        throw new Error("插入排序教学时间线缺少前驱元素");
      }
      const predecessor = tokenById(state, predecessorTokenId);
      const key = state.key;
      if (key === null) throw new Error("插入排序教学时间线丢失 key");
      const shouldShift = predecessor.value > key.value;
      append(
        freezeTeachingEvent({
          ...eventBase(events.length + 1, "compare", outerIndex, "predecessor-to-condition"),
          kind: "compare",
          type: "compare",
          predecessorTokenId,
          keyTokenId,
          compareSlot: holeIndex - 1,
          holeIndex,
          shouldShift,
        }),
      );
      if (!shouldShift) break;
      append(
        freezeTeachingEvent({
          ...eventBase(events.length + 1, "shift", outerIndex, "predecessor-to-slot"),
          kind: "shift",
          type: "shift",
          tokenId: predecessorTokenId,
          fromSlot: holeIndex - 1,
          toSlot: holeIndex,
        }),
      );
      holeIndex -= 1;
    }

    append(
      freezeTeachingEvent({
        ...eventBase(events.length + 1, "insert", outerIndex, "key-to-slot"),
        kind: "insert",
        type: "insert",
        tokenId: keyTokenId,
        toSlot: holeIndex,
      }),
    );
    append(
      freezeTeachingEvent({
        ...eventBase(events.length + 1, "settle", outerIndex, null),
        kind: "settle",
        type: "settle",
        completed: outerIndex === input.length - 1,
      }),
    );
  }

  const frozenEvents = Object.freeze(events);
  const frozenStates = Object.freeze(states);
  return Object.freeze({
    input: Object.freeze([...input]),
    initialState,
    events: frozenEvents,
    states: frozenStates,
    finalState: frozenStates.at(-1)!,
  });
}

export function createInsertionSortTeachingInitialState(
  input: readonly number[],
): InsertionSortTeachingSnapshot {
  assertTeachingInput(input);
  const tokens = Object.freeze(
    input.map((value, originIndex) =>
      Object.freeze({ id: `value-${String(originIndex)}`, value, originIndex }),
    ),
  );
  const slots = Object.freeze(
    tokens.map((token, index) => Object.freeze({ index, tokenId: token.id })),
  );
  return freezeTeachingSnapshot({
    tokens,
    slots,
    key: null,
    hole: null,
    sortedEnd: 0,
    outerIndex: null,
    compareIndex: null,
    comparisonResult: null,
    activeRelationId: null,
    metrics: Object.freeze({ comparisons: 0, shifts: 0, writes: 0 }),
    appliedEventCount: 0,
    complete: input.length === 1,
  });
}

/** Pure event reducer. Invalid or out-of-order events fail closed. */
export function reduceInsertionSortTeachingEvent(
  state: InsertionSortTeachingSnapshot,
  event: InsertionSortTeachingEvent,
): InsertionSortTeachingSnapshot {
  if (event.sequence !== state.appliedEventCount + 1) {
    throw new RangeError("插入排序教学事件顺序无效");
  }
  if (event.kind !== event.type) throw new TypeError("插入排序教学事件类型不一致");
  const slots = state.slots.map((slot) => ({ index: slot.index, tokenId: slot.tokenId }));
  let key = state.key;
  let hole = state.hole;
  let sortedEnd = state.sortedEnd;
  let compareIndex: number | null = null;
  let comparisonResult: boolean | null = null;
  let complete = false;
  let metrics = state.metrics;

  switch (event.kind) {
    case "pick-key": {
      if (key !== null || hole !== null || slots[event.fromSlot]?.tokenId !== event.tokenId) {
        throw new Error("无法从当前状态选取 key");
      }
      const token = tokenById(state, event.tokenId);
      slots[event.fromSlot] = { index: event.fromSlot, tokenId: null };
      key = Object.freeze({
        tokenId: token.id,
        value: token.value,
        originSlot: event.fromSlot,
      });
      hole = Object.freeze({ index: event.fromSlot });
      break;
    }
    case "compare": {
      if (
        key?.tokenId !== event.keyTokenId ||
        hole?.index !== event.holeIndex ||
        slots[event.compareSlot]?.tokenId !== event.predecessorTokenId
      ) {
        throw new Error("无法在当前状态比较 key 与前驱元素");
      }
      const predecessor = tokenById(state, event.predecessorTokenId);
      const shouldShift = predecessor.value > key.value;
      if (shouldShift !== event.shouldShift) {
        throw new Error("插入排序比较事件结果与状态不一致");
      }
      compareIndex = event.compareSlot;
      comparisonResult = event.shouldShift;
      metrics = Object.freeze({ ...metrics, comparisons: metrics.comparisons + 1 });
      break;
    }
    case "shift": {
      if (
        key === null ||
        hole?.index !== event.toSlot ||
        slots[event.fromSlot]?.tokenId !== event.tokenId ||
        slots[event.toSlot]?.tokenId !== null
      ) {
        throw new Error("无法在当前状态右移元素");
      }
      slots[event.toSlot] = { index: event.toSlot, tokenId: event.tokenId };
      slots[event.fromSlot] = { index: event.fromSlot, tokenId: null };
      hole = Object.freeze({ index: event.fromSlot });
      metrics = Object.freeze({
        comparisons: metrics.comparisons,
        shifts: metrics.shifts + 1,
        writes: metrics.writes + 1,
      });
      break;
    }
    case "insert": {
      if (
        key?.tokenId !== event.tokenId ||
        hole?.index !== event.toSlot ||
        slots[event.toSlot]?.tokenId !== null
      ) {
        throw new Error("无法在当前状态插入 key");
      }
      slots[event.toSlot] = { index: event.toSlot, tokenId: event.tokenId };
      key = null;
      hole = null;
      sortedEnd = event.outerIndex;
      metrics = Object.freeze({ ...metrics, writes: metrics.writes + 1 });
      break;
    }
    case "settle": {
      if (key !== null || hole !== null || state.sortedEnd !== event.outerIndex) {
        throw new Error("当前轮尚未完成，不能进入稳定状态");
      }
      complete = event.completed;
      break;
    }
  }

  return freezeTeachingSnapshot({
    tokens: state.tokens,
    slots: Object.freeze(slots.map((slot) => Object.freeze(slot))),
    key,
    hole,
    sortedEnd,
    outerIndex: event.outerIndex,
    compareIndex,
    comparisonResult,
    activeRelationId: event.relationId,
    metrics,
    appliedEventCount: event.sequence,
    complete,
  });
}

export function seekInsertionSortTeachingTimeline(
  timeline: InsertionSortTeachingTimeline,
  appliedEventCount: number,
): InsertionSortTeachingSnapshot {
  if (
    !Number.isInteger(appliedEventCount) ||
    appliedEventCount < 0 ||
    appliedEventCount > timeline.events.length
  ) {
    throw new RangeError("教学时间线位置超出范围");
  }
  return timeline.states[appliedEventCount]!;
}

/** Resolves slot contents while preserving the explicit hole as null. */
export function insertionSortSnapshotValues(
  state: InsertionSortTeachingSnapshot,
): readonly (number | null)[] {
  const valuesByToken = new Map(state.tokens.map((token) => [token.id, token.value]));
  return Object.freeze(
    state.slots.map((slot) =>
      slot.tokenId === null ? null : (valuesByToken.get(slot.tokenId) ?? null),
    ),
  );
}

export function validateInsertionSortLearnerAction(
  expectedEvent: InsertionSortTeachingEvent,
  action: InsertionSortLearnerAction,
): InsertionSortActionValidation {
  if (expectedEvent.kind === "pick-key")
    return validateInsertionSortPickAction(expectedEvent, action);
  if (expectedEvent.kind === "compare") {
    return validateInsertionSortPredictionAction(expectedEvent, action);
  }
  if (expectedEvent.kind === "shift")
    return validateInsertionSortShiftAction(expectedEvent, action);
  if (expectedEvent.kind === "insert")
    return validateInsertionSortInsertAction(expectedEvent, action);
  return validation(false, "not-actionable", null);
}

export function validateInsertionSortPickAction(
  expectedEvent: InsertionSortPickKeyEvent,
  action: InsertionSortLearnerAction,
): InsertionSortActionValidation {
  if (action.type !== "pick-key") return validation(false, "wrong-action", "pick-key");
  if (action.tokenId !== expectedEvent.tokenId) return validation(false, "wrong-token", "pick-key");
  if (action.fromSlot !== expectedEvent.fromSlot)
    return validation(false, "wrong-source", "pick-key");
  return validation(true, "accepted", "pick-key");
}

export function validateInsertionSortShiftAction(
  expectedEvent: InsertionSortShiftEvent,
  action: InsertionSortLearnerAction,
): InsertionSortActionValidation {
  if (action.type !== "shift") return validation(false, "wrong-action", "shift");
  if (action.tokenId !== expectedEvent.tokenId) return validation(false, "wrong-token", "shift");
  if (action.fromSlot !== expectedEvent.fromSlot) return validation(false, "wrong-source", "shift");
  if (action.toSlot !== expectedEvent.toSlot) return validation(false, "wrong-target", "shift");
  return validation(true, "accepted", "shift");
}

export function validateInsertionSortInsertAction(
  expectedEvent: InsertionSortInsertEvent,
  action: InsertionSortLearnerAction,
): InsertionSortActionValidation {
  if (action.type !== "insert") return validation(false, "wrong-action", "insert");
  if (action.tokenId !== expectedEvent.tokenId) return validation(false, "wrong-token", "insert");
  if (action.toSlot !== expectedEvent.toSlot) return validation(false, "wrong-target", "insert");
  return validation(true, "accepted", "insert");
}

export function validateInsertionSortPredictionAction(
  expectedEvent: InsertionSortCompareEvent,
  action: InsertionSortLearnerAction,
): InsertionSortActionValidation {
  if (action.type !== "prediction") return validation(false, "wrong-action", "prediction");
  if (action.shouldShift !== expectedEvent.shouldShift) {
    return validation(false, "wrong-prediction", "prediction");
  }
  return validation(true, "accepted", "prediction");
}

/** Parses the lesson's deliberately small free-experiment input (2-12 safe integers). */
export function parseInsertionSortCustomInput(source: string): InsertionSortCustomInputResult {
  const normalized = source.trim();
  if (normalized.length === 0) return Object.freeze({ ok: false, code: "empty" });
  if (!/^[+-]?\d+(?:[\s,]+[+-]?\d+)*$/u.test(normalized)) {
    return Object.freeze({ ok: false, code: "invalid-token" });
  }
  const tokens = normalized.split(/[\s,]+/u);
  if (tokens.length < 2) return Object.freeze({ ok: false, code: "too-few" });
  if (tokens.length > 12) return Object.freeze({ ok: false, code: "too-many" });
  const values = tokens.map(Number);
  if (!values.every((value) => Number.isSafeInteger(value))) {
    return Object.freeze({ ok: false, code: "unsafe-integer" });
  }
  return Object.freeze({ ok: true, values: Object.freeze(values) });
}

/**
 * Deterministic teaching execution model. Frames are semantic replay, not sampled C variables and
 * not real Trace evidence.
 */
export function createInsertionSortTeachingFrames(
  input: readonly number[],
): readonly InsertionSortFrame[] {
  assertTeachingInput(input);
  const values = [...input];
  const frames: InsertionSortFrame[] = [];
  let comparisons = 0;
  let shifts = 0;
  let writes = 0;
  const publish = (
    phase: InsertionSortFramePhase,
    sortedEnd: number,
    outerIndex: number | null,
    slotIndex: number | null,
    compareIndex: number | null,
    key: number | null,
    comparisonResult: boolean | null,
    activeRelationId: InsertionSortRelationId | null,
  ): void => {
    frames.push(
      Object.freeze({
        phase,
        values: Object.freeze([...values]),
        sortedEnd,
        outerIndex,
        slotIndex,
        compareIndex,
        key,
        comparisonResult,
        activeRelationId,
        metrics: Object.freeze({ comparisons, shifts, writes }),
      }),
    );
  };

  publish("ready", 0, null, null, null, null, null, null);
  for (let i = 1; i < values.length; i += 1) {
    const key = values[i]!;
    let j = i;
    publish("select-key", i - 1, i, j, null, key, null, "array-to-key");
    while (j > 0) {
      comparisons += 1;
      const shouldShift = values[j - 1]! > key;
      publish("compare", i - 1, i, j, j - 1, key, shouldShift, "predecessor-to-condition");
      if (!shouldShift) break;
      values[j] = values[j - 1]!;
      shifts += 1;
      writes += 1;
      publish("shift", i - 1, i, j, j - 1, key, true, "predecessor-to-slot");
      j -= 1;
    }
    values[j] = key;
    writes += 1;
    publish("insert", i, i, j, null, key, null, "key-to-slot");
  }
  publish("complete", values.length - 1, null, null, null, null, null, null);
  return Object.freeze(frames);
}

function assertTeachingInput(input: readonly number[]): void {
  if (!Array.isArray(input) || input.length < 1 || input.length > 256) {
    throw new RangeError("教学推演输入长度必须在 1 到 256 之间");
  }
  if (!input.every((value) => Number.isSafeInteger(value))) {
    throw new TypeError("教学推演只接受安全整数");
  }
}

function eventBase(
  sequence: number,
  kind: InsertionSortTeachingEventKind,
  outerIndex: number,
  relationId: InsertionSortRelationId | null,
): InsertionSortTeachingEventBase {
  const sourceLine =
    relationId === null
      ? exactSourceLine(INSERTION_SORT_LAB_SOURCE, "for (size_t i = 1; i < count; i++)")
      : INSERTION_SORT_SEMANTIC_RELATIONS.find((relation) => relation.id === relationId)
          ?.sourceLine;
  if (sourceLine === null || sourceLine === undefined) {
    throw new Error(`插入排序教学事件缺少源码锚点：${kind}`);
  }
  return {
    id: `event-${String(sequence)}`,
    sequence,
    kind,
    type: kind,
    durationMs: INSERTION_SORT_TEACHING_EVENT_DURATIONS[kind],
    outerIndex,
    sourceLine,
    relationId,
  };
}

function freezeTeachingEvent<T extends InsertionSortTeachingEvent>(event: T): T {
  return Object.freeze(event);
}

function freezeTeachingSnapshot(
  state: InsertionSortTeachingSnapshot,
): InsertionSortTeachingSnapshot {
  return Object.freeze(state);
}

function tokenById(
  state: InsertionSortTeachingSnapshot,
  tokenId: string,
): InsertionSortTeachingToken {
  const token = state.tokens.find((candidate) => candidate.id === tokenId);
  if (token === undefined) throw new Error(`插入排序教学状态缺少元素：${tokenId}`);
  return token;
}

function validation(
  accepted: boolean,
  code: InsertionSortActionValidationCode,
  expectedKind: InsertionSortLearnerAction["type"] | null,
): InsertionSortActionValidation {
  return Object.freeze({ accepted, code, expectedKind });
}

function labCase(
  id: InsertionSortLabCase["id"],
  input: readonly number[],
  expected: readonly number[],
): InsertionSortLabCase {
  return Object.freeze({
    id,
    input: Object.freeze([...input]),
    expected: Object.freeze([...expected]),
  });
}

function semanticRelation(
  id: InsertionSortRelationId,
  from: string,
  to: string,
  role: InsertionSortSemanticRelation["role"],
  fragment: string,
): InsertionSortSemanticRelation {
  const sourceLine = exactSourceLine(INSERTION_SORT_SHIFT_OPTIMIZED_SOURCE, fragment);
  if (sourceLine === null) throw new Error(`插入排序语义关系缺少源码锚点：${id}`);
  return Object.freeze({ id, from, to, role, sourceLine });
}

function signature(id: string, label: string, fragment: string) {
  return Object.freeze({ id, label, fragment });
}

function exactSourceLine(source: string, fragment: string): number | null {
  const index = source.indexOf(fragment);
  if (index < 0) return null;
  return source.slice(0, index).split("\n").length;
}
