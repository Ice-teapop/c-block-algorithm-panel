import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { verifyTutorialSourceRequirements } from "../../src/app/runtime-workspace-controller.js";
import { FOA_LESSONS } from "../../src/tutorials/foa-curriculum.js";
import { createFoaWorkspaceCanonicalSolution } from "../fixtures/foa-workspace-solutions.js";

const clangAvailable = spawnSync("clang", ["--version"], { encoding: "utf8" }).status === 0;
const root = clangAvailable ? mkdtempSync(join(tmpdir(), "algolatch-foa-programs-")) : null;

afterAll(() => {
  if (root !== null) rmSync(root, { recursive: true, force: true });
});

describe.skipIf(!clangAvailable)("FOA runnable lesson programs", () => {
  for (const lesson of FOA_LESSONS) {
    it(`${lesson.id} compiles and produces its documented output`, () => {
      if (root === null) throw new Error("clang test root is unavailable");
      const sourcePath = join(root, `${String(lesson.order).padStart(3, "0")}.c`);
      const executablePath = join(
        root,
        `${String(lesson.order).padStart(3, "0")}${process.platform === "win32" ? ".exe" : ""}`,
      );
      writeFileSync(sourcePath, lesson.code.text, "utf8");
      const compiled = spawnSync("clang", ["-std=c11", "-O0", sourcePath, "-o", executablePath], {
        encoding: "utf8",
        timeout: 10_000,
      });
      expect(compiled.status, `${lesson.id}\n${compiled.stderr}`).toBe(0);
      const run = spawnSync(executablePath, [], {
        input: lesson.case.stdin,
        encoding: "utf8",
        timeout: 5_000,
      });
      expect(run.status, `${lesson.id}\n${run.stderr}`).toBe(0);
      expect(run.stdout.replaceAll("\r\n", "\n"), lesson.id).toBe(lesson.case.stdout);
    }, 15_000);
  }

  for (const lesson of FOA_LESSONS.slice(105)) {
    it(`${lesson.id} canonical workspace solution passes all fixed cases and requirements`, () => {
      if (root === null || lesson.workspaceExercise === null) {
        throw new Error("FOA workspace exercise is unavailable");
      }
      const exercise = lesson.workspaceExercise;
      const canonicalSource = createFoaWorkspaceCanonicalSolution(
        lesson.order,
        exercise.initialSource,
      );
      const sourcePath = join(root, `solution-${String(lesson.order)}.c`);
      const executablePath = join(
        root,
        `solution-${String(lesson.order)}${process.platform === "win32" ? ".exe" : ""}`,
      );
      writeFileSync(sourcePath, canonicalSource, "utf8");
      const compiled = spawnSync("clang", ["-std=c11", "-O0", sourcePath, "-o", executablePath], {
        encoding: "utf8",
        timeout: 10_000,
      });
      expect(compiled.status, `${lesson.id}\n${compiled.stderr}`).toBe(0);
      for (const runtimeCase of exercise.cases) {
        const run = spawnSync(executablePath, [], {
          input: runtimeCase.stdin,
          encoding: "utf8",
          timeout: 5_000,
        });
        expect(run.status, `${lesson.id} ${runtimeCase.id}\n${run.stderr}`).toBe(0);
        expect(run.stdout.replaceAll("\r\n", "\n"), `${lesson.id} ${runtimeCase.id}`).toBe(
          runtimeCase.stdout,
        );
      }
      expect(
        verifyTutorialSourceRequirements(canonicalSource, exercise.sourceRequirements),
        `${lesson.id} canonical source requirements`,
      ).toEqual(exercise.sourceRequirements.map((requirement) => requirement.id));
    }, 15_000);
  }

  for (const lesson of FOA_LESSONS.slice(105)) {
    it(`${lesson.id} starts from a compilable independent scaffold`, () => {
      if (root === null || lesson.workspaceExercise === null) {
        throw new Error("FOA workspace scaffold is unavailable");
      }
      const sourcePath = join(root, `scaffold-${String(lesson.order)}.c`);
      const executablePath = join(
        root,
        `scaffold-${String(lesson.order)}${process.platform === "win32" ? ".exe" : ""}`,
      );
      writeFileSync(sourcePath, lesson.workspaceExercise.initialSource, "utf8");
      const compiled = spawnSync("clang", ["-std=c11", "-O0", sourcePath, "-o", executablePath], {
        encoding: "utf8",
        timeout: 10_000,
      });
      expect(compiled.status, `${lesson.id}\n${compiled.stderr}`).toBe(0);
    }, 15_000);
  }
});
