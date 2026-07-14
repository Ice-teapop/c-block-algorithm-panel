import { mkdtemp, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createAiProjectStore } from "../../electron/main/ai-project-store.js";
import { createWorkspaceStore } from "../../electron/main/workspace-store.js";

describe("AI Project local store", () => {
  let temporaryDirectory = "";
  let rootPath = "";

  beforeEach(async () => {
    temporaryDirectory = await mkdtemp(join(tmpdir(), "panel-ai-project-"));
    rootPath = join(temporaryDirectory, "C Algorithm Workbench");
  });

  afterEach(async () => {
    await rm(temporaryDirectory, { recursive: true, force: true });
  });

  it("creates exactly one project per opaque workspace and restores it", async () => {
    const { workspaceId, sourcePath, source } = await createWorkspace(rootPath, "project");
    const store = createAiProjectStore(rootPath);

    const first = await store.open({ workspaceId });
    const second = await store.open({ workspaceId });
    expect(first).toMatchObject({
      status: "ready",
      project: { workspaceId, revision: 0, conversations: [] },
    });
    expect(second).toEqual(first);
    expect(JSON.stringify(first)).not.toContain(rootPath);
    expect(await readFile(sourcePath, "utf8")).toBe(source);

    const entryDirectory = join(rootPath, "Projects", workspaceId);
    expect((await readdir(entryDirectory)).sort()).toEqual(
      ["ai-project.json", "entry.json", "main.c"].sort(),
    );
    expect(
      JSON.parse(await readFile(join(entryDirectory, "ai-project.json"), "utf8")),
    ).toMatchObject({
      schemaVersion: 1,
      workspaceId,
      revision: 0,
      conversations: [],
    });
  });

  it("persists multiple conversations, messages, archive state, rename and deletion", async () => {
    const { workspaceId, sourcePath, source } = await createWorkspace(rootPath, "sandbox");
    const store = createAiProjectStore(rootPath);
    const opened = await store.open({ workspaceId });
    if (opened.status !== "ready") throw new Error("AI Project open failed");

    const first = await store.createConversation({
      workspaceId,
      expectedRevision: opened.project.revision,
      title: "Boundary cases",
    });
    if (first.status !== "created") throw new Error("conversation create failed");
    const second = await store.createConversation({
      workspaceId,
      expectedRevision: first.project.revision,
      title: "Complexity",
    });
    if (second.status !== "created") throw new Error("conversation create failed");
    expect(second.project.conversations).toHaveLength(2);
    expect(second.project.projectId).toBe(opened.project.projectId);

    const appended = await store.appendMessage({
      workspaceId,
      conversationId: first.conversation.id,
      expectedRevision: second.project.revision,
      role: "user",
      content: "Why does the empty array fail?",
      sourceFingerprint: "fnv64:source-a",
    });
    if (appended.status !== "appended") throw new Error("append failed");
    expect(appended.conversation.messages).toEqual([
      expect.objectContaining({ role: "user", sourceFingerprint: "fnv64:source-a" }),
    ]);

    const renamed = await store.renameConversation({
      workspaceId,
      conversationId: first.conversation.id,
      expectedRevision: appended.project.revision,
      title: "Empty input",
    });
    if (renamed.status !== "updated") throw new Error("rename failed");
    const archived = await store.setConversationArchived({
      workspaceId,
      conversationId: first.conversation.id,
      expectedRevision: renamed.project.revision,
      archived: true,
    });
    if (archived.status !== "updated") throw new Error("archive failed");
    expect(archived.conversation).toMatchObject({ title: "Empty input", state: "archived" });

    const read = await store.readConversation({
      workspaceId,
      conversationId: first.conversation.id,
    });
    expect(read).toEqual({ status: "ready", conversation: archived.conversation });

    const deleted = await store.deleteConversation({
      workspaceId,
      conversationId: second.conversation.id,
      expectedRevision: archived.project.revision,
    });
    expect(deleted).toMatchObject({
      status: "deleted",
      conversationId: second.conversation.id,
      project: { conversations: [{ id: first.conversation.id }] },
    });
    expect(await readFile(sourcePath, "utf8")).toBe(source);
  });

  it("serializes writes, rejects stale revisions and never overwrites a corrupt store", async () => {
    const { workspaceId, sourcePath, source, entryDirectory } = await createWorkspace(
      rootPath,
      "test",
    );
    const store = createAiProjectStore(rootPath);
    const opened = await store.open({ workspaceId });
    if (opened.status !== "ready") throw new Error("open failed");
    const request = { workspaceId, expectedRevision: opened.project.revision };
    const [first, stale] = await Promise.all([
      store.createConversation({ ...request, title: "First" }),
      store.createConversation({ ...request, title: "Stale" }),
    ]);
    expect(first.status).toBe("created");
    expect(stale).toMatchObject({ status: "failed", error: { code: "AI_PROJECT_CONFLICT" } });

    const storePath = join(entryDirectory, "ai-project.json");
    await writeFile(storePath, "{broken", "utf8");
    await expect(store.open({ workspaceId })).resolves.toMatchObject({
      status: "failed",
      error: { code: "AI_PROJECT_CORRUPT_STORE" },
    });
    expect(await readFile(storePath, "utf8")).toBe("{broken");
    expect(await readFile(sourcePath, "utf8")).toBe(source);
  });

  it("enforces the bounded conversation capacity without partially writing", async () => {
    const { workspaceId } = await createWorkspace(rootPath, "sandbox");
    const store = createAiProjectStore(rootPath);
    const opened = await store.open({ workspaceId });
    if (opened.status !== "ready") throw new Error("open failed");
    let revision = opened.project.revision;
    for (let index = 0; index < 64; index += 1) {
      const created = await store.createConversation({
        workspaceId,
        expectedRevision: revision,
        title: `Conversation ${index + 1}`,
      });
      if (created.status !== "created") throw new Error(`create ${index + 1} failed`);
      revision = created.project.revision;
    }
    await expect(
      store.createConversation({ workspaceId, expectedRevision: revision, title: "Overflow" }),
    ).resolves.toMatchObject({
      status: "failed",
      error: { code: "AI_PROJECT_CAPACITY_EXCEEDED" },
    });
    const restored = await store.open({ workspaceId });
    expect(restored).toMatchObject({ status: "ready", project: { revision } });
    if (restored.status !== "ready") throw new Error("restore failed");
    expect(restored.project.conversations).toHaveLength(64);
  });

  it("rejects path-shaped IDs, extra fields, missing workspaces and symlinked stores", async () => {
    const { workspaceId, entryDirectory } = await createWorkspace(rootPath, "project");
    const store = createAiProjectStore(rootPath);
    await expect(store.open({ workspaceId: "../../outside" })).resolves.toMatchObject({
      error: { code: "AI_PROJECT_INVALID_REQUEST" },
    });
    await expect(store.open({ workspaceId, path: "/tmp/outside" })).resolves.toMatchObject({
      error: { code: "AI_PROJECT_INVALID_REQUEST" },
    });
    await expect(
      store.open({ workspaceId: "project-aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" }),
    ).resolves.toMatchObject({ error: { code: "AI_PROJECT_WORKSPACE_NOT_FOUND" } });

    const outside = join(temporaryDirectory, "outside-ai-project.json");
    await writeFile(outside, "sentinel", "utf8");
    await symlink(outside, join(entryDirectory, "ai-project.json"));
    await expect(store.open({ workspaceId })).resolves.toMatchObject({
      error: { code: "AI_PROJECT_CORRUPT_STORE" },
    });
    expect(await readFile(outside, "utf8")).toBe("sentinel");
  });
});

async function createWorkspace(rootPath: string, kind: "project" | "sandbox" | "test") {
  const workspace = createWorkspaceStore(rootPath);
  const created = await workspace.create({ kind, title: `${kind} chat` });
  if (created.status !== "opened") throw new Error("workspace create failed");
  const workspaceId = created.document.entry.id;
  const folder = kind === "project" ? "Projects" : kind === "sandbox" ? "Sandboxes" : "Tests";
  const entryDirectory = join(rootPath, folder, workspaceId);
  return {
    workspaceId,
    entryDirectory,
    sourcePath: join(entryDirectory, "main.c"),
    source: created.document.source,
  } as const;
}
