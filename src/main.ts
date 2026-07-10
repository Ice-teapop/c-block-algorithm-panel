import { renderSourceDoc } from "./core/index.js";
import { createBrowserCParser } from "./renderer/c-parser.js";

const app = document.querySelector<HTMLElement>("#app");

if (app === null) {
  throw new Error("缺少应用挂载节点 #app");
}

app.innerHTML = `
  <section class="shell" aria-labelledby="app-title">
    <p class="eyebrow">M1 · 无损投影层</p>
    <h1 id="app-title">C 积木算法面板</h1>
    <p>安全桌面壳已加载。编译与运行只通过具名 IPC 能力进入本机受限运行器。</p>
    <div class="capabilities" aria-label="桌面能力">
      <span>compile</span>
      <span>run</span>
      <span>capabilities</span>
    </div>
    <div class="status-list">
      <output id="service-status" class="status" aria-live="polite">正在检查运行器能力…</output>
      <output id="parser-status" class="status" aria-live="polite" data-state="loading">正在加载 C 解析器…</output>
    </div>
    <aside class="safety" aria-labelledby="safety-title">
      <strong id="safety-title">本地执行边界</strong>
      <p id="safety-mode">正在检查 Seatbelt…</p>
      <p>只运行你自己编写或已经逐行审阅过的 C 代码。本工具不提供运行任意恶意代码的安全保证。</p>
    </aside>
  </section>
`;

const status = document.querySelector<HTMLOutputElement>("#service-status");
const safetyMode = document.querySelector<HTMLParagraphElement>("#safety-mode");
const parserStatus = document.querySelector<HTMLOutputElement>("#parser-status");

let browserParser: Awaited<ReturnType<typeof createBrowserCParser>> | undefined;

void createBrowserCParser()
  .then((parser) => {
    browserParser = parser;
    const hello = "int main(void) { return 0; }\n";
    const projection = parser.project(hello);
    const functions = projection.blocks.filter(
      (block) => block.kind === "syntax" && block.role === "function",
    );
    if (functions.length !== 1 || renderSourceDoc(projection) !== hello) {
      throw new Error("renderer WASM 冒烟未得到单一函数或逐字符重建失败");
    }
    if (parserStatus !== null) {
      parserStatus.textContent = "C 解析器已加载 · 无损投影可用";
      parserStatus.dataset.state = "ready";
      parserStatus.dataset.rootType = "translation_unit";
      parserStatus.dataset.functionCount = String(functions.length);
      parserStatus.dataset.roundtrip = "true";
    }
  })
  .catch((error: unknown) => {
    if (parserStatus !== null) {
      parserStatus.textContent = `C 解析器不可用：${error instanceof Error ? error.message : "未知错误"}`;
      parserStatus.dataset.state = "error";
    }
  });

window.addEventListener(
  "beforeunload",
  () => {
    browserParser?.dispose();
    browserParser = undefined;
  },
  { once: true },
);

void window.panelApi
  .capabilities()
  .then((capabilities) => {
    if (status !== null) {
      status.textContent = capabilities.runnerEnabled
        ? `本地运行器已连接 · ${capabilities.mode}`
        : `桌面壳已连接 · 运行器当前为 ${capabilities.mode}`;
      status.dataset.state = capabilities.runnerEnabled ? "ready" : "offline";
    }
    if (safetyMode !== null) {
      const seatbeltReady = capabilities.seatbeltProbe.status === "probe-succeeded";
      safetyMode.textContent = seatbeltReady
        ? `Seatbelt best-effort：${capabilities.seatbeltProbe.detail}`
        : `无 Seatbelt 隔离：${capabilities.seatbeltProbe.detail}`;
      safetyMode.dataset.state = seatbeltReady ? "seatbelt" : "trusted-only";
    }
  })
  .catch(() => {
    if (status !== null) {
      status.textContent = "IPC 能力检查失败：编译与运行已停用";
      status.dataset.state = "error";
    }
    if (safetyMode !== null) {
      safetyMode.textContent = "无法确认运行隔离状态；编译与运行必须保持停用。";
      safetyMode.dataset.state = "error";
    }
  });
