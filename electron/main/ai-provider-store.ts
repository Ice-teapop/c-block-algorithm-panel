import { randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { lstat, mkdir, open, rename, rm, type FileHandle } from "node:fs/promises";
import { isAbsolute, join } from "node:path";
import {
  AI_PROVIDER_CONFIG_MAX_BYTES,
  AI_PROVIDER_CONFIG_SCHEMA_VERSION,
  aiProviderFailure,
  isAiProviderId,
  providerRegion,
  validAiProviderModel,
  validateConnectAiProviderRequest,
  validateDisconnectAiProviderRequest,
  validateSelectAiProviderModelRequest,
  type AiProviderDisconnectResult,
  type AiProviderError,
  type AiProviderFailure,
  type AiProviderId,
  type AiProviderModelSelectResult,
  type AiProviderPublicConfig,
  type AiProviderReadResult,
  type ConnectAiProviderRequest,
} from "../../src/shared/ai-provider.js";
import { providerIdForLegacyEndpoint } from "./ai-provider-registry.js";

const STORE_FILE_NAME = "ai-provider.v1.json";
const CREDENTIAL_ENVELOPE_SCHEMA_VERSION = 1 as const;
const utf8Decoder = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });

export interface AiProviderSafeStorage {
  isEncryptionAvailable(): boolean;
  encryptString(plainText: string): Buffer;
  decryptString(encrypted: Buffer): string;
}

export type AiProviderCredentialAccessResult =
  | { readonly status: "missing" }
  | { readonly status: "ready"; readonly credential: string }
  | { readonly status: "failed"; readonly error: AiProviderError };

export type AiProviderStoreConnectResult =
  { readonly status: "connected"; readonly config: AiProviderPublicConfig } | AiProviderFailure;

export interface AiProviderConfigStore {
  read(): Promise<AiProviderReadResult>;
  connect(request: unknown, initialModel: string): Promise<AiProviderStoreConnectResult>;
  selectModel(request: unknown): Promise<AiProviderModelSelectResult>;
  disconnect(request: unknown): Promise<AiProviderDisconnectResult>;
  /** Main-process-only access. This method must never cross preload or renderer boundaries. */
  readCredential(providerId: AiProviderId): Promise<AiProviderCredentialAccessResult>;
}

export interface AiProviderConfigStoreOptions {
  readonly rootPath: string;
  readonly safeStorage: AiProviderSafeStorage;
  readonly now?: (() => number) | undefined;
}

interface StoredAiProviderConfigV2 {
  readonly schemaVersion: typeof AI_PROVIDER_CONFIG_SCHEMA_VERSION;
  readonly revision: number;
  readonly providerId: AiProviderId | null;
  readonly region: "cn" | "global" | null;
  readonly model: string | null;
  readonly state: "connected" | "reconnect-required";
  readonly encryptedCredentialBase64: string | null;
  readonly credentialUpdatedAtMs: number | null;
}

interface LegacyStoredAiProviderConfigV1 {
  readonly schemaVersion: 1;
  readonly revision: number;
  readonly config: {
    readonly providerId: string;
    readonly transport: "openai-compatible";
    readonly endpoint: string;
    readonly model: string;
    readonly enabled: boolean;
  };
  readonly encryptedCredentialBase64: string | null;
  readonly credentialUpdatedAtMs: number | null;
}

interface StoredCredentialEnvelopeV1 {
  readonly schemaVersion: typeof CREDENTIAL_ENVELOPE_SCHEMA_VERSION;
  readonly providerId: AiProviderId;
  readonly credential: string;
}

