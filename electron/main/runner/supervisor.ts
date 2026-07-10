import { Buffer } from "node:buffer";
import type { TerminationReason } from "../../../src/shared/api.js";
import type {
  ManagedChildProcess,
  ProcessHost,
  RemoveListener,
  RunnerClock,
  SpawnSpecification,
  TimerToken,
} from "./process-host.js";

export interface SupervisionLimits {
  readonly wallTimeMs: number;
  readonly maxOutputBytes: number;
  readonly maxRssBytes: number;
  readonly maxProcessCount: number;
  readonly rssPollIntervalMs: number;
}

export type ProcessTerminationReason =
  Exclude<TerminationReason, "not-started"> | "process-count-limit";

export interface ProcessOutcome {
  readonly stdout: Uint8Array;
  readonly stderr: Uint8Array;
  readonly exitCode: number | null;
  readonly signal: string | null;
  readonly termination: ProcessTerminationReason;
  readonly durationMs: number;
  readonly processControlFailed: boolean;
}

export interface SupervisorDependencies {
  readonly clock: RunnerClock;
  readonly processHost: ProcessHost;
}

const KILL_REAP_TIMEOUT_MS = 1_000;
const KILL_REAP_POLL_INTERVAL_MS = 10;

export async function superviseProcess(
  specification: SpawnSpecification,
  input: Uint8Array,
  limits: SupervisionLimits,
  dependencies: SupervisorDependencies,
): Promise<ProcessOutcome> {
  const startedAt = dependencies.clock.now();
  let child: ManagedChildProcess;

  try {
    child = dependencies.processHost.spawn(specification);
  } catch {
    return makeOutcome("spawn-error", startedAt, dependencies.clock, [], [], null, null, false);
  }

  if (child.pid === undefined || child.pid <= 1) {
    child.kill("SIGKILL");
    return makeOutcome("spawn-error", startedAt, dependencies.clock, [], [], null, null, false);
  }

  const processGroupId = child.pid;
  const stdoutChunks: Buffer[] = [];
  const stderrChunks: Buffer[] = [];
  const listeners: RemoveListener[] = [];
  let capturedBytes = 0;
  let wallTimer: TimerToken | undefined;
  let rssTimer: TimerToken | undefined;
  let reapTimer: TimerToken | undefined;
  let reapPollTimer: TimerToken | undefined;
  let winner: ProcessTerminationReason | undefined;
  let exitCode: number | null = null;
  let exitSignal: string | null = null;
  let closeObserved = false;
  let finished = false;
  let terminationInProgress = false;
  let processControlFailed = false;
  let resolveOutcome: ((outcome: ProcessOutcome) => void) | undefined;

  const outcomePromise = new Promise<ProcessOutcome>((resolve) => {
    resolveOutcome = resolve;
  });

  const clearLimitTimers = (): void => {
    if (wallTimer !== undefined) {
      dependencies.clock.clearTimeout(wallTimer);
      wallTimer = undefined;
    }
    if (rssTimer !== undefined) {
      dependencies.clock.clearTimeout(rssTimer);
      rssTimer = undefined;
    }
  };

  const removeListeners = (): void => {
    for (const removeListener of listeners.splice(0)) {
      removeListener();
    }
  };

  const clearReapTimers = (): void => {
    if (reapTimer !== undefined) {
      dependencies.clock.clearTimeout(reapTimer);
      reapTimer = undefined;
    }
    if (reapPollTimer !== undefined) {
      dependencies.clock.clearTimeout(reapPollTimer);
      reapPollTimer = undefined;
    }
  };

  const finish = (reason: ProcessTerminationReason): void => {
    if (finished) {
      return;
    }
    finished = true;
    clearLimitTimers();
    clearReapTimers();
    removeListeners();
    resolveOutcome?.(
      makeOutcome(
        reason,
        startedAt,
        dependencies.clock,
        stdoutChunks,
        stderrChunks,
        exitCode,
        exitSignal,
        processControlFailed,
      ),
    );
  };

  const observeProcessGroupGone = (): boolean | undefined => {
    try {
      return !dependencies.processHost.isProcessGroupAlive(processGroupId);
    } catch {
      processControlFailed = true;
      return undefined;
    }
  };

  const scheduleReapPoll = (): void => {
    if (finished || !terminationInProgress || reapPollTimer !== undefined) {
      return;
    }
    reapPollTimer = dependencies.clock.setTimeout(() => {
      reapPollTimer = undefined;
      const processGroupGone = observeProcessGroupGone();
      if (closeObserved && processGroupGone === true) {
        finish(winner as ProcessTerminationReason);
        return;
      }
      scheduleReapPoll();
    }, KILL_REAP_POLL_INTERVAL_MS);
  };

  const waitForCloseAndReap = (): void => {
    const processGroupGone = observeProcessGroupGone();
    if (closeObserved && processGroupGone === true) {
      finish(winner as ProcessTerminationReason);
      return;
    }
    scheduleReapPoll();
  };

  const terminate = (
    reason: ProcessTerminationReason,
    forceProcessControlFailure = false,
  ): void => {
    if (finished || terminationInProgress) {
      return;
    }
    terminationInProgress = true;
    winner = reason;
    if (forceProcessControlFailure) {
      processControlFailed = true;
    }
    clearLimitTimers();
    try {
      dependencies.processHost.killProcessGroup(processGroupId, "SIGKILL");
    } catch {
      processControlFailed = true;
      try {
        if (!child.kill("SIGKILL")) {
          processControlFailed = true;
        }
      } catch {
        processControlFailed = true;
      }
    }
    reapTimer = dependencies.clock.setTimeout(() => {
      reapTimer = undefined;
      const processGroupGone = observeProcessGroupGone();
      if (!closeObserved || processGroupGone !== true) {
        processControlFailed = true;
      }
      finish(reason);
    }, KILL_REAP_TIMEOUT_MS);
    waitForCloseAndReap();
  };

  const capture = (chunk: Uint8Array, destination: Buffer[]): void => {
    if (terminationInProgress) {
      return;
    }
    const buffer = Buffer.from(chunk);
    const remaining = Math.max(0, limits.maxOutputBytes - capturedBytes);
    if (remaining > 0) {
      const captured = buffer.subarray(0, Math.min(remaining, buffer.byteLength));
      destination.push(Buffer.from(captured));
      capturedBytes += captured.byteLength;
    }
    if ((winner === undefined || winner === "process-exit") && buffer.byteLength > remaining) {
      terminate("output-limit");
    }
  };

  listeners.push(
    child.onStdout((chunk) => capture(chunk, stdoutChunks)),
    child.onStderr((chunk) => capture(chunk, stderrChunks)),
    child.onError(() => {
      terminate("spawn-error");
    }),
    child.onInputError(() => terminate("input-error")),
    child.onExit((code, signal) => {
      exitCode = code;
      exitSignal = signal;
      if (winner === undefined) {
        // "exit" only means the leader ended. Descendants can still hold the
        // stdio pipes open, so resource watchdogs stay active until "close".
        winner = "process-exit";
      }
    }),
    child.onClose((code, signal) => {
      closeObserved = true;
      exitCode = code;
      exitSignal = signal;
      if (winner === undefined) {
        winner = "process-exit";
      }
      if (winner === "process-exit") {
        const processGroupGone = observeProcessGroupGone();
        if (processGroupGone === true) {
          finish("process-exit");
          return;
        }
        // A descendant can close inherited stdio and keep running in the same
        // process group. Treat that residue as a control failure, kill it, and
        // still wait for bounded confirmation instead of reporting success.
        terminate("process-exit", true);
        return;
      }
      waitForCloseAndReap();
    }),
  );

  wallTimer = dependencies.clock.setTimeout(() => terminate("wall-time-limit"), limits.wallTimeMs);

  const pollRss = (): void => {
    rssTimer = dependencies.clock.setTimeout(() => {
      rssTimer = undefined;
      void dependencies.processHost
        .sampleProcessGroupResources(processGroupId)
        .then(({ rssBytes, processCount }) => {
          if (finished || terminationInProgress) {
            return;
          }
          if (
            !Number.isFinite(rssBytes) ||
            rssBytes < 0 ||
            !Number.isSafeInteger(processCount) ||
            processCount < 0
          ) {
            terminate("rss-monitor-error");
            return;
          }
          if (processCount > limits.maxProcessCount) {
            terminate("process-count-limit");
            return;
          }
          if (rssBytes > limits.maxRssBytes) {
            terminate("rss-limit");
            return;
          }
          pollRss();
        })
        .catch(() => terminate("rss-monitor-error"));
    }, limits.rssPollIntervalMs);
  };
  pollRss();

  try {
    child.endInput(input);
  } catch {
    terminate("input-error");
  }

  return outcomePromise;
}

function makeOutcome(
  termination: ProcessTerminationReason,
  startedAt: number,
  clock: RunnerClock,
  stdoutChunks: readonly Buffer[],
  stderrChunks: readonly Buffer[],
  exitCode: number | null,
  signal: string | null,
  processControlFailed: boolean,
): ProcessOutcome {
  return Object.freeze({
    stdout: Uint8Array.from(Buffer.concat(stdoutChunks)),
    stderr: Uint8Array.from(Buffer.concat(stderrChunks)),
    exitCode,
    signal,
    termination,
    durationMs: Math.max(0, clock.now() - startedAt),
    processControlFailed,
  });
}
