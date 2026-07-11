import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createLearningCatalogFileStore } from "../../electron/main/learning-catalog-store.js";
import { emptyLearningCatalogDocument } from "../../src/shared/learning-catalog-store.js";

const temporaryRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((path) => rm(path, { recursive: true, force: true })),
  );
});

describe("learning catalog file store", () => {
  it("atomically creates and replaces the fixed custom-blocks document", async () => {
    const { container, root } = await testRoot();
    const store = createLearningCatalogFileStore(root);
    const first = emptyLearningCatalogDocument(0);
    const second = emptyLearningCatalogDocument(1);

    await expect(
      store.save({ expectedRevision: null, serialized: first.serialized }),
    ).resolves.toEqual({ status: "saved", document: first });
    await expect(
      store.save({ expectedRevision: 0, serialized: second.serialized }),
    ).resolves.toEqual({ status: "saved", document: second });

    expect(await readFile(join(root, "custom-blocks.json"), "utf8")).toBe(second.serialized);
    expect(await readdir(root)).toEqual(["custom-blocks.json"]);
    expect(JSON.stringify(await store.read())).not.toContain(container);
  });

  it("serializes concurrent saves and rejects the stale expected revision", async () => {
    const { root } = await testRoot();
    const store = createLearningCatalogFileStore(root);
    const first = emptyLearningCatalogDocument(0);
    const stale = emptyLearningCatalogDocument(1);

    const [left, right] = await Promise.all([
      store.save({ expectedRevision: null, serialized: first.serialized }),
      store.save({ expectedRevision: null, serialized: stale.serialized }),
    ]);

    expect(left.status).toBe("saved");
    expect(right).toMatchObject({
      status: "failed",
      error: { code: "LEARNING_CATALOG_CONFLICT" },
    });
    await expect(store.read()).resolves.toEqual({ status: "ready", document: first });
  });

  it("does not overwrite a corrupt user file during a save attempt", async () => {
    const { root } = await testRoot();
    await mkdir(root, { mode: 0o700 });
    const path = join(root, "custom-blocks.json");
    const corrupt = "{ definitely-not-json";
    await writeFile(path, corrupt, "utf8");
    const store = createLearningCatalogFileStore(root);

    await expect(store.read()).resolves.toMatchObject({
      status: "failed",
      error: { code: "LEARNING_CATALOG_CORRUPT" },
    });
    await expect(
      store.save({
        expectedRevision: null,
        serialized: emptyLearningCatalogDocument(0).serialized,
      }),
    ).resolves.toMatchObject({
      status: "failed",
      error: { code: "LEARNING_CATALOG_CORRUPT" },
    });
    expect(await readFile(path, "utf8")).toBe(corrupt);
  });

  it("fails closed on invalid requests and never accepts a path field", async () => {
    const { container, root } = await testRoot();
    const store = createLearningCatalogFileStore(root);

    const result = await store.save({
      expectedRevision: null,
      serialized: emptyLearningCatalogDocument(0).serialized,
      path: join(container, "escape.json"),
    });

    expect(result).toMatchObject({
      status: "failed",
      error: { code: "LEARNING_CATALOG_INVALID_REQUEST" },
    });
    await expect(store.read()).resolves.toEqual({ status: "missing" });
    expect(JSON.stringify(result)).not.toContain(container);
  });

  it("requires a strictly newer document revision after a successful load", async () => {
    const { root } = await testRoot();
    const store = createLearningCatalogFileStore(root);
    const initial = emptyLearningCatalogDocument(5);
    await store.save({ expectedRevision: null, serialized: initial.serialized });

    await expect(
      store.save({ expectedRevision: 5, serialized: emptyLearningCatalogDocument(5).serialized }),
    ).resolves.toMatchObject({
      status: "failed",
      error: { code: "LEARNING_CATALOG_INVALID_DOCUMENT" },
    });
    await expect(
      store.save({ expectedRevision: 4, serialized: emptyLearningCatalogDocument(6).serialized }),
    ).resolves.toMatchObject({
      status: "failed",
      error: { code: "LEARNING_CATALOG_CONFLICT" },
    });
    await expect(store.read()).resolves.toEqual({ status: "ready", document: initial });
  });
});

async function testRoot(): Promise<{ readonly container: string; readonly root: string }> {
  const container = await mkdtemp(join(tmpdir(), "learning-catalog-store-"));
  temporaryRoots.push(container);
  return { container, root: join(container, "C Algorithm Workbench") };
}
