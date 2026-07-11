import type { MentorHint, MentorHintTarget } from "../mentor/index.js";

export interface MentorPanelOptions {
  readonly onLocate?: ((target: MentorHintTarget, hint: MentorHint) => void) | undefined;
}

export interface MentorPanel {
  readonly element: HTMLElement;
  setHints(hints: readonly MentorHint[]): void;
  setStatus(message: string, state?: "ready" | "working" | "error"): void;
  destroy(): void;
}

export function createMentorPanel(
  host: HTMLElement,
  options: MentorPanelOptions = {},
): MentorPanel {
  const ownerDocument = host.ownerDocument;
  const root = ownerDocument.createElement("section");
  root.className = "mentor-panel";
  root.dataset.state = "ready";

  const headingRow = ownerDocument.createElement("header");
  headingRow.className = "mentor-panel__header";
  const heading = ownerDocument.createElement("h2");
  heading.className = "mentor-panel__title";
  heading.textContent = "本地导师";
  const boundary = ownerDocument.createElement("span");
  boundary.className = "mentor-panel__boundary";
  boundary.textContent = "离线 · 只读 · 证据提示";
  headingRow.append(heading, boundary);

  const status = ownerDocument.createElement("output");
  status.className = "mentor-panel__status";
  status.setAttribute("aria-live", "polite");
  status.textContent = "等待分析证据";

  const list = ownerDocument.createElement("div");
  list.className = "mentor-panel__list";
  list.setAttribute("role", "list");
  root.append(headingRow, status, list);
  host.replaceChildren(root);

  let destroyed = false;

  const render = (hints: readonly MentorHint[]): void => {
    list.replaceChildren();
    if (hints.length === 0) {
      const empty = ownerDocument.createElement("p");
      empty.className = "mentor-panel__empty";
      empty.textContent = "当前没有足够证据生成提示。";
      list.append(empty);
      status.textContent = "0 条证据提示";
      return;
    }
    for (const hint of hints) list.append(renderHint(ownerDocument, hint, options));
    status.textContent = `${String(hints.length)} 条证据提示`;
  };

  render(Object.freeze([]));

  return Object.freeze({
    element: root,
    setHints(hints: readonly MentorHint[]): void {
      assertAlive(destroyed);
      if (!Array.isArray(hints)) throw new TypeError("mentor hints 必须是数组");
      render(hints);
    },
    setStatus(message: string, state: "ready" | "working" | "error" = "ready"): void {
      assertAlive(destroyed);
      if (typeof message !== "string" || message.trim().length === 0) {
        throw new TypeError("mentor status 必须是非空文本");
      }
      root.dataset.state = state;
      status.textContent = message;
    },
    destroy(): void {
      if (destroyed) return;
      destroyed = true;
      host.replaceChildren();
    },
  });
}

function renderHint(
  ownerDocument: Document,
  hint: MentorHint,
  options: MentorPanelOptions,
): HTMLElement {
  const item = ownerDocument.createElement("article");
  item.className = "mentor-hint";
  item.dataset.hintId = hint.id;
  item.dataset.confidence = hint.confidence;
  item.dataset.level = hint.level;
  item.setAttribute("role", "listitem");

  const action = ownerDocument.createElement("button");
  action.className = "mentor-hint__action";
  action.type = "button";
  action.disabled = hint.target === null;
  action.setAttribute(
    "aria-label",
    hint.target === null ? `${hint.title}，无源码定位` : `${hint.title}，定位源码`,
  );

  const title = ownerDocument.createElement("strong");
  title.className = "mentor-hint__title";
  title.textContent = hint.title;
  const meta = ownerDocument.createElement("span");
  meta.className = "mentor-hint__meta";
  meta.textContent = `${confidenceLabel(hint.confidence)} · ${levelLabel(hint.level)}`;
  const summary = ownerDocument.createElement("span");
  summary.className = "mentor-hint__summary";
  summary.textContent = hint.summary;
  const next = ownerDocument.createElement("span");
  next.className = "mentor-hint__next";
  next.textContent = `下一步：${hint.nextStep}`;
  const evidence = ownerDocument.createElement("span");
  evidence.className = "mentor-hint__evidence";
  const evidenceLabels = [...new Set(hint.evidence.map((item) => item.label))].join(" / ");
  evidence.textContent = `${String(hint.evidence.length)} 项证据${evidenceLabels.length === 0 ? "" : ` · ${evidenceLabels}`} · 不会自动改码`;
  action.append(title, meta, summary, next, evidence);
  const target = hint.target;
  if (target !== null) {
    action.addEventListener("click", () => options.onLocate?.(target, hint));
  }
  item.append(action);
  return item;
}

function confidenceLabel(value: MentorHint["confidence"]): string {
  const labels = { certain: "确定", likely: "可能", hint: "提示" } as const;
  return labels[value];
}

function levelLabel(value: MentorHint["level"]): string {
  const labels = {
    verification: "事实核对",
    elaboration: "原因说明",
    strategy: "策略提示",
  } as const;
  return labels[value];
}

function assertAlive(destroyed: boolean): void {
  if (destroyed) throw new Error("MentorPanel 已销毁");
}
