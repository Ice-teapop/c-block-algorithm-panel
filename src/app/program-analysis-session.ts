import { analyzeProgramCst, type ProgramAnalysisSnapshot } from "../analysis/index.js";
import type { BlockIndex, CParser } from "../core/index.js";
import { fingerprintSource } from "../shared/source-snapshot.js";
import type { StructureEditSession } from "./structure-edit-controller.js";

export type ReadySession = StructureEditSession & {
  readonly blockIndex: BlockIndex;
  readonly programAnalysis: ProgramAnalysisSnapshot;
};

export const PROGRAM_ANALYSIS_LIMITS = Object.freeze({
  maxSourceLengthUtf16: 16 * 1024,
  maxProjectedBlocks: 256,
});

export function analyzeProgramSnapshot(
  parser: CParser,
  source: string,
  revision: number,
  projectedBlockCount: number,
): ProgramAnalysisSnapshot {
  assertSnapshotRequest(revision, projectedBlockCount);
  if (
    source.length > PROGRAM_ANALYSIS_LIMITS.maxSourceLengthUtf16 ||
    projectedBlockCount > PROGRAM_ANALYSIS_LIMITS.maxProjectedBlocks
  ) {
    return emptyProgramAnalysisSnapshot(source, revision);
  }
  return parser.inspect(source, revision, ({ rootNode, document }) => {
    if (rootNode.type !== "translation_unit") {
      return emptyProgramAnalysisSnapshot(source, revision);
    }
    return analyzeProgramCst({ source, revision, rootNode, document });
  }).result;
}

function emptyProgramAnalysisSnapshot(source: string, revision: number): ProgramAnalysisSnapshot {
  return Object.freeze({
    revision,
    sourceLength: source.length,
    sourceFingerprint: fingerprintSource(source),
    functions: Object.freeze([]),
    defUse: Object.freeze([]),
    memoryEvents: Object.freeze([]),
    memoryTypestate: Object.freeze([]),
    findings: Object.freeze([]),
  });
}

function assertSnapshotRequest(revision: number, projectedBlockCount: number): void {
  if (!Number.isSafeInteger(revision) || revision < 0) {
    throw new RangeError(`分析 revision 必须是非负安全整数，实际 ${String(revision)}`);
  }
  if (!Number.isSafeInteger(projectedBlockCount) || projectedBlockCount < 0) {
    throw new RangeError(`投影积木数量必须是非负安全整数，实际 ${String(projectedBlockCount)}`);
  }
}
