import type { InterfaceLocale } from "../shared/interface-locale.js";

export const WORKBENCH_OPEN_TUTORIAL_EVENT = "workbench-open-tutorial";

export type TutorialMasteryStatus = "not-started" | "in-progress" | "mastered" | "skipped";

export type TutorialLessonMode =
  "semantic" | "block-observe" | "block-complete" | "block-compose" | "workspace-evidence";

export interface TutorialLocalizedText {
  readonly "zh-CN": string;
  readonly en: string;
}

export interface TutorialsModuleLesson {
  readonly id: string;
  readonly chapterId: string;
  readonly chapterTitle: TutorialLocalizedText;
  readonly title: TutorialLocalizedText;
  readonly summary: TutorialLocalizedText;
  readonly order: number;
  readonly level: "beginner" | "intermediate";
  readonly estimatedMinutes: number;
  readonly prerequisiteIds: readonly string[];
  readonly knowledgePointIds: readonly string[];
  readonly masteryStatus: TutorialMasteryStatus;
  readonly mode: TutorialLessonMode;
  readonly taskLessonId?: string | undefined;
  readonly libraryEntryId?: string | undefined;
}

export interface TutorialsModuleCatalog {
  readonly items: readonly TutorialsModuleLesson[];
}

export interface TutorialProgressEntry {
  readonly lessonId: string;
  readonly masteryStatus: TutorialMasteryStatus;
}

export interface TutorialsProgressSnapshot {
  readonly entries: readonly TutorialProgressEntry[];
}

export interface TutorialsTaskLessonMount {
  readonly phase: "intro" | "task" | "completed";
  setLocale(locale: InterfaceLocale): void;
  destroy(): void;
}

export interface TutorialsModuleCallbacks {
  readonly mountTaskLesson?:
    | ((
        host: HTMLElement,
        lesson: TutorialsModuleLesson,
        locale: InterfaceLocale,
        onPhaseChange: (phase: TutorialsTaskLessonMount["phase"]) => void,
      ) => TutorialsTaskLessonMount | null)
    | undefined;
  readonly onOpenLibraryEntry?: ((entryId: string) => void) | undefined;
  readonly onProgressChange?: ((snapshot: TutorialsProgressSnapshot) => void) | undefined;
}

export interface TutorialsModule {
  readonly element: HTMLElement;
  readonly selectedLessonId: string | null;
  selectLesson(lessonId: string): void;
  setProgress(snapshot: TutorialsProgressSnapshot): void;
  destroy(): void;
}

const COPY = Object.freeze({
  "zh-CN": Object.freeze({
    label: "算法教程",
    catalog: "课程目录",
    collapseCatalog: "收起",
    expandCatalog: "展开",
    search: "筛选教程",
    progress: "学习进度",
    stage: "教学舞台",
    openLibrary: "在 Library 查看知识点",
    empty: "没有匹配的教程。",
    notStarted: "未开始",
    inProgress: "进行中",
    mastered: "已掌握",
    statusSkipped: "已跳过",
    semantic: "直接操作",
    blockObserve: "观察积木",
    blockComplete: "补全积木",
    blockCompose: "组装积木",
    workspaceEvidence: "工作台验证",
    stageUnavailable: "本课程正在迁移到任务型教学舞台；知识点仍可在 Library 中查询。",
  }),
  en: Object.freeze({
    label: "Algorithm Tutorials",
    catalog: "Course Catalog",
    collapseCatalog: "Hide",
    expandCatalog: "Show",
    search: "Filter tutorials",
    progress: "Learning Progress",
    stage: "Teaching Stage",
    openLibrary: "View knowledge in Library",
    empty: "No tutorials match the filter.",
    notStarted: "Not Started",
    inProgress: "In Progress",
    mastered: "Mastered",
    statusSkipped: "Skipped",
    semantic: "Direct Manipulation",
    blockObserve: "Observe Blocks",
    blockComplete: "Complete Blocks",
    blockCompose: "Compose Blocks",
    workspaceEvidence: "Workbench Evidence",
    stageUnavailable:
      "This lesson is being migrated to the task stage. Its knowledge points remain available in Library.",
  }),
});

let tutorialsModuleSequence = 0;

