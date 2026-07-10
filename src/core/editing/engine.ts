import { textRange, type TextRange } from "../model.js";
import type { CAnalysisSnapshot } from "../parser.js";
import type { EditDiff, EditPlan, TextPatch } from "./model.js";
import { planBinaryOperatorPatches, type BinaryOperator } from "./operators.js";
import { applyTextPatches, createTextPatch } from "./patch.js";
import type {
  BinaryExpressionEditTarget,
  EditTarget,
  EditTargetSnapshot,
  ForStatementEditTarget,
  IfStatementEditTarget,
  LiteralEditTarget,
} from "./targets.js";

interface StructuredEditRequestBase {
  readonly baseRevision: number;
  readonly targetId: string;
  /** Exact target text shown by the UI when this request was created. */
  readonly expectedTargetText: string;
}

export interface LiteralEditRequest extends StructuredEditRequestBase {
  readonly kind: "literal";
  /** Complete replacement token, including quotes for char and string literals. */
  readonly newText: string;
}

export interface BinaryOperatorEditRequest extends StructuredEditRequestBase {
  readonly kind: "binary-operator";
  readonly newOperator: BinaryOperator;
}

export interface ForFieldsEditRequest extends StructuredEditRequestBase {
  readonly kind: "for-fields";
  /** Complete text between `(` and the first `;`, including intentional trivia. */
  readonly newInitializer: string;
  /** Complete text between the two `;` delimiters, including intentional trivia. */
  readonly newCondition: string;
  /** Complete text between the second `;` and `)`, including intentional trivia. */
  readonly newUpdate: string;
}

export interface IfConditionEditRequest extends StructuredEditRequestBase {
  readonly kind: "if-condition";
  /** Complete text inside the existing outer condition parentheses. */
  readonly newCondition: string;
}

export type StructuredEditRequest =
  LiteralEditRequest | BinaryOperatorEditRequest | ForFieldsEditRequest | IfConditionEditRequest;

export interface StructuredEditAnalyzer {
  analyze(source: string, revision: number): CAnalysisSnapshot;
}

export interface StructuredEditContext {
  readonly source: string;
  readonly analysis: CAnalysisSnapshot;
  readonly analyzer: StructuredEditAnalyzer;
  /** Host-owned source policy, for example UTF-8 validity, NUL and maximum byte length. */
  readonly validateSource: (source: string) => void;
}

export interface StructuredEditPlan {
  readonly kind: StructuredEditRequest["kind"];
  readonly targetId: string;
  readonly baseRevision: number;
  readonly candidateRevision: number;
  readonly textPlan: EditPlan;
  readonly patches: readonly TextPatch[];
  readonly diffs: readonly EditDiff[];
  readonly inversePatches: readonly TextPatch[];
  readonly candidateSource: string;
  readonly candidateAnalysis: CAnalysisSnapshot;
}

export type StructuredEditErrorCode =
  | "INVALID_EDIT_CONTEXT"
  | "INVALID_EDIT_REQUEST"
  | "STALE_EDIT"
  | "NO_OP_EDIT"
  | "CANDIDATE_SOURCE_REJECTED"
  | "CANDIDATE_ANALYSIS_FAILED"
  | "CANDIDATE_PARSE_ERROR"
  | "CANDIDATE_SHAPE_CHANGED";

export class StructuredEditError extends Error {
  readonly code: StructuredEditErrorCode;

  constructor(code: StructuredEditErrorCode, message: string, options?: ErrorOptions) {
    super(`${code}: ${message}`, options);
    this.name = "StructuredEditError";
    this.code = code;
  }
}

