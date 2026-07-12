import * as core from "../core/index.js";
import type { PanelApi } from "../shared/api.js";
import { fingerprintSource } from "../shared/source-snapshot.js";
import type { ImportedSource } from "../shared/api.js";
import type { CodePane } from "../ui/code-pane.js";
import type { WorkbenchElements } from "../ui/workbench-shell.js";
import type { FlowWorkbenchController } from "./flow-workbench-controller.js";
import {
  createGuidedLessonWorkspaceController,
  type GuidedLessonWorkspaceController,
  type GuidedSourceChangeReason,
} from "./guided-lesson-workspace-controller.js";
import type { RuntimeWorkspaceController } from "./runtime-workspace-controller.js";
import { createWorkspaceController, type WorkspaceController } from "./workspace-controller.js";

export interface WorkspaceLessonIntegrationOptions {
  readonly elements: WorkbenchElements;
  readonly api: PanelApi;
  readonly codePane: CodePane;
  readonly flow: FlowWorkbenchController;
  readonly runtime: RuntimeWorkspaceController;
  readonly loadSource: (source: ImportedSource) => void;
  readonly onError: (message: string) => void;
}

export interface WorkspaceLessonIntegration {
  readonly workspace: WorkspaceController;
  readonly guidedLesson: GuidedLessonWorkspaceController;
  handleSourceChanged(source: string): void;
}

export function createWorkspaceLessonIntegration(
  options: WorkspaceLessonIntegrationOptions,
): WorkspaceLessonIntegration {
  let guidedLesson: GuidedLessonWorkspaceController | null = null;
  let pendingSourceReason: GuidedSourceChangeReason | null = null;
  const workspace = createWorkspaceController({
    host: options.elements.getPageHost("dashboard"),
    api: options.api,
    saveStatus: options.elements.workspaceSaveStatus,
    recoveryButton: options.elements.workspaceRecoveryButton,
    load: options.loadSource,
    enterWorkbench: () => options.elements.showPage("build"),
    onActiveEntryChange: (entry) => {
      const entryId = entry?.id ?? null;
      const fingerprint = entryId === null ? null : fingerprintSource(options.codePane.getSource());
      void Promise.all([
        options.flow.setWorkspaceEntry(entryId),
        options.runtime.setWorkspaceEntry(entryId, fingerprint),
      ])
        .then(() => guidedLesson?.setWorkspaceEntry(entry ?? null))
        .catch((error: unknown) => {
          options.onError(error instanceof Error ? error.message : "工作区 sidecar 载入失败");
        });
    },
  });
  guidedLesson = createGuidedLessonWorkspaceController({
    elements: options.elements,
    api: options.api,
    workspace,
    getSource: () => options.codePane.getSource(),
    getProjection: () => options.flow.projection,
    applySource(source, reason) {
      const current = options.codePane.getSource();
      pendingSourceReason = reason;
      const changed = options.codePane.applyPatches([
        core.createTextPatch(core.textRange(0, current.length), source),
      ]);
      if (!changed) pendingSourceReason = null;
      return changed;
    },
    configureScenario(scenarioId, size) {
      options.runtime.scenario.selectScenario(scenarioId);
      options.runtime.scenario.setInputSize(size);
    },
    onError: (error) => options.onError(error.message),
  });
  const lesson = guidedLesson;
  return Object.freeze({
    workspace,
    guidedLesson: lesson,
    handleSourceChanged(source: string): void {
      lesson.handleSourceChanged(fingerprintSource(source), pendingSourceReason ?? "editor");
      pendingSourceReason = null;
    },
  });
}
