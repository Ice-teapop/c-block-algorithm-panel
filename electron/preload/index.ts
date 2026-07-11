import { contextBridge, ipcRenderer, webUtils } from "electron";
import type {
  Capabilities,
  CompileRequest,
  CompileResult,
  DiagnoseRequest,
  DiagnoseResult,
  PanelApi,
  RunRequest,
  RunResult,
  SourceImportResult,
} from "../../src/shared/api.js";
import type {
  TraceBatch,
  TraceCancelResult,
  TraceRequest,
  TraceStartResult,
} from "../../src/shared/trace.js";
import type {
  CreateWorkspaceDocumentRequest,
  OpenWorkspaceDocumentRequest,
  SaveWorkspaceDocumentRequest,
  WorkspaceDocumentResult,
  WorkspaceListResult,
  WorkspaceSaveResult,
} from "../../src/shared/workspace.js";
import type {
  ReadWorkspaceSidecarRequest,
  SaveWorkspaceSidecarRequest,
  WorkspaceSidecarReadResult,
  WorkspaceSidecarSaveResult,
} from "../../src/shared/workspace-sidecar.js";
import type {
  LearningCatalogReadResult,
  LearningCatalogSaveResult,
  SaveLearningCatalogRequest,
} from "../../src/shared/learning-catalog-store.js";

const IPC_CHANNELS = Object.freeze({
  openSource: "panel:open-source",
  openDroppedSource: "panel:open-dropped-source",
  listWorkspaceDocuments: "workspace:list",
  createWorkspaceDocument: "workspace:create",
  openWorkspaceDocument: "workspace:open",
  saveWorkspaceDocument: "workspace:save-source",
  readWorkspaceSidecar: "workspace:read-sidecar",
  saveWorkspaceSidecar: "workspace:save-sidecar",
  workspaceCloseRequest: "workspace:close-request",
  workspaceCloseResponse: "workspace:close-response",
  capabilities: "panel:capabilities",
  compile: "panel:compile",
  run: "panel:run",
  diagnose: "panel:diagnose",
  startTrace: "panel:trace-start",
  readTrace: "panel:trace-read",
  cancelTrace: "panel:trace-cancel",
  readLearningCatalog: "learning-catalog:read",
  saveLearningCatalog: "learning-catalog:save",
});

let workspaceCloseHandler: (() => Promise<void>) | null = null;

ipcRenderer.on(IPC_CHANNELS.workspaceCloseRequest, (_event, requestId: unknown) => {
  if (typeof requestId !== "string") return;
  const handler = workspaceCloseHandler;
  if (handler === null) {
    ipcRenderer.send(IPC_CHANNELS.workspaceCloseResponse, { requestId, status: "ready" });
    return;
  }
  void Promise.resolve()
    .then(handler)
    .then(
      () => ipcRenderer.send(IPC_CHANNELS.workspaceCloseResponse, { requestId, status: "ready" }),
      () => ipcRenderer.send(IPC_CHANNELS.workspaceCloseResponse, { requestId, status: "failed" }),
    );
});

function copyCapabilitiesSnapshot(value: Capabilities): Capabilities {
  return {
    mode: value.mode,
    runnerEnabled: value.runnerEnabled,
    toolchainId: value.toolchainId,
    seatbeltProbe: { ...value.seatbeltProbe },
    requiresNativeTrustConfirmation: value.requiresNativeTrustConfirmation,
  };
}

