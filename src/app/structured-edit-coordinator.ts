import * as core from "../core/index.js";
import type { EditPanelRequest } from "../ui/edit-panel.js";
import * as editTargetSelection from "./edit-target-selection.js";
import type { ReadySession } from "./program-analysis-session.js";

export interface StructuredEditCoordinatorOptions {
  readonly getSession: () => ReadySession | null;
  readonly getParser: () => core.CParser | null;
  readonly assertStructureReady: () => void;
  readonly validateSource: (source: string) => void;
  readonly getProjectionMode: () => string;
  readonly getEditorSource: () => string;
  readonly applyPatches: (patches: readonly core.TextPatch[]) => boolean;
  readonly resetProjection: () => void;
  readonly adopt: (
    imported: ReadySession["imported"],
    analysis: core.CAnalysisSnapshot,
    preferredTarget: core.EditTarget | null,
  ) => void;
  readonly onCommitted: () => void;
}

export interface StructuredEditCoordinator {
  plan(request: EditPanelRequest): core.StructuredEditPlan;
  commit(plan: core.StructuredEditPlan): void;
}

export function createStructuredEditCoordinator(
  options: StructuredEditCoordinatorOptions,
): StructuredEditCoordinator {
  return Object.freeze({
    plan(request: EditPanelRequest): core.StructuredEditPlan {
      const current = options.getSession();
      const parser = options.getParser();
      if (current === null || parser === null) throw new Error("C 解析器或源码会话尚未就绪");
      options.assertStructureReady();
      const target = editTargetSelection
        .allEditTargets(current.analysis.editTargets)
        .find((candidate) => candidate.id === request.targetId);
      if (target === undefined) throw new Error("编辑目标已经过期，请重新选择代码");
      return core.planStructuredEdit(
        {
          source: current.imported.source,
          analysis: current.analysis,
          analyzer: parser,
          validateSource: options.validateSource,
        },
        editTargetSelection.toStructuredEditRequest(request, target),
      );
    },

    commit(plan: core.StructuredEditPlan): void {
      const current = options.getSession();
      if (
        current === null ||
        options.getProjectionMode() !== "synced" ||
        current.analysis.editTargets.revision !== plan.baseRevision ||
        options.getEditorSource() !== current.imported.source
      ) {
        throw new Error("预览已经过期；源码未修改，请重新选择并预览");
      }
      if (
        plan.candidateAnalysis.editTargets.revision !== plan.candidateRevision ||
        plan.candidateSource !== plan.candidateAnalysis.document.source ||
        core.renderSourceDoc(plan.candidateAnalysis.document) !== plan.candidateSource
      ) {
        throw new Error("候选分析快照无效；源码未修改");
      }
      core.createBlockIndex(plan.candidateAnalysis.document);
      const preferredTarget = editTargetSelection.candidateTargetForPlan(
        current.analysis.editTargets,
        plan,
      );
      const changed = options.applyPatches(plan.patches);
      if (!changed || options.getEditorSource() !== plan.candidateSource) {
        throw new Error("CodeMirror 未能精确应用结构化补丁");
      }
      options.resetProjection();
      options.adopt(
        Object.freeze({ ...current.imported, source: plan.candidateSource }),
        plan.candidateAnalysis,
        preferredTarget,
      );
      options.onCommitted();
    },
  });
}
