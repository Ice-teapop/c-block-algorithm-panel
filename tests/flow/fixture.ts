import { analyzeProgramCst, type ProgramAnalysisSnapshot } from "../../src/analysis/index.js";
import type { CParser, SourceDoc } from "../../src/core/index.js";
import { createFlowProjection, type FlowProjection } from "../../src/flow/index.js";

export interface FlowFixture {
  readonly source: string;
  readonly document: SourceDoc;
  readonly analysis: ProgramAnalysisSnapshot;
  readonly projection: FlowProjection;
}

export function analyzeFlowFixture(parser: CParser, source: string, revision = 1): FlowFixture {
  const inspected = parser.inspect(source, revision, ({ rootNode, document }) =>
    analyzeProgramCst({ source, revision, rootNode, document }),
  );
  return Object.freeze({
    source,
    document: inspected.analysis.document,
    analysis: inspected.result,
    projection: createFlowProjection(inspected.result, inspected.analysis.document),
  });
}

export function deeplyFrozen(value: unknown, seen = new Set<object>()): boolean {
  if (typeof value !== "object" || value === null || seen.has(value)) return true;
  seen.add(value);
  return Object.isFrozen(value) && Object.values(value).every((child) => deeplyFrozen(child, seen));
}
