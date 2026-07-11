import { describe, expect, it, vi } from "vitest";
import {
  LearningCatalogPersistenceError,
  loadLearningCatalogStorage,
} from "../../src/app/learning-catalog-disk-storage.js";
import {
  createLearningCatalog,
  DEFAULT_LEARNING_CATALOG_STORAGE_KEY,
  type LearningCatalogStorage,
} from "../../src/learning/index.js";
import {
  emptyLearningCatalogDocument,
  validateLearningCatalogDocument,
  type LearningCatalogReadResult,
  type LearningCatalogSaveResult,
  type SaveLearningCatalogRequest,
} from "../../src/shared/learning-catalog-store.js";

describe("learning catalog disk adapter", () => {
  it("gives disk state priority over legacy localStorage", async () => {
    const disk = emptyLearningCatalogDocument(3);
    const legacy = emptyLearningCatalogDocument(8);
    const api = mockApi({ status: "ready", document: disk });
    const legacyStorage = {
      getItem: vi.fn(() => legacy.serialized),
      removeItem: vi.fn(),
    };

    const loaded = await loadLearningCatalogStorage(api, { legacyStorage });

    expect(loaded.storage.getItem(DEFAULT_LEARNING_CATALOG_STORAGE_KEY)).toBe(disk.serialized);
    expect(loaded.status.state).toBe("loaded");
    expect(legacyStorage.getItem).not.toHaveBeenCalled();
    expect(api.saveLearningCatalog).not.toHaveBeenCalled();
    loaded.destroy();
  });

  it("migrates a valid legacy custom catalog and removes it only after flush succeeds", async () => {
    const legacyDocument = customCatalogDocument();
    const removeItem = vi.fn();
    const api = mockApi({ status: "missing" });
    const loaded = await loadLearningCatalogStorage(api, {
      delayMs: 60_000,
      legacyStorage: { getItem: () => legacyDocument, removeItem },
    });
    const catalog = createLearningCatalog({ storage: loaded.storage });

    expect(catalog.getEntry("custom.disk.migration")).toMatchObject({ origin: "custom" });
    expect(loaded.status.state).toBe("migrating");
    expect(removeItem).not.toHaveBeenCalled();

    await loaded.flush();

    expect(api.saveLearningCatalog).toHaveBeenCalledWith({
      expectedRevision: null,
      serialized: legacyDocument,
    });
    expect(removeItem).toHaveBeenCalledWith(DEFAULT_LEARNING_CATALOG_STORAGE_KEY);
    expect(loaded.status.state).toBe("saved");
    loaded.destroy();
  });

  it("debounces synchronous updates and flushes only the latest complete document", async () => {
    const api = mockApi({ status: "missing" });
    const loaded = await loadLearningCatalogStorage(api, {
      delayMs: 60_000,
      legacyStorage: { getItem: () => null },
    });
    const first = emptyLearningCatalogDocument(0);
    const latest = emptyLearningCatalogDocument(1);

    loaded.storage.setItem(DEFAULT_LEARNING_CATALOG_STORAGE_KEY, first.serialized);
    loaded.storage.setItem(DEFAULT_LEARNING_CATALOG_STORAGE_KEY, latest.serialized);
    expect(loaded.hasPendingChanges).toBe(true);
    await loaded.flush();

    expect(api.saveLearningCatalog).toHaveBeenCalledTimes(1);
    expect(api.saveLearningCatalog).toHaveBeenCalledWith({
      expectedRevision: null,
      serialized: latest.serialized,
    });
    expect(loaded.hasPendingChanges).toBe(false);
    loaded.destroy();
  });

  it("surfaces optimistic concurrency conflicts and retains the unsaved document", async () => {
    const api = mockApi(
      { status: "ready", document: emptyLearningCatalogDocument(1) },
      async () => ({
        status: "failed",
        error: {
          code: "LEARNING_CATALOG_CONFLICT",
          message: "revision changed",
        },
      }),
    );
    const loaded = await loadLearningCatalogStorage(api, {
      delayMs: 60_000,
      legacyStorage: { getItem: () => null },
    });
    loaded.storage.setItem(
      DEFAULT_LEARNING_CATALOG_STORAGE_KEY,
      emptyLearningCatalogDocument(2).serialized,
    );

    await expect(loaded.flush()).rejects.toMatchObject({
      name: "LearningCatalogPersistenceError",
      code: "LEARNING_CATALOG_CONFLICT",
    });
    expect(loaded.status.state).toBe("conflict");
    expect(loaded.hasPendingChanges).toBe(true);
    loaded.destroy();
  });

  it("degrades on a corrupt disk file and refuses to overwrite it", async () => {
    const api = mockApi({
      status: "failed",
      error: {
        code: "LEARNING_CATALOG_CORRUPT",
        message: "corrupt file preserved",
      },
    });
    const loaded = await loadLearningCatalogStorage(api, {
      legacyStorage: { getItem: () => emptyLearningCatalogDocument(10).serialized },
    });

    expect(loaded.status.state).toBe("degraded");
    expect(() => loaded.storage.getItem(DEFAULT_LEARNING_CATALOG_STORAGE_KEY)).toThrow(
      LearningCatalogPersistenceError,
    );
    expect(() =>
      loaded.storage.setItem(
        DEFAULT_LEARNING_CATALOG_STORAGE_KEY,
        emptyLearningCatalogDocument(0).serialized,
      ),
    ).toThrow(LearningCatalogPersistenceError);
    await expect(loaded.flush()).rejects.toMatchObject({ code: "LEARNING_CATALOG_CORRUPT" });
    expect(api.saveLearningCatalog).not.toHaveBeenCalled();
    loaded.destroy();
  });

  it("removeItem persists an empty newer document instead of deleting the file", async () => {
    const api = mockApi({ status: "ready", document: emptyLearningCatalogDocument(4) });
    const loaded = await loadLearningCatalogStorage(api, {
      delayMs: 60_000,
      legacyStorage: { getItem: () => null },
    });

    loaded.storage.removeItem(DEFAULT_LEARNING_CATALOG_STORAGE_KEY);
    await loaded.flush();

    const request = api.saveLearningCatalog.mock.calls[0]?.[0];
    expect(request).toMatchObject({ expectedRevision: 4 });
    expect(JSON.parse(request?.serialized ?? "null")).toEqual({
      schemaVersion: 1,
      revision: 5,
      templates: [],
      tombstones: [],
    });
    loaded.destroy();
  });
});

function mockApi(
  readResult: LearningCatalogReadResult,
  save: (request: SaveLearningCatalogRequest) => Promise<LearningCatalogSaveResult> = async (
    request,
  ) => {
    const validation = validateLearningCatalogDocument(request.serialized);
    if (!validation.ok) throw new Error("test passed an invalid document");
    return { status: "saved", document: validation.document };
  },
) {
  return {
    readLearningCatalog: vi.fn(async () => readResult),
    saveLearningCatalog: vi.fn(save),
  };
}

function customCatalogDocument(): string {
  let value: string | null = null;
  const storage: LearningCatalogStorage = {
    getItem: () => value,
    setItem: (_key, next) => {
      value = next;
    },
  };
  const catalog = createLearningCatalog({ storage });
  catalog.createCustom({
    id: "custom.disk.migration",
    version: "1.0.0",
    label: "Disk migration",
    category: "custom",
    stage: "c.control-flow",
    source: "value++;",
    description: "Legacy custom block",
    fragmentKind: "statement",
  });
  if (value === null) throw new Error("catalog did not persist test document");
  return value;
}
