import { constants } from "node:fs";
import { open, type FileHandle } from "node:fs/promises";
import { basename, extname, isAbsolute } from "node:path";
import type {
  SourceImportErrorCode,
  SourceImportResult,
  SourceOrigin,
} from "../../src/shared/api.js";
import { MAX_SOURCE_BYTES } from "../../src/shared/limits.js";
import { sourceImportFailure } from "../../src/shared/source-import.js";

const MAX_SOURCE_PATH_BYTES = 4 * 1024;
const utf8Decoder = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });

export interface DroppedSourceRequest {
  readonly path: string;
}

type PathValidation =
  | { readonly ok: true; readonly path: string }
  | { readonly ok: false; readonly result: SourceImportResult };

export function validateDroppedSourceRequest(value: unknown): PathValidation {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return invalidDropRequest();
  }
  const keys = Object.keys(value);
  if (keys.length !== 1 || keys[0] !== "path") {
    return invalidDropRequest();
  }
  const path = (value as { readonly path?: unknown }).path;
  if (
    typeof path !== "string" ||
    path.length === 0 ||
    path.includes("\0") ||
    !isAbsolute(path) ||
    Buffer.byteLength(path, "utf8") > MAX_SOURCE_PATH_BYTES
  ) {
    return invalidDropRequest();
  }
  return Object.freeze({ ok: true, path });
}

export async function readSourceFile(
  path: string,
  origin: Extract<SourceOrigin, "dialog" | "drop">,
): Promise<SourceImportResult> {
  if (extname(path) !== ".c") {
    return sourceImportFailure("SOURCE_NOT_C_FILE", "只支持导入扩展名为 .c 的 C 源文件。");
  }

  let handle: FileHandle | undefined;
  try {
    handle = await open(path, constants.O_RDONLY | constants.O_NONBLOCK);
    const stat = await handle.stat();
    if (!stat.isFile()) {
      return sourceImportFailure("SOURCE_NOT_REGULAR_FILE", "所选项目不是普通 C 源文件。");
    }
    if (stat.size > MAX_SOURCE_BYTES) {
      return sourceImportFailure("SOURCE_TOO_LARGE", "C 源码超过 512 KiB 上限。");
    }

    const buffer = Buffer.allocUnsafe(MAX_SOURCE_BYTES + 1);
    let byteLength = 0;
    while (byteLength < buffer.byteLength) {
      const { bytesRead } = await handle.read(
        buffer,
        byteLength,
        buffer.byteLength - byteLength,
        null,
      );
      if (bytesRead === 0) {
        break;
      }
      byteLength += bytesRead;
    }
    if (byteLength > MAX_SOURCE_BYTES) {
      return sourceImportFailure("SOURCE_TOO_LARGE", "C 源码超过 512 KiB 上限。");
    }

    let source: string;
    try {
      source = utf8Decoder.decode(buffer.subarray(0, byteLength));
    } catch {
      return sourceImportFailure("SOURCE_INVALID_UTF8", "C 源文件不是有效的 UTF-8 文本。");
    }
    if (source.includes("\0")) {
      return sourceImportFailure("SOURCE_CONTAINS_NUL", "C 源码包含 NUL 字节，已拒绝导入。");
    }

    return Object.freeze({
      status: "opened",
      document: Object.freeze({ source, displayName: basename(path), origin }),
    });
  } catch {
    return sourceImportFailure("SOURCE_READ_FAILED", "无法读取所选 C 源文件。");
  } finally {
    await handle?.close().catch(() => undefined);
  }
}

export function sourceImportContextFailure(): SourceImportResult {
  return sourceImportFailure("SOURCE_CONTEXT_CLOSED", "请求页面已失效，导入已取消。");
}

export function sourceImportBusyFailure(): SourceImportResult {
  return sourceImportFailure("SOURCE_IMPORT_BUSY", "已有源码导入请求正在处理。");
}

export function sourceDialogFailure(): SourceImportResult {
  return sourceImportFailure("SOURCE_DIALOG_FAILED", "无法打开系统文件选择器。");
}

export function invalidDroppedSourceFailure(): SourceImportResult {
  return sourceImportFailure("SOURCE_INVALID_DROP", "拖入的项目不是可读取的本地 C 文件。");
}

export function invalidSourceImportRequestFailure(): SourceImportResult {
  return sourceImportFailure("SOURCE_INVALID_REQUEST", "源码导入请求格式无效。");
}

function invalidDropRequest(): PathValidation {
  return Object.freeze({
    ok: false,
    result: sourceImportFailure(
      "SOURCE_INVALID_REQUEST" satisfies SourceImportErrorCode,
      "拖拽导入请求格式无效。",
    ),
  });
}
