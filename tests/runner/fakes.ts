import { EventEmitter } from "node:events";
import type {
  ManagedChildProcess,
  ProcessHost,
  ProcessGroupResources,
  RemoveListener,
  RunnerClock,
  SpawnSpecification,
  TimerToken,
} from "../../electron/main/runner/process-host.js";

interface ScheduledTask {
  readonly id: number;
  readonly at: number;
  readonly callback: () => void;
}

export class FakeClock implements RunnerClock {
  #now: number;
  #nextId = 1;
  readonly #tasks = new Map<number, ScheduledTask>();

  constructor(now = 0) {
    this.#now = now;
  }

  now(): number {
    return this.#now;
  }

  setTimeout(callback: () => void, delayMs: number): TimerToken {
    const id = this.#nextId;
    this.#nextId += 1;
    this.#tasks.set(id, {
      id,
      at: this.#now + Math.max(0, delayMs),
      callback,
    });
    return id;
  }

  clearTimeout(token: TimerToken): void {
    if (typeof token === "number") {
      this.#tasks.delete(token);
    }
  }

  advanceBy(milliseconds: number): void {
    const target = this.#now + milliseconds;
    while (true) {
      const next = [...this.#tasks.values()]
        .filter((task) => task.at <= target)
        .sort((left, right) => left.at - right.at || left.id - right.id)[0];
      if (next === undefined) {
        break;
      }
      this.#tasks.delete(next.id);
      this.#now = next.at;
      next.callback();
    }
    this.#now = target;
  }

  get pendingTimerCount(): number {
    return this.#tasks.size;
  }
}

export class FakeChildProcess implements ManagedChildProcess {
  readonly #events = new EventEmitter();
  readonly pid: number | undefined;
  readonly inputChunks: Uint8Array[] = [];
  readonly killSignals: NodeJS.Signals[] = [];
  throwOnInput = false;

  constructor(pid = 4_242) {
    this.pid = pid;
  }

  onStdout(listener: (chunk: Uint8Array) => void): RemoveListener {
    return this.#listen("stdout", listener);
  }

  onStderr(listener: (chunk: Uint8Array) => void): RemoveListener {
    return this.#listen("stderr", listener);
  }

  onExit(listener: (code: number | null, signal: string | null) => void): RemoveListener {
    return this.#listen("exit", listener);
  }

  onClose(listener: (code: number | null, signal: string | null) => void): RemoveListener {
    return this.#listen("close", listener);
  }

  onError(listener: (error: Error) => void): RemoveListener {
    return this.#listen("error", listener);
  }

  onInputError(listener: (error: Error) => void): RemoveListener {
    return this.#listen("input-error", listener);
  }

  endInput(input: Uint8Array): void {
    if (this.throwOnInput) {
      throw new Error("input failed");
    }
    this.inputChunks.push(Uint8Array.from(input));
  }

  kill(signal: NodeJS.Signals): boolean {
    this.killSignals.push(signal);
    return true;
  }

  emitStdout(value: string | Uint8Array): void {
    this.#events.emit("stdout", bytes(value));
  }

  emitStderr(value: string | Uint8Array): void {
    this.#events.emit("stderr", bytes(value));
  }

  emitExit(code: number | null, signal: string | null = null): void {
    this.#events.emit("exit", code, signal);
  }

  emitClose(code: number | null, signal: string | null = null): void {
    this.#events.emit("close", code, signal);
  }

  complete(code = 0, signal: string | null = null): void {
    this.emitExit(code, signal);
    this.emitClose(code, signal);
  }

  emitError(error = new Error("spawn failed")): void {
    this.#events.emit("error", error);
  }

  emitInputError(error = new Error("input failed")): void {
    this.#events.emit("input-error", error);
  }

  listenerCount(event: "input-error" | "close" | "exit"): number {
    return this.#events.listenerCount(event);
  }

  #listen<Arguments extends unknown[]>(
    event: string,
    listener: (...args: Arguments) => void,
  ): RemoveListener {
    const handler = (...args: unknown[]): void => {
      listener(...(args as Arguments));
    };
    this.#events.on(event, handler);
    return () => this.#events.off(event, handler);
  }
}

export type SpawnPlan = (specification: SpawnSpecification, child: FakeChildProcess) => void;

export class FakeProcessHost implements ProcessHost {
  readonly specifications: SpawnSpecification[] = [];
  readonly children: FakeChildProcess[] = [];
  readonly groupKills: Array<{
    readonly processGroupId: number;
    readonly signal: NodeJS.Signals;
  }> = [];
  readonly resourceSamples: number[] = [];
  readonly groupLivenessChecks: number[] = [];
  readonly #plans: SpawnPlan[];
  rssBytes = 0;
  processCount = 1;
  rssError: Error | undefined;
  killError: Error | undefined;
  groupLivenessError: Error | undefined;
  groupAlive = true;
  keepGroupAliveAfterKill = false;
  keepGroupAliveAfterClose = false;

  constructor(plans: readonly SpawnPlan[] = []) {
    this.#plans = [...plans];
  }

  spawn(specification: SpawnSpecification): ManagedChildProcess {
    const child = new FakeChildProcess(4_242 + this.children.length);
    this.specifications.push(specification);
    this.children.push(child);
    child.onClose(() => {
      if (!this.keepGroupAliveAfterClose) {
        this.groupAlive = false;
      }
    });
    this.#plans.shift()?.(specification, child);
    return child;
  }

  killProcessGroup(processGroupId: number, signal: NodeJS.Signals): void {
    this.groupKills.push({ processGroupId, signal });
    if (this.killError !== undefined) {
      throw this.killError;
    }
    if (!this.keepGroupAliveAfterKill) {
      this.groupAlive = false;
    }
  }

  isProcessGroupAlive(processGroupId: number): boolean {
    this.groupLivenessChecks.push(processGroupId);
    if (this.groupLivenessError !== undefined) {
      throw this.groupLivenessError;
    }
    return this.groupAlive;
  }

  async sampleProcessGroupResources(processGroupId: number): Promise<ProcessGroupResources> {
    this.resourceSamples.push(processGroupId);
    if (this.rssError !== undefined) {
      throw this.rssError;
    }
    return Object.freeze({
      rssBytes: this.rssBytes,
      processCount: this.processCount,
    });
  }
}

export function unavailableProbe(): {
  readonly probe: () => Promise<{
    readonly status: "unavailable";
    readonly detail: string;
  }>;
} {
  return {
    probe: async () => ({
      status: "unavailable",
      detail: "当前环境无法启动嵌套 sandbox-exec；默认拒绝运行。",
    }),
  };
}

export function availableProbe(): {
  readonly probe: () => Promise<{
    readonly status: "probe-succeeded";
    readonly detail: string;
  }>;
} {
  return {
    probe: async () => ({
      status: "probe-succeeded",
      detail: "仅确认 sandbox-exec 可启动最小探针；这不是完整隔离验证。",
    }),
  };
}

export async function flushAsyncWork(): Promise<void> {
  await Promise.resolve();
  await new Promise<void>((resolve) => setImmediate(resolve));
}

function bytes(value: string | Uint8Array): Uint8Array {
  return typeof value === "string"
    ? Uint8Array.from(Buffer.from(value, "utf8"))
    : Uint8Array.from(value);
}
