export type ProjectionStatusState = "hidden" | "synced" | "pending" | "held" | "recovery";

export interface ProjectionStatus {
  readonly element: HTMLOutputElement;
  setState(state: ProjectionStatusState, message?: string): void;
  destroy(): void;
}

const DEFAULT_MESSAGES: Readonly<Record<Exclude<ProjectionStatusState, "hidden">, string>> =
  Object.freeze({
    synced: "代码与积木已同步",
    pending: "正在更新积木投影…",
    held: "代码尚未形成稳定结构，积木暂时保持上次结果",
    recovery: "代码仍有局部语法问题，已显示可恢复积木",
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
  const element = document.createElement("output");
  element.className = "projection-status";
  element.setAttribute("role", "status");
  element.setAttribute("aria-live", "polite");
  element.setAttribute("aria-atomic", "true");
  host.prepend(element);

  const setState = (state: ProjectionStatusState, message?: string): void => {
    assertActive(destroyed);
    assertState(state);
    if (message !== undefined && typeof message !== "string") {
      throw new TypeError("projection status message 必须是字符串");
    }
    element.dataset.state = state;
    element.hidden = state === "hidden";
    element.textContent = state === "hidden" ? "" : (message ?? DEFAULT_MESSAGES[state]);
  };

  setState("hidden");

  return Object.freeze({
    element,
    setState,
    destroy() {
      if (destroyed) return;
      destroyed = true;
      element.remove();
    },
  });
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
