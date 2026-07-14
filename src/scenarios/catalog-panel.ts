import type { AlgorithmScenarioFamily } from "../mentor/index.js";
import type { InterfaceLocale } from "../shared/interface-locale.js";
import { emptyCustomScenarioDraft, type ScenarioCatalogStore } from "./catalog.js";
import type {
  CustomScenarioCaseDraft,
  CustomScenarioDraft,
  ScenarioCatalogEntry,
} from "./contracts.js";

const FAMILIES: readonly AlgorithmScenarioFamily[] = Object.freeze([
  "sorting",
  "searching",
  "recursion",
  "linked-list",
  "tree",
  "graph",
  "dynamic-programming",
]);

const COPY = Object.freeze({
  "zh-CN": Object.freeze({
    rootAria: "项目案例目录",
    heading: "案例目录",
    create: "新建",
    copy: "复制",
    delete: "删除",
    more: "更多",
    listAria: "内置与自定义案例",
    builtinMeta: "内置 · 只读",
    customMeta: (n: number) => `自定义 · ${String(n)} 个输入`,
    empty: "尚无案例。新建一个项目案例开始。",
    builtinStatus: "内置场景只读；可复制为自定义版本。",
    customStatus: "自定义场景",
    created: "已创建自定义场景；请填写输入与期望结果。",
    builtinCopied: "内置场景已复制为可编辑的项目场景。",
    customCopied: "自定义场景副本已创建。",
    scenarioDeleted: "自定义场景已删除。",
    saved: "场景已校验并保存到项目目录。",
    caseCreated: "已新增输入案例。",
    caseCopied: "输入案例副本已创建。",
    caseDeleted: "输入案例已删除。",
    readonlyNotice: "内置场景只读。点击“复制”后编辑项目副本。",
    name: "名称",
    description: "说明",
    family: "算法分类",
    inputModel: "输入模型",
    minimum: "最小规模",
    maximum: "最大规模",
    defaults: "默认规模（逗号分隔）",
    validation: "输入与验证",
    caseAria: "输入案例",
    addCase: "新增输入",
    copyCase: "复制输入",
    deleteCase: "删除输入",
    caseName: "输入名称",
    caseSize: "规模 n",
    args: "args（每行一项）",
    expected: "期望 stdout",
    explanation: "期望结果说明",
    target: "目标分支 edge id（可空）",
    save: "保存",
    newScenario: "新建场景",
    newCase: (n: number) => `案例 ${String(n)}`,
    confirmScenario: (label: string) => `删除场景“${label}”及其全部输入？`,
    confirmCase: (label: string) => `删除输入“${label}”？`,
    notSaved: (detail: string) => `未保存：${detail}`,
  }),
  en: Object.freeze({
    rootAria: "Project scenario catalog",
    heading: "Scenario Catalog",
    create: "New",
    copy: "Copy",
    delete: "Delete",
    more: "More",
    listAria: "Built-in and custom scenarios",
    builtinMeta: "Built-in · Read only",
    customMeta: (n: number) => `Custom · ${String(n)} inputs`,
    empty: "No scenarios yet. Create a project scenario to begin.",
    builtinStatus: "Built-in scenarios are read only. Copy one to edit it.",
    customStatus: "Custom scenario",
    created: "Custom scenario created. Add input and expected output.",
    builtinCopied: "Built-in scenario copied to an editable project scenario.",
    customCopied: "Custom scenario copy created.",
    scenarioDeleted: "Custom scenario deleted.",
    saved: "Scenario validated and saved to the project.",
    caseCreated: "Input case added.",
    caseCopied: "Input case copy created.",
    caseDeleted: "Input case deleted.",
    readonlyNotice: "Built-in scenarios are read only. Select Copy to edit a project copy.",
    name: "Name",
    description: "Description",
    family: "Algorithm family",
    inputModel: "Input model",
    minimum: "Minimum size",
    maximum: "Maximum size",
    defaults: "Default sizes (comma-separated)",
    validation: "Input and validation",
    caseAria: "Input case",
    addCase: "Add input",
    copyCase: "Copy input",
    deleteCase: "Delete input",
    caseName: "Input name",
    caseSize: "Size n",
    args: "args (one per line)",
    expected: "Expected stdout",
    explanation: "Expected result notes",
    target: "Target branch edge id (optional)",
    save: "Save",
    newScenario: "New scenario",
    newCase: (n: number) => `Case ${String(n)}`,
    confirmScenario: (label: string) => `Delete scenario “${label}” and all of its inputs?`,
    confirmCase: (label: string) => `Delete input “${label}”?`,
    notSaved: (_detail: string) => "Not saved. Check the scenario fields and try again.",
  }),
});

