import type { QuickOpenItem, QuickOpenItemKind } from "../commands/index.js";

export interface QuickOpenOptions {
  readonly getItems: (query: string) => readonly QuickOpenItem[];
  readonly onActivate: (item: QuickOpenItem) => void;
}

export interface QuickOpenController {
  readonly element: HTMLDialogElement;
  open(query?: string): void;
  close(): void;
  destroy(): void;
}

export interface ParsedQuickOpenQuery {
  readonly raw: string;
  readonly query: string;
  readonly scope: QuickOpenItemKind | null;
  readonly settingsOnly: boolean;
}

export interface RankedQuickOpenItem {
  readonly item: QuickOpenItem;
  readonly score: number;
}

export interface QuickOpenShortcutState {
  readonly key: string;
  readonly metaKey: boolean;
  readonly ctrlKey: boolean;
  readonly altKey: boolean;
  readonly shiftKey: boolean;
}

const PREFIX_SCOPE: Readonly<Record<string, QuickOpenItemKind>> = Object.freeze({
  ">": "command",
  "@": "node",
  "+": "preset",
  "#": "library",
  "/": "command",
});

const KIND_ORDER: Readonly<Record<QuickOpenItemKind, number>> = Object.freeze({
  command: 0,
  node: 1,
  preset: 2,
  library: 3,
});

const RESULT_LIMIT = 40;

export function parseQuickOpenQuery(raw: string): ParsedQuickOpenQuery {
  const trimmedStart = raw.trimStart();
  const prefix = trimmedStart[0] ?? "";
  const scope = PREFIX_SCOPE[prefix] ?? null;
  return Object.freeze({
    raw,
    query: (scope === null ? trimmedStart : trimmedStart.slice(1)).trim(),
    scope,
    settingsOnly: prefix === "/",
  });
}

export function rankQuickOpenItems(
  items: readonly QuickOpenItem[],
  rawQuery: string,
  limit = RESULT_LIMIT,
): readonly RankedQuickOpenItem[] {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 500) {
    throw new RangeError("Quick Open limit 必须在 1–500 之间");
  }
  const parsed = parseQuickOpenQuery(rawQuery);
  const tokens = tokenize(parsed.query);
  const seen = new Set<string>();
  const ranked = items.flatMap((item) => {
    if (!isQuickOpenItem(item) || seen.has(item.id)) return [];
    seen.add(item.id);
    if (parsed.scope !== null && item.kind !== parsed.scope) return [];
    if (parsed.settingsOnly && !item.targetId.startsWith("settings.")) return [];
    if (parsed.scope === null && tokens.length === 0 && item.kind !== "command") return [];
    const score = scoreItem(item, tokens);
    return score === null ? [] : [Object.freeze({ item, score })];
  });
  return Object.freeze(
    ranked
      .sort(
        (left, right) =>
          right.score - left.score ||
          KIND_ORDER[left.item.kind] - KIND_ORDER[right.item.kind] ||
          left.item.order - right.item.order ||
          left.item.label.localeCompare(right.item.label, "zh-Hans-CN") ||
          left.item.id.localeCompare(right.item.id, "en"),
      )
      .slice(0, limit),
  );
}

export function isQuickOpenShortcut(event: QuickOpenShortcutState, isMac: boolean): boolean {
  if (event.altKey) return false;
  const modifier = isMac ? event.metaKey && !event.ctrlKey : event.ctrlKey && !event.metaKey;
  if (!modifier) return false;
  const key = event.key.toLocaleLowerCase("en-US");
  return (key === "k" && !event.shiftKey) || (key === "p" && event.shiftKey);
}

