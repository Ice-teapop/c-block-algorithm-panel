import { TRACE_BYTE_LIMIT, TRACE_EVENT_LIMIT } from "../shared/trace.js";

const STABLE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,191}$/u;

export interface RuntimeSymbolAnchor {
  readonly functionPath: string;
  readonly declarationStart: number;
  readonly declarationHash: string;
}

export type RuntimeObservedValue =
  | { readonly status: "observed"; readonly typeTag: string; readonly text: string }
  | { readonly status: "unavailable"; readonly reason: string };

export type RuntimeDataProvenance =
  | { readonly kind: "teaching-model"; readonly lessonId: string }
  | {
      readonly kind: "real-trace";
      readonly workspaceId: string;
      readonly sessionId: string;
      readonly sourceFingerprint: string;
      readonly scenarioId: string | null;
      readonly inputDigest: string;
      readonly symbolTableVersion: string;
    };

export type RuntimeStateEvent =
  | { readonly kind: "line" }
  | { readonly kind: "branch"; readonly predicateId: string; readonly taken: boolean }
  | {
      readonly kind: "scalar-write";
      readonly symbol: RuntimeSymbolAnchor;
      readonly value: RuntimeObservedValue;
    }
  | {
      readonly kind: "array-write";
      readonly symbol: RuntimeSymbolAnchor;
      readonly index: number;
      readonly value: RuntimeObservedValue;
    }
  | {
      readonly kind: "call-enter";
      readonly frameId: string;
      readonly function: RuntimeSymbolAnchor;
      readonly depth: number;
    }
  | { readonly kind: "call-exit"; readonly frameId: string; readonly depth: number }
  | {
      readonly kind: "object-link";
      readonly source: RuntimeSymbolAnchor;
      readonly targetObjectId: string;
      /** Static declaration identity for a bound target, when the probe can prove one. */
      readonly targetSymbolId?: string | undefined;
    }
  | { readonly kind: "stdout"; readonly text: string };

export interface RuntimeEventEnvelope {
  readonly schemaVersion: 2;
  readonly provenance: Extract<RuntimeDataProvenance, { readonly kind: "real-trace" }>;
  readonly sequence: number;
  readonly elapsedMs: number;
  readonly sourceLine: number;
  readonly event: RuntimeStateEvent;
}

export interface RuntimeDataSymbolBinding {
  readonly id: string;
  readonly anchor: RuntimeSymbolAnchor;
  readonly storage: "scalar" | "array" | "object" | "function";
  /** Exclusive upper bound for arrays when the course can prove it. */
  readonly arrayLength?: number | undefined;
}

export interface RuntimeDataRelationBinding {
  readonly id: string;
  readonly sourceSymbolId: string;
  readonly targetSymbolId: string | null;
}

export interface RuntimeDataFlowBinding {
  readonly workspaceId: string;
  readonly sessionId: string;
  readonly sourceFingerprint: string;
  readonly scenarioId: string | null;
  readonly inputDigest: string;
  readonly symbolTableVersion: string;
  readonly symbols: readonly RuntimeDataSymbolBinding[];
  readonly predicateIds: readonly string[];
  readonly relations: readonly RuntimeDataRelationBinding[];
  readonly requiredEvidence?: RuntimeDataRequiredEvidence | undefined;
}

export interface RuntimeDataRequiredEvidence {
  readonly minimumEventCount?: number | undefined;
  readonly symbolIds?: readonly string[] | undefined;
  readonly relationIds?: readonly string[] | undefined;
  readonly predicateIds?: readonly string[] | undefined;
}

export type RuntimeDataFlowStatus =
  "running" | "consistent" | "partial" | "mismatch" | "stale" | "truncated";

export interface RuntimeDataFlowIssue {
  readonly code:
    | "binding"
    | "provenance"
    | "sequence"
    | "event"
    | "symbol"
    | "array-index"
    | "stack"
    | "stdout"
    | "evidence"
    | "limit"
    | "stale";
  readonly message: string;
}

