import { describe, expect, it, vi } from "vitest";
import {
  createWorkspaceSidecarPersistence,
  type SidecarPersistenceStatus,
} from "../../src/app/workspace-sidecar-persistence.js";
import type {
  SaveWorkspaceSidecarRequest,
  WorkspaceSidecarDocument,
} from "../../src/shared/workspace-sidecar.js";

describe("workspace sidecar persistence", () => {
  it("loads a matching sidecar and serializes debounced revisions", async () => {
    vi.useFakeTimers();
    const statuses: SidecarPersistenceStatus[] = [];
    const saves: SaveWorkspaceSidecarRequest[] = [];
    let revision = 2;
    const persistence = createWorkspaceSidecarPersistence({
      kind: "flow-view",
      delayMs: 20,
      read: async () => ({
        status: "ready",
        document: document("flow-view", 2, "source:a", '{"x":1}'),
      }),
      save: async (request) => {
        saves.push(request);
        revision += 1;
        return {
          status: "saved",
          document: document("flow-view", revision, request.sourceFingerprint, request.serialized),
        };
      },
      onStatus: (status) => statuses.push(status),
    });

    await expect(persistence.adopt("project-a", "source:a")).resolves.toMatchObject({
      matchesSource: true,
      document: { revision: 2 },
    });
    persistence.update('{"x":2}', "source:a");
    persistence.update('{"x":3}', "source:a");
    expect(persistence.hasPendingChanges).toBe(true);
    await vi.advanceTimersByTimeAsync(20);
    await persistence.flush();
    expect(saves).toEqual([
      expect.objectContaining({ expectedRevision: 2, serialized: '{"x":3}' }),
    ]);
    expect(statuses.at(-1)).toMatchObject({ state: "ready" });
    persistence.destroy();
    vi.useRealTimers();
  });

  it("reports stale source identities without applying sidecar data", async () => {
    const persistence = createWorkspaceSidecarPersistence({
      kind: "scenarios",
      read: async () => ({
        status: "ready",
        document: document("scenarios", 0, "old", '{"items":[]}'),
      }),
      save: async () => {
        throw new Error("not expected");
      },
    });
    await expect(persistence.adopt("project-a", "new")).resolves.toEqual({
      document: document("scenarios", 0, "old", '{"items":[]}'),
      matchesSource: false,
    });
  });

  it("does not mark an unchanged restored sidecar as pending", async () => {
    const save = vi.fn();
    const persistence = createWorkspaceSidecarPersistence({
      kind: "flow-view",
      read: async () => ({
        status: "ready",
        document: document("flow-view", 3, "source:a", '{"x":1}'),
      }),
      save,
    });

    await persistence.adopt("project-a", "source:a");
    persistence.update('{"x":1}', "source:a");

    expect(persistence.hasPendingChanges).toBe(false);
    await persistence.flush();
    expect(save).not.toHaveBeenCalled();
  });

  it("writes a durable rollback requested while a newer save is in flight", async () => {
    let finishFirstSave: (result: ReturnType<typeof savedResult>) => void = () => undefined;
    const firstSave = new Promise<ReturnType<typeof savedResult>>((resolve) => {
      finishFirstSave = resolve;
    });
    const saves: SaveWorkspaceSidecarRequest[] = [];
    const persistence = createWorkspaceSidecarPersistence({
      kind: "flow-view",
      delayMs: 0,
      read: async () => ({
        status: "ready",
        document: document("flow-view", 3, "source:a", '{"x":1}'),
      }),
      save: async (request) => {
        saves.push(request);
        if (saves.length === 1) return firstSave;
        return savedResult(5, request);
      },
    });

    await persistence.adopt("project-a", "source:a");
    persistence.update('{"x":2}', "source:a");
    persistence.update('{"x":1}', "source:a");
    const flushing = persistence.flush();
    finishFirstSave(
      savedResult(4, {
        entryId: "project-a",
        kind: "flow-view",
        expectedRevision: 3,
        sourceFingerprint: "source:a",
        serialized: '{"x":2}',
      }),
    );
    await flushing;

    expect(saves.map((request) => request.serialized)).toEqual(['{"x":2}', '{"x":1}']);
  });

  it("surfaces optimistic concurrency failures and keeps source persistence independent", async () => {
    const persistence = createWorkspaceSidecarPersistence({
      kind: "run-history",
      delayMs: 0,
      read: async () => ({ status: "missing", kind: "run-history" }),
      save: async () => ({
        status: "failed",
        error: { code: "WORKSPACE_CONFLICT", message: "stale" },
      }),
    });
    await persistence.adopt("project-a", "source:a");
    persistence.update('{"runs":[]}', "source:a");
    await expect(persistence.flush()).rejects.toThrow(/WORKSPACE_CONFLICT/u);
  });
});

function document(
  kind: WorkspaceSidecarDocument["kind"],
  revision: number,
  sourceFingerprint: string,
  serialized: string,
): WorkspaceSidecarDocument {
  return Object.freeze({
    kind,
    revision,
    sourceFingerprint,
    serialized,
    updatedAt: "2026-07-12T00:00:00.000Z",
  });
}

function savedResult(revision: number, request: SaveWorkspaceSidecarRequest) {
  return {
    status: "saved" as const,
    document: document(request.kind, revision, request.sourceFingerprint, request.serialized),
  };
}
