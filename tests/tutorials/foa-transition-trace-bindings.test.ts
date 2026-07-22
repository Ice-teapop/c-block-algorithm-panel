import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { instrumentTraceSource } from "../../electron/main/runner/trace-instrumentation.js";
import { fingerprintSource } from "../../src/shared/source-snapshot.js";
import type { FoaTransitionRealTraceProvenance } from "../../src/tutorials/foa-transition-runtime-63-70.js";
import type { FoaTransitionRuntime7580RealTraceProvenance } from "../../src/tutorials/foa-transition-runtime-75-80.js";
import {
  createFoaTransitionTraceBinding63,
  createFoaTransitionTraceBinding70,
  createFoaTransitionTraceBinding75,
  createFoaTransitionTraceBinding80,
  FOA_TRANSITION_TRACE_PROFILE_IDS,
  type FoaTransitionTraceBinding63,
  type FoaTransitionTraceBinding70,
  type FoaTransitionTraceBinding75,
  type FoaTransitionTraceBinding80,
} from "../../src/tutorials/foa-transition-trace-bindings.js";

const clangAvailable = spawnSync("clang", ["--version"], { encoding: "utf8" }).status === 0;
const compileRoot = clangAvailable
  ? mkdtempSync(join(tmpdir(), "algolatch-foa-transition-bindings-"))
  : null;

afterAll(() => {
  if (compileRoot !== null) rmSync(compileRoot, { recursive: true, force: true });
});

describe("FOA transition trace bindings", () => {
  it("binds the four fixed profile IDs to normalized default inputs and teaching models", () => {
    const bindings = [
      createFoaTransitionTraceBinding63(),
      createFoaTransitionTraceBinding70(),
      createFoaTransitionTraceBinding75(),
      createFoaTransitionTraceBinding80(),
    ] as const;

    expect(bindings.map(({ profileId }) => profileId)).toEqual([
      "foa-transition-63-v1",
      "foa-transition-70-v1",
      "foa-transition-75-v1",
      "foa-transition-80-v1",
    ]);
    expect(bindings.map(({ stdin }) => stdin)).toEqual([
      "4\n",
      "5\n1 3 5 7 9\n7\n",
      "4\n",
      "1 1 0\n0 1 1\n0 0 1\n",
    ]);
    expect(bindings.map(({ expectedStdout }) => expectedStdout)).toEqual([
      "5\n",
      "3\n",
      "15\n",
      "1\n",
    ]);
    expect(FOA_TRANSITION_TRACE_PROFILE_IDS).toEqual({
      63: "foa-transition-63-v1",
      70: "foa-transition-70-v1",
      75: "foa-transition-75-v1",
      80: "foa-transition-80-v1",
    });

    for (const binding of bindings) {
      expect(binding.evidenceBinding).toEqual({
        teachingModelProvenance: "teaching-model",
        upgradeProvenance: "real-trace",
        requiredProvenanceFields: [
          "sessionId",
          "sourceFingerprint",
          "inputDigest",
          "inputFingerprint",
          "observationProfileId",
          "observationAuthorizationDigest",
        ],
      });
      expect(Object.isFrozen(binding)).toBe(true);
      expect(Object.isFrozen(binding.modelInput)).toBe(true);
      expect(Object.isFrozen(binding.requiredProbeIds)).toBe(true);
    }
  });

  it("normalizes learner variants without rewriting the fixed course source", () => {
    const defaults = defaultBindings();
    const variants = [
      createFoaTransitionTraceBinding63(-9),
      createFoaTransitionTraceBinding70([-2, 0, 0, 5], 0),
      createFoaTransitionTraceBinding75(0),
      createFoaTransitionTraceBinding80([
        [1, 1, 1],
        [1, 1, 1],
        [1, 1, 1],
      ]),
    ] as const;

    expect(variants.map(({ stdin }) => stdin)).toEqual([
      "-9\n",
      "4\n-2 0 0 5\n0\n",
      "0\n",
      "1 1 1\n1 1 1\n1 1 1\n",
    ]);
    expect(variants.map(({ expectedStdout }) => expectedStdout)).toEqual([
      "-8\n",
      "1\n",
      "0\n",
      "6\n",
    ]);
    expect(variants.map(({ source }) => source)).toEqual(defaults.map(({ source }) => source));
    expect(variants[1].modelInput).toEqual({ values: [-2, 0, 0, 5], target: 0 });
    expect(Object.isFrozen(variants[1].modelInput.values)).toBe(true);
    expect(Object.isFrozen(variants[3].modelInput.openGrid[0])).toBe(true);
  });

  it("publishes the profile-authorized probe IDs in a stable order", () => {
    expect(createFoaTransitionTraceBinding63().requiredProbeIds).toEqual([
      "foa63.counter.value",
      "foa63.link.target",
    ]);
    expect(createFoaTransitionTraceBinding70().requiredProbeIds).toEqual([
      "foa70.low",
      "foa70.high",
      "foa70.mid",
      "foa70.values.at-mid",
      "foa70.compare",
    ]);
    expect(createFoaTransitionTraceBinding75().requiredProbeIds).toEqual(["foa75.moves"]);
    expect(createFoaTransitionTraceBinding80().requiredProbeIds).toEqual([
      "foa80.open.cell",
      "foa80.paths.read-above",
      "foa80.paths.read-left",
      "foa80.paths.write",
    ]);
  });

  it("keeps real-trace provenance explicit while all creators remain teaching models", () => {
    const provenance63: FoaTransitionRealTraceProvenance = Object.freeze({
      kind: "real-trace",
      sessionId: "trace-63",
      sourceFingerprint: "source-63",
      inputDigest: "input-63",
      inputFingerprint: "executed-input-63",
      observationProfileId: "foa-transition-63-v1",
      observationAuthorizationDigest: "a".repeat(64),
    });
    const provenance75: FoaTransitionRuntime7580RealTraceProvenance = Object.freeze({
      kind: "real-trace",
      lessonId: "tutorial.foa.c09.l075",
      caseId: "moves-4",
      sessionId: "trace-75",
      sourceFingerprint: "source-75",
      inputDigest: "input-75",
      inputFingerprint: "executed-input-75",
      observationProfileId: "foa-transition-75-v1",
      observationAuthorizationDigest: "b".repeat(64),
      notice: Object.freeze({ zh: "真实 Trace", en: "Real Trace" }),
    });

    expect(provenance63.kind).toBe("real-trace");
    expect(provenance75.inputDigest).toBe("input-75");
    expect(createFoaTransitionTraceBinding63().model.evidence.provenance).toBe("teaching-model");
    expect(createFoaTransitionTraceBinding75().model.provenance.kind).toBe("teaching-model");
  });

  it("keeps all four generated course sources inside the conservative Trace subset", () => {
    for (const binding of defaultBindings()) {
      const result = instrumentTraceSource(
        binding.source,
        fingerprintSource(binding.source),
        `lesson-${String(binding.lessonOrder)}.c`,
        "0123456789abcdef",
      );
      expect(result, `lesson ${String(binding.lessonOrder)}`).toMatchObject({ ok: true });
      if (!result.ok) throw new Error(result.reason.message);
      expect(result.value.instrumentedLines.length).toBeGreaterThan(0);
    }
  });
});

