import type { TraceObservationProfileId } from "../shared/trace.js";
import { foaText, type FoaLocalizedText } from "./foa-contracts.js";

export type FoaTransitionPrototypeOrder = 63 | 70;
export interface FoaTransitionRealTraceProvenance {
  readonly kind: "real-trace";
  readonly sessionId: string;
  readonly sourceFingerprint: string;
  /** Renderer-side lesson input identity used to invalidate a changed teaching model. */
  readonly inputDigest: string;
  /** Main-process fingerprint of the stdin actually passed to the native C process. */
  readonly inputFingerprint: string;
  readonly observationProfileId: TraceObservationProfileId;
  readonly observationAuthorizationDigest: string;
}

export type FoaTransitionProvenance = "teaching-model" | FoaTransitionRealTraceProvenance;
export type FoaTransitionTraceStatus = "awaiting-instrumented-trace" | "verified-real-trace";
export type FoaTransitionObjectKind = "scalar" | "record" | "field" | "pointer" | "array";
export type FoaTransitionRelationKind =
  | "contains"
  | "input-write"
  | "object-link"
  | "field-access"
  | "compare"
  | "true-branch"
  | "false-branch";
export type FoaTransitionFramePhase =
  | "create"
  | "bind"
  | "resolve"
  | "write"
  | "initialise"
  | "calculate"
  | "compare"
  | "branch"
  | "output";

export type FoaTransitionStateValue = string | number | boolean | null;

export interface FoaTransitionSourceAnchor {
  readonly id: string;
  readonly exact: string;
  readonly expectedEvent: "scalar-write" | "object-link" | "branch" | "output";
}

export interface FoaTransitionObject {
  readonly id: string;
  readonly kind: FoaTransitionObjectKind;
  readonly label: FoaLocalizedText;
}

export interface FoaTransitionRelation {
  readonly id: string;
  readonly fromObjectId: string;
  readonly toObjectId: string;
  readonly kind: FoaTransitionRelationKind;
  readonly label: FoaLocalizedText;
}

export interface FoaTransitionStateChange {
  readonly objectId: string;
  readonly before: FoaTransitionStateValue;
  readonly after: FoaTransitionStateValue;
}

/**
 * One immutable frame from a course-authored teaching model. A frame is never a runtime sample.
 * `sourceAnchorId` is only an upgrade point for a future bounded shadow Trace implementation.
 */
export interface FoaTransitionRuntimeFrame {
  readonly id: string;
  readonly phase: FoaTransitionFramePhase;
  readonly sourceAnchorId: string;
  readonly summary: FoaLocalizedText;
  readonly state: Readonly<Record<string, FoaTransitionStateValue>>;
  readonly changes: readonly FoaTransitionStateChange[];
  readonly activeObjectIds: readonly string[];
  readonly activeRelationIds: readonly string[];
  readonly branchOutcome: boolean | null;
  readonly provenance: FoaTransitionProvenance;
}

interface FoaTransitionEvidenceBoundaryBase {
  readonly sourceFingerprintRequired: true;
  readonly description: FoaLocalizedText;
}

export type FoaTransitionEvidenceBoundary =
  | (FoaTransitionEvidenceBoundaryBase & {
      readonly provenance: "teaching-model";
      readonly traceStatus: "awaiting-instrumented-trace";
      readonly canClaimRealTrace: false;
    })
  | (FoaTransitionEvidenceBoundaryBase & {
      readonly provenance: FoaTransitionRealTraceProvenance;
      readonly traceStatus: "verified-real-trace";
      readonly canClaimRealTrace: true;
    });

export interface FoaTransitionRuntimePrototype {
  readonly lessonOrder: FoaTransitionPrototypeOrder;
  readonly lessonId: string;
  readonly title: FoaLocalizedText;
  readonly evidence: FoaTransitionEvidenceBoundary;
  /** Learner-selected values used by the deterministic model and normalized process stdin. */
  readonly modelInput: Readonly<Record<string, FoaTransitionStateValue>>;
  readonly stdin: string;
  readonly stdout: string;
  readonly sourceAnchors: readonly FoaTransitionSourceAnchor[];
  readonly objects: readonly FoaTransitionObject[];
  readonly relations: readonly FoaTransitionRelation[];
  readonly frames: readonly FoaTransitionRuntimeFrame[];
}

