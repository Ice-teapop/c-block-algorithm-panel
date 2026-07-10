import { history, invertedEffects, isolateHistory } from "@codemirror/commands";
import {
  EditorState,
  Facet,
  StateEffect,
  StateField,
  Transaction,
  type Extension,
  type TransactionSpec,
} from "@codemirror/state";

import { applyTextPatches, createTextPatch, type TextPatch } from "../core/editing/index.js";

export interface ExactSourceEditOptions {
  /** CodeMirror selection coordinates after the edit. */
  readonly selection?: TransactionSpec["selection"];
  /** Kept outside CodeMirror's typing merge classes by default. */
  readonly userEvent?: string;
  readonly scrollIntoView?: boolean;
}

const initialExactSource = Facet.define<string, string | undefined>({
  combine(values) {
    const first = values[0];
    for (const value of values) {
      if (value !== first) {
        throw new Error("同一个 CodeMirror state 不能配置不同的原始源码");
      }
    }
    return first;
  },
});

/**
 * Carries replacements in the exact raw source's UTF-16 coordinate space.
 *
 * The identity mapper is intentional. A patch batch is a state transition,
 * not a set of CodeMirror positions. Keeping it through history composition
 * lets the field replay multiple batches in their original order.
 */
export const rawSourcePatchesEffect = StateEffect.define<readonly TextPatch[]>({
  map: (patches) => patches,
});

/** The lossless source of truth paired with CodeMirror's logical document. */
export const exactSourceField = StateField.define<string>({
  create(state) {
    const configured = state.facet(initialExactSource);
    const source = configured ?? state.doc.toString();
    assertDocumentMatchesSource(state.doc.toString(), source);
    return source;
  },

  update(source, transaction) {
    const batches = rawPatchBatches(transaction);
    if (transaction.docChanged && batches.length === 0) {
      // Normal transactions are removed by the filter below. This catches a
      // caller that deliberately bypasses all CodeMirror filters.
      throw new Error("源码变化缺少 rawSourcePatchesEffect 授权");
    }

    let nextSource = source;
    for (const patches of batches) {
      nextSource = applyTextPatches(nextSource, patches).source;
    }
    assertDocumentMatchesSource(transaction.newDoc.toString(), nextSource);
    return nextSource;
  },
});

const exactSourceGuard = EditorState.transactionFilter.of((transaction) => {
  const batches = rawPatchBatches(transaction);
  if (!transaction.docChanged && batches.length === 0) {
    return transaction;
  }

  if (isConsistentExactSourceTransition(transaction, batches)) {
    return transaction;
  }

  // Reject the entire state transition atomically. In particular, do not
  // retain effects whose positions referred to the rejected new document.
  return {
    selection: transaction.startState.selection,
    annotations: Transaction.addToHistory.of(false),
  };
});

const invertRawSourcePatches = invertedEffects.of((transaction) => {
  const batches = rawPatchBatches(transaction);
  if (batches.length === 0) return [];

  let source = getExactSource(transaction.startState);
  const inverses: StateEffect<readonly TextPatch[]>[] = [];
  for (const patches of batches) {
    const applied = applyTextPatches(source, patches);
    source = applied.source;
    inverses.unshift(rawSourcePatchesEffect.of(copyPatches(applied.inversePatches)));
  }
  return inverses;
});

/**
 * Installs lossless raw-source storage, authorization and history inversion.
 * Add CodeMirror's `history()` (or `basicSetup`) alongside this extension.
 */
export function exactSourceExtension(source: string): Extension {
  assertSource(source);
  return [
    initialExactSource.of(source),
    exactSourceField,
    exactSourceGuard,
    invertRawSourcePatches,
  ];
}

/**
 * Creates an import boundary: a brand-new state with a brand-new history.
 * Replacing a view's state with this result intentionally clears undo/redo.
 */
export function createExactSourceState(source: string, extensions: Extension = []): EditorState {
  assertSource(source);
  return EditorState.create({
    doc: normalizeSourceForCodeMirror(source),
    extensions: [history(), exactSourceExtension(source), extensions],
  });
}

export function getExactSource(state: EditorState): string {
  const source = state.field(exactSourceField, false);
  if (source === undefined) {
    throw new Error("EditorState 未安装 exactSourceExtension");
  }
  return source;
}

/**
 * Converts raw-source patches into one authorized CodeMirror transaction.
 * Patch ranges always refer to the exact source before this transaction.
 */
