import { describe, expect, it } from "vitest";
import { validateTraceRequest } from "../../electron/main/runner/trace-request.js";
import { RUNNER_LIMITS } from "../../src/shared/limits.js";
import { fingerprintSource } from "../../src/shared/source-snapshot.js";
import { FOA_LESSONS } from "../../src/tutorials/foa-catalog.js";

describe("Trace request validation", () => {
  it("binds source, runtime inputs and copied fixtures to one validated request", () => {
    const source = "int main(void) {\n  return 0;\n}";
    const fixture = Uint8Array.from([0, 255]);
    const result = validateTraceRequest(
      {
        source,
        sourceFingerprint: fingerprintSource(source),
        sourceName: "main.c",
        args: ["--case", "one"],
        stdin: "input",
        fixtures: [{ path: "data/input.bin", contents: fixture }],
      },
      RUNNER_LIMITS,
    );

    fixture[0] = 9;
    expect(result).toMatchObject({
      source,
      sourceName: "main.c",
      args: ["--case", "one"],
      stdin: "input",
      fixtures: [{ path: "data/input.bin", contents: Uint8Array.from([0, 255]) }],
      observationProfile: null,
    });
    expect(Object.isFrozen(result)).toBe(true);
  });

  it("resolves a fixed profile only for its complete authored source shape", () => {
    const source = FOA_LESSONS[62]?.code.text;
    if (source === undefined) throw new Error("FOA lesson 63 missing");
    const result = validateTraceRequest(
      {
        source,
        sourceFingerprint: fingerprintSource(source),
        observationProfileId: "foa-transition-63-v1",
      },
      RUNNER_LIMITS,
    );
    expect(result.observationProfile).toMatchObject({
      id: "foa-transition-63-v1",
      probes: [
        { probeId: "foa63.counter.value", lines: [14, 18] },
        { probeId: "foa63.link.target", lines: [17] },
      ],
    });

    const changed = source.replace("struct Counter counter;", "struct Counter counter = {0};");
    expect(() =>
      validateTraceRequest(
        {
          source: changed,
          sourceFingerprint: fingerprintSource(changed),
          observationProfileId: "foa-transition-63-v1",
        },
        RUNNER_LIMITS,
      ),
    ).toThrow(/不完全匹配/u);
  });

  it("rejects unknown fields, NUL and stale fingerprints before native execution", () => {
    const source = "int main(void) { return 0; }";
    expect(() =>
      validateTraceRequest(
        { source, sourceFingerprint: fingerprintSource(source), trusted: true },
        RUNNER_LIMITS,
      ),
    ).toThrow(/字段无效/u);
    expect(() =>
      validateTraceRequest(
        { source: `${source}\0`, sourceFingerprint: fingerprintSource(`${source}\0`) },
        RUNNER_LIMITS,
      ),
    ).toThrow(/NUL/u);
    expect(() =>
      validateTraceRequest({ source, sourceFingerprint: "stale" }, RUNNER_LIMITS),
    ).toThrow(/指纹/u);
    expect(() =>
      validateTraceRequest(
        {
          source,
          sourceFingerprint: fingerprintSource(source),
          observationProfileId: "foa-transition-custom-v1",
        },
        RUNNER_LIMITS,
      ),
    ).toThrow(/observationProfileId/u);
  });
});
