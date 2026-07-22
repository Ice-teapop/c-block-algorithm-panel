import { fingerprintSource } from "../shared/source-snapshot.js";
import {
  isTraceProbeEvent,
  type TraceEvent,
  type TraceObservationProfileId,
  type TraceRunEvidence,
  type TraceSessionStatus,
} from "../shared/trace.js";
import { foaText } from "./foa-contracts.js";
import {
  type FoaTransitionRuntimeFrame,
  type FoaTransitionRuntimePrototype,
  type FoaTransitionRealTraceProvenance,
} from "./foa-transition-runtime-63-70.js";
import {
  assertFoaTransitionRuntime7580Anchors,
  type FoaTransitionRuntime7580RealTraceProvenance,
  type FoaTransitionRuntime7580Timeline,
} from "./foa-transition-runtime-75-80.js";
import type {
  FoaTransitionTraceBinding63,
  FoaTransitionTraceBinding70,
  FoaTransitionTraceBinding75,
  FoaTransitionTraceBinding80,
} from "./foa-transition-trace-bindings.js";

export type FoaTransitionTraceBinding =
  | FoaTransitionTraceBinding63
  | FoaTransitionTraceBinding70
  | FoaTransitionTraceBinding75
  | FoaTransitionTraceBinding80;

export type FoaTransitionVerifiedModel =
  FoaTransitionRuntimePrototype | FoaTransitionRuntime7580Timeline;

export type FoaTransitionTraceVerificationCode =
  | "not-completed"
  | "run-failed"
  | "source-stale"
  | "input-stale"
  | "observation-identity"
  | "stdout-mismatch"
  | "event-sequence"
  | "probe-missing"
  | "probe-mismatch"
  | "anchor-mismatch";

export interface FoaTransitionTraceVerificationInput {
  readonly binding: FoaTransitionTraceBinding;
  readonly source: string;
  readonly sessionId: string;
  readonly sourceFingerprint: string;
  /** Renderer-side digest captured when the teaching binding was selected. */
  readonly inputDigest: string;
  /** Main-process identity echoed unchanged from Trace start through the terminal batch. */
  readonly inputFingerprint: string;
  readonly observationProfileId: TraceObservationProfileId | null;
  readonly observationAuthorizationDigest: string | null;
  readonly status: TraceSessionStatus;
  readonly events: readonly TraceEvent[];
  readonly evidence: TraceRunEvidence | null;
}

export type FoaTransitionTraceVerificationResult =
  | {
      readonly ok: true;
      readonly model: FoaTransitionVerifiedModel;
      readonly provenance:
        FoaTransitionRealTraceProvenance | FoaTransitionRuntime7580RealTraceProvenance;
      readonly probeEventCount: number;
    }
  | {
      readonly ok: false;
      readonly code: FoaTransitionTraceVerificationCode;
      readonly message: string;
    };

interface ExpectedScalarProbe {
  readonly probeId: string;
  readonly kind: "scalar";
  readonly line: number;
  readonly value: number | boolean;
}

interface ExpectedArrayProbe {
  readonly probeId: string;
  readonly kind: "array";
  readonly line: number;
  readonly indices: readonly number[];
  readonly value: number | boolean;
}

interface ExpectedObjectProbe {
  readonly probeId: string;
  readonly kind: "object";
  readonly line: number;
  readonly objectId: string;
  readonly targetObjectId: string | null;
  readonly fieldId: string | null;
  readonly value: boolean;
}

type ExpectedValueProbe = ExpectedScalarProbe | ExpectedArrayProbe | ExpectedObjectProbe;

const DECODER = new TextDecoder("utf-8", { fatal: true });

/** Stable renderer-side identity for invalidating evidence when only lesson stdin changes. */
export function createFoaTransitionInputDigest(stdin: string): string {
  return fingerprintSource(`algolatch-foa-transition-input-v1\0${stdin}`);
}

/**
 * Upgrades a course-authored model only after the real process proves every state used by its
 * visual timeline. Control-flow completion alone is intentionally insufficient.
 */
