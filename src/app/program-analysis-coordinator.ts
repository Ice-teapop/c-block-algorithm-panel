import type { ProgramAnalysisSnapshot } from "../analysis/index.js";
import type { Block, CAnalysisSnapshot } from "../core/index.js";
import type { ImportedSource } from "../shared/api.js";
import type { ReadySession } from "./program-analysis-session.js";
import {
  createProgramAnalysisWorkerClient,
  type ProgramAnalysisWorkerClient,
} from "./program-analysis-worker-client.js";

export interface ProgramAnalysisCoordinatorOptions {
  readonly getSession: () => ReadySession | null;
  readonly setProgramAnalysis: (analysis: ProgramAnalysisSnapshot) => ReadySession;
  readonly getSelectedBlock: () => Block | null;
  readonly onProjection: (session: ReadySession) => void;
  readonly onExplanation: (session: ReadySession, block: Block | null) => void;
  readonly onProgress: (functionCount: number, complete: boolean) => void;
  readonly onError: (error: Error) => void;
  readonly worker?: ProgramAnalysisWorkerClient | undefined;
}

export interface ProgramAnalysisCoordinator {
  schedule(
    imported: ImportedSource,
    analysis: CAnalysisSnapshot,
    projectedBlockCount: number,
  ): void;
  destroy(): void;
}

export function createProgramAnalysisCoordinator(
  options: ProgramAnalysisCoordinatorOptions,
): ProgramAnalysisCoordinator {
  assertOptions(options);
  const worker = options.worker ?? createProgramAnalysisWorkerClient();
  let destroyed = false;

  const isCurrent = (imported: ImportedSource, analysis: CAnalysisSnapshot): boolean => {
    const current = options.getSession();
    return (
      !destroyed &&
      current !== null &&
      current.imported.source === imported.source &&
      current.analysis.editTargets.revision === analysis.editTargets.revision
    );
  };

  return Object.freeze({
    schedule(
      imported: ImportedSource,
      analysis: CAnalysisSnapshot,
      projectedBlockCount: number,
    ): void {
      if (destroyed) return;
      worker.analyze(imported.source, analysis.editTargets.revision, projectedBlockCount, {
        onSnapshot(programAnalysis, complete) {
          if (!isCurrent(imported, analysis)) return;
          const session = options.setProgramAnalysis(programAnalysis);
          options.onProjection(session);
          options.onExplanation(session, options.getSelectedBlock());
          options.onProgress(programAnalysis.functions.length, complete);
        },
        onError(error) {
          if (isCurrent(imported, analysis)) options.onError(error);
        },
      });
    },
    destroy(): void {
      if (destroyed) return;
      destroyed = true;
      worker.destroy();
    },
  });
}

function assertOptions(options: ProgramAnalysisCoordinatorOptions): void {
  for (const callback of [
    options.getSession,
    options.setProgramAnalysis,
    options.getSelectedBlock,
    options.onProjection,
    options.onExplanation,
    options.onProgress,
    options.onError,
  ]) {
    if (typeof callback !== "function") {
      throw new TypeError("Program analysis coordinator options 无效");
    }
  }
}
