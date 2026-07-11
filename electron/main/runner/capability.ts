import { execFile, spawnSync } from "node:child_process";
import { Buffer } from "node:buffer";
import { realpathSync, statSync } from "node:fs";
import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative, sep } from "node:path";
import type { Capabilities, RunnerMode, SeatbeltProbeStatus } from "../../../src/shared/api.js";

const SANDBOX_EXEC_PATH = "/usr/bin/sandbox-exec";
const CLANG_PATH = "/usr/bin/clang";
const XCRUN_PATH = "/usr/bin/xcrun";
const BASH_PATH = "/bin/bash";
const LEAKS_PATH = "/usr/bin/leaks";
const DEFAULT_APPLE_CLANG_21_SANITIZER_RUNTIME =
  "/Applications/Xcode.app/Contents/Developer/Toolchains/XcodeDefault.xctoolchain/usr/lib/clang/21/lib/darwin";
const TRUSTED_DEVELOPER_ROOTS = Object.freeze([
  "/Applications/Xcode.app/Contents/Developer",
  "/Library/Developer/CommandLineTools",
]);
const PROBE_TIMEOUT_MS = 1_500;
const CANARY_COMPILE_TIMEOUT_MS = 10_000;
const CANARY_RUN_TIMEOUT_MS = 10_000;
const CANARY_FILE_MODE = 0o600;
const CANARY_DIRECTORY_MODE = 0o700;
const CANARY_SOURCE_NAME = "seatbelt-canary.c";
const CANARY_EXECUTABLE_NAME = "seatbelt-canary";
export const SEATBELT_CANARY_SENTINEL = "C_BLOCK_SEATBELT_CANARY_OK\n";

/**
 * Compilation needs to execute clang's helper processes and read the selected
 * Apple toolchain. It is deliberately broader than the runtime profile.
 */
export const COMPILE_EXECUTION_PROFILE = [
  "(version 1)",
  "(deny default)",
  '(import "system.sb")',
  "(deny network*)",
  "(allow process*)",
  "(allow signal (target same-sandbox))",
  '(allow file-read* file-test-existence (subpath (param "WORKDIR")))',
  '(allow file-write* (subpath (param "WORKDIR")))',
  '(allow file-read* file-test-existence (subpath "/bin"))',
  '(allow file-read* file-test-existence (subpath "/usr"))',
  '(allow file-read* file-test-existence (subpath "/System"))',
  '(allow file-read* file-test-existence (subpath "/Library/Developer"))',
  '(allow file-read* file-test-existence (subpath "/Applications/Xcode.app/Contents/Developer"))',
  '(allow file-read-metadata file-test-existence (literal "/Applications") (literal "/Applications/Xcode.app") (literal "/Applications/Xcode.app/Contents") (literal "/Library"))',
  '(allow file-read-metadata file-test-existence (subpath (param "TEMPROOT")))',
  '(allow file-map-executable (subpath "/bin"))',
  '(allow file-map-executable (subpath "/usr"))',
  '(allow file-map-executable (subpath "/System"))',
  '(allow file-map-executable (subpath "/Library/Developer"))',
  '(allow file-map-executable (subpath "/Applications/Xcode.app/Contents/Developer"))',
  '(deny file-read* file-test-existence (subpath "/usr/local"))',
  '(deny file-map-executable (subpath "/usr/local"))',
].join("\n");

/**
 * Runtime C programs get no general process permission. The fixed bash
 * wrapper and executables copied into WORKDIR may start, while fork and reads
 * from /usr/local are explicitly denied in addition to deny-default.
 */
