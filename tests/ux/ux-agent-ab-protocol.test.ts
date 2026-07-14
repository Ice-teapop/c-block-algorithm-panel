import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

interface Persona {
  readonly id: string;
  readonly sampleTaskCountPerVariant: number;
  readonly priorKnowledge: readonly string[];
  readonly excludedKnowledge: readonly string[];
}

interface Experiment {
  readonly schemaVersion: number;
  readonly evidenceKind: string;
  readonly limitations: readonly string[];
  readonly variants: Readonly<Record<string, string>>;
  readonly personas: readonly Persona[];
  readonly tasks: readonly { readonly id: string }[];
  readonly metrics: readonly string[];
  readonly scale: {
    readonly observationsPerVariant: number;
    readonly totalObservationCells: number;
  };
  readonly decisionRules: readonly string[];
}

const experiment = JSON.parse(
  readFileSync(new URL("../../benchmarks/ux-agent-ab-v1.json", import.meta.url), "utf8"),
) as Experiment;

describe("agent UX A/B protocol", () => {
  it("locks knowledge strata, tasks, scale, metrics, and limitations", () => {
    expect(experiment.schemaVersion).toBe(1);
    expect(experiment.evidenceKind).toBe("agent-cognitive-walkthrough");
    expect(experiment.personas.map(({ id }) => id)).toEqual(["novice", "intermediate", "advanced"]);
    expect(
      experiment.personas.every(
        ({ sampleTaskCountPerVariant }) => sampleTaskCountPerVariant === 12,
      ),
    ).toBe(true);
    expect(
      experiment.personas.every(
        ({ priorKnowledge, excludedKnowledge }) =>
          priorKnowledge.length > 0 && excludedKnowledge.length > 0,
      ),
    ).toBe(true);
    expect(experiment.tasks).toHaveLength(12);
    expect(new Set(experiment.tasks.map(({ id }) => id)).size).toBe(12);
    expect(experiment.variants).toEqual({
      A: "current-single-primary-v1",
      B: "contextual-wire-guidance-v1",
    });
    expect(experiment.scale).toMatchObject({
      observationsPerVariant: 36,
      totalObservationCells: 72,
    });
    expect(experiment.metrics).toEqual([
      "taskSuccess",
      "activationCount",
      "wrongActivationCount",
      "helpRequestCount",
      "clarity1to5",
      "extraneousLoad1to5",
    ]);
    expect(experiment.limitations.join(" ")).toMatch(/not an independent human|cannot establish/iu);
    expect(experiment.decisionRules).toHaveLength(4);
  });
});
