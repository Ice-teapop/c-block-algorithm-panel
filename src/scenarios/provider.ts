import type {
  AlgorithmScenarioDefinition,
  ScenarioProvider,
  ScenarioRunCase,
} from "../mentor/index.js";
import type { ScenarioCatalogStore } from "./catalog.js";

export interface CatalogScenarioProvider extends ScenarioProvider {
  readonly id: "project.scenario-catalog";
  getTargetBranchId(scenarioId: string, size: number): string | null;
  isReadOnly(scenarioId: string): boolean;
  availableSizes(scenarioId: string): readonly number[];
}

/** Live adapter: every call reads the current immutable catalog document. */
export function createCatalogScenarioProvider(
  store: ScenarioCatalogStore,
): CatalogScenarioProvider {
  return Object.freeze({
    id: "project.scenario-catalog",
    version: "1.0.0",
    networkAccess: "none",
    list(): readonly AlgorithmScenarioDefinition[] {
      return Object.freeze(store.list().map((entry) => entry.definition));
    },
    get(id: string): AlgorithmScenarioDefinition | null {
      return store.get(id)?.definition ?? null;
    },
    generate(id: string, size: number): ScenarioRunCase {
      const entry = store.get(id);
      if (entry === null) throw new RangeError(`未知场景：${id}`);
      const item = entry.cases.find((candidate) => candidate.runCase.size === size);
      if (item === undefined) {
        throw new RangeError(
          `场景 ${id} 未配置规模 ${String(size)}；可用规模：${entry.cases
            .map((candidate) => candidate.runCase.size)
            .join(", ")}`,
        );
      }
      return item.runCase;
    },
    getTargetBranchId(scenarioId: string, size: number): string | null {
      const entry = store.get(scenarioId);
      if (entry === null) return null;
      return (
        entry.cases.find((candidate) => candidate.runCase.size === size)?.targetBranchId ?? null
      );
    },
    isReadOnly(scenarioId: string): boolean {
      return store.get(scenarioId)?.readOnly ?? true;
    },
    availableSizes(scenarioId: string): readonly number[] {
      const entry = store.get(scenarioId);
      return Object.freeze(entry?.cases.map((item) => item.runCase.size) ?? []);
    },
  });
}