export const RUN_EXECUTION_PROFILE = [
  "(version 1)",
  "(deny default)",
  '(import "system.sb")',
  "(deny network*)",
  `(allow process-exec (literal "${BASH_PATH}"))`,
  '(allow process-exec (subpath (param "WORKDIR")))',
  "(deny process-fork)",
  "(allow signal (target same-sandbox))",
  '(allow file-read* file-test-existence (subpath (param "WORKDIR")))',
  '(allow file-write* (subpath (param "WORKDIR")))',
  '(allow file-read* file-test-existence (subpath "/bin"))',
  '(allow file-read* file-test-existence (subpath "/System"))',
  '(allow file-read* file-test-existence (subpath "/usr/lib"))',
  '(allow file-map-executable (subpath "/bin"))',
  '(allow file-map-executable (subpath "/System"))',
  '(allow file-map-executable (subpath "/usr/lib"))',
  '(deny file-read* file-test-existence (subpath "/usr/local"))',
  '(deny file-map-executable (subpath "/usr/local"))',
].join("\n");

/**
 * Sanitized verification artifacts need Apple's ASan/UBSan runtime dylibs.
 * Keep that extra read/map capability out of the ordinary program profile.
 */
export const SANITIZER_RUN_PROFILE = [
  "(version 1)",
  "(deny default)",
  '(import "system.sb")',
  "(deny network*)",
  `(allow process-exec (literal "${BASH_PATH}"))`,
  '(allow process-exec (subpath (param "WORKDIR")))',
  "(deny process-fork)",
  "(allow signal (target same-sandbox))",
  '(allow file-read* file-test-existence (subpath (param "WORKDIR")))',
  '(allow file-write* (subpath (param "WORKDIR")))',
  '(allow file-read* file-test-existence (subpath "/bin"))',
  '(allow file-read* file-test-existence (subpath "/System"))',
  '(allow file-read* file-test-existence (subpath "/usr/lib"))',
  '(allow file-read* file-test-existence (subpath (param "SANITIZER_RUNTIME")))',
  '(allow file-read-metadata file-test-existence (literal "/Applications") (literal "/Applications/Xcode.app") (literal "/Applications/Xcode.app/Contents") (literal "/Library"))',
  '(allow file-map-executable (subpath "/bin"))',
  '(allow file-map-executable (subpath "/System"))',
  '(allow file-map-executable (subpath "/usr/lib"))',
  '(allow file-map-executable (subpath (param "SANITIZER_RUNTIME")))',
  '(deny file-read* file-test-existence (subpath "/usr/local"))',
  '(deny file-map-executable (subpath "/usr/local"))',
].join("\n");

/**
 * `leaks --atExit` must fork the inspected program directly. Its exec
 * permission is limited to the fixed outer limits shell, leaks itself, and
 * binaries copied into WORKDIR.
 */
export const LEAKS_EXECUTION_PROFILE = [
  "(version 1)",
  "(deny default)",
  '(import "system.sb")',
  "(deny network*)",
  `(allow process-exec (literal "${BASH_PATH}"))`,
  `(allow process-exec (literal "${LEAKS_PATH}"))`,
  '(allow process-exec (subpath (param "WORKDIR")))',
  "(allow process-fork)",
  "(allow mach-priv-task-port (target same-sandbox))",
  "(allow signal (target same-sandbox))",
  '(allow file-read* file-test-existence (subpath (param "WORKDIR")))',
  '(allow file-write* (subpath (param "WORKDIR")))',
  '(allow file-read* file-test-existence (subpath "/bin"))',
  `(allow file-read* file-test-existence (literal "${LEAKS_PATH}"))`,
  '(allow file-read* file-test-existence (subpath "/System"))',
  '(allow file-read* file-test-existence (subpath "/usr/lib"))',
  '(allow file-map-executable (subpath "/bin"))',
  `(allow file-map-executable (literal "${LEAKS_PATH}"))`,
  '(allow file-map-executable (subpath "/System"))',
  '(allow file-map-executable (subpath "/usr/lib"))',
  '(deny file-read* file-test-existence (subpath "/usr/local"))',
  '(deny file-map-executable (subpath "/usr/local"))',
].join("\n");

/**
 * Compatibility export until Runner selects COMPILE/RUN profiles per action.
 * Keeping the broader compile profile avoids silently breaking compilation.
 */
export const EXECUTION_PROFILE = COMPILE_EXECUTION_PROFILE;

export interface ToolchainProbeResult {
  readonly available: boolean;
  readonly detail: string;
  readonly executablePath?: string;
  readonly sdkPath?: string;
  readonly sanitizerRuntimePath?: string;
}

