import { describe, expect, it, vi } from "vitest";
import {
  COMPILE_EXECUTION_PROFILE,
  LEAKS_EXECUTION_PROFILE,
  RUN_EXECUTION_PROFILE,
  SANITIZER_RUN_PROFILE,
  SEATBELT_CANARY_SENTINEL,
  SystemCapabilityProbe,
  SystemSeatbeltCanary,
  classifyClangVersion,
  parseRunnerMode,
  type CanaryCommandExecutor,
  type CanaryCommandResult,
  type SeatbeltCanary,
  type ToolchainDetector,
} from "../../electron/main/runner/capability.js";

const AVAILABLE_TOOLCHAIN = Object.freeze({
  available: true,
  detail: "Apple clang version 21.0.0",
});
const UNAVAILABLE_TOOLCHAIN = Object.freeze({
  available: false,
  detail: "工具链不可用/未验证",
});

describe("Apple clang capability", () => {
  it("accepts only Apple clang 21.x", () => {
    expect(classifyClangVersion("Apple clang version 21.0.0\nTarget: arm64")).toEqual({
      available: true,
      detail: "Apple clang version 21.0.0",
    });
    expect(classifyClangVersion("Apple clang version 20.1.0")).toMatchObject({
      available: false,
    });
    expect(classifyClangVersion("clang version 21.0.0")).toMatchObject({
      available: false,
    });
    expect(classifyClangVersion("")).toMatchObject({ available: false });
  });

  it("forces executable runner modes to disabled when clang is unavailable", () => {
    const unavailable = vi.fn<ToolchainDetector>(() => UNAVAILABLE_TOOLCHAIN);

    expect(parseRunnerMode(undefined, unavailable)).toBe("disabled");
    expect(parseRunnerMode("seatbelt-best-effort", unavailable)).toBe("disabled");
    expect(parseRunnerMode("trusted-only", unavailable)).toBe("disabled");
    expect(unavailable).toHaveBeenCalledTimes(3);
  });

  it("preserves valid requested modes with a verified toolchain", () => {
    const available: ToolchainDetector = () => AVAILABLE_TOOLCHAIN;

    expect(parseRunnerMode(undefined, available)).toBe("seatbelt-best-effort");
    expect(parseRunnerMode("seatbelt-best-effort", available)).toBe("seatbelt-best-effort");
    expect(parseRunnerMode("trusted-only", available)).toBe("trusted-only");
  });

  it("does not probe tools for explicit or malformed disabled modes", () => {
    const detector = vi.fn<ToolchainDetector>(() => AVAILABLE_TOOLCHAIN);

    expect(parseRunnerMode("disabled", detector)).toBe("disabled");
    expect(parseRunnerMode("unexpected", detector)).toBe("disabled");
    expect(detector).not.toHaveBeenCalled();
  });
});

describe("Seatbelt capability canary", () => {
  it("compiles a fixed C canary before running it under the narrower profile", async () => {
    const execute = vi
      .fn<CanaryCommandExecutor>()
      .mockResolvedValueOnce(commandResult())
      .mockResolvedValueOnce(commandResult({ stdout: SEATBELT_CANARY_SENTINEL }));
    const canary = new SystemSeatbeltCanary({ execute });

    await expect(canary.run()).resolves.toMatchObject({ succeeded: true });
    expect(execute).toHaveBeenCalledTimes(2);

    const compile = execute.mock.calls[0]?.[0];
    const run = execute.mock.calls[1]?.[0];
    expect(compile).toMatchObject({
      command: "/usr/bin/sandbox-exec",
      timeoutMs: 10_000,
    });
    expect(compile?.args).toContain(COMPILE_EXECUTION_PROFILE);
    expect(compile?.args).toContain("/usr/bin/clang");
    expect(compile?.args).toContain("seatbelt-canary.c");
    expect(run).toMatchObject({
      command: "/usr/bin/sandbox-exec",
      timeoutMs: 10_000,
    });
    expect(run?.args).toContain(RUN_EXECUTION_PROFILE);
    expect(run?.args.some((argument) => argument.endsWith("/seatbelt-canary"))).toBe(true);
  });

  it("does not run a binary when the sandboxed compile canary fails", async () => {
    const execute = vi
      .fn<CanaryCommandExecutor>()
      .mockResolvedValue(commandResult({ ok: false, reason: "compile denied" }));
    const canary = new SystemSeatbeltCanary({ execute });

    await expect(canary.run()).resolves.toMatchObject({
      succeeded: false,
      detail: expect.stringContaining("compile canary"),
    });
    expect(execute).toHaveBeenCalledOnce();
  });

  it("rejects a successful process exit without the exact C sentinel", async () => {
    const execute = vi
      .fn<CanaryCommandExecutor>()
      .mockResolvedValueOnce(commandResult())
      .mockResolvedValueOnce(commandResult({ stdout: "wrong\n" }));
    const canary = new SystemSeatbeltCanary({ execute });

    await expect(canary.run()).resolves.toMatchObject({
      succeeded: false,
      detail: expect.stringContaining("sentinel"),
    });
  });

  it("does not run the canary when the clang toolchain is unverified", async () => {
    const canary = fakeCanary(true);
    const probe = new SystemCapabilityProbe({
      detectToolchain: () => UNAVAILABLE_TOOLCHAIN,
      canary,
    });

    await expect(probe.probe()).resolves.toEqual({
      status: "unavailable",
      detail: "工具链不可用/未验证",
    });
    expect(canary.run).not.toHaveBeenCalled();
  });

  it("reports success only after the confinement canary succeeds", async () => {
    const canary = fakeCanary(true);
    const probe = new SystemCapabilityProbe({
      detectToolchain: () => AVAILABLE_TOOLCHAIN,
      canary,
    });

    await expect(probe.probe()).resolves.toEqual({
      status: "probe-succeeded",
      detail: "canary passed",
    });
    expect(canary.run).toHaveBeenCalledOnce();
  });

  it("fails closed when the canary fails or throws", async () => {
    const failed = new SystemCapabilityProbe({
      detectToolchain: () => AVAILABLE_TOOLCHAIN,
      canary: fakeCanary(false),
    });
    const crashed = new SystemCapabilityProbe({
      detectToolchain: () => AVAILABLE_TOOLCHAIN,
      canary: { run: vi.fn(async () => Promise.reject(new Error("boom"))) },
    });

    await expect(failed.probe()).resolves.toEqual({
      status: "unavailable",
      detail: "canary failed",
    });
    await expect(crashed.probe()).resolves.toMatchObject({
      status: "unavailable",
    });
  });
});

