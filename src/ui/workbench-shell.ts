import type { InspectorViewContribution } from "../workbench/contracts.js";

export interface WorkbenchElements {
  readonly shell: HTMLElement;
  readonly openButton: HTMLButtonElement;
  readonly pasteButton: HTMLButtonElement;
  readonly themeButton: HTMLButtonElement;
  readonly fileName: HTMLElement;
  readonly sourceMeta: HTMLElement;
  readonly parserStatus: HTMLOutputElement;
  readonly importStatus: HTMLOutputElement;
  readonly blockTree: HTMLElement;
  readonly codePane: HTMLElement;
  readonly dropOverlay: HTMLElement;
  readonly pasteDialog: HTMLDialogElement;
  readonly pasteSource: HTMLTextAreaElement;
  readonly pasteError: HTMLElement;
  readonly pasteConfirm: HTMLButtonElement;
  readonly pasteCancel: HTMLButtonElement;
  readonly showInspector: (viewId: string) => void;
  readonly getInspectorHost: (viewId: string) => HTMLElement;
  readonly destroy: () => void;
}

interface MountedInspectorView {
  readonly viewId: string;
  readonly tab: HTMLButtonElement;
  readonly panel: HTMLElement;
  readonly host: HTMLElement;
}

export function mountWorkbench(
  app: HTMLElement,
  inspectorViews: readonly InspectorViewContribution[],
): WorkbenchElements {
  const views = validateInspectorViews(inspectorViews);

  app.innerHTML = `
    <div id="workbench-shell" class="workbench-shell">
      <header class="app-bar">
        <div class="brand" aria-labelledby="app-title">
          <img class="brand__mark" src="./app-icon.png" alt="" />
          <h1 id="app-title">C 积木算法面板</h1>
        </div>
        <div class="document-identity" aria-label="当前文档">
          <span id="file-name">正在准备示例…</span>
        </div>
        <nav class="app-actions" aria-label="工作台操作">
          <button id="open-source" class="button button--quiet" type="button" disabled>
            打开 C 文件
          </button>
          <button id="open-paste" class="button button--quiet" type="button" disabled>
            粘贴源码
          </button>
          <button id="theme-toggle" class="icon-button" type="button" aria-label="切换界面主题">◐</button>
        </nav>
      </header>

      <main class="workbench" aria-label="C 算法工作台">
        <section class="panel panel--blocks" aria-labelledby="blocks-title">
          <header class="panel__header">
            <h2 id="blocks-title">结构</h2>
          </header>
          <div id="block-tree" class="block-tree"></div>
        </section>

        <section class="panel panel--code" aria-labelledby="code-title">
          <header class="panel__header panel__header--code">
            <h2 id="code-title">C 代码</h2>
            <span id="source-meta" class="source-meta">—</span>
          </header>
          <div id="code-pane" class="code-pane" aria-label="只读 C 代码编辑器"></div>
        </section>

        <aside class="panel panel--inspector inspector" aria-labelledby="inspector-title">
          <h2 id="inspector-title" class="visually-hidden">检查器</h2>
          <div id="inspector-tabs" class="inspector-tabs" role="tablist" aria-label="检查器"></div>
        </aside>
      </main>

      <footer class="status-bar">
        <output id="parser-status" class="status-pill" aria-live="polite" data-state="loading">
          正在加载 C 解析器…
        </output>
        <output id="import-status" class="status-message" aria-live="polite">
          解析器就绪后可打开、拖入或粘贴 .c 文件
        </output>
      </footer>

      <div id="drop-overlay" class="drop-overlay" hidden aria-hidden="true">
        <div class="drop-overlay__card">
          <span class="drop-overlay__icon" aria-hidden="true">↓</span>
          <strong>放下 .c 文件</strong>
          <span>仅在本机读取</span>
        </div>
      </div>

      <dialog id="paste-dialog" class="paste-dialog" aria-labelledby="paste-title">
        <form method="dialog" class="paste-dialog__surface">
          <div class="paste-dialog__header">
            <h2 id="paste-title">粘贴 C 源码</h2>
            <button id="paste-cancel" class="icon-button" value="cancel" aria-label="关闭">×</button>
          </div>
          <label class="paste-dialog__label" for="paste-source">UTF-8 C 源码，最大 512 KiB</label>
          <textarea id="paste-source" spellcheck="false" placeholder="int main(void) {\n  return 0;\n}"></textarea>
          <p id="paste-error" class="form-error" role="alert"></p>
          <div class="paste-dialog__actions">
            <button class="button button--quiet" value="cancel">取消</button>
            <button id="paste-confirm" class="button button--primary" type="button">载入工作台</button>
          </div>
        </form>
      </dialog>
    </div>
  `;

  const inspector = required(app, ".inspector", HTMLElement);
  const inspectorTabs = required(app, "#inspector-tabs", HTMLElement);
  const mountedViews = views.map((view, index) =>
    mountInspectorView(inspectorTabs, inspector, view, index === 0),
  );
  const mountedViewsById = new Map(mountedViews.map((view) => [view.viewId, view]));

  const getMountedInspector = (viewId: string): MountedInspectorView => {
    const mounted = mountedViewsById.get(viewId);
    if (mounted === undefined) {
      throw new RangeError(`未知检查器视图：${viewId}`);
    }
    return mounted;
  };
  const showInspector = (viewId: string): void => {
    getMountedInspector(viewId);
    for (const item of mountedViews) {
      const active = item.viewId === viewId;
      item.tab.setAttribute("aria-selected", String(active));
      item.tab.tabIndex = active ? 0 : -1;
      item.panel.hidden = !active;
    }
  };
  const getInspectorHost = (viewId: string): HTMLElement => getMountedInspector(viewId).host;
  const tabClickListeners = new Map<HTMLButtonElement, () => void>();
  for (const item of mountedViews) {
    const listener = (): void => showInspector(item.viewId);
    tabClickListeners.set(item.tab, listener);
    item.tab.addEventListener("click", listener);
  }
  const handleInspectorKeydown = (event: KeyboardEvent): void => {
    if (!(event instanceof KeyboardEvent)) return;
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const activeIndex = Math.max(
      0,
      mountedViews.findIndex((item) => item.tab.getAttribute("aria-selected") === "true"),
    );
    const nextIndex =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? mountedViews.length - 1
          : event.key === "ArrowRight"
            ? (activeIndex + 1) % mountedViews.length
            : (activeIndex - 1 + mountedViews.length) % mountedViews.length;
    const next = mountedViews[nextIndex];
    if (next === undefined) return;
    showInspector(next.viewId);
    next.tab.focus();
  };
  inspectorTabs.addEventListener("keydown", handleInspectorKeydown);

  let destroyed = false;
  const destroy = (): void => {
    if (destroyed) return;
    destroyed = true;
    inspectorTabs.removeEventListener("keydown", handleInspectorKeydown);
    for (const [tab, listener] of tabClickListeners) {
      tab.removeEventListener("click", listener);
    }
    tabClickListeners.clear();
  };

  return Object.freeze({
    shell: required(app, "#workbench-shell", HTMLElement),
    openButton: required(app, "#open-source", HTMLButtonElement),
    pasteButton: required(app, "#open-paste", HTMLButtonElement),
    themeButton: required(app, "#theme-toggle", HTMLButtonElement),
    fileName: required(app, "#file-name", HTMLElement),
    sourceMeta: required(app, "#source-meta", HTMLElement),
    parserStatus: required(app, "#parser-status", HTMLOutputElement),
    importStatus: required(app, "#import-status", HTMLOutputElement),
    blockTree: required(app, "#block-tree", HTMLElement),
    codePane: required(app, "#code-pane", HTMLElement),
    dropOverlay: required(app, "#drop-overlay", HTMLElement),
    pasteDialog: required(app, "#paste-dialog", HTMLDialogElement),
    pasteSource: required(app, "#paste-source", HTMLTextAreaElement),
    pasteError: required(app, "#paste-error", HTMLElement),
    pasteConfirm: required(app, "#paste-confirm", HTMLButtonElement),
    pasteCancel: required(app, "#paste-cancel", HTMLButtonElement),
    showInspector,
    getInspectorHost,
    destroy,
  });
}

