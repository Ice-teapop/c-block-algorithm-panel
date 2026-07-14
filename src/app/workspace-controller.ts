import type { ImportedSource, PanelApi } from "../shared/api.js";
import type {
  WorkspaceDocument,
  WorkspaceEntrySummary,
  WorkspaceErrorCode,
  WorkspaceKind,
} from "../shared/workspace.js";
import {
  createWorkspacePersistence,
  type WorkspacePersistenceStatus,
} from "./workspace-persistence.js";
import { createWorkspaceDashboard, type WorkspaceDashboard } from "../ui/workspace-dashboard.js";

export interface WorkspaceControllerOptions {
  readonly host: HTMLElement;
  readonly api: Pick<
    PanelApi,
    | "listWorkspaceDocuments"
    | "createWorkspaceDocument"
    | "openWorkspaceDocument"
    | "saveWorkspaceDocument"
  >;
  readonly saveStatus: HTMLOutputElement;
  readonly recoveryButton: HTMLButtonElement;
  readonly load: (document: ImportedSource) => void;
  readonly enterWorkbench: () => void;
  readonly onActiveEntryChange?: ((entry: WorkspaceEntrySummary | null) => void) | undefined;
}

export interface WorkspaceController {
  readonly dashboard: WorkspaceDashboard;
  readonly activeEntry: WorkspaceEntrySummary | null;
  readonly hasUnsavedChanges: boolean;
  initialize(): Promise<void>;
  refresh(): Promise<void>;
  createDocument(kind: WorkspaceKind, title: string, initialSource?: string): Promise<boolean>;
  handleSourceChange(source: string): void;
  flush(): Promise<void>;
  prepareExternalImport(isCurrent: () => boolean): Promise<boolean>;
  deactivate(): Promise<void>;
  destroy(): void;
}