export interface RuntimeStackFrameSnapshot {
  readonly frameId: string;
  readonly functionSymbolId: string;
  readonly depth: number;
}

export interface RuntimeArrayCellSnapshot {
  readonly index: number;
  readonly value: RuntimeObservedValue;
}

export interface RuntimeObjectLinkSnapshot {
  readonly sourceSymbolId: string;
  readonly targetObjectId: string;
}

export interface RuntimeDataFlowSnapshot {
  readonly status: RuntimeDataFlowStatus;
  readonly provenance: Extract<RuntimeDataProvenance, { readonly kind: "real-trace" }>;
  readonly lastSequence: number;
  readonly eventCount: number;
  readonly totalEventBytes: number;
  readonly scalarValues: Readonly<Record<string, RuntimeObservedValue>>;
  readonly arrayValues: Readonly<Record<string, readonly RuntimeArrayCellSnapshot[]>>;
  readonly stack: readonly RuntimeStackFrameSnapshot[];
  readonly branches: Readonly<Record<string, boolean>>;
  readonly objectLinks: readonly RuntimeObjectLinkSnapshot[];
  readonly observedRelationIds: readonly string[];
  readonly stdout: string;
  readonly issues: readonly RuntimeDataFlowIssue[];
}

export interface RuntimeDataFlowVerifier {
  accept(envelope: RuntimeEventEnvelope): RuntimeDataFlowSnapshot;
  complete(expectedStdout: string, truncated?: boolean): RuntimeDataFlowSnapshot;
  invalidate(reason?: string): RuntimeDataFlowSnapshot;
  getSnapshot(): RuntimeDataFlowSnapshot;
}

/**
 * Reduces bounded real Trace events into a verified runtime snapshot. It never accepts teaching
 * frames and never infers a value from static control/data-flow alone.
 */