const panelApi: PanelApi = Object.freeze({
  openSource: async (): Promise<SourceImportResult> =>
    (await ipcRenderer.invoke(IPC_CHANNELS.openSource)) as SourceImportResult,
  openDroppedSource: async (file: File): Promise<SourceImportResult> => {
    let path = "";
    try {
      path = webUtils.getPathForFile(file);
    } catch {
      // Synthetic File objects have no local disk path and are rejected below.
    }
    if (path.length === 0) {
      return {
        status: "failed",
        error: {
          code: "SOURCE_INVALID_DROP",
          message: "拖入的项目不是可读取的本地 C 文件。",
        },
      };
    }
    return (await ipcRenderer.invoke(IPC_CHANNELS.openDroppedSource, {
      path,
    })) as SourceImportResult;
  },
  listWorkspaceDocuments: async (): Promise<WorkspaceListResult> =>
    (await ipcRenderer.invoke(IPC_CHANNELS.listWorkspaceDocuments)) as WorkspaceListResult,
  createWorkspaceDocument: async (
    request: CreateWorkspaceDocumentRequest,
  ): Promise<WorkspaceDocumentResult> =>
    (await ipcRenderer.invoke(
      IPC_CHANNELS.createWorkspaceDocument,
      request,
    )) as WorkspaceDocumentResult,
  openWorkspaceDocument: async (
    request: OpenWorkspaceDocumentRequest,
  ): Promise<WorkspaceDocumentResult> =>
    (await ipcRenderer.invoke(
      IPC_CHANNELS.openWorkspaceDocument,
      request,
    )) as WorkspaceDocumentResult,
  saveWorkspaceDocument: async (
    request: SaveWorkspaceDocumentRequest,
  ): Promise<WorkspaceSaveResult> =>
    (await ipcRenderer.invoke(IPC_CHANNELS.saveWorkspaceDocument, request)) as WorkspaceSaveResult,
  readWorkspaceSidecar: async (
    request: ReadWorkspaceSidecarRequest,
  ): Promise<WorkspaceSidecarReadResult> =>
    (await ipcRenderer.invoke(
      IPC_CHANNELS.readWorkspaceSidecar,
      request,
    )) as WorkspaceSidecarReadResult,
  saveWorkspaceSidecar: async (
    request: SaveWorkspaceSidecarRequest,
  ): Promise<WorkspaceSidecarSaveResult> =>
    (await ipcRenderer.invoke(
      IPC_CHANNELS.saveWorkspaceSidecar,
      request,
    )) as WorkspaceSidecarSaveResult,
  readLearningCatalog: async (): Promise<LearningCatalogReadResult> =>
    (await ipcRenderer.invoke(IPC_CHANNELS.readLearningCatalog)) as LearningCatalogReadResult,
  saveLearningCatalog: async (
    request: SaveLearningCatalogRequest,
  ): Promise<LearningCatalogSaveResult> =>
    (await ipcRenderer.invoke(
      IPC_CHANNELS.saveLearningCatalog,
      request,
    )) as LearningCatalogSaveResult,
  onWorkspaceCloseRequested: (handler: () => Promise<void>): (() => void) => {
    if (typeof handler !== "function") throw new TypeError("关闭前保存处理器必须是函数");
    workspaceCloseHandler = handler;
    return () => {
      if (workspaceCloseHandler === handler) workspaceCloseHandler = null;
    };
  },
  capabilities: async (): Promise<Capabilities> =>
    copyCapabilitiesSnapshot((await ipcRenderer.invoke(IPC_CHANNELS.capabilities)) as Capabilities),
  compile: async (request: CompileRequest): Promise<CompileResult> =>
    (await ipcRenderer.invoke(IPC_CHANNELS.compile, request)) as CompileResult,
  run: async (request: RunRequest): Promise<RunResult> =>
    (await ipcRenderer.invoke(IPC_CHANNELS.run, request)) as RunResult,
  diagnose: async (request: DiagnoseRequest): Promise<DiagnoseResult> =>
    (await ipcRenderer.invoke(IPC_CHANNELS.diagnose, request)) as DiagnoseResult,
  startTrace: async (request: TraceRequest): Promise<TraceStartResult> =>
    (await ipcRenderer.invoke(IPC_CHANNELS.startTrace, request)) as TraceStartResult,
  readTrace: async (sessionId: string, afterSequence: number): Promise<TraceBatch> =>
    (await ipcRenderer.invoke(IPC_CHANNELS.readTrace, sessionId, afterSequence)) as TraceBatch,
  cancelTrace: async (sessionId: string): Promise<TraceCancelResult> =>
    (await ipcRenderer.invoke(IPC_CHANNELS.cancelTrace, sessionId)) as TraceCancelResult,
});

contextBridge.exposeInMainWorld("panelApi", panelApi);