const DEFAULT_SEARCH_VALUES = Object.freeze([1, 3, 5, 7, 9]);
const DEFAULT_SEARCH_TARGET = 7;
const C_INT_MIN = -2_147_483_648;
const C_INT_MAX = 2_147_483_647;

const TEACHING_EVIDENCE: FoaTransitionEvidenceBoundary = Object.freeze({
  provenance: "teaching-model",
  traceStatus: "awaiting-instrumented-trace",
  canClaimRealTrace: false,
  sourceFingerprintRequired: true,
  description: foaText(
    "当前数值由课程模型推演，不是实际进程采样；接入匹配源码指纹的影子 Trace 后才能升级为真实证据。",
    "Current values are derived by the course model, not sampled from a process; only a shadow Trace bound to the matching source fingerprint may upgrade them to real evidence.",
  ),
});

const PROTOTYPES: Readonly<Record<FoaTransitionPrototypeOrder, FoaTransitionRuntimePrototype>> =
  Object.freeze({
    63: definePrototype({
      lessonOrder: 63,
      lessonId: "tutorial.foa.c08.l063",
      title: foaText("通过结构体指针写字段", "Writing a field through a structure pointer"),
      evidence: TEACHING_EVIDENCE,
      modelInput: Object.freeze({ initialValue: 4 }),
      stdin: "4\n",
      stdout: "5\n",
      sourceAnchors: [
        anchor("63.counter", "struct Counter counter;", "scalar-write"),
        anchor("63.input", 'if (scanf("%d", &counter.value) != 1) {', "scalar-write"),
        anchor("63.link", "struct Counter *link = &counter;", "object-link"),
        anchor("63.increment", "link->value++;", "scalar-write"),
        anchor("63.output", 'printf("%d\\n", counter.value);', "output"),
      ],
      objects: [
        object("63.object.input", "scalar", "本次输入", "current input"),
        object("63.object.counter", "record", "counter 对象", "counter object"),
        object("63.object.counter.value", "field", "counter.value 字段", "counter.value field"),
        object("63.object.link", "pointer", "link 指针", "link pointer"),
      ],
      relations: [
        relation(
          "63.relation.input-write",
          "63.object.input",
          "63.object.counter.value",
          "input-write",
          "scanf 把输入写入 value",
          "scanf writes the input to value",
        ),
        relation(
          "63.relation.contains",
          "63.object.counter",
          "63.object.counter.value",
          "contains",
          "包含 value 字段",
          "contains value field",
        ),
        relation(
          "63.relation.object-link",
          "63.object.link",
          "63.object.counter",
          "object-link",
          "link 指向 counter",
          "link points to counter",
        ),
        relation(
          "63.relation.field-access",
          "63.object.link",
          "63.object.counter.value",
          "field-access",
          "link->value 访问字段",
          "link->value accesses the field",
        ),
      ],
      frames: createCounterFrames(4),
    }),
    70: definePrototype({
      lessonOrder: 70,
      lessonId: "tutorial.foa.c09.l070",
      title: foaText("二分收缩到插入位置", "Binary narrowing to an insertion position"),
      evidence: TEACHING_EVIDENCE,
      modelInput: Object.freeze({ values: "[1, 3, 5, 7, 9]", target: 7 }),
      stdin: "5\n1 3 5 7 9\n7\n",
      stdout: "3\n",
      sourceAnchors: [
        anchor("70.initialise", "size_t high = (size_t)count;", "scalar-write"),
        anchor("70.mid", "size_t mid = low + (high - low) / 2;", "scalar-write"),
        anchor("70.compare", "if (values[mid] < target) {", "branch"),
        anchor("70.update-low", "low = mid + 1; /* trace-anchor: low */", "scalar-write"),
        anchor("70.update-high", "high = mid; /* trace-anchor: high */", "scalar-write"),
        anchor("70.output", 'printf("%zu\\n", low);', "output"),
      ],
      objects: [
        object("70.object.values", "array", "有序数组 values", "sorted values array"),
        object("70.object.target", "scalar", "目标 target", "target"),
        object("70.object.low", "scalar", "下界 low", "lower bound low"),
        object("70.object.mid", "scalar", "中点 mid", "midpoint mid"),
        object("70.object.high", "scalar", "上界 high", "upper bound high"),
      ],
      relations: [
        relation(
          "70.relation.compare",
          "70.object.values",
          "70.object.target",
          "compare",
          "values[mid] < target",
          "values[mid] < target",
        ),
        relation(
          "70.relation.true",
          "70.object.mid",
          "70.object.low",
          "true-branch",
          "真：low = mid + 1",
          "true: low = mid + 1",
        ),
        relation(
          "70.relation.false",
          "70.object.mid",
          "70.object.high",
          "false-branch",
          "假：high = mid",
          "false: high = mid",
        ),
      ],
      frames: createLowerBoundFrames(DEFAULT_SEARCH_VALUES, DEFAULT_SEARCH_TARGET),
    }),
  });

