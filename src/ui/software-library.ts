import {
  LIBRARY_BRANCHES,
  getLibraryEntry,
  libraryEntriesForBranch,
  localizeLibraryEntry,
  relatedLibraryEntries,
  resolveLibraryBranchId,
  searchLibrary,
  type LibraryAudience,
  type LibraryBranchId,
  type LibraryEntry,
  type LibraryFeatureLink,
} from "../library/index.js";
import type { InterfaceLocale } from "../shared/interface-locale.js";

export type SoftwareFeatureStatus = "available" | "foundation" | "planned";

export interface SoftwareFeatureDefinition {
  readonly id: string;
  readonly category: string;
  readonly title: string;
  readonly pageId: string;
  readonly targetId: string;
  readonly status: SoftwareFeatureStatus;
  readonly purpose: string;
  readonly useWhen: string;
  readonly currentCapability: string;
  readonly limitation: string;
  readonly extensionPoints: readonly string[];
}

export interface SoftwareLibraryCallbacks {
  readonly onOpenFeature: (pageId: string, targetId: string) => void;
  readonly onStartGuidedLesson: () => void;
}

export interface SoftwareLibrary {
  readonly element: HTMLElement;
  readonly selectedFeatureId: string;
  readonly selectedEntryId: string;
  readonly selectedBranchId: LibraryBranchId;
  select(featureId: string): void;
  selectEntry(entryId: string): void;
  selectBranch(branchId: string): void;
  destroy(): void;
}

export const SOFTWARE_FEATURES: readonly SoftwareFeatureDefinition[] = Object.freeze([
  feature("dashboard", "文件", "Dashboard", "dashboard", "dashboard", "available", {
    purpose: "集中浏览本机算法条目，并进入项目、沙箱或测试工作流。",
    useWhen: "开始新任务、继续旧条目或检查最近修改时。",
    currentCapability: "启动或刷新时从 Documents 专属目录列出条目；支持新建、筛选和打开。",
    limitation: "首版不提供删除、重命名和跨设备同步。",
    extensionPoints: ["工作区条目类型", "元数据索引", "最近使用策略"],
  }),
  feature("projects", "文件", "项目", "dashboard", "project", "foundation", {
    purpose: "承载持续演进的算法设计与课程项目。",
    useWhen: "一个问题需要长期维护、测试和后续多文件扩展时。",
    currentCapability: "每个项目使用独立目录、entry.json 与 main.c，修改自动原子保存。",
    limitation: "当前编辑面仍以单一 main.c 为事实源。",
    extensionPoints: ["多文件源码", "课程元数据", "版本与复盘"],
  }),
  feature("sandboxes", "文件", "沙箱", "dashboard", "sandbox", "available", {
    purpose: "保存快速实验，同时避免临时代码散落。",
    useWhen: "验证 C 语法、数据结构片段或算法想法时。",
    currentCapability: "与项目使用相同的安全落盘和自动保存链路。",
    limitation: "尚未提供一键升级为项目。",
    extensionPoints: ["模板", "一键转项目", "实验快照"],
  }),
  feature("tests", "文件", "测试", "dashboard", "test", "foundation", {
    purpose: "为算法输入、期望输出和边界条件建立独立入口。",
    useWhen: "需要设计用例或复现失败输入时。",
    currentCapability: "已具备专属 Documents 条目与现有编译运行底座。",
    limitation: "结构化用例编辑器和项目关联仍在扩展阶段。",
    extensionPoints: ["输入输出用例", "项目关联", "批量回归"],
  }),
  feature("presets", "构建", "预制积木", "build", "preset-blocks", "available", {
    purpose: "提供按学习阶段组织的常见 C 语句和控制结构。",
    useWhen: "初学者希望直接拼接，或快速调用稳定片段时。",
    currentCapability: "支持阶段筛选、搜索、真实拖拽和选中位置插入。",
    limitation: "不兼容的结构位置会被拒绝，不做猜测性修复。",
    extensionPoints: ["学习阶段", "算法元素注册", "课程包"],
  }),
  feature("assembly", "构建", "组装画布", "build", "assembly-canvas", "available", {
    purpose: "用紧凑工业模块呈现 C 结构，并作为真实拖拽目标。",
    useWhen: "搭建、阅读或调整算法控制流时。",
    currentCapability: "保留嵌套层级、受控插槽、选中状态与无损源码映射。",
    limitation: "不支持会破坏语义边界的任意跨层拖动。",
    extensionPoints: ["新语句类型", "高层算法模块", "结构验证器"],
  }),
  feature("source", "构建", "C 代码与同步", "build", "code-pane", "available", {
    purpose: "随时查看和直接编辑积木背后的精确 C 源码。",
    useWhen: "需要精确语法控制、粘贴代码或核对生成结果时。",
    currentCapability: "代码、积木和解析结果即时同步；托管条目在 300 ms 防抖后写入 Documents。",
    limitation: "解析恢复期间会保守暂停结构化写操作。",
    extensionPoints: ["多文件编辑器", "诊断标注", "格式策略"],
  }),
  feature("explanation", "检查", "解释", "explanation", "explanation", "available", {
    purpose: "解释选中语法、符号及其确定性含义。",
    useWhen: "不理解代码块作用、变量来源或库函数时。",
    currentCapability: "节点、符号与内建知识驱动；离线也可使用。",
    limitation: "当前不把自然语言推测当作程序事实。",
    extensionPoints: ["确定性分析事实", "本地 AI 导师", "课程提示"],
  }),
  feature("editing", "检查", "结构编辑", "edit", "edit", "available", {
    purpose: "通过受约束表单安全修改字面量、运算符、语句和局部变量。",
    useWhen: "希望调整程序但不想手工处理全部语法细节时。",
    currentCapability: "语义敏感操作先展示精确 diff，确认后可撤销或重做。",
    limitation: "有歧义、宏或可疑解析时宁可拒绝。",
    extensionPoints: ["新补丁操作", "编辑等价验证", "批量重构"],
  }),
  feature("run", "执行", "编译与运行", "run", "run", "available", {
    purpose: "在本机受控运行器中编译 C 并查看诊断和输出。",
    useWhen: "验证算法结果或检查编译错误时。",
    currentCapability: "具备资源上限、可信确认、输出与终止状态。",
    limitation: "它不是任意不可信代码的强安全沙箱。",
    extensionPoints: ["结构化测试", "工具链诊断", "执行轨迹"],
  }),
  feature(
    "block-library",
    "扩展",
    "积木管理",
    "block-library",
    "block-library-create",
    "available",
    {
      purpose: "把常用 C 片段保存为可复用积木并管理其生命周期。",
      useWhen: "同类片段反复出现，或要建立个人课程积木库时。",
      currentCapability: "支持创建、验证、弃用、恢复和退休；已生成源码不受退休影响。",
      limitation: "积木定义目前保存在本机浏览器存储。",
      extensionPoints: ["积木包导入导出", "版本迁移", "团队目录"],
    },
  ),
  feature("storage", "扩展", "本地存储与安全", "build", "local-save", "available", {
    purpose: "明确源码何时写入磁盘，以及哪些权限没有暴露给界面。",
    useWhen: "核对保存状态、冲突或数据位置时。",
    currentCapability: "源码在停止输入片刻后写入 Documents 专属目录；冲突时停止覆盖并提示重载。",
    limitation: "首版不监听外部编辑器的实时反向变化。",
    extensionPoints: ["冲突解决", "备份恢复", "导出与迁移"],
  }),
  feature(
    "extensions",
    "扩展",
    "平台扩展接口",
    "software-library",
    "software-library",
    "foundation",
    {
      purpose: "说明新页面、命令、算法元素和教学能力如何接入平台。",
      useWhen: "设计新的算法模块、课程包或分析工具时。",
      currentCapability: "工作台注册表已分离 Dock 页面、检查器、命令和算法元素元数据。",
      limitation: "第三方包安装、签名与权限模型尚未开放。",
      extensionPoints: ["Dock 页面", "命令", "算法元素", "检查器", "学习阶段", "运行器能力"],
    },
  ),
]);

