import type { Block, SourceDoc, SymbolRecord } from "../core/model.js";
import { explainBlock } from "./explanation.js";

const EMPTY_EXPLANATION = "这里是源码空白或注释区。选择一条语句积木查看作用。";

/**
 * Replaces the explanation host with a deterministic, text-only view.
 *
 * The caller owns selection and session state. This view reads only the
 * supplied snapshot values and writes user-controlled text through
 * `textContent`, never through HTML parsing.
 */
export function renderExplanationView(
  host: HTMLElement,
  sourceDocument: SourceDoc | null,
  block: Block | null,
  focusedSymbol: SymbolRecord | null,
): void {
  const ownerDocument = host.ownerDocument;
  host.replaceChildren();

  if (sourceDocument === null || block === null) {
    const empty = ownerDocument.createElement("p");
    empty.className = "empty-state";
    empty.textContent = EMPTY_EXPLANATION;
    host.append(empty);
    return;
  }

  const explanation = explainBlock(sourceDocument, block);
  const title = ownerDocument.createElement("h3");
  title.className = "explanation__title";
  title.textContent =
    focusedSymbol === null ? explanation.title : `${explanation.title} · ${focusedSymbol.name}`;
  const summary = ownerDocument.createElement("p");
  summary.className = "explanation__summary";
  summary.textContent = explanation.summary;
  host.append(title, summary);

  if (explanation.details.length > 0) {
    const details = ownerDocument.createElement("ul");
    details.className = "explanation__details";
    for (const detail of explanation.details) {
      const item = ownerDocument.createElement("li");
      item.textContent = detail;
      details.append(item);
    }
    host.append(details);
  }

  const symbols = [...explanation.symbols].sort((left, right) => {
    const leftFocused = focusedSymbol?.name === left.name && focusedSymbol.kind === left.kind;
    const rightFocused = focusedSymbol?.name === right.name && focusedSymbol.kind === right.kind;
    return Number(rightFocused) - Number(leftFocused);
  });
  if (symbols.length > 0) {
    const list = ownerDocument.createElement("ul");
    list.className = "explanation__symbols";
    for (const symbol of symbols) {
      const item = ownerDocument.createElement("li");
      item.className = "symbol-card";
      if (focusedSymbol?.name === symbol.name && focusedSymbol.kind === symbol.kind) {
        item.dataset.focused = "true";
      }
      const name = ownerDocument.createElement("code");
      name.textContent =
        symbol.valueText === undefined ? symbol.name : `${symbol.name} = ${symbol.valueText}`;
      const meta = ownerDocument.createElement("span");
      meta.className = "symbol-card__meta";
      meta.textContent = [
        symbolKindLabel(symbol.kind),
        symbol.header,
        `${symbol.usageCount} 处使用`,
      ]
        .filter((value): value is string => value !== undefined)
        .join(" · ");
      item.append(name, meta);
      if (symbol.signatureText !== undefined) {
        appendText(ownerDocument, item, symbol.signatureText);
      }
      if (symbol.description !== undefined) {
        appendText(ownerDocument, item, symbol.description);
      }
      list.append(item);
    }
    host.append(list);
  }

  if (explanation.concerns.length > 0) {
    const concerns = ownerDocument.createElement("ul");
    concerns.className = "explanation__concerns";
    for (const message of explanation.concerns) {
      const item = ownerDocument.createElement("li");
      item.className = "concern-card";
      item.textContent = `低置信度：${message}`;
      concerns.append(item);
    }
    host.append(concerns);
  }
}

function symbolKindLabel(kind: SymbolRecord["kind"]): string {
  const labels: Readonly<Record<SymbolRecord["kind"], string>> = {
    parameter: "参数",
    "local-variable": "局部变量",
    "file-variable": "文件变量",
    "enum-constant": "枚举常量",
    function: "函数",
    typedef: "typedef",
    "object-macro": "对象宏",
    "builtin-function": "标准库函数",
    "builtin-typedef": "标准 typedef",
    "builtin-object-macro": "标准对象宏",
    "unknown-external": "未知外部符号",
  };
  return labels[kind];
}

function appendText(ownerDocument: Document, parent: HTMLElement, text: string): void {
  const element = ownerDocument.createElement("span");
  element.textContent = text;
  parent.append(element);
}
