import type { ImportedSource, PanelApi } from "../shared/api.js";
import type {
  WorkspaceDocument,
  WorkspaceEntrySummary,
  WorkspaceKind,
} from "../shared/workspace.js";
import { createWorkspaceDashboard, type WorkspaceDashboard } from "../ui/workspace-dashboard.js";

export interface WorkspaceControllerOptions {
  readonly host: HTMLElement;
  readonly api: Pick<
    PanelApi,
    "listWorkspaceDocuments" | "createWorkspaceDocument" | "openWorkspaceDocument"
  >;
  readonly load: (document: ImportedSource) => void;
  readonly enterWorkbench: () => void;
}

export interface WorkspaceController {
  readonly dashboard: WorkspaceDashboard;
  readonly activeEntry: WorkspaceEntrySummary | null;
  initialize(): Promise<void>;
  refresh(): Promise<void>;
  deactivate(): void;
  destroy(): void;
}

export function createWorkspaceController(
  options: WorkspaceControllerOptions,
): WorkspaceController {
  assertOptions(options);
  let activeEntry: WorkspaceEntrySummary | null = null;
  let destroyed = false;
  let generation = 0;

  const setFailure = (code: string, message: string): void => {
    dashboard.setStatus(`${code}：${message}`, "error");
  };

  const adopt = (document: WorkspaceDocument): void => {
    activeEntry = Object.freeze({ ...document.entry });
    options.load({
      source: document.source,
      displayName: `${document.entry.title}.c`,
      origin: "workspace",
    });
    options.enterWorkbench();
    dashboard.setStatus(`已打开“${document.entry.title}”。`, "success");
  };

  const refresh = async (): Promise<void> => {
    if (destroyed) return;
    const requestGeneration = ++generation;
    dashboard.setStatus("正在读取 Documents 工作区…", "loading");
    try {
      const result = await options.api.listWorkspaceDocuments();
      if (destroyed || requestGeneration !== generation) return;
      if (result.status === "failed") {
        setFailure(result.error.code, result.error.message);
        return;
      }
      dashboard.setSnapshot(result.snapshot);
      dashboard.setStatus(
        result.snapshot.entries.length === 0
          ? "工作区为空；新建条目后会立即写入 Documents。"
          : `已载入 ${String(result.snapshot.entries.length)} 个本地条目。`,
        "ready",
      );
    } catch {
      if (!destroyed && requestGeneration === generation) {
        dashboard.setStatus("工作区 IPC 调用失败。", "error");
      }
    }
  };

  const dashboard = createWorkspaceDashboard(options.host, {
    async onCreate(kind: WorkspaceKind, title: string): Promise<boolean> {
      const requestGeneration = ++generation;
      dashboard.setStatus("正在创建本地条目…", "loading");
      try {
        const result = await options.api.createWorkspaceDocument({ kind, title });
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
          dashboard.setStatus("创建条目的 IPC 调用失败。", "error");
        }
        return false;
      }
    },
    async onOpen(entryId: string): Promise<void> {
      const requestGeneration = ++generation;
      dashboard.setStatus("正在打开本地条目…", "loading");
      try {
        const result = await options.api.openWorkspaceDocument({ entryId });
        if (destroyed || requestGeneration !== generation) return;
        if (result.status === "failed") {
          setFailure(result.error.code, result.error.message);
          return;
        }
        adopt(result.document);
      } catch {
        if (!destroyed && requestGeneration === generation) {
          dashboard.setStatus("打开条目的 IPC 调用失败。", "error");
        }
      }
    },
    onRefresh: refresh,
  });

  return Object.freeze({
    dashboard,
    get activeEntry(): WorkspaceEntrySummary | null {
      return activeEntry;
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
    deactivate(): void {
      if (destroyed) return;
      activeEntry = null;
    },
    destroy(): void {
      if (destroyed) return;
      destroyed = true;
      generation += 1;
      activeEntry = null;
      dashboard.destroy();
    },
  });
}

function assertOptions(options: WorkspaceControllerOptions): void {
  if (
    typeof options.api?.listWorkspaceDocuments !== "function" ||
    typeof options.api.createWorkspaceDocument !== "function" ||
    typeof options.api.openWorkspaceDocument !== "function" ||
    typeof options.load !== "function" ||
    typeof options.enterWorkbench !== "function"
  ) {
    throw new TypeError("Workspace controller options 无效");
  }
}
