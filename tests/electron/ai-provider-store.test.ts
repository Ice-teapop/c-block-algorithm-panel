import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  createAiProviderConfigStore,
  type AiProviderSafeStorage,
} from "../../electron/main/ai-provider-store.js";

const temporaryRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((path) => rm(path, { recursive: true, force: true })),
  );
});

describe("AI Provider safeStorage file store v2", () => {
  it("persists only ciphertext with mode 0600 and never exposes it publicly", async () => {
    const root = await testRoot();
    const safeStorage = fakeSafeStorage();
    const store = createAiProviderConfigStore({ rootPath: root, safeStorage, now: () => 123_456 });
    const secret = "sk-private-course-key";

    const saved = await store.connect(connectRequest(null, "openai", secret), "gpt-test");
    expect(saved).toMatchObject({
      status: "connected",
      config: {
        schemaVersion: 2,
        revision: 0,
        providerId: "openai",
        model: "gpt-test",
        hasCredential: true,
        credentialUsable: true,
      },
    });
    expect(JSON.stringify(saved)).not.toContain(secret);
    expect(JSON.stringify(saved)).not.toContain("encryptedCredentialBase64");

    const storePath = join(root, "ai-provider.v1.json");
    const serialized = await readFile(storePath, "utf8");
    expect(serialized).not.toContain(secret);
    expect(serialized).toContain("encryptedCredentialBase64");
    expect((await stat(storePath)).mode & 0o777).toBe(0o600);
    await expect(store.readCredential("openai")).resolves.toEqual({
      status: "ready",
      credential: secret,
    });
  });

  it("fails closed without encryption and supports revision-bound model selection", async () => {
    const root = await testRoot();
    const safeStorage = fakeSafeStorage();
    safeStorage.available = false;
    const store = createAiProviderConfigStore({ rootPath: root, safeStorage });
    await expect(
      store.connect(connectRequest(null, "deepseek", "must-not-hit-disk"), "deepseek-chat"),
    ).resolves.toMatchObject({
      status: "failed",
      error: { code: "AI_PROVIDER_ENCRYPTION_UNAVAILABLE" },
    });
    await expect(store.read()).resolves.toEqual({ status: "missing", encryptionAvailable: false });

    safeStorage.available = true;
    await store.connect(connectRequest(null, "deepseek", "secret"), "deepseek-chat");
    await expect(
      store.selectModel({ expectedRevision: 0, model: "deepseek-reasoner" }),
    ).resolves.toMatchObject({
      status: "selected",
      config: { revision: 1, model: "deepseek-reasoner" },
    });
    await expect(store.selectModel({ expectedRevision: 0, model: "stale" })).resolves.toMatchObject(
      { error: { code: "AI_PROVIDER_CONFLICT" } },
    );
  });

  it("serializes competing connects and disconnects without decrypting", async () => {
    const root = await testRoot();
    const safeStorage = fakeSafeStorage();
    const store = createAiProviderConfigStore({ rootPath: root, safeStorage });
    const [left, right] = await Promise.all([
      store.connect(connectRequest(null, "gemini", "left"), "models/gemini-a"),
      store.connect(connectRequest(null, "gemini", "right"), "models/gemini-b"),
    ]);
    expect([left.status, right.status].sort()).toEqual(["connected", "failed"]);
    safeStorage.decryptString = () => {
      throw new Error("disconnect must not decrypt");
    };
    await expect(store.disconnect({ expectedRevision: 0 })).resolves.toEqual({
      status: "disconnected",
    });
    await expect(store.read()).resolves.toMatchObject({ status: "missing" });
  });

  it("keeps every raw v1 credential reconnect-required and rejects disabled or mismatched metadata", async () => {
    const exactRoot = await testRoot();
    const safeStorage = fakeSafeStorage();
    await writeLegacy(
      exactRoot,
      safeStorage,
      "https://api.moonshot.cn/v1",
      "moonshot-v1-8k",
      "kimi-cn",
    );
    const exact = createAiProviderConfigStore({ rootPath: exactRoot, safeStorage });
    await expect(exact.read()).resolves.toMatchObject({
      status: "ready",
      config: {
        schemaVersion: 2,
        providerId: "kimi-cn",
        region: "cn",
        state: "reconnect-required",
        hasCredential: true,
        credentialUsable: false,
      },
    });
    await expect(exact.readCredential("kimi-cn")).resolves.toEqual({ status: "missing" });

    const disabledRoot = await testRoot();
    await writeLegacy(
      disabledRoot,
      safeStorage,
      "https://api.openai.com/v1",
      "gpt-test",
      "openai",
      false,
    );
    const disabled = createAiProviderConfigStore({ rootPath: disabledRoot, safeStorage });
    await expect(disabled.read()).resolves.toMatchObject({
      status: "ready",
      config: { providerId: null, state: "reconnect-required", credentialUsable: false },
    });

    const mismatchedRoot = await testRoot();
    await writeLegacy(
      mismatchedRoot,
      safeStorage,
      "https://api.openai.com/v1",
      "gpt-test",
      "deepseek",
    );
    const mismatched = createAiProviderConfigStore({ rootPath: mismatchedRoot, safeStorage });
    await expect(mismatched.read()).resolves.toMatchObject({
      status: "ready",
      config: { providerId: null, state: "reconnect-required", credentialUsable: false },
    });

    const unknownRoot = await testRoot();
    await writeLegacy(unknownRoot, safeStorage, "https://proxy.example/v1", "custom-model");
    const unknown = createAiProviderConfigStore({ rootPath: unknownRoot, safeStorage });
    await expect(unknown.read()).resolves.toMatchObject({
      status: "ready",
      config: {
        providerId: null,
        model: null,
        state: "reconnect-required",
        hasCredential: true,
        credentialUsable: false,
      },
    });
    const serialized = await readFile(join(unknownRoot, "ai-provider.v1.json"), "utf8");
    expect(serialized).toContain("encryptedCredentialBase64");
  });

  it("binds a new ciphertext to its selected provider and fails closed after metadata tampering", async () => {
    const root = await testRoot();
    const safeStorage = fakeSafeStorage();
    const store = createAiProviderConfigStore({ rootPath: root, safeStorage });
    await store.connect(connectRequest(null, "openai", "provider-bound-secret"), "gpt-test");

    const storePath = join(root, "ai-provider.v1.json");
    const stored = JSON.parse(await readFile(storePath, "utf8")) as Record<string, unknown>;
    await writeFile(
      storePath,
      `${JSON.stringify({
        ...stored,
        providerId: "deepseek",
        region: null,
        model: "deepseek-chat",
      })}\n`,
      { encoding: "utf8", mode: 0o600 },
    );

    await expect(store.readCredential("deepseek")).resolves.toMatchObject({
      status: "failed",
      error: { code: "AI_PROVIDER_CORRUPT_STORE" },
    });
  });
});