const BUILTIN_ENGLISH: Readonly<Record<string, readonly [string, string, string]>> = Object.freeze({
  "scenario.sorting.integers": [
    "Integer sorting",
    "Read descending integers and print them in ascending order.",
    "The first value is n, followed by n integers in descending order.",
  ],
  "scenario.searching.linear": [
    "Linear search",
    "Search for the final value in an increasing integer sequence.",
    "The first line contains n and the target; the second contains n increasing integers.",
  ],
  "scenario.searching.maximum": [
    "Maximum scan",
    "Scan integers, including negative values, and print the maximum.",
    "The first value is count, followed by count integers.",
  ],
  "scenario.searching.minimum": [
    "Minimum scan",
    "Scan positive and negative integers and print the minimum.",
    "The first value is count, followed by count integers.",
  ],
  "scenario.recursion.factorial": [
    "Recursive factorial",
    "Calculate the factorial of a small non-negative integer.",
    "stdin contains n; the range avoids overflow in the sample.",
  ],
  "scenario.linked-list.reverse": [
    "Reverse linked-list traversal",
    "Build a linked list in input order and print it in reverse.",
    "The first value is the node count, followed by the node values.",
  ],
  "scenario.tree.inorder": [
    "Binary search tree inorder traversal",
    "Traverse a binary search tree in inorder.",
    "The first value is the key count, followed by distinct integer keys in deterministic interleaved order.",
  ],
  "scenario.graph.bfs-chain": [
    "Chain graph BFS",
    "Breadth-first traverse an undirected chain starting at 0.",
    "The first line contains vertex and edge counts, followed by one undirected edge per line.",
  ],
  "scenario.dynamic-programming.fibonacci": [
    "Dynamic-programming Fibonacci",
    "Calculate Fibonacci values from the bottom up.",
    "stdin contains n; the maximum fits a signed 32-bit example.",
  ],
});

export interface ScenarioCatalogPanelOptions {
  readonly store: ScenarioCatalogStore;
  readonly localeHost?: HTMLElement | undefined;
  readonly confirmDelete?: ((label: string) => boolean | Promise<boolean>) | undefined;
  readonly onSelectionChange?:
    ((scenarioId: string | null, caseId: string | null) => void) | undefined;
}

export interface ScenarioCatalogPanel {
  readonly element: HTMLElement;
  selectScenario(id: string): void;
  selectCase(id: string): void;
  refresh(): void;
  destroy(): void;
}

interface EditorFields {
  readonly form: HTMLFormElement;
  readonly label: HTMLInputElement;
  readonly description: HTMLTextAreaElement;
  readonly family: HTMLSelectElement;
  readonly inputModel: HTMLInputElement;
  readonly minimum: HTMLInputElement;
  readonly maximum: HTMLInputElement;
  readonly defaults: HTMLInputElement;
  readonly caseSelect: HTMLSelectElement;
  readonly caseLabel: HTMLInputElement;
  readonly caseSize: HTMLInputElement;
  readonly stdin: HTMLTextAreaElement;
  readonly args: HTMLTextAreaElement;
  readonly expected: HTMLTextAreaElement;
  readonly explanation: HTMLTextAreaElement;
  readonly target: HTMLInputElement;
  readonly save: HTMLButtonElement;
  readonly addCase: HTMLButtonElement;
  readonly copyCase: HTMLButtonElement;
  readonly deleteCase: HTMLButtonElement;
}

