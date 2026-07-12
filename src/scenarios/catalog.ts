import type {
  AlgorithmScenarioDefinition,
  AlgorithmScenarioFamily,
  ScenarioProvider,
  ScenarioRunCase,
} from "../mentor/index.js";
import {
  SCENARIO_CATALOG_MAX_CASES,
  SCENARIO_CATALOG_MAX_CUSTOM,
  SCENARIO_CATALOG_SCHEMA_VERSION,
  ScenarioCatalogError,
  type CustomScenarioCase,
  type CustomScenarioCaseDraft,
  type CustomScenarioDefinition,
  type CustomScenarioDraft,
  type ScenarioCatalogCaseEntry,
  type ScenarioCatalogClock,
  type ScenarioCatalogDocument,
  type ScenarioCatalogEntry,
  type ScenarioCatalogIdFactory,
} from "./contracts.js";

const FAMILY_VALUES = new Set<AlgorithmScenarioFamily>([
  "sorting",
  "searching",
  "recursion",
  "linked-list",
  "tree",
  "graph",
  "dynamic-programming",
]);
const STABLE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/u;
const SEMVER = /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$/u;
const MAX_TEXT = 16_384;
const MAX_STREAM = 1024 * 1024;
const MAX_ARGUMENTS = 64;
let fallbackId = 0;

export interface ScenarioCatalogStoreOptions {
  readonly builtins: ScenarioProvider;
  readonly document: ScenarioCatalogDocument;
  readonly idFactory?: ScenarioCatalogIdFactory | undefined;
  readonly clock?: ScenarioCatalogClock | undefined;
  readonly onChange?: ((document: ScenarioCatalogDocument) => void) | undefined;
}

export interface ScenarioCatalogStore {
  readonly document: ScenarioCatalogDocument;
  list(): readonly ScenarioCatalogEntry[];
  get(id: string): ScenarioCatalogEntry | null;
  createScenario(draft: CustomScenarioDraft): CustomScenarioDefinition;
  updateScenario(id: string, draft: CustomScenarioDraft): CustomScenarioDefinition;
  duplicateScenario(id: string): CustomScenarioDefinition;
  deleteScenario(id: string): void;
  createCase(scenarioId: string, draft: CustomScenarioCaseDraft): CustomScenarioCase;
  updateCase(
    scenarioId: string,
    caseId: string,
    draft: CustomScenarioCaseDraft,
  ): CustomScenarioCase;
  duplicateCase(scenarioId: string, caseId: string): CustomScenarioCase;
  deleteCase(scenarioId: string, caseId: string): void;
  replaceDocument(document: ScenarioCatalogDocument): void;
  rebindSource(sourceFingerprint: string): void;
}

export function createEmptyScenarioCatalog(sourceFingerprint: string): ScenarioCatalogDocument {
  assertFingerprint(sourceFingerprint);
  return Object.freeze({
    schemaVersion: SCENARIO_CATALOG_SCHEMA_VERSION,
    revision: 0,
    sourceFingerprint,
    customScenarios: Object.freeze([]),
  });
}

export function parseScenarioCatalogDocument(
  value: unknown,
  expectedFingerprint?: string,
): ScenarioCatalogDocument {
  if (!isRecord(value) || value.schemaVersion !== SCENARIO_CATALOG_SCHEMA_VERSION) {
    throw catalogError("INVALID_DOCUMENT", "scenarios.json schemaVersion 不受支持");
  }
  if (!Number.isSafeInteger(value.revision) || (value.revision as number) < 0) {
    throw catalogError("INVALID_DOCUMENT", "scenarios.json revision 无效");
  }
  const sourceFingerprint = assertFingerprint(value.sourceFingerprint);
  if (expectedFingerprint !== undefined && sourceFingerprint !== expectedFingerprint) {
    throw catalogError("INVALID_DOCUMENT", "scenarios.json 与当前源码指纹不一致");
  }
  if (
    !Array.isArray(value.customScenarios) ||
    value.customScenarios.length > SCENARIO_CATALOG_MAX_CUSTOM
  ) {
    throw catalogError("INVALID_DOCUMENT", "自定义场景数量无效");
  }
  const ids = new Set<string>();
  const scenarios = value.customScenarios.map((item) => {
    const scenario = normalizePersistedScenario(item);
    if (ids.has(scenario.id)) throw catalogError("DUPLICATE_ID", `场景 id 重复：${scenario.id}`);
    ids.add(scenario.id);
    return scenario;
  });
  return Object.freeze({
    schemaVersion: SCENARIO_CATALOG_SCHEMA_VERSION,
    revision: value.revision as number,
    sourceFingerprint,
    customScenarios: Object.freeze(scenarios),
  });
}

