export interface WorkbenchElements {
  readonly shell: HTMLElement;
  readonly openButton: HTMLButtonElement;
  readonly pasteButton: HTMLButtonElement;
  readonly fileName: HTMLElement;
  readonly sourceMeta: HTMLElement;
  readonly parserStatus: HTMLOutputElement;
  readonly importStatus: HTMLOutputElement;
  readonly blockTree: HTMLElement;
  readonly codePane: HTMLElement;
  readonly explanation: HTMLElement;
  readonly runPanel: HTMLElement;
  readonly dropOverlay: HTMLElement;
  readonly pasteDialog: HTMLDialogElement;
  readonly pasteSource: HTMLTextAreaElement;
  readonly pasteError: HTMLElement;
  readonly pasteConfirm: HTMLButtonElement;
  readonly pasteCancel: HTMLButtonElement;
}

export function mountWorkbench(app: HTMLElement): WorkbenchElements {
  app.innerHTML = `
    <div id="workbench-shell" class="workbench-shell">
      <header class="app-bar">
        <div class="brand" aria-labelledby="app-title">
          <span class="brand__mark" aria-hidden="true">C</span>
          <div>
            <p class="brand__kicker">ALGORITHM WORKBENCH</p>
            <h1 id="app-title">C 积木算法面板</h1>
          </div>
        </div>
        <div class="document-identity" aria-label="当前文档">
          <span class="document-identity__dot" aria-hidden="true"></span>
          <span id="file-name">正在准备示例…</span>
        </div>
        <nav class="app-actions" aria-label="源码导入">
          <button id="open-source" class="button button--primary" type="button" disabled>
            <span aria-hidden="true">↗</span> 打开 C 文件
          </button>
          <button id="open-paste" class="button button--quiet" type="button" disabled>
            粘贴源码
          </button>
        </nav>
      </header>

      <main class="workbench" aria-label="C 算法工作台">
        <section class="panel panel--blocks" aria-labelledby="blocks-title">
          <header class="panel__header">
            <div>
              <p class="panel__eyebrow">STRUCTURE</p>
              <h2 id="blocks-title">积木结构</h2>
            </div>
            <span class="panel__hint">语句级</span>
          </header>
          <div id="block-tree" class="block-tree"></div>
        </section>

        <section class="panel panel--code" aria-labelledby="code-title">
          <header class="panel__header panel__header--code">
            <div>
              <p class="panel__eyebrow">SOURCE</p>
              <h2 id="code-title">只读 C 代码</h2>
            </div>
            <span id="source-meta" class="source-meta">—</span>
          </header>
          <div id="code-pane" class="code-pane" aria-label="只读 C 代码编辑器"></div>
        </section>

        <aside class="inspector" aria-label="解释与运行">
          <section class="panel panel--explanation" aria-labelledby="explanation-title">
            <header class="panel__header">
              <div>
                <p class="panel__eyebrow">WHY</p>
                <h2 id="explanation-title">作用与原理</h2>
              </div>
              <span class="deterministic-badge">确定性</span>
            </header>
            <div id="explanation" class="explanation" aria-live="polite">
              <p class="empty-state">选择一块代码，查看它在算法中的作用。</p>
            </div>
          </section>
          <section class="panel panel--runner" aria-labelledby="runner-title">
            <header class="panel__header">
              <div>
                <p class="panel__eyebrow">EXECUTE</p>
                <h2 id="runner-title">本地运行</h2>
              </div>
            </header>
            <div id="run-panel"></div>
          </section>
        </aside>
      </main>

      <footer class="status-bar">
        <output id="parser-status" class="status-pill" aria-live="polite" data-state="loading">
          正在加载 C 解析器…
        </output>
        <output id="import-status" class="status-message" aria-live="polite">
          解析器就绪后可打开、拖入或粘贴 .c 文件
        </output>
        <span class="status-bar__local">本地 App · 文件不会上传</span>
      </footer>

      <div id="drop-overlay" class="drop-overlay" hidden aria-hidden="true">
        <div class="drop-overlay__card">
          <span class="drop-overlay__icon" aria-hidden="true">↓</span>
          <strong>放下 .c 文件</strong>
          <span>将在本机读取，原始换行与 BOM 保持不变</span>
        </div>
      </div>

      <dialog id="paste-dialog" class="paste-dialog" aria-labelledby="paste-title">
        <form method="dialog" class="paste-dialog__surface">
          <div class="paste-dialog__header">
            <div>
              <p class="panel__eyebrow">PASTE SOURCE</p>
              <h2 id="paste-title">粘贴 C 源码</h2>
            </div>
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

  return Object.freeze({
    shell: required(app, "#workbench-shell", HTMLElement),
    openButton: required(app, "#open-source", HTMLButtonElement),
    pasteButton: required(app, "#open-paste", HTMLButtonElement),
    fileName: required(app, "#file-name", HTMLElement),
    sourceMeta: required(app, "#source-meta", HTMLElement),
    parserStatus: required(app, "#parser-status", HTMLOutputElement),
    importStatus: required(app, "#import-status", HTMLOutputElement),
    blockTree: required(app, "#block-tree", HTMLElement),
    codePane: required(app, "#code-pane", HTMLElement),
    explanation: required(app, "#explanation", HTMLElement),
    runPanel: required(app, "#run-panel", HTMLElement),
    dropOverlay: required(app, "#drop-overlay", HTMLElement),
    pasteDialog: required(app, "#paste-dialog", HTMLDialogElement),
    pasteSource: required(app, "#paste-source", HTMLTextAreaElement),
    pasteError: required(app, "#paste-error", HTMLElement),
    pasteConfirm: required(app, "#paste-confirm", HTMLButtonElement),
    pasteCancel: required(app, "#paste-cancel", HTMLButtonElement),
  });
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