export function createTutorialsModule(
  host: HTMLElement,
  catalog: TutorialsModuleCatalog,
  callbacks: TutorialsModuleCallbacks = {},
): TutorialsModule {
  const items = normalizeCatalog(catalog);
  const ownerDocument = host.ownerDocument;
  const moduleId = `tutorials-module-${String(++tutorialsModuleSequence)}`;
  const localeHost = host.closest?.<HTMLElement>("[data-locale]") ?? null;
  let locale: InterfaceLocale = localeHost?.dataset.locale === "en" ? "en" : "zh-CN";
  let selectedLessonId = items[0]?.id ?? null;
  let catalogCollapsed = false;
  let taskLesson: TutorialsTaskLessonMount | null = null;
  let destroyed = false;
  const progress = new Map(items.map((item) => [item.id, item.masteryStatus] as const));

  const root = ownerDocument.createElement("section");
  root.className = "tutorials-module";
  root.dataset.tutorialsModule = "true";
  root.setAttribute("aria-label", COPY[locale].label);

  const catalogPane = ownerDocument.createElement("aside");
  catalogPane.className = "tutorials-module__catalog";
  const catalogHeader = ownerDocument.createElement("header");
  const catalogTitle = ownerDocument.createElement("h2");
  const progressText = ownerDocument.createElement("output");
  progressText.className = "tutorials-module__progress";
  const catalogToggle = ownerDocument.createElement("button");
  catalogToggle.type = "button";
  catalogToggle.className = "tutorials-module__catalog-toggle";
  catalogToggle.dataset.tutorialsAction = "toggle-catalog";
  catalogToggle.setAttribute("aria-expanded", "true");
  catalogHeader.append(catalogTitle, progressText, catalogToggle);
  const search = ownerDocument.createElement("input");
  search.type = "search";
  search.className = "tutorials-module__search";
  const lessonList = ownerDocument.createElement("nav");
  lessonList.className = "tutorials-module__lesson-list workbench-scroll-region";
  lessonList.id = `${moduleId}-catalog`;
  catalogToggle.setAttribute("aria-controls", lessonList.id);
  catalogPane.append(catalogHeader, search, lessonList);

  const stage = ownerDocument.createElement("main");
  stage.className = "tutorials-module__stage workbench-scroll-region";
  stage.tabIndex = -1;
  const stageHost = ownerDocument.createElement("div");
  stageHost.className = "tutorials-module__stage-host";
  stage.append(stageHost);
  root.append(catalogPane, stage);
  host.append(root);

  let filteredItems = items;

  const copy = () => COPY[locale];
  const currentLesson = (): TutorialsModuleLesson | null =>
    selectedLessonId === null ? null : (items.find((item) => item.id === selectedLessonId) ?? null);

  function setMastery(lessonId: string, status: TutorialMasteryStatus): void {
    if (progress.get(lessonId) === status) return;
    progress.set(lessonId, status);
    callbacks.onProgressChange?.(progressSnapshot(items, progress));
    renderCatalog();
  }

  function selectLesson(lessonId: string): void {
    assertActive(destroyed);
    if (!items.some((item) => item.id === lessonId)) {
      throw new RangeError(`未知教程：${lessonId}`);
    }
    const availableWidth = root.getBoundingClientRect().width;
    const shouldCollapseCatalog = availableWidth > 0 && availableWidth <= 760;
    if (selectedLessonId === lessonId && taskLesson !== null) {
      if (shouldCollapseCatalog) setCatalogCollapsed(true);
      return;
    }
    selectedLessonId = lessonId;
    renderCatalog();
    mountSelectedStage();
    root.dataset.selectedLessonId = lessonId;
    if (shouldCollapseCatalog) setCatalogCollapsed(true);
  }

  function setCatalogCollapsed(collapsed: boolean): void {
    catalogCollapsed = collapsed;
    root.dataset.catalogCollapsed = String(collapsed);
    catalogToggle.setAttribute("aria-expanded", String(!collapsed));
    catalogToggle.textContent = collapsed ? copy().expandCatalog : copy().collapseCatalog;
    catalogToggle.setAttribute(
      "aria-label",
      `${collapsed ? copy().expandCatalog : copy().collapseCatalog} ${copy().catalog}`,
    );
  }

  function focusStage(): void {
    const currentAction = stageHost.querySelector<HTMLElement>(
      "[data-task-lesson-action='runtime-step']:not(:disabled), button[aria-current='step']:not(:disabled), [tabindex='0'][aria-current='step']",
    );
    const target =
      (currentAction?.closest("[hidden]") === null ? currentAction : null) ??
      [
        ...stageHost.querySelectorAll<HTMLElement>(
          "button:not(:disabled), input:not(:disabled), [tabindex='0']",
        ),
      ].find((candidate) => candidate.closest("[hidden]") === null);
    (target ?? stage).focus();
  }

  function renderCatalog(): void {
    const localized = copy();
    setCatalogCollapsed(catalogCollapsed);
    catalogTitle.textContent = localized.catalog;
    const mastered = items.filter((item) => progress.get(item.id) === "mastered").length;
    progressText.textContent = `${localized.progress} · ${String(mastered)}/${String(items.length)}`;
    progressText.setAttribute("aria-label", progressText.textContent);
    search.placeholder = localized.search;
    search.setAttribute("aria-label", localized.search);
    lessonList.setAttribute("aria-label", localized.catalog);
    const query = search.value.trim().toLocaleLowerCase(locale);
    filteredItems = items.filter((item) => {
      if (query.length === 0) return true;
      return [text(item.title, locale), text(item.chapterTitle, locale), item.id]
        .join(" ")
        .toLocaleLowerCase(locale)
        .includes(query);
    });
    if (filteredItems.length === 0) {
      const empty = ownerDocument.createElement("p");
      empty.className = "tutorials-module__empty";
      empty.textContent = localized.empty;
      lessonList.replaceChildren(empty);
      return;
    }
    const chapterIds = [...new Set(filteredItems.map((item) => item.chapterId))];
    lessonList.replaceChildren(
      ...chapterIds.map((chapterId) => {
        const chapterItems = filteredItems.filter((item) => item.chapterId === chapterId);
        const group = ownerDocument.createElement("details");
        group.className = "tutorials-module__chapter";
        group.open = query.length > 0 || chapterItems.some((item) => item.id === selectedLessonId);
        const heading = ownerDocument.createElement("summary");
        heading.textContent = text(chapterItems[0]!.chapterTitle, locale);
        group.append(heading);
        for (const item of chapterItems) {
          const button = ownerDocument.createElement("button");
          button.type = "button";
          button.className = "tutorials-module__lesson";
          button.dataset.tutorialLessonId = item.id;
          button.dataset.masteryStatus = progress.get(item.id) ?? "not-started";
          button.dataset.lessonMode = item.mode;
          button.dataset.selected = String(item.id === selectedLessonId);
          if (item.id === selectedLessonId) button.setAttribute("aria-current", "page");
          button.tabIndex = item.id === selectedLessonId ? 0 : -1;
          const order = ownerDocument.createElement("span");
          order.className = "tutorials-module__lesson-order";
          order.textContent = String(item.order).padStart(2, "0");
          const label = ownerDocument.createElement("span");
          label.className = "tutorials-module__lesson-label";
          label.textContent = text(item.title, locale);
          if (item.mode === "workspace-evidence") {
            const mode = ownerDocument.createElement("small");
            mode.className = "tutorials-module__lesson-mode";
            mode.textContent = modeLabel(item.mode, localized);
            label.append(mode);
          }
          button.setAttribute(
            "aria-label",
            `${String(item.order)}. ${text(item.title, locale)} · ${masteryLabel(progress.get(item.id) ?? "not-started", localized)}`,
          );
          button.append(order, label);
          button.addEventListener("click", (event) => {
            selectLesson(item.id);
            if (event.detail === 0 || catalogCollapsed) focusStage();
          });
          button.addEventListener("keydown", (event) => {
            if (event.key !== "Enter") return;
            event.preventDefault();
            selectLesson(item.id);
            focusStage();
          });
          group.append(button);
        }
        return group;
      }),
    );
  }

  function mountSelectedStage(): void {
    taskLesson?.destroy();
    taskLesson = null;
    stageHost.replaceChildren();
    // A lesson owns its own viewport. Never inherit the previous lesson's
    // scroll position: doing so can mount the next task below the visible
    // area and make a correctly rendered stage look blank or broken.
    stage.scrollTop = 0;
    stage.scrollLeft = 0;
    const item = currentLesson();
    if (item === null) return;
    stage.setAttribute("aria-label", `${copy().stage} · ${text(item.title, locale)}`);
    if (item.taskLessonId !== undefined && callbacks.mountTaskLesson !== undefined) {
      taskLesson = callbacks.mountTaskLesson(stageHost, item, locale, (phase) => {
        if (phase === "task") setMastery(item.id, "in-progress");
        else if (phase === "completed") setMastery(item.id, "mastered");
      });
      if (taskLesson !== null) return;
    }
    const fallback = ownerDocument.createElement("section");
    fallback.className = "tutorials-module__stage-empty";
    const label = ownerDocument.createElement("span");
    label.className = "tutorials-module__eyebrow";
    label.textContent = modeLabel(item.mode, copy());
    const heading = ownerDocument.createElement("h2");
    heading.textContent = text(item.title, locale);
    const body = ownerDocument.createElement("p");
    body.textContent = copy().stageUnavailable;
    fallback.append(label, heading, body);
    if (item.libraryEntryId !== undefined) {
      const open = ownerDocument.createElement("button");
      open.type = "button";
      open.className = "button button--quiet";
      open.textContent = copy().openLibrary;
      open.addEventListener("click", () => callbacks.onOpenLibraryEntry?.(item.libraryEntryId!));
      fallback.append(open);
    }
    stageHost.append(fallback);
  }

  const onSearch = (): void => renderCatalog();
  const onSearchKeydown = (event: KeyboardEvent): void => {
    if (event.key !== "Enter") return;
    const first = filteredItems[0];
    if (first === undefined) return;
    event.preventDefault();
    selectLesson(first.id);
    focusStage();
    ownerDocument.defaultView?.setTimeout(() => {
      if (!destroyed) focusStage();
    }, 0);
  };
  const onListKeydown = (event: KeyboardEvent): void => {
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    const buttons = [
      ...lessonList.querySelectorAll<HTMLButtonElement>("[data-tutorial-lesson-id]"),
    ].filter((button) => button.closest("details")?.open !== false);
    if (buttons.length === 0) return;
    const current = buttons.indexOf(ownerDocument.activeElement as HTMLButtonElement);
    const next =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? buttons.length - 1
          : event.key === "ArrowDown"
            ? Math.min(buttons.length - 1, current + 1)
            : Math.max(0, current < 0 ? 0 : current - 1);
    event.preventDefault();
    const target = buttons[next];
    if (target === undefined) return;
    for (const button of buttons) button.tabIndex = button === target ? 0 : -1;
    target.focus();
  };
  const onLocaleChange = (event: Event): void => {
    const detail = (event as CustomEvent<{ readonly locale?: unknown }>).detail;
    locale = detail?.locale === "en" ? "en" : "zh-CN";
    root.setAttribute("aria-label", copy().label);
    renderCatalog();
    taskLesson?.setLocale(locale);
    if (taskLesson === null) mountSelectedStage();
  };

  search.addEventListener("input", onSearch);
  search.addEventListener("keydown", onSearchKeydown);
  catalogToggle.addEventListener("click", () => setCatalogCollapsed(!catalogCollapsed));
  lessonList.addEventListener("keydown", onListKeydown);
  localeHost?.addEventListener("workbench-locale-change", onLocaleChange);
  renderCatalog();
  setCatalogCollapsed(false);
  mountSelectedStage();

  return Object.freeze({
    element: root,
    get selectedLessonId(): string | null {
      return selectedLessonId;
    },
    selectLesson,
    setProgress(snapshot: TutorialsProgressSnapshot): void {
      assertActive(destroyed);
      const next = normalizeProgress(snapshot, items);
      for (const item of items) progress.set(item.id, next.get(item.id) ?? item.masteryStatus);
      renderCatalog();
    },
    destroy(): void {
      if (destroyed) return;
      destroyed = true;
      taskLesson?.destroy();
      taskLesson = null;
      search.removeEventListener("input", onSearch);
      search.removeEventListener("keydown", onSearchKeydown);
      lessonList.removeEventListener("keydown", onListKeydown);
      localeHost?.removeEventListener("workbench-locale-change", onLocaleChange);
      root.remove();
    },
  });
}