export function createScenarioCatalogPanel(
  host: HTMLElement,
  options: ScenarioCatalogPanelOptions,
): ScenarioCatalogPanel {
  const document = host.ownerDocument;
  const localeHost = options.localeHost ?? host;
  let locale: InterfaceLocale = localeHost.dataset.locale === "en" ? "en" : "zh-CN";
  const copy = () => COPY[locale];
  const root = document.createElement("section");
  root.className = "scenario-catalog";
  root.setAttribute("aria-label", copy().rootAria);

  const toolbar = document.createElement("header");
  toolbar.className = "scenario-catalog__toolbar";
  const heading = document.createElement("h2");
  heading.textContent = copy().heading;
  const createButton = actionButton(document, copy().create, "new");
  const copyButton = actionButton(document, copy().copy, "copy");
  const deleteButton = actionButton(document, copy().delete, "delete");
  const moreActions = document.createElement("details");
  moreActions.className = "scenario-catalog__more-actions";
  const moreSummary = document.createElement("summary");
  moreSummary.textContent = copy().more;
  moreActions.append(moreSummary, deleteButton);
  toolbar.append(heading, createButton, copyButton, moreActions);

  const body = document.createElement("div");
  body.className = "scenario-catalog__body";
  const list = document.createElement("nav");
  list.className = "scenario-catalog__list";
  list.setAttribute("aria-label", copy().listAria);
  const editor = document.createElement("div");
  editor.className = "scenario-catalog__editor";
  const status = document.createElement("output");
  status.className = "scenario-catalog__status";
  status.setAttribute("aria-live", "polite");
  body.append(list, editor);
  root.append(toolbar, body, status);
  host.replaceChildren(root);

  let destroyed = false;
  let selectedScenarioId: string | null = options.store.list()[0]?.id ?? null;
  let selectedCaseId: string | null = null;
  let editorFields: EditorFields | null = null;

  const selectedEntry = (): ScenarioCatalogEntry | null =>
    selectedScenarioId === null ? null : options.store.get(selectedScenarioId);

  const announceSelection = (): void => {
    options.onSelectionChange?.(selectedScenarioId, selectedCaseId);
  };

  const renderList = (): void => {
    list.replaceChildren();
    for (const entry of options.store.list()) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "scenario-catalog__item";
      button.dataset.scenarioId = entry.id;
      button.dataset.origin = entry.origin;
      button.setAttribute("aria-current", String(entry.id === selectedScenarioId));
      const name = document.createElement("strong");
      name.textContent = displayScenarioText(entry, "label", locale);
      const meta = document.createElement("small");
      meta.textContent = entry.readOnly
        ? copy().builtinMeta
        : copy().customMeta(entry.cases.length);
      button.append(name, meta);
      button.addEventListener("click", () => selectScenario(entry.id));
      list.append(button);
    }
  };

  const renderEditor = (): void => {
    const entry = selectedEntry();
    editor.replaceChildren();
    editorFields = null;
    copyButton.disabled = entry === null;
    deleteButton.disabled = entry === null || entry.readOnly;
    if (entry === null) {
      const empty = document.createElement("p");
      empty.textContent = copy().empty;
      editor.append(empty);
      selectedCaseId = null;
      return;
    }
    const cases = entry.cases;
    if (!cases.some((item) => item.id === selectedCaseId)) selectedCaseId = cases[0]?.id ?? null;
    const currentCase = cases.find((item) => item.id === selectedCaseId) ?? null;
    const fields = createEditorFields(document, entry, currentCase?.id ?? null, locale);
    editorFields = fields;
    editor.append(fields.form);
    fields.caseSelect.addEventListener("change", () => selectCase(fields.caseSelect.value));
    fields.form.addEventListener("submit", (event) => {
      event.preventDefault();
      saveCurrent();
    });
    fields.addCase.addEventListener("click", addCase);
    fields.copyCase.addEventListener("click", copyCase);
    fields.deleteCase.addEventListener("click", () => void deleteCase());
  };

  const render = (): void => {
    assertAlive(destroyed);
    if (selectedScenarioId !== null && options.store.get(selectedScenarioId) === null) {
      selectedScenarioId = options.store.list()[0]?.id ?? null;
    }
    renderList();
    renderEditor();
  };

  const selectScenario = (id: string): void => {
    assertAlive(destroyed);
    const entry = options.store.get(id);
    if (entry === null) throw new RangeError(`未知场景：${id}`);
    selectedScenarioId = id;
    selectedCaseId = entry.cases[0]?.id ?? null;
    status.textContent = entry.readOnly ? copy().builtinStatus : copy().customStatus;
    render();
    announceSelection();
  };

  const selectCase = (id: string): void => {
    assertAlive(destroyed);
    const entry = selectedEntry();
    if (entry === null || !entry.cases.some((item) => item.id === id)) {
      throw new RangeError(`未知案例：${id}`);
    }
    selectedCaseId = id;
    renderEditor();
    announceSelection();
  };

  const createScenario = (): void => {
    try {
      const created = options.store.createScenario(localizedEmptyScenarioDraft(locale));
      selectedScenarioId = created.id;
      selectedCaseId = created.cases[0]?.id ?? null;
      status.textContent = copy().created;
      render();
      announceSelection();
    } catch (error) {
      showError(status, error, locale);
    }
  };

  const copyScenario = (): void => {
    const entry = selectedEntry();
    if (entry === null) return;
    try {
      const created = options.store.duplicateScenario(entry.id);
      selectedScenarioId = created.id;
      selectedCaseId = created.cases[0]?.id ?? null;
      status.textContent = entry.readOnly ? copy().builtinCopied : copy().customCopied;
      render();
      announceSelection();
    } catch (error) {
      showError(status, error, locale);
    }
  };

  const deleteScenario = async (): Promise<void> => {
    const entry = selectedEntry();
    if (entry === null || entry.readOnly) return;
    if (
      !(await confirmDelete(
        options,
        copy().confirmScenario(displayScenarioText(entry, "label", locale)),
      ))
    )
      return;
    try {
      options.store.deleteScenario(entry.id);
      selectedScenarioId = options.store.list()[0]?.id ?? null;
      selectedCaseId = null;
      status.textContent = copy().scenarioDeleted;
      render();
      announceSelection();
    } catch (error) {
      showError(status, error, locale);
    }
  };

  const saveCurrent = (): void => {
    const entry = selectedEntry();
    const fields = editorFields;
    if (entry === null || entry.readOnly || fields === null || selectedCaseId === null) return;
    try {
      const cases = entry.cases.map((item) =>
        item.id === selectedCaseId ? readCaseDraft(fields) : caseDraftFromEntry(item),
      );
      const updated = options.store.updateScenario(entry.id, readScenarioDraft(fields, cases));
      selectedCaseId = updated.cases.find((item) => item.id === selectedCaseId)?.id ?? null;
      status.textContent = copy().saved;
      render();
      announceSelection();
    } catch (error) {
      showError(status, error, locale);
    }
  };

  const addCase = (): void => {
    const entry = selectedEntry();
    if (entry === null || entry.readOnly) return;
    try {
      const size = firstAvailableSize(entry);
      const created = options.store.createCase(entry.id, {
        label: copy().newCase(entry.cases.length + 1),
        size,
        stdin: "",
        arguments: Object.freeze([]),
        expectedStdout: "",
        explanation: "",
        targetBranchId: null,
      });
      selectedCaseId = created.id;
      status.textContent = copy().caseCreated;
      render();
      announceSelection();
    } catch (error) {
      showError(status, error, locale);
    }
  };

  const copyCase = (): void => {
    const entry = selectedEntry();
    if (entry === null || entry.readOnly || selectedCaseId === null) return;
    try {
      const created = options.store.duplicateCase(entry.id, selectedCaseId);
      selectedCaseId = created.id;
      status.textContent = copy().caseCopied;
      render();
      announceSelection();
    } catch (error) {
      showError(status, error, locale);
    }
  };

  const deleteCase = async (): Promise<void> => {
    const entry = selectedEntry();
    const item = entry?.cases.find((candidate) => candidate.id === selectedCaseId);
    if (entry === null || entry.readOnly || item === undefined) return;
    if (!(await confirmDelete(options, copy().confirmCase(displayCaseLabel(entry, item, locale)))))
      return;
    try {
      options.store.deleteCase(entry.id, item.id);
      selectedCaseId = options.store.get(entry.id)?.cases[0]?.id ?? null;
      status.textContent = copy().caseDeleted;
      render();
      announceSelection();
    } catch (error) {
      showError(status, error, locale);
    }
  };

  const onCreate = (): void => createScenario();
  const onCopy = (): void => copyScenario();
  const onDelete = (): void => void deleteScenario();
  const renderStaticCopy = (): void => {
    root.setAttribute("aria-label", copy().rootAria);
    heading.textContent = copy().heading;
    createButton.textContent = copy().create;
    copyButton.textContent = copy().copy;
    deleteButton.textContent = copy().delete;
    moreSummary.textContent = copy().more;
    list.setAttribute("aria-label", copy().listAria);
  };
  const onLocaleChange = (): void => {
    const next: InterfaceLocale = localeHost.dataset.locale === "en" ? "en" : "zh-CN";
    if (next === locale) return;
    locale = next;
    status.textContent = "";
    renderStaticCopy();
    render();
  };
  createButton.addEventListener("click", onCreate);
  copyButton.addEventListener("click", onCopy);
  deleteButton.addEventListener("click", onDelete);
  localeHost.addEventListener("workbench-locale-change", onLocaleChange);
  render();

  return Object.freeze({
    element: root,
    selectScenario,
    selectCase,
    refresh: render,
    destroy(): void {
      if (destroyed) return;
      destroyed = true;
      createButton.removeEventListener("click", onCreate);
      copyButton.removeEventListener("click", onCopy);
      deleteButton.removeEventListener("click", onDelete);
      localeHost.removeEventListener("workbench-locale-change", onLocaleChange);
      root.remove();
    },
  });
}

