import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { instrumentTraceSource } from "../../electron/main/runner/trace-instrumentation.js";
import { resolveTraceObservationProfile } from "../../electron/main/runner/trace-observation-profiles.js";
import { TraceProtocolParser } from "../../electron/main/runner/trace-session.js";
import { fingerprintSource } from "../../src/shared/source-snapshot.js";
import type { TraceEvent, TraceRunEvidence } from "../../src/shared/trace.js";
import {
  createFoaTransitionTraceBinding63,
  createFoaTransitionTraceBinding70,
  createFoaTransitionTraceBinding75,
  createFoaTransitionTraceBinding80,
} from "../../src/tutorials/foa-transition-trace-bindings.js";
import {
  createFoaTransitionInputDigest,
  verifyFoaTransitionTrace,
  type FoaTransitionTraceBinding,
} from "../../src/tutorials/foa-transition-trace-verifier.js";

const NONCE = "foarealtrace1234567890";

describe("FOA real shadow Trace end-to-end", () => {
  it.runIf(existsSync("/usr/bin/clang"))(
    "upgrades all four lessons from actual native probe events",
    () => {
      const bindings: readonly FoaTransitionTraceBinding[] = Object.freeze([
        createFoaTransitionTraceBinding63(),
        createFoaTransitionTraceBinding70(),
        createFoaTransitionTraceBinding75(),
        createFoaTransitionTraceBinding80(),
        createFoaTransitionTraceBinding63(-8),
        createFoaTransitionTraceBinding70([0, 4, 5, 7, 9], 7),
        createFoaTransitionTraceBinding75(2),
        createFoaTransitionTraceBinding80([
          [1, 1, 1],
          [1, 1, 1],
          [1, 1, 1],
        ]),
      ]);

      for (const binding of bindings) {
        const sourceFingerprint = fingerprintSource(binding.source);
        const profile = resolveTraceObservationProfile(binding.profileId, binding.source);
        expect(profile, binding.profileId).not.toBeNull();
        if (profile === null) continue;
        const instrumentation = instrumentTraceSource(
          binding.source,
          sourceFingerprint,
          "main.c",
          NONCE,
          profile,
        );
        expect(instrumentation.ok, binding.profileId).toBe(true);
        if (!instrumentation.ok) continue;

        const directory = mkdtempSync(join(tmpdir(), `algolatch-${String(binding.lessonOrder)}-`));
        try {
          const executable = join(directory, "lesson");
          const compile = spawnSync(
            "/usr/bin/clang",
            ["-std=c17", "-Wall", "-Wextra", "-Wpedantic", "-x", "c", "-", "-o", executable],
            { input: instrumentation.value.source, encoding: "utf8" },
          );
          expect(compile.status, `${binding.profileId}: ${compile.stderr}`).toBe(0);
          const run = spawnSync(executable, [], { input: binding.stdin, encoding: "utf8" });
          expect(run.status, `${binding.profileId}: ${run.stderr}`).toBe(0);
          expect(run.stdout).toBe(binding.expectedStdout);

          const events: TraceEvent[] = [];
          let protocolError: string | null = null;
          const parser = new TraceProtocolParser({
            protocolNonce: NONCE,
            startedAtMs: 0,
            clock: {
              now: () => 1,
              setTimeout: (callback) => {
                callback();
                return 0;
              },
              clearTimeout: () => undefined,
            },
            allowedLines: new Set(instrumentation.value.instrumentedLines),
            allowedProbes: instrumentation.value.probeDefinitions,
            onEvent: (event) => {
              events.push(event);
              return true;
            },
            onProtocolError: (message) => {
              protocolError = message;
            },
          });
          parser.push(Buffer.from(run.stderr, "utf8"));
          parser.finish();
          expect(protocolError, binding.profileId).toBeNull();

          const evidence: TraceRunEvidence = Object.freeze({
            ok: true,
            exitCode: 0,
            signal: null,
            termination: "process-exit",
            durationMs: 1,
            peakRssBytes: 0,
            peakProcessCount: 1,
            outputBytes: Buffer.byteLength(run.stdout, "utf8"),
            executedNodeCount: new Set(events.map(({ line }) => line)).size,
            operationCount: events.length,
            stdout: Buffer.from(run.stdout, "utf8"),
          });
          const result = verifyFoaTransitionTrace({
            binding,
            source: binding.source,
            sessionId: `native-${String(binding.lessonOrder)}`,
            sourceFingerprint,
            inputDigest: createFoaTransitionInputDigest(binding.stdin),
            inputFingerprint: fingerprintSource(binding.stdin),
            observationProfileId: binding.profileId,
            observationAuthorizationDigest: profile.authorizationDigest,
            status: "completed",
            events,
            evidence,
          });
          expect(result, binding.profileId).toMatchObject({ ok: true });
        } finally {
          rmSync(directory, { recursive: true, force: true });
        }
      }
    },
  );
});