const FEATURE_ENTRY_IDS: Readonly<Record<string, string>> = Object.freeze({
  dashboard: "manual.dashboard",
  projects: "manual.workspace-kinds",
  sandboxes: "manual.workspace-kinds",
  tests: "manual.workspace-kinds",
  presets: "manual.presets",
  assembly: "canvas.free-layout",
  source: "manual.code-editor",
  explanation: "manual.inspectors",
  editing: "manual.inspectors",
  run: "execution.toolchain",
  "block-library": "manual.custom-blocks",
  storage: "manual.autosave",
  extensions: "extension.registry",
});

type LibraryFilterId = "syntax" | "standard" | "data" | "algorithms" | "examples" | "help";

interface LibraryFilterDefinition {
  readonly id: LibraryFilterId;
  readonly label: string;
  readonly labelEn: string;
  readonly branchId: LibraryBranchId;
  readonly branchIds: readonly LibraryBranchId[];
  readonly audience: "learner" | "help";
}

const LEARNER_BRANCH_IDS: readonly LibraryBranchId[] = Object.freeze([
  "c-syntax",
  "standard-library",
  "data-structure-dictionary",
  "algorithms-complexity",
  "examples",
]);

const HELP_BRANCH_IDS: readonly LibraryBranchId[] = Object.freeze([
  "manual",
  "canvas-wires",
  "execution-diagnostics",
  "recovery",
  "onboarding",
]);

const LIBRARY_FILTERS: readonly LibraryFilterDefinition[] = Object.freeze([
  filter("syntax", "语法", "Syntax", "c-syntax"),
  filter("standard", "标准库", "Standard Library", "standard-library"),
  filter("data", "数据结构", "Data Structures", "data-structure-dictionary"),
  filter("algorithms", "算法", "Algorithms", "algorithms-complexity"),
  filter("examples", "案例", "Examples", "examples"),
  Object.freeze({
    id: "help",
    label: "帮助",
    labelEn: "Help",
    branchId: "manual",
    branchIds: HELP_BRANCH_IDS,
    audience: "help",
  }),
]);

