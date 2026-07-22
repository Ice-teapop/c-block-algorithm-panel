import {
  foaText,
  type FoaLessonDefinition,
  type FoaLocalizedText,
  type FoaSemanticEventType,
  type FoaVisualFamily,
} from "./foa-contracts.js";
import { resolveFoaCourseRuntimeEvidence } from "./foa-course-runtime-evidence.js";
import type { FoaInteractiveRun } from "./foa-interactive-inputs.js";
import type { FoaRuntimeEvidenceSnapshot } from "./foa-runtime-evidence-contracts.js";
import type {
  FoaSceneConnection,
  FoaSceneKind,
  FoaSceneLearnerControl,
  FoaSceneObservableKind,
  FoaSceneProfile,
  FoaSceneStateField,
} from "./foa-scene-profile.js";

const STABLE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,191}$/u;
export type FoaRuntimeActionKind =
  "advance" | "move" | "choose" | "apply" | "inspect" | "connect" | "push-pop" | "classify";

export type FoaRuntimeValueRole =
  "input" | "token" | "state" | "predicate" | "cursor" | "result" | "output";

export interface FoaRuntimeValue {
  readonly id: string;
  readonly role: FoaRuntimeValueRole;
  readonly label: FoaLocalizedText;
  readonly value: FoaLocalizedText;
}

export interface FoaRuntimeRelation {
  readonly id: string;
  readonly fromValueId: string;
  readonly toValueId: string;
  readonly actionKind: FoaRuntimeActionKind;
  readonly label: FoaLocalizedText;
}

export interface FoaRuntimeFrame {
  readonly id: string;
  readonly eventId: string;
  readonly actionKind: FoaRuntimeActionKind;
  readonly label: FoaLocalizedText;
  readonly detail: FoaLocalizedText;
  /** Every value introduced up to and including this frame. */
  readonly values: readonly FoaRuntimeValue[];
  readonly activeValueIds: readonly string[];
  readonly activeRelation: FoaRuntimeRelation | null;
  readonly cursorIndex: number;
  readonly branchOutcome: boolean | null;
  readonly iteration: number | null;
  readonly outputVisible: boolean;
  /** Course-authored, input-specific state. Never synthesized from instructional prose. */
  readonly evidence: FoaRuntimeEvidenceSnapshot;
}

export interface FoaRuntimeModel {
  readonly lessonId: string;
  readonly lessonOrder: number;
  readonly sceneKind: FoaSceneKind;
  readonly connection: FoaSceneConnection;
  readonly visualFamily: FoaVisualFamily;
  readonly visualModel: FoaLocalizedText;
  readonly primaryAction: FoaLocalizedText;
  readonly mechanismId: string;
  readonly observableKind: FoaSceneObservableKind;
  readonly observableLabels: readonly FoaLocalizedText[];
  readonly learnerControl: FoaSceneLearnerControl;
  readonly caseGoal: FoaLocalizedText;
  readonly stateShape: readonly FoaSceneStateField[];
  readonly stdin: string;
  readonly stdout: string;
  readonly frames: readonly FoaRuntimeFrame[];
}

/**
 * Builds an evidence-bounded replay model for one FOA lesson and one concrete case.
 * The model is deliberately independent from learner-completion state: a renderer may replay it
 * without manufacturing confirmed actions.
 */