export function getFoaTransitionRuntimePrototype(
  order: FoaTransitionPrototypeOrder,
): FoaTransitionRuntimePrototype {
  return PROTOTYPES[order];
}

export function createFoaTransitionRuntime63(initialValue = 4): FoaTransitionRuntimePrototype {
  assertBoundedInteger(initialValue, -999, 999, "FOA lesson 63 initial value");
  const result = initialValue + 1;
  return definePrototype({
    ...PROTOTYPES[63],
    modelInput: Object.freeze({ initialValue }),
    stdin: `${String(initialValue)}\n`,
    stdout: `${String(result)}\n`,
    frames: createCounterFrames(initialValue),
  });
}

/**
 * Builds the lower-bound teaching timeline for a non-decreasing integer array. Equal items are
 * accepted deliberately so the model can demonstrate returning the first insertion position.
 */
export function createFoaTransitionRuntime70(
  values: readonly number[] = DEFAULT_SEARCH_VALUES,
  target = DEFAULT_SEARCH_TARGET,
): FoaTransitionRuntimePrototype {
  const normalizedValues = validateSearchInput(values, target);
  const frames = createLowerBoundFrames(normalizedValues, target);
  const output = frames.at(-1)?.state.output;
  if (typeof output !== "number") {
    throw new TypeError("FOA lesson 70 teaching model did not produce a numeric output");
  }
  return definePrototype({
    ...PROTOTYPES[70],
    modelInput: Object.freeze({ values: `[${normalizedValues.join(", ")}]`, target }),
    stdin: `${String(normalizedValues.length)}\n${normalizedValues.join(" ")}\n${String(target)}\n`,
    stdout: `${String(output)}\n`,
    frames,
  });
}

export const FOA_TRANSITION_RUNTIME_PROTOTYPES_63_70 = PROTOTYPES;

