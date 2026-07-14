import type { CAnalysisSnapshot, CParser, TextPatch } from "../core/index.js";
import type { FlowProjection } from "../flow/index.js";
import type { PanelApi } from "../shared/api.js";
import type { CodePane } from "../ui/code-pane.js";
import type { WorkbenchElements } from "../ui/workbench-shell.js";
import { createAiSourceEditController } from "./ai-source-edit-controller.js";
import {
  aiDiffSummaryMessage,
  createAiWorkspaceIntegration,
  type AiWorkspaceIntegration,
} from "./ai-workspace-integration.js";
import type { ReadySession } from "./program-analysis-session.js";
import type { RuntimeWorkspaceController } from "./runtime-workspace-controller.js";

export interface MainAiWorkspaceOptions {
  readonly elements: Pick<WorkbenchElements, "shell" | "aiAssistantButton" | "executeMenuAction">;
  readonly api: PanelApi;
  readonly codePane: Pick<CodePane, "getSource" | "applyPatches">;
  readonly getRuntime: () => RuntimeWorkspaceController | null;
  readonly getSession: () => ReadySession | null;
  readonly getProjection: () => FlowProjection | null;
  readonly getParser: () => CParser | null;
  readonly getProjectionMode: () => string;
  readonly resetProjection: () => void;
  readonly nextRevision: () => number;
  readonly adopt: (imported: ReadySession["imported"], analysis: CAnalysisSnapshot) => void;
  readonly onStatus: (message: string) => void;
}

export function createMainAiWorkspace(options: MainAiWorkspaceOptions): AiWorkspaceIntegration {
  let integration: AiWorkspaceIntegration | null = null;
  const sourceEdit = createAiSourceEditController({
    getPermission: () => integration?.permission ?? "read-only",
    getWorkspaceId: () => integration?.workspaceId ?? null,
    getSession: options.getSession,
    getProjection: options.getProjection,
    getParser: options.getParser,
    getProjectionMode: options.getProjectionMode,
    getEditorSource: options.codePane.getSource,
    applyPatches: (patches: readonly TextPatch[]) => options.codePane.applyPatches(patches),
    resetProjection: options.resetProjection,
    nextRevision: options.nextRevision,
    adopt: options.adopt,
    confirm: (plan) => integration?.confirmEdit(plan) ?? false,
    onApplied: (result) =>
      options.onStatus(
        formatAiAppliedStatus(
          result.diffSummary,
          options.elements.shell.dataset.locale === "en" ? "en" : "zh-CN",
        ),
      ),
  });
  integration = createAiWorkspaceIntegration({
    host: options.elements.shell,
    trigger: options.elements.aiAssistantButton,
    api: options.api,
    getRemoteContext: () => options.getRuntime()?.getRemoteMentorContext() ?? null,
    sourceEdit,
    openSettings: () => options.elements.executeMenuAction("settings", "settings.ai-privacy"),
  });
  return integration;
}

export function formatAiAppliedStatus(diffSummary: string, locale: "zh-CN" | "en"): string {
  return locale === "en"
    ? `AI change verified and committed · ${aiDiffSummaryMessage(diffSummary, locale)}`
    : `AI 修改已验证并提交 · ${diffSummary}`;
}