export function createScenarioCatalogStore(
  options: ScenarioCatalogStoreOptions,
): ScenarioCatalogStore {
  let document = parseScenarioCatalogDocument(options.document);
  const ids = options.idFactory ?? defaultIdFactory();
  const clock = options.clock ?? { now: () => new Date() };

  const commit = (
    scenarios: readonly CustomScenarioDefinition[],
    sourceFingerprint = document.sourceFingerprint,
  ): void => {
    if (document.revision === Number.MAX_SAFE_INTEGER) {
      throw catalogError("REVISION_LIMIT", "场景目录 revision 已达到安全上限");
    }
    document = Object.freeze({
      schemaVersion: SCENARIO_CATALOG_SCHEMA_VERSION,
      revision: document.revision + 1,
      sourceFingerprint,
      customScenarios: Object.freeze([...scenarios]),
    });
    options.onChange?.(document);
  };

  const findCustom = (id: string): CustomScenarioDefinition => {
    const scenario = document.customScenarios.find((item) => item.id === id);
    if (scenario !== undefined) return scenario;
    if (options.builtins.get(id) !== null) throw catalogError("READ_ONLY", "内置场景只读");
    throw catalogError("NOT_FOUND", `找不到场景：${id}`);
  };

  const replaceCustom = (next: CustomScenarioDefinition): void => {
    commit(document.customScenarios.map((item) => (item.id === next.id ? next : item)));
  };

  const api: ScenarioCatalogStore = {
    get document(): ScenarioCatalogDocument {
      return document;
    },
    list(): readonly ScenarioCatalogEntry[] {
      return Object.freeze([
        ...options.builtins.list().map((definition) => builtinEntry(options.builtins, definition)),
        ...document.customScenarios.map(customEntry),
      ]);
    },
    get(id: string): ScenarioCatalogEntry | null {
      const custom = document.customScenarios.find((item) => item.id === id);
      if (custom !== undefined) return customEntry(custom);
      const builtin = options.builtins.get(id);
      return builtin === null ? null : builtinEntry(options.builtins, builtin);
    },
    createScenario(draft: CustomScenarioDraft): CustomScenarioDefinition {
      if (document.customScenarios.length >= SCENARIO_CATALOG_MAX_CUSTOM) {
        throw catalogError("INVALID_SCENARIO", "自定义场景已达到上限");
      }
      const now = canonicalDate(clock.now());
      const scenario = normalizeDraft(draft, nextStableId(ids.scenarioId, "custom."), now, now);
      ensureUniqueScenarioId(document, options.builtins, scenario.id);
      commit([...document.customScenarios, scenario]);
      return scenario;
    },
    updateScenario(id: string, draft: CustomScenarioDraft): CustomScenarioDefinition {
      const current = findCustom(id);
      const scenario = normalizeDraft(
        draft,
        current.id,
        current.createdAt,
        canonicalDate(clock.now()),
        bumpPatch(current.version),
        current.cases.map((item) => item.id),
      );
      replaceCustom(scenario);
      return scenario;
    },
    duplicateScenario(id: string): CustomScenarioDefinition {
      const entry = api.get(id);
      if (entry === null) throw catalogError("NOT_FOUND", `找不到场景：${id}`);
      const draft = draftFromEntry(entry);
      return api.createScenario({ ...draft, label: `${draft.label} 副本` });
    },
    deleteScenario(id: string): void {
      findCustom(id);
      commit(document.customScenarios.filter((item) => item.id !== id));
    },
    createCase(scenarioId: string, draft: CustomScenarioCaseDraft): CustomScenarioCase {
      const current = findCustom(scenarioId);
      if (current.cases.length >= SCENARIO_CATALOG_MAX_CASES) {
        throw catalogError("INVALID_CASE", "案例数量已达到上限");
      }
      const created = normalizeCaseDraft(draft, nextStableId(ids.caseId, "case."));
      const next = withCases(current, [...current.cases, created], clock);
      replaceCustom(next);
      return created;
    },
    updateCase(
      scenarioId: string,
      caseId: string,
      draft: CustomScenarioCaseDraft,
    ): CustomScenarioCase {
      const current = findCustom(scenarioId);
      requireCase(current, caseId);
      const updated = normalizeCaseDraft(draft, caseId);
      replaceCustom(
        withCases(
          current,
          current.cases.map((item) => (item.id === caseId ? updated : item)),
          clock,
        ),
      );
      return updated;
    },
    duplicateCase(scenarioId: string, caseId: string): CustomScenarioCase {
      const current = findCustom(scenarioId);
      const source = requireCase(current, caseId);
      return api.createCase(scenarioId, {
        ...caseDraft(source),
        label: `${source.label} 副本`,
        size: nextAvailableSize(current),
      });
    },
    deleteCase(scenarioId: string, caseId: string): void {
      const current = findCustom(scenarioId);
      requireCase(current, caseId);
      if (current.cases.length === 1) {
        throw catalogError("CASE_REQUIRED", "每个场景至少保留一个案例");
      }
      replaceCustom(
        withCases(
          current,
          current.cases.filter((item) => item.id !== caseId),
          clock,
        ),
      );
    },
    replaceDocument(nextDocument: ScenarioCatalogDocument): void {
      document = parseScenarioCatalogDocument(nextDocument);
    },
    rebindSource(sourceFingerprint: string): void {
      assertFingerprint(sourceFingerprint);
      const scenarios = document.customScenarios.map((scenario) =>
        Object.freeze({
          ...scenario,
          cases: Object.freeze(
            scenario.cases.map((item) => Object.freeze({ ...item, targetBranchId: null })),
          ),
          version: bumpPatch(scenario.version),
          updatedAt: canonicalDate(clock.now()),
        }),
      );
      commit(scenarios, sourceFingerprint);
    },
  };
  return Object.freeze(api);
}

