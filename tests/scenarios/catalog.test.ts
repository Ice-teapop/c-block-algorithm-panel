import { describe, expect, it, vi } from "vitest";
import { createBuiltinScenarioProvider } from "../../src/mentor/index.js";
import {
  ScenarioCatalogError,
  createCatalogScenarioProvider,
  createEmptyScenarioCatalog,
  createScenarioCatalogStore,
  parseScenarioCatalogDocument,
  readScenarioCatalogExtension,
  withScenarioCatalogExtension,
  type CustomScenarioDraft,
} from "../../src/scenarios/index.js";

const FINGERPRINT = "100:abcd:ef01";

describe("custom scenario catalog", () => {
  it("creates, edits, duplicates and deletes validated cases with immutable revisions", () => {
    const onChange = vi.fn();
    const store = createScenarioCatalogStore({
      builtins: createBuiltinScenarioProvider(),
      document: createEmptyScenarioCatalog(FINGERPRINT),
      idFactory: ids(),
      clock: fixedClock(),
      onChange,
    });

    const created = store.createScenario(draft());
    const firstDocument = store.document;
    expect(created).toMatchObject({
      id: "custom.scenario-1",
      version: "1.0.0",
      cases: [{ id: "custom.scenario-1.case.1", stdin: "3\n" }],
    });
    expect(Object.isFrozen(firstDocument)).toBe(true);
    expect(Object.isFrozen(firstDocument.customScenarios)).toBe(true);

    const updatedCase = store.updateCase(created.id, created.cases[0]!.id, {
      ...caseDraft(1),
      stdin: "7\n",
      arguments: ["--mode", "fast"],
      expectedStdout: "7\n",
      targetBranchId: "edge.true",
    });
    expect(updatedCase).toMatchObject({ stdin: "7\n", targetBranchId: "edge.true" });
    expect(firstDocument.customScenarios[0]?.cases[0]?.stdin).toBe("3\n");

    const copiedCase = store.duplicateCase(created.id, updatedCase.id);
    expect(copiedCase).toMatchObject({ id: "case.case-1", size: 2, stdin: "7\n" });
    store.deleteCase(created.id, copiedCase.id);
    expect(() => store.deleteCase(created.id, updatedCase.id)).toThrowError(
      expect.objectContaining({ code: "CASE_REQUIRED" }),
    );

    const updatedScenario = store.updateScenario(created.id, {
      ...draft(),
      label: "已编辑场景",
      cases: [caseDraft(1)],
    });
    expect(updatedScenario.version).toBe("1.0.4");
    expect(updatedScenario.label).toBe("已编辑场景");

    const duplicate = store.duplicateScenario(created.id);
    expect(duplicate).toMatchObject({ id: "custom.scenario-2", label: "已编辑场景 副本" });
    store.deleteScenario(duplicate.id);
    expect(store.get(duplicate.id)).toBeNull();
    expect(onChange).toHaveBeenCalledTimes(7);
  });

  it("keeps builtins read-only but copies them into editable project definitions", () => {
    const builtins = createBuiltinScenarioProvider();
    const store = createScenarioCatalogStore({
      builtins,
      document: createEmptyScenarioCatalog(FINGERPRINT),
      idFactory: ids(),
      clock: fixedClock(),
    });
    const builtin = store.get("scenario.sorting.integers")!;
    expect(builtin).toMatchObject({ origin: "builtin", readOnly: true });
    expect(() => store.deleteScenario(builtin.id)).toThrowError(
      expect.objectContaining({ code: "READ_ONLY" }),
    );

    const copied = store.duplicateScenario(builtin.id);
    expect(copied).toMatchObject({
      id: "custom.scenario-1",
      family: "sorting",
      defaultSizes: [8, 32, 128],
    });
    expect(copied.cases).toHaveLength(3);
    const provider = createCatalogScenarioProvider(store);
    expect(provider.isReadOnly(builtin.id)).toBe(true);
    expect(provider.isReadOnly(copied.id)).toBe(false);
    expect(provider.generate(copied.id, 32).stdin).toContain("32");
    expect(provider.availableSizes(copied.id)).toEqual([8, 32, 128]);
    expect(() => provider.generate(copied.id, 9)).toThrow(/未配置规模/u);
  });

  it("rejects ambiguous, unsafe or structurally invalid project inputs", () => {
    const store = createScenarioCatalogStore({
      builtins: createBuiltinScenarioProvider(),
      document: createEmptyScenarioCatalog(FINGERPRINT),
      idFactory: ids(),
      clock: fixedClock(),
    });
    expect(() =>
      store.createScenario({
        ...draft(),
        cases: [caseDraft(1), caseDraft(1)],
      }),
    ).toThrow(/规模不得重复/u);
    expect(() =>
      store.createScenario({
        ...draft(),
        cases: [{ ...caseDraft(1), stdin: "bad\0input" }],
      }),
    ).toThrow(/stdin/u);
    expect(() =>
      store.createScenario({
        ...draft(),
        defaultSizes: [2],
      }),
    ).toThrow(/默认规模/u);
    expect(() =>
      store.createScenario({
        ...draft(),
        cases: [{ ...caseDraft(1), targetBranchId: "edge id with spaces" }],
      }),
    ).toThrow(/目标分支/u);
  });

  it("round-trips versioned scenarios.json and clears stale edge targets on source rebind", () => {
    const changes: string[] = [];
    const store = createScenarioCatalogStore({
      builtins: createBuiltinScenarioProvider(),
      document: createEmptyScenarioCatalog(FINGERPRINT),
      idFactory: ids(),
      clock: fixedClock(),
      onChange: (document) => changes.push(JSON.stringify(document)),
    });
    const scenario = store.createScenario({
      ...draft(),
      cases: [{ ...caseDraft(1), targetBranchId: "edge.true" }],
    });
    const serialized = JSON.stringify(store.document);
    expect(parseScenarioCatalogDocument(JSON.parse(serialized), FINGERPRINT)).toEqual(
      store.document,
    );
    expect(() => parseScenarioCatalogDocument(JSON.parse(serialized), "other:fingerprint")).toThrow(
      /指纹不一致/u,
    );

    store.rebindSource("101:next:source");
    expect(store.document.sourceFingerprint).toBe("101:next:source");
    expect(store.get(scenario.id)?.cases[0]?.targetBranchId).toBeNull();
    expect(changes).toHaveLength(2);
    expect(() => parseScenarioCatalogDocument({ schemaVersion: 99 })).toThrowError(
      ScenarioCatalogError,
    );
  });

  it("merges into the runtime-owned scenarios sidecar without replacing trace observations", () => {
    const catalog = createEmptyScenarioCatalog(FINGERPRINT);
    const runtimeDocument = Object.freeze({
      schemaVersion: 1,
      sourceFingerprint: FINGERPRINT,
      selection: { scenarioId: "builtin", size: 8 },
      observations: [{ edgeIds: ["edge.true"] }],
    });
    const merged = withScenarioCatalogExtension(runtimeDocument, catalog);
    expect(merged).toMatchObject({
      selection: { scenarioId: "builtin", size: 8 },
      observations: [{ edgeIds: ["edge.true"] }],
      customCatalog: { schemaVersion: 1, sourceFingerprint: FINGERPRINT },
    });
    expect(readScenarioCatalogExtension(merged, FINGERPRINT)).toEqual(catalog);
    expect(readScenarioCatalogExtension(runtimeDocument, FINGERPRINT)).toEqual(catalog);
    expect(() =>
      withScenarioCatalogExtension(
        { ...runtimeDocument, sourceFingerprint: "other:fingerprint" },
        catalog,
      ),
    ).toThrow(/指纹不一致/u);
  });
});

function draft(): CustomScenarioDraft {
  return Object.freeze({
    label: "自定义搜索",
    description: "验证项目输入",
    family: "searching",
    inputModel: "stdin integer",
    minimumSize: 1,
    maximumSize: 3,
    defaultSizes: Object.freeze([1]),
    cases: Object.freeze([caseDraft(1)]),
  });
}

function caseDraft(size: number) {
  return Object.freeze({
    label: `规模 ${String(size)}`,
    size,
    stdin: "3\n",
    arguments: Object.freeze([]),
    expectedStdout: "3\n",
    explanation: "原样输出",
    targetBranchId: null,
  });
}

function ids() {
  let scenario = 0;
  let input = 0;
  return Object.freeze({
    scenarioId: () => `scenario-${String(++scenario)}`,
    caseId: () => `case-${String(++input)}`,
  });
}

function fixedClock() {
  let seconds = 0;
  return Object.freeze({
    now: () => new Date(Date.UTC(2026, 6, 12, 0, 0, seconds++)),
  });
}
