import type { CodePane } from "../ui/code-pane.js";
import { renderExplanationView } from "../ui/explanation-view.js";

/** Invalidates every source-bound presentation layer before debounced reparsing starts. */
export function clearStaleSourcePresentation(
  codePane: CodePane,
  explanationHost: HTMLElement,
): void {
  codePane.clearHighlights();
  renderExplanationView(explanationHost, null, null, null);
}
