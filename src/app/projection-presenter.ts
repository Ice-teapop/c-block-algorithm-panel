import type { CAnalysisSnapshot } from "../core/index.js";
import type { BlockTree } from "../ui/block-tree.js";
import type { CodeSourceChangeReason } from "../ui/code-pane.js";
import type { EditPanel } from "../ui/edit-panel.js";
import type { ProjectionStatus } from "../ui/projection-status.js";
import type { StructureEditPanel } from "../ui/structure-edit-panel.js";
import type { WorkbenchElements } from "../ui/workbench-shell.js";
import { sourceMetadata } from "./source-display.js";
import type { SourceImportController } from "./source-import-controller.js";
import type { SourceHoldDetail, SourceProjectionMode } from "./source-sync-controller.js";

export interface ProjectionPresenterOptions {
  readonly elements: Pick<WorkbenchElements, "sourceMeta" | "parserStatus">;
  readonly blockTree: Pick<BlockTree, "setInteractionEnabled">;
  readonly editPanel: Pick<EditPanel, "setTarget" | "setStatus">;
  readonly structureEditPanel: Pick<StructureEditPanel, "setSelection">;
  readonly projectionStatus: ProjectionStatus;
  readonly sourceImport: Pick<SourceImportController, "setStatus">;
  readonly adopt: (source: string, analysis: CAnalysisSnapshot) => void;
  readonly getProjectionMode: () => SourceProjectionMode;
}

export interface ProjectionPresenter {
  pending(source: string, reason: CodeSourceChangeReason): void;
  adopted(
    source: string,
    analysis: CAnalysisSnapshot,
    mode: "synced" | "recovery",
    reason: CodeSourceChangeReason,
  ): void;
  held(source: string, detail: SourceHoldDetail): void;
  inputRejected(error: unknown): void;
  destroy(): void;
}

