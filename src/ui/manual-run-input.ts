import type { InterfaceLocale } from "../shared/interface-locale.js";

export interface ManualRunInputValue {
  readonly stdin: string;
  readonly arguments: readonly string[];
}

export interface ManualRunInputOptions {
  readonly onRun: (value: ManualRunInputValue) => void;
}

export interface ManualRunInput {
  readonly element: HTMLElement;
  setNeeded(needed: boolean): void;
  setValue(value: ManualRunInputValue): void;
  getValue(): ManualRunInputValue;
  requestInput(): boolean;
  destroy(): void;
}

const DIRECT_STANDARD_INPUT_CALLS = Object.freeze(["scanf", "getchar", "gets", "getw"]);
const STREAM_INPUT_CALLS = Object.freeze(["fscanf", "fgets", "getc", "fgetc", "fread"]);

const MANUAL_INPUT_COPY = Object.freeze({
  "zh-CN": Object.freeze({
    input: "输入",
    inputSet: "输入已设",
    open: "打开运行输入编辑器",
    close: "关闭运行输入编辑器",
    hint: "检测到代码可能读取标准输入。内容保存在当前项目，并与源码版本绑定。",
    stdinPlaceholder: "例如：5 3 8 2 7 4",
    stdinAria: "标准输入 stdin",
    args: "程序参数（每行一个）",
    argsPlaceholder: "例如：--verbose",
    argsAria: "程序参数，每行一个",
    run: "使用此输入运行",
    empty: "无输入运行",
  }),
  en: Object.freeze({
    input: "Input",
    inputSet: "Input set",
    open: "Open run input editor",
    close: "Close run input editor",
    hint: "This code may read standard input. Values are saved with this project and source version.",
    stdinPlaceholder: "Example: 5 3 8 2 7 4",
    stdinAria: "Standard input (stdin)",
    args: "Program arguments (one per line)",
    argsPlaceholder: "Example: --verbose",
    argsAria: "Program arguments, one per line",
    run: "Run with this input",
    empty: "Run without input",
  }),
} satisfies Readonly<Record<InterfaceLocale, Readonly<Record<string, string>>>>);

export function createManualRunInput(
  host: HTMLElement,
  options: ManualRunInputOptions,
): ManualRunInput {
  if (typeof options.onRun !== "function") throw new TypeError("手动输入需要 onRun 回调");
  const document = host.ownerDocument;
  const localeHost =
    typeof host.closest === "function" ? host.closest<HTMLElement>("#workbench-shell") : null;
  let locale: InterfaceLocale = localeHost?.dataset.locale === "en" ? "en" : "zh-CN";
  const copy = () => MANUAL_INPUT_COPY[locale];
  const root = document.createElement("div");
  root.className = "manual-run-input";
  root.hidden = true;

  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.className = "manual-run-input__toggle";
  toggle.textContent = copy().input;
  toggle.setAttribute("aria-expanded", "false");

  const editor = document.createElement("form");
  editor.className = "manual-run-input__editor";
  editor.hidden = true;
  const hint = document.createElement("p");
  hint.className = "manual-run-input__hint";
  hint.textContent = copy().hint;

  const stdinLabel = document.createElement("label");
  stdinLabel.textContent = "stdin";
  const stdin = document.createElement("textarea");
  stdin.className = "manual-run-input__stdin";
  stdin.rows = 4;
  stdin.placeholder = copy().stdinPlaceholder;
  stdin.setAttribute("aria-label", copy().stdinAria);
  stdinLabel.append(stdin);

  const argsLabel = document.createElement("label");
  const argsLabelText = document.createElement("span");
  argsLabelText.textContent = copy().args;
  const args = document.createElement("textarea");
  args.className = "manual-run-input__args";
  args.rows = 2;
  args.placeholder = copy().argsPlaceholder;
  args.setAttribute("aria-label", copy().argsAria);
  argsLabel.append(argsLabelText, args);

  const actions = document.createElement("div");
  actions.className = "manual-run-input__actions";
  const run = document.createElement("button");
  run.type = "submit";
  run.textContent = copy().run;
  const empty = document.createElement("button");
  empty.type = "button";
  empty.textContent = copy().empty;
  actions.append(run, empty);
  editor.append(hint, stdinLabel, argsLabel, actions);
  root.append(toggle, editor);
  host.replaceChildren(root);

  let destroyed = false;

  const renderLocale = (): void => {
    const hasInput = stdin.value.length > 0 || args.value.length > 0;
    toggle.textContent = hasInput ? copy().inputSet : copy().input;
    toggle.setAttribute("aria-label", editor.hidden ? copy().open : copy().close);
    hint.textContent = copy().hint;
    stdin.placeholder = copy().stdinPlaceholder;
    stdin.setAttribute("aria-label", copy().stdinAria);
    argsLabelText.textContent = copy().args;
    args.placeholder = copy().argsPlaceholder;
    args.setAttribute("aria-label", copy().argsAria);
    run.textContent = copy().run;
    empty.textContent = copy().empty;
  };

  const setOpen = (open: boolean): void => {
    editor.hidden = !open;
    toggle.setAttribute("aria-expanded", String(open));
    root.className = open ? "manual-run-input is-open" : "manual-run-input";
    renderLocale();
    if (open) stdin.focus?.({ preventScroll: true });
  };

  const submit = (value: ManualRunInputValue): void => {
    setOpen(false);
    options.onRun(freezeValue(value));
  };

  const onToggle = (): void => setOpen(editor.hidden === true);
  const onSubmit = (event: SubmitEvent): void => {
    event.preventDefault();
    renderLocale();
    submit(readValue(stdin.value, args.value));
  };
  const onEmpty = (): void => {
    stdin.value = "";
    args.value = "";
    renderLocale();
    submit(emptyManualRunInput());
  };
  const onLocaleChange = (event: Event): void => {
    const detail = (event as CustomEvent<unknown>).detail;
    locale =
      typeof detail === "object" && detail !== null && "locale" in detail && detail.locale === "en"
        ? "en"
        : localeHost?.dataset.locale === "en"
          ? "en"
          : "zh-CN";
    renderLocale();
  };
  toggle.addEventListener("click", onToggle);
  editor.addEventListener("submit", onSubmit);
  empty.addEventListener("click", onEmpty);
  localeHost?.addEventListener("workbench-locale-change", onLocaleChange);
  renderLocale();

  return Object.freeze({
    element: root,
    setNeeded(needed: boolean): void {
      assertAlive(destroyed);
      root.hidden = !needed;
      if (!needed) setOpen(false);
    },
    setValue(value: ManualRunInputValue): void {
      assertAlive(destroyed);
      const next = freezeValue(value);
      stdin.value = next.stdin;
      args.value = next.arguments.join("\n");
      renderLocale();
    },
    getValue(): ManualRunInputValue {
      assertAlive(destroyed);
      return readValue(stdin.value, args.value);
    },
    requestInput(): boolean {
      assertAlive(destroyed);
      if (root.hidden) return false;
      setOpen(true);
      return true;
    },
    destroy(): void {
      if (destroyed) return;
      destroyed = true;
      toggle.removeEventListener("click", onToggle);
      editor.removeEventListener("submit", onSubmit);
      empty.removeEventListener("click", onEmpty);
      localeHost?.removeEventListener("workbench-locale-change", onLocaleChange);
      root.remove();
    },
  });
}

