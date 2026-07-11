import type { CParser } from "../core/index.js";
import { createBrowserCParser } from "../renderer/c-parser.js";
import { analyzeProgramSnapshot } from "./program-analysis-session.js";
import type {
  ProgramAnalysisWorkerInbound,
  ProgramAnalysisWorkerOutbound,
  ProgramAnalysisWorkerRequest,
} from "./program-analysis-worker-protocol.js";

interface WorkerScope {
  postMessage(message: ProgramAnalysisWorkerOutbound): void;
  addEventListener(type: "message", listener: (event: MessageEvent<unknown>) => void): void;
  close(): void;
}

const scope = globalThis as unknown as WorkerScope;
let parserPromise: Promise<CParser> | null = null;
let latestRequestId = 0;
let disposed = false;

scope.addEventListener("message", (event) => {
  const message = event.data;
  if (!isInbound(message) || disposed) return;
  if (message.type === "dispose") {
    disposed = true;
    latestRequestId += 1;
    void parserPromise?.then((parser) => parser.dispose()).finally(() => scope.close());
    if (parserPromise === null) scope.close();
    return;
  }
  latestRequestId = message.requestId;
  void analyzeProgressively(message);
});

async function analyzeProgressively(request: ProgramAnalysisWorkerRequest): Promise<void> {
  try {
    const parser = await requireParser();
    let limit = 1;
    let previousCount = -1;
    while (!disposed && latestRequestId === request.requestId) {
      const analysis = analyzeProgramSnapshot(
        parser,
        request.source,
        request.revision,
        request.projectedBlockCount,
        { functionLimit: limit },
      );
      const complete =
        analysis.functions.length < limit || analysis.functions.length === previousCount;
      scope.postMessage(
        Object.freeze({
          type: "snapshot",
          requestId: request.requestId,
          complete,
          analysis,
        }),
      );
      if (complete) return;
      previousCount = analysis.functions.length;
      limit = limit < 8 ? limit + 1 : limit + 8;
      await yieldWorker();
    }
  } catch (error: unknown) {
    if (disposed || latestRequestId !== request.requestId) return;
    scope.postMessage(
      Object.freeze({
        type: "error",
        requestId: request.requestId,
        message: error instanceof Error ? error.message : "后台分析失败",
      }),
    );
  }
}

function requireParser(): Promise<CParser> {
  parserPromise ??= createBrowserCParser();
  return parserPromise;
}

function yieldWorker(): Promise<void> {
  return new Promise((resolve) => globalThis.setTimeout(resolve, 0));
}

function isInbound(value: unknown): value is ProgramAnalysisWorkerInbound {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const message = value as Record<string, unknown>;
  if (message.type === "dispose") return Object.keys(message).length === 1;
  return (
    message.type === "analyze" &&
    Number.isSafeInteger(message.requestId) &&
    (message.requestId as number) > 0 &&
    typeof message.source === "string" &&
    Number.isSafeInteger(message.revision) &&
    (message.revision as number) >= 0 &&
    Number.isSafeInteger(message.projectedBlockCount) &&
    (message.projectedBlockCount as number) >= 0
  );
}