function createCounterFrames(initialValue: number): readonly FoaTransitionRuntimeFrame[] {
  const writtenValue = initialValue + 1;
  return Object.freeze([
    frame({
      id: "63.frame.create",
      phase: "create",
      sourceAnchorId: "63.counter",
      summary: foaText(
        `建立唯一的 counter 对象；value 尚未接收本次输入 ${String(initialValue)}。`,
        `Create the single counter object; value has not received the current input ${String(initialValue)} yet.`,
      ),
      state: { inputValue: initialValue, counterValue: null, linkTarget: null, output: "" },
      changes: [],
      activeObjectIds: ["63.object.input", "63.object.counter"],
      activeRelationIds: ["63.relation.contains"],
    }),
    frame({
      id: "63.frame.input",
      phase: "initialise",
      sourceAnchorId: "63.input",
      summary: foaText(
        `scanf 把本次输入 ${String(initialValue)} 写入 counter.value。`,
        `scanf writes the current input ${String(initialValue)} into counter.value.`,
      ),
      state: {
        inputValue: initialValue,
        counterValue: initialValue,
        linkTarget: null,
        output: "",
      },
      changes: [{ objectId: "63.object.counter.value", before: null, after: initialValue }],
      activeObjectIds: ["63.object.input", "63.object.counter.value"],
      activeRelationIds: ["63.relation.input-write"],
    }),
    frame({
      id: "63.frame.bind",
      phase: "bind",
      sourceAnchorId: "63.link",
      summary: foaText(
        "把 link 连接到现有 counter；没有复制第二个 Counter。",
        "Connect link to the existing counter; no second Counter is copied.",
      ),
      state: {
        inputValue: initialValue,
        counterValue: initialValue,
        linkTarget: "counter",
        output: "",
      },
      changes: [{ objectId: "63.object.link", before: null, after: "counter" }],
      activeObjectIds: ["63.object.link", "63.object.counter"],
      activeRelationIds: ["63.relation.object-link"],
    }),
    frame({
      id: "63.frame.resolve",
      phase: "resolve",
      sourceAnchorId: "63.increment",
      summary: foaText(
        "先沿对象链接到 counter，再选择它的 value 字段。",
        "Follow the object link to counter, then select its value field.",
      ),
      state: {
        inputValue: initialValue,
        counterValue: initialValue,
        linkTarget: "counter",
        selectedField: "counter.value",
        output: "",
      },
      changes: [],
      activeObjectIds: ["63.object.link", "63.object.counter", "63.object.counter.value"],
      activeRelationIds: ["63.relation.object-link", "63.relation.field-access"],
    }),
    frame({
      id: "63.frame.write",
      phase: "write",
      sourceAnchorId: "63.increment",
      summary: foaText(
        `通过别名把同一字段从 ${String(initialValue)} 写成 ${String(writtenValue)}。`,
        `Write the same field from ${String(initialValue)} to ${String(writtenValue)} through the alias.`,
      ),
      state: {
        inputValue: initialValue,
        counterValue: writtenValue,
        linkTarget: "counter",
        selectedField: "counter.value",
        output: "",
      },
      changes: [
        {
          objectId: "63.object.counter.value",
          before: initialValue,
          after: writtenValue,
        },
      ],
      activeObjectIds: ["63.object.link", "63.object.counter.value"],
      activeRelationIds: ["63.relation.field-access"],
    }),
    frame({
      id: "63.frame.output",
      phase: "output",
      sourceAnchorId: "63.output",
      summary: foaText(
        `从 counter.value 读取 ${String(writtenValue)} 并输出。`,
        `Read ${String(writtenValue)} from counter.value and write it.`,
      ),
      state: {
        inputValue: initialValue,
        counterValue: writtenValue,
        linkTarget: "counter",
        output: String(writtenValue),
      },
      changes: [],
      activeObjectIds: ["63.object.counter.value"],
      activeRelationIds: ["63.relation.contains"],
    }),
  ]);
}

