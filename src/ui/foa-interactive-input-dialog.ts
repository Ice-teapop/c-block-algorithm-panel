import type { FoaLocale, FoaLocalizedText } from "../tutorials/foa-contracts.js";
import {
  evaluateFoaInteractiveInput,
  type FoaInteractiveInputDefinition,
  type FoaInteractiveInputField,
  type FoaInteractiveRun,
} from "../tutorials/foa-interactive-inputs.js";

export interface FoaInteractiveInputDialogOptions {
  readonly locale: FoaLocale;
  readonly onSubmit: (run: FoaInteractiveRun) => void;
  readonly onCancelInitial: () => void;
}

export interface FoaInteractiveInputDialogController {
  readonly root: HTMLDialogElement;
  readonly hasSubmitted: boolean;
  readonly currentRun: FoaInteractiveRun | null;
  open(initial: boolean): void;
  close(): void;
  setLocale(locale: FoaLocale): void;
  destroy(): void;
}

interface FieldElements {
  readonly definition: FoaInteractiveInputField;
  readonly label: HTMLLabelElement;
  readonly input: HTMLInputElement;
  readonly hint: HTMLParagraphElement;
  readonly error: HTMLParagraphElement;
}

const COPY = Object.freeze({
  zh: Object.freeze({
    cancel: "取消",
    submit: "使用这个输入",
  }),
  en: Object.freeze({
    cancel: "Cancel",
    submit: "Use this input",
  }),
});

let nextDialogInstance = 0;

/**
 * Mounts the shared learner-input dialog used by the generic FOA semantic lessons.
 * The caller owns placement of `root`; this controller only manages dialog state and validation.
 */