export function createRuntimeDataFlowVerifier(
  bindingInput: RuntimeDataFlowBinding,
): RuntimeDataFlowVerifier {
  const binding = normalizeBinding(bindingInput);
  const provenance = freezeRealProvenance({
    kind: "real-trace",
    workspaceId: binding.workspaceId,
    sessionId: binding.sessionId,
    sourceFingerprint: binding.sourceFingerprint,
    scenarioId: binding.scenarioId,
    inputDigest: binding.inputDigest,
    symbolTableVersion: binding.symbolTableVersion,
  });
  const symbolsByAnchor = new Map<string, RuntimeDataSymbolBinding>();
  for (const symbol of binding.symbols) {
    symbolsByAnchor.set(anchorKey(symbol.anchor), symbol);
  }
  const predicateIds = new Set(binding.predicateIds);
  const relationsBySource = new Map<string, readonly RuntimeDataRelationBinding[]>();
  for (const relation of binding.relations) {
    const current = relationsBySource.get(relation.sourceSymbolId) ?? [];
    relationsBySource.set(relation.sourceSymbolId, Object.freeze([...current, relation]));
  }

  let status: RuntimeDataFlowStatus = "running";
  let lastSequence = 0;
  let lastElapsedMs = 0;
  let eventCount = 0;
  let totalEventBytes = 0;
  const scalarValues = new Map<string, RuntimeObservedValue>();
  const arrayValues = new Map<string, Map<number, RuntimeObservedValue>>();
  const stack: RuntimeStackFrameSnapshot[] = [];
  const branches = new Map<string, boolean>();
  const objectLinks = new Map<string, RuntimeObjectLinkSnapshot>();
  const observedRelationIds = new Set<string>();
  const observedSymbolIds = new Set<string>();
  const issues: RuntimeDataFlowIssue[] = [];
  let stdout = "";
  let unavailableObserved = false;

  const fail = (issue: RuntimeDataFlowIssue, nextStatus: RuntimeDataFlowStatus = "mismatch") => {
    if (status === "stale" || status === "truncated") return snapshot();
    status = nextStatus;
    issues.push(Object.freeze({ ...issue }));
    return snapshot();
  };

  const accept = (envelope: RuntimeEventEnvelope): RuntimeDataFlowSnapshot => {
    if (status !== "running") return snapshot();
    try {
      return acceptValidated(envelope as unknown);
    } catch {
      return fail(issue("event", "数据流事件格式无效，已拒绝该事件。"));
    }
  };

  const acceptValidated = (input: unknown): RuntimeDataFlowSnapshot => {
    const validationIssue = validateEnvelopeShape(input);
    if (validationIssue !== null) {
      return fail(issue("event", validationIssue));
    }
    const envelope = input as RuntimeEventEnvelope;
    if (!isMatchingProvenance(envelope.provenance, provenance)) {
      return fail(issue("provenance", "事件不属于当前 workspace、session、源码或案例。"));
    }
    if (!Number.isSafeInteger(envelope.sequence) || envelope.sequence !== lastSequence + 1) {
      return fail(issue("sequence", "数据流事件序号缺失、重复或乱序。"));
    }
    if (
      !Number.isFinite(envelope.elapsedMs) ||
      envelope.elapsedMs < lastElapsedMs ||
      !Number.isSafeInteger(envelope.sourceLine) ||
      envelope.sourceLine < 1
    ) {
      return fail(issue("event", "数据流事件时间或源码行无效。"));
    }
    const eventBytes = utf8Bytes(envelope);
    if (eventBytes === null) {
      return fail(issue("event", "数据流事件无法安全序列化。"));
    }
    if (eventCount >= TRACE_EVENT_LIMIT || eventBytes > TRACE_BYTE_LIMIT - totalEventBytes) {
      return fail(issue("limit", "数据流事件达到 10000 条或 8 MiB 上限。"), "truncated");
    }

    lastSequence = envelope.sequence;
    lastElapsedMs = envelope.elapsedMs;
    eventCount += 1;
    totalEventBytes += eventBytes;

    const event = envelope.event;
    if (event.kind === "line") return snapshot();
    if (event.kind === "branch") {
      if (!predicateIds.has(event.predicateId)) {
        return fail(issue("event", "分支事件不能唯一映射到当前 CFG 谓词。"));
      }
      branches.set(event.predicateId, event.taken);
      return snapshot();
    }
    if (event.kind === "stdout") {
      stdout += event.text;
      return snapshot();
    }
    if (event.kind === "call-exit") {
      const top = stack.at(-1);
      if (
        top === undefined ||
        top.frameId !== event.frameId ||
        top.depth !== event.depth ||
        event.depth !== stack.length - 1
      ) {
        return fail(issue("stack", "调用返回不符合严格 LIFO 栈顺序。"));
      }
      stack.pop();
      return snapshot();
    }

    const anchor =
      event.kind === "call-enter"
        ? event.function
        : event.kind === "object-link"
          ? event.source
          : event.symbol;
    const symbol = symbolsByAnchor.get(anchorKey(anchor));
    if (symbol === undefined) {
      return fail(issue("symbol", "数据事件的声明锚点缺失或有歧义。"));
    }

    if (event.kind === "call-enter") {
      if (
        symbol.storage !== "function" ||
        !STABLE_ID.test(event.frameId) ||
        event.depth !== stack.length
      ) {
        return fail(issue("stack", "调用进入事件的函数或栈深无效。"));
      }
      stack.push(
        Object.freeze({ frameId: event.frameId, functionSymbolId: symbol.id, depth: event.depth }),
      );
      observedSymbolIds.add(symbol.id);
      return snapshot();
    }

    if (event.kind === "scalar-write") {
      if (symbol.storage !== "scalar") {
        return fail(issue("symbol", "标量写入命中了非标量声明。"));
      }
      scalarValues.set(symbol.id, freezeObservedValue(event.value));
      observedSymbolIds.add(symbol.id);
      unavailableObserved ||= event.value.status === "unavailable";
      markSourceRelations(symbol.id, undefined);
      return snapshot();
    }

    if (event.kind === "array-write") {
      if (symbol.storage !== "array") {
        return fail(issue("symbol", "数组写入命中了非数组声明。"));
      }
      if (
        !Number.isSafeInteger(event.index) ||
        event.index < 0 ||
        (symbol.arrayLength !== undefined && event.index >= symbol.arrayLength)
      ) {
        return fail(issue("array-index", "数组写入下标超出可证明范围。"));
      }
      const cells = arrayValues.get(symbol.id) ?? new Map<number, RuntimeObservedValue>();
      cells.set(event.index, freezeObservedValue(event.value));
      arrayValues.set(symbol.id, cells);
      observedSymbolIds.add(symbol.id);
      unavailableObserved ||= event.value.status === "unavailable";
      markSourceRelations(symbol.id, undefined);
      return snapshot();
    }

    if (symbol.storage !== "scalar" && symbol.storage !== "object") {
      return fail(issue("symbol", "对象关系的源声明类型无效。"));
    }
    if (!STABLE_ID.test(event.targetObjectId)) {
      return fail(issue("event", "对象关系目标 ID 无效。"));
    }
    objectLinks.set(
      symbol.id,
      Object.freeze({ sourceSymbolId: symbol.id, targetObjectId: event.targetObjectId }),
    );
    observedSymbolIds.add(symbol.id);
    markSourceRelations(symbol.id, event.targetSymbolId);
    return snapshot();
  };

  const complete = (expectedStdout: string, truncated = false): RuntimeDataFlowSnapshot => {
    if (status !== "running") return snapshot();
    if (truncated) {
      return fail(issue("limit", "Trace 已截断，无法证明最终数据状态。"), "truncated");
    }
    if (stack.length !== 0) {
      return fail(issue("stack", "Trace 结束时调用栈仍有未返回帧。"));
    }
    if (stdout !== expectedStdout) {
      return fail(issue("stdout", "Trace stdout 与真实 RunResult.stdout 不一致。"));
    }
    const missingEvidence = collectMissingEvidence(
      binding.requiredEvidence,
      eventCount,
      observedSymbolIds,
      observedRelationIds,
      branches,
    );
    if (eventCount === 0) {
      missingEvidence.unshift("Trace 未包含任何可验证事件。");
    }
    if (missingEvidence.length > 0) {
      status = "partial";
      for (const message of missingEvidence) issues.push(issue("evidence", message));
      return snapshot();
    }
    status = unavailableObserved ? "partial" : "consistent";
    return snapshot();
  };

  const invalidate = (reason = "源码或运行上下文已改变。旧数据流证据失效。") => {
    if (status === "stale") return snapshot();
    status = "stale";
    issues.push(issue("stale", reason));
    return snapshot();
  };

  function markSourceRelations(symbolId: string, targetSymbolId: string | undefined): void {
    for (const relation of relationsBySource.get(symbolId) ?? []) {
      if (
        relation.targetSymbolId === null ||
        (targetSymbolId !== undefined && relation.targetSymbolId === targetSymbolId)
      ) {
        observedRelationIds.add(relation.id);
      }
    }
  }

  function snapshot(): RuntimeDataFlowSnapshot {
    return Object.freeze({
      status,
      provenance,
      lastSequence,
      eventCount,
      totalEventBytes,
      scalarValues: freezeRecord([...scalarValues.entries()]),
      arrayValues: freezeRecord(
        [...arrayValues.entries()].map(([symbolId, cells]) => [
          symbolId,
          Object.freeze(
            [...cells.entries()]
              .sort(([left], [right]) => left - right)
              .map(([index, value]) => Object.freeze({ index, value })),
          ),
        ]),
      ),
      stack: Object.freeze(stack.map((frame) => Object.freeze({ ...frame }))),
      branches: freezeRecord([...branches.entries()]),
      objectLinks: Object.freeze(
        [...objectLinks.values()].map((link) => Object.freeze({ ...link })),
      ),
      observedRelationIds: Object.freeze([...observedRelationIds].sort()),
      stdout,
      issues: Object.freeze(issues.map((entry) => Object.freeze({ ...entry }))),
    });
  }

  return Object.freeze({ accept, complete, invalidate, getSnapshot: snapshot });
}

