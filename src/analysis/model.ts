import type { TextRange } from "../core/model.js";

export type CfgNodeKind = "entry" | "exit" | "syntax";
export type CfgNodeRole = "boundary" | "statement" | "declaration";
export type CfgEdgeKind = "entry" | "next" | "branch-true" | "branch-false" | "return";

export interface CfgNode {
  /** Snapshot-local deterministic identity. */
  readonly id: string;
  readonly kind: CfgNodeKind;
  readonly role: CfgNodeRole;
  readonly nodeType: string | null;
  readonly range: TextRange;
  readonly reachable: boolean;
}

export interface CfgEdge {
  readonly from: string;
  readonly to: string;
  readonly kind: CfgEdgeKind;
}

export type CfgPartialReasonCode =
  "missing-function-body" | "parse-error" | "unsupported-control-flow" | "unsupported-syntax";

export interface CfgPartialReason {
  readonly code: CfgPartialReasonCode;
  readonly nodeType: string;
  readonly range: TextRange;
}

export interface FunctionCfg {
  readonly id: string;
  readonly name: string;
  readonly range: TextRange;
  readonly entryId: string;
  readonly exitId: string;
  readonly nodes: readonly CfgNode[];
  readonly edges: readonly CfgEdge[];
  readonly partial: boolean;
  readonly partialReasons: readonly CfgPartialReason[];
}

export interface ProgramAnalysisSnapshot {
  readonly revision: number;
  readonly sourceLength: number;
  readonly functions: readonly FunctionCfg[];
}

export interface ProgramAnalysisInput {
  readonly source: string;
  readonly revision: number;
  readonly rootNode: import("web-tree-sitter").Node;
}