function createEditorFields(
  document: Document,
  entry: ScenarioCatalogEntry,
  selectedCaseId: string | null,
  locale: InterfaceLocale,
): EditorFields {
  const copy = COPY[locale];
  const readonly = entry.readOnly;
  const item = entry.cases.find((candidate) => candidate.id === selectedCaseId) ?? entry.cases[0];
  const form = document.createElement("form");
  form.className = "scenario-catalog__form";
  const readonlyNotice = document.createElement("p");
  readonlyNotice.className = "scenario-catalog__readonly";
  readonlyNotice.hidden = !readonly;
  readonlyNotice.textContent = copy.readonlyNotice;
  const label = inputField(document, form, copy.name, displayScenarioText(entry, "label", locale));
  const description = textareaField(
    document,
    form,
    copy.description,
    displayScenarioText(entry, "description", locale),
  );
  const family = selectField(document, form, copy.family, FAMILIES, entry.definition.family);
  const inputModel = inputField(
    document,
    form,
    copy.inputModel,
    displayScenarioText(entry, "inputModel", locale),
  );
  const minimum = numberField(document, form, copy.minimum, entry.definition.sizeGenerator.minimum);
  const maximum = numberField(document, form, copy.maximum, entry.definition.sizeGenerator.maximum);
  const defaults = inputField(
    document,
    form,
    copy.defaults,
    entry.definition.sizeGenerator.defaultSizes.join(", "),
  );

  const caseHeading = document.createElement("h3");
  caseHeading.textContent = copy.validation;
  const caseSelect = document.createElement("select");
  caseSelect.setAttribute("aria-label", copy.caseAria);
  caseSelect.dataset.scenarioField = copy.caseAria;
  for (const candidate of entry.cases) {
    const option = document.createElement("option");
    option.value = candidate.id;
    option.textContent = `${displayCaseLabel(entry, candidate, locale)} · n=${String(candidate.runCase.size)}`;
    caseSelect.append(option);
  }
  caseSelect.value = item?.id ?? "";
  const caseActions = document.createElement("div");
  caseActions.className = "scenario-catalog__case-actions";
  const addCase = actionButton(document, copy.addCase, "add-case");
  const copyCase = actionButton(document, copy.copyCase, "copy-case");
  const deleteCase = actionButton(document, copy.deleteCase, "delete-case");
  const caseMore = document.createElement("details");
  caseMore.className = "scenario-catalog__more-actions";
  const caseMoreSummary = document.createElement("summary");
  caseMoreSummary.textContent = copy.more;
  caseMore.append(caseMoreSummary, deleteCase);
  caseActions.append(caseSelect, addCase, copyCase, caseMore);
  form.append(caseHeading, caseActions);

  const caseLabel = inputField(
    document,
    form,
    copy.caseName,
    item === undefined ? "" : displayCaseLabel(entry, item, locale),
  );
  const caseSize = numberField(document, form, copy.caseSize, item?.runCase.size ?? 1);
  const stdin = textareaField(document, form, "stdin", item?.runCase.stdin ?? "");
  const args = textareaField(document, form, copy.args, item?.runCase.arguments.join("\n") ?? "");
  const expected = textareaField(
    document,
    form,
    copy.expected,
    item?.runCase.expected.stdout ?? "",
  );
  const explanation = textareaField(
    document,
    form,
    copy.explanation,
    displayExpectedExplanation(entry, item?.runCase.expected.explanation ?? "", locale),
  );
  const target = inputField(document, form, copy.target, item?.targetBranchId ?? "");
  const save = actionButton(document, copy.save, "save");
  save.type = "submit";
  form.append(readonlyNotice, save);

  for (const control of [
    label,
    description,
    family,
    inputModel,
    minimum,
    maximum,
    defaults,
    caseLabel,
    caseSize,
    stdin,
    args,
    expected,
    explanation,
    target,
    save,
    addCase,
    copyCase,
    deleteCase,
  ]) {
    control.disabled = readonly;
  }
  return {
    form,
    label,
    description,
    family,
    inputModel,
    minimum,
    maximum,
    defaults,
    caseSelect,
    caseLabel,
    caseSize,
    stdin,
    args,
    expected,
    explanation,
    target,
    save,
    addCase,
    copyCase,
    deleteCase,
  };
}

