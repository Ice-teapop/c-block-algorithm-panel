import type { ImportedSource, SourceImportErrorCode, SourceImportResult } from "../shared/api.js";
import { importPastedSource } from "../shared/source-import.js";
import type { WorkbenchElements } from "../ui/workbench-shell.js";

export type SourceImportStatusState = "loading" | "ready" | "error";

export interface SourceImportControllerOptions {
  readonly load: (document: ImportedSource, isCurrent: () => boolean) => void | Promise<void>;
}

export interface SourceImportController {
  setEnabled(enabled: boolean): void;
  setStatus(message: string, state: SourceImportStatusState): void;
  destroy(): void;
}

/** Owns native-open, paste and file-drop UI without owning the parser session. */
export function createSourceImportController(
  elements: WorkbenchElements,
  options: SourceImportControllerOptions,
): SourceImportController {
  if (typeof options.load !== "function") {
    throw new TypeError("source import options.load 必须是函数");
  }

  let requestId = 0;
  let dragDepth = 0;
  let destroyed = false;
  const english = (): boolean => elements.shell.dataset.locale === "en";
  let localizedStatus: {
    readonly zh: string;
    readonly en: string;
    readonly state: SourceImportStatusState;
  } | null = null;

  const setStatus = (message: string, state: SourceImportStatusState): void => {
    if (typeof message !== "string" || !isStatusState(state)) {
      throw new TypeError("source import status 必须提供字符串与合法 state");
    }
    localizedStatus = null;
    elements.importStatus.textContent = message;
    elements.importStatus.dataset.state = state;
  };

  const setLocalizedStatus = (zh: string, en: string, state: SourceImportStatusState): void => {
    localizedStatus = Object.freeze({ zh, en, state });
    elements.importStatus.textContent = english() ? en : zh;
    elements.importStatus.dataset.state = state;
  };

  const applyResult = async (
    result: SourceImportResult,
    currentRequest: number,
  ): Promise<boolean> => {
    const isCurrent = (): boolean => !destroyed && currentRequest === requestId;
    if (!isCurrent()) return false;
    if (result.status === "cancelled") {
      setLocalizedStatus(
        "已取消文件选择，当前文档保持不变。",
        "File selection cancelled; the current document is unchanged.",
        "ready",
      );
      return false;
    }
    if (result.status === "failed") {
      setLocalizedStatus(
        `${result.error.code}：${result.error.message}`,
        `${result.error.code}: ${sourceImportErrorMessage(result.error.code, result.error.message)}`,
        "error",
      );
      return false;
    }
    try {
      await options.load(result.document, isCurrent);
      if (!isCurrent()) return false;
      setLocalizedStatus(
        `已载入 ${result.document.displayName}。`,
        `Loaded ${result.document.displayName}.`,
        "ready",
      );
      return true;
    } catch (error: unknown) {
      if (isCurrent()) {
        setLocalizedStatus(
          `源码载入失败：${errorMessage(error, false)}；当前文档保持不变。`,
          `Source import failed: ${errorMessage(error, true)}. The current document is unchanged.`,
          "error",
        );
      }
      return false;
    }
  };

  const openNativeSource = async (): Promise<void> => {
    const currentRequest = ++requestId;
    setLocalizedStatus("正在等待系统文件选择器…", "Waiting for the system file picker…", "loading");
    try {
      const result = await window.panelApi.openSource();
      if (!destroyed && currentRequest === requestId) await applyResult(result, currentRequest);
    } catch {
      if (!destroyed && currentRequest === requestId) {
        setLocalizedStatus("文件选择器 IPC 调用失败。", "File-picker IPC request failed.", "error");
      }
    }
  };

  const showPasteDialog = (): void => {
    elements.pasteError.textContent = "";
    elements.pasteSource.value = "";
    elements.pasteDialog.showModal();
    elements.pasteSource.focus();
  };

  const confirmPaste = async (): Promise<void> => {
    const result = importPastedSource(elements.pasteSource.value);
    if (result.status === "failed") {
      elements.pasteError.textContent = english()
        ? sourceImportErrorMessage(result.error.code, result.error.message)
        : result.error.message;
      return;
    }
    if (result.status === "opened") {
      const currentRequest = ++requestId;
      if (await applyResult(result, currentRequest)) {
        elements.pasteDialog.close("loaded");
      }
    }
  };

  const clearPasteError = (): void => {
    elements.pasteError.textContent = "";
  };

  const onDragEnter = (event: DragEvent): void => {
    if (!hasFiles(event)) return;
    event.preventDefault();
    dragDepth += 1;
    elements.dropOverlay.hidden = false;
  };

  const onDragOver = (event: DragEvent): void => {
    if (!hasFiles(event)) return;
    event.preventDefault();
    if (event.dataTransfer !== null) event.dataTransfer.dropEffect = "copy";
  };

  const onDragLeave = (event: DragEvent): void => {
    if (!hasFiles(event)) return;
    dragDepth = Math.max(0, dragDepth - 1);
    if (dragDepth === 0) elements.dropOverlay.hidden = true;
  };

  const onDrop = (event: DragEvent): void => {
    if (!hasFiles(event)) return;
    event.preventDefault();
    dragDepth = 0;
    elements.dropOverlay.hidden = true;
    const files = event.dataTransfer?.files;
    if (files === undefined || files.length !== 1 || files[0] === undefined) {
      setLocalizedStatus(
        "请一次只拖入一个 .c 文件。",
        "Drop exactly one .c file at a time.",
        "error",
      );
      return;
    }
    const currentRequest = ++requestId;
    setLocalizedStatus("正在读取拖入的 C 文件…", "Reading the dropped C file…", "loading");
    void window.panelApi
      .openDroppedSource(files[0])
      .then(async (result) => {
        if (!destroyed && currentRequest === requestId) {
          await applyResult(result, currentRequest);
        }
      })
      .catch(() => {
        if (!destroyed && currentRequest === requestId) {
          setLocalizedStatus(
            "拖拽导入 IPC 调用失败。",
            "Drag-and-drop import IPC request failed.",
            "error",
          );
        }
      });
  };

  elements.openButton.addEventListener("click", openNativeSource);
  elements.pasteButton.addEventListener("click", showPasteDialog);
  const onPasteConfirm = (): void => void confirmPaste();
  elements.pasteConfirm.addEventListener("click", onPasteConfirm);
  elements.pasteDialog.addEventListener("close", clearPasteError);
  elements.shell.addEventListener("dragenter", onDragEnter);
  elements.shell.addEventListener("dragover", onDragOver);
  elements.shell.addEventListener("dragleave", onDragLeave);
  elements.shell.addEventListener("drop", onDrop);
  const onLocaleChange = (): void => {
    if (localizedStatus === null) return;
    elements.importStatus.textContent = english() ? localizedStatus.en : localizedStatus.zh;
  };
  elements.shell.addEventListener("workbench-locale-change", onLocaleChange);

  return Object.freeze({
    setEnabled(enabled: boolean): void {
      if (destroyed) return;
      if (typeof enabled !== "boolean") throw new TypeError("enabled 必须是布尔值");
      elements.openButton.disabled = !enabled;
      elements.pasteButton.disabled = !enabled;
    },
    setStatus,
    destroy(): void {
      if (destroyed) return;
      destroyed = true;
      requestId += 1;
      dragDepth = 0;
      elements.dropOverlay.hidden = true;
      elements.openButton.removeEventListener("click", openNativeSource);
      elements.pasteButton.removeEventListener("click", showPasteDialog);
      elements.pasteConfirm.removeEventListener("click", onPasteConfirm);
      elements.pasteDialog.removeEventListener("close", clearPasteError);
      elements.shell.removeEventListener("dragenter", onDragEnter);
      elements.shell.removeEventListener("dragover", onDragOver);
      elements.shell.removeEventListener("dragleave", onDragLeave);
      elements.shell.removeEventListener("drop", onDrop);
      elements.shell.removeEventListener("workbench-locale-change", onLocaleChange);
    },
  });
}

