import type { ProgramAnalysisSnapshot } from "../analysis/index.js";
import { fingerprintSource } from "../shared/source-snapshot.js";
import type {
  ProgramAnalysisWorkerInbound,
  ProgramAnalysisWorkerOutbound,
} from "./program-analysis-worker-protocol.js";

export interface ProgramAnalysisWorkerLike {
  postMessage(message: ProgramAnalysisWorkerInbound): void;
  addEventListener(
    type: "message",
    listener: (event: MessageEvent<ProgramAnalysisWorkerOutbound>) => void,
  ): void;
  removeEventListener(
    type: "message",
    listener: (event: MessageEvent<ProgramAnalysisWorkerOutbound>) => void,
  ): void;
  terminate(): void;
}

export interface ProgramAnalysisWorkerClientOptions {
  readonly workerFactory?: (() => ProgramAnalysisWorkerLike) | undefined;
}

export interface ProgramAnalysisWorkerCallbacks {
  readonly onSnapshot: (analysis: ProgramAnalysisSnapshot, complete: boolean) => void;
  readonly onError: (error: Error) => void;
}

export interface ProgramAnalysisWorkerClient {
  analyze(
    source: string,
    revision: number,
    projectedBlockCount: number,
    callbacks: ProgramAnalysisWorkerCallbacks,
  ): number;
  destroy(): void;
}

interface ActiveRequest {
  readonly id: number;
  readonly sourceFingerprint: string;
  readonly sourceLength: number;
  readonly revision: number;
  readonly callbacks: ProgramAnalysisWorkerCallbacks;
  functionCount: number;
}

export function createProgramAnalysisWorkerClient(
  options: ProgramAnalysisWorkerClientOptions = {},
): ProgramAnalysisWorkerClient {
  const worker = (options.workerFactory ?? defaultWorkerFactory)();
  let sequence = 0;
  let active: ActiveRequest | null = null;
  let destroyed = false;

  const onMessage = (event: MessageEvent<ProgramAnalysisWorkerOutbound>): void => {
    if (destroyed || active === null || event.data.requestId !== active.id) return;
    const message = event.data;
    if (message.type === "error") {
      active.callbacks.onError(new Error(message.message));
      return;
    }
    const analysis = message.analysis;
    if (
      analysis.revision !== active.revision ||
      analysis.sourceLength !== active.sourceLength ||
      analysis.sourceFingerprint !== active.sourceFingerprint ||
      analysis.functions.length < active.functionCount
    ) {
      active.callbacks.onError(new Error("后台分析返回了过期或非单调快照"));
      return;
    }
    active.functionCount = analysis.functions.length;
    active.callbacks.onSnapshot(analysis, message.complete);
  };
  worker.addEventListener("message", onMessage);

  return Object.freeze({
    analyze(
      source: string,
      revision: number,
      projectedBlockCount: number,
      callbacks: ProgramAnalysisWorkerCallbacks,
    ): number {
      assertActive(destroyed);
      if (
        typeof source !== "string" ||
        !Number.isSafeInteger(revision) ||
        revision < 0 ||
        !Number.isSafeInteger(projectedBlockCount) ||
        projectedBlockCount < 0 ||
        typeof callbacks?.onSnapshot !== "function" ||
        typeof callbacks.onError !== "function"
      ) {
        throw new TypeError("后台程序分析请求无效");
      }
      const requestId = ++sequence;
      active = {
        id: requestId,
        sourceFingerprint: fingerprintSource(source),
        sourceLength: source.length,
        revision,
        callbacks,
        functionCount: 0,
      };
      worker.postMessage(
        Object.freeze({
          type: "analyze",
          requestId,
          source,
          revision,
          projectedBlockCount,
        }),
      );
      return requestId;
    },
    destroy(): void {
      if (destroyed) return;
      destroyed = true;
      active = null;
      worker.removeEventListener("message", onMessage);
      worker.postMessage(Object.freeze({ type: "dispose" }));
      worker.terminate();
    },
  });
}

function defaultWorkerFactory(): ProgramAnalysisWorkerLike {
  return new Worker(new URL("./program-analysis-worker.ts", import.meta.url), {
    type: "module",
    name: "c-program-analysis",
  });
}

function assertActive(destroyed: boolean): void {
  if (destroyed) throw new Error("后台程序分析客户端已销毁");
}