function normalizeCatalog(catalog: TutorialsModuleCatalog): readonly TutorialsModuleLesson[] {
  if (catalog === null || typeof catalog !== "object" || !Array.isArray(catalog.items)) {
    throw new TypeError("Tutorials catalog 必须提供 items 数组");
  }
  const ids = new Set<string>();
  const items = catalog.items.map((item) => {
    if (item === null || typeof item !== "object" || item.id.trim().length === 0) {
      throw new TypeError("Tutorials lesson 必须提供稳定 id");
    }
    if (ids.has(item.id)) throw new TypeError(`Tutorials lesson id 重复：${item.id}`);
    ids.add(item.id);
    if (!isMasteryStatus(item.masteryStatus)) {
      throw new TypeError(`Tutorials lesson 状态无效：${item.id}`);
    }
    return Object.freeze({
      ...item,
      prerequisiteIds: Object.freeze([...item.prerequisiteIds]),
      knowledgePointIds: Object.freeze([...item.knowledgePointIds]),
    });
  });
  return Object.freeze(
    items.sort(
      (left, right) =>
        left.order - right.order ||
        text(left.title, "zh-CN").localeCompare(text(right.title, "zh-CN"), "zh-Hans-CN"),
    ),
  );
}

function normalizeProgress(
  snapshot: TutorialsProgressSnapshot,
  items: readonly TutorialsModuleLesson[],
): ReadonlyMap<string, TutorialMasteryStatus> {
  if (snapshot === null || typeof snapshot !== "object" || !Array.isArray(snapshot.entries)) {
    throw new TypeError("Tutorials progress 必须提供 entries 数组");
  }
  const lessonIds = new Set(items.map((item) => item.id));
  const result = new Map<string, TutorialMasteryStatus>();
  for (const entry of snapshot.entries) {
    if (!lessonIds.has(entry.lessonId) || result.has(entry.lessonId)) {
      throw new TypeError(`Tutorials progress lessonId 无效或重复：${entry.lessonId}`);
    }
    if (!isMasteryStatus(entry.masteryStatus)) {
      throw new TypeError(`Tutorials progress 状态无效：${entry.lessonId}`);
    }
    result.set(entry.lessonId, entry.masteryStatus);
  }
  return result;
}

