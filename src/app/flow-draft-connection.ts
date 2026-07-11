import type { ProgramAnalysisSnapshot } from "../analysis/index.js";
import {
  planStatementOperation,
  type CAnalysisSnapshot,
  type StatementEditTarget,
  type TextPatch,
  type TextRange,
} from "../core/index.js";
import type { FlowNode, FlowProjection } from "../flow/index.js";
import { fingerprintSource } from "../shared/source-snapshot.js";
import type { FlowCanvasDraftConnectionIntent } from "../ui/flow-canvas.js";

export type FlowDraftConnectionPostcondition =
  | "source-reparse"
  | "source-roundtrip"
  | "cfg-complete"
  | "cfg-draft-before-target"
  | "no-new-partial-cfg";

export type FlowDraftConnectionRejectionCode =
  | "stale-source"
  | "invalid-draft"
  | "unsupported-draft-edge"
  | "unknown-target"
  | "locked-target"
  | "invalid-target-port"
  | "partial-cfg"
  | "ambiguous-target"
  | "unsafe-insertion-slot";

export interface FlowDraftConnectionPlanningInput {
  readonly source: string;
  readonly analysis: CAnalysisSnapshot;
  readonly programAnalysis: ProgramAnalysisSnapshot;
  readonly projection: FlowProjection;
  readonly intent: FlowCanvasDraftConnectionIntent;
}

export interface AcceptedFlowDraftConnectionPlan {
  readonly status: "accepted";
  readonly intent: FlowCanvasDraftConnectionIntent;
  readonly baseRevision: number;
  readonly targetFlowNodeId: string;
  readonly targetStatementId: string;
  readonly targetStatementRange: TextRange;
  readonly patches: readonly TextPatch[];
  readonly insertedStatementText: string;
  readonly requiresConfirmation: true;
  readonly requiredPostconditions: readonly FlowDraftConnectionPostcondition[];
}

export interface RejectedFlowDraftConnectionPlan {
  readonly status: "rejected";
  readonly intent: FlowCanvasDraftConnectionIntent;
  readonly code: FlowDraftConnectionRejectionCode;
  readonly message: string;
}

export type FlowDraftConnectionPlan =
  AcceptedFlowDraftConnectionPlan | RejectedFlowDraftConnectionPlan;

export const MAX_FLOW_DRAFT_SOURCE_LENGTH = 16 * 1024;

const REQUIRED_POSTCONDITIONS: readonly FlowDraftConnectionPostcondition[] = Object.freeze([
  "source-reparse",
  "source-roundtrip",
  "cfg-complete",
  "cfg-draft-before-target",
  "no-new-partial-cfg",
]);

/**
 * Plans one detached draft as a statement immediately before a projected CFG node. The returned
 * patch is provisional: this pure planner never applies it and the caller must enforce all listed
 * reparse, roundtrip and CFG postconditions before commit.
 */