export function verifyFoaTransitionTrace(
  input: FoaTransitionTraceVerificationInput,
): FoaTransitionTraceVerificationResult {
  const commonFailure = validateCommonEvidence(input);
  if (commonFailure !== null) return commonFailure;

  const probes = input.events.filter(isTraceProbeEvent);
  if (probes.length === 0) {
    return failure("probe-missing", "真实运行没有返回本课程所需的状态探针。");
  }
  const lineFailure = validateProbeLines(input.binding.lessonOrder, input.source, probes);
  if (lineFailure !== null) return lineFailure;

  let probeFailure: FoaTransitionTraceVerificationResult | null;
  switch (input.binding.lessonOrder) {
    case 63:
      probeFailure = compareValueProbes(probes, expected63(input.binding));
      break;
    case 70:
      probeFailure = compareValueProbes(probes, expected70(input.binding));
      break;
    case 75:
      probeFailure = verifyCallProbes(probes, input.binding);
      break;
    case 80:
      probeFailure = compareValueProbes(probes, expected80(input.binding));
      break;
  }
  if (probeFailure !== null) return probeFailure;
  const observationAuthorizationDigest = input.observationAuthorizationDigest;
  if (observationAuthorizationDigest === null) {
    return failure("observation-identity", "Trace 缺少主进程观测授权摘要。");
  }

  const provenance = Object.freeze({
    kind: "real-trace" as const,
    sessionId: input.sessionId,
    sourceFingerprint: input.sourceFingerprint,
    inputDigest: input.inputDigest,
    inputFingerprint: input.inputFingerprint,
    observationProfileId: input.binding.profileId,
    observationAuthorizationDigest,
  });
  const model =
    input.binding.lessonOrder === 63 || input.binding.lessonOrder === 70
      ? upgradePrototype(input.binding.model, provenance)
      : upgradeTimeline(input.binding.model, provenance);
  return Object.freeze({
    ok: true,
    model,
    provenance: modelProvenance(model),
    probeEventCount: probes.length,
  });
}

function validateCommonEvidence(
  input: FoaTransitionTraceVerificationInput,
): FoaTransitionTraceVerificationResult | null {
  if (input.status !== "completed" || input.evidence === null) {
    return failure("not-completed", "Trace 未完整结束，继续使用教学推演。");
  }
  if (
    !input.evidence.ok ||
    input.evidence.exitCode !== 0 ||
    input.evidence.signal !== null ||
    input.evidence.termination !== "process-exit"
  ) {
    return failure("run-failed", "真实 C 进程没有正常退出，证据无效。");
  }
  if (
    input.sessionId.trim().length === 0 ||
    input.source !== input.binding.source ||
    input.sourceFingerprint !== fingerprintSource(input.source)
  ) {
    return failure("source-stale", "Trace 不属于当前课程源码版本。");
  }
  if (input.inputDigest !== createFoaTransitionInputDigest(input.binding.stdin)) {
    return failure("input-stale", "Trace 不属于当前课程输入。");
  }
  if (input.inputFingerprint !== fingerprintSource(input.binding.stdin)) {
    return failure("input-stale", "主进程实际运行的输入不属于当前课程输入。");
  }
  if (
    input.observationProfileId !== input.binding.profileId ||
    !/^[a-f0-9]{64}$/u.test(input.observationAuthorizationDigest ?? "")
  ) {
    return failure("observation-identity", "Trace 不属于当前课程的固定观测配置。");
  }
  const stdout = decodeStdout(input.evidence.stdout);
  if (stdout === null || stdout !== input.binding.expectedStdout) {
    return failure("stdout-mismatch", "真实输出与课程输入对应的预期结果不一致。");
  }
  if (!hasStrictEventSequence(input.events)) {
    return failure("event-sequence", "Trace 事件缺失、重复或乱序。");
  }
  try {
    if (input.binding.lessonOrder === 75 || input.binding.lessonOrder === 80) {
      assertFoaTransitionRuntime7580Anchors(input.source, input.binding.model);
    } else {
      assertPrototypeAnchors(input.source, input.binding.model);
    }
  } catch {
    return failure("anchor-mismatch", "课程源码锚点缺失或有歧义，拒绝升级真实证据。");
  }
  return null;
}

function expected63(binding: FoaTransitionTraceBinding63): readonly ExpectedValueProbe[] {
  const initial = binding.modelInput.initialValue;
  return Object.freeze([
    scalar(
      "foa63.counter.value",
      initial,
      uniqueLine(binding.source, 'if (scanf("%d", &counter.value) != 1) {'),
    ),
    objectProbe(
      "foa63.link.target",
      "foa63.link",
      "foa63.counter",
      uniqueLine(binding.source, "struct Counter *link = &counter;"),
    ),
    scalar("foa63.counter.value", initial + 1, uniqueLine(binding.source, "link->value++;")),
  ]);
}

