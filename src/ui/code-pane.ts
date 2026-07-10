import { basicSetup } from "codemirror";
import { cpp } from "@codemirror/lang-cpp";
import {
  Annotation,
  EditorSelection,
  EditorState,
  StateEffect,
  StateField,
  type Transaction,
} from "@codemirror/state";
import { Decoration, EditorView, type DecorationSet } from "@codemirror/view";

import type { TextRange } from "../core/model.js";
import {
  createSourceOffsetMap,
  editorToSource,
  sourceToEditor,
  type SourceOffsetMap,
} from "../renderer/source-offset-map.js";

export type CodeHighlightKind = "primary" | "symbol-declaration" | "symbol-use";

export interface CodeHighlight {
  readonly range: TextRange;
  readonly kind: CodeHighlightKind;
  readonly title?: string;
}

export interface CodePaneOptions {
  readonly onSourceOffset: (sourceOffset: number) => void;
}

export interface CodePane {
  setSource(source: string): void;
  setHighlights(highlights: readonly CodeHighlight[]): void;
  reveal(sourceRange: TextRange): void;
  destroy(): void;
}

interface EditorRange {
  readonly from: number;
  readonly to: number;
}

const programmaticSelection = Annotation.define<boolean>();
const replaceHighlights = StateEffect.define<DecorationSet>();

const highlightField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(highlights, transaction) {
    let next = highlights.map(transaction.changes);
    for (const effect of transaction.effects) {
      if (effect.is(replaceHighlights)) {
        next = effect.value;
      }
    }
    return next;
  },
  provide: (field) => EditorView.decorations.from(field),
});

/** Creates a read-only CodeMirror projection. The original source remains the fact source. */
export function createCodePane(host: HTMLElement, options: CodePaneOptions): CodePane {
  let exactSource = "";
  let offsetMap = createSourceOffsetMap(exactSource);
  let destroyed = false;

  const mount = document.createElement("div");
  mount.className = "code-pane__editor";
  host.append(mount);

  const state = EditorState.create({
    doc: "",
    extensions: [
      basicSetup,
      // C parsing here is presentation-only; it never replaces the application's source model.
      cpp(),
      EditorState.readOnly.of(true),
      EditorView.cspNonce.of(__CODEMIRROR_STYLE_NONCE__),
      EditorView.contentAttributes.of({
        "aria-label": "C 源码（只读）",
        "aria-readonly": "true",
        "aria-multiline": "true",
        spellcheck: "false",
        autocapitalize: "off",
        autocomplete: "off",
      }),
      highlightField,
      EditorView.updateListener.of((update) => {
        if (!update.selectionSet || isProgrammatic(update.transactions)) {
          return;
        }
        options.onSourceOffset(editorToSource(offsetMap, update.state.selection.main.head));
      }),
    ],
  });
  const view = new EditorView({ state, parent: mount });

  return {
    setSource(source) {
      assertActive(destroyed);
      if (typeof source !== "string") {
        throw new TypeError("source 必须是字符串");
      }

      const nextMap = createSourceOffsetMap(source);
      const editorSource = source.replaceAll("\r\n", "\n");
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: editorSource },
        selection: { anchor: 0 },
        effects: replaceHighlights.of(Decoration.none),
        annotations: programmaticSelection.of(true),
      });
      exactSource = source;
      offsetMap = nextMap;
    },

    setHighlights(highlights) {
      assertActive(destroyed);
      const decorations = highlights.map((highlight) => {
        assertHighlightKind(highlight.kind);
        if (highlight.title !== undefined && typeof highlight.title !== "string") {
          throw new TypeError("highlight.title 必须是字符串");
        }

        const range = toEditorRange(offsetMap, highlight.range, false);
        const attributes: Record<string, string> = {
          "data-code-highlight": "true",
          "data-code-highlight-kind": highlight.kind,
          ...(highlight.title === undefined ? {} : { title: highlight.title }),
        };
        return Decoration.mark({
          class: `code-pane-highlight code-pane-highlight--${highlight.kind}`,
          attributes,
        }).range(range.from, range.to);
      });

      view.dispatch({
        effects: replaceHighlights.of(Decoration.set(decorations, true)),
        annotations: programmaticSelection.of(true),
      });
    },

    reveal(sourceRange) {
      assertActive(destroyed);
      const range = toEditorRange(offsetMap, sourceRange, true);
      const selection = EditorSelection.range(range.from, range.to);
      view.dispatch({
        selection,
        effects: EditorView.scrollIntoView(selection, { y: "center", x: "nearest" }),
        annotations: programmaticSelection.of(true),
      });
    },

    destroy() {
      if (destroyed) {
        return;
      }
      destroyed = true;
      view.destroy();
      mount.remove();
    },
  };
}

function isProgrammatic(transactions: readonly Transaction[]): boolean {
  return transactions.some((transaction) => transaction.annotation(programmaticSelection) === true);
}

function toEditorRange(map: SourceOffsetMap, range: TextRange, allowEmpty: boolean): EditorRange {
  const from = toExactEditorBoundary(map, range.from);
  const to = toExactEditorBoundary(map, range.to);
  if (from > to || (!allowEmpty && from === to)) {
    throw new RangeError("source range 必须按顺序且不能是空范围");
  }
  return { from, to };
}

function toExactEditorBoundary(map: SourceOffsetMap, sourceOffset: number): number {
  const editorOffset = sourceToEditor(map, sourceOffset);
  if (editorToSource(map, editorOffset) !== sourceOffset) {
    throw new RangeError(`source offset ${String(sourceOffset)} 位于 CRLF 中间`);
  }
  return editorOffset;
}

function assertHighlightKind(kind: CodeHighlightKind): void {
  if (kind !== "primary" && kind !== "symbol-declaration" && kind !== "symbol-use") {
    throw new TypeError(`未知的 highlight kind: ${String(kind)}`);
  }
}

function assertActive(destroyed: boolean): void {
  if (destroyed) {
    throw new Error("CodePane 已销毁");
  }
}
