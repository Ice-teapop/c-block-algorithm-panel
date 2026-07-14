import { textRange } from "../core/model.js";
import type { ClangDiagnostic } from "../shared/api.js";
import type { BlockTree } from "../ui/block-tree.js";
import type { CodePane } from "../ui/code-pane.js";
import {
  createRunPanel,
  type ManualRunScenario,
  type RunPanel,
  type RunPanelCompletion,
} from "../ui/run-panel.js";

export interface DiagnosticRunPanelOptions {
  readonly getSource: () => string;
  readonly getAnalyzedSource: () => string | null;
  readonly getDisplayName: () => string;
  readonly getManualScenario?: (() => ManualRunScenario | null) | undefined;
  readonly onRunComplete?: ((completion: RunPanelCompletion) => void) | undefined;
}

export interface DiagnosticRunPanel extends RunPanel {
  clearDiagnostics(): void;
}

export function createDiagnosticRunPanel(
  host: HTMLElement,
  codePane: CodePane,
  blockTree: BlockTree,
  options: DiagnosticRunPanelOptions,
): DiagnosticRunPanel {
  const runPanel = createRunPanel(host, {
    getSource: options.getSource,
    getDisplayName: options.getDisplayName,
    ...(options.getManualScenario === undefined
      ? {}
      : { getManualScenario: options.getManualScenario }),
    ...(options.onRunComplete === undefined ? {} : { onRunComplete: options.onRunComplete }),
    onDiagnostics: (source, diagnostics) => {
      if (source !== options.getSource() || source !== options.getAnalyzedSource()) {
        return;
      }
      presentDiagnostics(codePane, blockTree, diagnostics);
    },
  });
  const clearDiagnostics = (): void => {
    blockTree.setDiagnostics(Object.freeze([]));
    codePane.setDiagnosticHighlights(Object.freeze([]));
  };
  return Object.freeze({
    refreshCapabilities: () => runPanel.refreshCapabilities(),
    runCurrent: () => runPanel.runCurrent(),
    invalidateSource: () => {
      clearDiagnostics();
      runPanel.invalidateSource();
    },
    clearDiagnostics,
    destroy(): void {
      clearDiagnostics();
      runPanel.destroy();
    },
  });
}

function presentDiagnostics(
  codePane: CodePane,
  blockTree: BlockTree,
  diagnostics: readonly ClangDiagnostic[],
): void {
  const mapped = diagnostics.flatMap((diagnostic) => {
    if (diagnostic.range === null || diagnostic.severity === "note") return [];
    return [
      {
        range: textRange(diagnostic.range.from, diagnostic.range.to),
        severity: diagnostic.severity === "warning" ? ("warning" as const) : ("error" as const),
        message: diagnostic.message,
      },
    ];
  });
  blockTree.setDiagnostics(mapped);
  codePane.setDiagnosticHighlights(
    mapped
      .filter((marker) => marker.range.from < marker.range.to)
      .map((marker) => ({
        range: marker.range,
        kind:
          marker.severity === "warning"
            ? ("diagnostic-warning" as const)
            : ("diagnostic-error" as const),
        title: marker.message,
      })),
  );
}