function expected70(binding: FoaTransitionTraceBinding70): readonly ExpectedValueProbe[] {
  const expected: ExpectedValueProbe[] = [
    scalar("foa70.low", 0, uniqueLine(binding.source, "size_t low = 0;")),
    scalar(
      "foa70.high",
      binding.modelInput.values.length,
      uniqueLine(binding.source, "size_t high = (size_t)count;"),
    ),
  ];
  for (const frame of binding.model.frames) {
    if (frame.phase === "calculate") {
      const mid = requireNumber(frame.state.mid);
      const values = binding.modelInput.values;
      expected.push(
        scalar(
          "foa70.mid",
          mid,
          uniqueLine(binding.source, "size_t mid = low + (high - low) / 2;"),
        ),
        arrayProbe(
          "foa70.values.at-mid",
          [mid],
          values[mid]!,
          uniqueLine(binding.source, "if (values[mid] < target) {"),
        ),
      );
    } else if (frame.phase === "compare") {
      expected.push(
        scalar(
          "foa70.compare",
          frame.branchOutcome === true,
          uniqueLine(binding.source, "if (values[mid] < target) {"),
        ),
      );
    } else if (frame.phase === "branch") {
      const changed = frame.changes[0];
      if (changed?.objectId === "70.object.low") {
        expected.push(
          scalar(
            "foa70.low",
            requireNumber(changed.after),
            uniqueLine(binding.source, "low = mid + 1; /* trace-anchor: low */"),
          ),
        );
      } else if (changed?.objectId === "70.object.high") {
        expected.push(
          scalar(
            "foa70.high",
            requireNumber(changed.after),
            uniqueLine(binding.source, "high = mid; /* trace-anchor: high */"),
          ),
        );
      } else {
        throw new TypeError("FOA lesson 70 model has an invalid branch change");
      }
    }
  }
  return Object.freeze(expected);
}

function expected80(binding: FoaTransitionTraceBinding80): readonly ExpectedValueProbe[] {
  const open = binding.modelInput.openGrid;
  const paths = Array.from({ length: 3 }, () => [0, 0, 0]);
  const expected: ExpectedValueProbe[] = [];
  for (let row = 0; row < 3; row += 1) {
    for (let column = 0; column < 3; column += 1) {
      expected.push(
        arrayProbe(
          "foa80.paths.write",
          [row, column],
          0,
          uniqueLine(binding.source, "paths[r][c] = 0;"),
        ),
        arrayProbe(
          "foa80.open.cell",
          [row, column],
          open[row]![column] === 1,
          uniqueLine(binding.source, 'if (scanf("%d", &open[r][c]) != 1) {'),
        ),
      );
    }
  }
  paths[0]![0] = 1;
  expected.push(
    arrayProbe("foa80.paths.write", [0, 0], 1, uniqueLine(binding.source, "paths[0][0] = 1;")),
  );
  for (let row = 0; row < 3; row += 1) {
    for (let column = 0; column < 3; column += 1) {
      const isOpen = open[row]![column] === 1;
      expected.push(
        arrayProbe(
          "foa80.open.cell",
          [row, column],
          isOpen,
          uniqueLine(binding.source, "if (open[r][c] == 0) {"),
        ),
      );
      if (!isOpen) continue;
      if (row > 0) {
        const value = paths[row - 1]![column]!;
        expected.push(
          arrayProbe(
            "foa80.paths.read-above",
            [row - 1, column],
            value,
            uniqueLine(binding.source, "paths[r][c] += paths[r - 1][c];"),
          ),
        );
        paths[row]![column]! += value;
        expected.push(
          arrayProbe(
            "foa80.paths.write",
            [row, column],
            paths[row]![column]!,
            uniqueLine(binding.source, "paths[r][c] += paths[r - 1][c];"),
          ),
        );
      }
      if (column > 0) {
        const value = paths[row]![column - 1]!;
        expected.push(
          arrayProbe(
            "foa80.paths.read-left",
            [row, column - 1],
            value,
            uniqueLine(binding.source, "paths[r][c] += paths[r][c - 1];"),
          ),
        );
        paths[row]![column]! += value;
        expected.push(
          arrayProbe(
            "foa80.paths.write",
            [row, column],
            paths[row]![column]!,
            uniqueLine(binding.source, "paths[r][c] += paths[r][c - 1];"),
          ),
        );
      }
    }
  }
  return Object.freeze(expected);
}

