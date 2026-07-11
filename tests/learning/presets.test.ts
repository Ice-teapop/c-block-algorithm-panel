import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { validateLearningTemplateSource } from "../../src/app/learning-template-validator.js";
import type { CParser } from "../../src/core/index.js";
import {
  BUILTIN_LEARNING_TEMPLATES,
  BUILTIN_PRESET_BLOCKS,
  BUILTIN_VIRTUAL_PRESETS,
  createLearningCatalog,
  type LearningTemplateDefinition,
  type PresetSourceBlockDefinition,
} from "../../src/learning/index.js";
import { createTestParser } from "../core/parser-fixture.js";

let parser: CParser;

beforeAll(async () => {
  parser = await createTestParser();
});

afterAll(() => {
  parser.dispose();
});

describe("versioned built-in preset library", () => {
  it("ships at least 72 unique, deeply frozen definitions across every required family", () => {
    expect(BUILTIN_PRESET_BLOCKS.length).toBeGreaterThanOrEqual(72);
    expect(BUILTIN_PRESET_BLOCKS).toHaveLength(
      BUILTIN_LEARNING_TEMPLATES.length + BUILTIN_VIRTUAL_PRESETS.length,
    );

    const ids = BUILTIN_PRESET_BLOCKS.map((preset) => preset.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(BUILTIN_PRESET_BLOCKS.map((preset) => preset.blockKind))).toEqual(
      new Set(["statement", "control", "function", "module", "virtual"]),
    );
    const categories = new Set(BUILTIN_PRESET_BLOCKS.map((preset) => preset.category));
    for (const required of [
      "flow-control",
      "c-basics",
      "functions-io",
      "arrays-strings",
      "pointers-memory",
      "data-structures",
      "algorithm-patterns",
      "testing-analysis",
    ]) {
      expect(categories).toContain(required);
    }

    for (const preset of BUILTIN_PRESET_BLOCKS) {
      expect(preset.id).toMatch(/^builtin\./u);
      expect(preset.version).toMatch(/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/u);
      expect(preset.lifecycle).toBe("active");
      expect(preset.label).not.toBe("");
      expect(preset.description).not.toBe("");
      expect(preset.ports.length).toBeGreaterThan(0);
      expect(new Set(preset.ports.map((port) => port.id)).size).toBe(preset.ports.length);
      expect(preset.explanation.summary).not.toBe("");
      expect(preset.explanation.principle).not.toBe("");
      expect(preset.explanation.whenToUse.length).toBeGreaterThan(0);
      expect(preset.explanation.pitfalls.length).toBeGreaterThan(0);
      expect(preset.scenarios.length).toBeGreaterThan(0);
      expect(Array.isArray(preset.alternatives)).toBe(true);

      if (preset.blockKind === "virtual") {
        expect(preset.source).toBeNull();
        expect(preset.fragmentKind).toBeNull();
        expect(preset.placement.scope).toBe("flow-canvas");
      } else {
        expect(preset.source.trim()).not.toBe("");
        expect(["statement", "control"]).toContain(preset.fragmentKind);
        expect(preset.placement.scope).toBe("function-body");
      }
    }
    expect(BUILTIN_PRESET_BLOCKS.some((preset) => preset.alternatives.length > 0)).toBe(true);
    expectDeepFrozen(BUILTIN_PRESET_BLOCKS);
  });

  it("keeps virtual flow controls source-free and gives legal branches explicit ports", () => {
    for (const id of [
      "builtin.flow.start",
      "builtin.flow.end",
      "builtin.flow.pause",
      "builtin.flow.checkpoint",
      "builtin.flow.merge",
    ]) {
      expect(BUILTIN_VIRTUAL_PRESETS.map((preset) => preset.id)).toContain(id);
    }

    const branch = BUILTIN_PRESET_BLOCKS.find((preset) => preset.id === "builtin.control.if-else");
    if (branch === undefined) throw new Error("missing if-else preset");
    expect(
      branch.ports
        .filter((port) => port.direction === "output" && port.channel === "control")
        .map((port) => port.branch),
    ).toEqual(["true", "false"]);

    const sequential = BUILTIN_PRESET_BLOCKS.find((preset) => preset.id === "builtin.c.increment");
    if (sequential === undefined) throw new Error("missing increment preset");
    expect(
      sequential.ports.filter((port) => port.direction === "output" && port.channel === "control"),
    ).toHaveLength(1);
  });

  it("parses every source-backed preset through the existing single-fragment insertion gate", () => {
    expect(BUILTIN_LEARNING_TEMPLATES.length).toBeGreaterThanOrEqual(67);
    for (const preset of BUILTIN_LEARNING_TEMPLATES) {
      const validated = validateLearningTemplateSource(parser, preset.source);
      expect(validated.fragmentKind, preset.id).toBe(preset.fragmentKind);
      for (const alternative of preset.alternatives) {
        if (alternative.source === null) continue;
        const alternativeResult = validateLearningTemplateSource(parser, alternative.source);
        expect(alternativeResult.fragmentKind, `${preset.id}@${alternative.version}`).toBe(
          preset.fragmentKind,
        );
      }
    }
  });

  it("exposes rich presets without breaking the source-only catalog API", () => {
    const catalog = createLearningCatalog();
    const snapshot = catalog.snapshot();

    expect(snapshot.templates).toHaveLength(BUILTIN_LEARNING_TEMPLATES.length);
    expect(snapshot.presets).toHaveLength(BUILTIN_PRESET_BLOCKS.length);
    expect(catalog.listInstantiable()).toHaveLength(BUILTIN_LEARNING_TEMPLATES.length);
    expect(catalog.listPlaceablePresets()).toHaveLength(BUILTIN_PRESET_BLOCKS.length);

    expect(catalog.getEntry("builtin.flow.pause")).toBeNull();
    expect(catalog.getPreset("builtin.flow.pause")).toMatchObject({
      kind: "virtual-preset",
      blockKind: "virtual",
      source: null,
    });
    expect(catalog.canInstantiate("builtin.flow.pause")).toBe(false);
    expect(catalog.canPlacePreset("builtin.flow.pause")).toBe(true);
    expectDeepFrozen(snapshot);
  });
});