function validateInspectorViews(
  inspectorViews: readonly InspectorViewContribution[],
): readonly InspectorViewContribution[] {
  if (inspectorViews.length === 0) {
    throw new TypeError("工作台至少需要一个检查器视图");
  }

  const ids = new Set<string>();
  const views = inspectorViews.map((view) => {
    if (typeof view.id !== "string" || view.id.trim().length === 0) {
      throw new TypeError("检查器视图 id 不得为空");
    }
    if (ids.has(view.id)) {
      throw new TypeError(`检查器视图 id 不得重复：${view.id}`);
    }
    if (!Number.isSafeInteger(view.order)) {
      throw new TypeError(`检查器视图 order 必须是安全整数：${String(view.order)}`);
    }
    ids.add(view.id);
    return view;
  });

  return Object.freeze(
    views.sort((left, right) => left.order - right.order || left.id.localeCompare(right.id, "en")),
  );
}

function mountInspectorView(
  tabList: HTMLElement,
  inspector: HTMLElement,
  view: InspectorViewContribution,
  active: boolean,
): MountedInspectorView {
  const token = inspectorDomToken(view.id);
  const tabId = `${token}-tab`;
  const panelId = `${token}-panel`;
  const hostId = `${token}-host`;

  const tab = document.createElement("button");
  tab.id = tabId;
  tab.className = "inspector-tab";
  tab.type = "button";
  tab.role = "tab";
  tab.textContent = view.label;
  tab.tabIndex = active ? 0 : -1;
  tab.setAttribute("aria-selected", String(active));
  tab.setAttribute("aria-controls", panelId);
  tab.dataset.inspectorViewId = view.id;

  const panel = document.createElement("section");
  panel.id = panelId;
  panel.className = "inspector-pane";
  panel.role = "tabpanel";
  panel.hidden = !active;
  panel.setAttribute("aria-labelledby", tabId);
  panel.dataset.inspectorViewId = view.id;

  const host = document.createElement("div");
  host.id = hostId;
  host.className = `inspector-view-host ${token}`;
  host.dataset.inspectorViewId = view.id;
  panel.append(host);
  tabList.append(tab);
  inspector.append(panel);

  return Object.freeze({ viewId: view.id, tab, panel, host });
}

function inspectorDomToken(viewId: string): string {
  if (/^[A-Za-z0-9_.:-]+$/u.test(viewId)) return viewId;
  const codePoints = [...viewId]
    .map((character) => character.codePointAt(0)?.toString(16))
    .join("-");
  return `~${codePoints}`;
}

function required<T extends Element>(
  root: ParentNode,
  selector: string,
  constructor: abstract new (...args: never[]) => T,
): T {
  const element = root.querySelector(selector);
  if (!(element instanceof constructor)) {
    throw new Error(`工作台缺少节点 ${selector}`);
  }
  return element;
}