function compareValueProbes(
  actual: readonly ReturnType<typeof probeEvent>[],
  expected: readonly ExpectedValueProbe[],
): FoaTransitionTraceVerificationResult | null {
  if (actual.length !== expected.length) {
    return failure(
      "probe-missing",
      `课程需要 ${String(expected.length)} 条状态证据，实际收到 ${String(actual.length)} 条。`,
    );
  }
  for (const [index, expectation] of expected.entries()) {
    const event = actual[index]!;
    if (
      event.probeId !== expectation.probeId ||
      event.probe.kind !== expectation.kind ||
      event.line !== expectation.line
    ) {
      return failure("probe-mismatch", `第 ${String(index + 1)} 条状态证据类型不匹配。`);
    }
    if (expectation.kind === "scalar") {
      if (event.probe.kind !== "scalar" || event.probe.value !== expectation.value) {
        return failure("probe-mismatch", `第 ${String(index + 1)} 条标量证据值不匹配。`);
      }
    } else if (expectation.kind === "array") {
      if (
        event.probe.kind !== "array" ||
        event.probe.value !== expectation.value ||
        !sameNumbers(event.probe.indices, expectation.indices)
      ) {
        return failure("probe-mismatch", `第 ${String(index + 1)} 条数组证据不匹配。`);
      }
    } else if (
      event.probe.kind !== "object" ||
      event.probe.objectId !== expectation.objectId ||
      event.probe.targetObjectId !== expectation.targetObjectId ||
      event.probe.fieldId !== expectation.fieldId ||
      event.probe.value !== expectation.value
    ) {
      return failure("probe-mismatch", `第 ${String(index + 1)} 条对象链接证据不匹配。`);
    }
  }
  return null;
}

function verifyCallProbes(
  events: readonly ReturnType<typeof probeEvent>[],
  binding: FoaTransitionTraceBinding75,
): FoaTransitionTraceVerificationResult | null {
  const disks = binding.modelInput.disks;
  const expectedCount = 2 * (disks + 1);
  if (events.length !== expectedCount) {
    return failure(
      "probe-missing",
      `递归调用需要 ${String(expectedCount)} 条进出栈证据，实际收到 ${String(events.length)} 条。`,
    );
  }
  const frameIds: number[] = [];
  const enterLine = uniqueLine(binding.source, "static int moves(int disks) {");
  const baseReturnLine = uniqueFunctionLine(
    binding.source,
    "static int moves(int disks) {",
    "return 0;",
  );
  const resultReturnLine = uniqueFunctionLine(
    binding.source,
    "static int moves(int disks) {",
    "return result;",
  );
  for (let depth = 0; depth <= disks; depth += 1) {
    const event = events[depth]!;
    const payload = event.probe;
    if (
      event.probeId !== "foa75.moves" ||
      event.line !== enterLine ||
      payload.kind !== "call" ||
      payload.phase !== "enter" ||
      payload.depth !== depth ||
      payload.argument !== disks - depth ||
      payload.returnValue !== null ||
      payload.parentFrameId !== (depth === 0 ? null : frameIds[depth - 1]) ||
      frameIds.includes(payload.frameId)
    ) {
      return failure("probe-mismatch", `递归第 ${String(depth)} 层入栈证据不匹配。`);
    }
    frameIds.push(payload.frameId);
  }
  for (let offset = 0; offset <= disks; offset += 1) {
    const depth = disks - offset;
    const argument = offset;
    const event = events[disks + 1 + offset]!;
    const payload = event.probe;
    const returnValue = 2 ** argument - 1;
    if (
      event.probeId !== "foa75.moves" ||
      event.line !== (argument === 0 ? baseReturnLine : resultReturnLine) ||
      payload.kind !== "call" ||
      payload.phase !== "exit" ||
      payload.frameId !== frameIds[depth] ||
      payload.parentFrameId !== (depth === 0 ? null : frameIds[depth - 1]) ||
      payload.depth !== depth ||
      payload.argument !== argument ||
      payload.returnValue !== returnValue
    ) {
      return failure("probe-mismatch", `递归第 ${String(depth)} 层返回证据不匹配。`);
    }
  }
  return null;
}