export type ToolchainDetector = () => ToolchainProbeResult;

export interface SeatbeltCanaryResult {
  readonly succeeded: boolean;
  readonly detail: string;
}

export interface SeatbeltCanary {
  run(): Promise<SeatbeltCanaryResult>;
}

export interface CanaryCommandResult {
  readonly ok: boolean;
  readonly reason: string;
  readonly stdout: Uint8Array;
  readonly stderr: Uint8Array;
}

export interface CanaryCommandSpecification {
  readonly command: string;
  readonly args: readonly string[];
  readonly cwd: string;
  readonly timeoutMs: number;
}

export type CanaryCommandExecutor = (
  specification: CanaryCommandSpecification,
) => Promise<CanaryCommandResult>;

export interface SeatbeltProbeResult {
  readonly status: Extract<SeatbeltProbeStatus, "probe-succeeded" | "unavailable">;
  readonly detail: string;
}

export interface CapabilityProbe {
  probe(): Promise<SeatbeltProbeResult>;
}

interface SystemCapabilityProbeOptions {
  readonly detectToolchain?: ToolchainDetector;
  readonly canary?: SeatbeltCanary;
}

export class SystemCapabilityProbe implements CapabilityProbe {
  readonly #detectToolchain: ToolchainDetector;
  readonly #canary: SeatbeltCanary | undefined;

  constructor(options: SystemCapabilityProbeOptions = {}) {
    this.#detectToolchain = options.detectToolchain ?? detectAppleClang21;
    this.#canary = options.canary;
  }

  async probe(): Promise<SeatbeltProbeResult> {
    const toolchain = this.#detectToolchain();
    if (!toolchain.available) {
      return Object.freeze({
        status: "unavailable",
        detail: toolchain.detail,
      });
    }

    try {
      const clangPath = toolchain.executablePath;
      const sdkPath = toolchain.sdkPath;
      if (this.#canary === undefined && (clangPath === undefined || sdkPath === undefined)) {
        return Object.freeze({
          status: "unavailable",
          detail: "Seatbelt canary 缺少已验证的 clang 或 SDK 路径；默认拒绝运行。",
        });
      }
      const canary =
        this.#canary ??
        new SystemSeatbeltCanary({
          clangPath: clangPath as string,
          sdkPath: sdkPath as string,
        });
      const canaryResult = await canary.run();
      return Object.freeze({
        status: canaryResult.succeeded ? "probe-succeeded" : "unavailable",
        detail: canaryResult.detail,
      });
    } catch {
      return Object.freeze({
        status: "unavailable",
        detail: "Seatbelt canary 初始化或回收失败；默认拒绝运行。",
      });
    }
  }
}

interface SystemSeatbeltCanaryOptions {
  readonly execute?: CanaryCommandExecutor;
  readonly tempRoot?: string;
  readonly clangPath?: string;
  readonly sdkPath?: string;
}

export class SystemSeatbeltCanary implements SeatbeltCanary {
  readonly #execute: CanaryCommandExecutor;
  readonly #tempRoot: string;
  readonly #clangPath: string;
  readonly #sdkPath: string | undefined;

  constructor(options: SystemSeatbeltCanaryOptions = {}) {
    this.#execute = options.execute ?? execFileResult;
    this.#tempRoot = realpathSync(options.tempRoot ?? tmpdir());
    this.#clangPath = options.clangPath ?? CLANG_PATH;
    this.#sdkPath = options.sdkPath;
  }