export function createFoaRuntimeModel(
  lesson: FoaLessonDefinition,
  profile: FoaSceneProfile,
  run: FoaInteractiveRun | null,
): FoaRuntimeModel {
  assertObject(lesson, "FOA runtime lesson");
  assertObject(profile, "FOA runtime scene profile");
  if (run !== null) assertObject(run, "FOA interactive run");
  assertObject(lesson.experience, "FOA lesson experience");
  assertArray(lesson.semanticEvents, "FOA semantic events");
  assertArray(lesson.experience.semanticSequence, "FOA semantic sequence");
  assertArray(profile.slots, "FOA scene slots");
  assertSceneKind(profile.kind);
  assertConnection(profile.connection);
  assertVisualFamily(lesson.experience.visualFamily);
  if (run !== null) {
    assertArray(run.eventDetails, "FOA runtime event details");
    assertArray(run.tokens, "FOA runtime tokens");
  }
  assertStableId(lesson.id, "FOA lesson ID");
  assertLessonOrder(lesson.order);
  if (profile.order !== lesson.order) {
    throw new RangeError("FOA runtime profile order must match the lesson order");
  }
  if (run !== null && run.order !== lesson.order) {
    throw new RangeError("FOA interactive run order must match the lesson order");
  }
  const frameCount = lesson.semanticEvents.length;
  if (
    frameCount < 2 ||
    frameCount > 32 ||
    lesson.experience.semanticSequence.length !== frameCount ||
    profile.slots.length !== frameCount
  ) {
    throw new RangeError("FOA runtime lessons require two to 32 aligned semantic frames");
  }
  if (run !== null && run.eventDetails.length !== frameCount) {
    throw new RangeError("FOA interactive event details must match the authored semantic frames");
  }

  const visualModel = normalizeText(lesson.experience.visualModel, "visual model");
  const primaryAction = normalizeText(lesson.experience.primaryAction, "primary action");
  const semanticSequence = lesson.experience.semanticSequence.map((item, index) =>
    normalizeText(item, `semantic sequence ${String(index + 1)}`),
  );
  const stdin = run?.stdin ?? lesson.case.stdin;
  const stdout = run?.stdout ?? lesson.case.stdout;
  assertIo(stdin, "stdin");
  assertIo(stdout, "stdout");
  const runtimeEvidence = resolveFoaCourseRuntimeEvidence(profile, run);

  const frameLabels = Object.freeze(
    lesson.semanticEvents.map((event, index) =>
      normalizeText(
        run?.eventDetails[index] ?? event.label,
        `runtime frame label ${String(index + 1)}`,
      ),
    ),
  );
  const details = Object.freeze(
    lesson.semanticEvents.map((_, index) =>
      run === null
        ? fixedCaseDetail(lesson, semanticSequence[index]!, index, stdin, stdout)
        : interactiveEvidenceDetail(
            profile,
            runtimeEvidence.frames[index]!,
            runtimeEvidence.frames[index - 1] ?? null,
          ),
    ),
  );
  const inputValues = createInputValues(lesson.id, stdin, run?.tokens ?? []);
  const eventValues = lesson.semanticEvents.map((event, index) =>
    freezeValue({
      id: `${event.id}.runtime-value`,
      role: valueRole(event.type, index === frameCount - 1),
      label: frameLabels[index]!,
      value: details[index]!,
    }),
  );
  const outputValue = freezeValue({
    id: `${lesson.id}.runtime.output`,
    role: "output",
    label: foaText("标准输出", "Standard output"),
    value: ioText(stdout),
  });
  const primaryInputId = inputValues.at(1)?.id ?? inputValues[0]!.id;

  const frames = Object.freeze(
    lesson.semanticEvents.map((event, cursorIndex): FoaRuntimeFrame => {
      const evidence = runtimeEvidence.frames[cursorIndex]!;
      const actionKind = actionKindFor(lesson.experience.visualFamily, event.type);
      const outputVisible = cursorIndex === frameCount - 1;
      const cumulativeValues = Object.freeze([
        ...inputValues,
        ...eventValues.slice(0, cursorIndex + 1),
        ...(outputVisible ? [outputValue] : []),
      ]);
      const currentValue = eventValues[cursorIndex]!;
      const previousValue = eventValues[cursorIndex - 1];
      const fromValueId = outputVisible ? currentValue.id : (previousValue?.id ?? primaryInputId);
      const toValueId = outputVisible ? outputValue.id : currentValue.id;
      const activeRelation = freezeRelation({
        id: `${lesson.id}.runtime.relation.${String(cursorIndex + 1)}`,
        fromValueId,
        toValueId,
        actionKind,
        label: relationText(actionKind, profile.connection),
      });
      const activeValueIds = Object.freeze(
        uniqueStrings(
          outputVisible ? [currentValue.id, outputValue.id] : [fromValueId, currentValue.id],
        ),
      );
      assertFrameReferences(cumulativeValues, activeValueIds, activeRelation);
      return Object.freeze({
        id: `${lesson.id}.runtime.frame.${String(cursorIndex + 1)}`,
        eventId: event.id,
        actionKind,
        label: frameLabels[cursorIndex]!,
        detail: details[cursorIndex]!,
        values: cumulativeValues,
        activeValueIds,
        activeRelation,
        cursorIndex,
        branchOutcome: evidence.branchOutcome,
        iteration: evidence.iteration,
        outputVisible,
        evidence,
      });
    }),
  );

  assertFrameIds(
    frames,
    lesson.semanticEvents.map((event) => event.id),
  );
  return Object.freeze({
    lessonId: lesson.id,
    lessonOrder: lesson.order,
    sceneKind: profile.kind,
    connection: profile.connection,
    visualFamily: lesson.experience.visualFamily,
    visualModel,
    primaryAction,
    mechanismId: profile.mechanismId,
    observableKind: profile.observableKind,
    observableLabels: profile.observableLabels,
    learnerControl: profile.learnerControl,
    caseGoal: profile.caseGoal,
    stateShape: profile.stateShape,
    stdin,
    stdout,
    frames,
  });
}

