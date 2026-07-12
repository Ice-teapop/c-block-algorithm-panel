import type {
  CatalogPresetBlock,
  LearningCatalog,
  LearningCatalogSnapshot,
} from "../learning/index.js";

export type LearningStageFilter = "all" | string;
export interface BlockPaletteCompatibilityFilter {
  readonly direction: "input" | "output";
  readonly channel: "control" | "data";
}
export type BlockPaletteCategory =
  | "all"
  | "search"
  | "flow-c-basics"
  | "data-memory"
  | "recent-favorites"
  | "flow-control"
  | "c-basics"
  | "functions-io"
  | "arrays-strings"
  | "pointers-memory"
  | "data-structures"
  | "algorithm-patterns"
  | "testing-analysis"
  | "custom-lifecycle";

export interface BlockPaletteCallbacks {
  readonly onTemplateDragStart: (templateId: string) => void;
  readonly onTemplateDragEnd: () => void;
  readonly onInsertSelected: (templateId: string) => void;
}

export interface BlockPalette {
  readonly element: HTMLElement;
  refresh(): void;
  setStage(stageId: LearningStageFilter): void;
  getStage(): LearningStageFilter;
  setCategory(category: BlockPaletteCategory): void;
  getCategory(): BlockPaletteCategory;
  setInsertEnabled(enabled: boolean): void;
  setCompatibilityFilter(filter: BlockPaletteCompatibilityFilter | null): void;
  focusSearch(): void;
  destroy(): void;
}

export function filterLearningTemplates(
  snapshot: LearningCatalogSnapshot,
  stageId: LearningStageFilter,
  query: string,
  category: BlockPaletteCategory = "all",
  compatibility: BlockPaletteCompatibilityFilter | null = null,
): readonly CatalogPresetBlock[] {
  const normalizedQuery = query.trim().toLocaleLowerCase("zh-CN");
  return Object.freeze(
    snapshot.presets.filter((template) => {
      if (template.lifecycle !== "active") return false;
      if (stageId !== "all" && template.stage !== stageId) return false;
      if (!matchesCategory(template, category)) return false;
      if (
        compatibility !== null &&
        !template.ports.some(
          (port) =>
            port.direction === compatibility.direction && port.channel === compatibility.channel,
        )
      ) {
        return false;
      }
      if (normalizedQuery.length === 0) return true;
      return [template.label, template.description, template.category, template.source ?? ""].some(
        (value) => value.toLocaleLowerCase("zh-CN").includes(normalizedQuery),
      );
    }),
  );
}

