import type { ProgramAnalysisSnapshot } from "../analysis/index.js";

export interface ProgramAnalysisWorkerRequest {
  readonly type: "analyze";
  readonly requestId: number;
  readonly source: string;
  readonly revision: number;
  readonly projectedBlockCount: number;
}

export interface ProgramAnalysisWorkerDisposeRequest {
  readonly type: "dispose";
}

export type ProgramAnalysisWorkerInbound =
  ProgramAnalysisWorkerRequest | ProgramAnalysisWorkerDisposeRequest;

export interface ProgramAnalysisWorkerSnapshotMessage {
  readonly type: "snapshot";
  readonly requestId: number;
  readonly complete: boolean;
  readonly analysis: ProgramAnalysisSnapshot;
}

export interface ProgramAnalysisWorkerErrorMessage {
  readonly type: "error";
  readonly requestId: number;
  readonly message: string;
}

export type ProgramAnalysisWorkerOutbound =
  ProgramAnalysisWorkerSnapshotMessage | ProgramAnalysisWorkerErrorMessage;
