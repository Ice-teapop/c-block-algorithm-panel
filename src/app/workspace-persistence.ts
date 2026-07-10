import type { WorkspaceEntrySummary, WorkspaceSaveResult } from "../shared/workspace.js";

export type WorkspacePersistenceState = "unmanaged" | "pending" | "saving" | "saved" | "error";

export interface WorkspacePersistenceStatus {
  readonly state: WorkspacePersistenceState;
  readonly message: string;
}

export interface WorkspacePersistenceOptions {
  readonly delayMs?: number;
  readonly save: (
    entryId: string,
    expectedRevision: number,
    source: string,
  ) => Promise<WorkspaceSaveResult>;
  readonly onStatus: (status: WorkspacePersistenceStatus) => void;
}

export interface WorkspacePersistence {
  readonly activeEntry: WorkspaceEntrySummary | null;
  adopt(entry: WorkspaceEntrySummary): void;
  handleSourceChange(source: string): void;
  flush(): Promise<void>;
  deactivate(): void;
  destroy(): void;
}

const DEFAULT_SAVE_DELAY_MS = 300;

interface PendingSource {
  readonly entryId: string;
  readonly source: string;
}

export function createWorkspacePersistence(
  options: WorkspacePersistenceOptions,
): WorkspacePersistence {
  const delayMs = options.delayMs ?? DEFAULT_SAVE_DELAY_MS;
  if (!Number.isSafeInteger(delayMs) || delayMs < 0) {
    throw new RangeError("workspace persistence delayMs 必须是非负安全整数");
  }
  if (typeof options.save !== "function" || typeof options.onStatus !== "function") {
    throw new TypeError("workspace persistence callbacks 无效");
  }

  const durableEntries = new Map<string, WorkspaceEntrySummary>();
  const saveChains = new Map<string, Promise<void>>();
  const latestSequence = new Map<string, number>();
  let activeEntry: WorkspaceEntrySummary | null = null;
  let pending: PendingSource | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let destroyed = false;

  const present = (state: WorkspacePersistenceState, message: string): void => {
    if (!destroyed) options.onStatus(Object.freeze({ state, message }));
  };

  const clearTimer = (): void => {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
  };

  const queuePending = (): Promise<void> | undefined => {
    clearTimer();
    const next = pending;
    pending = null;
    if (next === null) return saveChains.get(activeEntry?.id ?? "");

    const sequence = (latestSequence.get(next.entryId) ?? 0) + 1;
    latestSequence.set(next.entryId, sequence);
    const previous = saveChains.get(next.entryId) ?? Promise.resolve();
    if (activeEntry?.id === next.entryId) present("saving", "正在同步到 Documents…");
    const task = previous
      .catch(() => undefined)
      .then(async () => {
        const durable = durableEntries.get(next.entryId);
        if (durable === undefined) return;
        let result: WorkspaceSaveResult;
        try {
          result = await options.save(next.entryId, durable.revision, next.source);
        } catch {
          if (activeEntry?.id === next.entryId) {
            present("error", "保存失败 · 工作区 IPC 不可用");
          }
          return;
        }
        if (result.status === "failed") {
          if (activeEntry?.id === next.entryId) {
            present("error", `${result.error.code} · ${result.error.message}`);
          }
          return;
        }
        const savedEntry = Object.freeze({ ...result.entry });
        durableEntries.set(next.entryId, savedEntry);
        if (activeEntry?.id === next.entryId) activeEntry = savedEntry;
        if (
          activeEntry?.id === next.entryId &&
          latestSequence.get(next.entryId) === sequence &&
          pending?.entryId !== next.entryId
        ) {
          present("saved", "已保存到 Documents");
        }
      });
    saveChains.set(next.entryId, task);
    void task.finally(() => {
      if (saveChains.get(next.entryId) === task) saveChains.delete(next.entryId);
    });
    return task;
  };

  const schedule = (): void => {
    clearTimer();
    if (delayMs === 0) {
      void queuePending();
      return;
    }
    timer = setTimeout(() => {
      timer = undefined;
      void queuePending();
    }, delayMs);
  };

  present("unmanaged", "本地工作区未打开");

  return Object.freeze({
    get activeEntry(): WorkspaceEntrySummary | null {
      return activeEntry;
    },
    adopt(entry: WorkspaceEntrySummary): void {
      assertActive(destroyed);
      if (entry === null || typeof entry !== "object" || typeof entry.id !== "string") {
        throw new TypeError("workspace entry 无效");
      }
      void queuePending();
      activeEntry = Object.freeze({ ...entry });
      durableEntries.set(entry.id, activeEntry);
      present("saved", "已保存到 Documents");
    },
    handleSourceChange(source: string): void {
      if (destroyed || activeEntry === null) return;
      if (typeof source !== "string") throw new TypeError("source 必须是字符串");
      pending = Object.freeze({ entryId: activeEntry.id, source });
      present("pending", "有修改待保存");
      schedule();
    },
    async flush(): Promise<void> {
      if (destroyed) return;
      const activeId = activeEntry?.id;
      const queued = queuePending();
      await queued;
      if (activeId !== undefined) await saveChains.get(activeId);
    },
    deactivate(): void {
      if (destroyed) return;
      void queuePending();
      activeEntry = null;
      present("unmanaged", "临时文档 · 未自动保存");
    },
    destroy(): void {
      if (destroyed) return;
      void queuePending();
      destroyed = true;
      clearTimer();
      activeEntry = null;
    },
  });
}

function assertActive(destroyed: boolean): void {
  if (destroyed) throw new Error("workspace persistence 已销毁");
}
