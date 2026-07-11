import {
  LIBRARY_BRANCHES,
  getLibraryEntry,
  libraryEntriesForBranch,
  relatedLibraryEntries,
  resolveLibraryBranchId,
  searchLibrary,
  type LibraryBranchId,
  type LibraryEntry,
  type LibraryFeatureLink,
} from "../library/index.js";

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
  readonly onStartTour: () => void;
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
    currentCapability:
      "renderer 只持 opaque ID；主进程验证并原子写入，revision 冲突须确认后重载磁盘版本。",
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

export function createSoftwareLibrary(
  host: HTMLElement,
  callbacks: SoftwareLibraryCallbacks,
): SoftwareLibrary {
  assertCallbacks(callbacks);
  const ownerDocument = host.ownerDocument;
  const root = ownerDocument.createElement("section");
  root.className = "software-library-view";
  root.dataset.tourTarget = "software-library-content";
  root.setAttribute("aria-label", "软件功能 Library");

  const index = ownerDocument.createElement("nav");
  index.className = "software-library__index";
  index.setAttribute("aria-label", "功能目录");
  const search = ownerDocument.createElement("input");
  search.type = "search";
  search.className = "software-library__search";
  search.placeholder = "搜索术语、功能或代码";
  search.setAttribute("aria-label", "全文搜索 Library");
  const list = ownerDocument.createElement("div");
  list.className = "software-library__list";
  list.dataset.libraryDirectory = "true";
  index.append(search, list);

  const detail = ownerDocument.createElement("article");
  detail.className = "software-library__detail";
  detail.setAttribute("aria-live", "polite");
  detail.dataset.libraryDetail = "true";
  root.append(index, detail);
  host.append(root);

  let selectedFeatureId = "dashboard";
  let selectedBranchId: LibraryBranchId = "manual";
  let selectedEntryId = "manual.dashboard";
  let destroyed = false;
  let entryButtons: HTMLButtonElement[] = [];
  let branchButtons: HTMLButtonElement[] = [];

  const select = (featureId: string): void => {
    assertActive(destroyed);
    const featureDefinition = SOFTWARE_FEATURES.find((feature) => feature.id === featureId);
    if (featureDefinition === undefined) {
      throw new RangeError(`未知 Library 功能：${featureId}`);
    }
    const entryId = FEATURE_ENTRY_IDS[featureId];
    if (entryId === undefined) throw new RangeError(`Library 功能缺少词典条目：${featureId}`);
    selectedFeatureId = featureId;
    selectEntry(entryId);
    selectedFeatureId = featureId;
    const entry = getLibraryEntry(entryId);
    if (entry !== null) {
      renderDictionaryDetail(ownerDocument, detail, entry, callbacks, selectEntry, {
        label: `打开${featureDefinition.title}`,
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
      const active = button.dataset.libraryBranchId === selectedBranchId;
      button.classList.toggle("is-selected", active);
      button.setAttribute("aria-current", active ? "true" : "false");
    }
  };

  const selectEntry = (entryId: string): void => {
    assertActive(destroyed);
    const entry = getLibraryEntry(entryId);
    if (entry === null) throw new RangeError(`未知 Library 条目：${entryId}`);
    selectedEntryId = entry.id;
    selectedBranchId = entry.branchId;
    selectedFeatureId = featureIdForEntry(entry.id);
    renderDictionaryDetail(ownerDocument, detail, entry, callbacks, selectEntry);
    updateSelection();
  };

  const renderDirectory = (): void => {
    const query = search.value.trim();
    branchButtons = LIBRARY_BRANCHES.map((branch) => {
      const button = ownerDocument.createElement("button");
      button.className = "software-library__feature";
      button.type = "button";
      button.dataset.libraryBranchId = branch.id;
      const order = ownerDocument.createElement("span");
      order.textContent = String(branch.order / 10 + 1).padStart(2, "0");
      const label = ownerDocument.createElement("strong");
      label.textContent = branch.label;
      button.append(order, label);
      button.title = branch.description;
      button.addEventListener("click", () => selectBranch(branch.id));
      return button;
    });

    const visible =
      query.length === 0
        ? libraryEntriesForBranch(selectedBranchId)
        : searchLibrary(query).map((result) => result.entry);
    entryButtons = visible.map((entry) => {
      const button = ownerDocument.createElement("button");
      button.className = "software-library__feature";
      button.type = "button";
      button.dataset.libraryEntryId = entry.id;
      button.dataset.libraryEntryBranch = entry.branchId;
      const category = ownerDocument.createElement("span");
      category.textContent = shortBranchLabel(entry.branchId);
      const title = ownerDocument.createElement("strong");
      title.textContent = entry.title;
      button.append(category, title);
      button.title = entry.summary;
      button.addEventListener("click", () => selectEntry(entry.id));
      return button;
    });
    const branchHeader = ownerDocument.createElement("div");
    branchHeader.setAttribute("role", "group");
    branchHeader.setAttribute("aria-label", "Library 分支");
    branchHeader.append(...branchButtons);
    const entryHeader = ownerDocument.createElement("div");
    entryHeader.setAttribute("role", "group");
    entryHeader.setAttribute("aria-label", query.length === 0 ? "分支目录" : "搜索结果");
    entryHeader.append(...entryButtons);
    list.replaceChildren(branchHeader, entryHeader);
    if (visible.length === 0) renderEmptyDetail(ownerDocument, detail, "没有匹配的词典条目。");
    else if (!visible.some((entry) => entry.id === selectedEntryId))
      selectEntry(visible[0]?.id ?? "");
    else updateSelection();
  };

  const selectBranch = (branchId: string): void => {
    assertActive(destroyed);
    const resolved = resolveLibraryBranchId(branchId);
    if (resolved === null) throw new RangeError(`未知 Library 分支：${branchId}`);
    selectedBranchId = resolved;
    search.value = "";
    const first = libraryEntriesForBranch(resolved)[0];
    if (first === undefined) throw new Error(`Library 分支没有条目：${resolved}`);
    selectedEntryId = first.id;
    selectedFeatureId = featureIdForEntry(first.id);
    renderDirectory();
    renderDictionaryDetail(ownerDocument, detail, first, callbacks, selectEntry);
    updateSelection();
  };

  const onSearch = (): void => renderDirectory();
  search.addEventListener("input", onSearch);
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
      entryButtons = [];
      branchButtons = [];
      root.remove();
    },
  });
}

