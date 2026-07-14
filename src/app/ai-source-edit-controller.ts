import {
  applyTextPatches,
  createBlockIndex,
  createTextPatch,
  renderSourceDoc,
  textRange,
  type CAnalysisSnapshot,
  type CParser,
  type EditApplication,
  type TextPatch,
  type TextRange,
} from "../core/index.js";
import { createFlowProjection, type FlowProjection } from "../flow/index.js";
import {
  isAiEditPermission,
  validateAiSourceEditProposal,
  type AiEditPermission,
  type AiSourceEditProposal,
} from "../shared/ai-edit.js";
import { validateSourceText } from "../shared/source-import.js";
import { fingerprintSource } from "../shared/source-snapshot.js";
import { analyzeProgramSnapshot, type ReadySession } from "./program-analysis-session.js";
import { assertNoCompleteCfgRegression } from "./source-edit-safety.js";

const WORKSPACE_ID_PATTERN = /^[a-zA-Z0-9:_-]{1,256}$/u;

export interface AiSourceEditBinding {
  readonly workspaceId: string;
  readonly sourceRevision: number;
  readonly sourceFingerprint: string;
}

export type AiSourceEditRejectionCode =
  | "invalid-proposal"
  | "not-ready"
  | "read-only"
  | "stale-workspace"
  | "stale-source"
  | "ambiguous-anchor"
  | "locked-region"
  | "invalid-source"
  | "parse-error"
  | "roundtrip-failed"
  | "cfg-regression"
  | "unsafe-projection"
  | "foreign-plan"
  | "confirmation-failed"
  | "commit-failed";

export interface AiSourceEditPlan {
  readonly schemaVersion: 1;
  readonly workspaceId: string;
  readonly baseRevision: number;
  readonly sourceFingerprint: string;
  readonly proposal: AiSourceEditProposal;
  readonly patches: readonly TextPatch[];
  readonly candidateSource: string;
  readonly diffSummary: string;
}

export type AiSourceEditPlanResult =
  | { readonly status: "planned"; readonly plan: AiSourceEditPlan }
  | {
      readonly status: "rejected";
      readonly code: AiSourceEditRejectionCode;
      readonly message: string;
    };

export type AiSourceEditApplyResult =
  | {
      readonly status: "applied";
      readonly workspaceId: string;
      readonly sourceFingerprint: string;
      readonly diffSummary: string;
    }
  | { readonly status: "cancelled"; readonly diffSummary: string }
  | {
      readonly status: "rejected";
      readonly code: AiSourceEditRejectionCode;
      readonly message: string;
    }
  | {
      /** main.c changed exactly, but the derived UI snapshot could not be refreshed. */
      readonly status: "source-changed";
      readonly workspaceId: string;
      readonly sourceFingerprint: string;
      readonly diffSummary: string;
      readonly message: string;
    };

export interface AiSourceEditControllerOptions {
  readonly getPermission: () => AiEditPermission;
  readonly getWorkspaceId: () => string | null;
  readonly getSession: () => ReadySession | null;
  readonly getProjection: () => FlowProjection | null;
  readonly getParser: () => CParser | null;
  readonly getProjectionMode: () => string;
  readonly getEditorSource: () => string;
  readonly applyPatches: (patches: readonly TextPatch[]) => boolean;
  readonly resetProjection: () => void;
  readonly nextRevision: () => number;
  readonly adopt: (imported: ReadySession["imported"], analysis: CAnalysisSnapshot) => void;
  readonly confirm: (plan: AiSourceEditPlan) => boolean | Promise<boolean>;
  readonly onApplied?:
    ((result: Extract<AiSourceEditApplyResult, { status: "applied" }>) => void) | undefined;
}

export interface AiSourceEditController {
  plan(proposal: unknown, binding: AiSourceEditBinding): AiSourceEditPlanResult;
  apply(plan: AiSourceEditPlan): Promise<AiSourceEditApplyResult>;
}

interface CandidateValidation {
  readonly application: EditApplication;
  readonly analysis: CAnalysisSnapshot;
}

/**
 * Converts untrusted AI text replacements into one exact, source-authoritative
 * CodeMirror transaction. Every apply repeats all stale and semantic gates.
 */