export function createBlockPalette(
  host: HTMLElement,
  catalog: LearningCatalog,
  callbacks: BlockPaletteCallbacks,
): BlockPalette {
  assertCallbacks(callbacks);
  const ownerDocument = host.ownerDocument;
  const root = ownerDocument.createElement("section");
  root.className = "block-palette";
  root.setAttribute("aria-label", "可拖拽积木库");

  const filters = ownerDocument.createElement("div");
  filters.className = "block-palette__filters";
  const stageLabel = ownerDocument.createElement("label");
  stageLabel.className = "visually-hidden";
  stageLabel.textContent = "学习阶段";
  const stageSelect = ownerDocument.createElement("select");
  stageSelect.className = "block-palette__select";
  stageSelect.setAttribute("aria-label", "学习阶段");
  stageLabel.htmlFor = "block-palette-stage";
  stageSelect.id = "block-palette-stage";
  const search = ownerDocument.createElement("input");
  search.className = "block-palette__search";
  search.type = "search";
  search.placeholder = "筛选积木";
  search.setAttribute("aria-label", "筛选积木");
  filters.append(stageLabel, stageSelect, search);

  const list = ownerDocument.createElement("div");
  list.className = "block-palette__list";
  list.setAttribute("role", "list");
  root.append(filters, list);
  host.append(root);

  let destroyed = false;
  let stageId: LearningStageFilter = "all";
  let category: BlockPaletteCategory = "all";
  let insertEnabled = false;
  let compatibility: BlockPaletteCompatibilityFilter | null = null;
  let visibleTemplates = new Map<string, CatalogPresetBlock>();
  let activeDragSurface: HTMLElement | null = null;

  const finishActiveDrag = (): void => {
    if (activeDragSurface === null) return;
    activeDragSurface.classList.remove("is-dragging");
    activeDragSurface = null;
    callbacks.onTemplateDragEnd();
  };

  const render = (): void => {
    assertActive(destroyed);
    finishActiveDrag();
    const snapshot = catalog.snapshot();
    renderStageOptions(stageSelect, snapshot, stageId);
    const templates = filterLearningTemplates(
      snapshot,
      stageId,
      search.value,
      category,
      compatibility,
    );
    root.dataset.category = category;
    root.dataset.compatibility =
      compatibility === null ? "all" : `${compatibility.channel}-${compatibility.direction}`;
    visibleTemplates = new Map(templates.map((template) => [template.id, template]));
    list.replaceChildren();
    if (templates.length === 0) {
      const empty = ownerDocument.createElement("p");
      empty.className = "block-palette__empty";
      empty.textContent = "当前筛选下没有可用积木。";
      list.append(empty);
      return;
    }
    for (const template of templates) {
      list.append(renderTemplateRow(ownerDocument, template, insertEnabled));
    }
  };

  const onStageChange = (): void => {
    stageId = stageSelect.value;
    category = "all";
    render();
  };
  const onSearchInput = (): void => render();
  const onDragStart = (event: DragEvent): void => {
    const dragSurface = templateDragSurfaceForEvent(event);
    if (dragSurface === null) {
      event.preventDefault();
      return;
    }
    const template = visibleTemplates.get(dragSurface.dataset.templateId ?? "");
    if (template === undefined || template.lifecycle !== "active") {
      event.preventDefault();
      return;
    }
    finishActiveDrag();
    activeDragSurface = dragSurface;
    dragSurface.classList.add("is-dragging");
    callbacks.onTemplateDragStart(template.id);
    if (event.dataTransfer !== null) {
      event.dataTransfer.effectAllowed = "copy";
      event.dataTransfer.setData("text/plain", "c-block-catalog-item");
      event.dataTransfer.setData("application/x-c-block-preset", template.id);
    }
  };
  const onDragEnd = (): void => finishActiveDrag();
  const onClick = (event: Event): void => {
    const button = (event.target as Element | null)?.closest<HTMLButtonElement>(
      "button[data-template-action='insert']",
    );
    if (button === null || button === undefined || button.disabled) return;
    const templateId = button.dataset.templateId;
    if (templateId !== undefined && visibleTemplates.has(templateId)) {
      callbacks.onInsertSelected(templateId);
    }
  };

  stageSelect.addEventListener("change", onStageChange);
  search.addEventListener("input", onSearchInput);
  list.addEventListener("dragstart", onDragStart);
  list.addEventListener("dragend", onDragEnd);
  list.addEventListener("click", onClick);
  render();

  return Object.freeze({
    element: root,
    refresh: render,
    setStage(nextStageId: LearningStageFilter): void {
      assertActive(destroyed);
      const snapshot = catalog.snapshot();
      if (nextStageId !== "all" && !snapshot.stages.some((stage) => stage.id === nextStageId)) {
        throw new RangeError(`未知学习阶段：${nextStageId}`);
      }
      stageId = nextStageId;
      render();
    },
    getStage: () => stageId,
    setCategory(nextCategory: BlockPaletteCategory): void {
      assertActive(destroyed);
      if (!BLOCK_PALETTE_CATEGORIES.has(nextCategory)) {
        throw new RangeError(`未知预设分类：${nextCategory}`);
      }
      category = nextCategory;
      stageId = "all";
      compatibility = null;
      render();
    },
    getCategory: () => category,
    setInsertEnabled(enabled: boolean): void {
      assertActive(destroyed);
      if (typeof enabled !== "boolean") throw new TypeError("enabled 必须是布尔值");
      insertEnabled = enabled;
      for (const button of list.querySelectorAll<HTMLButtonElement>(
        "button[data-template-action='insert']",
      )) {
        button.disabled = !enabled;
      }
    },
    setCompatibilityFilter(filter: BlockPaletteCompatibilityFilter | null): void {
      assertActive(destroyed);
      if (
        filter !== null &&
        ((filter.direction !== "input" && filter.direction !== "output") ||
          (filter.channel !== "control" && filter.channel !== "data"))
      ) {
        throw new TypeError("积木兼容筛选无效");
      }
      compatibility = filter === null ? null : Object.freeze({ ...filter });
      category = "search";
      stageId = "all";
      search.value = "";
      render();
    },
    focusSearch(): void {
      assertActive(destroyed);
      search.focus({ preventScroll: true });
      search.select();
    },
    destroy(): void {
      if (destroyed) return;
      destroyed = true;
      if (activeDragSurface === null) callbacks.onTemplateDragEnd();
      else finishActiveDrag();
      stageSelect.removeEventListener("change", onStageChange);
      search.removeEventListener("input", onSearchInput);
      list.removeEventListener("dragstart", onDragStart);
      list.removeEventListener("dragend", onDragEnd);
      list.removeEventListener("click", onClick);
      root.remove();
      visibleTemplates.clear();
    },
  });
}

const BLOCK_PALETTE_CATEGORIES = new Set<BlockPaletteCategory>([
  "all",
  "search",
  "flow-c-basics",
  "data-memory",
  "recent-favorites",
  "flow-control",
  "c-basics",
  "functions-io",
  "arrays-strings",
  "pointers-memory",
  "data-structures",
  "algorithm-patterns",
  "testing-analysis",
  "custom-lifecycle",
]);