export function createQuickOpen(host: HTMLElement, options: QuickOpenOptions): QuickOpenController {
  assertOptions(options);
  const ownerDocument = host.ownerDocument;
  const isMac = /Mac|iPhone|iPad|iPod/u.test(ownerDocument.defaultView?.navigator.platform ?? "");
  const dialog = ownerDocument.createElement("dialog");
  dialog.className = "quick-open";
  dialog.setAttribute("aria-labelledby", "quick-open-title");

  const surface = ownerDocument.createElement("section");
  surface.className = "quick-open__surface";
  const header = ownerDocument.createElement("header");
  header.className = "quick-open__header";
  const title = ownerDocument.createElement("h2");
  title.id = "quick-open-title";
  title.textContent = "Quick Open";
  const scope = ownerDocument.createElement("span");
  scope.className = "quick-open__scope";
  const input = ownerDocument.createElement("input");
  input.type = "search";
  input.className = "quick-open__input";
  input.placeholder = "搜索命令、节点、积木或 Library";
  input.setAttribute("aria-label", "搜索工作台");
  input.setAttribute("aria-controls", "quick-open-results");
  input.setAttribute("aria-autocomplete", "list");
  input.setAttribute("role", "combobox");
  input.setAttribute("aria-expanded", "true");
  header.append(title, scope, input);

  const results = ownerDocument.createElement("div");
  results.id = "quick-open-results";
  results.className = "quick-open__results";
  results.setAttribute("role", "listbox");
  const empty = ownerDocument.createElement("p");
  empty.className = "quick-open__empty";
  empty.textContent = "没有匹配项";
  const footer = ownerDocument.createElement("footer");
  footer.className = "quick-open__footer";
  footer.textContent = "↑↓ 选择　Enter 打开　Esc 关闭　> 命令　@ 节点　+ 积木　# Library　/ 设置";
  surface.append(header, results, empty, footer);
  dialog.append(surface);
  host.append(dialog);

  let destroyed = false;
  let activeIndex = 0;
  let rendered: readonly RankedQuickOpenItem[] = Object.freeze([]);
  let previousFocus: HTMLElement | null = null;

  const render = (): void => {
    assertActive(destroyed);
    rendered = rankQuickOpenItems(options.getItems(input.value), input.value);
    activeIndex = clampIndex(activeIndex, rendered.length);
    const parsed = parseQuickOpenQuery(input.value);
    const english = host.dataset.locale === "en";
    scope.textContent = scopeLabel(parsed, english);
    results.replaceChildren(
      ...rendered.map(({ item }, index) =>
        renderResult(ownerDocument, item, index, activeIndex, english),
      ),
    );
    empty.hidden = rendered.length > 0;
    input.setAttribute("aria-activedescendant", rendered[activeIndex]?.item.id ?? "");
  };

  const activate = (index: number): void => {
    const selected = rendered[index]?.item;
    if (selected === undefined) return;
    previousFocus = null;
    close();
    options.onActivate(selected);
  };

  const move = (delta: number): void => {
    if (rendered.length === 0) return;
    activeIndex = (activeIndex + delta + rendered.length) % rendered.length;
    updateActiveResult(results, rendered, activeIndex);
    results
      .querySelector<HTMLElement>(`[data-quick-open-index='${String(activeIndex)}']`)
      ?.scrollIntoView({ block: "nearest" });
  };

  const open = (query = ""): void => {
    assertActive(destroyed);
    previousFocus =
      ownerDocument.activeElement instanceof HTMLElement ? ownerDocument.activeElement : null;
    input.value = query;
    activeIndex = 0;
    render();
    if (!dialog.open) dialog.showModal();
    input.focus({ preventScroll: true });
    input.select();
  };

  const close = (): void => {
    if (destroyed || !dialog.open) return;
    dialog.close("dismissed");
  };

  const onInput = (): void => {
    activeIndex = 0;
    render();
  };
  const onInputKeydown = (event: KeyboardEvent): void => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      move(event.key === "ArrowDown" ? 1 : -1);
    } else if (event.key === "Enter") {
      event.preventDefault();
      activate(activeIndex);
    } else if (event.key === "Escape") {
      event.preventDefault();
      close();
    }
  };
  const onResultsClick = (event: Event): void => {
    const target = (event.target as Element | null)?.closest<HTMLElement>(
      "[data-quick-open-index]",
    );
    const index = Number(target?.dataset.quickOpenIndex);
    if (Number.isSafeInteger(index)) activate(index);
  };
  const onCancel = (event: Event): void => {
    event.preventDefault();
    close();
  };
  const onClose = (): void => {
    previousFocus?.focus({ preventScroll: true });
    previousFocus = null;
  };
  const onDocumentKeydown = (event: KeyboardEvent): void => {
    if (destroyed || !isQuickOpenShortcut(event, isMac)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (dialog.open) input.focus({ preventScroll: true });
    else open();
  };
  const onLocaleChange = (): void => {
    const english = host.dataset.locale === "en";
    input.placeholder = english
      ? "Search commands, nodes, blocks or Library"
      : "搜索命令、节点、积木或 Library";
    input.setAttribute("aria-label", english ? "Search workbench" : "搜索工作台");
    empty.textContent = english ? "No matching items" : "没有匹配项";
    footer.textContent = english
      ? "↑↓ select　Enter open　Esc close　> commands　@ nodes　+ blocks　# Library　/ settings"
      : "↑↓ 选择　Enter 打开　Esc 关闭　> 命令　@ 节点　+ 积木　# Library　/ 设置";
    if (dialog.open) render();
  };

  input.addEventListener("input", onInput);
  input.addEventListener("keydown", onInputKeydown);
  results.addEventListener("click", onResultsClick);
  dialog.addEventListener("cancel", onCancel);
  dialog.addEventListener("close", onClose);
  ownerDocument.addEventListener("keydown", onDocumentKeydown, true);
  host.addEventListener("workbench-locale-change", onLocaleChange);
  onLocaleChange();

  return Object.freeze({
    element: dialog,
    open,
    close,
    destroy(): void {
      if (destroyed) return;
      close();
      destroyed = true;
      input.removeEventListener("input", onInput);
      input.removeEventListener("keydown", onInputKeydown);
      results.removeEventListener("click", onResultsClick);
      dialog.removeEventListener("cancel", onCancel);
      dialog.removeEventListener("close", onClose);
      ownerDocument.removeEventListener("keydown", onDocumentKeydown, true);
      host.removeEventListener("workbench-locale-change", onLocaleChange);
      dialog.remove();
      rendered = Object.freeze([]);
      previousFocus = null;
    },
  });
}

