import type {
  SaveWorkspaceSidecarRequest,
  WorkspaceSidecarDocument,
  WorkspaceSidecarKind,
  WorkspaceSidecarReadResult,
  WorkspaceSidecarSaveResult,
} from "../shared/workspace-sidecar.js";

export type SidecarPersistenceState =
  "inactive" | "loading" | "ready" | "pending" | "saving" | "error";

export interface SidecarPersistenceStatus {
  readonly state: SidecarPersistenceState;
  readonly message: string;
}

export interface WorkspaceSidecarPersistenceOptions {
  readonly kind: WorkspaceSidecarKind;
  readonly delayMs?: number;
  readonly read: (
    entryId: string,
    kind: WorkspaceSidecarKind,
  ) => Promise<WorkspaceSidecarReadResult>;
  readonly save: (request: SaveWorkspaceSidecarRequest) => Promise<WorkspaceSidecarSaveResult>;
  readonly onStatus?: ((status: SidecarPersistenceStatus) => void) | undefined;
}

export interface SidecarAdoption {
  readonly document: WorkspaceSidecarDocument | null;
  readonly matchesSource: boolean;
}

export interface WorkspaceSidecarPersistence {
  readonly activeEntryId: string | null;
  readonly hasPendingChanges: boolean;
  adopt(entryId: string, sourceFingerprint: string): Promise<SidecarAdoption>;
  update(serialized: string, sourceFingerprint: string): void;
  flush(): Promise<void>;
  deactivate(): Promise<void>;
  destroy(): void;
}

interface PendingSidecar {
  readonly serialized: string;
  readonly sourceFingerprint: string;
  readonly version: number;
}

const DEFAULT_DELAY_MS = 400;