/** Plans and validates one complete structured edit without mutating the base snapshot. */
export function planStructuredEdit(
  context: StructuredEditContext,
  request: StructuredEditRequest,
): StructuredEditPlan {
  assertContext(context);
  assertRequest(request);
  const { source, analysis } = context;
  assertBaseSnapshot(source, analysis, request.baseRevision);

  const target = requireRequestTarget(analysis.editTargets, request);
  assertTargetFresh(source, analysis.editTargets, target, request);
  const rawPatches = planRequestPatches(source, analysis.editTargets, target, request);
  const application = applyTextPatches(source, rawPatches);
  if (application.plan.patches.length === 0) {
    throw editError("NO_OP_EDIT", "编辑没有改变源码");
  }

  try {
    context.validateSource(application.source);
  } catch (cause) {
    throw editError("CANDIDATE_SOURCE_REJECTED", "候选源码未通过宿主输入策略", cause);
  }

  const candidateRevision = nextRevision(request.baseRevision);
  let candidateAnalysis: CAnalysisSnapshot;
  try {
    candidateAnalysis = context.analyzer.analyze(application.source, candidateRevision);
  } catch (cause) {
    throw editError("CANDIDATE_ANALYSIS_FAILED", "候选源码分析失败", cause);
  }
  assertCandidateSnapshot(application.source, candidateRevision, candidateAnalysis);
  assertCandidateHasNoParseRecovery(candidateAnalysis);
  assertRequestPostcondition(target, request, application.diffs, candidateAnalysis);

  const frozenCandidate = deepFreeze(candidateAnalysis);
  return deepFreeze({
    kind: request.kind,
    targetId: request.targetId,
    baseRevision: request.baseRevision,
    candidateRevision,
    textPlan: application.plan,
    patches: application.plan.patches,
    diffs: application.diffs,
    inversePatches: application.inversePatches,
    candidateSource: application.source,
    candidateAnalysis: frozenCandidate,
  });
}

function planRequestPatches(
  source: string,
  snapshot: EditTargetSnapshot,
  target: EditTarget,
  request: StructuredEditRequest,
): readonly TextPatch[] {
  switch (request.kind) {
    case "literal": {
      const literal = requireTargetKind(target, "literal");
      return Object.freeze([createTextPatch(literal.range, request.newText)]);
    }
    case "binary-operator":
      requireTargetKind(target, "binary-expression");
      return planBinaryOperatorPatches(source, snapshot, target.id, request.newOperator);
    case "for-fields": {
      const forTarget = requireTargetKind(target, "for-statement");
      return Object.freeze(
        [
          minimalReplacement(
            forTarget.initializerRange,
            forTarget.initializerText,
            request.newInitializer,
          ),
          minimalReplacement(
            forTarget.conditionRange,
            forTarget.conditionText,
            request.newCondition,
          ),
          minimalReplacement(forTarget.updateRange, forTarget.updateText, request.newUpdate),
        ].filter((patch): patch is TextPatch => patch !== null),
      );
    }
    case "if-condition": {
      const ifTarget = requireTargetKind(target, "if-statement");
      const patch = minimalReplacement(
        ifTarget.conditionRange,
        ifTarget.conditionText,
        request.newCondition,
      );
      return patch === null ? Object.freeze([]) : Object.freeze([patch]);
    }
  }
}

function minimalReplacement(
  range: TextRange,
  beforeText: string,
  afterText: string,
): TextPatch | null {
  if (beforeText === afterText) return null;
  let prefixLength = 0;
  const commonLength = Math.min(beforeText.length, afterText.length);
  while (
    prefixLength < commonLength &&
    beforeText.charCodeAt(prefixLength) === afterText.charCodeAt(prefixLength)
  ) {
    prefixLength += 1;
  }

  let suffixLength = 0;
  while (
    suffixLength < commonLength - prefixLength &&
    beforeText.charCodeAt(beforeText.length - suffixLength - 1) ===
      afterText.charCodeAt(afterText.length - suffixLength - 1)
  ) {
    suffixLength += 1;
  }

  return createTextPatch(
    textRange(range.from + prefixLength, range.to - suffixLength),
    afterText.slice(prefixLength, afterText.length - suffixLength),
  );
}

function assertContext(context: StructuredEditContext): void {
  if (typeof context !== "object" || context === null) {
    throw editError("INVALID_EDIT_CONTEXT", "context 必须是对象");
  }
  if (typeof context.source !== "string") {
    throw editError("INVALID_EDIT_CONTEXT", "context.source 必须是字符串");
  }
  if (typeof context.analysis !== "object" || context.analysis === null) {
    throw editError("INVALID_EDIT_CONTEXT", "context.analysis 必须是对象");
  }
  if (typeof context.analyzer?.analyze !== "function") {
    throw editError("INVALID_EDIT_CONTEXT", "context.analyzer.analyze 不可用");
  }
  if (typeof context.validateSource !== "function") {
    throw editError("INVALID_EDIT_CONTEXT", "context.validateSource 不可用");
  }
  try {
    context.validateSource(context.source);
  } catch (cause) {
    throw editError("INVALID_EDIT_CONTEXT", "基础源码未通过宿主输入策略", cause);
  }
}