interface MutableSafeStorage extends AiProviderSafeStorage {
  available: boolean;
  decryptString(encrypted: Buffer): string;
}

function fakeSafeStorage(): MutableSafeStorage {
  return {
    available: true,
    isEncryptionAvailable() {
      return this.available;
    },
    encryptString(plainText: string) {
      return Buffer.from(`cipher:${Buffer.from(plainText, "utf8").toString("base64")}`, "utf8");
    },
    decryptString(encrypted: Buffer) {
      const encoded = encrypted.toString("utf8");
      if (!encoded.startsWith("cipher:")) throw new Error("invalid ciphertext");
      return Buffer.from(encoded.slice("cipher:".length), "base64").toString("utf8");
    },
  };
}

function connectRequest(
  expectedRevision: number | null,
  providerId:
    | "openai"
    | "anthropic"
    | "gemini"
    | "openrouter"
    | "deepseek"
    | "glm"
    | "kimi-cn"
    | "kimi-global",
  apiKey: string,
) {
  return { expectedRevision, providerId, apiKey };
}

async function writeLegacy(
  root: string,
  safeStorage: MutableSafeStorage,
  endpoint: string,
  model: string,
  providerId = "legacy",
  enabled = true,
): Promise<void> {
  await mkdir(root, { recursive: true });
  const encryptedCredentialBase64 = safeStorage.encryptString("legacy-secret").toString("base64");
  await writeFile(
    join(root, "ai-provider.v1.json"),
    `${JSON.stringify({
      schemaVersion: 1,
      revision: 4,
      config: {
        providerId,
        transport: "openai-compatible",
        endpoint,
        model,
        enabled,
      },
      encryptedCredentialBase64,
      credentialUpdatedAtMs: 123,
    })}\n`,
    { encoding: "utf8", mode: 0o600 },
  );
}

async function testRoot(): Promise<string> {
  const container = await mkdtemp(join(tmpdir(), "ai-provider-store-"));
  temporaryRoots.push(container);
  return join(container, "user-data");
}