function readScenarioDraft(
  fields: EditorFields,
  cases: readonly CustomScenarioCaseDraft[],
): CustomScenarioDraft {
  return Object.freeze({
    label: fields.label.value.trim(),
    description: fields.description.value.trim(),
    family: fields.family.value as AlgorithmScenarioFamily,
    inputModel: fields.inputModel.value.trim(),
    minimumSize: Number(fields.minimum.value),
    maximumSize: Number(fields.maximum.value),
    defaultSizes: Object.freeze(
      fields.defaults.value
        .split(",")
        .map((item) => Number(item.trim()))
        .filter((item) => Number.isFinite(item)),
    ),
    cases: Object.freeze([...cases]),
  });
}

function readCaseDraft(fields: EditorFields): CustomScenarioCaseDraft {
  return Object.freeze({
    label: fields.caseLabel.value.trim(),
    size: Number(fields.caseSize.value),
    stdin: fields.stdin.value,
    arguments: Object.freeze(fields.args.value.length === 0 ? [] : fields.args.value.split("\n")),
    expectedStdout: fields.expected.value,
    explanation: fields.explanation.value.trim(),
    targetBranchId: fields.target.value.trim() || null,
  });
}

function caseDraftFromEntry(item: ScenarioCatalogEntry["cases"][number]): CustomScenarioCaseDraft {
  return Object.freeze({
    label: item.label,
    size: item.runCase.size,
    stdin: item.runCase.stdin,
    arguments: item.runCase.arguments,
    expectedStdout: item.runCase.expected.stdout,
    explanation: item.runCase.expected.explanation,
    targetBranchId: item.targetBranchId,
  });
}