function validateProbeLines(
  order: 63 | 70 | 75 | 80,
  source: string,
  events: readonly ReturnType<typeof probeEvent>[],
): FoaTransitionTraceVerificationResult | null {
  let allowed: Readonly<Record<string, ReadonlySet<number>>>;
  try {
    allowed = allowedProbeLines(order, source);
  } catch {
    return failure("anchor-mismatch", "探针源码位置缺失或有歧义。");
  }
  for (const event of events) {
    if (!(allowed[event.probeId]?.has(event.line) ?? false)) {
      return failure("probe-mismatch", `探针 ${event.probeId} 不属于授权源码位置。`);
    }
  }
  return null;
}

function allowedProbeLines(
  order: 63 | 70 | 75 | 80,
  source: string,
): Readonly<Record<string, ReadonlySet<number>>> {
  if (order === 63) {
    return Object.freeze({
      "foa63.counter.value": lines(source, [
        'if (scanf("%d", &counter.value) != 1) {',
        "link->value++;",
      ]),
      "foa63.link.target": lines(source, ["struct Counter *link = &counter;"]),
    });
  }
  if (order === 70) {
    return Object.freeze({
      "foa70.low": lines(source, ["size_t low = 0;", "low = mid + 1; /* trace-anchor: low */"]),
      "foa70.high": lines(source, [
        "size_t high = (size_t)count;",
        "high = mid; /* trace-anchor: high */",
      ]),
      "foa70.mid": lines(source, ["size_t mid = low + (high - low) / 2;"]),
      "foa70.values.at-mid": lines(source, ["if (values[mid] < target) {"]),
      "foa70.compare": lines(source, ["if (values[mid] < target) {"]),
    });
  }
  if (order === 75) {
    return Object.freeze({
      "foa75.moves": functionLines(source, "static int moves(int disks) {", [
        "return 0;",
        "return result;",
      ]),
    });
  }
  return Object.freeze({
    "foa80.paths.write": lines(source, [
      "paths[r][c] = 0;",
      "paths[0][0] = 1;",
      "paths[r][c] += paths[r - 1][c];",
      "paths[r][c] += paths[r][c - 1];",
    ]),
    "foa80.open.cell": lines(source, [
      'if (scanf("%d", &open[r][c]) != 1) {',
      "if (open[r][c] == 0) {",
    ]),
    "foa80.paths.read-above": lines(source, ["paths[r][c] += paths[r - 1][c];"]),
    "foa80.paths.read-left": lines(source, ["paths[r][c] += paths[r][c - 1];"]),
  });
}

function lines(source: string, exactSlices: readonly string[]): ReadonlySet<number> {
  const result = new Set<number>();
  const sourceLines = source.split(/\r?\n/u);
  for (const exact of exactSlices) {
    const matches = sourceLines.flatMap((line, index) => (line.includes(exact) ? [index + 1] : []));
    if (matches.length !== 1) throw new RangeError(`Source slice must occur once: ${exact}`);
    result.add(matches[0]!);
  }
  return result;
}

function uniqueLine(source: string, exact: string): number {
  return [...lines(source, [exact])][0]!;
}

function functionLines(
  source: string,
  header: string,
  bodySlices: readonly string[],
): ReadonlySet<number> {
  const sourceLines = source.split(/\r?\n/u);
  const { start, end } = functionRange(sourceLines, header);
  const result = new Set<number>([start + 1]);
  for (const exact of bodySlices) result.add(uniqueLineInRange(sourceLines, start, end, exact));
  return result;
}

function uniqueFunctionLine(source: string, header: string, exact: string): number {
  const sourceLines = source.split(/\r?\n/u);
  const { start, end } = functionRange(sourceLines, header);
  return uniqueLineInRange(sourceLines, start, end, exact);
}

function functionRange(
  sourceLines: readonly string[],
  header: string,
): { readonly start: number; readonly end: number } {
  const headerMatches = sourceLines.flatMap((line, index) =>
    line.includes(header) ? [index] : [],
  );
  if (headerMatches.length !== 1)
    throw new RangeError(`Function header must occur once: ${header}`);
  const start = headerMatches[0]!;
  let depth = 0;
  let end = -1;
  for (let index = start; index < sourceLines.length; index += 1) {
    for (const character of sourceLines[index] ?? "") {
      if (character === "{") depth += 1;
      else if (character === "}") depth -= 1;
    }
    if (depth < 0) throw new RangeError(`Function body is unbalanced: ${header}`);
    if (index > start && depth === 0) {
      end = index;
      break;
    }
  }
  if (end < 0) throw new RangeError(`Function body is not closed: ${header}`);
  return Object.freeze({ start, end });
}