export function createSoftwareLibrary(
  host: HTMLElement,
  callbacks: SoftwareLibraryCallbacks,
): SoftwareLibrary {
  assertCallbacks(callbacks);
  const ownerDocument = host.ownerDocument;
  const shell =
    typeof host.closest === "function" ? host.closest<HTMLElement>("#workbench-shell") : null;
  const localeHost =
    typeof host.closest === "function"
      ? (host.closest<HTMLElement>("[data-locale]") ?? shell ?? host)
      : host;
  const documentElement = ownerDocument.documentElement;
  let locale = resolveLibraryLocale(
    localeHost.dataset.locale ?? documentElement?.dataset.locale ?? documentElement?.lang,
  );
  const english = (): boolean => locale === "en";
  const root = ownerDocument.createElement("section");
  root.className = "software-library-view";
  root.dataset.tourTarget = "software-library-content";
  root.setAttribute("aria-label", english() ? "Software Library" : "软件功能 Library");

  const searchBar = ownerDocument.createElement("header");
  searchBar.className = "software-library__searchbar";
  const searchIdentity = ownerDocument.createElement("div");
  searchIdentity.className = "software-library__identity";
  const searchTitle = ownerDocument.createElement("strong");
  searchTitle.textContent = "Library";
  const searchHint = ownerDocument.createElement("span");
  searchHint.textContent = english() ? "C and algorithm dictionary" : "C 与算法词典";
  searchIdentity.append(searchTitle, searchHint);
  const filters = ownerDocument.createElement("nav");
  filters.className = "software-library__filters";
  filters.setAttribute("aria-label", english() ? "Library categories" : "Library 分类");
  const index = ownerDocument.createElement("nav");
  index.className = "software-library__index";
  index.setAttribute("aria-label", english() ? "Library entries" : "词条结果");
  const search = ownerDocument.createElement("input");
  search.type = "search";
  search.className = "software-library__search";
  search.placeholder = english() ? "Search keywords, aliases or code" : "搜索关键词、别名或代码";
  search.setAttribute("aria-label", english() ? "Search all Library entries" : "全文搜索 Library");
  const resultCount = ownerDocument.createElement("output");
  resultCount.className = "software-library__result-count";
  resultCount.setAttribute("aria-live", "polite");
  searchBar.append(searchIdentity, filters, search, resultCount);
  const list = ownerDocument.createElement("div");
  list.className = "software-library__list";
  list.dataset.libraryDirectory = "true";
  index.append(list);

  const detail = ownerDocument.createElement("article");
  detail.className = "software-library__detail";
  detail.setAttribute("aria-live", "polite");
  detail.dataset.libraryDetail = "true";
  const body = ownerDocument.createElement("div");
  body.className = "software-library__body";
  body.append(index, detail);
  root.append(searchBar, body);
  host.append(root);

  let selectedFeatureId = "";
  let selectedBranchId: LibraryBranchId = "c-syntax";
  let selectedEntryId = libraryEntriesForBranch("c-syntax")[0]?.id ?? "c.statement";
  let activeFilterId: LibraryFilterId | null = null;
  let activeAudience: LibraryAudience = "learner";
  let selectedFeatureOverride: SoftwareFeatureDefinition | null = null;
  let destroyed = false;
  let entryButtons: HTMLButtonElement[] = [];
  const branchButtons = LIBRARY_FILTERS.map((definition) => {
    const button = ownerDocument.createElement("button");
    button.className = "software-library__filter";
    button.type = "button";
    button.textContent = english() ? definition.labelEn : definition.label;
    button.dataset.libraryFilterId = definition.id;
    button.dataset.libraryBranchId = definition.branchId;
    button.addEventListener("click", () => selectFilter(definition.id));
    filters.append(button);
    return button;
  });

  const select = (featureId: string): void => {
    assertActive(destroyed);
    const featureDefinition = SOFTWARE_FEATURES.find((feature) => feature.id === featureId);
    if (featureDefinition === undefined) {
      throw new RangeError(`未知 Library 功能：${featureId}`);
    }
    const entryId = FEATURE_ENTRY_IDS[featureId];
    if (entryId === undefined) throw new RangeError(`Library 功能缺少词典条目：${featureId}`);
    activeFilterId = null;
    activeAudience = "learner";
    search.value = "";
    renderDirectory();
    selectedFeatureId = featureId;
    selectEntry(entryId);
    selectedFeatureId = featureId;
    selectedFeatureOverride = featureDefinition;
    const entry = getLibraryEntry(entryId);
    if (entry !== null) {
      const presented = localizeLibraryEntry(entry, locale);
      renderDictionaryDetail(ownerDocument, detail, presented, callbacks, selectEntry, locale, {
        label: english() ? `Open ${presented.title}` : `打开${featureDefinition.title}`,
        pageId: featureDefinition.pageId,
        targetId: featureDefinition.targetId,
      });
    }
  };

  const updateSelection = (): void => {
    for (const button of entryButtons) {
      const active = button.dataset.libraryEntryId === selectedEntryId;
      button.classList.toggle("is-selected", active);
      button.setAttribute("aria-current", active ? "page" : "false");
    }
    for (const button of branchButtons) {
      const active = button.dataset.libraryFilterId === activeFilterId;
      button.classList.toggle("is-selected", active);
      button.setAttribute("aria-current", active ? "true" : "false");
    }
  };

  const selectEntry = (entryId: string): void => {
    assertActive(destroyed);
    const entry = getLibraryEntry(entryId);
    if (entry === null) throw new RangeError(`未知 Library 条目：${entryId}`);
    const nextAudience = entry.audience ?? "learner";
    const audienceChanged = nextAudience === "developer" && activeAudience !== "developer";
    if (audienceChanged) {
      activeAudience = "developer";
      activeFilterId = "help";
    }
    selectedEntryId = entry.id;
    selectedBranchId = entry.branchId;
    selectedFeatureId = featureIdForEntry(entry.id);
    selectedFeatureOverride = null;
    if (audienceChanged) renderDirectory();
    renderDictionaryDetail(
      ownerDocument,
      detail,
      localizeLibraryEntry(entry, locale),
      callbacks,
      selectEntry,
      locale,
    );
    updateSelection();
  };

  const renderDirectory = (preserveSelection = false): void => {
    const query = search.value.trim();
    const filterDefinition = LIBRARY_FILTERS.find(({ id }) => id === activeFilterId);
    const branchIds =
      activeAudience === "developer"
        ? LIBRARY_BRANCHES.map(({ id }) => id)
        : (filterDefinition?.branchIds ?? LEARNER_BRANCH_IDS);
    const audience =
      activeAudience === "developer" ? "developer" : (filterDefinition?.audience ?? activeAudience);
    const searchedEntries = searchLibrary(query, {
      branchIds,
      audiences: [audience],
      limit: 200,
    }).map((result) => result.entry);
    const visible =
      activeFilterId === "examples" && query.length === 0
        ? prioritizeTutorialEntries(searchedEntries)
        : searchedEntries;
    entryButtons = visible.map((entry) => {
      const presented = localizeLibraryEntry(entry, locale);
      const button = ownerDocument.createElement("button");
      button.className = "software-library__feature";
      button.type = "button";
      button.dataset.libraryEntryId = entry.id;
      button.dataset.libraryEntryBranch = entry.branchId;
      const category = ownerDocument.createElement("span");
      category.textContent =
        entry.tutorial === null || entry.tutorial === undefined
          ? shortBranchLabel(entry.branchId, locale)
          : `${english() ? "Tutorial" : "教程"} ${String(entry.tutorial.order)}`;
      const title = ownerDocument.createElement("strong");
      appendHighlightedText(ownerDocument, title, presented.title, query);
      const summary = ownerDocument.createElement("small");
      appendHighlightedText(ownerDocument, summary, presented.summary, query);
      button.append(category, title, summary);
      button.title = presented.summary;
      button.addEventListener("click", () => selectEntry(entry.id));
      return button;
    });
    const entryHeader = ownerDocument.createElement("div");
    entryHeader.className = "software-library__results";
    entryHeader.setAttribute("role", "group");
    entryHeader.setAttribute(
      "aria-label",
      query.length === 0
        ? english()
          ? "Branch directory"
          : "分支目录"
        : english()
          ? "Search results"
          : "搜索结果",
    );
    if (activeFilterId === "examples" && query.length === 0) {
      const tutorialButtons = entryButtons.filter(
        (_button, index) =>
          visible[index]?.tutorial !== null && visible[index]?.tutorial !== undefined,
      );
      const exampleButtons = entryButtons.filter(
        (_button, index) =>
          visible[index]?.tutorial === null || visible[index]?.tutorial === undefined,
      );
      appendDirectoryGroup(
        ownerDocument,
        entryHeader,
        english() ? "Getting started" : "入门路径",
        tutorialButtons,
      );
      appendDirectoryGroup(
        ownerDocument,
        entryHeader,
        english() ? "More examples" : "更多案例",
        exampleButtons,
      );
    } else {
      entryHeader.append(...entryButtons);
    }
    list.replaceChildren(entryHeader);
    resultCount.textContent =
      query.length === 0
        ? english()
          ? `${String(visible.length)} entries`
          : `${String(visible.length)} 条`
        : english()
          ? `${String(visible.length)} matches · ${query}`
          : `${String(visible.length)} 个匹配 · ${query}`;
    if (visible.length === 0) {
      renderEmptyDetail(
        ownerDocument,
        detail,
        english() ? "No matching dictionary entries." : "没有匹配的词典条目。",
      );
    } else if (!visible.some((entry) => entry.id === selectedEntryId)) {
      if (preserveSelection) {
        updateSelection();
        renderSelectedDetail();
      } else selectEntry(visible[0]!.id);
    } else {
      updateSelection();
      renderSelectedDetail();
    }
  };

  function selectFilter(filterId: LibraryFilterId): void {
    assertActive(destroyed);
    const definition = LIBRARY_FILTERS.find(({ id }) => id === filterId);
    if (definition === undefined) throw new RangeError(`未知 Library 筛选：${filterId}`);
    activeFilterId = definition.id;
    activeAudience = definition.audience;
    search.value = "";
    const preferredEntryId = definition.id === "help" ? "manual.library" : null;
    const candidates = searchLibrary("", {
      branchIds: definition.branchIds,
      audiences: [definition.audience],
      limit: 200,
    }).map((result) => result.entry);
    const first =
      (preferredEntryId === null ? null : getLibraryEntry(preferredEntryId)) ??
      (definition.id === "examples" ? prioritizeTutorialEntries(candidates)[0] : candidates[0]);
    if (first === undefined || first === null) {
      throw new Error(`Library 筛选没有条目：${filterId}`);
    }
    selectedBranchId = first.branchId;
    selectedEntryId = first.id;
    selectedFeatureId = featureIdForEntry(first.id);
    selectedFeatureOverride = null;
    renderDirectory();
    renderDictionaryDetail(
      ownerDocument,
      detail,
      localizeLibraryEntry(first, locale),
      callbacks,
      selectEntry,
      locale,
    );
    updateSelection();
  }

  const selectBranch = (branchId: string): void => {
    assertActive(destroyed);
    const resolved = resolveLibraryBranchId(branchId);
    if (resolved === null) throw new RangeError(`未知 Library 分支：${branchId}`);
    const filterDefinition = filterForBranch(resolved);
    if (filterDefinition !== null) {
      selectFilter(filterDefinition.id);
      return;
    }
    if (resolved !== "extension-api") throw new Error(`Library 分支没有可见筛选：${resolved}`);
    activeFilterId = "help";
    activeAudience = "developer";
    search.value = "";
    const first = libraryEntriesForBranch(resolved)[0];
    if (first === undefined) throw new Error(`Library 分支没有条目：${resolved}`);
    renderDirectory();
    selectEntry(first.id);
  };

  const onSearch = (): void => renderDirectory();
  const onSearchKeydown = (event: KeyboardEvent): void => {
    if (event.key !== "ArrowDown") return;
    const first = entryButtons[0];
    if (first === undefined) return;
    event.preventDefault();
    first.focus();
  };
  const onListKeydown = (event: KeyboardEvent): void => {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    const target = event.target;
    if (!(target instanceof HTMLButtonElement)) return;
    const buttons = [...entryButtons];
    const index = buttons.indexOf(target);
    if (index < 0) return;
    event.preventDefault();
    const delta = event.key === "ArrowDown" ? 1 : -1;
    buttons[(index + delta + buttons.length) % buttons.length]?.focus();
  };
  const onActivated = (): void => search.focus({ preventScroll: true });
  const onLocaleChange = (event?: Event): void => {
    const eventLocale = (event as CustomEvent<{ readonly locale?: unknown }> | undefined)?.detail
      ?.locale;
    locale = resolveLibraryLocale(
      eventLocale ??
        localeHost.dataset.locale ??
        documentElement?.dataset.locale ??
        documentElement?.lang,
    );
    root.dataset.locale = locale;
    root.setAttribute("aria-label", english() ? "Software Library" : "软件功能 Library");
    search.placeholder = english() ? "Search keywords, aliases or code" : "搜索关键词、别名或代码";
    search.setAttribute(
      "aria-label",
      english() ? "Search all Library entries" : "全文搜索 Library",
    );
    searchHint.textContent = english() ? "C and algorithm dictionary" : "C 与算法词典";
    filters.setAttribute("aria-label", english() ? "Library categories" : "Library 分类");
    index.setAttribute("aria-label", english() ? "Library entries" : "词条结果");
    for (const button of branchButtons) {
      const definition = LIBRARY_FILTERS.find(({ id }) => id === button.dataset.libraryFilterId);
      if (definition !== undefined)
        button.textContent = english() ? definition.labelEn : definition.label;
    }
    renderDirectory(true);
  };
  const renderSelectedDetail = (): void => {
    const entry = getLibraryEntry(selectedEntryId);
    if (entry === null) return;
    const presented = localizeLibraryEntry(entry, locale);
    const featureDefinition = selectedFeatureOverride;
    const featureLinkOverride =
      featureDefinition === null
        ? null
        : {
            label: english() ? `Open ${presented.title}` : `打开${featureDefinition.title}`,
            pageId: featureDefinition.pageId,
            targetId: featureDefinition.targetId,
          };
    renderDictionaryDetail(
      ownerDocument,
      detail,
      presented,
      callbacks,
      selectEntry,
      locale,
      featureLinkOverride,
    );
  };
  search.addEventListener("input", onSearch);
  search.addEventListener("keydown", onSearchKeydown);
  list.addEventListener("keydown", onListKeydown);
  shell?.addEventListener("software-library-activated", onActivated);
  localeHost.addEventListener("workbench-locale-change", onLocaleChange);
  const MutationObserverConstructor = ownerDocument.defaultView?.MutationObserver;
  const localeObserver =
    MutationObserverConstructor === undefined
      ? null
      : new MutationObserverConstructor(() => onLocaleChange());
  localeObserver?.observe(localeHost, {
    attributes: true,
    attributeFilter: ["data-locale"],
  });
  root.dataset.locale = locale;
  renderDirectory();
  selectEntry(selectedEntryId);

  return Object.freeze({
    element: root,
    get selectedFeatureId(): string {
      return selectedFeatureId;
    },
    get selectedEntryId(): string {
      return selectedEntryId;
    },
    get selectedBranchId(): LibraryBranchId {
      return selectedBranchId;
    },
    select,
    selectEntry,
    selectBranch,
    destroy(): void {
      if (destroyed) return;
      destroyed = true;
      search.removeEventListener("input", onSearch);
      search.removeEventListener("keydown", onSearchKeydown);
      list.removeEventListener("keydown", onListKeydown);
      shell?.removeEventListener("software-library-activated", onActivated);
      localeHost.removeEventListener("workbench-locale-change", onLocaleChange);
      localeObserver?.disconnect();
      entryButtons = [];
      root.remove();
    },
  });
}

