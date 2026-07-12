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
    expect(provider.get("scenario.searching.maximum")).toMatchObject({
      family: "searching",
      label: "线性扫描最大值",
      sizeGenerator: {
        minimum: 1,
        maximum: 1024,
        defaultSizes: [8, 32, 128],
      },
    });
    expect(provider.generate("scenario.searching.maximum", 1)).toMatchObject({
      stdin: "1\n42\n",
      expected: { stdout: "42\n" },
    });
    expect(provider.generate("scenario.searching.maximum", 4)).toMatchObject({
      stdin: "4\n-9 -4 -12 -7\n",
      expected: { stdout: "-4\n" },
    });
    expect(provider.generate("scenario.searching.maximum", 5)).toMatchObject({
      stdin: "5\n3 8 2 7 4\n",
      expected: { stdout: "8\n" },
    });
    expect(provider.generate("scenario.searching.maximum", 6)).toMatchObject({
      stdin: "6\n-6 1 -8 3 -10 5\n",
      expected: { stdout: "5\n" },
    });
    expect(provider.generate("scenario.searching.minimum", 1)).toMatchObject({
      stdin: "1\n42\n",
      expected: { stdout: "42\n" },
    });
    expect(provider.generate("scenario.searching.minimum", 4)).toMatchObject({
      stdin: "4\n-9 -4 -12 -7\n",
      expected: { stdout: "-12\n" },
    });
    expect(provider.generate("scenario.searching.minimum", 5)).toMatchObject({
      stdin: "5\n3 8 2 7 4\n",
      expected: { stdout: "2\n" },
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

  it("gives maximum defaults negative values and both comparison outcomes", () => {
    const provider = createBuiltinScenarioProvider();
    const scenario = provider.get("scenario.searching.maximum");
    if (scenario === null) throw new Error("missing maximum scenario");

    for (const size of scenario.sizeGenerator.defaultSizes) {
      const generated = provider.generate(scenario.id, size);
      const tokens = generated.stdin.trim().split(/\s+/u).map(Number);
      const count = tokens[0];
      const values = tokens.slice(1);
      expect(count).toBe(size);
      expect(values).toHaveLength(size);
      expect(values.some((value) => value < 0)).toBe(true);

      let maximum = values[0]!;
      let updates = 0;
      let keeps = 0;
      for (const value of values.slice(1)) {
        if (value > maximum) {
          maximum = value;
          updates += 1;
        } else {
          keeps += 1;
        }
      }
      expect(updates).toBeGreaterThan(0);
      expect(keeps).toBeGreaterThan(0);
      expect(generated.expected.stdout).toBe(`${String(maximum)}\n`);
    }
  });

  it("gives minimum defaults both comparison outcomes", () => {
    const provider = createBuiltinScenarioProvider();
    const scenario = provider.get("scenario.searching.minimum");
    if (scenario === null) throw new Error("missing minimum scenario");

    for (const size of scenario.sizeGenerator.defaultSizes) {
      const generated = provider.generate(scenario.id, size);
      const tokens = generated.stdin.trim().split(/\s+/u).map(Number);
      const values = tokens.slice(1);
      let minimum = values[0]!;
      let updates = 0;
      let keeps = 0;
      for (const value of values.slice(1)) {
        if (value < minimum) {
          minimum = value;
          updates += 1;
        } else {
          keeps += 1;
        }
      }
      expect(updates).toBeGreaterThan(0);
      expect(keeps).toBeGreaterThan(0);
      expect(generated.expected.stdout).toBe(`${String(minimum)}\n`);
    }
  });

  it("rejects unknown scenarios and out-of-range sizes", () => {
    const provider = createBuiltinScenarioProvider();
    expect(provider.get("scenario.missing")).toBeNull();
    expect(() => provider.generate("scenario.missing", 1)).toThrow(RangeError);
    expect(() => provider.generate("scenario.recursion.factorial", 13)).toThrow(RangeError);
    expect(() => provider.generate("scenario.sorting.integers", 1.5)).toThrow(RangeError);
    expect(() => provider.generate("scenario.searching.maximum", 0)).toThrow(RangeError);
    expect(() => provider.generate("scenario.searching.maximum", 1025)).toThrow(RangeError);
    expect(() => provider.generate("scenario.searching.minimum", 0)).toThrow(RangeError);
  });
});

function expectDeepFrozen(value: unknown, seen = new Set<object>()): void {
  if (value === null || typeof value !== "object" || seen.has(value)) return;
  seen.add(value);
  expect(Object.isFrozen(value)).toBe(true);
  for (const nested of Object.values(value)) expectDeepFrozen(nested, seen);
}
