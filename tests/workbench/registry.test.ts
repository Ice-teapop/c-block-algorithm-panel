import { describe, expect, it } from "vitest";
import type { WorkbenchModuleDefinition } from "../../src/workbench/contracts.js";
import {
  BUILTIN_WORKBENCH_MODULES,
  createBuiltinWorkbenchRegistry,
} from "../../src/workbench/builtin-modules.js";
import {
  WorkbenchModuleRegistry,
  WorkbenchRegistryConflictError,
} from "../../src/workbench/registry.js";

describe("WorkbenchModuleRegistry", () => {
  it("produces the same stably sorted snapshot regardless of registration order", () => {
    const alpha = moduleDefinition("module.alpha", {
      capabilities: ["source.edit", "inspector.open"],
      views: [{ id: "view.zeta", label: "Zeta", order: 20 }],
      commands: [{ id: "command.zeta", label: "Zeta", order: 20 }],
      elements: [
        {
          type: "control.loop",
          version: "1.1.0",
          label: "Loop",
          category: "control",
        },
      ],
    });
    const zeta = moduleDefinition("module.zeta", {
      capabilities: ["source.inspect"],
      views: [{ id: "view.alpha", label: "Alpha", order: 10 }],
      commands: [{ id: "command.alpha", label: "Alpha", order: 10 }],
      elements: [
        {
          type: "data.array",
          version: "2.0.0",
          label: "Array",
          category: "data",
        },
      ],
    });

    const forward = new WorkbenchModuleRegistry().registerAll([alpha, zeta]).snapshot();
    const reverse = new WorkbenchModuleRegistry().registerAll([zeta, alpha]).snapshot();

    expect(reverse).toEqual(forward);
    expect(forward.modules.map(({ manifest }) => manifest.id)).toEqual([
      "module.alpha",
      "module.zeta",
    ]);
    expect(forward.inspectorViews.map(({ id }) => id)).toEqual(["view.alpha", "view.zeta"]);
    expect(forward.commands.map(({ id }) => id)).toEqual(["command.alpha", "command.zeta"]);
    expect(forward.algorithmElements.map(({ type }) => type)).toEqual([
      "control.loop",
      "data.array",
    ]);
    expect(forward.capabilities).toEqual(["inspector.open", "source.edit", "source.inspect"]);
  });

  it.each([
    ["module-id", moduleDefinition("module.base")],
    [
      "inspector-view-id",
      moduleDefinition("module.other", {
        views: [{ id: "view.base", label: "Other", order: 30 }],
      }),
    ],
    [
      "command-id",
      moduleDefinition("module.other", {
        commands: [{ id: "command.base", label: "Other", order: 30 }],
      }),
    ],
    [
      "algorithm-element-type",
      moduleDefinition("module.other", {
        elements: [
          {
            type: "control.base",
            version: "1.0.0",
            label: "Other",
            category: "control",
          },
        ],
      }),
    ],
  ] as const)("rejects duplicate %s without partially mutating the registry", (kind, conflict) => {
    const registry = new WorkbenchModuleRegistry().register(
      moduleDefinition("module.base", {
        views: [{ id: "view.base", label: "Base", order: 10 }],
        commands: [{ id: "command.base", label: "Base", order: 10 }],
        elements: [
          {
            type: "control.base",
            version: "1.0.0",
            label: "Base",
            category: "control",
          },
        ],
      }),
    );
    const before = registry.snapshot();

    expect(() => registry.registerAll([moduleDefinition("module.pending"), conflict])).toThrowError(
      expect.objectContaining<Partial<WorkbenchRegistryConflictError>>({
        name: "WorkbenchRegistryConflictError",
        kind,
      }),
    );
    expect(registry.snapshot()).toEqual(before);
    expect(registry.hasModule("module.pending")).toBe(false);
  });

  it("snapshots caller input and deeply freezes every exported level", () => {
    const mutableCapabilities = ["source.inspect"];
    const mutableViews = [{ id: "view.inspect", label: "Inspect", order: 10 }];
    const input: WorkbenchModuleDefinition = {
      manifest: {
        id: "module.inspect",
        version: "1.0.0",
        label: "Inspect",
        capabilities: mutableCapabilities,
      },
      inspectorViews: mutableViews,
    };
    const registry = new WorkbenchModuleRegistry().register(input);

    mutableCapabilities.push("source.mutated");
    mutableViews[0]!.label = "Mutated";
    const snapshot = registry.snapshot();

    expect(snapshot.capabilities).toEqual(["source.inspect"]);
    expect(snapshot.inspectorViews[0]?.label).toBe("Inspect");
    expectDeepFrozen(snapshot);
    expectDeepFrozen(registry.findModulesByCapability("source.inspect"));
  });

  it("queries modules by exact capability and publishes the three built-in inspector views", () => {
    const registry = createBuiltinWorkbenchRegistry();
    const snapshot = registry.snapshot();

    expect(BUILTIN_WORKBENCH_MODULES).toHaveLength(3);
    expect(snapshot.inspectorViews).toEqual([
      expect.objectContaining({ id: "explanation", label: "解释", order: 10 }),
      expect.objectContaining({ id: "edit", label: "编辑", order: 20 }),
      expect.objectContaining({ id: "run", label: "运行", order: 30 }),
    ]);
    expect(
      registry.findModulesByCapability("inspector.editing").map(({ manifest }) => manifest.id),
    ).toEqual(["builtin.inspector.editing"]);
    expect(registry.findModulesByCapability("inspector.unknown")).toEqual([]);
    expect(registry.hasCapability("inspector.execution")).toBe(true);
    expect(registry.hasCapability("inspector.unknown")).toBe(false);
  });
});

interface ModuleOptions {
  readonly capabilities?: readonly string[];
  readonly views?: WorkbenchModuleDefinition["inspectorViews"];
  readonly commands?: WorkbenchModuleDefinition["commands"];
  readonly elements?: WorkbenchModuleDefinition["algorithmElements"];
}

function moduleDefinition(id: string, options: ModuleOptions = {}): WorkbenchModuleDefinition {
  return {
    manifest: {
      id,
      version: "1.0.0",
      label: id,
      capabilities: options.capabilities ?? [],
    },
    inspectorViews: options.views ?? [],
    commands: options.commands ?? [],
    algorithmElements: options.elements ?? [],
  };
}

function expectDeepFrozen(value: unknown, seen = new Set<object>()): void {
  if (value === null || typeof value !== "object" || seen.has(value)) return;
  seen.add(value);
  expect(Object.isFrozen(value)).toBe(true);
  for (const nested of Object.values(value)) {
    expectDeepFrozen(nested, seen);
  }
}