function scoreItem(item: QuickOpenItem, tokens: readonly string[]): number | null {
  if (tokens.length === 0) return 1_000 - Math.min(item.order, 999);
  const fields = {
    label: normalize(item.label),
    keywords: normalize(item.keywords.join(" ")),
    detail: normalize(item.detail),
    id: normalize(`${item.id} ${item.targetId}`),
  };
  let score = 0;
  for (const token of tokens) {
    let tokenScore = 0;
    if (fields.label === token) tokenScore = 120;
    else if (fields.label.startsWith(token)) tokenScore = 85;
    else if (fields.label.includes(token)) tokenScore = 60;
    if (fields.keywords.includes(token)) tokenScore = Math.max(tokenScore, 42);
    if (fields.detail.includes(token)) tokenScore = Math.max(tokenScore, 24);
    if (fields.id.includes(token)) tokenScore = Math.max(tokenScore, 18);
    if (tokenScore === 0) return null;
    score += tokenScore;
  }
  return score;
}

function renderResult(
  ownerDocument: Document,
  item: QuickOpenItem,
  index: number,
  activeIndex: number,
  english: boolean,
): HTMLElement {
  const row = ownerDocument.createElement("button");
  row.type = "button";
  row.id = item.id;
  row.className = "quick-open__result";
  row.dataset.quickOpenIndex = String(index);
  row.dataset.quickOpenKind = item.kind;
  row.setAttribute("role", "option");
  row.setAttribute("aria-selected", String(index === activeIndex));
  row.tabIndex = -1;
  const label = ownerDocument.createElement("strong");
  label.textContent = item.label;
  const detail = ownerDocument.createElement("span");
  detail.textContent = item.detail;
  const meta = ownerDocument.createElement("span");
  meta.className = "quick-open__result-meta";
  meta.textContent = item.shortcut ?? kindLabel(item.kind, english);
  row.append(label, detail, meta);
  return row;
}

function updateActiveResult(
  results: HTMLElement,
  rendered: readonly RankedQuickOpenItem[],
  activeIndex: number,
): void {
  for (const element of results.querySelectorAll<HTMLElement>("[data-quick-open-index]")) {
    const index = Number(element.dataset.quickOpenIndex);
    element.setAttribute("aria-selected", String(index === activeIndex));
  }
  const input = results.ownerDocument.querySelector<HTMLInputElement>(".quick-open__input");
  input?.setAttribute("aria-activedescendant", rendered[activeIndex]?.item.id ?? "");
}

function scopeLabel(parsed: ParsedQuickOpenQuery, english: boolean): string {
  if (parsed.settingsOnly) return english ? "Settings" : "设置";
  if (parsed.scope === "command") return english ? "Commands" : "命令";
  if (parsed.scope === "node") return english ? "Nodes" : "节点";
  if (parsed.scope === "preset") return english ? "Blocks" : "积木";
  if (parsed.scope === "library") return "Library";
  return english ? "All" : "全部";
}

function kindLabel(kind: QuickOpenItemKind, english: boolean): string {
  if (kind === "command") return english ? "Command" : "命令";
  if (kind === "node") return english ? "Node" : "节点";
  if (kind === "preset") return english ? "Block" : "积木";
  return "Library";
}

function tokenize(value: string): readonly string[] {
  return Object.freeze([
    ...new Set(
      normalize(value)
        .split(/[^\p{Letter}\p{Number}_#<>.-]+/u)
        .filter(Boolean),
    ),
  ]);
}

function normalize(value: string): string {
  return value.normalize("NFKC").toLocaleLowerCase("zh-Hans-CN");
}

function clampIndex(index: number, count: number): number {
  if (count === 0) return 0;
  return Math.min(count - 1, Math.max(0, index));
}

function isQuickOpenItem(value: QuickOpenItem): boolean {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof value.id === "string" &&
    value.id.length > 0 &&
    typeof value.targetId === "string" &&
    typeof value.label === "string" &&
    typeof value.detail === "string" &&
    Array.isArray(value.keywords) &&
    Number.isFinite(value.order) &&
    ["command", "node", "preset", "library"].includes(value.kind)
  );
}

function assertOptions(options: QuickOpenOptions): void {
  if (
    options === null ||
    typeof options !== "object" ||
    typeof options.getItems !== "function" ||
    typeof options.onActivate !== "function"
  ) {
    throw new TypeError("Quick Open callbacks 无效");
  }
}

function assertActive(destroyed: boolean): void {
  if (destroyed) throw new Error("Quick Open 已销毁");
}
