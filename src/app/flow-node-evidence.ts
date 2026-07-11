import type {
  AnalysisFinding,
  AnalysisFindingConfidence,
  ProgramAnalysisSnapshot,
} from "../analysis/index.js";
import type { FlowNode, FlowProjection } from "../flow/index.js";

export interface FlowNodeRuntimeSnapshot {
  readonly sourceFingerprint: string;
  readonly mode: "real" | "simulation";
  readonly currentNodeId: string | null;
  readonly nodeVisitCounts: Readonly<Record<string, number>>;
}

export interface FlowNodeDiagnosticEvidence {
  readonly id: string;
  readonly ruleId: string;
  readonly confidence: AnalysisFindingConfidence;
  readonly subject: string | null;
}

export interface FlowNodeEvidence {
  readonly diagnostics: readonly FlowNodeDiagnosticEvidence[];
  readonly runtime: {
    readonly mode: "real" | "simulation";
    readonly visitCount: number;
    readonly current: boolean;
  } | null;
}

/** Joins only evidence produced from the exact source snapshot; stale data is discarded. */
export function evidenceForFlowNode(
  node: FlowNode,
  projection: FlowProjection,
  analysis: ProgramAnalysisSnapshot | null,
  runtime: FlowNodeRuntimeSnapshot | null,
): FlowNodeEvidence {
  const diagnostics =
    analysis === null || analysis.sourceFingerprint !== projection.sourceFingerprint
      ? Object.freeze([])
      : Object.freeze(
          analysis.findings
            .filter((finding) => findingBelongsToNode(finding, node))
            .map((finding) =>
              Object.freeze({
                id: finding.id,
                ruleId: finding.ruleId,
                confidence: finding.confidence,
                subject: finding.subject,
              }),
            ),
        );
  const visitCount = runtime?.nodeVisitCounts[node.id] ?? 0;
  const runtimeEvidence =
    runtime === null ||
    runtime.sourceFingerprint !== projection.sourceFingerprint ||
    (!Number.isSafeInteger(visitCount) && visitCount !== 0) ||
    visitCount < 0
      ? null
      : Object.freeze({
          mode: runtime.mode,
          visitCount,
          current: runtime.currentNodeId === node.id,
        });
  return Object.freeze({ diagnostics, runtime: runtimeEvidence });
}

function findingBelongsToNode(finding: AnalysisFinding, node: FlowNode): boolean {
  if (node.functionId === null || finding.functionId !== node.functionId) return false;
  if (node.sourceNodeId !== null) return finding.ownerNodeId === node.sourceNodeId;
  return finding.primaryRange.from >= node.range.from && finding.primaryRange.to <= node.range.to;
}
