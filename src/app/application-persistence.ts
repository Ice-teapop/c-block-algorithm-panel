import type { LoadedLearningCatalogStorage } from "./learning-catalog-disk-storage.js";
import { installWorkspaceLifecycle, type WorkspaceLifecycle } from "./workspace-lifecycle.js";

interface FlushableState {
  readonly hasPendingChanges: boolean;
  flush(): Promise<void>;
}

interface WorkspaceState {
  readonly hasUnsavedChanges: boolean;
  flush(): Promise<void>;
}

export interface ApplicationPersistenceOptions {
  readonly workspace: WorkspaceState;
  readonly flow: FlushableState;
  readonly runtime: FlushableState;
  readonly guidedLesson?: FlushableState | undefined;
  readonly getCatalog: () => LoadedLearningCatalogStorage | null;
  readonly onCloseRequested: (handler: () => Promise<void>) => () => void;
  readonly destroy: () => void;
}

export function installApplicationPersistence(
  options: ApplicationPersistenceOptions,
): WorkspaceLifecycle {
  return installWorkspaceLifecycle({
    workspace: {
      get hasUnsavedChanges(): boolean {
        return (
          options.workspace.hasUnsavedChanges ||
          options.flow.hasPendingChanges ||
          options.runtime.hasPendingChanges ||
          options.guidedLesson?.hasPendingChanges === true ||
          options.getCatalog()?.hasPendingChanges === true
        );
      },
      async flush(): Promise<void> {
        await Promise.all([
          options.workspace.flush(),
          options.flow.flush(),
          options.runtime.flush(),
          options.guidedLesson?.flush(),
          options.getCatalog()?.flush(),
        ]);
      },
    },
    onCloseRequested: options.onCloseRequested,
    destroy: options.destroy,
  });
}