function normalizeBinding(binding: RuntimeDataFlowBinding): RuntimeDataFlowBinding {
  for (const value of [
    binding.workspaceId,
    binding.sessionId,
    binding.sourceFingerprint,
    binding.inputDigest,
    binding.symbolTableVersion,
  ]) {
    if (typeof value !== "string" || value.length === 0) {
      throw new TypeError("数据流绑定身份字段不得为空");
    }
  }
  const symbolIds = new Set<string>();
  const anchors = new Set<string>();
  for (const symbol of binding.symbols) {
    if (!STABLE_ID.test(symbol.id) || symbolIds.has(symbol.id)) {
      throw new TypeError("数据流符号 ID 必须唯一且稳定");
    }
    const key = anchorKey(symbol.anchor);
    if (anchors.has(key)) throw new TypeError("数据流声明锚点必须唯一");
    if (
      symbol.arrayLength !== undefined &&
      (!Number.isSafeInteger(symbol.arrayLength) || symbol.arrayLength < 0)
    ) {
      throw new RangeError("数组长度必须是非负安全整数");
    }
    if (symbol.storage !== "array" && symbol.arrayLength !== undefined) {
      throw new TypeError("只有数组符号可以声明 arrayLength");
    }
    symbolIds.add(symbol.id);
    anchors.add(key);
  }
  const predicates = new Set<string>();
  for (const predicateId of binding.predicateIds) {
    if (!STABLE_ID.test(predicateId) || predicates.has(predicateId)) {
      throw new TypeError("数据流 predicate ID 必须唯一且稳定");
    }
    predicates.add(predicateId);
  }
  const relationIds = new Set<string>();
  for (const relation of binding.relations) {
    if (!STABLE_ID.test(relation.id) || relationIds.has(relation.id)) {
      throw new TypeError("数据流 relation ID 必须唯一且稳定");
    }
    if (
      !symbolIds.has(relation.sourceSymbolId) ||
      (relation.targetSymbolId !== null && !symbolIds.has(relation.targetSymbolId))
    ) {
      throw new TypeError("数据流 relation 必须引用已注册符号");
    }
    relationIds.add(relation.id);
  }
  const requiredEvidence = normalizeRequiredEvidence(
    binding.requiredEvidence,
    symbolIds,
    relationIds,
    predicates,
  );
  return Object.freeze({
    ...binding,
    symbols: Object.freeze(
      binding.symbols.map((symbol) =>
        Object.freeze({ ...symbol, anchor: Object.freeze({ ...symbol.anchor }) }),
      ),
    ),
    predicateIds: Object.freeze([...binding.predicateIds]),
    relations: Object.freeze(binding.relations.map((relation) => Object.freeze({ ...relation }))),
    requiredEvidence,
  });
}