  async run(): Promise<SeatbeltCanaryResult> {
    const createdRoot = await mkdtemp(join(this.#tempRoot, "c-block-seatbelt-canary-"));
    const root = await realpath(createdRoot);
    const workDirectory = join(root, "allowed");
    const forbiddenDirectory = join(root, "forbidden");

    try {
      await Promise.all([
        mkdir(workDirectory, { mode: CANARY_DIRECTORY_MODE }),
        mkdir(forbiddenDirectory, { mode: CANARY_DIRECTORY_MODE }),
      ]);
      const readablePath = join(workDirectory, "readable.txt");
      const writablePath = join(workDirectory, "writable.txt");
      const forbiddenReadablePath = join(forbiddenDirectory, "secret.txt");
      const forbiddenWritablePath = join(forbiddenDirectory, "created.txt");
      const sourcePath = join(workDirectory, CANARY_SOURCE_NAME);
      const executablePath = join(workDirectory, CANARY_EXECUTABLE_NAME);
      await Promise.all([
        writeFile(readablePath, "allowed", { mode: CANARY_FILE_MODE }),
        writeFile(forbiddenReadablePath, "forbidden", {
          mode: CANARY_FILE_MODE,
        }),
        writeFile(sourcePath, SEATBELT_CANARY_SOURCE, {
          mode: CANARY_FILE_MODE,
        }),
      ]);

      const compileResult = await this.#execute({
        command: SANDBOX_EXEC_PATH,
        args: Object.freeze([
          "-D",
          `WORKDIR=${workDirectory}`,
          "-D",
          `TEMPROOT=${this.#tempRoot}`,
          "-p",
          COMPILE_EXECUTION_PROFILE,
          this.#clangPath,
          "-std=c17",
          "-fintegrated-cc1",
          ...(this.#sdkPath === undefined ? [] : ["-isysroot", this.#sdkPath]),
          "-O0",
          "-g0",
          "-Wall",
          "-Wextra",
          "-Wpedantic",
          "-fno-color-diagnostics",
          CANARY_SOURCE_NAME,
          "-o",
          CANARY_EXECUTABLE_NAME,
        ]),
        cwd: workDirectory,
        timeoutMs: CANARY_COMPILE_TIMEOUT_MS,
      });
      if (!compileResult.ok) {
        return Object.freeze({
          succeeded: false,
          detail: `Seatbelt compile canary 未通过（${compileResult.reason}）；默认拒绝运行。`,
        });
      }

      const runResult = await this.#execute({
        command: SANDBOX_EXEC_PATH,
        args: Object.freeze([
          "-D",
          `WORKDIR=${workDirectory}`,
          "-p",
          RUN_EXECUTION_PROFILE,
          executablePath,
          readablePath,
          writablePath,
          forbiddenReadablePath,
          forbiddenWritablePath,
        ]),
        cwd: workDirectory,
        timeoutMs: CANARY_RUN_TIMEOUT_MS,
      });

      if (
        runResult.ok &&
        Buffer.from(runResult.stdout).equals(Buffer.from(SEATBELT_CANARY_SENTINEL, "utf8"))
      ) {
        return Object.freeze({
          succeeded: true,
          detail:
            "Seatbelt canary 已在沙箱内编译并运行 C 程序，验证工作目录内读写并拒绝目录外读写；这仍不是 hostile-code 安全保证。",
        });
      }
      return Object.freeze({
        succeeded: false,
        detail: `Seatbelt run canary 未通过（${runResult.ok ? "sentinel 不匹配" : runResult.reason}）；默认拒绝运行。`,
      });
    } finally {
      await rm(createdRoot, { force: true, recursive: true });
    }
  }
}

const SEATBELT_CANARY_SOURCE = `#include <stdio.h>

static int can_read(const char *path) {
    FILE *file = fopen(path, "rb");
    if (file == NULL) {
        return 0;
    }
    (void)fclose(file);
    return 1;
}

static int can_write(const char *path) {
    FILE *file = fopen(path, "wb");
    if (file == NULL) {
        return 0;
    }
    (void)fclose(file);
    return 1;
}

int main(int argc, char **argv) {
    if (argc != 5) {
        return 2;
    }
    if (!can_read(argv[1])) {
        return 10;
    }
    if (!can_write(argv[2])) {
        return 11;
    }
    if (can_read(argv[3])) {
        return 12;
    }
    if (can_write(argv[4])) {
        return 13;
    }
    fputs("${SEATBELT_CANARY_SENTINEL.replace("\n", "\\n")}", stdout);
    return 0;
}
`;

