import { afterEach, describe, expect, it, vi } from "vitest";
import type { WorkspaceEntrySummary, WorkspaceSaveResult } from "../../src/shared/workspace.js";
import {
  createWorkspacePersistence,
  type WorkspacePersistenceStatus,
} from "../../src/app/workspace-persistence.js";

afterEach(() => {
  vi.useRealTimers();
});

describe("managed workspace persistence", () => {
  it("debounces an edit and advances the durable revision only after acknowledgement", async () => {
    vi.useFakeTimers();
    const statuses: WorkspacePersistenceStatus[] = [];
    const save = vi.fn(async () => saved(1));
    const persistence = createWorkspacePersistence({
      save,
      onStatus: (status) => statuses.push(status),
    });
    persistence.adopt(entry(0));
    persistence.handleSourceChange("int value = 1;\n");

    await vi.advanceTimersByTimeAsync(299);
    expect(save).not.toHaveBeenCalled();
    expect(persistence.activeEntry?.revision).toBe(0);
    await vi.advanceTimersByTimeAsync(1);
    await persistence.flush();

    expect(save).toHaveBeenCalledWith("project-entry", 0, "int value = 1;\n");
    expect(persistence.activeEntry?.revision).toBe(1);
    expect(statuses.map(({ state }) => state)).toEqual([
      "unmanaged",
      "saved",
      "pending",
      "saving",
      "saved",
    ]);
  });

  it("serializes rapid saves so a stale revision cannot overtake a newer edit", async () => {
    vi.useFakeTimers();
    const first = deferred<WorkspaceSaveResult>();
    const calls: { revision: number; source: string }[] = [];
    const save = vi.fn(async (_id: string, revision: number, source: string) => {
      calls.push({ revision, source });
      if (calls.length === 1) return first.promise;
      return saved(2);
    });
    const persistence = createWorkspacePersistence({
      save,
      onStatus: () => undefined,
      delayMs: 10,
    });
    persistence.adopt(entry(0));
    persistence.handleSourceChange("first");
    await vi.advanceTimersByTimeAsync(10);
    persistence.handleSourceChange("second");
    await vi.advanceTimersByTimeAsync(10);
    expect(calls).toEqual([{ revision: 0, source: "first" }]);

    first.resolve(saved(1));
    await persistence.flush();
    expect(calls).toEqual([
      { revision: 0, source: "first" },
      { revision: 1, source: "second" },
    ]);
    expect(persistence.activeEntry?.revision).toBe(2);
  });

  it("surfaces conflicts without claiming the source was saved", async () => {
    const statuses: WorkspacePersistenceStatus[] = [];
    const persistence = createWorkspacePersistence({
      delayMs: 0,
      save: async () => ({
        status: "failed",
        error: { code: "WORKSPACE_CONFLICT", message: "磁盘版本已更新" },
      }),
      onStatus: (status) => statuses.push(status),
    });
    persistence.adopt(entry(3));
    persistence.handleSourceChange("changed");
    await persistence.flush();

    expect(persistence.activeEntry?.revision).toBe(3);
    expect(statuses.at(-1)).toEqual({
      state: "error",
      message: "WORKSPACE_CONFLICT · 磁盘版本已更新",
    });
  });

  it("queues pending source before deactivation and labels external documents honestly", async () => {
    const statuses: WorkspacePersistenceStatus[] = [];
    const save = vi.fn(async () => saved(1));
    const persistence = createWorkspacePersistence({
      delayMs: 1_000,
      save,
      onStatus: (status) => statuses.push(status),
    });
    persistence.adopt(entry(0));
    persistence.handleSourceChange("last local change");
    persistence.deactivate();
    await Promise.resolve();
    await Promise.resolve();

    expect(save).toHaveBeenCalledWith("project-entry", 0, "last local change");
    expect(persistence.activeEntry).toBeNull();
    expect(statuses.at(-1)).toEqual({ state: "unmanaged", message: "临时文档 · 未自动保存" });
  });
});

function entry(revision: number): WorkspaceEntrySummary {
  return Object.freeze({
    id: "project-entry",
    kind: "project",
    title: "Project",
    sourceName: "main.c",
    revision,
    byteLength: 1,
    createdAt: "2026-07-11T00:00:00.000Z",
    updatedAt: "2026-07-11T00:00:00.000Z",
  });
}

function saved(revision: number): WorkspaceSaveResult {
  return { status: "saved", entry: entry(revision) };
}

function deferred<T>(): { readonly promise: Promise<T>; resolve(value: T): void } {
  let resolvePromise: (value: T) => void = () => undefined;
  const promise = new Promise<T>((resolve) => {
    resolvePromise = resolve;
  });
  return { promise, resolve: resolvePromise };
}