function renderDictionaryDetail(
  ownerDocument: Document,
  host: HTMLElement,
  entry: LibraryEntry,
  callbacks: SoftwareLibraryCallbacks,
  selectEntry: (entryId: string) => void,
  featureLinkOverride: LibraryFeatureLink | null = null,
): void {
  const header = ownerDocument.createElement("header");
  const heading = ownerDocument.createElement("h2");
  heading.textContent = entry.title;
  const branch = LIBRARY_BRANCHES.find((candidate) => candidate.id === entry.branchId);
  const status = ownerDocument.createElement("span");
  status.className = "software-library__feature-status";
  status.textContent = branch?.label ?? entry.branchId;
  header.append(heading, status);

  const body = ownerDocument.createElement("div");
  body.className = "software-library__article-body";
  const summary = ownerDocument.createElement("p");
  summary.textContent = entry.summary;
  body.append(summary);
  for (const paragraphText of entry.details) {
    const paragraph = ownerDocument.createElement("p");
    paragraph.textContent = paragraphText;
    body.append(paragraph);
  }
  if (entry.aliases.length > 0 || entry.keywords.length > 0) {
    const terms = ownerDocument.createElement("p");
    terms.textContent = `检索词：${[...entry.aliases, ...entry.keywords].join(" · ")}`;
    body.append(terms);
  }
  if (entry.example !== null) {
    const example = ownerDocument.createElement("section");
    const title = ownerDocument.createElement("h3");
    title.textContent = entry.example.caption;
    const pre = ownerDocument.createElement("pre");
    const code = ownerDocument.createElement("code");
    code.dataset.language = entry.example.language;
    code.textContent = entry.example.code;
    pre.append(code);
    example.append(title, pre);
    body.append(example);
  }
  const related = relatedLibraryEntries(entry);
  if (related.length > 0) {
    const relatedSection = ownerDocument.createElement("section");
    const relatedTitle = ownerDocument.createElement("h3");
    relatedTitle.textContent = "交叉链接";
    const relatedLinks = ownerDocument.createElement("nav");
    relatedLinks.setAttribute("aria-label", "相关词条");
    for (const relatedEntry of related) {
      const button = textButton(ownerDocument, relatedEntry.title, "button button--quiet");
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
    const link = featureLink;
    const open = textButton(ownerDocument, link.label, "button button--primary");
    open.addEventListener("click", () => callbacks.onOpenFeature(link.pageId, link.targetId));
    actions.append(open);
  }
  const tour = textButton(ownerDocument, "重新开始视觉引导", "button button--quiet");
  tour.addEventListener("click", callbacks.onStartTour);
  actions.append(tour);
  host.replaceChildren(header, body, actions);
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

function featureIdForEntry(entryId: string): string {
  return (
    Object.entries(FEATURE_ENTRY_IDS).find(([, mappedEntryId]) => mappedEntryId === entryId)?.[0] ??
    ""
  );
}

function shortBranchLabel(branchId: LibraryBranchId): string {
  const labels: Readonly<Record<LibraryBranchId, string>> = Object.freeze({
    manual: "手册",
    "canvas-wires": "画布",
    "execution-diagnostics": "运行",
    "c-syntax": "C",
    "standard-library": "标准库",
    "data-structure-dictionary": "结构",
    "algorithms-complexity": "算法",
    examples: "案例",
    recovery: "恢复",
    "extension-api": "扩展",
    onboarding: "引导",
  });
  return labels[branchId];
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
    typeof callbacks.onStartTour !== "function"
  ) {
    throw new TypeError("Software Library callbacks 无效");
  }
}

function assertActive(destroyed: boolean): void {
  if (destroyed) throw new Error("Software Library 已销毁");
}