export function createExactSourceEdit(
  state: EditorState,
  patches: readonly TextPatch[],
  options: ExactSourceEditOptions = {},
): TransactionSpec {
  const source = getExactSource(state);
  const applied = applyTextPatches(source, patches);
  const canonicalPatches = copyPatches(applied.plan.patches);
  const document = normalizeSourceForCodeMirror(source);
  if (document !== state.doc.toString()) {
    throw new Error("CodeMirror 文档与原始源码不同步");
  }

  const changes = createDocumentChanges(state, source, applied.source, canonicalPatches);
  const userEvent = options.userEvent ?? "input.exact-source";
  if (typeof userEvent !== "string" || userEvent.length === 0) {
    throw new TypeError("userEvent 必须是非空字符串");
  }

  return {
    ...(changes === undefined ? {} : { changes }),
    ...(canonicalPatches.length === 0
      ? {}
      : { effects: rawSourcePatchesEffect.of(canonicalPatches) }),
    ...(options.selection === undefined ? {} : { selection: options.selection }),
    userEvent,
    annotations: isolateHistory.of("full"),
    ...(options.scrollIntoView === undefined ? {} : { scrollIntoView: options.scrollIntoView }),
  };
}

/** CodeMirror's default Text representation normalizes LF, CRLF and CR. */
export function normalizeSourceForCodeMirror(source: string): string {
  assertSource(source);
  return source.replaceAll(/\r\n?|\n/gu, "\n");
}

function createDocumentChanges(
  state: EditorState,
  before: string,
  after: string,
  patches: readonly TextPatch[],
): TransactionSpec["changes"] | undefined {
  const nextDocument = normalizeSourceForCodeMirror(after);
  if (nextDocument === state.doc.toString()) return undefined;

  const boundaries = rawToEditorBoundaries(before);
  const localChanges: { from: number; to: number; insert: string }[] = [];
  let canUseLocalChanges = true;
  for (const patch of patches) {
    const from = boundaries[patch.range.from];
    const to = boundaries[patch.range.to];
    if (from === undefined || to === undefined || from < 0 || to < 0) {
      canUseLocalChanges = false;
      break;
    }
    localChanges.push({
      from,
      to,
      insert: normalizeSourceForCodeMirror(patch.newText),
    });
  }

  if (canUseLocalChanges) {
    try {
      const changeSet = state.changes(localChanges);
      if (changeSet.apply(state.doc).toString() === nextDocument) {
        return changeSet;
      }
    } catch {
      // A raw boundary edit may collapse or create a CRLF pair. The exact
      // transition is still representable as a single full-document change.
    }
  }

  return { from: 0, to: state.doc.length, insert: nextDocument };
}

/** -1 marks the unrepresentable boundary in the middle of CRLF. */
function rawToEditorBoundaries(source: string): readonly number[] {
  const boundaries = new Array<number>(source.length + 1);
  let rawOffset = 0;
  let editorOffset = 0;
  boundaries[0] = 0;

  while (rawOffset < source.length) {
    if (source.charCodeAt(rawOffset) === 0x0d && source.charCodeAt(rawOffset + 1) === 0x0a) {
      boundaries[rawOffset] = editorOffset;
      boundaries[rawOffset + 1] = -1;
      rawOffset += 2;
    } else {
      boundaries[rawOffset] = editorOffset;
      rawOffset += 1;
    }
    editorOffset += 1;
    boundaries[rawOffset] = editorOffset;
  }

  return boundaries;
}

function isConsistentExactSourceTransition(
  transaction: Transaction,
  batches: readonly (readonly TextPatch[])[],
): boolean {
  if (batches.length === 0) return !transaction.docChanged;

  let source = getExactSource(transaction.startState);
  try {
    for (const patches of batches) {
      source = applyTextPatches(source, patches).source;
    }
  } catch {
    return false;
  }
  return normalizeSourceForCodeMirror(source) === transaction.newDoc.toString();
}

function rawPatchBatches(transaction: Transaction): readonly (readonly TextPatch[])[] {
  return transaction.effects
    .filter((effect) => effect.is(rawSourcePatchesEffect))
    .map((effect) => effect.value);
}

function copyPatches(patches: readonly TextPatch[]): readonly TextPatch[] {
  return Object.freeze(patches.map((patch) => createTextPatch(patch.range, patch.newText)));
}

function assertDocumentMatchesSource(document: string, source: string): void {
  if (normalizeSourceForCodeMirror(source) !== document) {
    throw new Error("CodeMirror 文档与原始源码补丁不一致");
  }
}

function assertSource(source: string): void {
  if (typeof source !== "string") {
    throw new TypeError("source 必须是字符串");
  }
}
