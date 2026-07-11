import {
  DEFAULT_LEARNING_CATALOG_STORAGE_KEY,
  type LearningCatalogStorage,
} from "../learning/index.js";
import {
  emptyLearningCatalogDocument,
  validateLearningCatalogDocument,
  type LearningCatalogStoreError,
  type ValidatedLearningCatalogDocument,
} from "../shared/learning-catalog-store.js";
import type { PanelApi } from "../shared/api.js";

export type LearningCatalogDiskStorageState =
  | "empty"
  | "loaded"
  | "migrating"
  | "pending"
  | "saving"
  | "saved"
  | "conflict"
  | "degraded"
  | "destroyed";

export interface LearningCatalogDiskStorageStatus {
  readonly state: LearningCatalogDiskStorageState;
  readonly message: string;
  readonly error?: LearningCatalogStoreError | undefined;
}

export interface LearningCatalogStorageAdapter extends LearningCatalogStorage {
  /** Clearing creates an empty versioned document; it never unlinks the user file. */
  removeItem(key: string): void;
}

export interface LoadedLearningCatalogStorage {
  readonly storage: LearningCatalogStorageAdapter;
  readonly status: LearningCatalogDiskStorageStatus;
  readonly hasPendingChanges: boolean;
  flush(): Promise<void>;
  destroy(): void;
}

export interface LearningCatalogDiskStorageOptions {
  readonly delayMs?: number;
  readonly legacyStorage?: Pick<Storage, "getItem"> & Partial<Pick<Storage, "removeItem">>;
  readonly onStatus?: ((status: LearningCatalogDiskStorageStatus) => void) | undefined;
}

type LearningCatalogDiskApi = Pick<PanelApi, "readLearningCatalog" | "saveLearningCatalog">;

interface PendingDocument {
  readonly document: ValidatedLearningCatalogDocument;
  readonly version: number;
  readonly migratedFromLegacy: boolean;
}

const DEFAULT_DELAY_MS = 350;

/**
 * Loads disk state before returning a synchronous adapter, allowing createLearningCatalog to keep
 * its existing synchronous construction contract. Disk state always outranks legacy localStorage.
 */
