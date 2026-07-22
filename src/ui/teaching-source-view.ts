export interface TeachingSourceViewOptions {
  readonly source: string;
  readonly startLine: number;
  readonly collapseBoilerplate?: boolean;
}

export interface TeachingSourceBoilerplateCopy {
  readonly show: string;
  readonly hide: string;
  readonly summary: (hiddenLineCount: number) => string;
}

export interface TeachingSourceHighlight {
  readonly activeLine: number | null;
  readonly previousLine: number | null;
  readonly status: string;
}

export interface TeachingSourceView {
  readonly root: HTMLElement;
  readonly code: HTMLElement;
  setLabel(label: string): void;
  setBoilerplateCopy(copy: TeachingSourceBoilerplateCopy): void;
  highlight(value: TeachingSourceHighlight): void;
}

const C_KEYWORDS = new Set(["break", "continue", "else", "for", "if", "return", "while"]);
const C_TYPES = new Set(["char", "double", "float", "int", "long", "short", "size_t", "void"]);
const TOKEN_PATTERN =
  /(\/\/.*$|\/\*.*?\*\/|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|\b(?:[A-Za-z_]\w*)\b|\b(?:\d+(?:\.\d+)?)\b|(?:&&|\|\||==|!=|<=|>=|\+\+|--|->)|[^\s])/gu;
let sourceViewSequence = 0;

/**
 * Stable, read-only C source projection for task lessons. Lines and syntax spans mount once;
 * timeline updates only change semantic state attributes.
 */
export function createTeachingSourceView(
  ownerDocument: Document,
  options: TeachingSourceViewOptions,
): TeachingSourceView {
  assertOptions(options);
  const root = ownerDocument.createElement("section");
  root.className = "teaching-source-view";
  root.dataset.activeSourceLine = "";

  const header = ownerDocument.createElement("header");
  const label = ownerDocument.createElement("strong");
  const status = ownerDocument.createElement("span");
  const headerActions = ownerDocument.createElement("div");
  headerActions.className = "teaching-source-view__header-actions";
  const boilerplateSummary = ownerDocument.createElement("span");
  boilerplateSummary.className = "teaching-source-view__boilerplate-summary";
  const boilerplateToggle = ownerDocument.createElement("button");
  boilerplateToggle.type = "button";
  boilerplateToggle.className = "teaching-source-view__toggle";
  boilerplateToggle.dataset.teachingSourceAction = "toggle-boilerplate";
  headerActions.append(status, boilerplateSummary, boilerplateToggle);
  header.append(label, headerActions);

  const viewport = ownerDocument.createElement("pre");
  const viewSequence = (sourceViewSequence += 1);
  viewport.id = `teaching-source-code-${String(viewSequence)}`;
  viewport.tabIndex = 0;
  viewport.setAttribute("role", "region");
  const statusId = `teaching-source-status-${String(viewSequence)}`;
  status.id = statusId;
  viewport.setAttribute("aria-describedby", statusId);
  const code = ownerDocument.createElement("code");
  code.setAttribute("aria-live", "off");
  const lineElements = new Map<number, HTMLElement>();
  const sourceLines = options.source.split("\n");
  const boilerplateLineNumbers = teachingBoilerplateLineNumbers(sourceLines, options.startLine);

  for (const [index, sourceLine] of sourceLines.entries()) {
    const lineNumber = options.startLine + index;
    const line = ownerDocument.createElement("span");
    line.className = "teaching-source-view__line";
    line.dataset.sourceLine = String(lineNumber);
    line.dataset.state = "idle";

    const gutter = ownerDocument.createElement("span");
    gutter.className = "teaching-source-view__gutter";
    gutter.textContent = String(lineNumber);
    gutter.setAttribute("aria-hidden", "true");

    const content = ownerDocument.createElement("span");
    content.className = "teaching-source-view__content";
    appendHighlightedC(ownerDocument, content, sourceLine);
    line.append(gutter, content);
    code.append(line);
    lineElements.set(lineNumber, line);
  }
  viewport.append(code);
  root.append(header, viewport);

  let activeLine: number | null = null;
  let previousLine: number | null = null;
  let boilerplateCollapsed =
    options.collapseBoilerplate === true && boilerplateLineNumbers.size > 0;
  let boilerplateCopy: TeachingSourceBoilerplateCopy = {
    show: "Show full source",
    hide: "Show task code only",
    summary: (count) => `${String(count)} setup lines hidden`,
  };
  boilerplateToggle.hidden = boilerplateLineNumbers.size === 0;
  boilerplateToggle.setAttribute("aria-controls", viewport.id);
  boilerplateSummary.hidden = boilerplateLineNumbers.size === 0;
  boilerplateToggle.addEventListener("click", () => {
    boilerplateCollapsed = !boilerplateCollapsed;
    renderBoilerplateState();
  });
  renderBoilerplateState();

  return Object.freeze({
    root,
    code,
    setLabel(value: string): void {
      label.textContent = value;
      viewport.setAttribute("aria-label", value);
    },
    setBoilerplateCopy(value: TeachingSourceBoilerplateCopy): void {
      boilerplateCopy = value;
      renderBoilerplateState();
    },
    highlight(value: TeachingSourceHighlight): void {
      const changed = activeLine !== value.activeLine;
      activeLine = value.activeLine;
      previousLine = value.previousLine;
      root.dataset.activeSourceLine = value.activeLine === null ? "" : String(value.activeLine);
      status.textContent = value.status;
      for (const [lineNumber, line] of lineElements) {
        const state =
          lineNumber === value.activeLine
            ? "active"
            : lineNumber === value.previousLine
              ? "previous"
              : "idle";
        line.dataset.state = state;
        line.setAttribute("aria-current", state === "active" ? "step" : "false");
      }
      if (changed && value.activeLine !== null) {
        lineElements.get(value.activeLine)?.scrollIntoView?.({ block: "nearest" });
      }
      renderBoilerplateState();
    },
  });

  function renderBoilerplateState(): void {
    root.dataset.boilerplateCollapsed = String(boilerplateCollapsed);
    boilerplateToggle.textContent = boilerplateCollapsed
      ? boilerplateCopy.show
      : boilerplateCopy.hide;
    boilerplateToggle.setAttribute("aria-expanded", String(!boilerplateCollapsed));
    boilerplateSummary.textContent = boilerplateCollapsed
      ? boilerplateCopy.summary(boilerplateLineNumbers.size)
      : "";
    boilerplateSummary.hidden = !boilerplateCollapsed || boilerplateLineNumbers.size === 0;
    for (const [lineNumber, line] of lineElements) {
      const keepForCurrentCue = lineNumber === activeLine || lineNumber === previousLine;
      line.hidden =
        boilerplateCollapsed && boilerplateLineNumbers.has(lineNumber) && !keepForCurrentCue;
    }
  }
}