function normalizeRequiredEvidence(
  input: RuntimeDataRequiredEvidence | undefined,
  symbolIds: ReadonlySet<string>,
  relationIds: ReadonlySet<string>,
  predicateIds: ReadonlySet<string>,
): RuntimeDataRequiredEvidence | undefined {
  if (input === undefined) return undefined;
  const minimumEventCount = input.minimumEventCount ?? 0;
  if (
    !Number.isSafeInteger(minimumEventCount) ||
    minimumEventCount < 0 ||
    minimumEventCount > TRACE_EVENT_LIMIT
  ) {
    throw new RangeError("requiredEvidence.minimumEventCount 超出 Trace 上限");
  }
  const symbols = normalizeRequiredIds("symbol", input.symbolIds, symbolIds);
  const relations = normalizeRequiredIds("relation", input.relationIds, relationIds);
  const predicates = normalizeRequiredIds("predicate", input.predicateIds, predicateIds);
  return Object.freeze({
    minimumEventCount,
    symbolIds: symbols,
    relationIds: relations,
    predicateIds: predicates,
  });
}

function normalizeRequiredIds(
  label: string,
  input: readonly string[] | undefined,
  registered: ReadonlySet<string>,
): readonly string[] {
  const ids = input ?? [];
  const unique = new Set<string>();
  for (const id of ids) {
    if (!STABLE_ID.test(id) || unique.has(id) || !registered.has(id)) {
      throw new TypeError(`requiredEvidence.${label}Ids 必须唯一引用已注册 ID`);
    }
    unique.add(id);
  }
  return Object.freeze([...unique]);
}

