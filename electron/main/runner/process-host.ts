import { execFile, spawn } from "node:child_process";
import { Buffer } from "node:buffer";
import { readFile } from "node:fs/promises";

export type TimerToken = ReturnType<typeof setTimeout> | number | object;

export interface RunnerClock {
  now(): number;
  setTimeout(callback: () => void, delayMs: number): TimerToken;
  clearTimeout(token: TimerToken): void;
}

export interface SpawnSpecification {
  readonly command: string;
  readonly args: readonly string[];
  readonly cwd: string;
  readonly env: Readonly<Record<string, string>>;
  readonly detached: true;
  readonly shell: false;
  /** Windows Job Object host writes bounded aggregate metrics to this file. */
  readonly resourceMetricsPath?: string;
}

export type RemoveListener = () => void;

export interface ProcessGroupResources {
  readonly rssBytes: number;
  readonly processCount: number;
}

export interface ManagedChildProcess {
  readonly pid: number | undefined;
  onStdout(listener: (chunk: Uint8Array) => void): RemoveListener;
  onStderr(listener: (chunk: Uint8Array) => void): RemoveListener;
  onExit(listener: (code: number | null, signal: string | null) => void): RemoveListener;
  onClose(listener: (code: number | null, signal: string | null) => void): RemoveListener;
  onError(listener: (error: Error) => void): RemoveListener;
  onInputError(listener: (error: Error) => void): RemoveListener;
  endInput(input: Uint8Array): void;
  kill(signal: NodeJS.Signals): boolean;
}

export interface ProcessHost {
  spawn(specification: SpawnSpecification): ManagedChildProcess;
  killProcessGroup(processGroupId: number, signal: NodeJS.Signals): void;
  isProcessGroupAlive(processGroupId: number): boolean;
  sampleProcessGroupResources(processGroupId: number): Promise<ProcessGroupResources>;
}

export const SYSTEM_CLOCK: RunnerClock = Object.freeze({
  now: () => Date.now(),
  setTimeout: (callback: () => void, delayMs: number): TimerToken => setTimeout(callback, delayMs),
  clearTimeout: (token: TimerToken): void => clearTimeout(token as ReturnType<typeof setTimeout>),
});

export class SystemProcessHost implements ProcessHost {
  readonly #platform: NodeJS.Platform;
  readonly #resourceMetricsPaths = new Map<number, string>();

  constructor(platform: NodeJS.Platform = process.platform) {
    this.#platform = platform;
  }