function assertRequest(request: StructuredEditRequest): void {
  if (typeof request !== "object" || request === null) {
    throw editError("INVALID_EDIT_REQUEST", "request 必须是对象");
  }
  if (!Number.isSafeInteger(request.baseRevision) || request.baseRevision < 0) {
    throw editError("INVALID_EDIT_REQUEST", "baseRevision 必须是非负安全整数");
  }
  if (typeof request.targetId !== "string" || request.targetId.length === 0) {
    throw editError("INVALID_EDIT_REQUEST", "targetId 不得为空");
  }
  if (typeof request.expectedTargetText !== "string") {
    throw editError("INVALID_EDIT_REQUEST", "expectedTargetText 必须是字符串");
  }
  if (request.kind === "literal" && typeof request.newText !== "string") {
    throw editError("INVALID_EDIT_REQUEST", "literal.newText 必须是字符串");
  }
  if (request.kind === "for-fields") {
    if (
      typeof request.newInitializer !== "string" ||
      typeof request.newCondition !== "string" ||
      typeof request.newUpdate !== "string"
    ) {
      throw editError("INVALID_EDIT_REQUEST", "for 三段必须都是字符串");
    }
  }
  if (request.kind === "if-condition" && typeof request.newCondition !== "string") {
    throw editError("INVALID_EDIT_REQUEST", "if condition 必须是字符串");
  }
  if (
    request.kind !== "literal" &&
    request.kind !== "binary-operator" &&
    request.kind !== "for-fields" &&
    request.kind !== "if-condition"
  ) {
    throw editError("INVALID_EDIT_REQUEST", "未知结构化编辑类型");
  }
}

function assertBaseSnapshot(
  source: string,
  analysis: CAnalysisSnapshot,
  baseRevision: number,
): void {
  if (
    analysis.document.source !== source ||
    analysis.document.range.from !== 0 ||
    analysis.document.range.to !== source.length ||
    analysis.editTargets.revision !== baseRevision
  ) {
    throw editError("STALE_EDIT", "源码、分析快照与 baseRevision 不属于同一版本");
  }
}

function requireRequestTarget(
  snapshot: EditTargetSnapshot,
  request: StructuredEditRequest,
): EditTarget {
  const allTargets: readonly EditTarget[] = [
    ...snapshot.literals,
    ...snapshot.binaryExpressions,
    ...snapshot.forStatements,
    ...snapshot.ifStatements,
  ];
  const matches = allTargets.filter((target) => target.id === request.targetId);
  if (matches.length !== 1 || matches[0] === undefined) {
    throw editError("STALE_EDIT", "target id 不存在或在快照中不唯一");
  }
  const expectedKind = requestKindToTargetKind(request.kind);
  if (matches[0].kind !== expectedKind) {
    throw editError("STALE_EDIT", `target kind 应为 ${expectedKind}，实际为 ${matches[0].kind}`);
  }
  return matches[0];
}

function assertTargetFresh(
  source: string,
  snapshot: EditTargetSnapshot,
  target: EditTarget,
  request: StructuredEditRequest,
): void {
  if (
    target.revision !== request.baseRevision ||
    target.revision !== snapshot.revision ||
    target.text !== request.expectedTargetText ||
    sliceExact(source, target.range) !== target.text
  ) {
    throw editError("STALE_EDIT", "target revision、原文或源码 range 已过期");
  }

  switch (target.kind) {
    case "literal":
      return;
    case "binary-expression":
      assertFact(source, target.leftRange, target.leftText);
      assertFact(source, target.operatorRange, target.operatorText);
      assertFact(source, target.rightRange, target.rightText);
      return;
    case "for-statement":
      assertFact(source, target.initializerRange, target.initializerText);
      assertFact(source, target.conditionRange, target.conditionText);
      assertFact(source, target.updateRange, target.updateText);
      assertFact(source, target.bodyRange, target.bodyText);
      return;
    case "if-statement":
      assertFact(source, target.conditionRange, target.conditionText);
      assertFact(source, target.consequenceRange, target.consequenceText);
      if (target.alternativeRange === null || target.alternativeText === null) {
        if (target.alternativeRange !== null || target.alternativeText !== null) {
          throw editError("STALE_EDIT", "if alternative facts 不一致");
        }
      } else {
        assertFact(source, target.alternativeRange, target.alternativeText);
      }
      assertFact(source, target.bodyRange, target.bodyText);
  }
}

