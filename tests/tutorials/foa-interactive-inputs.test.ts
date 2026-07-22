import { describe, expect, it } from "vitest";
import {
  defaultFoaInteractiveRun,
  evaluateFoaInteractiveInput,
  FOA_INTERACTIVE_INPUT_ORDERS,
  getFoaInteractiveInputDefinition,
  type FoaInteractiveInputDefinition,
  type FoaInteractiveInputResult,
} from "../../src/tutorials/foa-interactive-inputs.js";
import { getFoaSceneProfile } from "../../src/tutorials/foa-scene-profiles.js";

const GROUPS = Object.freeze({
  single: [12, 15, 18, 19, 20, 21, 23, 26, 30, 32, 34, 59],
  pair: [13, 14, 17, 31],
  sequence: [25, 27, 28, 52],
  special: [9, 29, 50],
} as const);

const EXPECTED_ORDERS = Object.freeze(
  Object.values(GROUPS)
    .flat()
    .sort((left, right) => left - right),
);

describe("FOA interactive input registry", () => {
  it("covers exactly the 23 audited lessons in the four migration groups", () => {
    expect(FOA_INTERACTIVE_INPUT_ORDERS).toEqual(EXPECTED_ORDERS);
    expect(new Set(FOA_INTERACTIVE_INPUT_ORDERS).size).toBe(23);

    for (const [group, orders] of Object.entries(GROUPS)) {
      expect(orders.map((order) => requiredDefinition(order).group)).toEqual(
        orders.map(() => group),
      );
    }

    expect(getFoaInteractiveInputDefinition(5)).toBeNull();
    expect(getFoaInteractiveInputDefinition(60)).toBeNull();
  });

  it("changes only the audited profiles while retaining the five established baselines", () => {
    const established = [2, 5, 16, 22, 60];
    const expectedInteractive = [...established, ...EXPECTED_ORDERS].sort(
      (left, right) => left - right,
    );
    const actualInteractive = Array.from({ length: 60 }, (_, index) => index + 1).filter(
      (order) => getFoaSceneProfile(order).caseMode === "interactive",
    );

    expect(actualInteractive).toEqual(expectedInteractive);
  });

  it("evaluates every authored default into an immutable four-event run", () => {
    for (const order of FOA_INTERACTIVE_INPUT_ORDERS) {
      const definition = requiredDefinition(order);
      const run = defaultFoaInteractiveRun(definition);

      expect(run.order).toBe(order);
      expect(run.group).toBe(definition.group);
      expect(run.stdin.length, `lesson ${String(order)} stdin`).toBeGreaterThan(0);
      expect(run.eventDetails, `lesson ${String(order)} events`).toHaveLength(4);
      expect(run.summary.zh.length).toBeGreaterThan(0);
      expect(run.summary.en.length).toBeGreaterThan(0);
      expect(Object.isFrozen(run)).toBe(true);
      expect(Object.isFrozen(run.eventDetails)).toBe(true);
      expect(Object.isFrozen(run.tokens)).toBe(true);
    }
  });

  it("accepts single-value boundaries and rejects values outside the lesson contract", () => {
    expect(success(23, { value: "0" })).toMatchObject({ stdin: "0\n", stdout: "1\n" });
    expect(success(23, { value: "12" })).toMatchObject({
      stdin: "12\n",
      stdout: "479001600\n",
    });
    expect(failure(23, { value: "13" })).toMatchObject({ fieldId: "value" });

    expect(success(34, { value: "-2147483647" }).stdout).toBe("2147483647\n");
    expect(failure(34, { value: "-2147483648" })).toMatchObject({ fieldId: "value" });
  });

  it("preserves C-style pair semantics and visualizes a guarded paired operand", () => {
    expect(success(13, { left: "-7", right: "3" })).toMatchObject({
      stdin: "-7 3\n",
      stdout: "-2 -1\n",
    });
    expect(success(13, { left: "7", right: "0" })).toMatchObject({
      stdout: "",
      exitStatus: 1,
      outcome: "range-rejected",
    });

    expect(success(31, { left: "48", right: "18" }).stdout).toBe("6\n");
    expect(success(31, { left: "0", right: "18" })).toMatchObject({
      stdout: "",
      exitStatus: 1,
      outcome: "range-rejected",
    });
  });

  it("turns learner sequences into runtime evidence and rejects malformed streams", () => {
    expect(success(25, { values: "-1 99" })).toMatchObject({
      stdin: "-1 99\n",
      stdout: "0\n",
      tokens: ["-1", "99"],
    });
    expect(failure(25, { values: "3 4 5" })).toMatchObject({ fieldId: "values" });

    expect(success(52, { count: "0", values: "" })).toMatchObject({
      stdin: "0\n",
      stdout: "0\n",
      tokens: [],
    });
    expect(success(52, { count: "6", values: "" })).toMatchObject({
      stdout: "",
      exitStatus: 1,
    });
    expect(failure(28, { count: "3", values: "3 two 1" })).toMatchObject({ fieldId: "values" });
  });

  it("keeps invalid scanner text as a teachable branch while validating special bounds", () => {
    expect(success(9, { value: "not-a-number" })).toMatchObject({
      stdin: "not-a-number\n",
      stdout: "invalid\n",
    });
    expect(success(50, { value: "11" }).stdout).toBe("22\n");
    expect(failure(9, { value: "" })).toMatchObject({ fieldId: "value" });

    expect(success(29, { value: "0" })).toMatchObject({ stdin: "0\n", stdout: "" });
    expect(success(29, { value: "12" }).tokens).toHaveLength(12);
    expect(failure(29, { value: "13" })).toMatchObject({ fieldId: "value" });
  });

  it("matches scanf prefixes and keeps all arithmetic inside defined C int behaviour", () => {
    expect(success(9, { value: "11x" })).toMatchObject({ stdout: "12\n", outcome: "success" });
    expect(success(50, { value: "11 22" })).toMatchObject({ stdout: "22\n" });
    expect(failure(25, { values: "2147483647 1 -1" })).toMatchObject({
      fieldId: "values",
    });
    expect(failure(27, { count: "2", values: "2147483647 1" })).toMatchObject({
      fieldId: "values",
    });
    expect(success(26, { value: "-2147483648" })).toMatchObject({ stdout: "10\n" });
    expect(success(23, { value: "0" }).eventDetails[2]!.en).toContain("i=2");
    expect(success(30, { value: "1" }).eventDetails[2]!.en).toContain("not prime");
    expect(success(20, { value: "13" })).toMatchObject({ stdout: "31\n" });
    expect(success(59, { value: "7" })).toMatchObject({ stdout: "", exitStatus: 1 });
  });
});

function requiredDefinition(order: number): FoaInteractiveInputDefinition {
  const definition = getFoaInteractiveInputDefinition(order);
  expect(definition, `interactive definition for lesson ${String(order)}`).not.toBeNull();
  return definition!;
}

function evaluate(
  order: number,
  values: Readonly<Record<string, string>>,
): FoaInteractiveInputResult {
  return evaluateFoaInteractiveInput(requiredDefinition(order), values);
}

function success(order: number, values: Readonly<Record<string, string>>) {
  const result = evaluate(order, values);
  expect(result.ok, `lesson ${String(order)} should accept the input`).toBe(true);
  if (!result.ok) throw new Error(result.message.en);
  return result.run;
}

function failure(order: number, values: Readonly<Record<string, string>>) {
  const result = evaluate(order, values);
  expect(result.ok, `lesson ${String(order)} should reject the input`).toBe(false);
  if (result.ok) throw new Error(`FOA lesson ${String(order)} unexpectedly accepted input`);
  expect(result.message.zh.length).toBeGreaterThan(0);
  expect(result.message.en.length).toBeGreaterThan(0);
  return result;
}
