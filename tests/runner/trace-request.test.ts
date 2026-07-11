import { describe, expect, it } from "vitest";
import { validateTraceRequest } from "../../electron/main/runner/trace-request.js";
import { RUNNER_LIMITS } from "../../src/shared/limits.js";
import { fingerprintSource } from "../../src/shared/source-snapshot.js";

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
    });
    expect(Object.isFrozen(result)).toBe(true);
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
  });
});
