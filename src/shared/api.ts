import type {
  CreateWorkspaceDocumentRequest,
  OpenWorkspaceDocumentRequest,
  SaveWorkspaceDocumentRequest,
  WorkspaceDocumentResult,
  WorkspaceListResult,
  WorkspaceSaveResult,
} from "./workspace.js";
import type {
  ReadWorkspaceSidecarRequest,
  SaveWorkspaceSidecarRequest,
  WorkspaceSidecarReadResult,
  WorkspaceSidecarSaveResult,
} from "./workspace-sidecar.js";
import type {
  LearningCatalogReadResult,
  LearningCatalogSaveResult,
  SaveLearningCatalogRequest,
} from "./learning-catalog-store.js";
import type { TraceBatch, TraceCancelResult, TraceRequest, TraceStartResult } from "./trace.js";

export type RunnerMode = "seatbelt-best-effort" | "trusted-only" | "disabled";

export type SeatbeltProbeStatus = "not-checked" | "probe-succeeded" | "unavailable";

export interface FixtureInput {
  readonly path: string;
  readonly contents: string | Uint8Array;
}

export interface CompileRequest {
  readonly source: string;
  readonly sourceName?: string;
}

export interface RunRequest {
  readonly artifactId: string;
  readonly args?: readonly string[];
  readonly stdin?: string;
  readonly fixtures?: readonly FixtureInput[];
}

export interface DiagnoseRuntimeInput {
  readonly args?: readonly string[];
  readonly stdin?: string;
  readonly fixtures?: readonly FixtureInput[];
}

export interface DiagnoseRequest extends CompileRequest {
  /** Omit for clang-only diagnostics; provide an object to run both memory gates. */
  readonly runtime?: DiagnoseRuntimeInput;
}

export type ClangDiagnosticSeverity = "fatal-error" | "error" | "warning" | "note";

export interface ClangDiagnostic {
  readonly id: string;
  readonly severity: ClangDiagnosticSeverity;
  readonly message: string;
  readonly option: string | null;
  readonly line: number;
  /** One-based UTF-8 byte column reported by clang. */
  readonly byteColumn: number;
  /** Source UTF-16 range, or null when the byte column cannot be mapped exactly. */
  readonly range: { readonly from: number; readonly to: number } | null;
}

export type RunnerErrorCode =
  | "INVALID_REQUEST"
  | "RUNNER_DISABLED"
  | "RUNNER_BUSY"
  | "RUNNER_SHUTTING_DOWN"
  | "SANDBOX_UNAVAILABLE"
  | "TRUST_CONFIRMATION_REQUIRED"
  | "ARTIFACT_NOT_FOUND"
  | "ARTIFACT_EXPIRED"
  | "ARTIFACT_CAPACITY_REACHED"
  | "COMPILE_FAILED"
  | "LEAK_CHECK_FAILED"
  | "TRACE_UNSUPPORTED"
  | "TRACE_SESSION_NOT_FOUND"
  | "TRACE_SOURCE_MISMATCH"
  | "TRACE_LIMIT"
  | "TRACE_PROTOCOL_ERROR"
  | "RESOURCE_LIMIT"
  | "PROCESS_SPAWN_FAILED"
  | "PROCESS_CONTROL_FAILED"
  | "INTERNAL_ERROR";

export interface RunnerError {
  readonly code: RunnerErrorCode;
  readonly message: string;
}

export type TerminationReason =
  | "not-started"
  | "process-exit"
  | "spawn-error"
  | "input-error"
  | "wall-time-limit"
  | "output-limit"
  | "rss-limit"
  | "process-count-limit"
  | "rss-monitor-error";

export interface SuccessfulCompileResult {
  readonly ok: true;
  readonly artifactId: string;
  readonly expiresAtMs: number;
  readonly diagnostics: string;
  /** clang 子进程的墙钟耗时；预检在进程启动前失败时可能缺省。 */
  readonly compileDurationMs?: number | undefined;
}

export interface FailedCompileResult {
  readonly ok: false;
  readonly diagnostics: string;
  readonly error: RunnerError;
  /** clang 子进程的墙钟耗时；预检在进程启动前失败时可能缺省。 */
  readonly compileDurationMs?: number | undefined;
}

export type CompileResult = SuccessfulCompileResult | FailedCompileResult;

export interface RunResult {
  readonly ok: boolean;
  readonly stdout: Uint8Array;
  readonly stderr: Uint8Array;
  readonly exitCode: number | null;
  readonly signal: string | null;
  readonly termination: TerminationReason;
  readonly durationMs: number;
  /** 资源看门狗采样到的进程组 RSS 峰值；0 表示没有取得有效样本。 */
  readonly peakRssBytes?: number | undefined;
  /** 资源看门狗采样到的进程组进程数峰值；0 表示没有取得有效样本。 */
  readonly peakProcessCount?: number | undefined;
  /** 本次返回中实际捕获的 stdout 与 stderr 字节总数。 */
  readonly outputBytes?: number | undefined;
  /** 仅在受信任的轨迹插桩启用时提供；普通运行明确为 null。 */
  readonly executedNodeCount?: number | null | undefined;
  /** 仅在受信任的操作计数插桩启用时提供；普通运行明确为 null。 */
  readonly operationCount?: number | null | undefined;
  readonly error?: RunnerError;
}