export function classifyClangVersion(output: string): ToolchainProbeResult {
  const firstLine = output.split(/\r?\n/u)[0]?.trim() ?? "";
  if (/^Apple clang version 21\./u.test(firstLine)) {
    return Object.freeze({
      available: true,
      detail: firstLine,
    });
  }
  return Object.freeze({
    available: false,
    detail:
      firstLine.length === 0
        ? "工具链不可用/未验证：无法读取 /usr/bin/clang 版本。"
        : `工具链不可用/未验证：要求 Apple clang 21.x，实际为 ${firstLine}`,
  });
}

export function detectAppleClang21(): ToolchainProbeResult {
  const result = spawnSync(CLANG_PATH, ["--version"], {
    encoding: "utf8",
    env: minimalProbeEnvironment(),
    shell: false,
    timeout: PROBE_TIMEOUT_MS,
    windowsHide: true,
  });
  if (result.error !== undefined || result.status !== 0) {
    return Object.freeze({
      available: false,
      detail: "工具链不可用/未验证：无法执行 /usr/bin/clang --version。",
    });
  }
  const gate = classifyClangVersion(`${result.stdout ?? ""}${result.stderr ?? ""}`);
  if (!gate.available) {
    return gate;
  }

  try {
    const executablePath = resolveTrustedXcrunPath(
      ["--no-cache", "--find", "clang"],
      "clang",
      "file",
    );
    const sdkPath = resolveTrustedXcrunPath(
      ["--no-cache", "--sdk", "macosx", "--show-sdk-path"],
      "macOS SDK",
      "directory",
    );
    const developerRoot = trustedDeveloperRoot(executablePath);
    if (developerRoot === undefined || trustedDeveloperRoot(sdkPath) !== developerRoot) {
      throw new Error("clang 与 SDK 不在同一受信 Developer root。 ");
    }

    const resolvedVersion = spawnSync(executablePath, ["--version"], {
      encoding: "utf8",
      env: minimalProbeEnvironment(),
      shell: false,
      timeout: PROBE_TIMEOUT_MS,
      windowsHide: true,
    });
    const resolvedGate = classifyClangVersion(
      `${resolvedVersion.stdout ?? ""}${resolvedVersion.stderr ?? ""}`,
    );
    if (
      resolvedVersion.error !== undefined ||
      resolvedVersion.status !== 0 ||
      !resolvedGate.available
    ) {
      throw new Error("xcrun 返回的 clang 不是 Apple clang 21.x。 ");
    }

    const sanitizerRuntimePath = resolveTrustedCommandPath(
      executablePath,
      ["--print-runtime-dir"],
      "sanitizer runtime",
      "directory",
    );
    if (
      trustedDeveloperRoot(sanitizerRuntimePath) !== developerRoot ||
      !sanitizerRuntimePath.endsWith("/usr/lib/clang/21/lib/darwin")
    ) {
      throw new Error("sanitizer runtime 不属于已验证的 Apple clang 21。 ");
    }

    return Object.freeze({
      available: true,
      detail: `${gate.detail}；工具链 ${executablePath}`,
      executablePath,
      sdkPath,
      sanitizerRuntimePath,
    });
  } catch (error) {
    return Object.freeze({
      available: false,
      detail: `工具链不可用/未验证：${error instanceof Error ? error.message.trim() : "无法解析受信 clang/SDK 路径。"}`,
    });
  }
}

function resolveTrustedXcrunPath(
  args: readonly string[],
  label: string,
  expectedType: "file" | "directory",
): string {
  return resolveTrustedCommandPath(XCRUN_PATH, args, label, expectedType);
}