export function createAiProviderConfigStore(
  options: AiProviderConfigStoreOptions,
): AiProviderConfigStore {
  assertOptions(options);
  const storePath = join(options.rootPath, STORE_FILE_NAME);
  const now = options.now ?? Date.now;
  let mutationQueue: Promise<void> = Promise.resolve();

  const serializeMutation = <T>(operation: () => Promise<T>): Promise<T> => {
    const result = mutationQueue.catch(() => undefined).then(operation);
    mutationQueue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  };

  return Object.freeze({
    async read(): Promise<AiProviderReadResult> {
      if (!(await ensureRoot(options.rootPath))) return readFailure();
      try {
        const stored = await readStoredDocument(storePath);
        const encryptionAvailable = encryptionIsAvailable(options.safeStorage);
        return stored === null
          ? Object.freeze({ status: "missing", encryptionAvailable })
          : Object.freeze({
              status: "ready",
              encryptionAvailable,
              config: publicConfig(stored, encryptionAvailable),
            });
      } catch (error: unknown) {
        return classifyReadFailure(error);
      }
    },

    async connect(request: unknown, initialModel: string): Promise<AiProviderStoreConnectResult> {
      const validated = validateConnectAiProviderRequest(request);
      if (validated === null || !validAiProviderModel(initialModel)) return invalidRequest();
      return serializeMutation(() =>
        connectProvider(options, storePath, validated, initialModel, safeTimestamp(now)),
      );
    },

    async selectModel(request: unknown): Promise<AiProviderModelSelectResult> {
      const validated = validateSelectAiProviderModelRequest(request);
      if (validated === null) return invalidRequest();
      return serializeMutation(() => selectModel(options, storePath, validated));
    },

    async disconnect(request: unknown): Promise<AiProviderDisconnectResult> {
      const validated = validateDisconnectAiProviderRequest(request);
      if (validated === null) return invalidRequest();
      return serializeMutation(() =>
        disconnectProvider(options, storePath, validated.expectedRevision),
      );
    },

    async readCredential(providerId: AiProviderId): Promise<AiProviderCredentialAccessResult> {
      if (!isAiProviderId(providerId) || !(await ensureRoot(options.rootPath))) {
        return credentialFailure(readFailure());
      }
      let stored: StoredAiProviderConfigV2 | null;
      try {
        stored = await readStoredDocument(storePath);
      } catch (error: unknown) {
        return credentialFailure(classifyReadFailure(error));
      }
      if (
        stored === null ||
        stored.state !== "connected" ||
        stored.providerId !== providerId ||
        stored.encryptedCredentialBase64 === null
      ) {
        return Object.freeze({ status: "missing" });
      }
      if (!encryptionIsAvailable(options.safeStorage)) {
        return credentialFailure(
          aiProviderFailure(
            "AI_PROVIDER_ENCRYPTION_UNAVAILABLE",
            "系统加密存储当前不可用，无法读取 AI Provider 凭据。",
          ),
        );
      }
      try {
        const encrypted = decodeCiphertext(stored.encryptedCredentialBase64);
        const decrypted = options.safeStorage.decryptString(encrypted);
        const credential = readCredentialEnvelope(decrypted, providerId);
        return Object.freeze({ status: "ready", credential });
      } catch {
        return credentialFailure(
          aiProviderFailure(
            "AI_PROVIDER_CORRUPT_STORE",
            "AI Provider 凭据无法解密；原文件保持不变。",
          ),
        );
      }
    },
  });
}