export interface MemoryStageResult {
  readonly verdict: "clean" | "finding" | "inconclusive";
  readonly stdout: Uint8Array;
  readonly stderr: Uint8Array;
  readonly exitCode: number | null;
  readonly signal: string | null;
  readonly termination: TerminationReason;
  readonly durationMs: number;
  readonly summary: string;
}

export type DiagnoseMemoryResult =
  | { readonly status: "skipped"; readonly reason: "static-errors" }
  | {
      readonly status: "completed";
      readonly clean: boolean;
      readonly sanitizer: MemoryStageResult;
      readonly leaks: MemoryStageResult & { readonly positiveControl: "passed" };
    };

export interface SuccessfulDiagnoseResult {
  /** Tool execution completed; this does not mean the source is warning- or error-free. */
  readonly ok: true;
  readonly sourceFingerprint: string;
  readonly compilerExitCode: 0 | 1;
  readonly hasErrors: boolean;
  readonly diagnostics: readonly ClangDiagnostic[];
  readonly rawDiagnostics: string;
  readonly memory: DiagnoseMemoryResult | null;
}

export interface FailedDiagnoseResult {
  readonly ok: false;
  readonly rawDiagnostics: string;
  readonly error: RunnerError;
}

export type DiagnoseResult = SuccessfulDiagnoseResult | FailedDiagnoseResult;

export interface Capabilities {
  readonly mode: RunnerMode;
  readonly runnerEnabled: boolean;
  /** Stable comparison key derived from verified toolchain metadata, never a local path. */
  readonly toolchainId: string;
  readonly seatbeltProbe: {
    readonly status: SeatbeltProbeStatus;
    readonly detail: string;
  };
  readonly requiresNativeTrustConfirmation: boolean;
}

export type SourceOrigin = "dialog" | "drop" | "paste" | "workspace";

export type SourceImportErrorCode =
  | "SOURCE_IMPORT_BUSY"
  | "SOURCE_CONTEXT_CLOSED"
  | "SOURCE_DIALOG_FAILED"
  | "SOURCE_INVALID_DROP"
  | "SOURCE_INVALID_REQUEST"
  | "SOURCE_NOT_C_FILE"
  | "SOURCE_NOT_REGULAR_FILE"
  | "SOURCE_TOO_LARGE"
  | "SOURCE_INVALID_UTF8"
  | "SOURCE_CONTAINS_NUL"
  | "SOURCE_READ_FAILED";

export interface SourceImportError {
  readonly code: SourceImportErrorCode;
  readonly message: string;
}

export interface ImportedSource {
  readonly source: string;
  readonly displayName: string;
  readonly origin: SourceOrigin;
}

export type SourceImportResult =
  | { readonly status: "opened"; readonly document: ImportedSource }
  | { readonly status: "cancelled" }
  | { readonly status: "failed"; readonly error: SourceImportError };

export interface PanelApi {
  openSource(): Promise<SourceImportResult>;
  openDroppedSource(file: File): Promise<SourceImportResult>;
  listWorkspaceDocuments(): Promise<WorkspaceListResult>;
  createWorkspaceDocument(
    request: CreateWorkspaceDocumentRequest,
  ): Promise<WorkspaceDocumentResult>;
  openWorkspaceDocument(request: OpenWorkspaceDocumentRequest): Promise<WorkspaceDocumentResult>;
  saveWorkspaceDocument(request: SaveWorkspaceDocumentRequest): Promise<WorkspaceSaveResult>;
  readWorkspaceSidecar(request: ReadWorkspaceSidecarRequest): Promise<WorkspaceSidecarReadResult>;
  saveWorkspaceSidecar(request: SaveWorkspaceSidecarRequest): Promise<WorkspaceSidecarSaveResult>;
  /** Reads the fixed global custom-block catalog; no filesystem path crosses this boundary. */
  readLearningCatalog(): Promise<LearningCatalogReadResult>;
  saveLearningCatalog(request: SaveLearningCatalogRequest): Promise<LearningCatalogSaveResult>;
  onWorkspaceCloseRequested(handler: () => Promise<void>): () => void;
  capabilities(): Promise<Capabilities>;
  compile(request: CompileRequest): Promise<CompileResult>;
  run(request: RunRequest): Promise<RunResult>;
  diagnose(request: DiagnoseRequest): Promise<DiagnoseResult>;
  startTrace(request: TraceRequest): Promise<TraceStartResult>;
  readTrace(sessionId: string, afterSequence: number): Promise<TraceBatch>;
  cancelTrace(sessionId: string): Promise<TraceCancelResult>;
}