function createInputValues(
  lessonId: string,
  stdin: string,
  authoredTokens: readonly string[],
): readonly FoaRuntimeValue[] {
  const rawInput = freezeValue({
    id: `${lessonId}.runtime.stdin`,
    role: "input",
    label: foaText("本轮输入", "Run input"),
    value: ioText(stdin),
  });
  const tokens = authoredTokens.length > 0 ? authoredTokens : tokenize(stdin);
  const tokenKind = authoredTokens.length > 0 ? "array" : "input";
  const tokenValues = tokens.map((token, index) => {
    if (typeof token !== "string" || token.trim().length === 0) {
      throw new TypeError("FOA runtime tokens must be non-empty strings");
    }
    return freezeValue({
      id: `${lessonId}.runtime.token.${String(index + 1)}`,
      role: "token",
      label:
        tokenKind === "array"
          ? foaText(`数组元素 ${String(index + 1)}`, `Array item ${String(index + 1)}`)
          : foaText(`输入 token ${String(index + 1)}`, `Input token ${String(index + 1)}`),
      value: foaText(token, token),
    });
  });
  return Object.freeze([rawInput, ...tokenValues]);
}

function fixedCaseDetail(
  lesson: FoaLessonDefinition,
  step: FoaLocalizedText,
  index: number,
  stdin: string,
  stdout: string,
): FoaLocalizedText {
  if (index === 0) {
    const description = normalizeText(lesson.case.description, "fixed-case description");
    return foaText(
      `${step.zh}：${description.zh}；输入 ${compactIo(stdin)}`,
      `${step.en}: ${description.en}; input ${compactIo(stdin)}`,
    );
  }
  if (index === lesson.semanticEvents.length - 1) {
    const rendered = compactIo(stdout);
    return foaText(`${step.zh}：输出 ${rendered}`, `${step.en}: output ${rendered}`);
  }
  return normalizeText(step, `fixed-case step ${String(index + 1)}`);
}

function interactiveEvidenceDetail(
  profile: FoaSceneProfile,
  snapshot: FoaRuntimeEvidenceSnapshot,
  previous: FoaRuntimeEvidenceSnapshot | null,
): FoaLocalizedText {
  const changedFields = profile.stateShape.filter((field) => {
    if (previous === null) return true;
    const before = previous.stateValues[field.id]!;
    const after = snapshot.stateValues[field.id]!;
    return before.zh !== after.zh || before.en !== after.en;
  });
  const visibleFields = (
    changedFields.length > 0 ? changedFields : profile.stateShape.slice(-1)
  ).slice(0, 2);
  return foaText(
    visibleFields
      .map((field) => `${field.label.zh}=${snapshot.stateValues[field.id]!.zh}`)
      .join(" · "),
    visibleFields
      .map((field) => `${field.label.en}=${snapshot.stateValues[field.id]!.en}`)
      .join(" · "),
  );
}

function actionKindFor(
  family: FoaVisualFamily,
  eventType: FoaSemanticEventType,
): FoaRuntimeActionKind {
  if (eventType === "branch") return "choose";
  if (eventType === "compare") return "classify";
  if (eventType === "call" || eventType === "return") return "push-pop";
  if (eventType === "allocate" || eventType === "release") return "connect";
  if (eventType === "measure") return "inspect";
  switch (family) {
    case "execution":
      return "advance";
    case "pipeline":
    case "sequence":
    case "stream":
    case "sorting":
      return "move";
    case "decision":
      return "choose";
    case "state":
    case "expression":
    case "bit-grid":
      return "apply";
    case "call-stack":
      return "push-pop";
    case "memory":
    case "pointer-graph":
    case "tree":
    case "dependency":
      return "connect";
    case "loop":
      return "advance";
    case "search":
    case "evidence":
      return "inspect";
    case "preprocessor":
      return "classify";
    default:
      throw new RangeError(`Unsupported FOA visual family ${String(family)}`);
  }
}

