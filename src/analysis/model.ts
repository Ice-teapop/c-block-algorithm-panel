import type { SourceDoc, TextRange } from "../core/model.js";

export type CfgNodeKind = "entry" | "exit" | "syntax" | "control";
export type CfgNodeRole = "boundary" | "statement" | "declaration" | "control";
export type CfgNodeOwnership = "boundary" | "primary" | "auxiliary";
export type CfgEdgeKind =
  | "entry"
  | "next"
  | "branch-true"
  | "branch-false"
  | "switch-case"
  | "switch-default"
  | "switch-miss"
  | "break"
  | "continue"
  | "goto"
  | "return"
  | "terminate";

export interface CfgNode {
  /** Snapshot-local deterministic identity. */
  readonly id: string;
  readonly kind: CfgNodeKind;
  readonly role: CfgNodeRole;
  /** Whether this node owns a projected block or only refines its internal control flow. */
  readonly ownership: CfgNodeOwnership;
  readonly nodeType: string | null;
  readonly range: TextRange;
  readonly ownerBlockRange: TextRange;
  readonly reachable: boolean;
}

export interface CfgEdge {
  readonly from: string;
  readonly to: string;
  readonly kind: CfgEdgeKind;
}

export type CfgPartialReasonCode =
  "parse-error" | "unsupported-control-flow" | "unsupported-syntax";

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
  readonly document: SourceDoc;
}