describe("preset lifecycle compatibility", () => {
  it("upgrades a legacy custom template to rich metadata and follows active/deprecated/retired", () => {
    const catalog = createLearningCatalog();
    const legacy: LearningTemplateDefinition = {
      id: "custom.compat.increment",
      version: "1.0.0",
      label: "兼容累加",
      category: "custom",
      stage: "c.basics",
      source: "value++;",
      description: "Legacy source-only input.",
      fragmentKind: "statement",
    };

    const active = catalog.createCustom(legacy);
    expect(active).toMatchObject({
      blockKind: "statement",
      lifecycle: "active",
      placement: { scope: "function-body" },
    });
    expect(active.ports.length).toBeGreaterThan(0);
    expect(active.scenarios.length).toBe(1);
    expect(catalog.canPlacePreset(active.id)).toBe(true);

    const deprecated = catalog.deprecateCustom(active.id, { reason: "Prefer a named step." });
    expect(deprecated.lifecycle).toBe("deprecated");
    expect(catalog.getPreset(active.id)?.lifecycle).toBe("deprecated");
    expect(catalog.canPlacePreset(active.id)).toBe(false);

    catalog.reactivateCustom(active.id);
    const retired = catalog.retireCustom(active.id, { reason: "No longer needed." });
    expect(retired.lifecycle).toBe("retired");
    expect(catalog.getPreset(active.id)).toBeNull();
    expect(catalog.getEntry(active.id)).toEqual(retired);
  });

  it("rejects malformed rich metadata at the catalog boundary", () => {
    const catalog = createLearningCatalog();
    const builtin = BUILTIN_LEARNING_TEMPLATES[0];
    if (builtin === undefined) throw new Error("missing preset fixture");
    const firstPort = builtin.ports[0];
    if (firstPort === undefined) throw new Error("missing preset port fixture");

    const invalid: PresetSourceBlockDefinition = {
      ...builtin,
      id: "custom.invalid.ports",
      ports: [firstPort, firstPort],
    };
    expect(() => catalog.createCustom(invalid)).toThrowError(
      expect.objectContaining({ code: "INVALID_TEMPLATE" }),
    );
  });
});

function expectDeepFrozen(value: unknown, seen = new Set<object>()): void {
  if (value === null || typeof value !== "object" || seen.has(value)) return;
  seen.add(value);
  expect(Object.isFrozen(value)).toBe(true);
  for (const nested of Object.values(value)) expectDeepFrozen(nested, seen);
}