function localizedEmptyScenarioDraft(locale: InterfaceLocale): CustomScenarioDraft {
  const draft = emptyCustomScenarioDraft();
  if (locale !== "en") return draft;
  return Object.freeze({
    ...draft,
    label: COPY.en.newScenario,
    cases: Object.freeze(
      draft.cases.map((item, index) =>
        Object.freeze({ ...item, label: COPY.en.newCase(index + 1) }),
      ),
    ),
  });
}

function displayScenarioText(
  entry: ScenarioCatalogEntry,
  field: "label" | "description" | "inputModel",
  locale: InterfaceLocale,
): string {
  const raw =
    field === "label"
      ? entry.definition.label
      : field === "description"
        ? entry.definition.description
        : entry.definition.sizeGenerator.inputModel;
  if (locale !== "en") return raw;
  const builtin = BUILTIN_ENGLISH[entry.id];
  if (builtin !== undefined)
    return builtin[field === "label" ? 0 : field === "description" ? 1 : 2];
  return localizeGeneratedScenarioText(raw);
}

function displayCaseLabel(
  entry: ScenarioCatalogEntry,
  item: ScenarioCatalogEntry["cases"][number],
  locale: InterfaceLocale,
): string {
  if (locale !== "en") return item.label;
  if (entry.readOnly) return `Size ${String(item.runCase.size)}`;
  return localizeGeneratedScenarioText(item.label);
}