export function emptyCustomScenarioDraft(): CustomScenarioDraft {
  return Object.freeze({
    label: "新建场景",
    description: "",
    family: "sorting",
    inputModel: "stdin",
    minimumSize: 1,
    maximumSize: 1,
    defaultSizes: Object.freeze([1]),
    cases: Object.freeze([
      Object.freeze({
        label: "案例 1",
        size: 1,
        stdin: "",
        arguments: Object.freeze([]),
        expectedStdout: "",
        explanation: "",
        targetBranchId: null,
      }),
    ]),
  });
}

function normalizeDraft(
  draft: CustomScenarioDraft,
  id: string,
  createdAt: string,
  updatedAt: string,
  version = "1.0.0",
  existingCaseIds: readonly string[] = [],
): CustomScenarioDefinition {
  if (!isRecord(draft)) throw catalogError("INVALID_SCENARIO", "场景草稿必须是对象");
  const label = text(draft.label, "场景名称", true);
  const description = text(draft.description, "场景说明", false);
  const family = scenarioFamily(draft.family);
  const inputModel = text(draft.inputModel, "输入模型", true);
  const minimumSize = positiveInteger(draft.minimumSize, "最小规模");
  const maximumSize = positiveInteger(draft.maximumSize, "最大规模");
  if (minimumSize > maximumSize) {
    throw catalogError("INVALID_SCENARIO", "最小规模不得大于最大规模");
  }
  if (!Array.isArray(draft.cases) || draft.cases.length === 0) {
    throw catalogError("CASE_REQUIRED", "每个场景至少需要一个案例");
  }
  if (draft.cases.length > SCENARIO_CATALOG_MAX_CASES) {
    throw catalogError("INVALID_SCENARIO", "案例数量超过上限");
  }
  const cases = draft.cases.map((item, index) =>
    normalizeCaseDraft(item, existingCaseIds[index] ?? defaultCaseId(id, index)),
  );
  validateCaseSizes(cases, minimumSize, maximumSize);
  const defaultSizes = normalizeDefaultSizes(draft.defaultSizes, cases, minimumSize, maximumSize);
  return Object.freeze({
    id: stableId(id, "场景 id"),
    version: semanticVersion(version),
    label,
    description,
    family,
    inputModel,
    minimumSize,
    maximumSize,
    defaultSizes,
    cases: Object.freeze(cases),
    createdAt,
    updatedAt,
  });
}

