import { describe, expect, it } from "vitest";
import { getFoaWorkspaceExercise } from "../../src/tutorials/foa-workspace-exercises.js";
import { createFoaWorkspaceCanonicalSolution } from "../fixtures/foa-workspace-solutions.js";

describe("FOA workspace exercise 119", () => {
  it("teaches the assert/index boundary instead of an unrelated accumulation task", () => {
    const exercise = getFoaWorkspaceExercise(119);
    expect(exercise).not.toBeNull();
    if (exercise === null) throw new Error("FOA workspace exercise 119 is missing");

    expect(exercise.initialSource).toContain("checked_value");
    expect(exercise.initialSource).toContain("index < 0 || index >= length");
    expect(exercise.initialSource).toContain("#ifdef NDEBUG");
    expect(exercise.initialSource).not.toContain("checked_sum");

    expect(exercise.cases.map(({ stdin, stdout }) => ({ stdin, stdout }))).toEqual([
      { stdin: "3 1\n10 20 30\n", stdout: "safe 20 assertions=on\n" },
      { stdin: "3 2\n10 20 30\n", stdout: "safe 30 assertions=on\n" },
      { stdin: "3 3\n10 20 30\n", stdout: "input-error assertions=on\n" },
    ]);

    expect(exercise.sourceRequirements.map(({ id }) => id)).toEqual([
      "index-invariant",
      "input-index-validation",
      "indexed-read",
    ]);

    const canonical = createFoaWorkspaceCanonicalSolution(119, exercise.initialSource);
    expect(canonical).toContain("assert(index >= 0 && index < length);");
    expect(canonical).toContain("return values[index];");
  });
});