function prioritizeTutorialEntries(entries: readonly LibraryEntry[]): readonly LibraryEntry[] {
  const indexed = entries.map((entry, index) => ({ entry, index }));
  return indexed
    .sort((left, right) => {
      const leftOrder = left.entry.tutorial?.order;
      const rightOrder = right.entry.tutorial?.order;
      if (leftOrder !== undefined && rightOrder !== undefined) return leftOrder - rightOrder;
      if (leftOrder !== undefined) return -1;
      if (rightOrder !== undefined) return 1;
      return left.index - right.index;
    })
    .map(({ entry }) => entry);
}

function appendDirectoryGroup(
  ownerDocument: Document,
  host: HTMLElement,
  label: string,
  buttons: readonly HTMLButtonElement[],
): void {
  if (buttons.length === 0) return;
  const group = ownerDocument.createElement("section");
  group.className = "software-library__result-group";
  group.setAttribute("aria-label", label);
  const heading = ownerDocument.createElement("h2");
  heading.textContent = label;
  group.append(heading, ...buttons);
  host.append(group);
}

function appendHighlightedText(
  ownerDocument: Document,
  host: HTMLElement,
  value: string,
  query: string,
): void {
  const terms = [...new Set(query.trim().toLocaleLowerCase().split(/\s+/u).filter(Boolean))];
  if (terms.length === 0) {
    host.textContent = value;
    return;
  }
  const normalized = value.toLocaleLowerCase();
  let cursor = 0;
  while (cursor < value.length) {
    let nextIndex = -1;
    let nextTerm = "";
    for (const term of terms) {
      const index = normalized.indexOf(term, cursor);
      if (index >= 0 && (nextIndex < 0 || index < nextIndex)) {
        nextIndex = index;
        nextTerm = term;
      }
    }
    if (nextIndex < 0) {
      appendPlainText(ownerDocument, host, value.slice(cursor));
      break;
    }
    if (nextIndex > cursor) {
      appendPlainText(ownerDocument, host, value.slice(cursor, nextIndex));
    }
    const mark = ownerDocument.createElement("mark");
    mark.textContent = value.slice(nextIndex, nextIndex + nextTerm.length);
    host.append(mark);
    cursor = nextIndex + nextTerm.length;
  }
}