function displayExpectedExplanation(
  entry: ScenarioCatalogEntry,
  value: string,
  locale: InterfaceLocale,
): string {
  if (locale !== "en") return value;
  if (entry.readOnly || value === "输出必须与该确定性情景的预期结果逐字节一致。") {
    return "Output must exactly match the expected result for this deterministic scenario.";
  }
  return value;
}

function localizeGeneratedScenarioText(value: string): string {
  const exact: Readonly<Record<string, string>> = Object.freeze({
    新建场景: "New scenario",
    整数排序: "Integer sorting",
    线性搜索: "Linear search",
    线性扫描最大值: "Maximum scan",
    线性扫描最小值: "Minimum scan",
    递归阶乘: "Recursive factorial",
    链表逆序遍历: "Reverse linked-list traversal",
    二叉搜索树中序遍历: "Binary search tree inorder traversal",
    "链式图 BFS": "Chain graph BFS",
    "动态规划 Fibonacci": "Dynamic-programming Fibonacci",
    "读取一组逆序整数并输出升序结果。":
      "Read descending integers and print them in ascending order.",
    "第一项是 n，随后 n 个逆序整数。":
      "The first value is n, followed by n integers in descending order.",
    "在递增整数序列中搜索最后一个元素。":
      "Search for the final value in an increasing integer sequence.",
    "第一行是 n 与目标值，第二行是 n 个递增整数。":
      "The first line contains n and the target; the second contains n increasing integers.",
    "线性扫描一组含负数的整数并输出最大值。":
      "Scan integers, including negative values, and print the maximum.",
    "线性扫描一组含正负数的整数并输出最小值。":
      "Scan positive and negative integers and print the minimum.",
    "第一项是 count，随后是 count 个整数。":
      "The first value is count, followed by count integers.",
    "计算小规模非负整数的阶乘。": "Calculate the factorial of a small non-negative integer.",
    "stdin 只包含 n；范围限制避免整数样例溢出。":
      "stdin contains n; the range avoids overflow in the sample.",
    "按输入顺序建立链表，并输出逆序遍历结果。":
      "Build a linked list in input order and print it in reverse.",
    "第一项是节点数，随后是节点值。":
      "The first value is the node count, followed by the node values.",
    "按给定顺序插入不同键，并输出中序遍历。": "Traverse a binary search tree in inorder.",
    "第一项是键数，随后使用确定性交错顺序给出不同整数键。":
      "The first value is the key count, followed by distinct integer keys in deterministic interleaved order.",
    "从 0 开始广度优先遍历一条无向链。":
      "Breadth-first traverse an undirected chain starting at 0.",
    "第一行是顶点数与边数，随后每行一条无向边。":
      "The first line contains vertex and edge counts, followed by one undirected edge per line.",
    "自底向上计算 Fibonacci 数列。": "Calculate Fibonacci values from the bottom up.",
    "stdin 只包含 n；最大值适配 32 位有符号示例。":
      "stdin contains n; the maximum fits a signed 32-bit example.",
  });
  const copied = value.endsWith(" 副本") ? value.slice(0, -3) : null;
  if (copied !== null) return `${localizeGeneratedScenarioText(copied)} copy`;
  const numbered = /^(?:案例|规模)\s+(\d+)$/u.exec(value);
  if (numbered !== null) return `${value.startsWith("案例") ? "Case" : "Size"} ${numbered[1]}`;
  return exact[value] ?? value;
}