export function createWorkspaceController(
  options: WorkspaceControllerOptions,
): WorkspaceController {
  assertOptions(options);
  let destroyed = false;
  let generation = 0;
  const localeHost =
    typeof options.host.closest === "function"
      ? options.host.closest<HTMLElement>("[data-locale]")
      : null;
  const english = (): boolean => localeHost?.dataset.locale === "en";
  let lastDashboardStatus: {
    readonly zh: string;
    readonly en: string;
    readonly state: "ready" | "loading" | "success" | "error";
  } | null = null;
  let lastPersistenceStatus: WorkspacePersistenceStatus | null = null;

  const renderPersistenceStatus = (status: WorkspacePersistenceStatus): void => {
    lastPersistenceStatus = status;
    options.saveStatus.dataset.state = status.state;
    options.saveStatus.textContent = workspacePersistenceMessage(
      status,
      english() ? "en" : "zh-CN",
    );
    options.recoveryButton.hidden = status.recovery !== "reload-disk";
  };

  const setDashboardStatus = (
    zh: string,
    en: string,
    state: "ready" | "loading" | "success" | "error" = "ready",
  ): void => {
    lastDashboardStatus = Object.freeze({ zh, en, state });
    dashboard.setStatus(english() ? en : zh, state);
  };

  const persistence = createWorkspacePersistence({
    save: (entryId, expectedRevision, source) =>
      options.api.saveWorkspaceDocument({ entryId, expectedRevision, source }),
    onStatus: renderPersistenceStatus,
  });

  const setFailure = (code: string, message: string): void => {
    setDashboardStatus(
      `${code}：${message}`,
      `${code}: ${safeWorkspaceErrorMessage(code, message)}`,
      "error",
    );
  };

  const adopt = (document: WorkspaceDocument): void => {
    persistence.adopt(document.entry);
    options.load({
      source: document.source,
      displayName: `${document.entry.title}.c`,
      origin: "workspace",
    });
    options.onActiveEntryChange?.(document.entry);
    options.enterWorkbench();
    setDashboardStatus(
      `已打开“${document.entry.title}”。`,
      `Opened “${document.entry.title}”.`,
      "success",
    );
  };

  const refresh = async (): Promise<void> => {
    if (destroyed) return;
    const requestGeneration = ++generation;
    setDashboardStatus("正在读取 Documents 工作区…", "Reading the Documents workspace…", "loading");
    try {
      const result = await options.api.listWorkspaceDocuments();
      if (destroyed || requestGeneration !== generation) return;
      if (result.status === "failed") {
        setFailure(result.error.code, result.error.message);
        return;
      }
      dashboard.setSnapshot(result.snapshot);
      setDashboardStatus(
        result.snapshot.entries.length === 0
          ? "工作区为空；新建条目后会立即写入 Documents。"
          : `已载入 ${String(result.snapshot.entries.length)} 个本地条目。`,
        result.snapshot.entries.length === 0
          ? "The workspace is empty. New entries are written to Documents immediately."
          : `Loaded ${String(result.snapshot.entries.length)} local entries.`,
        "ready",
      );
    } catch {
      if (!destroyed && requestGeneration === generation) {
        setDashboardStatus("工作区 IPC 调用失败。", "Workspace IPC request failed.", "error");
      }
    }
  };

  async function createDocument(
    kind: WorkspaceKind,
    title: string,
    initialSource?: string,
  ): Promise<boolean> {
    const requestGeneration = ++generation;
    setDashboardStatus("正在创建本地条目…", "Creating a local entry…", "loading");
    try {
      await persistence.flush();
      const result = await options.api.createWorkspaceDocument({
        kind,
        title,
        ...(initialSource === undefined ? {} : { initialSource }),
      });
      if (destroyed || requestGeneration !== generation) return false;
      if (result.status === "failed") {
        setFailure(result.error.code, result.error.message);
        return false;
      }
      adopt(result.document);
      void refresh();
      return true;
    } catch {
      if (!destroyed && requestGeneration === generation) {
        setDashboardStatus(
          "创建条目的 IPC 调用失败。",
          "Create-entry IPC request failed.",
          "error",
        );
      }
      return false;
    }
  }

  const dashboard = createWorkspaceDashboard(options.host, {
    onCreate: createDocument,
    async onOpen(entryId: string): Promise<void> {
      const requestGeneration = ++generation;
      setDashboardStatus("正在打开本地条目…", "Opening the local entry…", "loading");
      try {
        await persistence.flush();
        const result = await options.api.openWorkspaceDocument({ entryId });
        if (destroyed || requestGeneration !== generation) return;
        if (result.status === "failed") {
          setFailure(result.error.code, result.error.message);
          return;
        }
        adopt(result.document);
      } catch {
        if (!destroyed && requestGeneration === generation) {
          setDashboardStatus(
            "打开条目的 IPC 调用失败。",
            "Open-entry IPC request failed.",
            "error",
          );
        }
      }
    },
    onRefresh: refresh,
  });

  const recoverDiskVersion = async (): Promise<void> => {
    if (destroyed || options.recoveryButton.hidden || options.recoveryButton.disabled) return;
    const entry = persistence.activeEntry;
    if (entry === null) return;
    const ownerWindow = options.host.ownerDocument.defaultView;
    if (
      ownerWindow?.confirm(
        english()
          ? "The disk version changed. Reloading discards current unsaved edits; saved history is unaffected. Continue?"
          : "磁盘版本已更新。重新载入会放弃当前未保存修改；已保存的历史版本不受影响。继续吗？",
      ) !== true
    ) {
      return;
    }
    const expectedSourceVersion = persistence.sourceVersion;
    const requestGeneration = ++generation;
    options.recoveryButton.disabled = true;
    setDashboardStatus("正在重新读取磁盘版本…", "Reloading the disk version…", "loading");
    try {
      const result = await options.api.openWorkspaceDocument({ entryId: entry.id });
      if (destroyed || requestGeneration !== generation) return;
      if (result.status === "failed") {
        setFailure(result.error.code, result.error.message);
        return;
      }
      if (persistence.sourceVersion !== expectedSourceVersion) {
        setDashboardStatus(
          "源码在恢复期间再次变化；未放弃本地修改，请重新操作。",
          "Source changed again during recovery. Local edits were kept; try again.",
          "error",
        );
        return;
      }
      options.load({
        source: result.document.source,
        displayName: `${result.document.entry.title}.c`,
        origin: "workspace",
      });
      persistence.discardActiveChanges(expectedSourceVersion);
      persistence.adopt(result.document.entry);
      options.onActiveEntryChange?.(result.document.entry);
      options.enterWorkbench();
      setDashboardStatus(
        `已重新载入“${result.document.entry.title}”的磁盘版本。`,
        `Reloaded the disk version of “${result.document.entry.title}”.`,
        "success",
      );
    } catch {
      if (!destroyed && requestGeneration === generation) {
        setDashboardStatus(
          "重新载入磁盘版本失败；本地修改仍保留。",
          "Failed to reload the disk version; local edits were kept.",
          "error",
        );
      }
    } finally {
      if (!destroyed) options.recoveryButton.disabled = false;
    }
  };
  const onRecoverDiskVersion = (): void => void recoverDiskVersion();
  options.recoveryButton.addEventListener("click", onRecoverDiskVersion);
  const onLocaleChange = (): void => {
    if (destroyed) return;
    if (lastDashboardStatus !== null) {
      const current = lastDashboardStatus;
      dashboard.setStatus(english() ? current.en : current.zh, current.state);
    }
    if (lastPersistenceStatus !== null) renderPersistenceStatus(lastPersistenceStatus);
  };
  localeHost?.addEventListener("workbench-locale-change", onLocaleChange);

  return Object.freeze({
    dashboard,
    get activeEntry(): WorkspaceEntrySummary | null {
      return persistence.activeEntry;
    },
    get hasUnsavedChanges(): boolean {
      return persistence.hasUnsavedChanges;
    },
    async initialize(): Promise<void> {
      if (destroyed) return;
      dashboard.setBusy(true);
      try {
        await refresh();
      } finally {
        if (!destroyed) dashboard.setBusy(false);
      }
    },
    refresh,
    createDocument,
    handleSourceChange(source: string): void {
      if (!destroyed) persistence.handleSourceChange(source);
    },
    flush: () => persistence.flush(),
    async prepareExternalImport(isCurrent: () => boolean): Promise<boolean> {
      if (destroyed || typeof isCurrent !== "function") return false;
      await persistence.flush();
      if (!isCurrent()) return false;
      persistence.deactivateAfterFlush();
      options.onActiveEntryChange?.(null);
      return true;
    },
    async deactivate(): Promise<void> {
      if (destroyed) return;
      await persistence.deactivate();
      options.onActiveEntryChange?.(null);
    },
    destroy(): void {
      if (destroyed) return;
      destroyed = true;
      generation += 1;
      options.recoveryButton.removeEventListener("click", onRecoverDiskVersion);
      localeHost?.removeEventListener("workbench-locale-change", onLocaleChange);
      options.onActiveEntryChange?.(null);
      persistence.destroy();
      dashboard.destroy();
    },
  });
}