async function connectProvider(
  options: AiProviderConfigStoreOptions,
  storePath: string,
  request: ConnectAiProviderRequest,
  initialModel: string,
  timestamp: number,
): Promise<AiProviderStoreConnectResult> {
  if (!(await ensureRoot(options.rootPath))) return writeFailure();
  let current: StoredAiProviderConfigV2 | null;
  try {
    current = await readStoredDocument(storePath);
  } catch (error: unknown) {
    return classifyReadFailure(error);
  }
  if ((current?.revision ?? null) !== request.expectedRevision) return conflictFailure();
  if (!encryptionIsAvailable(options.safeStorage)) {
    return aiProviderFailure(
      "AI_PROVIDER_ENCRYPTION_UNAVAILABLE",
      "系统加密存储不可用，密钥不会以明文降级保存。",
    );
  }

  let encryptedCredentialBase64: string;
  try {
    const encrypted = options.safeStorage.encryptString(
      serializeCredentialEnvelope(request.providerId, request.apiKey),
    );
    if (!Buffer.isBuffer(encrypted) || encrypted.byteLength < 1) throw new Error("encrypt-empty");
    encryptedCredentialBase64 = encrypted.toString("base64");
  } catch {
    return aiProviderFailure(
      "AI_PROVIDER_ENCRYPTION_UNAVAILABLE",
      "系统加密存储无法加密 API 密钥，配置未保存。",
    );
  }

  const stored = freezeStored({
    schemaVersion: AI_PROVIDER_CONFIG_SCHEMA_VERSION,
    revision: (current?.revision ?? -1) + 1,
    providerId: request.providerId,
    region: providerRegion(request.providerId),
    model: initialModel,
    state: "connected",
    encryptedCredentialBase64,
    credentialUpdatedAtMs: timestamp,
  });
  try {
    await atomicWrite(storePath, serializeStored(stored));
    return Object.freeze({
      status: "connected",
      config: publicConfig(stored, encryptionIsAvailable(options.safeStorage)),
    });
  } catch {
    return writeFailure();
  }
}

async function selectModel(
  options: AiProviderConfigStoreOptions,
  storePath: string,
  request: { readonly expectedRevision: number; readonly model: string },
): Promise<AiProviderModelSelectResult> {
  if (!(await ensureRoot(options.rootPath))) return writeFailure();
  let current: StoredAiProviderConfigV2 | null;
  try {
    current = await readStoredDocument(storePath);
  } catch (error: unknown) {
    return classifyReadFailure(error);
  }
  if (current === null || current.state !== "connected") {
    return aiProviderFailure("AI_PROVIDER_NOT_CONNECTED", "请先连接 AI 厂商。");
  }
  if (current.revision !== request.expectedRevision) return conflictFailure();
  const stored = freezeStored({ ...current, revision: current.revision + 1, model: request.model });
  try {
    await atomicWrite(storePath, serializeStored(stored));
    return Object.freeze({
      status: "selected",
      config: publicConfig(stored, encryptionIsAvailable(options.safeStorage)),
    });
  } catch {
    return writeFailure();
  }
}

async function disconnectProvider(
  options: AiProviderConfigStoreOptions,
  storePath: string,
  expectedRevision: number,
): Promise<AiProviderDisconnectResult> {
  if (!(await ensureRoot(options.rootPath))) return writeFailure();
  let current: StoredAiProviderConfigV2 | null;
  try {
    current = await readStoredDocument(storePath);
  } catch (error: unknown) {
    return classifyReadFailure(error);
  }
  if (current === null) return Object.freeze({ status: "missing" });
  if (current.revision !== expectedRevision) return conflictFailure();
  try {
    await rm(storePath, { force: false });
    return Object.freeze({ status: "disconnected" });
  } catch (error: unknown) {
    return isNodeError(error, "ENOENT") ? Object.freeze({ status: "missing" }) : writeFailure();
  }
}

async function readStoredDocument(storePath: string): Promise<StoredAiProviderConfigV2 | null> {
  let serialized: string;
  try {
    serialized = await readRegularUtf8(storePath);
  } catch (error: unknown) {
    if (isNodeError(error, "ENOENT")) return null;
    if (isNodeError(error, "ELOOP")) throw storeReadError("not-regular");
    throw error;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(serialized) as unknown;
  } catch {
    throw storeReadError("corrupt");
  }
  if (isRecord(parsed) && parsed.schemaVersion === 1) return migrateLegacy(validateLegacy(parsed));
  return validateStoredV2(parsed);
}

