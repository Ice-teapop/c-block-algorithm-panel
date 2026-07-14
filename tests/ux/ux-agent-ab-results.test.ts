import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

type PersonaId = "novice" | "intermediate" | "advanced";

interface PersonaResult {
  readonly taskSuccess: readonly boolean[];
  readonly activationCount: readonly number[];
  readonly wrongActivationCount: readonly number[];
  readonly helpRequestCount: readonly number[];
  readonly clarity1to5: readonly number[];
  readonly extraneousLoad1to5: readonly number[];
}

interface VariantResult {
  readonly label: string;
  readonly extraneousLoadMeasurement: "concurrent" | "retrospective";
  readonly personas: Readonly<Record<PersonaId, PersonaResult>>;
}

interface ExperimentResult {
  readonly schemaVersion: number;
  readonly experimentId: string;
  readonly taskOrder: readonly string[];
  readonly variants: Readonly<Record<"A" | "B", VariantResult>>;
}

const result = JSON.parse(
  readFileSync(new URL("../../benchmarks/ux-agent-ab-results-v1.json", import.meta.url), "utf8"),
) as ExperimentResult;

const personaIds: readonly PersonaId[] = ["novice", "intermediate", "advanced"];

describe("agent UX A/B results", () => {
  it("keeps every metric aligned to the locked 12-task protocol", () => {
    expect(result.schemaVersion).toBe(1);
    expect(result.experimentId).toBe("ux-agent-ab-v1");
    expect(result.taskOrder).toHaveLength(12);
    expect(result.variants.A.extraneousLoadMeasurement).toBe("retrospective");
    expect(result.variants.B.extraneousLoadMeasurement).toBe("concurrent");

    for (const variant of Object.values(result.variants)) {
      for (const persona of personaIds.map((id) => variant.personas[id])) {
        expect(persona.taskSuccess).toHaveLength(12);
        expect(persona.activationCount).toHaveLength(12);
        expect(persona.wrongActivationCount).toHaveLength(12);
        expect(persona.helpRequestCount).toHaveLength(12);
        expect(persona.clarity1to5).toHaveLength(12);
        expect(persona.extraneousLoad1to5).toHaveLength(12);
        expect(persona.clarity1to5.every((value) => value >= 1 && value <= 5)).toBe(true);
        expect(persona.extraneousLoad1to5.every((value) => value >= 1 && value <= 5)).toBe(true);
      }
    }
  });

  it("accepts B only when every locked decision rule passes", () => {
    for (const personaId of personaIds) {
      expect(successCount(result.variants.B.personas[personaId])).toBeGreaterThanOrEqual(
        successCount(result.variants.A.personas[personaId]),
      );
    }

    const aFriction = frictionCount(result.variants.A);
    const bFriction = frictionCount(result.variants.B);
    expect(aFriction).toBe(21);
    expect(bFriction).toBe(9);
    expect((aFriction - bFriction) / aFriction).toBeGreaterThanOrEqual(0.15);

    const aAdvancedMedian = median(result.variants.A.personas.advanced.activationCount);
    const bAdvancedMedian = median(result.variants.B.personas.advanced.activationCount);
    expect(bAdvancedMedian).toBeLessThanOrEqual(aAdvancedMedian + 1);
  });

  it("records the reviewed aggregate without inflating the synthetic sample", () => {
    expect(totalSuccess(result.variants.A)).toBe(34);
    expect(totalSuccess(result.variants.B)).toBe(36);
    expect(sumMetric(result.variants.A, "activationCount")).toBe(82);
    expect(sumMetric(result.variants.B, "activationCount")).toBe(79);
    expect(meanMetric(result.variants.A, "clarity1to5")).toBeCloseTo(3.83, 2);
    expect(meanMetric(result.variants.B, "clarity1to5")).toBeCloseTo(4.25, 2);
    expect(meanMetric(result.variants.A, "extraneousLoad1to5")).toBeCloseTo(2.67, 2);
    expect(meanMetric(result.variants.B, "extraneousLoad1to5")).toBeCloseTo(2.14, 2);
  });
});

function successCount(persona: PersonaResult): number {
  return persona.taskSuccess.filter(Boolean).length;
}

function totalSuccess(variant: VariantResult): number {
  return personaIds.reduce((total, id) => total + successCount(variant.personas[id]), 0);
}

function frictionCount(variant: VariantResult): number {
  return sumMetric(variant, "wrongActivationCount") + sumMetric(variant, "helpRequestCount");
}

function sumMetric(
  variant: VariantResult,
  key: Exclude<keyof PersonaResult, "taskSuccess">,
): number {
  return personaIds.reduce(
    (total, id) => total + variant.personas[id][key].reduce((sum, value) => sum + value, 0),
    0,
  );
}

function meanMetric(variant: VariantResult, key: "clarity1to5" | "extraneousLoad1to5"): number {
  return sumMetric(variant, key) / (personaIds.length * 12);
}

function median(values: readonly number[]): number {
  const ordered = [...values].sort((left, right) => left - right);
  const middle = ordered.length / 2;
  return (ordered[middle - 1]! + ordered[middle]!) / 2;
}
