import type { AlgorithmScenarioFamily } from "../mentor/index.js";
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

export interface ScenarioCatalogPanelOptions {
  readonly store: ScenarioCatalogStore;
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
  const root = document.createElement("section");
  root.className = "scenario-catalog";
  root.setAttribute("aria-label", "项目案例目录");

  const toolbar = document.createElement("header");
  toolbar.className = "scenario-catalog__toolbar";
  const heading = document.createElement("h2");
  heading.textContent = "案例目录";
  const createButton = actionButton(document, "新建", "new");
  const copyButton = actionButton(document, "复制", "copy");
  const deleteButton = actionButton(document, "删除", "delete");
  toolbar.append(heading, createButton, copyButton, deleteButton);

  const body = document.createElement("div");
  body.className = "scenario-catalog__body";
  const list = document.createElement("nav");
  list.className = "scenario-catalog__list";
  list.setAttribute("aria-label", "内置与自定义案例");
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
      name.textContent = entry.definition.label;
      const meta = document.createElement("small");
      meta.textContent = entry.readOnly
        ? "内置 · 只读"
        : `自定义 · ${String(entry.cases.length)} 个输入`;
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
      empty.textContent = "尚无案例。新建一个项目案例开始。";
      editor.append(empty);
      selectedCaseId = null;
      return;
    }
    const cases = entry.cases;
    if (!cases.some((item) => item.id === selectedCaseId)) selectedCaseId = cases[0]?.id ?? null;
    const currentCase = cases.find((item) => item.id === selectedCaseId) ?? null;
    const fields = createEditorFields(document, entry, currentCase?.id ?? null);
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
    announceSelection();
  };

  const selectScenario = (id: string): void => {
    assertAlive(destroyed);
    const entry = options.store.get(id);
    if (entry === null) throw new RangeError(`未知场景：${id}`);
    selectedScenarioId = id;
    selectedCaseId = entry.cases[0]?.id ?? null;
    status.textContent = entry.readOnly ? "内置场景只读；可复制为自定义版本。" : "自定义场景";
    render();
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
      const created = options.store.createScenario(emptyCustomScenarioDraft());
      selectedScenarioId = created.id;
      selectedCaseId = created.cases[0]?.id ?? null;
      status.textContent = "已创建自定义场景；请填写输入与期望结果。";
      render();
    } catch (error) {
      showError(status, error);
    }
  };

  const copyScenario = (): void => {
    const entry = selectedEntry();
    if (entry === null) return;
    try {
      const created = options.store.duplicateScenario(entry.id);
      selectedScenarioId = created.id;
      selectedCaseId = created.cases[0]?.id ?? null;
      status.textContent = entry.readOnly
        ? "内置场景已复制为可编辑的项目场景。"
        : "自定义场景副本已创建。";
      render();
    } catch (error) {
      showError(status, error);
    }
  };

  const deleteScenario = async (): Promise<void> => {
    const entry = selectedEntry();
    if (entry === null || entry.readOnly) return;
    if (!(await confirmDelete(options, `删除场景“${entry.definition.label}”及其全部输入？`)))
      return;
    try {
      options.store.deleteScenario(entry.id);
      selectedScenarioId = options.store.list()[0]?.id ?? null;
      selectedCaseId = null;
      status.textContent = "自定义场景已删除。";
      render();
    } catch (error) {
      showError(status, error);
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
      status.textContent = "场景已校验并保存到项目目录。";
      render();
    } catch (error) {
      showError(status, error);
    }
  };

  const addCase = (): void => {
    const entry = selectedEntry();
    if (entry === null || entry.readOnly) return;
    try {
      const size = firstAvailableSize(entry);
      const created = options.store.createCase(entry.id, {
        label: `案例 ${String(entry.cases.length + 1)}`,
        size,
        stdin: "",
        arguments: Object.freeze([]),
        expectedStdout: "",
        explanation: "",
        targetBranchId: null,
      });
      selectedCaseId = created.id;
      status.textContent = "已新增输入案例。";
      render();
    } catch (error) {
      showError(status, error);
    }
  };

  const copyCase = (): void => {
    const entry = selectedEntry();
    if (entry === null || entry.readOnly || selectedCaseId === null) return;
    try {
      const created = options.store.duplicateCase(entry.id, selectedCaseId);
      selectedCaseId = created.id;
      status.textContent = "输入案例副本已创建。";
      render();
    } catch (error) {
      showError(status, error);
    }
  };

  const deleteCase = async (): Promise<void> => {
    const entry = selectedEntry();
    const item = entry?.cases.find((candidate) => candidate.id === selectedCaseId);
    if (entry === null || entry.readOnly || item === undefined) return;
    if (!(await confirmDelete(options, `删除输入“${item.label}”？`))) return;
    try {
      options.store.deleteCase(entry.id, item.id);
      selectedCaseId = options.store.get(entry.id)?.cases[0]?.id ?? null;
      status.textContent = "输入案例已删除。";
      render();
    } catch (error) {
      showError(status, error);
    }
  };

  const onCreate = (): void => createScenario();
  const onCopy = (): void => copyScenario();
  const onDelete = (): void => void deleteScenario();
  createButton.addEventListener("click", onCreate);
  copyButton.addEventListener("click", onCopy);
  deleteButton.addEventListener("click", onDelete);
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
      root.remove();
    },
  });
}