/**
 * Returns only generator-owned teaching boilerplate. It intentionally does not hide arbitrary
 * comments, preprocessor directives, or TODOs that may be part of the lesson itself.
 */
export function teachingBoilerplateLineNumbers(
  sourceLines: readonly string[],
  startLine = 1,
): ReadonlySet<number> {
  const hidden = new Set<number>();
  let leadingHeaderBlock = true;
  let sawInclude = false;
  for (const [index, sourceLine] of sourceLines.entries()) {
    const lineNumber = startLine + index;
    const include = /^\s*#include\s+[<"][^>"]+[>"]\s*$/u.test(sourceLine);
    if (leadingHeaderBlock && include) {
      hidden.add(lineNumber);
      sawInclude = true;
      continue;
    }
    if (leadingHeaderBlock && sawInclude && sourceLine.trim().length === 0) {
      hidden.add(lineNumber);
      continue;
    }
    leadingHeaderBlock = false;
    if (/^\s*\/\*\s*FOA_STEP\b.*\*\/\s*$/u.test(sourceLine)) hidden.add(lineNumber);
  }
  return hidden;
}

function appendHighlightedC(ownerDocument: Document, host: HTMLElement, sourceLine: string): void {
  let offset = 0;
  for (const match of sourceLine.matchAll(TOKEN_PATTERN)) {
    const token = match[0];
    const index = match.index;
    if (index > offset) appendToken(ownerDocument, host, sourceLine.slice(offset, index), "plain");
    appendToken(ownerDocument, host, token, syntaxKind(token));
    offset = index + token.length;
  }
  if (offset < sourceLine.length)
    appendToken(ownerDocument, host, sourceLine.slice(offset), "plain");
}

function appendToken(
  ownerDocument: Document,
  host: HTMLElement,
  value: string,
  kind: string,
): void {
  const span = ownerDocument.createElement("span");
  span.dataset.syntax = kind;
  span.textContent = value;
  host.append(span);
}

function syntaxKind(token: string): string {
  if (token.startsWith("//") || token.startsWith("/*")) return "comment";
  if (token.startsWith('"') || token.startsWith("'")) return "string";
  if (/^\d/u.test(token)) return "number";
  if (C_KEYWORDS.has(token)) return "keyword";
  if (C_TYPES.has(token)) return "type";
  if (/^[A-Za-z_]/u.test(token)) return "identifier";
  return "operator";
}

function assertOptions(options: TeachingSourceViewOptions): void {
  if (options.source.length === 0) throw new RangeError("教学源码不能为空");
  if (!Number.isSafeInteger(options.startLine) || options.startLine < 1) {
    throw new RangeError("教学源码起始行必须是正整数");
  }
}