export function planFlowDraftConnection(
  input: FlowDraftConnectionPlanningInput,
): FlowDraftConnectionPlan {
  const intent = freezeIntent(input.intent);
  if (!sameSourceSnapshot(input)) {
    return reject(intent, "stale-source", "草稿连接不属于当前源码快照");
  }
  if (
    intent.sourceText === null ||
    intent.sourceText.trim().length === 0 ||
    intent.sourceText.length > MAX_FLOW_DRAFT_SOURCE_LENGTH ||
    intent.sourceText.includes("\0")
  ) {
    return reject(
      intent,
      "invalid-draft",
      `草稿必须携带非空、不含 NUL 且不超过 ${String(MAX_FLOW_DRAFT_SOURCE_LENGTH)} 字符的 C 语句源码`,
    );
  }
  if (intent.edgeKind !== "next") {
    return reject(
      intent,
      "unsupported-draft-edge",
      "草稿安全接入首版只接受 next 输出；分支端口必须先形成完整控制结构",
    );
  }

  const targetNode = input.projection.nodes.find((node) => node.id === intent.toNodeId);
  if (targetNode === undefined) {
    return reject(intent, "unknown-target", "找不到草稿连接目标节点");
  }
  if (targetNode.locked || targetNode.kind === "raw") {
    return reject(intent, "locked-target", "锁定节点不能作为草稿接入点");
  }
  if (!isEditableControlInput(targetNode, intent.toPortId)) {
    return reject(intent, "invalid-target-port", "目标端口不是可编辑的控制输入");
  }
  if (targetNode.functionId === null || targetNode.sourceNodeId === null) {
    return reject(intent, "unknown-target", "目标节点没有可验证的 CFG 来源");
  }

  const cfg = input.programAnalysis.functions.find(
    (candidate) => candidate.id === targetNode.functionId,
  );
  const cfgNode = cfg?.nodes.find((node) => node.id === targetNode.sourceNodeId);
  if (cfg === undefined || cfgNode === undefined) {
    return reject(intent, "unknown-target", "目标节点已脱离当前 CFG 快照");
  }
  if (cfg.partial) {
    return reject(intent, "partial-cfg", "CFG 不完整时禁止生成草稿插入补丁");
  }
  if (cfgNode.ownership !== "primary" || cfgNode.kind === "entry" || cfgNode.kind === "exit") {
    return reject(intent, "ambiguous-target", "目标不是可独立定位的源码语句节点");
  }

  const target = uniqueStatementTarget(input.analysis, targetNode);
  if (target === null) {
    return reject(intent, "ambiguous-target", "无法把流程节点唯一映射到 statement-list 插槽");
  }
  if (target.parentMode !== "statement-list" || target.blocker !== null) {
    return reject(intent, "unsafe-insertion-slot", "目标旁不是安全的 statement-list 插槽");
  }

  try {
    const statementPlan = planStatementOperation(input.source, input.analysis.statementEdits, {
      kind: "insert-statement",
      baseRevision: input.analysis.statementEdits.revision,
      targetId: target.id,
      expectedTargetText: input.source.slice(target.range.from, target.range.to),
      position: "before",
      statementText: intent.sourceText,
    });
    if (statementPlan.insertedStatementText === undefined) {
      return reject(intent, "unsafe-insertion-slot", "插入规划未产生可验证的语句文本");
    }
    return Object.freeze({
      status: "accepted",
      intent,
      baseRevision: statementPlan.baseRevision,
      targetFlowNodeId: targetNode.id,
      targetStatementId: target.id,
      targetStatementRange: target.range,
      patches: statementPlan.patches,
      insertedStatementText: statementPlan.insertedStatementText,
      requiresConfirmation: true,
      requiredPostconditions: REQUIRED_POSTCONDITIONS,
    });
  } catch (error: unknown) {
    return reject(
      intent,
      "unsafe-insertion-slot",
      error instanceof Error ? error.message : "无法安全生成草稿插入补丁",
    );
  }
}

function sameSourceSnapshot(input: FlowDraftConnectionPlanningInput): boolean {
  const fingerprint = fingerprintSource(input.source);
  return (
    input.analysis.document.source === input.source &&
    !input.analysis.document.parse.hasError &&
    input.analysis.statementEdits.sourceLength === input.source.length &&
    input.analysis.statementEdits.sourceFingerprint === fingerprint &&
    input.programAnalysis.sourceLength === input.source.length &&
    input.programAnalysis.sourceFingerprint === fingerprint &&
    input.projection.sourceLength === input.source.length &&
    input.projection.sourceFingerprint === fingerprint &&
    input.intent.sourceFingerprint === fingerprint &&
    input.projection.sourceRevision === input.programAnalysis.revision &&
    input.analysis.statementEdits.revision === input.programAnalysis.revision
  );
}

function uniqueStatementTarget(
  analysis: CAnalysisSnapshot,
  targetNode: FlowNode,
): StatementEditTarget | null {
  const matches = analysis.statementEdits.statements.filter(
    (target) =>
      target.range.from === targetNode.ownerBlockRange.from &&
      target.range.to === targetNode.ownerBlockRange.to,
  );
  return matches.length === 1 ? (matches[0] ?? null) : null;
}

function isEditableControlInput(node: FlowNode, portId: string): boolean {
  return node.ports.some(
    (port) =>
      port.id === portId &&
      port.direction === "input" &&
      port.channel === "control" &&
      port.editable,
  );
}

function freezeIntent(intent: FlowCanvasDraftConnectionIntent): FlowCanvasDraftConnectionIntent {
  return Object.freeze({ ...intent });
}

function reject(
  intent: FlowCanvasDraftConnectionIntent,
  code: FlowDraftConnectionRejectionCode,
  message: string,
): RejectedFlowDraftConnectionPlan {
  return Object.freeze({ status: "rejected", intent, code, message });
}