function uniqueLineInRange(
  sourceLines: readonly string[],
  start: number,
  end: number,
  exact: string,
): number {
  const matches: number[] = [];
  for (let index = start + 1; index < end; index += 1) {
    if (sourceLines[index]?.includes(exact) === true) matches.push(index + 1);
  }
  if (matches.length !== 1) throw new RangeError(`Function slice must occur once: ${exact}`);
  return matches[0]!;
}

function upgradePrototype(
  model: FoaTransitionRuntimePrototype,
  provenance: FoaTransitionRealTraceProvenance,
): FoaTransitionRuntimePrototype {
  const frames = Object.freeze(
    model.frames.map((frame): FoaTransitionRuntimeFrame => Object.freeze({ ...frame, provenance })),
  );
  return Object.freeze({
    ...model,
    evidence: Object.freeze({
      provenance,
      traceStatus: "verified-real-trace" as const,
      canClaimRealTrace: true as const,
      sourceFingerprintRequired: true as const,
      description: foaText(
        "本次状态已由同一源码指纹、同一输入的受限影子 Trace 验证。",
        "This state was verified by a bounded shadow Trace for the same source fingerprint and input.",
      ),
    }),
    frames,
  });
}

function upgradeTimeline(
  model: FoaTransitionRuntime7580Timeline,
  provenance: FoaTransitionRealTraceProvenance,
): FoaTransitionRuntime7580Timeline {
  const base = model.provenance;
  const real: FoaTransitionRuntime7580RealTraceProvenance = Object.freeze({
    lessonId: base.lessonId,
    caseId: base.caseId,
    ...provenance,
    notice: foaText(
      "本次状态已由同一源码指纹、同一输入的受限影子 Trace 验证。",
      "This state was verified by a bounded shadow Trace for the same source fingerprint and input.",
    ),
  });
  return Object.freeze({ ...model, provenance: real, verification: "real-trace" as const });
}

function modelProvenance(
  model: FoaTransitionVerifiedModel,
): FoaTransitionRealTraceProvenance | FoaTransitionRuntime7580RealTraceProvenance {
  if ("frames" in model) {
    const provenance = model.evidence.provenance;
    if (typeof provenance === "string") throw new TypeError("Expected upgraded prototype");
    return provenance;
  }
  if (model.provenance.kind !== "real-trace") throw new TypeError("Expected upgraded timeline");
  return model.provenance;
}

function assertPrototypeAnchors(source: string, model: FoaTransitionRuntimePrototype): void {
  for (const anchor of model.sourceAnchors) {
    const first = source.indexOf(anchor.exact);
    if (first < 0 || source.indexOf(anchor.exact, first + 1) >= 0) {
      throw new RangeError(`FOA transition source anchor ${anchor.id} must occur exactly once`);
    }
  }
}

function hasStrictEventSequence(events: readonly TraceEvent[]): boolean {
  return events.every((event, index) => event.sequence === index + 1);
}

function decodeStdout(stdout: Uint8Array | undefined): string | null {
  if (stdout === undefined) return null;
  try {
    return DECODER.decode(stdout);
  } catch {
    return null;
  }
}

function scalar(probeId: string, value: number | boolean, line: number): ExpectedScalarProbe {
  return Object.freeze({ probeId, kind: "scalar", line, value });
}

function arrayProbe(
  probeId: string,
  indices: readonly number[],
  value: number | boolean,
  line: number,
): ExpectedArrayProbe {
  return Object.freeze({
    probeId,
    kind: "array",
    line,
    indices: Object.freeze([...indices]),
    value,
  });
}

function objectProbe(
  probeId: string,
  objectId: string,
  targetObjectId: string | null,
  line: number,
): ExpectedObjectProbe {
  return Object.freeze({
    probeId,
    kind: "object",
    line,
    objectId,
    targetObjectId,
    fieldId: null,
    value: targetObjectId !== null,
  });
}

function probeEvent(event: TraceEvent) {
  if (!isTraceProbeEvent(event)) throw new TypeError("Expected a Trace probe event");
  return event;
}

function sameNumbers(left: readonly number[], right: readonly number[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function requireNumber(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value)) {
    throw new TypeError("Expected a safe integer in the teaching model");
  }
  return value;
}

function failure(
  code: FoaTransitionTraceVerificationCode,
  message: string,
): FoaTransitionTraceVerificationResult {
  return Object.freeze({ ok: false, code, message });
}