function matchesCategory(template: CatalogPresetBlock, category: BlockPaletteCategory): boolean {
  if (category === "all" || category === "search" || category === "recent-favorites") return true;
  if (category === "custom-lifecycle") return template.origin === "custom";
  if (category === "flow-c-basics") {
    return (
      [
        "flow-control",
        "control",
        "c-basics",
        "declaration",
        "assignment",
        "functions-io",
        "function-call",
        "function-control",
        "io",
      ].includes(template.category) || template.blockKind === "virtual"
    );
  }
  if (category === "data-memory") {
    return [
      "arrays-strings",
      "array",
      "pointers-memory",
      "data-structures",
      "linear-structure",
      "tree",
    ].includes(template.category);
  }
  const groups: Readonly<
    Record<
      Exclude<
        BlockPaletteCategory,
        "all" | "search" | "flow-c-basics" | "data-memory" | "recent-favorites" | "custom-lifecycle"
      >,
      readonly string[]
    >
  > = {
    "flow-control": ["flow-control", "control"],
    "c-basics": ["c-basics", "declaration", "assignment"],
    "functions-io": ["functions-io", "function-call", "function-control", "io"],
    "arrays-strings": ["arrays-strings", "array"],
    "pointers-memory": ["pointers-memory"],
    "data-structures": ["data-structures", "linear-structure", "tree"],
    "algorithm-patterns": ["algorithm-patterns", "search", "sort", "recursion", "complexity"],
    "testing-analysis": ["testing-analysis", "correctness", "complexity"],
  };
  return (
    groups[category].includes(template.category) ||
    (category === "flow-control" && template.blockKind === "virtual")
  );
}

function renderStageOptions(
  select: HTMLSelectElement,
  snapshot: LearningCatalogSnapshot,
  selected: LearningStageFilter,
): void {
  const ownerDocument = select.ownerDocument;
  select.replaceChildren();
  const all = ownerDocument.createElement("option");
  all.value = "all";
  all.textContent = "全部阶段";
  select.append(all);
  for (const stage of snapshot.stages) {
    const option = ownerDocument.createElement("option");
    option.value = stage.id;
    option.textContent = stage.label;
    select.append(option);
  }
  select.value = selected;
}

function renderTemplateRow(
  ownerDocument: Document,
  template: CatalogPresetBlock,
  insertEnabled: boolean,
): HTMLElement {
  const visualKind = template.fragmentKind ?? "virtual";
  const row = ownerDocument.createElement("article");
  row.className = "block-palette__item";
  row.dataset.templateId = template.id;
  row.dataset.category = template.category;
  row.dataset.fragmentKind = visualKind;
  row.dataset.blockKind = template.blockKind;
  row.dataset.stage = template.stage;
  row.setAttribute("role", "listitem");

  const dragSurface = ownerDocument.createElement("div");
  dragSurface.className = `block-palette__drag-surface block-palette__drag-surface--${visualKind}`;
  dragSurface.dataset.templateId = template.id;
  dragSurface.dataset.category = template.category;
  dragSurface.dataset.fragmentKind = visualKind;
  dragSurface.dataset.blockKind = template.blockKind;
  dragSurface.dataset.stage = template.stage;
  dragSurface.draggable = true;
  dragSurface.tabIndex = 0;
  dragSurface.setAttribute(
    "aria-label",
    template.source === null
      ? `${template.label}，可拖到自由画布，不生成 C 源码`
      : `${template.label}，可拖到组装插槽或自由画布`,
  );
  dragSurface.setAttribute(
    "aria-roledescription",
    template.source === null ? "可拖拽虚拟流程节点" : "可拖拽 C 积木",
  );

  const heading = ownerDocument.createElement("div");
  heading.className = "block-palette__item-heading";
  const label = ownerDocument.createElement("strong");
  label.textContent = template.label;
  const category = ownerDocument.createElement("span");
  category.textContent = template.category;
  heading.append(label, category);
  const source = ownerDocument.createElement("code");
  source.className = "block-palette__source";
  source.textContent =
    template.source === null ? "虚拟控制节点 · 不改变 C 语义" : compactSource(template.source);
  const description = ownerDocument.createElement("p");
  description.className = "block-palette__description";
  description.textContent = template.description;
  const insert = ownerDocument.createElement("button");
  insert.className = "block-palette__insert";
  insert.type = "button";
  insert.dataset.templateAction = "insert";
  insert.dataset.templateId = template.id;
  insert.textContent = template.source === null ? "拖到画布" : "插入所选位置";
  insert.disabled = template.source === null || !insertEnabled;
  dragSurface.append(heading, source);
  row.append(dragSurface, description, insert);
  return row;
}

function compactSource(source: string): string {
  const compact = source.replaceAll(/\s+/gu, " ").trim();
  return compact.length <= 72 ? compact : `${compact.slice(0, 69)}…`;
}

function templateDragSurfaceForEvent(event: Event): HTMLElement | null {
  return (
    (event.target as Element | null)?.closest<HTMLElement>(
      ".block-palette__drag-surface[data-template-id][draggable='true']",
    ) ?? null
  );
}

function assertCallbacks(callbacks: BlockPaletteCallbacks): void {
  if (
    typeof callbacks?.onTemplateDragStart !== "function" ||
    typeof callbacks.onTemplateDragEnd !== "function" ||
    typeof callbacks.onInsertSelected !== "function"
  ) {
    throw new TypeError("积木库回调不完整");
  }
}

function assertActive(destroyed: boolean): void {
  if (destroyed) throw new Error("BlockPalette 已销毁");
}