describe("split execution profiles", () => {
  it("explicitly denies network access in every execution profile", () => {
    expect(COMPILE_EXECUTION_PROFILE).toContain("(deny network*)");
    expect(RUN_EXECUTION_PROFILE).toContain("(deny network*)");
    expect(SANITIZER_RUN_PROFILE).toContain("(deny network*)");
    expect(LEAKS_EXECUTION_PROFILE).toContain("(deny network*)");
  });

  it("adds the Apple clang 21 runtime only to the sanitizer run profile", () => {
    const runtimeDirectory =
      "/Applications/Xcode.app/Contents/Developer/Toolchains/XcodeDefault.xctoolchain/usr/lib/clang/21/lib/darwin";

    expect(RUN_EXECUTION_PROFILE).not.toContain(runtimeDirectory);
    expect(SANITIZER_RUN_PROFILE).toContain(
      '(allow file-read* file-test-existence (subpath (param "SANITIZER_RUNTIME")))',
    );
    expect(SANITIZER_RUN_PROFILE).toContain(
      '(allow file-map-executable (subpath (param "SANITIZER_RUNTIME")))',
    );
    expect(SANITIZER_RUN_PROFILE).not.toContain(runtimeDirectory);
    expect(SANITIZER_RUN_PROFILE).toContain("(deny process-fork)");
    expect(SANITIZER_RUN_PROFILE).not.toContain("(allow process*)");
  });

  it("gives leaks only its required fixed launcher chain", () => {
    expect(LEAKS_EXECUTION_PROFILE).toContain("(allow process-fork)");
    expect(LEAKS_EXECUTION_PROFILE).toContain("(allow mach-priv-task-port (target same-sandbox))");
    expect(LEAKS_EXECUTION_PROFILE).toContain('(allow process-exec (literal "/usr/bin/leaks"))');
    expect(LEAKS_EXECUTION_PROFILE).toContain('(allow process-exec (literal "/bin/bash"))');
    expect(LEAKS_EXECUTION_PROFILE).toContain('(allow process-exec (subpath (param "WORKDIR")))');
    expect(LEAKS_EXECUTION_PROFILE).not.toContain("(allow process*)");
  });

  it("keeps compiler subprocess permission out of the runtime profile", () => {
    expect(COMPILE_EXECUTION_PROFILE).toContain("(allow process*)");
    expect(RUN_EXECUTION_PROFILE).not.toContain("(allow process*)");
    expect(RUN_EXECUTION_PROFILE).toContain("(deny process-fork)");
    expect(RUN_EXECUTION_PROFILE).toContain('(allow process-exec (subpath (param "WORKDIR")))');
  });

  it("allows only metadata traversal above trusted Developer roots", () => {
    const ancestorMetadataRule =
      '(allow file-read-metadata file-test-existence (literal "/Applications") (literal "/Applications/Xcode.app") (literal "/Applications/Xcode.app/Contents") (literal "/Library"))';

    expect(COMPILE_EXECUTION_PROFILE).toContain(ancestorMetadataRule);
    expect(COMPILE_EXECUTION_PROFILE).toContain(
      '(allow file-read-metadata file-test-existence (subpath (param "TEMPROOT")))',
    );
    expect(SANITIZER_RUN_PROFILE).toContain(ancestorMetadataRule);
    expect(RUN_EXECUTION_PROFILE).not.toContain(ancestorMetadataRule);
    expect(ancestorMetadataRule).not.toContain("file-read-data");
  });

  it("explicitly rejects compile and runtime reads/mappings under usr/local", () => {
    expect(COMPILE_EXECUTION_PROFILE).toContain(
      '(deny file-read* file-test-existence (subpath "/usr/local"))',
    );
    expect(COMPILE_EXECUTION_PROFILE).toContain(
      '(deny file-map-executable (subpath "/usr/local"))',
    );
    expect(RUN_EXECUTION_PROFILE).toContain(
      '(deny file-read* file-test-existence (subpath "/usr/local"))',
    );
    expect(RUN_EXECUTION_PROFILE).toContain('(deny file-map-executable (subpath "/usr/local"))');
  });
});

function commandResult(
  overrides: {
    readonly ok?: boolean;
    readonly reason?: string;
    readonly stdout?: string;
    readonly stderr?: string;
  } = {},
): CanaryCommandResult {
  return Object.freeze({
    ok: overrides.ok ?? true,
    reason: overrides.reason ?? "ok",
    stdout: Uint8Array.from(Buffer.from(overrides.stdout ?? "", "utf8")),
    stderr: Uint8Array.from(Buffer.from(overrides.stderr ?? "", "utf8")),
  });
}

function fakeCanary(succeeded: boolean): SeatbeltCanary & {
  readonly run: ReturnType<typeof vi.fn<SeatbeltCanary["run"]>>;
} {
  return {
    run: vi.fn(async () => ({
      succeeded,
      detail: succeeded ? "canary passed" : "canary failed",
    })),
  };
}