function anchorKey(anchor: RuntimeSymbolAnchor): string {
  if (
    typeof anchor.functionPath !== "string" ||
    anchor.functionPath.length === 0 ||
    !Number.isSafeInteger(anchor.declarationStart) ||
    anchor.declarationStart < 0 ||
    typeof anchor.declarationHash !== "string" ||
    anchor.declarationHash.length === 0
  ) {
    throw new TypeError("数据流声明锚点无效");
  }
  return `${anchor.functionPath}\u0000${String(anchor.declarationStart)}\u0000${anchor.declarationHash}`;
}

function isMatchingProvenance(
  actual: RuntimeEventEnvelope["provenance"],
  expected: RuntimeEventEnvelope["provenance"],
): boolean {
  return (
    actual.kind === "real-trace" &&
    actual.workspaceId === expected.workspaceId &&
    actual.sessionId === expected.sessionId &&
    actual.sourceFingerprint === expected.sourceFingerprint &&
    actual.scenarioId === expected.scenarioId &&
    actual.inputDigest === expected.inputDigest &&
    actual.symbolTableVersion === expected.symbolTableVersion
  );
}

function validateEnvelopeShape(value: unknown): string | null {
  if (!isRecord(value)) return "数据流事件必须是对象。";
  if (value.schemaVersion !== 2) return "数据流事件 schemaVersion 无效。";
  if (!isRealTraceProvenanceShape(value.provenance)) return "数据流事件 provenance 格式无效。";
  if (!Number.isSafeInteger(value.sequence) || (value.sequence as number) < 1) {
    return "数据流事件 sequence 必须是正安全整数。";
  }
  if (!Number.isFinite(value.elapsedMs) || (value.elapsedMs as number) < 0) {
    return "数据流事件 elapsedMs 无效。";
  }
  if (!Number.isSafeInteger(value.sourceLine) || (value.sourceLine as number) < 1) {
    return "数据流事件 sourceLine 无效。";
  }
  return validateRuntimeEventShape(value.event);
}

function validateRuntimeEventShape(value: unknown): string | null {
  if (!isRecord(value) || typeof value.kind !== "string") {
    return "数据流事件缺少可识别的 event.kind。";
  }
  switch (value.kind) {
    case "line":
      return null;
    case "branch":
      return isStableId(value.predicateId) && typeof value.taken === "boolean"
        ? null
        : "分支事件字段无效。";
    case "stdout":
      return typeof value.text === "string" ? null : "stdout 事件 text 无效。";
    case "call-exit":
      return isStableId(value.frameId) && isNonNegativeSafeInteger(value.depth)
        ? null
        : "调用返回事件字段无效。";
    case "call-enter":
      return isStableId(value.frameId) &&
        isAnchorShape(value.function) &&
        isNonNegativeSafeInteger(value.depth)
        ? null
        : "调用进入事件字段无效。";
    case "scalar-write":
      return isAnchorShape(value.symbol) && isObservedValueShape(value.value)
        ? null
        : "标量写入事件字段或观测值无效。";
    case "array-write":
      return isAnchorShape(value.symbol) &&
        isNonNegativeSafeInteger(value.index) &&
        isObservedValueShape(value.value)
        ? null
        : "数组写入事件字段、下标或观测值无效。";
    case "object-link":
      return isAnchorShape(value.source) &&
        isStableId(value.targetObjectId) &&
        (value.targetSymbolId === undefined || isStableId(value.targetSymbolId))
        ? null
        : "对象关系事件字段无效。";
    default:
      return "数据流事件 kind 未注册。";
  }
}

