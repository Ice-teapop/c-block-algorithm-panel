import type { InterfaceLocale } from "./interface-preferences.js";

export type ProjectionStatusState = "hidden" | "synced" | "pending" | "held" | "recovery";

export interface ProjectionStatus {
  readonly element: HTMLOutputElement;
  setState(state: ProjectionStatusState, message?: string): void;
  destroy(): void;
}

const DEFAULT_MESSAGES: Readonly<
  Record<InterfaceLocale, Readonly<Record<Exclude<ProjectionStatusState, "hidden">, string>>>
> = Object.freeze({
  "zh-CN": Object.freeze({
    synced: "代码与积木已同步",
    pending: "正在更新积木投影…",
    held: "代码尚未形成稳定结构，积木暂时保持上次结果",
    recovery: "代码仍有局部语法问题，已显示可恢复积木",
  }),
  en: Object.freeze({
    synced: "Code and blocks are synchronized",
    pending: "Updating the block projection…",
    held: "The code is not structurally stable yet; keeping the previous block projection",
    recovery: "The code still has local syntax errors; recoverable blocks are shown",
  }),
});
const PROJECTION_STATUS_STATES: readonly ProjectionStatusState[] = Object.freeze([
  "hidden",
  "synced",
  "pending",
  "held",
  "recovery",
]);

/** Mounts a compact, non-blocking status banner above a projection surface. */
export function createProjectionStatus(host: HTMLElement): ProjectionStatus {
  let destroyed = false;
  const localeHost = resolveLocaleHost(host);
  const ownerDocument = host.ownerDocument ?? document;
  let locale = resolveProjectionLocale(
    localeHost.dataset.locale ??
      ownerDocument.documentElement?.dataset.locale ??
      ownerDocument.documentElement?.lang,
  );
  let currentState: ProjectionStatusState = "hidden";
  let explicitMessage: string | undefined;
  const element = document.createElement("output");
  element.className = "projection-status";
  element.setAttribute("role", "status");
  element.setAttribute("aria-live", "polite");
  element.setAttribute("aria-atomic", "true");
  host.prepend(element);

  const render = (): void => {
    element.dataset.locale = locale;
    element.dataset.state = currentState;
    element.hidden = currentState === "hidden";
    element.textContent =
      currentState === "hidden" ? "" : (explicitMessage ?? DEFAULT_MESSAGES[locale][currentState]);
  };

  const setState = (state: ProjectionStatusState, message?: string): void => {
    assertActive(destroyed);
    assertState(state);
    if (message !== undefined && typeof message !== "string") {
      throw new TypeError("projection status message 必须是字符串");
    }
    currentState = state;
    explicitMessage = message;
    render();
  };

  const renderLocale = (nextLocale: InterfaceLocale): void => {
    if (destroyed) return;
    locale = nextLocale;
    render();
  };
  const onLocaleChange = (event: Event): void => {
    const detail = (event as CustomEvent<unknown>).detail;
    const candidate =
      typeof detail === "object" && detail !== null && "locale" in detail
        ? detail.locale
        : localeHost.dataset.locale;
    renderLocale(resolveProjectionLocale(candidate));
  };
  const MutationObserverConstructor = ownerDocument.defaultView?.MutationObserver;
  const localeObserver =
    MutationObserverConstructor === undefined
      ? null
      : new MutationObserverConstructor(() => {
          renderLocale(resolveProjectionLocale(localeHost.dataset.locale));
        });
  localeObserver?.observe(localeHost, {
    attributes: true,
    attributeFilter: ["data-locale"],
  });
  localeHost.addEventListener("workbench-locale-change", onLocaleChange);

  setState("hidden");

  return Object.freeze({
    element,
    setState,
    destroy() {
      if (destroyed) return;
      destroyed = true;
      localeHost.removeEventListener("workbench-locale-change", onLocaleChange);
      localeObserver?.disconnect();
      element.remove();
    },
  });
}

export function resolveProjectionLocale(value: unknown): InterfaceLocale {
  if (typeof value !== "string") return "zh-CN";
  return value.toLowerCase().startsWith("en") ? "en" : "zh-CN";
}

function resolveLocaleHost(host: HTMLElement): HTMLElement {
  if (typeof host.closest !== "function") return host;
  return host.closest<HTMLElement>("[data-locale]") ?? host;
}

function assertState(state: unknown): asserts state is ProjectionStatusState {
  if (
    typeof state !== "string" ||
    !PROJECTION_STATUS_STATES.includes(state as ProjectionStatusState)
  ) {
    throw new TypeError(`未知 projection status：${String(state)}`);
  }
}

function assertActive(destroyed: boolean): void {
  if (destroyed) {
    throw new Error("ProjectionStatus 已销毁");
  }
}