export async function loadLearningCatalogStorage(
  api: LearningCatalogDiskApi,
  options: LearningCatalogDiskStorageOptions = {},
): Promise<LoadedLearningCatalogStorage> {
  assertApi(api);
  const delayMs = options.delayMs ?? DEFAULT_DELAY_MS;
  if (!Number.isSafeInteger(delayMs) || delayMs < 0) {
    throw new RangeError("自定义积木保存 delayMs 必须是非负安全整数");
  }

  const legacyStorage = options.legacyStorage ?? browserLegacyStorage();
  let raw: string | null = null;
  let diskRevision: number | null = null;
  let pending: PendingDocument | null = null;
  let saveChain: Promise<void> | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let version = 0;
  let destroyed = false;
  let blockedError: Error | null = null;
  let status = freezeStatus("empty", "尚未创建磁盘自定义积木目录");

  const present = (
    state: LearningCatalogDiskStorageState,
    message: string,
    error?: LearningCatalogStoreError,
  ): void => {
    status = freezeStatus(state, message, error);
    options.onStatus?.(status);
  };

  const block = (error: LearningCatalogStoreError): void => {
    blockedError = new LearningCatalogPersistenceError(error);
    present(
      error.code === "LEARNING_CATALOG_CONFLICT" ? "conflict" : "degraded",
      error.message,
      error,
    );
  };

  let readResult: Awaited<ReturnType<LearningCatalogDiskApi["readLearningCatalog"]>>;
  try {
    readResult = await api.readLearningCatalog();
  } catch {
    readResult = {
      status: "failed",
      error: {
        code: "LEARNING_CATALOG_READ_FAILED",
        message: "无法通过应用边界读取自定义积木目录。",
      },
    };
  }

  if (readResult.status === "ready") {
    const validation = validateLearningCatalogDocument(readResult.document.serialized);
    if (!validation.ok || validation.document.revision !== readResult.document.revision) {
      block({
        code: "LEARNING_CATALOG_CORRUPT",
        message: "主进程返回的自定义积木目录无效；已阻止覆盖。",
      });
    } else {
      raw = validation.document.serialized;
      diskRevision = validation.document.revision;
      present("loaded", "自定义积木目录已从磁盘载入");
    }
  } else if (readResult.status === "failed") {
    block(readResult.error);
  } else {
    const legacyRaw = readLegacy(legacyStorage);
    const validation = legacyRaw === null ? null : validateLearningCatalogDocument(legacyRaw);
    if (validation?.ok === true) {
      raw = validation.document.serialized;
      pending = Object.freeze({
        document: validation.document,
        version: ++version,
        migratedFromLegacy: true,
      });
      present("migrating", "正在把旧版浏览器自定义积木迁移到磁盘");
    } else {
      present("empty", "尚未创建磁盘自定义积木目录");
    }
  }

  const clearTimer = (): void => {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
  };

  const startSave = (): Promise<void> | null => {
    clearTimer();
    if (destroyed || blockedError !== null || pending === null) return saveChain;
    if (saveChain !== null) return saveChain;
    let tracked: Promise<void>;
    tracked = (async () => {
      while (!destroyed && blockedError === null && pending !== null) {
        const queued = pending;
        pending = null;
        present("saving", "正在保存自定义积木目录");
        let result: Awaited<ReturnType<LearningCatalogDiskApi["saveLearningCatalog"]>>;
        try {
          result = await api.saveLearningCatalog({
            expectedRevision: diskRevision,
            serialized: queued.document.serialized,
          });
        } catch {
          result = {
            status: "failed",
            error: {
              code: "LEARNING_CATALOG_WRITE_FAILED",
              message: "无法通过应用边界保存自定义积木目录。",
            },
          };
        }
        if (destroyed) return;
        if (result.status === "failed") {
          const newer = pending as PendingDocument | null;
          if (newer === null || newer.version < queued.version) pending = queued;
          block(result.error);
          throw blockedError;
        }
        const saved = validateLearningCatalogDocument(result.document.serialized);
        if (
          !saved.ok ||
          saved.document.revision !== result.document.revision ||
          saved.document.revision !== queued.document.revision ||
          saved.document.serialized !== queued.document.serialized
        ) {
          const newer = pending as PendingDocument | null;
          if (newer === null || newer.version < queued.version) pending = queued;
          block({
            code: "LEARNING_CATALOG_INVALID_DOCUMENT",
            message: "保存结果与请求不一致；已停止后续覆盖。",
          });
          throw blockedError;
        }
        diskRevision = saved.document.revision;
        raw = saved.document.serialized;
        if (queued.migratedFromLegacy) removeLegacy(legacyStorage);
      }
      if (!destroyed) present("saved", "自定义积木目录已保存到磁盘");
    })().finally(() => {
      if (saveChain === tracked) saveChain = null;
    });
    saveChain = tracked;
    return tracked;
  };

  const schedule = (): void => {
    clearTimer();
    if (destroyed || blockedError !== null || pending === null) return;
    if (delayMs === 0) {
      void startSave()?.catch(() => undefined);
      return;
    }
    timer = setTimeout(() => {
      timer = undefined;
      void startSave()?.catch(() => undefined);
    }, delayMs);
  };

  const update = (key: string, value: string, migratedFromLegacy: boolean): void => {
    assertUsable(key, destroyed, blockedError);
    const validation = validateLearningCatalogDocument(value);
    if (!validation.ok) {
      throw new TypeError(
        validation.reason === "too-large"
          ? "自定义积木目录超过 2 MiB 上限"
          : "自定义积木目录必须是合法版本化 JSON",
      );
    }
    const currentRevision = currentDocumentRevision(raw, diskRevision);
    if (currentRevision !== null && validation.document.revision <= currentRevision) {
      throw new RangeError("新自定义积木目录 revision 必须递增");
    }
    raw = validation.document.serialized;
    const keepLegacyMigration = migratedFromLegacy || pending?.migratedFromLegacy === true;
    pending = Object.freeze({
      document: validation.document,
      version: ++version,
      migratedFromLegacy: keepLegacyMigration,
    });
    present("pending", "自定义积木目录有修改待保存");
    schedule();
  };

  const storage: LearningCatalogStorageAdapter = Object.freeze({
    getItem(key: string): string | null {
      assertKey(key);
      if (destroyed) throw new Error("自定义积木磁盘存储已销毁");
      if (blockedError !== null) throw blockedError;
      return raw;
    },
    setItem(key: string, value: string): void {
      update(key, value, false);
    },
    removeItem(key: string): void {
      assertUsable(key, destroyed, blockedError);
      const currentRevision = currentDocumentRevision(raw, diskRevision);
      const nextRevision = currentRevision === null ? 0 : nextSafeRevision(currentRevision);
      const empty = emptyLearningCatalogDocument(nextRevision);
      update(key, empty.serialized, false);
    },
  });

  if (pending !== null) schedule();

  return Object.freeze({
    storage,
    get status(): LearningCatalogDiskStorageStatus {
      return status;
    },
    get hasPendingChanges(): boolean {
      return pending !== null || saveChain !== null;
    },
    async flush(): Promise<void> {
      if (destroyed) return;
      clearTimer();
      if (blockedError !== null) throw blockedError;
      while (pending !== null || saveChain !== null) {
        const task = startSave() ?? saveChain;
        if (task === null) break;
        await task;
      }
      if (blockedError !== null) throw blockedError;
    },
    destroy(): void {
      if (destroyed) return;
      clearTimer();
      destroyed = true;
      pending = null;
      present("destroyed", "自定义积木磁盘存储已关闭");
    },
  });
}