function valueRole(eventType: FoaSemanticEventType, terminal: boolean): FoaRuntimeValueRole {
  if (terminal || eventType === "write") return "result";
  switch (eventType) {
    case "read":
      return "input";
    case "compare":
    case "branch":
      return "predicate";
    case "iterate":
      return "cursor";
    case "measure":
      return "result";
    case "bind":
    case "call":
    case "return":
    case "allocate":
    case "release":
      return "state";
    default:
      throw new RangeError(`Unsupported FOA semantic event type ${String(eventType)}`);
  }
}

function relationText(
  actionKind: FoaRuntimeActionKind,
  connection: FoaSceneConnection,
): FoaLocalizedText {
  const suffix = connectionText(connection);
  switch (actionKind) {
    case "advance":
      return foaText(`继续 · ${suffix.zh}`, `Advance · ${suffix.en}`);
    case "move":
      return foaText(`移动 · ${suffix.zh}`, `Move · ${suffix.en}`);
    case "choose":
      return foaText(`选择路径 · ${suffix.zh}`, `Choose path · ${suffix.en}`);
    case "apply":
      return foaText(`应用变化 · ${suffix.zh}`, `Apply change · ${suffix.en}`);
    case "inspect":
      return foaText(`检查证据 · ${suffix.zh}`, `Inspect evidence · ${suffix.en}`);
    case "connect":
      return foaText(`建立关系 · ${suffix.zh}`, `Connect · ${suffix.en}`);
    case "push-pop":
      return foaText(`栈帧变化 · ${suffix.zh}`, `Stack transition · ${suffix.en}`);
    case "classify":
      return foaText(`判断结果 · ${suffix.zh}`, `Classify · ${suffix.en}`);
  }
}

function connectionText(connection: FoaSceneConnection): FoaLocalizedText {
  switch (connection) {
    case "forward":
      return foaText("顺序", "forward");
    case "branch":
      return foaText("分支", "branch");
    case "cycle":
      return foaText("回路", "cycle");
    case "unwind":
      return foaText("回退", "unwind");
    case "alias":
      return foaText("别名", "alias");
    case "grid":
      return foaText("网格", "grid");
    case "compare":
      return foaText("比较", "compare");
    case "evidence":
      return foaText("证据", "evidence");
    default:
      throw new RangeError(`Unsupported FOA scene connection ${String(connection)}`);
  }
}

function freezeValue(value: FoaRuntimeValue): FoaRuntimeValue {
  assertStableId(value.id, "FOA runtime value ID");
  return Object.freeze({
    id: value.id,
    role: value.role,
    label: normalizeText(value.label, `runtime value ${value.id} label`),
    value: normalizeText(value.value, `runtime value ${value.id}`),
  });
}

function freezeRelation(relation: FoaRuntimeRelation): FoaRuntimeRelation {
  assertStableId(relation.id, "FOA runtime relation ID");
  assertStableId(relation.fromValueId, "FOA runtime relation source");
  assertStableId(relation.toValueId, "FOA runtime relation target");
  if (relation.fromValueId === relation.toValueId) {
    throw new RangeError("FOA runtime relations must connect two distinct values");
  }
  return Object.freeze({
    id: relation.id,
    fromValueId: relation.fromValueId,
    toValueId: relation.toValueId,
    actionKind: relation.actionKind,
    label: normalizeText(relation.label, `runtime relation ${relation.id}`),
  });
}

function assertFrameReferences(
  values: readonly FoaRuntimeValue[],
  activeValueIds: readonly string[],
  relation: FoaRuntimeRelation,
): void {
  const valueIds = new Set<string>();
  values.forEach((value) => {
    if (valueIds.has(value.id)) {
      throw new RangeError(`FOA runtime frame repeats value ID ${value.id}`);
    }
    valueIds.add(value.id);
  });
  activeValueIds.forEach((id) => {
    if (!valueIds.has(id)) {
      throw new RangeError(`FOA runtime frame activates unknown value ${id}`);
    }
  });
  if (!valueIds.has(relation.fromValueId) || !valueIds.has(relation.toValueId)) {
    throw new RangeError("FOA runtime relation must reference cumulative frame values");
  }
}

