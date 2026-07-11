import { randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { lstat, open, rename, rm, type FileHandle } from "node:fs/promises";
import { isAbsolute, join } from "node:path";
import { workspaceFailure } from "../../src/shared/workspace.js";
import {
  isWorkspaceSidecarKind,
  type ReadWorkspaceSidecarRequest,
  type SaveWorkspaceSidecarRequest,
  type WorkspaceSidecarDocument,
  type WorkspaceSidecarKind,
  type WorkspaceSidecarReadResult,
  type WorkspaceSidecarSaveResult,
} from "../../src/shared/workspace-sidecar.js";

const SIDECAR_SCHEMA_VERSION = 1;
const ENTRY_ID_PATTERN =
  /^(project|sandbox|test)-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const KIND_DIRECTORIES = Object.freeze({
  project: "Projects",
  sandbox: "Sandboxes",
  test: "Tests",
} as const);
const SIDECAR_FILES: Readonly<Record<WorkspaceSidecarKind, string>> = Object.freeze({
  "flow-view": "flow-view.json",
  scenarios: "scenarios.json",
  "run-history": "run-history.json",
});
const SIDECAR_MAX_BYTES: Readonly<Record<WorkspaceSidecarKind, number>> = Object.freeze({
  "flow-view": 1024 * 1024,
  scenarios: 1024 * 1024,
  "run-history": 4 * 1024 * 1024,
});
const SIDECAR_FILE_OVERHEAD_BYTES = 2048;
const SOURCE_FINGERPRINT_MAX_LENGTH = 128;
const utf8Decoder = new TextDecoder("utf-8", { fatal: true });

interface StoredWorkspaceSidecar {
  readonly schemaVersion: typeof SIDECAR_SCHEMA_VERSION;
  readonly kind: WorkspaceSidecarKind;
  readonly revision: number;
  readonly sourceFingerprint: string;
  readonly updatedAt: string;
  readonly payload: unknown;
}

export interface WorkspaceSidecarStore {
  read(request: unknown): Promise<WorkspaceSidecarReadResult>;
  save(request: unknown): Promise<WorkspaceSidecarSaveResult>;
}

export function createWorkspaceSidecarStore(rootPath: string): WorkspaceSidecarStore {
  if (typeof rootPath !== "string" || !isAbsolute(rootPath) || rootPath.includes("\0")) {
    throw new TypeError("sidecar 工作区根目录必须是合法绝对路径");
  }
  const saveQueues = new Map<string, Promise<WorkspaceSidecarSaveResult>>();

  return Object.freeze({
    async read(request: unknown): Promise<WorkspaceSidecarReadResult> {
      const validated = validateReadRequest(request);
      if (!validated.ok) return validated.failure;
      const location = await resolveLocation(
        rootPath,
        validated.request.entryId,
        validated.request.kind,
      );
      if (!location.ok) return location.failure;
      try {
        const stored = await readStoredSidecar(location.path, validated.request.kind);
        if (stored === null) {
          return Object.freeze({ status: "missing", kind: validated.request.kind });
        }
        return Object.freeze({ status: "ready", document: toDocument(stored) });
      } catch (error: unknown) {
        return readFailure(error, validated.request.kind);
      }
    },

    async save(request: unknown): Promise<WorkspaceSidecarSaveResult> {
      const validated = validateSaveRequest(request);
      if (!validated.ok) return validated.failure;
      const key = `${validated.request.entryId}\0${validated.request.kind}`;
      const previous = saveQueues.get(key) ?? Promise.resolve(undefined);
      const task = previous
        .catch(() => undefined)
        .then(() => saveSidecar(rootPath, validated.request));
      saveQueues.set(key, task);
      return task.finally(() => {
        if (saveQueues.get(key) === task) saveQueues.delete(key);
      });
    },
  });
}

async function saveSidecar(
  rootPath: string,
  request: SaveWorkspaceSidecarRequest,
): Promise<WorkspaceSidecarSaveResult> {
  const location = await resolveLocation(rootPath, request.entryId, request.kind);
  if (!location.ok) return location.failure;
  let current: StoredWorkspaceSidecar | null;
  try {
    current = await readStoredSidecar(location.path, request.kind);
  } catch (error: unknown) {
    return readFailure(error, request.kind);
  }
  const currentRevision = current?.revision ?? null;
  if (currentRevision !== request.expectedRevision) {
    return workspaceFailure("WORKSPACE_CONFLICT", "视图数据已在磁盘更新；请重新载入后再保存。");
  }
  let payload: unknown;
  try {
    payload = JSON.parse(request.serialized) as unknown;
  } catch {
    return invalidSidecar("sidecar 必须是合法 JSON 文档。");
  }
  if (!isJsonContainer(payload)) {
    return invalidSidecar("sidecar 顶层必须是 JSON 对象或数组。");
  }
  const canonicalPayload = JSON.stringify(payload);
  if (Buffer.byteLength(canonicalPayload, "utf8") > SIDECAR_MAX_BYTES[request.kind]) {
    return workspaceFailure("WORKSPACE_SIDECAR_TOO_LARGE", "sidecar 超过本地存储上限。");
  }
  const stored: StoredWorkspaceSidecar = Object.freeze({
    schemaVersion: SIDECAR_SCHEMA_VERSION,
    kind: request.kind,
    revision: (currentRevision ?? -1) + 1,
    sourceFingerprint: request.sourceFingerprint,
    updatedAt: new Date().toISOString(),
    payload,
  });
  try {
    await atomicWrite(location.path, `${JSON.stringify(stored, null, 2)}\n`);
    return Object.freeze({ status: "saved", document: toDocument(stored) });
  } catch {
    return workspaceFailure("WORKSPACE_WRITE_FAILED", "无法保存工作区 sidecar。");
  }
}

async function resolveLocation(
  rootPath: string,
  entryId: string,
  kind: WorkspaceSidecarKind,
): Promise<
  | { readonly ok: true; readonly path: string }
  | { readonly ok: false; readonly failure: ReturnType<typeof workspaceFailure> }
> {
  const entryKind = ENTRY_ID_PATTERN.exec(entryId)?.[1] as
    keyof typeof KIND_DIRECTORIES | undefined;
  if (entryKind === undefined) return { ok: false, failure: invalidRequest() };
  const root = await realDirectory(rootPath);
  if (!root) return { ok: false, failure: rootUnavailable() };
  const kindDirectory = join(rootPath, KIND_DIRECTORIES[entryKind]);
  if (!(await realDirectory(kindDirectory))) {
    return {
      ok: false,
      failure: workspaceFailure("WORKSPACE_NOT_FOUND", "工作区类型目录不存在。"),
    };
  }
  const entryDirectory = join(kindDirectory, entryId);
  if (!(await realDirectory(entryDirectory))) {
    return { ok: false, failure: workspaceFailure("WORKSPACE_NOT_FOUND", "工作区条目不存在。") };
  }
  return { ok: true, path: join(entryDirectory, SIDECAR_FILES[kind]) };
}

async function realDirectory(path: string): Promise<boolean> {
  try {
    const stat = await lstat(path);
    return stat.isDirectory() && !stat.isSymbolicLink();
  } catch {
    return false;
  }
}

async function readStoredSidecar(
  path: string,
  expectedKind: WorkspaceSidecarKind,
): Promise<StoredWorkspaceSidecar | null> {
  let text: string;
  try {
    text = await readRegularUtf8(
      path,
      SIDECAR_MAX_BYTES[expectedKind] + SIDECAR_FILE_OVERHEAD_BYTES,
    );
  } catch (error: unknown) {
    if (isNodeError(error, "ENOENT")) return null;
    throw error;
  }
  let value: unknown;
  try {
    value = JSON.parse(text) as unknown;
  } catch {
    throw sidecarReadError("invalid");
  }
  if (!isExactStoredSidecar(value, expectedKind)) throw sidecarReadError("invalid");
  const serialized = JSON.stringify(value.payload);
  if (Buffer.byteLength(serialized, "utf8") > SIDECAR_MAX_BYTES[expectedKind]) {
    throw sidecarReadError("too-large");
  }
  return Object.freeze({ ...value });
}

async function readRegularUtf8(path: string, maxBytes: number): Promise<string> {
  let handle: FileHandle | undefined;
  try {
    handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
    const stat = await handle.stat();
    if (!stat.isFile()) throw sidecarReadError("invalid");
    if (stat.size > maxBytes) throw sidecarReadError("too-large");
    const buffer = Buffer.allocUnsafe(maxBytes + 1);
    let offset = 0;
    while (offset < buffer.byteLength) {
      const result = await handle.read(buffer, offset, buffer.byteLength - offset, null);
      if (result.bytesRead === 0) break;
      offset += result.bytesRead;
    }
    if (offset > maxBytes) throw sidecarReadError("too-large");
    return utf8Decoder.decode(buffer.subarray(0, offset));
  } finally {
    await handle?.close().catch(() => undefined);
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

function validateReadRequest(
  value: unknown,
):
  | { readonly ok: true; readonly request: ReadWorkspaceSidecarRequest }
  | { readonly ok: false; readonly failure: ReturnType<typeof workspaceFailure> } {
  if (!isExactObject(value, ["entryId", "kind"])) return { ok: false, failure: invalidRequest() };
  const request = value as Record<string, unknown>;
  if (
    typeof request.entryId !== "string" ||
    !ENTRY_ID_PATTERN.test(request.entryId) ||
    !isWorkspaceSidecarKind(request.kind)
  ) {
    return { ok: false, failure: invalidRequest() };
  }
  return {
    ok: true,
    request: Object.freeze({ entryId: request.entryId, kind: request.kind }),
  };
}

function validateSaveRequest(
  value: unknown,
):
  | { readonly ok: true; readonly request: SaveWorkspaceSidecarRequest }
  | { readonly ok: false; readonly failure: ReturnType<typeof workspaceFailure> } {
  if (
    !isExactObject(value, [
      "entryId",
      "expectedRevision",
      "kind",
      "serialized",
      "sourceFingerprint",
    ])
  ) {
    return { ok: false, failure: invalidRequest() };
  }
  const request = value as Record<string, unknown>;
  if (
    typeof request.entryId !== "string" ||
    !ENTRY_ID_PATTERN.test(request.entryId) ||
    !isWorkspaceSidecarKind(request.kind) ||
    !(
      request.expectedRevision === null ||
      (Number.isSafeInteger(request.expectedRevision) && (request.expectedRevision as number) >= 0)
    ) ||
    typeof request.sourceFingerprint !== "string" ||
    request.sourceFingerprint.length === 0 ||
    request.sourceFingerprint.length > SOURCE_FINGERPRINT_MAX_LENGTH ||
    request.sourceFingerprint.includes("\0") ||
    typeof request.serialized !== "string" ||
    Buffer.byteLength(request.serialized, "utf8") > SIDECAR_MAX_BYTES[request.kind]
  ) {
    return { ok: false, failure: invalidSidecar("sidecar 保存请求无效。") };
  }
  return {
    ok: true,
    request: Object.freeze({
      entryId: request.entryId,
      expectedRevision: request.expectedRevision as number | null,
      kind: request.kind,
      serialized: request.serialized,
      sourceFingerprint: request.sourceFingerprint,
    }),
  };
}

function isExactStoredSidecar(
  value: unknown,
  expectedKind: WorkspaceSidecarKind,
): value is StoredWorkspaceSidecar {
  if (
    !isExactObject(value, [
      "kind",
      "payload",
      "revision",
      "schemaVersion",
      "sourceFingerprint",
      "updatedAt",
    ])
  ) {
    return false;
  }
  const stored = value as Record<string, unknown>;
  return (
    stored.schemaVersion === SIDECAR_SCHEMA_VERSION &&
    stored.kind === expectedKind &&
    Number.isSafeInteger(stored.revision) &&
    (stored.revision as number) >= 0 &&
    typeof stored.sourceFingerprint === "string" &&
    stored.sourceFingerprint.length > 0 &&
    stored.sourceFingerprint.length <= SOURCE_FINGERPRINT_MAX_LENGTH &&
    typeof stored.updatedAt === "string" &&
    !Number.isNaN(Date.parse(stored.updatedAt)) &&
    isJsonContainer(stored.payload)
  );
}

function isExactObject(value: unknown, expectedKeys: readonly string[]): boolean {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return false;
  const keys = Object.keys(value).sort();
  return (
    keys.length === expectedKeys.length && keys.every((key, index) => key === expectedKeys[index])
  );
}

function isJsonContainer(value: unknown): value is Record<string, unknown> | readonly unknown[] {
  return typeof value === "object" && value !== null;
}

function toDocument(stored: StoredWorkspaceSidecar): WorkspaceSidecarDocument {
  return Object.freeze({
    kind: stored.kind,
    revision: stored.revision,
    sourceFingerprint: stored.sourceFingerprint,
    serialized: JSON.stringify(stored.payload),
    updatedAt: stored.updatedAt,
  });
}

function invalidRequest(): ReturnType<typeof workspaceFailure> {
  return workspaceFailure("WORKSPACE_INVALID_REQUEST", "sidecar 请求格式无效。");
}

function invalidSidecar(message: string): ReturnType<typeof workspaceFailure> {
  return workspaceFailure("WORKSPACE_INVALID_SIDECAR", message);
}

function rootUnavailable(): ReturnType<typeof workspaceFailure> {
  return workspaceFailure("WORKSPACE_ROOT_UNAVAILABLE", "无法访问 Documents 工作区。");
}

function readFailure(
  error: unknown,
  _kind: WorkspaceSidecarKind,
): {
  readonly status: "failed";
  readonly error: {
    readonly code: import("../../src/shared/workspace.js").WorkspaceErrorCode;
    readonly message: string;
  };
} {
  const reason =
    typeof error === "object" && error !== null && "reason" in error
      ? (error as { readonly reason?: unknown }).reason
      : undefined;
  return reason === "too-large"
    ? workspaceFailure("WORKSPACE_SIDECAR_TOO_LARGE", "sidecar 超过本地读取上限。")
    : workspaceFailure("WORKSPACE_READ_FAILED", "无法读取工作区 sidecar。");
}

function sidecarReadError(reason: "invalid" | "too-large"): Error {
  return Object.assign(new Error("sidecar-read-failure"), { reason });
}

function isNodeError(error: unknown, code: string): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { readonly code?: unknown }).code === code
  );
}