function createLowerBoundFrames(
  values: readonly number[],
  target: number,
): readonly FoaTransitionRuntimeFrame[] {
  let low = 0;
  let high = values.length;
  let iteration = 0;
  const frames: FoaTransitionRuntimeFrame[] = [
    frame({
      id: "70.frame.initialise",
      phase: "initialise",
      sourceAnchorId: "70.initialise",
      summary: foaText(
        `从完整可行区间 [0,${String(high)}) 开始。`,
        `Start with the full feasible interval [0,${String(high)}).`,
      ),
      state: searchState(values, target, low, null, high, iteration),
      changes: [
        { objectId: "70.object.low", before: null, after: low },
        { objectId: "70.object.high", before: null, after: high },
      ],
      activeObjectIds: ["70.object.values", "70.object.target", "70.object.low", "70.object.high"],
      activeRelationIds: [],
    }),
  ];

  while (low < high) {
    iteration += 1;
    const mid = low + Math.floor((high - low) / 2);
    const middleValue = values[mid]!;
    const outcome = middleValue < target;

    frames.push(
      frame({
        id: `70.frame.${String(iteration)}.mid`,
        phase: "calculate",
        sourceAnchorId: "70.mid",
        summary: foaText(
          `第 ${String(iteration)} 轮：mid=${String(mid)}，读取 values[${String(mid)}]=${String(middleValue)}。`,
          `Iteration ${String(iteration)}: mid=${String(mid)}, read values[${String(mid)}]=${String(middleValue)}.`,
        ),
        state: searchState(values, target, low, mid, high, iteration),
        changes: [{ objectId: "70.object.mid", before: null, after: mid }],
        activeObjectIds: ["70.object.low", "70.object.mid", "70.object.high", "70.object.values"],
        activeRelationIds: [],
      }),
      frame({
        id: `70.frame.${String(iteration)}.compare`,
        phase: "compare",
        sourceAnchorId: "70.compare",
        summary: foaText(
          `${String(middleValue)} < ${String(target)} → ${outcome ? "真" : "假"}。`,
          `${String(middleValue)} < ${String(target)} → ${outcome ? "true" : "false"}.`,
        ),
        state: {
          ...searchState(values, target, low, mid, high, iteration),
          middleValue,
          predicate: outcome,
        },
        changes: [],
        activeObjectIds: ["70.object.values", "70.object.target", "70.object.mid"],
        activeRelationIds: ["70.relation.compare"],
        branchOutcome: outcome,
      }),
    );

    const before = outcome ? low : high;
    if (outcome) low = mid + 1;
    else high = mid;
    frames.push(
      frame({
        id: `70.frame.${String(iteration)}.branch`,
        phase: "branch",
        sourceAnchorId: outcome ? "70.update-low" : "70.update-high",
        summary: outcome
          ? foaText(
              `真分支把 low 从 ${String(before)} 移到 ${String(low)}。`,
              `The true branch moves low from ${String(before)} to ${String(low)}.`,
            )
          : foaText(
              `假分支把 high 从 ${String(before)} 移到 ${String(high)}。`,
              `The false branch moves high from ${String(before)} to ${String(high)}.`,
            ),
        state: searchState(values, target, low, mid, high, iteration),
        changes: [
          {
            objectId: outcome ? "70.object.low" : "70.object.high",
            before,
            after: outcome ? low : high,
          },
        ],
        activeObjectIds: ["70.object.mid", outcome ? "70.object.low" : "70.object.high"],
        activeRelationIds: [outcome ? "70.relation.true" : "70.relation.false"],
        branchOutcome: outcome,
      }),
    );
  }

  frames.push(
    frame({
      id: "70.frame.output",
      phase: "output",
      sourceAnchorId: "70.output",
      summary: foaText(
        `区间收敛为 [${String(low)},${String(high)})，输出插入位置 ${String(low)}。`,
        `The interval converges to [${String(low)},${String(high)}); write insertion position ${String(low)}.`,
      ),
      state: { ...searchState(values, target, low, low, high, iteration), output: low },
      changes: [],
      activeObjectIds: ["70.object.low", "70.object.high"],
      activeRelationIds: [],
    }),
  );

  return Object.freeze(frames);
}

function searchState(
  values: readonly number[],
  target: number,
  low: number,
  mid: number | null,
  high: number,
  iteration: number,
): Readonly<Record<string, FoaTransitionStateValue>> {
  return Object.freeze({
    values: `[${values.join(", ")}]`,
    target,
    low,
    mid,
    high,
    feasibleRange: `[${String(low)}, ${String(high)})`,
    iteration,
  });
}

function validateSearchInput(values: readonly number[], target: number): readonly number[] {
  if (!Array.isArray(values) || values.length < 2 || values.length > 12) {
    throw new RangeError("FOA lesson 70 expects an array containing 2 to 12 integers");
  }
  assertBoundedInteger(target, C_INT_MIN, C_INT_MAX, "FOA lesson 70 target");
  const normalized = values.map((value, index) => {
    assertBoundedInteger(value, C_INT_MIN, C_INT_MAX, `FOA lesson 70 values[${String(index)}]`);
    return value;
  });
  if (normalized.some((value, index) => index > 0 && value < normalized[index - 1]!)) {
    throw new RangeError("FOA lesson 70 expects values in non-decreasing order");
  }
  return Object.freeze(normalized);
}