  spawn(specification: SpawnSpecification): ManagedChildProcess {
    const child = spawn(specification.command, [...specification.args], {
      cwd: specification.cwd,
      detached: specification.detached,
      env: { ...specification.env },
      shell: specification.shell,
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });

    // Keep one guard attached for the lifetime of the stream. A delayed EPIPE
    // can arrive after the supervisor's bounded reap wait has elapsed; without
    // this guard Node would treat it as an unhandled "error" event.
    child.stdin.on("error", () => undefined);
    if (child.pid !== undefined && specification.resourceMetricsPath !== undefined) {
      this.#resourceMetricsPaths.set(child.pid, specification.resourceMetricsPath);
      child.once("close", () => this.#resourceMetricsPaths.delete(child.pid as number));
    }

    return {
      pid: child.pid,
      onStdout(listener) {
        const handler = (chunk: Buffer): void => listener(chunk);
        child.stdout.on("data", handler);
        return () => child.stdout.off("data", handler);
      },
      onStderr(listener) {
        const handler = (chunk: Buffer): void => listener(chunk);
        child.stderr.on("data", handler);
        return () => child.stderr.off("data", handler);
      },
      onExit(listener) {
        const handler = (code: number | null, signal: NodeJS.Signals | null): void =>
          listener(code, signal);
        child.on("exit", handler);
        return () => child.off("exit", handler);
      },
      onClose(listener) {
        const handler = (code: number | null, signal: NodeJS.Signals | null): void =>
          listener(code, signal);
        child.on("close", handler);
        return () => child.off("close", handler);
      },
      onError(listener) {
        child.on("error", listener);
        return () => child.off("error", listener);
      },
      onInputError(listener) {
        child.stdin.on("error", listener);
        return () => child.stdin.off("error", listener);
      },
      endInput(input) {
        child.stdin.end(Buffer.from(input));
      },
      kill(signal) {
        return child.kill(signal);
      },
    };
  }

  killProcessGroup(processGroupId: number, signal: NodeJS.Signals): void {
    if (!Number.isSafeInteger(processGroupId) || processGroupId <= 1) {
      throw new Error("Invalid process group id");
    }
    try {
      process.kill(this.#platform === "win32" ? processGroupId : -processGroupId, signal);
    } catch (error) {
      if (!isNoSuchProcessError(error)) {
        throw error;
      }
    }
  }

  isProcessGroupAlive(processGroupId: number): boolean {
    if (!Number.isSafeInteger(processGroupId) || processGroupId <= 1) {
      throw new Error("Invalid process group id");
    }
    try {
      process.kill(this.#platform === "win32" ? processGroupId : -processGroupId, 0);
      return true;
    } catch (error) {
      if (isNoSuchProcessError(error)) {
        return false;
      }
      if (isPermissionError(error)) {
        return true;
      }
      throw error;
    }
  }

  async sampleProcessGroupResources(processGroupId: number): Promise<ProcessGroupResources> {
    if (!Number.isSafeInteger(processGroupId) || processGroupId <= 1) {
      throw new Error("Invalid process group id");
    }

    if (this.#platform === "win32") {
      const metricsPath = this.#resourceMetricsPaths.get(processGroupId);
      if (metricsPath === undefined) throw new Error("Windows Job Object metrics path is missing");
      return readWindowsJobMetrics(metricsPath);
    }

    const stdout = await executePs();
    let totalKilobytes = 0;
    let processCount = 0;
    for (const line of stdout.split("\n")) {
      const match = /^\s*(\d+)\s+(\d+)\s*$/.exec(line);
      if (match === null) {
        continue;
      }
      const parsedGroupId = Number(match[1]);
      const rssKilobytes = Number(match[2]);
      if (parsedGroupId === processGroupId && Number.isFinite(rssKilobytes)) {
        totalKilobytes += rssKilobytes;
        processCount += 1;
      }
    }
    return Object.freeze({
      rssBytes: totalKilobytes * 1024,
      processCount,
    });
  }
}

async function readWindowsJobMetrics(path: string): Promise<ProcessGroupResources> {
  const contents = await readFile(path, { encoding: "utf8" });
  return parseWindowsJobMetrics(contents);
}

export function parseWindowsJobMetrics(contents: string): ProcessGroupResources {
  let value: unknown;
  try {
    value = JSON.parse(contents) as unknown;
  } catch {
    throw new Error("Windows Job Object metrics are not valid JSON");
  }
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.keys(value).sort().join(",") !== "processCount,rssBytes"
  ) {
    throw new Error("Windows Job Object metrics have an invalid shape");
  }
  const metrics = value as Record<string, unknown>;
  if (
    !Number.isSafeInteger(metrics.rssBytes) ||
    Number(metrics.rssBytes) < 0 ||
    !Number.isSafeInteger(metrics.processCount) ||
    Number(metrics.processCount) < 0
  ) {
    throw new Error("Windows Job Object metrics are out of range");
  }
  return Object.freeze({
    rssBytes: Number(metrics.rssBytes),
    processCount: Number(metrics.processCount),
  });
}

function executePs(): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      "/bin/ps",
      ["-axo", "pgid=,rss="],
      {
        encoding: "utf8",
        env: {
          LANG: "C",
          LC_ALL: "C",
          PATH: "/usr/bin:/bin",
        },
        maxBuffer: 4 * 1024 * 1024,
        shell: false,
        timeout: 1_000,
        windowsHide: true,
      },
      (error, stdout) => {
        if (error !== null) {
          reject(error);
          return;
        }
        resolve(stdout);
      },
    );
  });
}

function isNoSuchProcessError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { readonly code?: unknown }).code === "ESRCH"
  );
}

function isPermissionError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { readonly code?: unknown }).code === "EPERM"
  );
}