function normalizePersistedScenario(value: unknown): CustomScenarioDefinition {
  if (!isRecord(value) || !Array.isArray(value.cases)) {
    throw catalogError("INVALID_SCENARIO", "持久化场景结构无效");
  }
  const createdAt = canonicalDate(new Date(text(value.createdAt, "createdAt", true)));
  const updatedAt = canonicalDate(new Date(text(value.updatedAt, "updatedAt", true)));
  const draft: CustomScenarioDraft = {
    label: value.label as string,
    description: value.description as string,
    family: value.family as AlgorithmScenarioFamily,
    inputModel: value.inputModel as string,
    minimumSize: value.minimumSize as number,
    maximumSize: value.maximumSize as number,
    defaultSizes: value.defaultSizes as readonly number[],
    cases: value.cases.map((item) => persistedCaseDraft(item)),
  };
  return normalizeDraft(
    draft,
    stableId(value.id, "场景 id"),
    createdAt,
    updatedAt,
    semanticVersion(value.version),
    value.cases.map((item) => stableId(isRecord(item) ? item.id : null, "案例 id")),
  );
}

function normalizeCaseDraft(draft: CustomScenarioCaseDraft, id: string): CustomScenarioCase {
  if (!isRecord(draft)) throw catalogError("INVALID_CASE", "案例草稿必须是对象");
  const args = normalizeArguments(draft.arguments);
  const target = draft.targetBranchId;
  if (target !== null && (typeof target !== "string" || !STABLE_ID.test(target))) {
    throw catalogError("INVALID_CASE", "目标分支必须是稳定 edge id 或 null");
  }
  return Object.freeze({
    id: stableId(id, "案例 id"),
    label: text(draft.label, "案例名称", true),
    size: positiveInteger(draft.size, "案例规模"),
    stdin: stream(draft.stdin, "stdin"),
    arguments: args,
    expectedStdout: stream(draft.expectedStdout, "期望输出"),
    explanation: text(draft.explanation, "输出说明", false),
    targetBranchId: target,
  });
}

function persistedCaseDraft(value: unknown): CustomScenarioCaseDraft {
  if (!isRecord(value)) throw catalogError("INVALID_CASE", "持久化案例结构无效");
  return {
    label: value.label as string,
    size: value.size as number,
    stdin: value.stdin as string,
    arguments: value.arguments as readonly string[],
    expectedStdout: value.expectedStdout as string,
    explanation: value.explanation as string,
    targetBranchId: value.targetBranchId as string | null,
  };
}

function builtinEntry(
  provider: ScenarioProvider,
  definition: AlgorithmScenarioDefinition,
): ScenarioCatalogEntry {
  const sizes = definition.sizeGenerator.caseSizes ?? definition.sizeGenerator.defaultSizes;
  return Object.freeze({
    id: definition.id,
    origin: "builtin",
    readOnly: true,
    definition,
    cases: Object.freeze(
      sizes.map((size, index) =>
        Object.freeze({
          id: `builtin-case.${String(index + 1)}`,
          label: `规模 ${String(size)}`,
          runCase: provider.generate(definition.id, size),
          targetBranchId: null,
        }),
      ),
    ),
  });
}

function customEntry(custom: CustomScenarioDefinition): ScenarioCatalogEntry {
  const bySize = new Map(custom.cases.map((item) => [item.size, item]));
  const exampleCase = bySize.get(custom.defaultSizes[0] ?? -1) ?? custom.cases[0]!;
  const definition: AlgorithmScenarioDefinition = Object.freeze({
    id: custom.id,
    version: custom.version,
    family: custom.family,
    label: custom.label,
    description: custom.description,
    example: toRunCase(custom, exampleCase),
    sizeGenerator: Object.freeze({
      minimum: custom.minimumSize,
      maximum: custom.maximumSize,
      defaultSizes: custom.defaultSizes,
      inputModel: custom.inputModel,
    }),
  });
  return Object.freeze({
    id: custom.id,
    origin: "custom",
    readOnly: false,
    definition,
    cases: Object.freeze(
      custom.cases.map((item) =>
        Object.freeze({
          id: item.id,
          label: item.label,
          runCase: toRunCase(custom, item),
          targetBranchId: item.targetBranchId,
        }),
      ),
    ),
  });
}

