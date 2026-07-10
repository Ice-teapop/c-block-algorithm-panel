import { describe, expect, it, vi } from "vitest";
import {
  BUILTIN_LEARNING_STAGES,
  BUILTIN_LEARNING_TEMPLATES,
  DEFAULT_LEARNING_CATALOG_STORAGE_KEY,
  LEARNING_CATALOG_SCHEMA_VERSION,
  LearningCatalogError,
  createLearningCatalog,
  type LearningCatalogStorage,
  type LearningStageDefinition,
  type LearningTemplateDefinition,
} from "../../src/learning/index.js";

describe("learning catalog built-ins", () => {
  it("covers the undergraduate learning stages with single-fragment templates", () => {
    const catalog = createLearningCatalog();
    const snapshot = catalog.snapshot();
    const stageIds = snapshot.stages.map((stage) => stage.id);

    expect(stageIds).toEqual([
      "c.basics",
      "c.control-flow",
      "c.functions-arrays",
      "algorithms.search",
      "algorithms.sort",
      "algorithms.recursion",
      "data-structures.linear",
      "data-structures.trees",
      "analysis.correctness-complexity",
    ]);
    expect(BUILTIN_LEARNING_STAGES).toHaveLength(9);
    expect(BUILTIN_LEARNING_TEMPLATES.length).toBeGreaterThanOrEqual(9);
    expect(new Set(snapshot.templates.map((template) => template.stage))).toEqual(
      new Set(stageIds),
    );
    for (const template of snapshot.templates) {
      expect(template).toMatchObject({
        kind: "template",
        origin: "builtin",
        lifecycle: "active",
      });
      expect(template.id).toMatch(/^builtin\./u);
      expect(template.version).toMatch(/^\d+\.\d+\.\d+/u);
      expect(template.label).not.toBe("");
      expect(template.category).not.toBe("");
      expect(template.description).not.toBe("");
      expect(template.source.trim()).not.toBe("");
      expect(stageIds).toContain(template.stage);
      expect(catalog.canInstantiate(template.id)).toBe(true);
    }
    expect(catalog.listInstantiable()).toHaveLength(snapshot.templates.length);
    expectDeepFrozen(snapshot);
  });

  it("sorts stages and templates deterministically instead of trusting registration order", () => {
    const reversed = createLearningCatalog({
      stages: [...BUILTIN_LEARNING_STAGES].reverse(),
      builtinTemplates: [...BUILTIN_LEARNING_TEMPLATES].reverse(),
    }).snapshot();
    const forward = createLearningCatalog().snapshot();

    expect(reversed.stages).toEqual(forward.stages);
    expect(reversed.templates).toEqual(forward.templates);
  });
});