function assertCandidateSnapshot(
  source: string,
  revision: number,
  analysis: CAnalysisSnapshot,
): void {
  if (
    analysis.document.source !== source ||
    analysis.document.range.from !== 0 ||
    analysis.document.range.to !== source.length ||
    analysis.editTargets.revision !== revision
  ) {
    throw editError("CANDIDATE_ANALYSIS_FAILED", "analyzer 返回了不匹配的候选快照");
  }
}

function assertCandidateHasNoParseRecovery(analysis: CAnalysisSnapshot): void {
  const { parse } = analysis.document;
  if (parse.hasError || parse.errorRanges.length > 0 || parse.missingOffsets.length > 0) {
    throw editError("CANDIDATE_PARSE_ERROR", "候选源码含 ERROR 或 MISSING");
  }
}

function assertRequestPostcondition(
  target: EditTarget,
  request: StructuredEditRequest,
  diffs: readonly EditDiff[],
  candidate: CAnalysisSnapshot,
): void {
  switch (request.kind) {
    case "literal":
      assertLiteralPostcondition(requireTargetKind(target, "literal"), request, diffs, candidate);
      return;
    case "binary-operator":
      assertBinaryPostcondition(
        requireTargetKind(target, "binary-expression"),
        request,
        diffs,
        candidate,
      );
      return;
    case "for-fields":
      assertForPostcondition(requireTargetKind(target, "for-statement"), request, diffs, candidate);
      return;
    case "if-condition":
      assertIfPostcondition(requireTargetKind(target, "if-statement"), request, diffs, candidate);
  }
}

function assertLiteralPostcondition(
  target: LiteralEditTarget,
  request: LiteralEditRequest,
  diffs: readonly EditDiff[],
  candidate: CAnalysisSnapshot,
): void {
  if (diffs.length !== 1 || !sameRange(diffs[0]?.beforeRange, target.range)) {
    throw editError("CANDIDATE_SHAPE_CHANGED", "literal 编辑必须只替换完整 literal range");
  }
  const candidateRange = diffs[0]?.afterRange;
  const matches = candidate.editTargets.literals.filter(
    (literal) =>
      candidateRange !== undefined &&
      sameRange(literal.range, candidateRange) &&
      literal.literalKind === target.literalKind &&
      literal.nodeType === target.nodeType &&
      literal.text === request.newText,
  );
  if (matches.length !== 1) {
    throw editError("CANDIDATE_SHAPE_CHANGED", "替换结果不再是同类单一 literal 节点");
  }
}

function assertBinaryPostcondition(
  target: BinaryExpressionEditTarget,
  request: BinaryOperatorEditRequest,
  diffs: readonly EditDiff[],
  candidate: CAnalysisSnapshot,
): void {
  const operatorDiffs = diffs.filter((diff) => sameRange(diff.beforeRange, target.operatorRange));
  if (operatorDiffs.length !== 1 || operatorDiffs[0] === undefined) {
    throw editError("CANDIDATE_SHAPE_CHANGED", "binary operator 没有被精确替换一次");
  }
  const operatorRange = operatorDiffs[0].afterRange;
  const matches = candidate.editTargets.binaryExpressions.filter(
    (binary) =>
      sameRange(binary.operatorRange, operatorRange) && binary.operatorText === request.newOperator,
  );
  if (matches.length !== 1) {
    throw editError("CANDIDATE_SHAPE_CHANGED", "候选源码中找不到唯一的新 binary operator");
  }
}

function assertForPostcondition(
  target: ForStatementEditTarget,
  request: ForFieldsEditRequest,
  diffs: readonly EditDiff[],
  candidate: CAnalysisSnapshot,
): void {
  const expectedRange = mapRange(target.range, diffs, true);
  const expectedBodyRange = mapRange(target.bodyRange, diffs, false);
  const matches = candidate.editTargets.forStatements.filter(
    (forTarget) =>
      sameRange(forTarget.range, expectedRange) &&
      sameRange(forTarget.bodyRange, expectedBodyRange) &&
      forTarget.initializerText === request.newInitializer &&
      forTarget.conditionText === request.newCondition &&
      forTarget.updateText === request.newUpdate &&
      forTarget.bodyNodeType === target.bodyNodeType &&
      forTarget.bodyText === target.bodyText,
  );
  if (matches.length !== 1) {
    throw editError("CANDIDATE_SHAPE_CHANGED", "for 三段编辑改变了 header 分段或 body");
  }
}

