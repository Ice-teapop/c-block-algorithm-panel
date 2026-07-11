import { randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { lstat, mkdir, open, rename, rm, type FileHandle } from "node:fs/promises";
import { isAbsolute, join } from "node:path";
import {
  LEARNING_CATALOG_MAX_BYTES,
  learningCatalogStoreFailure,
  validateLearningCatalogDocument,
  type LearningCatalogReadResult,
  type LearningCatalogSaveResult,
  type SaveLearningCatalogRequest,
  type ValidatedLearningCatalogDocument,
} from "../../src/shared/learning-catalog-store.js";

const CATALOG_FILE_NAME = "custom-blocks.json";
const utf8Decoder = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });

export interface LearningCatalogFileStore {
  read(): Promise<LearningCatalogReadResult>;
  save(request: unknown): Promise<LearningCatalogSaveResult>;
}

/**
 * The caller supplies only the application-owned workspace root. The renderer never controls or
 * observes CATALOG_FILE_NAME, so IPC cannot be repurposed into an arbitrary file primitive.
 */
export function createLearningCatalogFileStore(rootPath: string): LearningCatalogFileStore {
  if (typeof rootPath !== "string" || !isAbsolute(rootPath) || rootPath.includes("\0")) {
    throw new TypeError("自定义积木目录根路径必须是合法绝对路径");
  }
  const catalogPath = join(rootPath, CATALOG_FILE_NAME);
  let saveQueue: Promise<void> = Promise.resolve();

  return Object.freeze({
    async read(): Promise<LearningCatalogReadResult> {
      if (!(await ensureRoot(rootPath))) return rootUnavailable();
      try {
        const document = await readStoredDocument(catalogPath);
        return document === null
          ? Object.freeze({ status: "missing" })
          : Object.freeze({ status: "ready", document });
      } catch (error: unknown) {
        return readFailure(error);
      }
    },
    async save(request: unknown): Promise<LearningCatalogSaveResult> {
      const validated = validateSaveRequest(request);
      if (!validated.ok) return validated.failure;
      const operation = saveQueue
        .catch(() => undefined)
        .then(() => saveDocument(rootPath, catalogPath, validated.request));
      saveQueue = operation.then(
        () => undefined,
        () => undefined,
      );
      return operation;
    },
  });
}

async function saveDocument(
  rootPath: string,
  catalogPath: string,
  request: SaveLearningCatalogRequest,
): Promise<LearningCatalogSaveResult> {
  if (!(await ensureRoot(rootPath))) return rootUnavailable();

  let current: ValidatedLearningCatalogDocument | null;
  try {
    current = await readStoredDocument(catalogPath);
  } catch (error: unknown) {
    return readFailure(error);
  }
  const currentRevision = current?.revision ?? null;
  if (currentRevision !== request.expectedRevision) {
    return learningCatalogStoreFailure(
      "LEARNING_CATALOG_CONFLICT",
      "自定义积木目录已在磁盘更新；为避免覆盖，请重新载入。",
    );
  }

  const validation = validateLearningCatalogDocument(request.serialized);
  if (!validation.ok) {
    return validation.reason === "too-large"
      ? learningCatalogStoreFailure("LEARNING_CATALOG_TOO_LARGE", "自定义积木目录超过 2 MiB 上限。")
      : invalidDocument("自定义积木目录不是受支持的版本化 JSON 文档。");
  }
  if (currentRevision !== null && validation.document.revision <= currentRevision) {
    return invalidDocument("新目录 revision 必须高于当前磁盘 revision。");
  }

  try {
    await atomicWrite(catalogPath, validation.document.serialized);
    return Object.freeze({ status: "saved", document: validation.document });
  } catch {
    return learningCatalogStoreFailure("LEARNING_CATALOG_WRITE_FAILED", "无法保存自定义积木目录。");
  }
}