function appendPlainText(ownerDocument: Document, host: HTMLElement, value: string): void {
  const span = ownerDocument.createElement("span");
  span.className = "software-library__match-text";
  span.textContent = value;
  host.append(span);
}

function renderDictionaryDetail(
  ownerDocument: Document,
  host: HTMLElement,
  entry: LibraryEntry,
  callbacks: SoftwareLibraryCallbacks,
  selectEntry: (entryId: string) => void,
  locale: InterfaceLocale,
  featureLinkOverride: LibraryFeatureLink | null = null,
): void {
  if (entry.tutorial !== null && entry.tutorial !== undefined) {
    if (entry.tutorial.guidedLessonId !== undefined) {
      renderGuidedLessonDetail(ownerDocument, host, entry, callbacks, selectEntry, locale);
      return;
    }
    renderTutorialDetail(
      ownerDocument,
      host,
      entry,
      callbacks,
      selectEntry,
      locale,
      featureLinkOverride,
    );
    return;
  }
  const english = locale === "en";
  const header = ownerDocument.createElement("header");
  const heading = ownerDocument.createElement("h2");
  heading.textContent = entry.title;
  const status = ownerDocument.createElement("span");
  status.className = "software-library__feature-status";
  status.textContent = branchLabel(entry.branchId, locale);
  header.append(heading, status);

  const body = ownerDocument.createElement("div");
  body.className = "software-library__article-body";
  const definitionTitle = ownerDocument.createElement("h3");
  definitionTitle.textContent = english ? "Plain-language definition" : "通俗定义";
  const summary = ownerDocument.createElement("p");
  summary.textContent = entry.summary;
  body.append(definitionTitle, summary);
  for (const paragraphText of entry.details) {
    const paragraph = ownerDocument.createElement("p");
    paragraph.textContent = paragraphText;
    body.append(paragraph);
  }
  appendCodeSection(
    ownerDocument,
    body,
    english ? "Syntax / block form" : "语法 / 积木示意",
    entry.syntax,
    locale,
  );
  appendCodeSection(
    ownerDocument,
    body,
    english ? "Minimal C example" : "最小 C 示例",
    entry.example?.language === "c" ? entry.example : null,
    locale,
  );

  const complexitySection = ownerDocument.createElement("section");
  const complexityTitle = ownerDocument.createElement("h3");
  complexityTitle.textContent = english ? "Complexity" : "复杂度";
  const complexity = ownerDocument.createElement("p");
  complexity.textContent =
    entry.complexity ??
    (entry.branchId === "c-syntax" || entry.branchId === "standard-library"
      ? english
        ? "A syntax form or function has no single complexity by itself; it depends on input size, implementation and the concrete operation."
        : "语法或函数本身没有统一复杂度；以输入规模、实现和具体操作为准。"
      : english
        ? "This entry does not yet provide an independently verifiable complexity claim."
        : "该词条尚未给出可独立验证的复杂度结论。");
  complexitySection.append(complexityTitle, complexity);
  body.append(complexitySection);

  const pitfallsSection = ownerDocument.createElement("section");
  const pitfallsTitle = ownerDocument.createElement("h3");
  pitfallsTitle.textContent = english ? "Common mistakes" : "常见错误";
  const pitfalls = ownerDocument.createElement("ul");
  const pitfallValues =
    entry.pitfalls !== undefined && entry.pitfalls.length > 0
      ? entry.pitfalls
      : [
          english
            ? "Remembering only the name while ignoring preconditions, boundary inputs and failure paths."
            : "只记住名称而忽略前置条件、边界输入和失败路径。",
        ];
  for (const value of pitfallValues) {
    const item = ownerDocument.createElement("li");
    item.textContent = value;
    pitfalls.append(item);
  }
  pitfallsSection.append(pitfallsTitle, pitfalls);
  body.append(pitfallsSection);
  const related = relatedLibraryEntries(entry).filter(
    (relatedEntry) => entry.audience === "developer" || relatedEntry.audience !== "developer",
  );
  if (related.length > 0) {
    const relatedSection = ownerDocument.createElement("section");
    const relatedTitle = ownerDocument.createElement("h3");
    relatedTitle.textContent = english ? "Related concepts" : "相关概念";
    const relatedLinks = ownerDocument.createElement("nav");
    relatedLinks.setAttribute("aria-label", english ? "Related entries" : "相关词条");
    for (const relatedEntry of related) {
      const presentedRelated = localizeLibraryEntry(relatedEntry, locale);
      const button = textButton(ownerDocument, presentedRelated.title, "button button--quiet");
      button.dataset.relatedEntryId = relatedEntry.id;
      button.addEventListener("click", () => selectEntry(relatedEntry.id));
      relatedLinks.append(button);
    }
    relatedSection.append(relatedTitle, relatedLinks);
    body.append(relatedSection);
  }
  if (entry.aliases.length > 0 || entry.keywords.length > 0) {
    const terms = ownerDocument.createElement("p");
    terms.className = "software-library__terms";
    terms.textContent = `${english ? "Also searchable as" : "也可搜索"}：${[
      ...entry.aliases,
      ...entry.keywords,
    ].join(" · ")}`;
    body.append(terms);
  }

  const actions = ownerDocument.createElement("footer");
  const featureLink = featureLinkOverride ?? entry.featureLink;
  if (featureLink !== null) {
    const link = featureLink;
    const open = textButton(ownerDocument, link.label, "button button--primary");
    open.addEventListener("click", () => callbacks.onOpenFeature(link.pageId, link.targetId));
    actions.append(open);
  }
  if (entry.id === "manual.library") {
    const developer = textButton(
      ownerDocument,
      english ? "Developer documentation" : "开发者文档",
      "button button--quiet",
    );
    developer.addEventListener("click", () => selectEntry("extension.registry"));
    actions.append(developer);
    const lesson = textButton(
      ownerDocument,
      english ? "Start the first lesson" : "开始第一课",
      "button button--primary",
    );
    lesson.addEventListener("click", callbacks.onStartGuidedLesson);
    actions.append(lesson);
  }
  host.replaceChildren(header, body, actions);
}