function createEditorFields(
  document: Document,
  entry: ScenarioCatalogEntry,
  selectedCaseId: string | null,
): EditorFields {
  const readonly = entry.readOnly;
  const item = entry.cases.find((candidate) => candidate.id === selectedCaseId) ?? entry.cases[0];
  const form = document.createElement("form");
  form.className = "scenario-catalog__form";
  const readonlyNotice = document.createElement("p");
  readonlyNotice.className = "scenario-catalog__readonly";
  readonlyNotice.hidden = !readonly;
  readonlyNotice.textContent = "内置场景只读。点击“复制”后编辑项目副本。";
  const label = inputField(document, form, "名称", entry.definition.label);
  const description = textareaField(document, form, "说明", entry.definition.description);
  const family = selectField(document, form, "算法分类", FAMILIES, entry.definition.family);
  const inputModel = inputField(
    document,
    form,
    "输入模型",
    entry.definition.sizeGenerator.inputModel,
  );
  const minimum = numberField(document, form, "最小规模", entry.definition.sizeGenerator.minimum);
  const maximum = numberField(document, form, "最大规模", entry.definition.sizeGenerator.maximum);
  const defaults = inputField(
    document,
    form,
    "默认规模（逗号分隔）",
    entry.definition.sizeGenerator.defaultSizes.join(", "),
  );

  const caseHeading = document.createElement("h3");
  caseHeading.textContent = "输入与验证";
  const caseSelect = document.createElement("select");
  caseSelect.setAttribute("aria-label", "输入案例");
  caseSelect.dataset.scenarioField = "输入案例";
  for (const candidate of entry.cases) {
    const option = document.createElement("option");
    option.value = candidate.id;
    option.textContent = `${candidate.label} · n=${String(candidate.runCase.size)}`;
    caseSelect.append(option);
  }
  caseSelect.value = item?.id ?? "";
  const caseActions = document.createElement("div");
  caseActions.className = "scenario-catalog__case-actions";
  const addCase = actionButton(document, "新增输入", "add-case");
  const copyCase = actionButton(document, "复制输入", "copy-case");
  const deleteCase = actionButton(document, "删除输入", "delete-case");
  caseActions.append(caseSelect, addCase, copyCase, deleteCase);
  form.append(caseHeading, caseActions);

  const caseLabel = inputField(document, form, "输入名称", item?.label ?? "");
  const caseSize = numberField(document, form, "规模 n", item?.runCase.size ?? 1);
  const stdin = textareaField(document, form, "stdin", item?.runCase.stdin ?? "");
  const args = textareaField(
    document,
    form,
    "args（每行一项）",
    item?.runCase.arguments.join("\n") ?? "",
  );
  const expected = textareaField(
    document,
    form,
    "期望 stdout",
    item?.runCase.expected.stdout ?? "",
  );
  const explanation = textareaField(
    document,
    form,
    "期望结果说明",
    item?.runCase.expected.explanation ?? "",
  );
  const target = inputField(document, form, "目标分支 edge id（可空）", item?.targetBranchId ?? "");
  const save = actionButton(document, "保存", "save");
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

function showError(status: HTMLOutputElement, error: unknown): void {
  status.textContent = `未保存：${error instanceof Error ? error.message : String(error)}`;
}

function assertAlive(destroyed: boolean): void {
  if (destroyed) throw new Error("ScenarioCatalogPanel 已销毁");
}