function isRealTraceProvenanceShape(
  value: unknown,
): value is Extract<RuntimeDataProvenance, { readonly kind: "real-trace" }> {
  return (
    isRecord(value) &&
    value.kind === "real-trace" &&
    isNonEmptyString(value.workspaceId) &&
    isNonEmptyString(value.sessionId) &&
    isNonEmptyString(value.sourceFingerprint) &&
    (value.scenarioId === null || isNonEmptyString(value.scenarioId)) &&
    isNonEmptyString(value.inputDigest) &&
    isNonEmptyString(value.symbolTableVersion)
  );
}

function isAnchorShape(value: unknown): value is RuntimeSymbolAnchor {
  return (
    isRecord(value) &&
    isNonEmptyString(value.functionPath) &&
    isNonNegativeSafeInteger(value.declarationStart) &&
    isNonEmptyString(value.declarationHash)
  );
}

function isObservedValueShape(value: unknown): value is RuntimeObservedValue {
  if (!isRecord(value)) return false;
  if (value.status === "observed") {
    return isNonEmptyString(value.typeTag) && typeof value.text === "string";
  }
  if (value.status === "unavailable") return isNonEmptyString(value.reason);
  return false;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function isStableId(value: unknown): value is string {
  return typeof value === "string" && STABLE_ID.test(value);
}

function isNonNegativeSafeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

function collectMissingEvidence(
  required: RuntimeDataRequiredEvidence | undefined,
  eventCount: number,
  observedSymbolIds: ReadonlySet<string>,
  observedRelationIds: ReadonlySet<string>,
  branches: ReadonlyMap<string, boolean>,
): string[] {
  if (required === undefined) return [];
  const missing: string[] = [];
  const minimum = required.minimumEventCount ?? 0;
  if (eventCount < minimum) {
    missing.push(`Trace 仅有 ${String(eventCount)} 条事件，少于要求的 ${String(minimum)} 条。`);
  }
  appendMissingIds(missing, "符号", required.symbolIds, observedSymbolIds);
  appendMissingIds(missing, "关系", required.relationIds, observedRelationIds);
  appendMissingIds(missing, "谓词", required.predicateIds, new Set(branches.keys()));
  return missing;
}

function appendMissingIds(
  messages: string[],
  label: string,
  required: readonly string[] | undefined,
  observed: ReadonlySet<string>,
): void {
  const missing = (required ?? []).filter((id) => !observed.has(id));
  if (missing.length > 0) messages.push(`缺少必需${label}证据：${missing.join("、")}。`);
}

function freezeRealProvenance(
  value: Extract<RuntimeDataProvenance, { readonly kind: "real-trace" }>,
): Extract<RuntimeDataProvenance, { readonly kind: "real-trace" }> {
  return Object.freeze({ ...value });
}

function freezeObservedValue(value: RuntimeObservedValue): RuntimeObservedValue {
  return value.status === "observed"
    ? Object.freeze({ status: "observed", typeTag: value.typeTag, text: value.text })
    : Object.freeze({ status: "unavailable", reason: value.reason });
}

function issue(code: RuntimeDataFlowIssue["code"], message: string): RuntimeDataFlowIssue {
  return Object.freeze({ code, message });
}

function freezeRecord<Value>(
  entries: readonly (readonly [string, Value])[],
): Readonly<Record<string, Value>> {
  return Object.freeze(Object.fromEntries(entries)) as Readonly<Record<string, Value>>;
}

function utf8Bytes(value: unknown): number | null {
  try {
    const json = JSON.stringify(value);
    return typeof json === "string" ? new TextEncoder().encode(json).byteLength : null;
  } catch {
    return null;
  }
}