function hasFiles(event: DragEvent): boolean {
  return event.dataTransfer?.types.includes("Files") === true;
}

function isStatusState(state: string): state is SourceImportStatusState {
  return state === "loading" || state === "ready" || state === "error";
}

function errorMessage(error: unknown, english: boolean): string {
  if (!(error instanceof Error)) return english ? "unknown error" : "未知错误";
  return english && /[\u3400-\u9fff]/u.test(error.message)
    ? "the source could not be loaded"
    : error.message;
}

export function sourceImportErrorMessage(code: SourceImportErrorCode, message: string): string {
  if (!/[\u3400-\u9fff]/u.test(message)) return message;
  const copy: Readonly<Record<SourceImportErrorCode, string>> = Object.freeze({
    SOURCE_IMPORT_BUSY: "Another source import is already in progress.",
    SOURCE_CONTEXT_CLOSED: "The source import was cancelled because the app is closing.",
    SOURCE_DIALOG_FAILED: "The system file picker could not be opened.",
    SOURCE_INVALID_DROP: "Drop exactly one regular .c file.",
    SOURCE_INVALID_REQUEST: "The source import request is invalid.",
    SOURCE_NOT_C_FILE: "Only .c files can be imported.",
    SOURCE_NOT_REGULAR_FILE: "The selected item is not a regular file.",
    SOURCE_TOO_LARGE: "The C source exceeds the 512 KiB limit.",
    SOURCE_INVALID_UTF8: "The source is not valid lossless UTF-8 text.",
    SOURCE_CONTAINS_NUL: "The C source contains a NUL byte and was rejected.",
    SOURCE_READ_FAILED: "The selected C file could not be read.",
  });
  return copy[code];
}
