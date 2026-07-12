import type { WorkspaceError } from "./workspace.js";

export const WORKSPACE_SIDECAR_KINDS = Object.freeze([
  "flow-view",
  "scenarios",
  "run-history",
  "tutorial-progress",
] as const);

export type WorkspaceSidecarKind = (typeof WORKSPACE_SIDECAR_KINDS)[number];

export interface ReadWorkspaceSidecarRequest {
  readonly entryId: string;
  readonly kind: WorkspaceSidecarKind;
}

export interface SaveWorkspaceSidecarRequest extends ReadWorkspaceSidecarRequest {
  /** null creates the first revision; a number performs optimistic concurrency. */
  readonly expectedRevision: number | null;
  readonly sourceFingerprint: string;
  /** A validated JSON document. Keeping it serialized prevents prototype-bearing IPC objects. */
  readonly serialized: string;
}

export interface WorkspaceSidecarDocument {
  readonly kind: WorkspaceSidecarKind;
  readonly revision: number;
  readonly sourceFingerprint: string;
  readonly serialized: string;
  readonly updatedAt: string;
}

export type WorkspaceSidecarReadResult =
  | { readonly status: "ready"; readonly document: WorkspaceSidecarDocument }
  | { readonly status: "missing"; readonly kind: WorkspaceSidecarKind }
  | { readonly status: "failed"; readonly error: WorkspaceError };

export type WorkspaceSidecarSaveResult =
  | { readonly status: "saved"; readonly document: WorkspaceSidecarDocument }
  | { readonly status: "failed"; readonly error: WorkspaceError };

export function isWorkspaceSidecarKind(value: unknown): value is WorkspaceSidecarKind {
  return WORKSPACE_SIDECAR_KINDS.some((kind) => kind === value);
}