function renderGuidedLessonDetail(
  ownerDocument: Document,
  host: HTMLElement,
  entry: LibraryEntry,
  callbacks: SoftwareLibraryCallbacks,
  selectEntry: (entryId: string) => void,
  locale: InterfaceLocale,
): void {
  const tutorial = entry.tutorial;
  if (tutorial === null || tutorial === undefined || tutorial.guidedLessonId === undefined) return;
  const english = locale === "en";
  const header = ownerDocument.createElement("header");
  const heading = ownerDocument.createElement("h2");
  heading.textContent = entry.title;
  const status = ownerDocument.createElement("span");
  status.className = "software-library__feature-status";
  status.textContent = english
    ? `Interactive course · about ${String(tutorial.estimatedMinutes)} min`
    : `交互课程 · 约 ${String(tutorial.estimatedMinutes)} 分钟`;
  header.append(heading, status);

  const body = ownerDocument.createElement("div");
  body.className = "software-library__article-body software-library__tutorial";
  const summary = ownerDocument.createElement("p");
  summary.textContent = entry.summary;
  body.append(summary);
  for (const paragraphText of entry.details) {
    const paragraph = ownerDocument.createElement("p");
    paragraph.textContent = paragraphText;
    body.append(paragraph);
  }

  const goals = ownerDocument.createElement("section");
  const goalsTitle = ownerDocument.createElement("h3");
  goalsTitle.textContent = english ? "What you will complete" : "你会完成";
  goals.append(goalsTitle, textList(ownerDocument, tutorial.learningGoals));
  body.append(goals);

  const evidence = ownerDocument.createElement("section");
  const evidenceTitle = ownerDocument.createElement("h3");
  evidenceTitle.textContent = english ? "How completion is verified" : "通过方式";
  const evidenceText = ownerDocument.createElement("p");
  evidenceText.textContent = english
    ? "The course verifies real runs, Trace results, valid block connections and regressions in an isolated sandbox. Reading the instructions alone does not advance the task."
    : "课程在独立沙箱中检查真实运行、Trace、合法积木连接和回归结果；只阅读说明不会推进任务。";
  evidence.append(evidenceTitle, evidenceText);
  body.append(evidence);

  if (tutorial.prerequisiteEntryIds.length > 0) {
    const prerequisites = ownerDocument.createElement("section");
    const prerequisitesTitle = ownerDocument.createElement("h3");
    prerequisitesTitle.textContent = english ? "Optional prerequisites" : "可选先修";
    const links = ownerDocument.createElement("nav");
    links.setAttribute("aria-label", english ? "Course prerequisites" : "课程先修概念");
    for (const prerequisiteId of tutorial.prerequisiteEntryIds) {
      const prerequisite = getLibraryEntry(prerequisiteId);
      if (prerequisite === null) continue;
      const presentedPrerequisite = localizeLibraryEntry(prerequisite, locale);
      const button = textButton(ownerDocument, presentedPrerequisite.title, "button button--quiet");
      button.dataset.relatedEntryId = prerequisite.id;
      button.addEventListener("click", () => selectEntry(prerequisite.id));
      links.append(button);
    }
    prerequisites.append(prerequisitesTitle, links);
    body.append(prerequisites);
  }

  const actions = ownerDocument.createElement("footer");
  const start = textButton(
    ownerDocument,
    english ? "Start interactive course" : "开始交互课程",
    "button button--primary",
  );
  start.dataset.guidedLessonId = tutorial.guidedLessonId;
  start.addEventListener("click", callbacks.onStartGuidedLesson);
  actions.append(start);
  host.replaceChildren(header, body, actions);
}