function progressSnapshot(
  items: readonly TutorialsModuleLesson[],
  progress: ReadonlyMap<string, TutorialMasteryStatus>,
): TutorialsProgressSnapshot {
  return Object.freeze({
    entries: Object.freeze(
      items.map((item) =>
        Object.freeze({
          lessonId: item.id,
          masteryStatus: progress.get(item.id) ?? item.masteryStatus,
        }),
      ),
    ),
  });
}

function text(value: TutorialLocalizedText, locale: InterfaceLocale): string {
  return locale === "en" ? value.en : value["zh-CN"];
}

function masteryLabel(
  status: TutorialMasteryStatus,
  localized: Readonly<{
    mastered: string;
    inProgress: string;
    statusSkipped: string;
    notStarted: string;
  }>,
): string {
  if (status === "mastered") return localized.mastered;
  if (status === "in-progress") return localized.inProgress;
  if (status === "skipped") return localized.statusSkipped;
  return localized.notStarted;
}

function modeLabel(
  mode: TutorialLessonMode,
  localized: Readonly<{
    semantic: string;
    blockObserve: string;
    blockComplete: string;
    blockCompose: string;
    workspaceEvidence: string;
  }>,
): string {
  if (mode === "semantic") return localized.semantic;
  if (mode === "block-observe") return localized.blockObserve;
  if (mode === "block-complete") return localized.blockComplete;
  if (mode === "block-compose") return localized.blockCompose;
  return localized.workspaceEvidence;
}

function isMasteryStatus(value: unknown): value is TutorialMasteryStatus {
  return ["not-started", "in-progress", "mastered", "skipped"].includes(String(value));
}

function assertActive(destroyed: boolean): void {
  if (destroyed) throw new Error("Tutorials module 已销毁");
}