export class LearningCatalogPersistenceError extends Error {
  readonly code: LearningCatalogStoreError["code"];

  constructor(error: LearningCatalogStoreError) {
    super(`${error.code}：${error.message}`);
    this.name = "LearningCatalogPersistenceError";
    this.code = error.code;
  }
}

function assertApi(api: LearningCatalogDiskApi): void {
  if (
    api === null ||
    typeof api !== "object" ||
    typeof api.readLearningCatalog !== "function" ||
    typeof api.saveLearningCatalog !== "function"
  ) {
    throw new TypeError("自定义积木磁盘 API 不可用");
  }
}

function assertUsable(key: string, destroyed: boolean, blockedError: Error | null): void {
  assertKey(key);
  if (destroyed) throw new Error("自定义积木磁盘存储已销毁");
  if (blockedError !== null) throw blockedError;
}

function assertKey(key: string): void {
  if (key !== DEFAULT_LEARNING_CATALOG_STORAGE_KEY) {
    throw new TypeError("自定义积木磁盘存储只接受固定目录 key");
  }
}

function currentDocumentRevision(raw: string | null, diskRevision: number | null): number | null {
  if (raw !== null) {
    const validation = validateLearningCatalogDocument(raw);
    if (validation.ok) return validation.document.revision;
  }
  return diskRevision;
}

function nextSafeRevision(revision: number): number {
  if (revision >= Number.MAX_SAFE_INTEGER) throw new RangeError("自定义积木 revision 已耗尽");
  return revision + 1;
}

function readLegacy(storage: LearningCatalogDiskStorageOptions["legacyStorage"]): string | null {
  try {
    return storage?.getItem(DEFAULT_LEARNING_CATALOG_STORAGE_KEY) ?? null;
  } catch {
    return null;
  }
}

function removeLegacy(storage: LearningCatalogDiskStorageOptions["legacyStorage"]): void {
  try {
    storage?.removeItem?.(DEFAULT_LEARNING_CATALOG_STORAGE_KEY);
  } catch {
    // The authoritative disk save already succeeded; a blocked legacy cleanup is harmless.
  }
}

function browserLegacyStorage(): LearningCatalogDiskStorageOptions["legacyStorage"] {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
}

function freezeStatus(
  state: LearningCatalogDiskStorageState,
  message: string,
  error?: LearningCatalogStoreError,
): LearningCatalogDiskStorageStatus {
  return Object.freeze({ state, message, ...(error === undefined ? {} : { error }) });
}