function renderTutorialDetail(
  ownerDocument: Document,
  host: HTMLElement,
  entry: LibraryEntry,
  callbacks: SoftwareLibraryCallbacks,
  selectEntry: (entryId: string) => void,
  locale: InterfaceLocale,
  featureLinkOverride: LibraryFeatureLink | null,
): void {
  const tutorial = entry.tutorial;
  if (tutorial === null || tutorial === undefined) return;
  const english = locale === "en";
  const pathEntries = libraryEntriesForBranch("examples").filter(
    (candidate) => candidate.tutorial?.pathId === tutorial.pathId,
  );
  const header = ownerDocument.createElement("header");
  const heading = ownerDocument.createElement("h2");
  heading.textContent = entry.title;
  const status = ownerDocument.createElement("span");
  status.className = "software-library__feature-status";
  status.textContent = english
    ? `Tutorial ${String(tutorial.order)}/${String(pathEntries.length)} · about ${String(tutorial.estimatedMinutes)} min`
    : `教程 ${String(tutorial.order)}/${String(pathEntries.length)} · 约 ${String(tutorial.estimatedMinutes)} 分钟`;
  header.append(heading, status);

  const body = ownerDocument.createElement("div");
  body.className = "software-library__article-body software-library__tutorial";
  const summary = ownerDocument.createElement("p");
  summary.textContent = entry.summary;
  body.append(summary);
  for (const paragraphText of entry.details) {
    const paragraph = ownerDocument.createElement("p");
    paragraph.textContent = paragraphText;
    body.append(paragraph);
  }

  const goals = ownerDocument.createElement("section");
  const goalsTitle = ownerDocument.createElement("h3");
  goalsTitle.textContent = english ? "Lesson goals" : "本节目标";
  goals.append(goalsTitle, textList(ownerDocument, tutorial.learningGoals));
  body.append(goals);

  if (tutorial.prerequisiteEntryIds.length > 0) {
    const prerequisites = ownerDocument.createElement("section");
    const prerequisitesTitle = ownerDocument.createElement("h3");
    prerequisitesTitle.textContent = english ? "Prerequisites" : "需要先会";
    const prerequisiteLinks = ownerDocument.createElement("nav");
    prerequisiteLinks.setAttribute(
      "aria-label",
      english ? "Tutorial prerequisites" : "教程前置概念",
    );
    for (const prerequisiteId of tutorial.prerequisiteEntryIds) {
      const prerequisite = getLibraryEntry(prerequisiteId);
      if (prerequisite === null) continue;
      const presentedPrerequisite = localizeLibraryEntry(prerequisite, locale);
      const button = textButton(ownerDocument, presentedPrerequisite.title, "button button--quiet");
      button.dataset.relatedEntryId = prerequisite.id;
      button.addEventListener("click", () => selectEntry(prerequisite.id));
      prerequisiteLinks.append(button);
    }
    prerequisites.append(prerequisitesTitle, prerequisiteLinks);
    body.append(prerequisites);
  }

  const stepsSection = ownerDocument.createElement("section");
  const stepsTitle = ownerDocument.createElement("h3");
  stepsTitle.textContent = english ? "Steps" : "操作步骤";
  const steps = ownerDocument.createElement("ol");
  for (const [index, step] of tutorial.steps.entries()) {
    const item = ownerDocument.createElement("li");
    item.className = "software-library__tutorial-step";
    const title = ownerDocument.createElement("h4");
    title.textContent = `${english ? "Step" : "步骤"} ${String(index + 1)} · ${step.title}`;
    const instruction = ownerDocument.createElement("p");
    instruction.textContent = step.instruction;
    item.append(title, instruction);
    for (const artifact of step.artifacts) {
      appendTutorialArtifact(ownerDocument, item, artifact.kind, artifact.example, locale);
    }
    const check = ownerDocument.createElement("p");
    check.className = "software-library__tutorial-check";
    check.textContent = `${english ? "Check" : "检查"}：${step.check}`;
    item.append(check);
    if (step.featureLink !== null) {
      const action = textButton(ownerDocument, step.featureLink.label, "button button--quiet");
      action.dataset.tutorialAction = step.id;
      action.addEventListener("click", () =>
        callbacks.onOpenFeature(step.featureLink!.pageId, step.featureLink!.targetId),
      );
      item.append(action);
    }
    steps.append(item);
  }
  stepsSection.append(stepsTitle, steps);
  body.append(stepsSection);

  const completion = ownerDocument.createElement("section");
  const completionTitle = ownerDocument.createElement("h3");
  completionTitle.textContent = english ? "Completion checks" : "完成检查";
  completion.append(completionTitle, textList(ownerDocument, tutorial.completionChecks));
  body.append(completion);

  const related = relatedLibraryEntries(entry).filter(
    (relatedEntry) => relatedEntry.audience !== "developer",
  );
  if (related.length > 0) {
    const relatedSection = ownerDocument.createElement("section");
    const relatedTitle = ownerDocument.createElement("h3");
    relatedTitle.textContent = english ? "Related concepts" : "相关概念";
    const relatedLinks = ownerDocument.createElement("nav");
    relatedLinks.setAttribute("aria-label", english ? "Related entries" : "相关词条");
    for (const relatedEntry of related) {
      const presentedRelated = localizeLibraryEntry(relatedEntry, locale);
      const button = textButton(ownerDocument, presentedRelated.title, "button button--quiet");
      button.dataset.relatedEntryId = relatedEntry.id;
      button.addEventListener("click", () => selectEntry(relatedEntry.id));
      relatedLinks.append(button);
    }
    relatedSection.append(relatedTitle, relatedLinks);
    body.append(relatedSection);
  }

  const actions = ownerDocument.createElement("footer");
  const featureLink = featureLinkOverride ?? entry.featureLink;
  if (featureLink !== null) {
    const open = textButton(ownerDocument, featureLink.label, "button button--primary");
    open.addEventListener("click", () =>
      callbacks.onOpenFeature(featureLink.pageId, featureLink.targetId),
    );
    actions.append(open);
  }
  host.replaceChildren(header, body, actions);
}

function appendTutorialArtifact(
  ownerDocument: Document,
  host: HTMLElement,
  kind: NonNullable<LibraryEntry["tutorial"]>["steps"][number]["artifacts"][number]["kind"],
  example: NonNullable<LibraryEntry["tutorial"]>["steps"][number]["artifacts"][number]["example"],
  locale: InterfaceLocale,
): void {
  const wrapper = ownerDocument.createElement("div");
  wrapper.className = "software-library__tutorial-artifact";
  const caption = ownerDocument.createElement("p");
  caption.textContent = `${tutorialArtifactLabel(kind, locale)} · ${example.caption}`;
  const pre = ownerDocument.createElement("pre");
  const code = ownerDocument.createElement("code");
  code.dataset.language = example.language;
  code.textContent = example.code;
  pre.append(code);
  wrapper.append(caption, pre);
  host.append(wrapper);
}