function validateStoredV2(value: unknown): StoredAiProviderConfigV2 {
  if (
    !isExactObject(value, [
      "schemaVersion",
      "revision",
      "providerId",
      "region",
      "model",
      "state",
      "encryptedCredentialBase64",
      "credentialUpdatedAtMs",
    ])
  ) {
    throw storeReadError("corrupt");
  }
  const input = value as Record<string, unknown>;
  const providerId = input.providerId;
  const region = input.region;
  const model = input.model;
  const state = input.state;
  const encrypted = input.encryptedCredentialBase64;
  const timestamp = input.credentialUpdatedAtMs;
  if (
    input.schemaVersion !== AI_PROVIDER_CONFIG_SCHEMA_VERSION ||
    !validRevision(input.revision) ||
    !(providerId === null || isAiProviderId(providerId)) ||
    !(region === null || region === "cn" || region === "global") ||
    !(model === null || validAiProviderModel(model)) ||
    (state !== "connected" && state !== "reconnect-required") ||
    !(encrypted === null || validBase64Ciphertext(encrypted)) ||
    !validCredentialTimestamp(encrypted, timestamp) ||
    (state === "connected" &&
      (providerId === null ||
        model === null ||
        encrypted === null ||
        region !== providerRegion(providerId))) ||
    (state === "reconnect-required" && providerId === null && region !== null)
  ) {
    throw storeReadError("corrupt");
  }
  return freezeStored({
    schemaVersion: AI_PROVIDER_CONFIG_SCHEMA_VERSION,
    revision: input.revision as number,
    providerId: providerId as AiProviderId | null,
    region: region as "cn" | "global" | null,
    model: model as string | null,
    state,
    encryptedCredentialBase64: encrypted as string | null,
    credentialUpdatedAtMs: timestamp as number | null,
  });
}

function validateLegacy(value: Record<string, unknown>): LegacyStoredAiProviderConfigV1 {
  if (
    !isExactObject(value, [
      "schemaVersion",
      "revision",
      "config",
      "encryptedCredentialBase64",
      "credentialUpdatedAtMs",
    ]) ||
    !validRevision(value.revision) ||
    !isExactObject(value.config, ["providerId", "transport", "endpoint", "model", "enabled"])
  ) {
    throw storeReadError("corrupt");
  }
  const config = value.config as Record<string, unknown>;
  const encrypted = value.encryptedCredentialBase64;
  const timestamp = value.credentialUpdatedAtMs;
  if (
    typeof config.providerId !== "string" ||
    config.transport !== "openai-compatible" ||
    typeof config.endpoint !== "string" ||
    !validAiProviderModel(config.model) ||
    typeof config.enabled !== "boolean" ||
    !(encrypted === null || validBase64Ciphertext(encrypted)) ||
    !validCredentialTimestamp(encrypted, timestamp)
  ) {
    throw storeReadError("corrupt");
  }
  return value as unknown as LegacyStoredAiProviderConfigV1;
}

function migrateLegacy(legacy: LegacyStoredAiProviderConfigV1): StoredAiProviderConfigV2 {
  const endpointProviderId = providerIdForLegacyEndpoint(legacy.config.endpoint);
  const providerId =
    legacy.config.enabled &&
    endpointProviderId !== null &&
    legacy.config.providerId === endpointProviderId
      ? endpointProviderId
      : null;
  return freezeStored({
    schemaVersion: AI_PROVIDER_CONFIG_SCHEMA_VERSION,
    revision: legacy.revision,
    providerId,
    region: providerId === null ? null : providerRegion(providerId),
    model: providerId === null ? null : legacy.config.model,
    // A v1 ciphertext contains only the raw key. It cannot prove which provider it belongs to,
    // so even exact official endpoints must reconnect into the provider-bound envelope below.
    state: "reconnect-required",
    encryptedCredentialBase64: legacy.encryptedCredentialBase64,
    credentialUpdatedAtMs: legacy.credentialUpdatedAtMs,
  });
}

function serializeCredentialEnvelope(providerId: AiProviderId, credential: string): string {
  const envelope: StoredCredentialEnvelopeV1 = Object.freeze({
    schemaVersion: CREDENTIAL_ENVELOPE_SCHEMA_VERSION,
    providerId,
    credential,
  });
  return JSON.stringify(envelope);
}