describe("custom learning template persistence and lifecycle", () => {
  it("persists schemaVersion and reloads an exact custom definition", () => {
    const storage = memoryStorage();
    const catalog = createLearningCatalog({ storage });
    const created = catalog.createCustom(customTemplate("custom.loop.count", "value++;"));

    expect(created).toMatchObject({ origin: "custom", lifecycle: "active" });
    const persisted = JSON.parse(storage.value() ?? "null") as Record<string, unknown>;
    expect(persisted.schemaVersion).toBe(LEARNING_CATALOG_SCHEMA_VERSION);
    expect(persisted.revision).toBe(1);

    const reloaded = createLearningCatalog({ storage });
    expect(reloaded.snapshot()).toMatchObject({ revision: 1, storageStatus: "loaded" });
    expect(reloaded.getEntry(created.id)).toEqual(created);
    expectDeepFrozen(reloaded.snapshot());
  });

  it("sorts custom entries independently of creation order", () => {
    const forward = createLearningCatalog();
    forward.createCustom(customTemplate("custom.zeta", "zeta();"));
    forward.createCustom(customTemplate("custom.alpha", "alpha();"));
    const reverse = createLearningCatalog();
    reverse.createCustom(customTemplate("custom.alpha", "alpha();"));
    reverse.createCustom(customTemplate("custom.zeta", "zeta();"));

    const customIds = (catalog: ReturnType<typeof createLearningCatalog>) =>
      catalog
        .snapshot()
        .templates.filter((template) => template.origin === "custom")
        .map((template) => template.id);
    expect(customIds(forward)).toEqual(["custom.alpha", "custom.zeta"]);
    expect(customIds(reverse)).toEqual(customIds(forward));
  });

  it("makes deprecated and retired entries unavailable without touching generated source", () => {
    const storage = memoryStorage();
    const catalog = createLearningCatalog({ storage });
    catalog.createCustom(customTemplate("custom.counter.old", "count++;"));
    catalog.createCustom(customTemplate("custom.counter.new", "count += 1;"));
    const generatedSource = "int main(void) { int count = 0; count++; return count; }";

    const deprecated = catalog.deprecateCustom("custom.counter.old", {
      reason: "Use the clearer replacement.",
      replacementId: "custom.counter.new",
    });
    expect(deprecated.lifecycle).toBe("deprecated");
    expect(catalog.canInstantiate(deprecated.id)).toBe(false);
    expect(catalog.listInstantiable().map((template) => template.id)).not.toContain(deprecated.id);

    const activeAgain = catalog.reactivateCustom(deprecated.id);
    expect(activeAgain.lifecycle).toBe("active");
    expect(catalog.canInstantiate(activeAgain.id)).toBe(true);
    catalog.deprecateCustom(activeAgain.id, {
      reason: "Replacement is ready.",
      replacementId: "custom.counter.new",
    });
    const tombstone = catalog.retireCustom(activeAgain.id, {
      reason: "Definition removed by its owner.",
    });

    expect(tombstone).toMatchObject({ lifecycle: "retired", origin: "custom" });
    expect("source" in tombstone).toBe(false);
    expect(catalog.canInstantiate(tombstone.id)).toBe(false);
    expect(catalog.snapshot().templates.map((template) => template.id)).not.toContain(tombstone.id);
    expect(catalog.snapshot().tombstones).toContainEqual(tombstone);
    expect(generatedSource).toBe("int main(void) { int count = 0; count++; return count; }");

    const stored = storage.value() ?? "";
    const parsed = JSON.parse(stored) as { tombstones: readonly Record<string, unknown>[] };
    expect(parsed.tombstones[0]).not.toHaveProperty("source");
  });

  it("keeps built-ins immutable", () => {
    const catalog = createLearningCatalog();
    const builtin = BUILTIN_LEARNING_TEMPLATES[0];
    if (builtin === undefined) throw new Error("missing builtin fixture");

    for (const operation of [
      () => catalog.updateCustom({ ...builtin, source: "int changed = 1;" }),
      () => catalog.deprecateCustom(builtin.id, { reason: "no" }),
      () => catalog.retireCustom(builtin.id, { reason: "no" }),
    ]) {
      expect(operation).toThrowError(
        expect.objectContaining<Partial<LearningCatalogError>>({
          code: "BUILTIN_IMMUTABLE",
        }),
      );
    }
  });
});

describe("learning catalog integrity", () => {
  it("rejects unknown stages, replacement references, cycles, and referenced deletion atomically", () => {
    const catalog = createLearningCatalog();
    expect(() =>
      catalog.createCustom({
        ...customTemplate("custom.unknown-stage", "work();"),
        stage: "stage.missing",
      }),
    ).toThrowError(expect.objectContaining({ code: "UNKNOWN_STAGE" }));

    catalog.createCustom(customTemplate("custom.a", "a();"));
    catalog.createCustom(customTemplate("custom.b", "b();"));
    const beforeUnknown = catalog.snapshot();
    expect(() =>
      catalog.deprecateCustom("custom.a", {
        reason: "missing",
        replacementId: "custom.missing",
      }),
    ).toThrowError(expect.objectContaining({ code: "UNKNOWN_REPLACEMENT" }));
    expect(catalog.snapshot()).toEqual(beforeUnknown);

    catalog.deprecateCustom("custom.a", { reason: "new b", replacementId: "custom.b" });
    const beforeCycle = catalog.snapshot();
    expect(() =>
      catalog.deprecateCustom("custom.b", { reason: "back to a", replacementId: "custom.a" }),
    ).toThrowError(expect.objectContaining({ code: "REPLACEMENT_CYCLE" }));
    expect(catalog.snapshot()).toEqual(beforeCycle);
    expect(() => catalog.retireCustom("custom.b", { reason: "still referenced" })).toThrowError(
      expect.objectContaining({ code: "TEMPLATE_REFERENCED" }),
    );
  });

  it("rejects missing and cyclic stage prerequisites", () => {
    expect(() =>
      createLearningCatalog({
        stages: [learningStage("stage.a", ["stage.missing"])],
        builtinTemplates: [],
      }),
    ).toThrowError(expect.objectContaining({ code: "UNKNOWN_STAGE" }));

    expect(() =>
      createLearningCatalog({
        stages: [learningStage("stage.a", ["stage.b"]), learningStage("stage.b", ["stage.a"])],
        builtinTemplates: [],
      }),
    ).toThrowError(expect.objectContaining({ code: "STAGE_CYCLE" }));
  });

  it("requires one conservative statement/control fragment and a custom namespace", () => {
    const catalog = createLearningCatalog();
    expect(() => catalog.createCustom(customTemplate("wrong.namespace", "work();"))).toThrowError(
      expect.objectContaining({ code: "CUSTOM_ID_REQUIRED" }),
    );
    expect(() =>
      catalog.createCustom(customTemplate("custom.no-semicolon", "work()")),
    ).toThrowError(expect.objectContaining({ code: "INVALID_TEMPLATE" }));
    expect(() =>
      catalog.createCustom({
        ...customTemplate("custom.preprocessor", "#define X 1"),
        fragmentKind: "control",
      }),
    ).toThrowError(expect.objectContaining({ code: "INVALID_TEMPLATE" }));
  });
});