export function createWorkspaceSidecarPersistence(
  options: WorkspaceSidecarPersistenceOptions,
): WorkspaceSidecarPersistence {
  assertOptions(options);
  const delayMs = options.delayMs ?? DEFAULT_DELAY_MS;
  let activeEntryId: string | null = null;
  let revision: number | null = null;
  let pending: PendingSidecar | null = null;
  let saveChain: Promise<void> | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let generation = 0;
  let version = 0;
  let destroyed = false;
  let lastError: Error | null = null;
  let durableSerialized: string | null = null;
  let durableSourceFingerprint: string | null = null;

  const present = (state: SidecarPersistenceState, message: string): void => {
    if (!destroyed) options.onStatus?.(Object.freeze({ state, message }));
  };

  const clearTimer = (): void => {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
  };

  const queueSave = (): Promise<void> | null => {
    clearTimer();
    if (activeEntryId === null || pending === null) return saveChain;
    const entryId = activeEntryId;
    const queued = pending;
    pending = null;
    lastError = null;
    present("saving", `正在保存 ${options.kind}…`);
    const previous = saveChain ?? Promise.resolve();
    let tracked: Promise<void>;
    tracked = previous
      .catch(() => undefined)
      .then(async () => {
        if (destroyed || activeEntryId !== entryId) return;
        const result = await options.save({
          entryId,
          kind: options.kind,
          expectedRevision: revision,
          sourceFingerprint: queued.sourceFingerprint,
          serialized: queued.serialized,
        });
        if (destroyed || activeEntryId !== entryId) return;
        if (result.status === "failed") {
          throw new Error(`${result.error.code}：${result.error.message}`);
        }
        revision = result.document.revision;
        durableSerialized = result.document.serialized;
        durableSourceFingerprint = result.document.sourceFingerprint;
        if (
          pending?.serialized === durableSerialized &&
          pending.sourceFingerprint === durableSourceFingerprint
        ) {
          pending = null;
        }
        if (pending === null || pending.version <= queued.version) {
          present("ready", `${options.kind} 已保存`);
        }
      })
      .catch((error: unknown) => {
        lastError = error instanceof Error ? error : new Error(String(error));
        if (!destroyed && activeEntryId === entryId) {
          if (pending === null || pending.version < queued.version) pending = queued;
          present("error", `${options.kind} 保存失败：${lastError.message}`);
        }
        throw lastError;
      })
      .finally(() => {
        if (saveChain === tracked) saveChain = null;
      });
    saveChain = tracked;
    return tracked;
  };

  const schedule = (): void => {
    clearTimer();
    if (delayMs === 0) {
      void queueSave()?.catch(() => undefined);
      return;
    }
    timer = setTimeout(() => {
      timer = undefined;
      void queueSave()?.catch(() => undefined);
    }, delayMs);
  };

  const flush = async (): Promise<void> => {
    if (destroyed || activeEntryId === null) return;
    while (pending !== null || saveChain !== null) {
      const task = queueSave() ?? saveChain;
      if (task === null) break;
      await task;
    }
    if (lastError !== null) throw lastError;
  };

  present("inactive", `${options.kind} 未关联工作区`);

  return Object.freeze({
    get activeEntryId(): string | null {
      return activeEntryId;
    },
    get hasPendingChanges(): boolean {
      return pending !== null || saveChain !== null;
    },
    async adopt(entryId: string, sourceFingerprint: string): Promise<SidecarAdoption> {
      assertActive(destroyed);
      assertIdentity(entryId, sourceFingerprint);
      await flush();
      const requestGeneration = ++generation;
      activeEntryId = entryId;
      revision = null;
      pending = null;
      durableSerialized = null;
      durableSourceFingerprint = null;
      lastError = null;
      present("loading", `正在读取 ${options.kind}…`);
      const result = await options.read(entryId, options.kind);
      if (destroyed || requestGeneration !== generation || activeEntryId !== entryId) {
        return Object.freeze({ document: null, matchesSource: false });
      }
      if (result.status === "failed") {
        const error = new Error(`${result.error.code}：${result.error.message}`);
        lastError = error;
        present("error", `${options.kind} 读取失败：${error.message}`);
        throw error;
      }
      if (result.status === "missing") {
        present("ready", `${options.kind} 尚未创建`);
        return Object.freeze({ document: null, matchesSource: true });
      }
      if (result.document.kind !== options.kind) {
        const error = new Error(`读取到错误的 sidecar kind：${result.document.kind}`);
        lastError = error;
        present("error", `${options.kind} 读取失败：${error.message}`);
        throw error;
      }
      revision = result.document.revision;
      durableSerialized = result.document.serialized;
      durableSourceFingerprint = result.document.sourceFingerprint;
      present("ready", `${options.kind} 已载入`);
      return Object.freeze({
        document: result.document,
        matchesSource: result.document.sourceFingerprint === sourceFingerprint,
      });
    },
    update(serialized: string, sourceFingerprint: string): void {
      assertActive(destroyed);
      if (activeEntryId === null) return;
      if (typeof serialized !== "string" || typeof sourceFingerprint !== "string") {
        throw new TypeError("sidecar 更新必须提供序列化 JSON 和源码指纹");
      }
      if (
        saveChain === null &&
        serialized === durableSerialized &&
        sourceFingerprint === durableSourceFingerprint
      ) {
        pending = null;
        clearTimer();
        lastError = null;
        present("ready", `${options.kind} 未改变`);
        return;
      }
      if (pending?.serialized === serialized && pending.sourceFingerprint === sourceFingerprint) {
        return;
      }
      version += 1;
      pending = Object.freeze({ serialized, sourceFingerprint, version });
      present("pending", `${options.kind} 有修改待保存`);
      schedule();
    },
    flush,
    async deactivate(): Promise<void> {
      if (destroyed) return;
      await flush();
      clearTimer();
      generation += 1;
      activeEntryId = null;
      revision = null;
      pending = null;
      durableSerialized = null;
      durableSourceFingerprint = null;
      lastError = null;
      present("inactive", `${options.kind} 未关联工作区`);
    },
    destroy(): void {
      if (destroyed) return;
      clearTimer();
      generation += 1;
      destroyed = true;
      activeEntryId = null;
      pending = null;
      saveChain = null;
      durableSerialized = null;
      durableSourceFingerprint = null;
    },
  });
}

function assertOptions(options: WorkspaceSidecarPersistenceOptions): void {
  if (
    options === null ||
    typeof options !== "object" ||
    typeof options.read !== "function" ||
    typeof options.save !== "function"
  ) {
    throw new TypeError("sidecar persistence options 无效");
  }
  const delayMs = options.delayMs ?? DEFAULT_DELAY_MS;
  if (!Number.isSafeInteger(delayMs) || delayMs < 0) {
    throw new RangeError("sidecar persistence delayMs 必须是非负安全整数");
  }
}

function assertIdentity(entryId: string, sourceFingerprint: string): void {
  if (typeof entryId !== "string" || entryId.length === 0) {
    throw new TypeError("sidecar entryId 必须是非空字符串");
  }
  if (typeof sourceFingerprint !== "string" || sourceFingerprint.length === 0) {
    throw new TypeError("sidecar sourceFingerprint 必须是非空字符串");
  }
}

function assertActive(destroyed: boolean): void {
  if (destroyed) throw new Error("sidecar persistence 已销毁");
}