export function createAiSourceEditController(
  options: AiSourceEditControllerOptions,
): AiSourceEditController {
  assertOptions(options);
  const ownedPlans = new WeakSet<object>();

  const reject = (
    code: AiSourceEditRejectionCode,
    message: string,
  ): Extract<AiSourceEditPlanResult, { status: "rejected" }> =>
    Object.freeze({ status: "rejected", code, message });

  const prepare = (
    proposalValue: unknown,
    binding: AiSourceEditBinding,
  ): AiSourceEditPlanResult => {
    const proposal = validateAiSourceEditProposal(proposalValue);
    if (proposal === null || !validBinding(binding)) {
      return reject("invalid-proposal", "AI 提案结构无效；源码未修改。");
    }
    const readiness = currentSnapshot(options, binding);
    if (readiness.status === "rejected") return readiness;
    try {
      const patches = anchorReplacements(readiness.source, proposal);
      const validation = validateCandidate(
        options,
        readiness.session,
        readiness.projection,
        patches,
      );
      const plan: AiSourceEditPlan = Object.freeze({
        schemaVersion: 1,
        workspaceId: binding.workspaceId,
        baseRevision: binding.sourceRevision,
        sourceFingerprint: binding.sourceFingerprint,
        proposal,
        patches: validation.application.plan.patches,
        candidateSource: validation.application.source,
        diffSummary: formatAiEditDiffSummary(validation.application),
      });
      ownedPlans.add(plan);
      return Object.freeze({ status: "planned", plan });
    } catch (error: unknown) {
      return rejectionFromError(error);
    }
  };

  return Object.freeze({
    plan: prepare,

    async apply(plan: AiSourceEditPlan): Promise<AiSourceEditApplyResult> {
      if (!ownedPlans.has(plan)) {
        return reject("foreign-plan", "AI 修改计划不属于当前控制器；源码未修改。");
      }
      const permission = options.getPermission();
      if (!isAiEditPermission(permission)) {
        return reject("read-only", "AI 修改权限无效；源码未修改。");
      }
      if (permission === "read-only") {
        return reject("read-only", "AI 当前为只读模式；可查看建议，但不会修改源码。");
      }
      if (permission === "review") {
        let confirmed = false;
        try {
          confirmed = await options.confirm(plan);
        } catch {
          return reject("confirmation-failed", "无法确认 AI 修改计划；源码未修改。");
        }
        if (!confirmed) {
          return Object.freeze({ status: "cancelled", diffSummary: plan.diffSummary });
        }
      }

      const binding: AiSourceEditBinding = Object.freeze({
        workspaceId: plan.workspaceId,
        sourceRevision: plan.baseRevision,
        sourceFingerprint: plan.sourceFingerprint,
      });
      const readiness = currentSnapshot(options, binding);
      if (readiness.status === "rejected") return readiness;
      const commitPermission = options.getPermission();
      if (!isAiEditPermission(commitPermission) || commitPermission === "read-only") {
        return reject("read-only", "AI 修改权限已关闭；源码未修改。");
      }

      let validation: CandidateValidation;
      try {
        const patches = anchorReplacements(readiness.source, plan.proposal);
        validation = validateCandidate(options, readiness.session, readiness.projection, patches);
        if (
          validation.application.source !== plan.candidateSource ||
          formatAiEditDiffSummary(validation.application) !== plan.diffSummary
        ) {
          return reject("stale-source", "AI 修改计划已过期；源码未修改，请重新生成提案。");
        }
      } catch (error: unknown) {
        return rejectionFromError(error);
      }

      let changed = false;
      try {
        changed = options.applyPatches(validation.application.plan.patches);
      } catch (error: unknown) {
        if (options.getEditorSource() === validation.application.source) {
          return sourceChangedResult(plan, validation.application.source, error);
        }
        if (options.getEditorSource() !== readiness.source) {
          return sourceChangedResult(plan, options.getEditorSource(), error);
        }
        return reject("commit-failed", "CodeMirror 拒绝了 AI 补丁；源码未修改。");
      }
      if (!changed || options.getEditorSource() !== validation.application.source) {
        if (options.getEditorSource() === validation.application.source) {
          return sourceChangedResult(plan, validation.application.source, "提交状态不一致");
        }
        if (options.getEditorSource() !== readiness.source) {
          return sourceChangedResult(plan, options.getEditorSource(), "编辑器源码状态不一致");
        }
        return reject("commit-failed", "CodeMirror 未能精确应用 AI 补丁；源码未修改。");
      }

      try {
        options.resetProjection();
        options.adopt(
          Object.freeze({ ...readiness.session.imported, source: validation.application.source }),
          validation.analysis,
        );
      } catch (error: unknown) {
        return sourceChangedResult(plan, validation.application.source, error);
      }

      const result = Object.freeze({
        status: "applied" as const,
        workspaceId: plan.workspaceId,
        sourceFingerprint: fingerprintSource(validation.application.source),
        diffSummary: plan.diffSummary,
      });
      try {
        options.onApplied?.(result);
      } catch {
        // Observers cannot roll back an already validated source commit.
      }
      return result;
    },
  });
}

