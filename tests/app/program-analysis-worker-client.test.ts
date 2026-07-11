import { describe, expect, it, vi } from "vitest";
import type { ProgramAnalysisSnapshot } from "../../src/analysis/index.js";
import { createProgramAnalysisWorkerClient } from "../../src/app/program-analysis-worker-client.js";
import type {
  ProgramAnalysisWorkerInbound,
  ProgramAnalysisWorkerOutbound,
} from "../../src/app/program-analysis-worker-protocol.js";
import { fingerprintSource } from "../../src/shared/source-snapshot.js";
import { textRange } from "../../src/core/model.js";

describe("program analysis worker client", () => {
  it("accepts monotonic snapshots for only the latest exact source request", () => {
    const worker = new FakeWorker();
    const first = vi.fn();
    const second = vi.fn();
    const errors = vi.fn();
    const client = createProgramAnalysisWorkerClient({ workerFactory: () => worker });

    client.analyze("int a(void){return 0;}", 1, 2, {
      onSnapshot: first,
      onError: errors,
    });
    const secondId = client.analyze("int b(void){return 1;}", 2, 2, {
      onSnapshot: second,
      onError: errors,
    });

    worker.emit({
      type: "snapshot",
      requestId: 1,
      complete: true,
      analysis: snapshot("int a(void){return 0;}", 1, 0),
    });
    worker.emit({
      type: "snapshot",
      requestId: secondId,
      complete: false,
      analysis: snapshot("int b(void){return 1;}", 2, 0),
    });

    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledOnce();
    expect(errors).not.toHaveBeenCalled();
    client.destroy();
  });

  it("rejects mismatched worker snapshots and disposes idempotently", () => {
    const worker = new FakeWorker();
    const error = vi.fn();
    const client = createProgramAnalysisWorkerClient({ workerFactory: () => worker });
    const requestId = client.analyze("int main(void){return 0;}", 4, 1, {
      onSnapshot: vi.fn(),
      onError: error,
    });

    worker.emit({
      type: "snapshot",
      requestId,
      complete: true,
      analysis: snapshot("int other(void){return 0;}", 4, 0),
    });
    expect(error).toHaveBeenCalledWith(expect.objectContaining({ message: expect.any(String) }));

    client.destroy();
    client.destroy();
    expect(worker.messages.at(-1)).toEqual({ type: "dispose" });
    expect(worker.terminate).toHaveBeenCalledOnce();
    expect(() => client.analyze("", 0, 0, { onSnapshot: vi.fn(), onError: vi.fn() })).toThrow(
      /已销毁/u,
    );
  });
});

class FakeWorker {
  readonly messages: ProgramAnalysisWorkerInbound[] = [];
  readonly terminate = vi.fn();
  private readonly listeners = new Set<
    (event: MessageEvent<ProgramAnalysisWorkerOutbound>) => void
  >();

  postMessage(message: ProgramAnalysisWorkerInbound): void {
    this.messages.push(message);
  }

  addEventListener(
    _type: "message",
    listener: (event: MessageEvent<ProgramAnalysisWorkerOutbound>) => void,
  ): void {
    this.listeners.add(listener);
  }

  removeEventListener(
    _type: "message",
    listener: (event: MessageEvent<ProgramAnalysisWorkerOutbound>) => void,
  ): void {
    this.listeners.delete(listener);
  }

  emit(message: ProgramAnalysisWorkerOutbound): void {
    for (const listener of this.listeners) {
      listener({ data: message } as MessageEvent<ProgramAnalysisWorkerOutbound>);
    }
  }
}

function snapshot(
  source: string,
  revision: number,
  functionCount: number,
): ProgramAnalysisSnapshot {
  return Object.freeze({
    revision,
    sourceLength: source.length,
    sourceFingerprint: fingerprintSource(source),
    functions: Object.freeze(
      Array.from({ length: functionCount }, (_, index) => ({
        id: `f-${String(index)}`,
        name: `f${String(index)}`,
        range: textRange(0, source.length),
        entryId: `entry-${String(index)}`,
        exitId: `exit-${String(index)}`,
        nodes: [],
        edges: [],
        partial: false,
        partialReasons: [],
      })),
    ),
    defUse: Object.freeze([]),
    memoryEvents: Object.freeze([]),
    memoryTypestate: Object.freeze([]),
    findings: Object.freeze([]),
  });
}
