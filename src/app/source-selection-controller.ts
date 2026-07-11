import * as core from "../core/index.js";
import type { CodeHighlight, CodePaneHistoryDepth } from "../ui/code-pane.js";
import { renderExplanationView } from "../ui/explanation-view.js";
import type { StructureEditSelection } from "../ui/structure-edit-panel.js";
import * as editTargetSelection from "./edit-target-selection.js";
import type { ReadySession } from "./program-analysis-session.js";
import {
  canSelectAnalyzedSource,
  structureEditSelectionAtOffset,
} from "./structure-edit-selection.js";
import { symbolTooltip } from "./symbol-tooltip.js";
import type { SourceProjectionMode } from "./source-sync-controller.js";

export interface SourceSelectionControllerOptions {
  readonly explanationHost: HTMLElement;
  readonly getSession: () => ReadySession | null;
  readonly getProjectionMode: () => SourceProjectionMode;
  readonly getEditorSource: () => string;
  readonly getHistoryDepth: () => CodePaneHistoryDepth;
  readonly getCurrentPage: () => string;
  readonly showInspector: (view: "explanation" | "edit") => void;
  readonly selectTreeEntry: (entry: core.BlockIndexEntry | null) => void;
  readonly setEditTarget: (target: core.EditTarget | null) => void;
  readonly setStructureSelection: (selection: StructureEditSelection | null) => void;
  readonly setInsertEnabled: (enabled: boolean) => void;
  readonly setHistoryDepth: (depth: CodePaneHistoryDepth) => void;
  readonly setParseError: (message: string) => void;
  readonly setHighlights: (highlights: readonly CodeHighlight[]) => void;
  readonly reveal: (range: core.TextRange) => void;
}

export interface SourceBlockSelection {
  readonly entry: core.BlockIndexEntry | null;
  readonly reveal: boolean;
  readonly symbol: core.SymbolRecord | null;
  readonly editTarget: core.EditTarget | null;
  readonly inspector: "explanation" | "edit";
  readonly structureSelection: StructureEditSelection | null;
}

export interface SourceSelectionController {
  selectFromOffset(sourceOffset: number): void;
  selectBlock(selection: SourceBlockSelection): void;
}

export function createSourceSelectionController(
  options: SourceSelectionControllerOptions,
): SourceSelectionController {
  const selectBlock = (selection: SourceBlockSelection): void => {
    const session = options.getSession();
    if (session === null) return;
    const sourceDocument = session.analysis.document;
    if (selection.reveal || options.getCurrentPage() !== "build") {
      options.showInspector(selection.inspector);
    }
    options.selectTreeEntry(selection.entry);
    options.setEditTarget(selection.editTarget);
    options.setStructureSelection(
      options.getProjectionMode() === "synced" && !sourceDocument.parse.hasError
        ? selection.structureSelection
        : null,
    );
    options.setInsertEnabled(
      selection.structureSelection?.statement?.parentMode === "statement-list" &&
        selection.structureSelection.statement.blocker === null,
    );
    options.setHistoryDepth(options.getHistoryDepth());
    if (sourceDocument.parse.hasError) {
      options.setParseError("当前源码含解析恢复节点；先修复源码，再进行结构化编辑。");
    }

    const highlights: CodeHighlight[] = [];
    if (selection.entry?.block !== null && selection.entry?.block !== undefined) {
      highlights.push({ range: selection.entry.block.range, kind: "primary" });
    }
    if (selection.symbol !== null) {
      for (const occurrence of sourceDocument.symbols.occurrences) {
        if (occurrence.symbolId !== selection.symbol.id) continue;
        highlights.push({
          range: occurrence.range,
          kind: occurrence.role === "declaration" ? "symbol-declaration" : "symbol-use",
          title: symbolTooltip(selection.symbol, occurrence.role),
        });
      }
    }
    options.setHighlights(highlights);
    if (
      selection.reveal &&
      selection.entry?.block !== null &&
      selection.entry?.block !== undefined
    ) {
      options.reveal(selection.entry.block.range);
    }
    renderExplanationView(
      options.explanationHost,
      sourceDocument,
      selection.entry?.block ?? null,
      selection.symbol,
      session.programAnalysis,
    );
  };

  return Object.freeze({
    selectFromOffset(sourceOffset: number): void {
      const session = options.getSession();
      if (
        session === null ||
        !canSelectAnalyzedSource(
          options.getProjectionMode(),
          options.getEditorSource(),
          session.imported.source,
        )
      ) {
        return;
      }
      const symbol = core.symbolAt(session.analysis.document.symbols, sourceOffset);
      const entry = core.offsetToBlock(session.blockIndex, sourceOffset);
      const editTarget = editTargetSelection.editTargetAtOffset(
        session.analysis.editTargets,
        sourceOffset,
      );
      const structureSelection = structureEditSelectionAtOffset(session.analysis, sourceOffset);
      selectBlock({
        entry,
        reveal: false,
        symbol,
        editTarget,
        inspector: editTarget === null && structureSelection === null ? "explanation" : "edit",
        structureSelection,
      });
    },
    selectBlock,
  });
}