function tutorialArtifactLabel(
  kind: NonNullable<LibraryEntry["tutorial"]>["steps"][number]["artifacts"][number]["kind"],
  locale: InterfaceLocale,
): string {
  const english = locale === "en";
  if (kind === "source") return english ? "Full source" : "完整源码";
  if (kind === "snippet") return english ? "Code snippet" : "代码片段";
  if (kind === "stdin") return english ? "Input" : "输入";
  return english ? "Expected output" : "预期输出";
}

function textList(ownerDocument: Document, values: readonly string[]): HTMLElement {
  const list = ownerDocument.createElement("ul");
  for (const value of values) {
    const item = ownerDocument.createElement("li");
    item.textContent = value;
    list.append(item);
  }
  return list;
}

function appendCodeSection(
  ownerDocument: Document,
  host: HTMLElement,
  heading: string,
  example: LibraryEntry["syntax"],
  locale: InterfaceLocale,
): void {
  const section = ownerDocument.createElement("section");
  const title = ownerDocument.createElement("h3");
  title.textContent = heading;
  section.append(title);
  if (example === null || example === undefined) {
    const unavailable = ownerDocument.createElement("p");
    unavailable.textContent =
      locale === "en"
        ? "This concept has no standalone C form that can be used outside its context."
        : "该概念没有一段可脱离上下文单独使用的 C 写法。";
    section.append(unavailable);
  } else {
    const caption = ownerDocument.createElement("p");
    caption.textContent = example.caption;
    const pre = ownerDocument.createElement("pre");
    const code = ownerDocument.createElement("code");
    code.dataset.language = example.language;
    code.textContent = example.code;
    pre.append(code);
    section.append(caption, pre);
  }
  host.append(section);
}

function renderEmptyDetail(ownerDocument: Document, host: HTMLElement, message: string): void {
  const empty = ownerDocument.createElement("p");
  empty.className = "software-library__empty";
  empty.textContent = message;
  host.replaceChildren(empty);
}

function feature(
  id: string,
  category: string,
  title: string,
  pageId: string,
  targetId: string,
  status: SoftwareFeatureStatus,
  content: Pick<
    SoftwareFeatureDefinition,
    "purpose" | "useWhen" | "currentCapability" | "limitation" | "extensionPoints"
  >,
): SoftwareFeatureDefinition {
  return Object.freeze({
    id,
    category,
    title,
    pageId,
    targetId,
    status,
    ...content,
    extensionPoints: Object.freeze([...content.extensionPoints]),
  });
}

function filter(
  id: Exclude<LibraryFilterId, "help">,
  label: string,
  labelEn: string,
  branchId: LibraryBranchId,
): LibraryFilterDefinition {
  return Object.freeze({
    id,
    label,
    labelEn,
    branchId,
    branchIds: Object.freeze([branchId]),
    audience: "learner",
  });
}

function filterForBranch(branchId: LibraryBranchId): LibraryFilterDefinition | null {
  if (HELP_BRANCH_IDS.includes(branchId)) {
    return LIBRARY_FILTERS.find(({ id }) => id === "help") ?? null;
  }
  return LIBRARY_FILTERS.find((definition) => definition.branchIds.includes(branchId)) ?? null;
}

function featureIdForEntry(entryId: string): string {
  return (
    Object.entries(FEATURE_ENTRY_IDS).find(([, mappedEntryId]) => mappedEntryId === entryId)?.[0] ??
    ""
  );
}

function shortBranchLabel(branchId: LibraryBranchId, locale: InterfaceLocale): string {
  const labels: Readonly<Record<LibraryBranchId, readonly [string, string]>> = Object.freeze({
    manual: ["手册", "Manual"],
    "canvas-wires": ["画布", "Canvas"],
    "execution-diagnostics": ["运行", "Run"],
    "c-syntax": ["C", "C"],
    "standard-library": ["标准库", "Standard Library"],
    "data-structure-dictionary": ["结构", "Structures"],
    "algorithms-complexity": ["算法", "Algorithms"],
    examples: ["案例", "Examples"],
    recovery: ["恢复", "Recovery"],
    "extension-api": ["扩展", "Extensions"],
    onboarding: ["引导", "Guide"],
  });
  return labels[branchId][locale === "en" ? 1 : 0];
}

function branchLabel(branchId: LibraryBranchId, locale: InterfaceLocale): string {
  const labels: Readonly<Record<LibraryBranchId, readonly [string, string]>> = Object.freeze({
    manual: ["软件手册", "Software Manual"],
    "canvas-wires": ["画布与连线", "Canvas and Wires"],
    "execution-diagnostics": ["运行与诊断", "Execution and Diagnostics"],
    "c-syntax": ["C 语法词典", "C Syntax Dictionary"],
    "standard-library": ["标准库词典", "Standard Library Dictionary"],
    "data-structure-dictionary": ["数据结构词典", "Data Structure Dictionary"],
    "algorithms-complexity": ["算法与复杂度", "Algorithms and Complexity"],
    examples: ["案例", "Examples"],
    recovery: ["故障恢复", "Recovery"],
    "extension-api": ["扩展开发", "Extension Development"],
    onboarding: ["新手引导", "Getting Started"],
  });
  return labels[branchId][locale === "en" ? 1 : 0];
}

function resolveLibraryLocale(value: unknown): InterfaceLocale {
  return typeof value === "string" && value.toLocaleLowerCase().startsWith("en") ? "en" : "zh-CN";
}

function statusLabel(status: SoftwareFeatureStatus): string {
  if (status === "available") return "已实现";
  if (status === "foundation") return "扩展地基";
  return "规划";
}

function textButton(ownerDocument: Document, label: string, className: string): HTMLButtonElement {
  const button = ownerDocument.createElement("button");
  button.className = className;
  button.type = "button";
  button.textContent = label;
  return button;
}

function assertCallbacks(callbacks: SoftwareLibraryCallbacks): void {
  if (
    typeof callbacks.onOpenFeature !== "function" ||
    typeof callbacks.onStartGuidedLesson !== "function"
  ) {
    throw new TypeError("Software Library callbacks 无效");
  }
}

function assertActive(destroyed: boolean): void {
  if (destroyed) throw new Error("Software Library 已销毁");
}