function assertIfPostcondition(
  target: IfStatementEditTarget,
  request: IfConditionEditRequest,
  diffs: readonly EditDiff[],
  candidate: CAnalysisSnapshot,
): void {
  const expectedRange = mapRange(target.range, diffs, true);
  const expectedConsequenceRange = mapRange(target.consequenceRange, diffs, false);
  const expectedAlternativeRange =
    target.alternativeRange === null ? null : mapRange(target.alternativeRange, diffs, false);
  const matches = candidate.editTargets.ifStatements.filter(
    (ifTarget) =>
      sameRange(ifTarget.range, expectedRange) &&
      sameRange(ifTarget.consequenceRange, expectedConsequenceRange) &&
      nullableSameRange(ifTarget.alternativeRange, expectedAlternativeRange) &&
      ifTarget.conditionText === request.newCondition &&
      ifTarget.consequenceNodeType === target.consequenceNodeType &&
      ifTarget.consequenceText === target.consequenceText &&
      ifTarget.alternativeNodeType === target.alternativeNodeType &&
      ifTarget.alternativeText === target.alternativeText,
  );
  if (matches.length !== 1) {
    throw editError(
      "CANDIDATE_SHAPE_CHANGED",
      "if condition 编辑改变了 consequence 或 alternative",
    );
  }
}

function mapRange(
  oldRange: TextRange,
  diffs: readonly EditDiff[],
  allowInternalEdits: boolean,
): TextRange {
  if (!allowInternalEdits) {
    for (const diff of diffs) {
      if (rangesTouchInterior(diff.beforeRange, oldRange)) {
        throw editError("CANDIDATE_SHAPE_CHANGED", "补丁触及必须逐字符保留的结构");
      }
    }
  }
  return textRange(mapBoundary(oldRange.from, diffs), mapBoundary(oldRange.to, diffs));
}

function mapBoundary(offset: number, diffs: readonly EditDiff[]): number {
  let delta = 0;
  for (const diff of diffs) {
    if (diff.beforeRange.to <= offset) {
      delta +=
        diff.afterRange.to - diff.afterRange.from - (diff.beforeRange.to - diff.beforeRange.from);
    }
  }
  return offset + delta;
}

function rangesTouchInterior(patch: TextRange, protectedRange: TextRange): boolean {
  if (patch.from === patch.to) {
    return protectedRange.from < patch.from && patch.from < protectedRange.to;
  }
  return patch.from < protectedRange.to && protectedRange.from < patch.to;
}

function requestKindToTargetKind(kind: StructuredEditRequest["kind"]): EditTarget["kind"] {
  switch (kind) {
    case "literal":
      return "literal";
    case "binary-operator":
      return "binary-expression";
    case "for-fields":
      return "for-statement";
    case "if-condition":
      return "if-statement";
  }
}

function requireTargetKind<K extends EditTarget["kind"]>(
  target: EditTarget,
  kind: K,
): Extract<EditTarget, { readonly kind: K }> {
  if (target.kind !== kind) {
    throw editError("STALE_EDIT", `target kind 应为 ${kind}，实际为 ${target.kind}`);
  }
  return target as Extract<EditTarget, { readonly kind: K }>;
}

function assertFact(source: string, range: TextRange, text: string): void {
  if (sliceExact(source, range) !== text) {
    throw editError("STALE_EDIT", "target 子范围原文已过期");
  }
}

function sliceExact(source: string, range: TextRange): string {
  if (
    !Number.isSafeInteger(range.from) ||
    !Number.isSafeInteger(range.to) ||
    range.from < 0 ||
    range.to < range.from ||
    range.to > source.length
  ) {
    throw editError("STALE_EDIT", "target range 越界");
  }
  return source.slice(range.from, range.to);
}

function sameRange(left: TextRange | undefined, right: TextRange): boolean {
  return left !== undefined && left.from === right.from && left.to === right.to;
}

function nullableSameRange(left: TextRange | null, right: TextRange | null): boolean {
  if (left === null || right === null) return left === right;
  return sameRange(left, right);
}

function nextRevision(revision: number): number {
  if (revision === Number.MAX_SAFE_INTEGER) {
    throw editError("INVALID_EDIT_REQUEST", "baseRevision 无法安全递增");
  }
  return revision + 1;
}

function editError(
  code: StructuredEditErrorCode,
  message: string,
  cause?: unknown,
): StructuredEditError {
  return cause === undefined
    ? new StructuredEditError(code, message)
    : new StructuredEditError(code, message, { cause });
}

function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== "object") return value;
  for (const nested of Object.values(value)) deepFreeze(nested);
  return Object.isFrozen(value) ? value : Object.freeze(value);
}