function readCredentialEnvelope(serialized: string, expectedProviderId: AiProviderId): string {
  let parsed: unknown;
  try {
    parsed = JSON.parse(serialized) as unknown;
  } catch {
    throw storeReadError("corrupt");
  }
  if (!isExactObject(parsed, ["schemaVersion", "providerId", "credential"])) {
    throw storeReadError("corrupt");
  }
  const input = parsed as Record<string, unknown>;
  if (
    input.schemaVersion !== CREDENTIAL_ENVELOPE_SCHEMA_VERSION ||
    input.providerId !== expectedProviderId
  ) {
    throw storeReadError("corrupt");
  }
  const validated = validateConnectAiProviderRequest({
    expectedRevision: null,
    providerId: input.providerId,
    apiKey: input.credential,
  });
  if (validated === null) throw storeReadError("corrupt");
  return validated.apiKey;
}

async function readRegularUtf8(path: string): Promise<string> {
  let handle: FileHandle | undefined;
  try {
    handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
    const stat = await handle.stat();
    if (!stat.isFile()) throw storeReadError("not-regular");
    if (stat.size > AI_PROVIDER_CONFIG_MAX_BYTES) throw storeReadError("too-large");
    const buffer = Buffer.allocUnsafe(AI_PROVIDER_CONFIG_MAX_BYTES + 1);
    let byteLength = 0;
    while (byteLength < buffer.byteLength) {
      const result = await handle.read(buffer, byteLength, buffer.byteLength - byteLength, null);
      if (result.bytesRead === 0) break;
      byteLength += result.bytesRead;
    }
    if (byteLength > AI_PROVIDER_CONFIG_MAX_BYTES) throw storeReadError("too-large");
    try {
      return utf8Decoder.decode(buffer.subarray(0, byteLength));
    } catch {
      throw storeReadError("corrupt");
    }
  } finally {
    await handle?.close().catch(() => undefined);
  }
}

async function ensureRoot(rootPath: string): Promise<boolean> {
  try {
    const stat = await lstat(rootPath);
    return stat.isDirectory() && !stat.isSymbolicLink();
  } catch (error: unknown) {
    if (!isNodeError(error, "ENOENT")) return false;
    try {
      await mkdir(rootPath, { recursive: true, mode: 0o700 });
      const stat = await lstat(rootPath);
      return stat.isDirectory() && !stat.isSymbolicLink();
    } catch {
      return false;
    }
  }
}

async function atomicWrite(path: string, contents: string): Promise<void> {
  const temporaryPath = `${path}.${randomUUID()}.tmp`;
  let handle: FileHandle | undefined;
  try {
    handle = await open(
      temporaryPath,
      constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY,
      0o600,
    );
    await handle.writeFile(contents, "utf8");
    await handle.sync();
    await handle.close();
    handle = undefined;
    await rename(temporaryPath, path);
  } finally {
    await handle?.close().catch(() => undefined);
    await rm(temporaryPath, { force: true }).catch(() => undefined);
  }
}

function publicConfig(
  stored: StoredAiProviderConfigV2,
  encryptionAvailable: boolean,
): AiProviderPublicConfig {
  const hasCredential = stored.encryptedCredentialBase64 !== null;
  return Object.freeze({
    schemaVersion: AI_PROVIDER_CONFIG_SCHEMA_VERSION,
    revision: stored.revision,
    providerId: stored.providerId,
    region: stored.region,
    model: stored.model,
    state: stored.state,
    hasCredential,
    credentialUsable: hasCredential && encryptionAvailable && stored.state === "connected",
    credentialUpdatedAtMs: stored.credentialUpdatedAtMs,
  });
}

function freezeStored(input: StoredAiProviderConfigV2): StoredAiProviderConfigV2 {
  return Object.freeze({ ...input });
}

function serializeStored(stored: StoredAiProviderConfigV2): string {
  const serialized = `${JSON.stringify(stored, null, 2)}\n`;
  if (Buffer.byteLength(serialized, "utf8") > AI_PROVIDER_CONFIG_MAX_BYTES) {
    throw storeReadError("too-large");
  }
  return serialized;
}