function firstAvailableSize(entry: ScenarioCatalogEntry): number {
  const used = new Set(entry.cases.map((item) => item.runCase.size));
  for (
    let size = entry.definition.sizeGenerator.minimum;
    size <= entry.definition.sizeGenerator.maximum;
    size += 1
  ) {
    if (!used.has(size)) return size;
  }
  throw new Error("当前规模范围没有可新增的输入；请先扩大最大规模");
}

function inputField(
  document: Document,
  form: HTMLFormElement,
  label: string,
  value: string,
): HTMLInputElement {
  const input = document.createElement("input");
  input.type = "text";
  input.value = value;
  appendField(document, form, label, input);
  return input;
}

function numberField(
  document: Document,
  form: HTMLFormElement,
  label: string,
  value: number,
): HTMLInputElement {
  const input = document.createElement("input");
  input.type = "number";
  input.min = "1";
  input.step = "1";
  input.value = String(value);
  appendField(document, form, label, input);
  return input;
}

function textareaField(
  document: Document,
  form: HTMLFormElement,
  label: string,
  value: string,
): HTMLTextAreaElement {
  const textarea = document.createElement("textarea");
  textarea.value = value;
  appendField(document, form, label, textarea);
  return textarea;
}

function selectField<T extends string>(
  document: Document,
  form: HTMLFormElement,
  label: string,
  values: readonly T[],
  value: T,
): HTMLSelectElement {
  const select = document.createElement("select");
  for (const item of values) {
    const option = document.createElement("option");
    option.value = item;
    option.textContent = item;
    select.append(option);
  }
  select.value = value;
  appendField(document, form, label, select);
  return select;
}

function appendField(
  document: Document,
  form: HTMLFormElement,
  labelText: string,
  control: HTMLElement,
): void {
  control.dataset.scenarioField = labelText;
  const label = document.createElement("label");
  const text = document.createElement("span");
  text.textContent = labelText;
  label.append(text, control);
  form.append(label);
}

function actionButton(document: Document, label: string, action: string): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = label;
  button.dataset.scenarioAction = action;
  return button;
}

async function confirmDelete(
  options: ScenarioCatalogPanelOptions,
  message: string,
): Promise<boolean> {
  if (options.confirmDelete !== undefined) return options.confirmDelete(message);
  return typeof globalThis.confirm === "function" ? globalThis.confirm(message) : false;
}

function showError(status: HTMLOutputElement, error: unknown, locale: InterfaceLocale): void {
  const detail = error instanceof Error ? error.message : String(error);
  status.textContent = COPY[locale].notSaved(detail);
}

function assertAlive(destroyed: boolean): void {
  if (destroyed) throw new Error("ScenarioCatalogPanel 已销毁");
}