function toRunCase(scenario: CustomScenarioDefinition, item: CustomScenarioCase): ScenarioRunCase {
  return Object.freeze({
    scenarioId: scenario.id,
    scenarioVersion: scenario.version,
    size: item.size,
    stdin: item.stdin,
    arguments: item.arguments,
    expected: Object.freeze({
      stdout: item.expectedStdout,
      explanation: item.explanation,
    }),
  });
}

function draftFromEntry(entry: ScenarioCatalogEntry): CustomScenarioDraft {
  return Object.freeze({
    label: entry.definition.label,
    description: entry.definition.description,
    family: entry.definition.family,
    inputModel: entry.definition.sizeGenerator.inputModel,
    minimumSize: entry.definition.sizeGenerator.minimum,
    maximumSize: entry.definition.sizeGenerator.maximum,
    defaultSizes: entry.definition.sizeGenerator.defaultSizes,
    cases: Object.freeze(
      entry.cases.map((item) =>
        Object.freeze({
          label: item.label,
          size: item.runCase.size,
          stdin: item.runCase.stdin,
          arguments: item.runCase.arguments,
          expectedStdout: item.runCase.expected.stdout,
          explanation: item.runCase.expected.explanation,
          targetBranchId: item.targetBranchId,
        }),
      ),
    ),
  });
}

function withCases(
  current: CustomScenarioDefinition,
  cases: readonly CustomScenarioCase[],
  clock: ScenarioCatalogClock,
): CustomScenarioDefinition {
  if (cases.length === 0) throw catalogError("CASE_REQUIRED", "每个场景至少保留一个案例");
  validateCaseSizes(cases, current.minimumSize, current.maximumSize);
  const available = new Set(cases.map((item) => item.size));
  const defaults = current.defaultSizes.filter((size) => available.has(size));
  return Object.freeze({
    ...current,
    version: bumpPatch(current.version),
    defaultSizes: Object.freeze(defaults.length > 0 ? defaults : [cases[0]!.size]),
    cases: Object.freeze([...cases]),
    updatedAt: canonicalDate(clock.now()),
  });
}

function requireCase(scenario: CustomScenarioDefinition, caseId: string): CustomScenarioCase {
  const result = scenario.cases.find((item) => item.id === caseId);
  if (result === undefined) throw catalogError("NOT_FOUND", `找不到案例：${caseId}`);
  return result;
}

function validateCaseSizes(
  cases: readonly CustomScenarioCase[],
  minimum: number,
  maximum: number,
): void {
  const sizes = new Set<number>();
  const ids = new Set<string>();
  for (const item of cases) {
    if (item.size < minimum || item.size > maximum) {
      throw catalogError("INVALID_CASE", `案例 ${item.label} 的规模超出场景范围`);
    }
    if (sizes.has(item.size)) throw catalogError("INVALID_CASE", "同一场景的案例规模不得重复");
    if (ids.has(item.id)) throw catalogError("DUPLICATE_ID", `案例 id 重复：${item.id}`);
    sizes.add(item.size);
    ids.add(item.id);
  }
}

function normalizeDefaultSizes(
  values: readonly number[],
  cases: readonly CustomScenarioCase[],
  minimum: number,
  maximum: number,
): readonly number[] {
  if (!Array.isArray(values) || values.length === 0) {
    throw catalogError("INVALID_SCENARIO", "至少需要一个默认规模");
  }
  const available = new Set(cases.map((item) => item.size));
  const unique = [...new Set(values.map((item) => positiveInteger(item, "默认规模")))];
  if (unique.some((item) => item < minimum || item > maximum || !available.has(item))) {
    throw catalogError("INVALID_SCENARIO", "默认规模必须对应已有案例并处于规模范围内");
  }
  return Object.freeze(unique.sort((left, right) => left - right));
}

function normalizeArguments(value: readonly string[]): readonly string[] {
  if (!Array.isArray(value) || value.length > MAX_ARGUMENTS) {
    throw catalogError("INVALID_CASE", `args 必须是最多 ${String(MAX_ARGUMENTS)} 项的数组`);
  }
  return Object.freeze(
    value.map((item) => {
      if (typeof item !== "string" || item.includes("\0") || item.length > MAX_TEXT) {
        throw catalogError("INVALID_CASE", "每个 arg 必须是无 NUL 的有限字符串");
      }
      return item;
    }),
  );
}