export function workspacePersistenceMessage(
  status: WorkspacePersistenceStatus,
  locale: "zh-CN" | "en",
): string {
  if (locale !== "en") return status.message;
  switch (status.message) {
    case "正在同步到 Documents…":
      return "Syncing to Documents…";
    case "保存失败 · 工作区 IPC 不可用":
      return "Save failed · workspace IPC unavailable";
    case "已保存到 Documents":
      return "Saved to Documents";
    case "临时文档 · 未自动保存":
      return "Temporary document · autosave off";
    case "本地工作区未打开":
      return "Local workspace not open";
    case "有修改待保存":
      return "Changes pending";
    default: {
      if (!containsHan(status.message)) return status.message;
      const code = /^([A-Z][A-Z0-9_]+)/u.exec(status.message)?.[1];
      return code === undefined
        ? "Workspace status could not be displayed."
        : `${code} · ${safeWorkspaceErrorMessage(code, status.message)}`;
    }
  }
}

export function safeWorkspaceErrorMessage(code: string, message: string): string {
  if (!containsHan(message)) return message;
  const copy: Partial<Record<WorkspaceErrorCode, string>> = {
    WORKSPACE_CONFLICT: "The disk version changed. Reload the entry before saving again.",
    WORKSPACE_CONTEXT_CLOSED: "The workspace request was cancelled because the app is closing.",
    WORKSPACE_INVALID_REQUEST: "The workspace request is invalid.",
    WORKSPACE_INVALID_SIDECAR: "The workspace view data is invalid.",
    WORKSPACE_INVALID_SOURCE: "The C source is invalid.",
    WORKSPACE_INVALID_TITLE: "The entry title is invalid.",
    WORKSPACE_NOT_FOUND: "The workspace entry could not be found.",
    WORKSPACE_NOT_REGULAR_FILE: "The selected item is not a regular file.",
    WORKSPACE_READ_FAILED: "The workspace entry could not be read.",
    WORKSPACE_ROOT_UNAVAILABLE: "The Documents workspace is unavailable.",
    WORKSPACE_TOO_LARGE: "The C source exceeds the workspace size limit.",
    WORKSPACE_SIDECAR_TOO_LARGE: "The workspace view data exceeds its size limit.",
    WORKSPACE_WRITE_FAILED: "The workspace entry could not be saved.",
  };
  return copy[code as WorkspaceErrorCode] ?? "The workspace operation failed.";
}

function containsHan(value: string): boolean {
  return /[\u3400-\u9fff]/u.test(value);
}

function assertOptions(options: WorkspaceControllerOptions): void {
  if (
    typeof options.api?.listWorkspaceDocuments !== "function" ||
    typeof options.api.createWorkspaceDocument !== "function" ||
    typeof options.api.openWorkspaceDocument !== "function" ||
    typeof options.api.saveWorkspaceDocument !== "function" ||
    !(options.saveStatus instanceof HTMLOutputElement) ||
    !(options.recoveryButton instanceof HTMLButtonElement) ||
    typeof options.load !== "function" ||
    typeof options.enterWorkbench !== "function"
  ) {
    throw new TypeError("Workspace controller options 无效");
  }
}