export function createFoaInteractiveInputDialog(
  ownerDocument: Document,
  definition: FoaInteractiveInputDefinition,
  options: FoaInteractiveInputDialogOptions,
): FoaInteractiveInputDialogController {
  const instance = nextDialogInstance++;
  const idPrefix = `foa-interactive-input-${String(definition.order)}-${String(instance)}`;
  let locale = options.locale;
  let initialDialog = false;
  let submitted = false;
  let destroyed = false;
  let previousFocus: HTMLElement | null = null;
  let currentRun: FoaInteractiveRun | null = null;
  let lastError: { readonly fieldId: string; readonly message: FoaLocalizedText } | null = null;

  const root = ownerDocument.createElement("dialog");
  root.className = "foa-flow-input-dialog";
  root.dataset.taskLessonDialog = "input";
  root.dataset.interactiveInputGroup = definition.group;
  root.dataset.lessonOrder = String(definition.order);

  const titleId = `${idPrefix}-title`;
  const descriptionId = `${idPrefix}-description`;
  root.setAttribute("aria-labelledby", titleId);
  root.setAttribute("aria-describedby", descriptionId);

  const form = ownerDocument.createElement("form");
  form.className = "foa-flow-input-dialog__surface";
  form.noValidate = true;

  const title = ownerDocument.createElement("h2");
  title.id = titleId;
  const description = ownerDocument.createElement("p");
  description.id = descriptionId;
  const fieldsGrid = ownerDocument.createElement("div");
  fieldsGrid.className = "foa-flow-input-dialog__fields";
  form.append(title, description, fieldsGrid);

  const fields = definition.fields.map((fieldDefinition, fieldIndex) => {
    const inputId = `${idPrefix}-field-${String(fieldIndex)}`;
    const hintId = `${inputId}-hint`;
    const errorId = `${inputId}-error`;

    const label = ownerDocument.createElement("label");
    label.htmlFor = inputId;

    const input = ownerDocument.createElement("input");
    input.id = inputId;
    input.type = "text";
    input.autocomplete = "off";
    input.spellcheck = false;
    input.value = fieldDefinition.defaultValue;
    input.inputMode = inputModeFor(fieldDefinition.kind);
    input.dataset.taskLessonInput = fieldDefinition.id;
    input.dataset.interactiveInputKind = fieldDefinition.kind;
    input.setAttribute("aria-describedby", `${hintId} ${errorId}`);

    const hint = ownerDocument.createElement("p");
    hint.id = hintId;
    hint.dataset.interactiveInputHint = fieldDefinition.id;

    const error = ownerDocument.createElement("p");
    error.id = errorId;
    error.className = "foa-flow-input-dialog__error";
    error.dataset.interactiveInputError = fieldDefinition.id;
    error.setAttribute("role", "alert");

    const field = ownerDocument.createElement("div");
    field.className = "foa-flow-input-dialog__field";
    field.append(label, input, hint, error);
    fieldsGrid.append(field);
    return Object.freeze({ definition: fieldDefinition, label, input, hint, error });
  });

  const footer = ownerDocument.createElement("footer");
  const cancel = actionButton(ownerDocument, "cancel-input");
  const submit = actionButton(ownerDocument, "submit-input");
  submit.type = "submit";
  submit.classList.add("button--primary");
  footer.append(cancel, submit);
  form.append(footer);
  root.append(form);

  cancel.addEventListener("click", cancelInput);
  root.addEventListener("cancel", cancelInput);
  root.addEventListener("close", restoreFocus);
  form.addEventListener("submit", submitInput);
  for (const field of fields) {
    field.input.addEventListener("input", () => clearFieldError(field));
  }

  applyLocale();

  return Object.freeze({
    root,
    get hasSubmitted(): boolean {
      return submitted;
    },
    get currentRun(): FoaInteractiveRun | null {
      return currentRun;
    },
    open,
    close,
    setLocale(nextLocale: FoaLocale): void {
      assertLive();
      locale = nextLocale;
      applyLocale();
    },
    destroy(): void {
      if (destroyed) return;
      destroyed = true;
      close();
      root.remove();
    },
  });

  function open(initial: boolean): void {
    assertLive();
    initialDialog = initial;
    previousFocus =
      ownerDocument.activeElement instanceof HTMLElement ? ownerDocument.activeElement : null;
    clearErrors();
    if (!root.open) root.showModal();
    const firstField = fields[0];
    firstField?.input.focus({ preventScroll: true });
    firstField?.input.select();
  }

  function close(): void {
    if (root.open) root.close("dismissed");
  }

  function cancelInput(event: Event): void {
    event.preventDefault();
    close();
    if (initialDialog && !submitted) options.onCancelInitial();
  }

  function submitInput(event: SubmitEvent): void {
    event.preventDefault();
    clearErrors();
    const values = Object.fromEntries(
      fields.map((field) => [field.definition.id, field.input.value] as const),
    );
    const result = evaluateFoaInteractiveInput(definition, values);
    if (!result.ok) {
      lastError = Object.freeze({ fieldId: result.fieldId, message: result.message });
      renderLastError();
      return;
    }

    currentRun = result.run;
    submitted = true;
    initialDialog = false;
    close();
    options.onSubmit(result.run);
  }

  function applyLocale(): void {
    title.textContent = definition.title[locale];
    description.textContent = definition.description[locale];
    cancel.textContent = COPY[locale].cancel;
    submit.textContent = COPY[locale].submit;
    for (const field of fields) {
      field.label.textContent = field.definition.label[locale];
      field.hint.textContent = field.definition.hint[locale];
    }
    renderLastError();
  }

  function clearErrors(): void {
    lastError = null;
    for (const field of fields) clearFieldError(field);
  }

  function clearFieldError(field: FieldElements): void {
    field.error.textContent = "";
    field.input.removeAttribute("aria-invalid");
    if (lastError?.fieldId === field.definition.id) lastError = null;
  }

  function renderLastError(): void {
    const activeError = lastError;
    for (const field of fields) {
      const matches = activeError?.fieldId === field.definition.id;
      field.error.textContent = matches ? activeError.message[locale] : "";
      if (matches) field.input.setAttribute("aria-invalid", "true");
      else field.input.removeAttribute("aria-invalid");
    }
    if (activeError === null) return;
    const invalidField = fields.find((field) => field.definition.id === activeError.fieldId);
    invalidField?.input.focus({ preventScroll: true });
    invalidField?.input.select();
  }

  function restoreFocus(): void {
    previousFocus?.focus({ preventScroll: true });
    previousFocus = null;
  }

  function assertLive(): void {
    if (destroyed) throw new Error("FOA interactive input dialog has been destroyed");
  }
}

function inputModeFor(kind: FoaInteractiveInputField["kind"]): HTMLInputElement["inputMode"] {
  switch (kind) {
    case "integer":
      return "numeric";
    case "decimal":
      return "decimal";
    case "integer-sequence":
    case "text":
      return "text";
  }
}

function actionButton(ownerDocument: Document, action: string): HTMLButtonElement {
  const button = ownerDocument.createElement("button");
  button.type = "button";
  button.className = "button";
  button.dataset.taskLessonAction = action;
  return button;
}