function assertFrameIds(frames: readonly FoaRuntimeFrame[], eventIds: readonly string[]): void {
  if (frames.length !== eventIds.length || frames.length < 2 || frames.length > 32) {
    throw new RangeError("FOA runtime models require two to 32 aligned frames");
  }
  const frameIds = new Set<string>();
  frames.forEach((frame, index) => {
    assertStableId(frame.id, "FOA runtime frame ID");
    if (frameIds.has(frame.id)) throw new RangeError(`Duplicate FOA runtime frame ID ${frame.id}`);
    frameIds.add(frame.id);
    if (frame.eventId !== eventIds[index] || frame.cursorIndex !== index) {
      throw new RangeError("FOA runtime frames must preserve semantic-event order");
    }
    if (!Object.isFrozen(frame.values) || !Object.isFrozen(frame.activeValueIds)) {
      throw new TypeError("FOA runtime frame collections must be frozen");
    }
  });
}

function normalizeText(value: FoaLocalizedText, field: string): FoaLocalizedText {
  if (value === null || typeof value !== "object") {
    throw new TypeError(`FOA ${field} must be bilingual text`);
  }
  if (typeof value.zh !== "string" || typeof value.en !== "string") {
    throw new TypeError(`FOA ${field} must contain Chinese and English strings`);
  }
  return foaText(value.zh, value.en);
}

function ioText(value: string): FoaLocalizedText {
  const compact = compactIo(value);
  return foaText(compact, compact);
}

function compactIo(value: string): string {
  const normalized = value.replaceAll("\r\n", "\n").replaceAll("\r", "\n").trim();
  return normalized.length === 0 ? "∅" : normalized.replaceAll("\n", " ↵ ");
}

function tokenize(value: string): readonly string[] {
  const compact = value.trim();
  return compact.length === 0
    ? Object.freeze([])
    : Object.freeze(compact.split(/[\s,]+/u).filter((item) => item.length > 0));
}

function uniqueStrings(values: readonly string[]): string[] {
  return [...new Set(values)];
}

function assertIo(value: unknown, field: string): asserts value is string {
  if (typeof value !== "string") throw new TypeError(`FOA runtime ${field} must be a string`);
}

function assertLessonOrder(order: number): void {
  if (!Number.isInteger(order) || order < 1 || order > 60) {
    throw new RangeError("FOA runtime lesson order must be an integer from 1 to 60");
  }
}

function assertObject(value: unknown, field: string): asserts value is object {
  if (value === null || typeof value !== "object")
    throw new TypeError(`${field} must be an object`);
}

function assertArray(value: unknown, field: string): asserts value is readonly unknown[] {
  if (!Array.isArray(value)) throw new TypeError(`${field} must be an array`);
}

function assertVisualFamily(value: unknown): asserts value is FoaVisualFamily {
  if (
    value !== "execution" &&
    value !== "pipeline" &&
    value !== "state" &&
    value !== "expression" &&
    value !== "decision" &&
    value !== "loop" &&
    value !== "sequence" &&
    value !== "call-stack" &&
    value !== "memory" &&
    value !== "pointer-graph" &&
    value !== "tree" &&
    value !== "stream" &&
    value !== "search" &&
    value !== "sorting" &&
    value !== "evidence" &&
    value !== "bit-grid" &&
    value !== "preprocessor" &&
    value !== "dependency"
  ) {
    throw new RangeError(`Unsupported FOA visual family ${String(value)}`);
  }
}

function assertSceneKind(value: unknown): asserts value is FoaSceneKind {
  if (
    value !== "execution" &&
    value !== "state" &&
    value !== "expression" &&
    value !== "branch" &&
    value !== "loop" &&
    value !== "stream" &&
    value !== "call-stack" &&
    value !== "scope" &&
    value !== "pointer" &&
    value !== "array" &&
    value !== "matrix" &&
    value !== "search" &&
    value !== "plot" &&
    value !== "evidence" &&
    value !== "sorting"
  ) {
    throw new RangeError(`Unsupported FOA scene kind ${String(value)}`);
  }
}

function assertConnection(value: unknown): asserts value is FoaSceneConnection {
  if (
    value !== "forward" &&
    value !== "branch" &&
    value !== "cycle" &&
    value !== "unwind" &&
    value !== "alias" &&
    value !== "grid" &&
    value !== "compare" &&
    value !== "evidence"
  ) {
    throw new RangeError(`Unsupported FOA scene connection ${String(value)}`);
  }
}

function assertStableId(value: unknown, field: string): asserts value is string {
  if (typeof value !== "string" || !STABLE_ID.test(value)) {
    throw new TypeError(`${field} must be a stable identifier`);
  }
}