function currentSnapshot(
  options: AiSourceEditControllerOptions,
  binding: AiSourceEditBinding,
):
  | {
      readonly status: "ready";
      readonly source: string;
      readonly session: ReadySession;
      readonly projection: FlowProjection;
    }
  | Extract<AiSourceEditPlanResult, { status: "rejected" }> {
  const workspaceId = options.getWorkspaceId();
  if (workspaceId === null || workspaceId !== binding.workspaceId) {
    return Object.freeze({
      status: "rejected",
      code: "stale-workspace",
      message: "AI 提案属于另一个项目；源码未修改。",
    });
  }
  const session = options.getSession();
  const projection = options.getProjection();
  const parser = options.getParser();
  if (
    session === null ||
    projection === null ||
    parser === null ||
    options.getProjectionMode() !== "synced"
  ) {
    return Object.freeze({
      status: "rejected",
      code: "not-ready",
      message: "源码与 CFG 尚未同步；源码未修改。",
    });
  }
  const source = options.getEditorSource();
  const fingerprint = fingerprintSource(source);
  if (
    source !== session.imported.source ||
    session.analysis.document.source !== source ||
    session.analysis.editTargets.revision !== binding.sourceRevision ||
    session.programAnalysis.revision !== binding.sourceRevision ||
    fingerprint !== binding.sourceFingerprint ||
    session.programAnalysis.sourceFingerprint !== binding.sourceFingerprint ||
    projection.sourceFingerprint !== binding.sourceFingerprint ||
    projection.sourceRevision !== binding.sourceRevision
  ) {
    return Object.freeze({
      status: "rejected",
      code: "stale-source",
      message: "AI 提案绑定的源码版本已经变化；源码未修改。",
    });
  }
  if (session.analysis.document.parse.hasError || projection.documentHasError) {
    return Object.freeze({
      status: "rejected",
      code: "parse-error",
      message: "当前源码处于解析恢复状态；AI 不会在不可靠快照上改码。",
    });
  }
  return Object.freeze({ status: "ready", source, session, projection });
}

function anchorReplacements(source: string, proposal: AiSourceEditProposal): readonly TextPatch[] {
  const patches: TextPatch[] = [];
  for (const replacement of proposal.replacements) {
    const from = source.indexOf(replacement.expectedText);
    const repeated = from < 0 ? -1 : source.indexOf(replacement.expectedText, from + 1);
    if (from < 0 || repeated >= 0) {
      throw editError(
        "ambiguous-anchor",
        from < 0
          ? "AI 提案中的旧文本已不存在；源码未修改。"
          : "AI 提案中的旧文本命中多处；无法唯一定位，源码未修改。",
      );
    }
    patches.push(
      createTextPatch(textRange(from, from + replacement.expectedText.length), replacement.newText),
    );
  }
  try {
    return applyTextPatches(source, patches).plan.patches;
  } catch {
    throw editError("ambiguous-anchor", "AI 提案的替换区域重叠；源码未修改。");
  }
}

function validateCandidate(
  options: AiSourceEditControllerOptions,
  current: ReadySession,
  projection: FlowProjection,
  patches: readonly TextPatch[],
): CandidateValidation {
  assertOriginalRangesEditable(projection, patches);
  const application = applyTextPatches(current.imported.source, patches);
  const sourceValidation = validateSourceText(application.source);
  if (!sourceValidation.ok) {
    throw editError(
      "invalid-source",
      `${sourceValidation.code}：${sourceValidation.message}；源码未修改。`,
    );
  }
  const parser = options.getParser();
  if (parser === null) throw editError("not-ready", "C 解析器尚未就绪；源码未修改。");
  const analysis = parser.analyze(application.source, options.nextRevision());
  if (analysis.document.parse.hasError) {
    throw editError("parse-error", "AI 候选源码引入了解析错误；源码未修改。");
  }
  if (renderSourceDoc(analysis.document) !== application.source) {
    throw editError("roundtrip-failed", "AI 候选源码未通过逐字符无损往返；源码未修改。");
  }
  const blockIndex = createBlockIndex(analysis.document);
  const programAnalysis = analyzeProgramSnapshot(
    parser,
    application.source,
    analysis.editTargets.revision,
    blockIndex.entries.length,
  );
  try {
    assertNoCompleteCfgRegression(current.programAnalysis, programAnalysis);
  } catch (error: unknown) {
    throw editError("cfg-regression", errorMessage(error));
  }
  const candidateProjection = createFlowProjection(programAnalysis, analysis.document);
  assertCandidateRangesSafe(candidateProjection, application);
  return Object.freeze({ application, analysis });
}