/** Presents source-sync state without owning parser or source session state. */
export function createProjectionPresenter(
  options: ProjectionPresenterOptions,
): ProjectionPresenter {
  let destroyed = false;
  const localeHost = resolveLocaleHost(options.elements.parserStatus);
  const english = (): boolean => localeHost?.dataset.locale === "en";
  type Presentation =
    | { readonly kind: "pending"; readonly reason: CodeSourceChangeReason }
    | {
        readonly kind: "adopted";
        readonly mode: "synced" | "recovery";
        readonly reason: CodeSourceChangeReason;
      }
    | { readonly kind: "held"; readonly detail: SourceHoldDetail }
    | { readonly kind: "rejected"; readonly error: unknown; readonly mode: SourceProjectionMode };
  let presentation: Presentation | null = null;
  const assertActive = (): void => {
    if (destroyed) throw new Error("投影状态 presenter 已销毁");
  };
  const disableStructuredEditing = (): void => {
    options.blockTree.setInteractionEnabled(false);
    options.editPanel.setTarget(null);
    options.structureEditPanel.setSelection(null);
  };

  const render = (): void => {
    const current = presentation;
    if (destroyed || current === null) return;
    if (current.kind === "pending") {
      options.editPanel.setStatus({
        kind: "working",
        message: english()
          ? "Code updated; rebuilding the block projection…"
          : "代码已更新，正在重建积木投影…",
      });
      options.projectionStatus.setState("pending");
      options.elements.parserStatus.textContent = english()
        ? "Reparsing the current C source…"
        : "正在重新解析当前 C 代码…";
      options.elements.parserStatus.dataset.state = "loading";
      const action = sourceAction(current.reason, english());
      options.sourceImport.setStatus(
        english()
          ? `${action} written to the source; synchronizing blocks.`
          : `${action}已写入代码，正在同步积木。`,
        "loading",
      );
      return;
    }
    if (current.kind === "adopted") {
      options.projectionStatus.setState(current.mode);
      const action = sourceAction(current.reason, english());
      if (current.mode === "recovery") {
        options.sourceImport.setStatus(
          english()
            ? `${action} complete; local syntax problems are shown as recovery blocks.`
            : `${action}完成；局部语法问题已用恢复积木显示。`,
          "error",
        );
      } else {
        options.editPanel.setStatus(english() ? `${action} complete.` : `${action}完成。`);
        options.sourceImport.setStatus(
          english()
            ? `${action} complete; source and blocks are synchronized.`
            : `${action}完成；代码与积木已同步。`,
          "ready",
        );
      }
      return;
    }
    if (current.kind === "held") {
      const message = heldMessage(current.detail, english());
      options.editPanel.setStatus({ kind: "parse-error", message });
      options.projectionStatus.setState("held", message);
      options.elements.parserStatus.textContent = english()
        ? "Block projection paused; waiting for the source to become stable"
        : "积木投影已暂停，等待代码恢复稳定";
      options.elements.parserStatus.dataset.state = "warning";
      options.sourceImport.setStatus(message, "error");
      return;
    }
    const message = english()
      ? `Input was not written: ${safeErrorMessage(current.error, true)}`
      : `输入未写入：${safeErrorMessage(current.error, false)}`;
    options.sourceImport.setStatus(message, "error");
    if (current.mode === "pending" || current.mode === "held") return;
    options.editPanel.setStatus(
      current.mode === "recovery" ? { kind: "parse-error", message } : new Error(message),
    );
    options.projectionStatus.setState(current.mode);
  };

  const onLocaleChange = (): void => render();
  localeHost?.addEventListener("workbench-locale-change", onLocaleChange);

  return Object.freeze({
    pending(source: string, reason: CodeSourceChangeReason): void {
      assertActive();
      disableStructuredEditing();
      options.elements.sourceMeta.textContent = sourceMetadata(source);
      presentation = Object.freeze({ kind: "pending", reason });
      render();
    },
    adopted(
      source: string,
      analysis: CAnalysisSnapshot,
      mode: "synced" | "recovery",
      reason: CodeSourceChangeReason,
    ): void {
      assertActive();
      options.blockTree.setInteractionEnabled(true);
      options.adopt(source, analysis);
      presentation = Object.freeze({ kind: "adopted", mode, reason });
      render();
    },
    held(source: string, detail: SourceHoldDetail): void {
      assertActive();
      disableStructuredEditing();
      options.elements.sourceMeta.textContent = sourceMetadata(source);
      presentation = Object.freeze({ kind: "held", detail });
      render();
    },
    inputRejected(error: unknown): void {
      assertActive();
      const mode = options.getProjectionMode();
      presentation = Object.freeze({ kind: "rejected", error, mode });
      render();
    },
    destroy(): void {
      localeHost?.removeEventListener("workbench-locale-change", onLocaleChange);
      destroyed = true;
    },
  });
}

function sourceAction(reason: CodeSourceChangeReason, english: boolean): string {
  if (english) return reason === "undo" ? "Undo" : reason === "redo" ? "Redo" : "Edit";
  return reason === "undo" ? "撤销" : reason === "redo" ? "重做" : "修改";
}

function heldMessage(detail: SourceHoldDetail, english: boolean): string {
  if (detail.kind === "recovery-impact") {
    const percentage = (detail.assessment.affectedRatio * 100).toFixed(0);
    return english
      ? `Syntax recovery affects ${percentage}% of the source; keeping the last stable block projection.`
      : `语法恢复影响 ${percentage}%，积木暂时保持上次稳定结果。`;
  }
  return english
    ? `The current source cannot form a stable projection: ${safeErrorMessage(detail.error, true)}`
    : `当前代码无法形成稳定投影：${safeErrorMessage(detail.error, false)}`;
}

function safeErrorMessage(error: unknown, english: boolean): string {
  const message = error instanceof Error ? error.message.trim() : "";
  if (english) {
    return message.length > 0 && !/[\u3400-\u9fff]/u.test(message)
      ? message
      : "the parser did not return a stable structure";
  }
  return message.length > 0 ? message : "未知错误";
}

function resolveLocaleHost(element: HTMLElement): HTMLElement | null {
  return typeof element.closest === "function"
    ? element.closest<HTMLElement>("[data-locale]")
    : null;
}