describe.skipIf(!clangAvailable)("FOA transition trace binding source execution", () => {
  it("feeds default and variant inputs through the real C process", () => {
    const bindingPairs = [
      [createFoaTransitionTraceBinding63(), createFoaTransitionTraceBinding63(-9)],
      [createFoaTransitionTraceBinding70(), createFoaTransitionTraceBinding70([-2, 0, 0, 5], 0)],
      [createFoaTransitionTraceBinding75(), createFoaTransitionTraceBinding75(0)],
      [
        createFoaTransitionTraceBinding80(),
        createFoaTransitionTraceBinding80([
          [1, 1, 1],
          [1, 1, 1],
          [1, 1, 1],
        ]),
      ],
    ] as const;

    for (const [defaultBinding, variantBinding] of bindingPairs) {
      const executablePath = compileCourseSource(defaultBinding);
      for (const binding of [defaultBinding, variantBinding]) {
        const run = spawnSync(executablePath, [], {
          input: binding.stdin,
          encoding: "utf8",
          timeout: 5_000,
        });
        expect(run.status, `${binding.profileId}\n${run.stderr}`).toBe(0);
        expect(run.stdout.replaceAll("\r\n", "\n"), binding.profileId).toBe(binding.expectedStdout);
      }
    }
  });
});

type AnyBinding =
  | FoaTransitionTraceBinding63
  | FoaTransitionTraceBinding70
  | FoaTransitionTraceBinding75
  | FoaTransitionTraceBinding80;

function defaultBindings(): readonly [
  FoaTransitionTraceBinding63,
  FoaTransitionTraceBinding70,
  FoaTransitionTraceBinding75,
  FoaTransitionTraceBinding80,
] {
  return [
    createFoaTransitionTraceBinding63(),
    createFoaTransitionTraceBinding70(),
    createFoaTransitionTraceBinding75(),
    createFoaTransitionTraceBinding80(),
  ];
}

function compileCourseSource(binding: AnyBinding): string {
  if (compileRoot === null) throw new Error("clang compile root is unavailable");
  const sourcePath = join(compileRoot, `${binding.profileId}.c`);
  const executablePath = join(compileRoot, binding.profileId);
  writeFileSync(sourcePath, binding.source, "utf8");
  const compiled = spawnSync("clang", ["-std=c11", "-O0", sourcePath, "-o", executablePath], {
    encoding: "utf8",
    timeout: 10_000,
  });
  expect(compiled.status, `${binding.profileId}\n${compiled.stderr}`).toBe(0);
  return executablePath;
}