export function sourceMayNeedRuntimeInput(source: string): boolean {
  if (typeof source !== "string") throw new TypeError("源码必须是字符串");
  const code = maskCCommentsAndLiterals(source);
  const directCalls = DIRECT_STANDARD_INPUT_CALLS.join("|");
  if (new RegExp(`\\b(?:${directCalls})\\s*\\(`, "u").test(code)) return true;
  const streamCalls = STREAM_INPUT_CALLS.join("|");
  if (new RegExp(`\\b(?:${streamCalls})\\s*\\([^;{}]*\\bstdin\\b`, "u").test(code)) {
    return true;
  }
  return /\bmain\s*\([^)]*\b(?:argc|argv)\b[^)]*\)/u.test(code);
}

export function emptyManualRunInput(): ManualRunInputValue {
  return Object.freeze({ stdin: "", arguments: Object.freeze([]) });
}

function readValue(stdin: string, argumentsText: string): ManualRunInputValue {
  return freezeValue({
    stdin,
    arguments: argumentsText
      .split(/\r?\n/u)
      .map((value) => value.trim())
      .filter((value) => value.length > 0),
  });
}

function freezeValue(value: ManualRunInputValue): ManualRunInputValue {
  if (typeof value.stdin !== "string" || value.stdin.includes("\0")) {
    throw new TypeError("stdin 必须是不含 NUL 的字符串");
  }
  if (
    !Array.isArray(value.arguments) ||
    value.arguments.some((argument) => typeof argument !== "string" || argument.includes("\0"))
  ) {
    throw new TypeError("程序参数必须是不含 NUL 的字符串数组");
  }
  return Object.freeze({ stdin: value.stdin, arguments: Object.freeze([...value.arguments]) });
}

function maskCCommentsAndLiterals(source: string): string {
  const characters = [...source];
  let state: "code" | "line-comment" | "block-comment" | "string" | "character" = "code";
  let escaped = false;
  for (let index = 0; index < characters.length; index += 1) {
    const current = characters[index]!;
    const next = characters[index + 1];
    if (state === "code") {
      if (current === "/" && next === "/") {
        characters[index] = " ";
        characters[index + 1] = " ";
        index += 1;
        state = "line-comment";
      } else if (current === "/" && next === "*") {
        characters[index] = " ";
        characters[index + 1] = " ";
        index += 1;
        state = "block-comment";
      } else if (current === '"') {
        characters[index] = " ";
        state = "string";
        escaped = false;
      } else if (current === "'") {
        characters[index] = " ";
        state = "character";
        escaped = false;
      }
      continue;
    }
    if (state === "line-comment") {
      if (current === "\n") state = "code";
      else characters[index] = " ";
      continue;
    }
    if (state === "block-comment") {
      if (current === "*" && next === "/") {
        characters[index] = " ";
        characters[index + 1] = " ";
        index += 1;
        state = "code";
      } else if (current !== "\n") characters[index] = " ";
      continue;
    }
    if (current === "\n") {
      state = "code";
      escaped = false;
      continue;
    }
    characters[index] = " ";
    if (escaped) {
      escaped = false;
      continue;
    }
    if (current === "\\") {
      escaped = true;
      continue;
    }
    if ((state === "string" && current === '"') || (state === "character" && current === "'")) {
      state = "code";
    }
  }
  return characters.join("");
}

function assertAlive(destroyed: boolean): void {
  if (destroyed) throw new Error("手动运行输入已销毁");
}