function validCredentialTimestamp(encrypted: unknown, timestamp: unknown): boolean {
  return (
    (encrypted === null && timestamp === null) ||
    (typeof encrypted === "string" && validRevision(timestamp))
  );
}

function validBase64Ciphertext(value: unknown): value is string {
  if (
    typeof value !== "string" ||
    value.length < 4 ||
    value.length > AI_PROVIDER_CONFIG_MAX_BYTES ||
    !/^[A-Za-z0-9+/]+={0,2}$/u.test(value)
  ) {
    return false;
  }
  try {
    return decodeCiphertext(value).toString("base64") === value;
  } catch {
    return false;
  }
}

function decodeCiphertext(value: string): Buffer {
  const decoded = Buffer.from(value, "base64");
  if (decoded.byteLength < 1) throw storeReadError("corrupt");
  return decoded;
}

function encryptionIsAvailable(safeStorage: AiProviderSafeStorage): boolean {
  try {
    return safeStorage.isEncryptionAvailable();
  } catch {
    return false;
  }
}

function credentialFailure(failure: AiProviderFailure): AiProviderCredentialAccessResult {
  return Object.freeze({ status: "failed", error: failure.error });
}

function classifyReadFailure(error: unknown): AiProviderFailure {
  const reason =
    error instanceof Error && "reason" in error
      ? (error as { readonly reason?: unknown }).reason
      : undefined;
  if (reason === "too-large") {
    return aiProviderFailure("AI_PROVIDER_TOO_LARGE", "AI Provider 配置文件超过 64 KiB 上限。");
  }
  if (reason === "not-regular") {
    return aiProviderFailure(
      "AI_PROVIDER_NOT_REGULAR_FILE",
      "拒绝读取非普通 AI Provider 配置文件或符号链接。",
    );
  }
  if (reason === "corrupt") {
    return aiProviderFailure(
      "AI_PROVIDER_CORRUPT_STORE",
      "AI Provider 配置损坏或版本不受支持；原文件保持不变。",
    );
  }
  return readFailure();
}

function invalidRequest(): AiProviderFailure {
  return aiProviderFailure("AI_PROVIDER_INVALID_REQUEST", "AI Provider 请求格式无效。");
}

function conflictFailure(): AiProviderFailure {
  return aiProviderFailure("AI_PROVIDER_CONFLICT", "AI Provider 配置已更新，请重新载入。");
}

function readFailure(): AiProviderFailure {
  return aiProviderFailure("AI_PROVIDER_READ_FAILED", "无法读取 AI Provider 配置。");
}

function writeFailure(): AiProviderFailure {
  return aiProviderFailure("AI_PROVIDER_WRITE_FAILED", "无法保存 AI Provider 配置。");
}

function storeReadError(reason: "corrupt" | "not-regular" | "too-large"): Error {
  return Object.assign(new Error("ai-provider-store-read-failure"), { reason });
}

function safeTimestamp(now: () => number): number {
  const value = now();
  return validRevision(value) ? value : Date.now();
}

function validRevision(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

function assertOptions(options: AiProviderConfigStoreOptions): void {
  if (
    typeof options.rootPath !== "string" ||
    !isAbsolute(options.rootPath) ||
    options.rootPath.includes("\0") ||
    options.safeStorage === null ||
    typeof options.safeStorage !== "object" ||
    typeof options.safeStorage.isEncryptionAvailable !== "function" ||
    typeof options.safeStorage.encryptString !== "function" ||
    typeof options.safeStorage.decryptString !== "function"
  ) {
    throw new TypeError("AI Provider store 需要绝对 userData 路径与 safeStorage");
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isExactObject(value: unknown, expectedKeys: readonly string[]): boolean {
  if (!isRecord(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return false;
  const keys = Object.keys(value).sort();
  const expected = [...expectedKeys].sort();
  return keys.length === expected.length && keys.every((key, index) => key === expected[index]);
}

function isNodeError(error: unknown, code: string): boolean {
  return error instanceof Error && "code" in error && error.code === code;
}