function assertBoundedInteger(
  value: number,
  minimum: number,
  maximum: number,
  label: string,
): void {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new RangeError(
      `${label} must be a safe integer from ${String(minimum)} to ${String(maximum)}`,
    );
  }
}

function anchor(
  id: string,
  exact: string,
  expectedEvent: FoaTransitionSourceAnchor["expectedEvent"],
): FoaTransitionSourceAnchor {
  return Object.freeze({ id, exact, expectedEvent });
}

function object(
  id: string,
  kind: FoaTransitionObjectKind,
  zh: string,
  en: string,
): FoaTransitionObject {
  return Object.freeze({ id, kind, label: foaText(zh, en) });
}

function relation(
  id: string,
  fromObjectId: string,
  toObjectId: string,
  kind: FoaTransitionRelationKind,
  zh: string,
  en: string,
): FoaTransitionRelation {
  return Object.freeze({ id, fromObjectId, toObjectId, kind, label: foaText(zh, en) });
}

type FrameInput = Omit<FoaTransitionRuntimeFrame, "provenance" | "branchOutcome"> & {
  readonly branchOutcome?: boolean | null;
};

function frame(input: FrameInput): FoaTransitionRuntimeFrame {
  return Object.freeze({
    ...input,
    state: Object.freeze({ ...input.state }),
    changes: Object.freeze(input.changes.map((change) => Object.freeze({ ...change }))),
    activeObjectIds: Object.freeze([...input.activeObjectIds]),
    activeRelationIds: Object.freeze([...input.activeRelationIds]),
    branchOutcome: input.branchOutcome ?? null,
    provenance: "teaching-model",
  });
}

function definePrototype(input: FoaTransitionRuntimePrototype): FoaTransitionRuntimePrototype {
  const objectIds = new Set(input.objects.map(({ id }) => id));
  const relationIds = new Set(input.relations.map(({ id }) => id));
  const sourceAnchorIds = new Set(input.sourceAnchors.map(({ id }) => id));
  const frameIds = new Set<string>();
  if (objectIds.size !== input.objects.length || relationIds.size !== input.relations.length) {
    throw new TypeError("FOA transition prototypes require unique object and relation IDs");
  }
  if (sourceAnchorIds.size !== input.sourceAnchors.length) {
    throw new TypeError("FOA transition prototypes require unique source-anchor IDs");
  }
  for (const relation of input.relations) {
    if (!objectIds.has(relation.fromObjectId) || !objectIds.has(relation.toObjectId)) {
      throw new RangeError(`FOA transition relation ${relation.id} has an unknown endpoint`);
    }
  }
  for (const item of input.frames) {
    if (frameIds.has(item.id)) throw new TypeError(`Duplicate FOA transition frame ${item.id}`);
    frameIds.add(item.id);
    if (item.provenance !== "teaching-model") {
      throw new TypeError("FOA transition prototype frames must remain teaching models");
    }
    if (!sourceAnchorIds.has(item.sourceAnchorId)) {
      throw new RangeError(`FOA transition frame ${item.id} has an unknown source anchor`);
    }
    if (item.activeObjectIds.some((id) => !objectIds.has(id))) {
      throw new RangeError(`FOA transition frame ${item.id} activates an unknown object`);
    }
    if (item.activeRelationIds.some((id) => !relationIds.has(id))) {
      throw new RangeError(`FOA transition frame ${item.id} activates an unknown relation`);
    }
    if (item.changes.some(({ objectId }) => !objectIds.has(objectId))) {
      throw new RangeError(`FOA transition frame ${item.id} changes an unknown object`);
    }
  }
  if (input.frames.length < 2 || input.frames.at(-1)?.phase !== "output") {
    throw new RangeError(
      "FOA transition prototypes require a multi-frame timeline ending in output",
    );
  }
  return Object.freeze({
    ...input,
    modelInput: Object.freeze({ ...input.modelInput }),
    sourceAnchors: Object.freeze([...input.sourceAnchors]),
    objects: Object.freeze([...input.objects]),
    relations: Object.freeze([...input.relations]),
    frames: Object.freeze([...input.frames]),
  });
}