describe("learning catalog storage failure containment", () => {
  it.each([
    ["invalid JSON", "{"],
    [
      "wrong schema",
      JSON.stringify({ schemaVersion: 99, revision: 0, templates: [], tombstones: [] }),
    ],
    [
      "invalid references",
      JSON.stringify({
        schemaVersion: LEARNING_CATALOG_SCHEMA_VERSION,
        revision: 2,
        templates: [
          {
            ...customTemplate("custom.bad-reference", "work();"),
            kind: "template",
            origin: "custom",
            lifecycle: "deprecated",
            deprecation: { reason: "bad", replacementId: "custom.missing" },
          },
        ],
        tombstones: [],
      }),
    ],
  ])("degrades %s to the intact built-in catalog", (_label, stored) => {
    const storage = memoryStorage(stored);
    const catalog = createLearningCatalog({ storage });

    expect(catalog.snapshot()).toMatchObject({ revision: 0, storageStatus: "degraded" });
    expect(catalog.snapshot().templates.every((template) => template.origin === "builtin")).toBe(
      true,
    );
    expect(catalog.snapshot().tombstones).toEqual([]);

    catalog.createCustom(customTemplate("custom.repaired", "repair();"));
    expect(catalog.snapshot()).toMatchObject({ revision: 1, storageStatus: "loaded" });
    expect(JSON.parse(storage.value() ?? "null")).toMatchObject({
      schemaVersion: LEARNING_CATALOG_SCHEMA_VERSION,
      revision: 1,
    });
  });

  it("contains a storage write failure without mutating the in-memory catalog", () => {
    const storage: LearningCatalogStorage = {
      getItem: () => null,
      setItem: vi.fn(() => {
        throw new Error("disk full");
      }),
    };
    const catalog = createLearningCatalog({ storage });
    const before = catalog.snapshot();

    expect(() => catalog.createCustom(customTemplate("custom.atomic", "atomic();"))).toThrowError(
      expect.objectContaining({ code: "STORAGE_WRITE_FAILED" }),
    );
    expect(catalog.snapshot()).toEqual(before);
    expect(catalog.getEntry("custom.atomic")).toBeNull();
  });

  it("degrades a throwing storage reader without throwing from construction", () => {
    const catalog = createLearningCatalog({
      storage: {
        getItem: () => {
          throw new Error("blocked");
        },
        setItem: vi.fn(),
      },
    });
    expect(catalog.snapshot().storageStatus).toBe("degraded");
  });
});

function customTemplate(id: string, source: string): LearningTemplateDefinition {
  return {
    id,
    version: "1.0.0",
    label: id,
    category: "custom",
    stage: "c.control-flow",
    source,
    description: `Description for ${id}`,
    fragmentKind: "statement",
  };
}

function learningStage(id: string, prerequisites: readonly string[]): LearningStageDefinition {
  return {
    id,
    version: "1.0.0",
    label: id,
    order: 10,
    prerequisites,
    description: id,
  };
}

function memoryStorage(initial: string | null = null): LearningCatalogStorage & {
  value(): string | null;
} {
  let value = initial;
  return {
    getItem(key: string): string | null {
      expect(key).toBe(DEFAULT_LEARNING_CATALOG_STORAGE_KEY);
      return value;
    },
    setItem(key: string, next: string): void {
      expect(key).toBe(DEFAULT_LEARNING_CATALOG_STORAGE_KEY);
      value = next;
    },
    value: () => value,
  };
}

function expectDeepFrozen(value: unknown, seen = new Set<object>()): void {
  if (value === null || typeof value !== "object" || seen.has(value)) return;
  seen.add(value);
  expect(Object.isFrozen(value)).toBe(true);
  for (const nested of Object.values(value)) expectDeepFrozen(nested, seen);
}
