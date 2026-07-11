import type { ProgramAnalysisSnapshot } from "../analysis/index.js";
import type { TextRange } from "../core/index.js";
import type {
  RunComparisonKey,
  RunHistoryDocument,
  RunScenarioIdentity,
} from "../runtime/index.js";

export type MentorHintConfidence = "certain" | "likely" | "hint";
export type MentorFeedbackLevel = "verification" | "elaboration" | "strategy";

export interface MentorHintEvidence {
  readonly kind: "analysis-finding" | "loop-structure" | "real-path" | "run-history";
  readonly label: string;
  readonly range: TextRange | null;
  readonly nodeId: string | null;
  readonly runIds: readonly string[];
}

export interface MentorHintTarget {
  readonly range: TextRange;
  readonly nodeId: string;
}

export interface MentorHint {
  readonly id: string;
  readonly level: MentorFeedbackLevel;
  readonly confidence: MentorHintConfidence;
  readonly title: string;
  readonly summary: string;
  readonly nextStep: string;
  readonly target: MentorHintTarget | null;
  readonly evidence: readonly MentorHintEvidence[];
  readonly sourceMutation: "none";
}

export interface RealPathNodeVisit {
  readonly nodeId: string;
  readonly range: TextRange;
  readonly count: number;
}

export interface RealExecutionPathSummary {
  readonly mode: "real";
  readonly sourceFingerprint: string;
  readonly scenario: RunScenarioIdentity;
  readonly nodeVisits: readonly RealPathNodeVisit[];
  readonly durationMs: number;
  readonly operationCount: number | null;
  readonly edgeIds?: readonly string[] | undefined;
  readonly targetBranchId?: string | null | undefined;
}

export interface MentorHintContext {
  readonly analysis: ProgramAnalysisSnapshot;
  readonly realPath?: RealExecutionPathSummary | null;
  readonly runHistory?: RunHistoryDocument | null;
  readonly comparisonKey?: RunComparisonKey | null;
}

export interface MentorHintProvider {
  readonly id: string;
  readonly version: string;
  readonly networkAccess: "none";
  readonly sourceMutation: "none";
  getHints(context: MentorHintContext): readonly MentorHint[];
}

export type AlgorithmScenarioFamily =
  "sorting" | "searching" | "recursion" | "linked-list" | "tree" | "graph" | "dynamic-programming";

export interface ScenarioExpectedResult {
  readonly stdout: string;
  readonly explanation: string;
}

export interface ScenarioRunCase {
  readonly scenarioId: string;
  readonly scenarioVersion: string;
  readonly size: number;
  readonly stdin: string;
  readonly arguments: readonly string[];
  readonly expected: ScenarioExpectedResult;
}

export interface ScenarioSizeGeneratorDefinition {
  readonly minimum: number;
  readonly maximum: number;
  readonly defaultSizes: readonly number[];
  readonly inputModel: string;
}

export interface AlgorithmScenarioDefinition {
  readonly id: string;
  readonly version: string;
  readonly family: AlgorithmScenarioFamily;
  readonly label: string;
  readonly description: string;
  readonly example: ScenarioRunCase;
  readonly sizeGenerator: ScenarioSizeGeneratorDefinition;
}

export interface ScenarioProvider {
  readonly id: string;
  readonly version: string;
  readonly networkAccess: "none";
  list(): readonly AlgorithmScenarioDefinition[];
  get(id: string): AlgorithmScenarioDefinition | null;
  generate(id: string, size: number): ScenarioRunCase;
}
