import type {
  Capabilities,
  CompileResult,
  FixtureInput,
  RunResult,
} from "../../../src/shared/api.js";
import {
  Runner,
  type VerificationCompilePreset,
  type VerificationRunMode,
  type VerificationRunResult,
} from "./runner.js";
import {
  detectSupportedAppleClang,
  type ToolchainDetector,
  type ToolchainProbeResult,
} from "./capability.js";

interface VerificationCompileRequest {
  readonly source: string | Uint8Array;
  readonly sourceName: string;
  readonly preset: VerificationCompilePreset;
}

interface VerificationRunRequestInput {
  readonly artifactId: string;
  readonly args?: readonly string[];
  readonly stdin: string | Uint8Array;
  readonly fixtures?: readonly FixtureInput[];
  readonly writableFiles?: readonly string[];
  readonly mode: VerificationRunMode;
}

export interface SampleVerificationRunner {
  capabilities(): Promise<Capabilities>;
  compile(request: VerificationCompileRequest): Promise<CompileResult>;
  run(request: VerificationRunRequestInput): Promise<VerificationRunResult>;
  dispose(): Promise<void>;
}

const utf8Decoder = new TextDecoder("utf-8", {
  fatal: true,
  ignoreBOM: true,
});
const utf8Encoder = new TextEncoder();
const stableVerificationToolchainDetector =
  createStableToolchainDetector(detectSupportedAppleClang);

export function createStableToolchainDetector(detect: ToolchainDetector): ToolchainDetector {
  let snapshot: ToolchainProbeResult | undefined;
  return () => {
    snapshot ??= detect();
    return snapshot;
  };
}

export function createSampleVerificationRunner(): SampleVerificationRunner {
  const runner = new Runner({
    mode: "seatbelt-best-effort",
    toolchainDetector: stableVerificationToolchainDetector,
  });
  return Object.freeze({
    capabilities: () => runner.getCapabilities(),
    compile: async (value: VerificationCompileRequest) => {
      try {
        const request = requireRecord(value, ["source", "sourceName", "preset"]);
        const source = decodeSource(request.source);
        const sourceName = requireString(request.sourceName, "sourceName");
        const preset = requireCompilePreset(request.preset);
        return await runner.compileForVerification({ source, sourceName }, preset);
      } catch (error) {
        return invalidCompileResult(error);
      }
    },
    run: async (value: VerificationRunRequestInput) => {
      try {
        const request = requireRecord(value, [
          "artifactId",
          "args",
          "stdin",
          "fixtures",
          "writableFiles",
          "mode",
        ]);
        return await runner.runForVerification({
          artifactId: requireString(request.artifactId, "artifactId"),
          ...(request.args === undefined ? {} : { args: requireStringArray(request.args, "args") }),
          stdin: encodeInput(request.stdin),
          ...(request.fixtures === undefined
            ? {}
            : { fixtures: requireFixtures(request.fixtures) }),
          writableFiles:
            request.writableFiles === undefined
              ? Object.freeze([])
              : requireStringArray(request.writableFiles, "writableFiles"),
          mode: requireRunMode(request.mode),
        });
      } catch (error) {
        return invalidRunResult(error);
      }
    },
    dispose: () => runner.dispose(),
  });
}

function requireRecord(value: unknown, allowedKeys: readonly string[]): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("verification 请求必须是对象。");
  }
  const record = value as Record<string, unknown>;
  if (Object.keys(record).some((key) => !allowedKeys.includes(key))) {
    throw new Error("verification 请求包含未知字段。");
  }
  return record;
}

function requireString(value: unknown, label: string): string {
  if (typeof value !== "string") {
    throw new Error(`${label} 必须是字符串。`);
  }
  return value;
}

function requireStringArray(value: unknown, label: string): readonly string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new Error(`${label} 必须是字符串数组。`);
  }
  return Object.freeze([...value] as string[]);
}

function requireFixtures(value: unknown): readonly FixtureInput[] {
  if (!Array.isArray(value)) {
    throw new Error("fixtures 必须是数组。");
  }
  return Object.freeze(
    value.map((fixture) => {
      const record = requireRecord(fixture, ["path", "contents"]);
      const contents = record.contents;
      if (typeof contents !== "string" && !(contents instanceof Uint8Array)) {
        throw new Error("fixture contents 必须是字符串或 Uint8Array。");
      }
      return Object.freeze({
        path: requireString(record.path, "fixture path"),
        contents: typeof contents === "string" ? contents : Uint8Array.from(contents),
      });
    }),
  );
}

function decodeSource(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  if (!(value instanceof Uint8Array)) {
    throw new Error("source 必须是字符串或 Uint8Array。");
  }
  return utf8Decoder.decode(value);
}

function encodeInput(value: unknown): Uint8Array {
  if (typeof value === "string") {
    if (value.includes("\0")) {
      throw new Error("字符串 stdin 不能包含 NUL；请使用 Uint8Array。");
    }
    return utf8Encoder.encode(value);
  }
  if (value instanceof Uint8Array) {
    return Uint8Array.from(value);
  }
  throw new Error("stdin 必须是字符串或 Uint8Array。");
}

function requireCompilePreset(value: unknown): VerificationCompilePreset {
  if (value !== "asan-ubsan" && value !== "plain") {
    throw new Error("preset 必须是 asan-ubsan 或 plain。");
  }
  return value;
}

function requireRunMode(value: unknown): VerificationRunMode {
  if (value !== "direct" && value !== "leaks") {
    throw new Error("mode 必须是 direct 或 leaks。");
  }
  return value;
}

function invalidCompileResult(error: unknown): CompileResult {
  return Object.freeze({
    ok: false,
    diagnostics: "",
    error: Object.freeze({
      code: "INVALID_REQUEST",
      message: error instanceof Error ? error.message : "verification 编译请求无效。",
    }),
  });
}

function invalidRunResult(error: unknown): RunResult {
  return Object.freeze({
    ok: false,
    stdout: new Uint8Array(),
    stderr: new Uint8Array(),
    exitCode: null,
    signal: null,
    termination: "not-started",
    durationMs: 0,
    error: Object.freeze({
      code: "INVALID_REQUEST",
      message: error instanceof Error ? error.message : "verification 运行请求无效。",
    }),
  });
}