function assertOriginalRangesEditable(
  projection: FlowProjection,
  patches: readonly TextPatch[],
): void {
  for (const patch of patches) {
    const lockedNode = projection.nodes.find(
      (node) => (node.locked || node.kind === "raw") && rangesOverlap(node.range, patch.range),
    );
    const partialFunction = projection.functions.find(
      (fn) => fn.partial && rangesOverlap(fn.range, patch.range),
    );
    if (lockedNode !== undefined || partialFunction !== undefined) {
      throw editError("locked-region", "AI 提案触及 raw、partial CFG 或其他锁定区域；源码未修改。");
    }
  }
}

function assertCandidateRangesSafe(projection: FlowProjection, application: EditApplication): void {
  for (const diff of application.diffs) {
    const rawNode = projection.nodes.find(
      (node) => node.kind === "raw" && rangesTouch(node.range, diff.afterRange),
    );
    const partialFunction = projection.functions.find(
      (fn) => fn.partial && rangesTouch(fn.range, diff.afterRange),
    );
    if (rawNode !== undefined || partialFunction !== undefined) {
      throw editError(
        "unsafe-projection",
        "AI 候选在修改区域生成了 raw 或 partial CFG；源码未修改。",
      );
    }
  }
}

function rangesOverlap(left: TextRange, right: TextRange): boolean {
  return left.from < right.to && right.from < left.to;
}

function rangesTouch(left: TextRange, right: TextRange): boolean {
  if (right.from === right.to) return left.from <= right.from && right.from <= left.to;
  return rangesOverlap(left, right);
}

export function formatAiEditDiffSummary(application: EditApplication): string {
  let removedLines = 0;
  let addedLines = 0;
  let removedCharacters = 0;
  let addedCharacters = 0;
  for (const diff of application.diffs) {
    removedLines += lineCount(diff.beforeText);
    addedLines += lineCount(diff.afterText);
    removedCharacters += diff.beforeText.length;
    addedCharacters += diff.afterText.length;
  }
  return `${String(application.diffs.length)} 处替换 · -${String(removedLines)} 行/+${String(addedLines)} 行 · -${String(removedCharacters)}/+${String(addedCharacters)} 字符`;
}

function lineCount(value: string): number {
  if (value.length === 0) return 0;
  return value.split(/\r\n|\n|\r/u).length;
}

function validBinding(value: AiSourceEditBinding): boolean {
  return (
    typeof value === "object" &&
    value !== null &&
    WORKSPACE_ID_PATTERN.test(value.workspaceId) &&
    Number.isSafeInteger(value.sourceRevision) &&
    value.sourceRevision >= 0 &&
    /^[a-zA-Z0-9:_-]{1,256}$/u.test(value.sourceFingerprint)
  );
}

interface AiSourceEditError extends Error {
  readonly code: AiSourceEditRejectionCode;
}

function editError(code: AiSourceEditRejectionCode, message: string): AiSourceEditError {
  return Object.assign(new Error(message), { code });
}

function rejectionFromError(
  error: unknown,
): Extract<AiSourceEditPlanResult, { status: "rejected" }> {
  const code =
    error instanceof Error && "code" in error && typeof error.code === "string"
      ? (error.code as AiSourceEditRejectionCode)
      : "commit-failed";
  return Object.freeze({ status: "rejected", code, message: errorMessage(error) });
}

function sourceChangedResult(
  plan: AiSourceEditPlan,
  source: string,
  error: unknown,
): Extract<AiSourceEditApplyResult, { status: "source-changed" }> {
  return Object.freeze({
    status: "source-changed",
    workspaceId: plan.workspaceId,
    sourceFingerprint: fingerprintSource(source),
    diffSummary: plan.diffSummary,
    message: `main.c 已写入，但派生界面刷新失败：${errorMessage(error)}`,
  });
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function assertOptions(options: AiSourceEditControllerOptions): void {
  const callbacks: readonly (keyof AiSourceEditControllerOptions)[] = [
    "getPermission",
    "getWorkspaceId",
    "getSession",
    "getProjection",
    "getParser",
    "getProjectionMode",
    "getEditorSource",
    "applyPatches",
    "resetProjection",
    "nextRevision",
    "adopt",
    "confirm",
  ];
  for (const key of callbacks) {
    if (typeof options[key] !== "function") {
      throw new TypeError(`AI source edit option ${key} 必须是函数`);
    }
  }
}
