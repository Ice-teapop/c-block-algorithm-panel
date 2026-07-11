import { describe, expect, it } from "vitest";
import {
  BUILTIN_ALGORITHM_SCENARIOS,
  createBuiltinScenarioProvider,
} from "../../src/mentor/index.js";

describe("offline algorithm scenario provider", () => {
  it("covers the required undergraduate families with versioned deterministic cases", () => {
    const provider = createBuiltinScenarioProvider();
    expect(provider).toMatchObject({
      id: "builtin.local-scenarios",
      version: "1.0.0",
      networkAccess: "none",
    });
    expect(new Set(provider.list().map((scenario) => scenario.family))).toEqual(
      new Set([
        "sorting",
        "searching",
        "recursion",
        "linked-list",
        "tree",
        "graph",
        "dynamic-programming",
      ]),
    );
    expect(provider.list()).toEqual(BUILTIN_ALGORITHM_SCENARIOS);

    for (const scenario of provider.list()) {
      expect(scenario.version).toMatch(/^\d+\.\d+\.\d+$/u);
      expect(scenario.example.stdin).not.toBe("");
      expect(Array.isArray(scenario.example.arguments)).toBe(true);
      expect(scenario.example.expected.stdout).not.toBe("");
      expect(scenario.sizeGenerator.defaultSizes.length).toBeGreaterThanOrEqual(3);
      for (const size of scenario.sizeGenerator.defaultSizes) {
        const first = provider.generate(scenario.id, size);
        const second = provider.generate(scenario.id, size);
        expect(first).toEqual(second);
        expect(first).toMatchObject({
          scenarioId: scenario.id,
          scenarioVersion: scenario.version,
          size,
        });
        expectDeepFrozen(first);
      }
    }
    expectDeepFrozen(provider.list());
  });

  it("produces known expected outputs for representative cases", () => {
    const provider = createBuiltinScenarioProvider();
    expect(provider.generate("scenario.sorting.integers", 4)).toMatchObject({
      stdin: "4\n4 3 2 1\n",
      expected: { stdout: "1 2 3 4\n" },
    });
    expect(provider.generate("scenario.searching.linear", 4)).toMatchObject({
      expected: { stdout: "3\n" },
    });
    expect(provider.generate("scenario.recursion.factorial", 5)).toMatchObject({
      expected: { stdout: "120\n" },
    });
    expect(provider.generate("scenario.dynamic-programming.fibonacci", 10)).toMatchObject({
      expected: { stdout: "55\n" },
    });
    expect(provider.generate("scenario.graph.bfs-chain", 4)).toMatchObject({
      stdin: "4 3\n0 1\n1 2\n2 3\n",
      expected: { stdout: "0 1 2 3\n" },
    });
  });

  it("rejects unknown scenarios and out-of-range sizes", () => {
    const provider = createBuiltinScenarioProvider();
    expect(provider.get("scenario.missing")).toBeNull();
    expect(() => provider.generate("scenario.missing", 1)).toThrow(RangeError);
    expect(() => provider.generate("scenario.recursion.factorial", 13)).toThrow(RangeError);
    expect(() => provider.generate("scenario.sorting.integers", 1.5)).toThrow(RangeError);
  });
});

function expectDeepFrozen(value: unknown, seen = new Set<object>()): void {
  if (value === null || typeof value !== "object" || seen.has(value)) return;
  seen.add(value);
  expect(Object.isFrozen(value)).toBe(true);
  for (const nested of Object.values(value)) expectDeepFrozen(nested, seen);
}