function resolveTrustedCommandPath(
  command: string,
  args: readonly string[],
  label: string,
  expectedType: "file" | "directory",
): string {
  const result = spawnSync(command, [...args], {
    encoding: "utf8",
    env: minimalProbeEnvironment(),
    shell: false,
    timeout: PROBE_TIMEOUT_MS,
    windowsHide: true,
  });
  if (result.error !== undefined || result.status !== 0) {
    throw new Error(`无法通过 ${command} 解析${label}。`);
  }
  const output = String(result.stdout ?? "").trim();
  if (output.length === 0 || output.includes("\0") || output.includes("\n")) {
    throw new Error(`${label}路径格式无效。`);
  }
  const resolvedPath = realpathSync(output);
  const metadata = statSync(resolvedPath);
  if (
    (expectedType === "file" && !metadata.isFile()) ||
    (expectedType === "directory" && !metadata.isDirectory()) ||
    trustedDeveloperRoot(resolvedPath) === undefined
  ) {
    throw new Error(`${label}不在受信 Developer root。`);
  }
  return resolvedPath;
}

function trustedDeveloperRoot(path: string): string | undefined {
  return TRUSTED_DEVELOPER_ROOTS.find((root) => {
    const pathFromRoot = relative(root, path);
    return (
      pathFromRoot.length === 0 || (!pathFromRoot.startsWith(`..${sep}`) && pathFromRoot !== "..")
    );
  });
}

export function parseRunnerMode(
  value: string | undefined,
  detectToolchain: ToolchainDetector = detectAppleClang21,
): RunnerMode {
  if (value === "disabled") {
    return "disabled";
  }
  if (value !== undefined && value !== "seatbelt-best-effort" && value !== "trusted-only") {
    return "disabled";
  }
  return detectToolchain().available ? (value ?? "seatbelt-best-effort") : "disabled";
}

export function toolchainIdentifier(toolchain: ToolchainProbeResult, mode: RunnerMode): string {
  const sanitized = toolchain.detail
    .replace(/(^|[\s；，(])\/[^\s；，)]+/gu, "$1[verified-path]")
    .replace(/\s+/gu, " ")
    .trim()
    .slice(0, 240);
  const detail = sanitized.length > 0 ? sanitized : "工具链信息不可用";
  return `${mode === "disabled" ? "disabled" : toolchain.available ? "verified" : "unavailable"}:${detail}`;
}

export function capabilitiesWithoutProbe(mode: RunnerMode, toolchainId: string): Capabilities {
  if (mode === "disabled") {
    return Object.freeze({
      mode,
      runnerEnabled: false,
      toolchainId,
      seatbeltProbe: Object.freeze({
        status: "not-checked",
        detail: "运行器已禁用，或本机工具链不可用/未验证。",
      }),
      requiresNativeTrustConfirmation: false,
    });
  }
  return Object.freeze({
    mode,
    runnerEnabled: true,
    toolchainId,
    seatbeltProbe: Object.freeze({
      status: "not-checked",
      detail: "未请求 Seatbelt 探测；仅允许显式确认的可信代码。",
    }),
    requiresNativeTrustConfirmation: true,
  });
}

function execFileResult(specification: CanaryCommandSpecification): Promise<CanaryCommandResult> {
  return new Promise((resolve) => {
    execFile(
      specification.command,
      [...specification.args],
      {
        cwd: specification.cwd,
        encoding: "buffer",
        env: minimalProbeEnvironment(specification.cwd),
        maxBuffer: 64 * 1024,
        shell: false,
        timeout: specification.timeoutMs,
        windowsHide: true,
      },
      (error, stdout, stderr) => {
        const reason =
          error === null
            ? "ok"
            : error.killed
              ? "timeout"
              : error.signal !== null
                ? `signal:${error.signal}`
                : error.code === undefined || error.code === null
                  ? "执行失败"
                  : String(error.code);
        resolve(
          Object.freeze({
            ok: error === null,
            reason,
            stdout: Uint8Array.from(stdout),
            stderr: Uint8Array.from(stderr),
          }),
        );
      },
    );
  });
}

function minimalProbeEnvironment(workDirectory?: string): Readonly<Record<string, string>> {
  return Object.freeze({
    HOME: workDirectory ?? "/var/empty",
    LANG: "C",
    LC_ALL: "C",
    PATH: "/usr/bin:/bin",
    ...(workDirectory === undefined ? {} : { TMPDIR: workDirectory }),
  });
}

export { SANDBOX_EXEC_PATH };
export { DEFAULT_APPLE_CLANG_21_SANITIZER_RUNTIME };