function nextAvailableSize(scenario: CustomScenarioDefinition): number {
  const used = new Set(scenario.cases.map((item) => item.size));
  for (let size = scenario.minimumSize; size <= scenario.maximumSize; size += 1) {
    if (!used.has(size)) return size;
  }
  throw catalogError("INVALID_CASE", "当前规模范围内没有可用于复制案例的空位");
}

function ensureUniqueScenarioId(
  document: ScenarioCatalogDocument,
  builtins: ScenarioProvider,
  id: string,
): void {
  if (document.customScenarios.some((item) => item.id === id) || builtins.get(id) !== null) {
    throw catalogError("DUPLICATE_ID", `场景 id 已存在：${id}`);
  }
}

function defaultCaseId(scenarioId: string, index: number): string {
  return `${scenarioId}.case.${String(index + 1)}`;
}

function defaultIdFactory(): ScenarioCatalogIdFactory {
  const token = (): string => {
    if (typeof globalThis.crypto?.randomUUID === "function") return globalThis.crypto.randomUUID();
    fallbackId += 1;
    return `${Date.now().toString(36)}-${fallbackId.toString(36)}`;
  };
  return Object.freeze({ scenarioId: token, caseId: token });
}

function nextStableId(factory: () => string, prefix: string): string {
  const value = factory();
  return value.startsWith(prefix)
    ? stableId(value, "生成 id")
    : stableId(`${prefix}${value}`, "生成 id");
}

function bumpPatch(version: string): string {
  const match = SEMVER.exec(version);
  if (match === null) throw catalogError("INVALID_SCENARIO", "版本号必须是 x.y.z");
  const patch = Number(match[3]);
  if (!Number.isSafeInteger(patch) || patch === Number.MAX_SAFE_INTEGER) {
    throw catalogError("REVISION_LIMIT", "场景 patch 版本已达到上限");
  }
  return `${match[1]}.${match[2]}.${String(patch + 1)}`;
}

function semanticVersion(value: unknown): string {
  if (typeof value !== "string" || !SEMVER.test(value)) {
    throw catalogError("INVALID_SCENARIO", "版本号必须是 x.y.z");
  }
  return value;
}

function stableId(value: unknown, field: string): string {
  if (typeof value !== "string" || !STABLE_ID.test(value)) {
    throw catalogError("INVALID_SCENARIO", `${field} 必须是稳定标识符`);
  }
  return value;
}

function scenarioFamily(value: unknown): AlgorithmScenarioFamily {
  if (!FAMILY_VALUES.has(value as AlgorithmScenarioFamily)) {
    throw catalogError("INVALID_SCENARIO", "算法分类无效");
  }
  return value as AlgorithmScenarioFamily;
}

function positiveInteger(value: unknown, field: string): number {
  if (!Number.isSafeInteger(value) || (value as number) <= 0) {
    throw catalogError("INVALID_SCENARIO", `${field} 必须是正安全整数`);
  }
  return value as number;
}

function text(value: unknown, field: string, required: boolean): string {
  if (
    typeof value !== "string" ||
    value.includes("\0") ||
    value.length > MAX_TEXT ||
    value.trim() !== value ||
    (required && value.length === 0)
  ) {
    throw catalogError("INVALID_SCENARIO", `${field} 无效`);
  }
  return value;
}

function stream(value: unknown, field: string): string {
  if (typeof value !== "string" || value.includes("\0") || value.length > MAX_STREAM) {
    throw catalogError("INVALID_CASE", `${field} 必须是无 NUL 的有限字符串`);
  }
  return value;
}

function canonicalDate(date: Date): string {
  if (!(date instanceof Date) || !Number.isFinite(date.valueOf())) {
    throw catalogError("INVALID_SCENARIO", "时间戳无效");
  }
  return date.toISOString();
}

function assertFingerprint(value: unknown): string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > 256 ||
    value.includes("\0")
  ) {
    throw catalogError("INVALID_DOCUMENT", "源码指纹无效");
  }
  return value;
}

function caseDraft(item: CustomScenarioCase): CustomScenarioCaseDraft {
  return Object.freeze({
    label: item.label,
    size: item.size,
    stdin: item.stdin,
    arguments: item.arguments,
    expectedStdout: item.expectedStdout,
    explanation: item.explanation,
    targetBranchId: item.targetBranchId,
  });
}

function catalogError(
  code: ConstructorParameters<typeof ScenarioCatalogError>[0],
  message: string,
): ScenarioCatalogError {
  return new ScenarioCatalogError(code, message);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
