import type { ImportedSource, SourceImportErrorCode, SourceImportResult } from "./api.js";
import { MAX_SOURCE_BYTES } from "./limits.js";

const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });

export type SourceTextValidation =
  | { readonly ok: true; readonly byteLength: number }
  | {
      readonly ok: false;
      readonly code: Extract<
        SourceImportErrorCode,
        "SOURCE_TOO_LARGE" | "SOURCE_INVALID_UTF8" | "SOURCE_CONTAINS_NUL"
      >;
      readonly message: string;
    };

export function validateSourceText(source: string): SourceTextValidation {
  if (source.includes("\0")) {
    return Object.freeze({
      ok: false,
      code: "SOURCE_CONTAINS_NUL",
      message: "C 源码包含 NUL 字节，已拒绝导入。",
    });
  }

  const bytes = encoder.encode(source);
  if (bytes.byteLength > MAX_SOURCE_BYTES) {
    return Object.freeze({
      ok: false,
      code: "SOURCE_TOO_LARGE",
      message: "C 源码超过 512 KiB 上限。",
    });
  }

  try {
    if (decoder.decode(bytes) !== source) {
      return Object.freeze({
        ok: false,
        code: "SOURCE_INVALID_UTF8",
        message: "粘贴内容不是可无损保存的 UTF-8 文本。",
      });
    }
  } catch {
    return Object.freeze({
      ok: false,
      code: "SOURCE_INVALID_UTF8",
      message: "粘贴内容不是有效的 UTF-8 文本。",
    });
  }

  return Object.freeze({ ok: true, byteLength: bytes.byteLength });
}

export function importPastedSource(source: string): SourceImportResult {
  const validation = validateSourceText(source);
  if (!validation.ok) {
    return sourceImportFailure(validation.code, validation.message);
  }

  const document: ImportedSource = Object.freeze({
    source,
    displayName: "pasted.c",
    origin: "paste",
  });
  return Object.freeze({ status: "opened", document });
}

export function sourceImportFailure(
  code: SourceImportErrorCode,
  message: string,
): SourceImportResult {
  return Object.freeze({
    status: "failed",
    error: Object.freeze({ code, message }),
  });
}