function validateSaveRequest(value: unknown):
  | { readonly ok: true; readonly request: SaveLearningCatalogRequest }
  | {
      readonly ok: false;
      readonly failure: ReturnType<typeof learningCatalogStoreFailure>;
    } {
  if (!isExactObject(value, ["expectedRevision", "serialized"])) {
    return { ok: false, failure: invalidRequest() };
  }
  const request = value as Record<string, unknown>;
  if (
    !(
      request.expectedRevision === null ||
      (Number.isSafeInteger(request.expectedRevision) && (request.expectedRevision as number) >= 0)
    ) ||
    typeof request.serialized !== "string"
  ) {
    return { ok: false, failure: invalidRequest() };
  }
  if (Buffer.byteLength(request.serialized, "utf8") > LEARNING_CATALOG_MAX_BYTES) {
    return {
      ok: false,
      failure: learningCatalogStoreFailure(
        "LEARNING_CATALOG_TOO_LARGE",
        "自定义积木目录超过 2 MiB 上限。",
      ),
    };
  }
  return {
    ok: true,
    request: Object.freeze({
      expectedRevision: request.expectedRevision as number | null,
      serialized: request.serialized,
    }),
  };
}

async function readStoredDocument(
  catalogPath: string,
): Promise<ValidatedLearningCatalogDocument | null> {
  let serialized: string;
  try {
    serialized = await readRegularUtf8(catalogPath);
  } catch (error: unknown) {
    if (isNodeError(error, "ENOENT")) return null;
    if (isNodeError(error, "ELOOP")) throw catalogReadError("not-regular");
    throw error;
  }
  const validation = validateLearningCatalogDocument(serialized);
  if (!validation.ok) throw catalogReadError(validation.reason);
  return validation.document;
}

async function readRegularUtf8(path: string): Promise<string> {
  let handle: FileHandle | undefined;
  try {
    handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
    const stat = await handle.stat();
    if (!stat.isFile()) throw catalogReadError("not-regular");
    if (stat.size > LEARNING_CATALOG_MAX_BYTES) throw catalogReadError("too-large");
    const buffer = Buffer.allocUnsafe(LEARNING_CATALOG_MAX_BYTES + 1);
    let byteLength = 0;
    while (byteLength < buffer.byteLength) {
      const result = await handle.read(buffer, byteLength, buffer.byteLength - byteLength, null);
      if (result.bytesRead === 0) break;
      byteLength += result.bytesRead;
    }
    if (byteLength > LEARNING_CATALOG_MAX_BYTES) throw catalogReadError("too-large");
    try {
      return utf8Decoder.decode(buffer.subarray(0, byteLength));
    } catch {
      throw catalogReadError("invalid");
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
      await mkdir(rootPath, { mode: 0o700 });
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

function isExactObject(value: unknown, expectedKeys: readonly string[]): boolean {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return false;
  const keys = Object.keys(value).sort();
  const expected = [...expectedKeys].sort();
  return keys.length === expected.length && keys.every((key, index) => key === expected[index]);
}

function invalidRequest(): ReturnType<typeof learningCatalogStoreFailure> {
  return learningCatalogStoreFailure(
    "LEARNING_CATALOG_INVALID_REQUEST",
    "自定义积木目录请求格式无效。",
  );
}

function invalidDocument(message: string): ReturnType<typeof learningCatalogStoreFailure> {
  return learningCatalogStoreFailure("LEARNING_CATALOG_INVALID_DOCUMENT", message);
}

function rootUnavailable(): ReturnType<typeof learningCatalogStoreFailure> {
  return learningCatalogStoreFailure(
    "LEARNING_CATALOG_ROOT_UNAVAILABLE",
    "无法准备 Documents 中的应用专属目录。",
  );
}

function readFailure(error: unknown): ReturnType<typeof learningCatalogStoreFailure> {
  const reason =
    error instanceof Error && "reason" in error
      ? (error as { readonly reason?: unknown }).reason
      : undefined;
  if (reason === "too-large") {
    return learningCatalogStoreFailure(
      "LEARNING_CATALOG_TOO_LARGE",
      "自定义积木目录超过 2 MiB 上限。",
    );
  }
  if (reason === "not-regular") {
    return learningCatalogStoreFailure(
      "LEARNING_CATALOG_NOT_REGULAR_FILE",
      "拒绝读取非普通文件或符号链接。",
    );
  }
  if (reason === "invalid") {
    return learningCatalogStoreFailure(
      "LEARNING_CATALOG_CORRUPT",
      "自定义积木目录损坏或版本不受支持；原文件保持不变。",
    );
  }
  return learningCatalogStoreFailure("LEARNING_CATALOG_READ_FAILED", "无法读取自定义积木目录。");
}

function catalogReadError(reason: "invalid" | "not-regular" | "too-large"): Error {
  return Object.assign(new Error("learning-catalog-read-failure"), { reason });
}

function isNodeError(error: unknown, code: string): boolean {
  return error instanceof Error && "code" in error && error.code === code;
}
