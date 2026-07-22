import {
  _electron as electron,
  expect,
  test,
  type ElectronApplication,
  type Page,
} from "@playwright/test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

let application: ElectronApplication | undefined;
let page: Page;
let workspaceRoot = "";

test.beforeAll(async () => {
  workspaceRoot = await mkdtemp(join(tmpdir(), "c-block-mentor-layout-e2e-"));
  const port = process.env.PANEL_E2E_PORT ?? "5173";
  application = await electron.launch({
    args: ["."],
    chromiumSandbox: true,
    env: {
      ...Object.fromEntries(
        Object.entries(process.env).filter(
          (entry): entry is [string, string] => entry[1] !== undefined,
        ),
      ),
      PANEL_WORKSPACE_ROOT: workspaceRoot,
      VITE_DEV_SERVER_URL: `http://127.0.0.1:${port}/`,
    },
  });
  page = await application.firstWindow();
  await application.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0]?.setContentSize(1180, 748);
  });
  await page.evaluate(() => {
    globalThis.localStorage.clear();
    globalThis.localStorage.setItem("c-block-algorithm-panel.locale", "zh-CN");
  });
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.locator("#startup-loader")).toBeHidden();
});

test.afterAll(async () => {
  await application?.close();
  await rm(workspaceRoot, { recursive: true, force: true });
});

test("keeps every local check reachable in a short runtime pane", async () => {
  await page.locator("#build-tab").click();
  await page.locator("#mentor-tab").click();
  await expect(page.locator("#mentor-panel")).toBeVisible();

  await page.evaluate(() => {
    const list = document.querySelector<HTMLElement>(".mentor-panel__list");
    if (list === null) throw new Error("本地检查列表未挂载");
    for (let index = 0; index < 12; index += 1) {
      const item = document.createElement("article");
      item.className = "mentor-hint";
      item.setAttribute("role", "listitem");
      if (index === 11) item.dataset.e2eLastHint = "true";
      const action = document.createElement("button");
      action.type = "button";
      action.className = "mentor-hint__action";
      action.textContent = `检查 ${String(index + 1)}：定位证据并验证下一步实验。`;
      item.append(action);
      list.append(item);
    }
  });

  const layout = await page.evaluate(() => {
    const host = document.querySelector<HTMLElement>("#mentor-hints-host");
    const lastHint = document.querySelector<HTMLElement>("[data-e2e-last-hint='true']");
    if (host === null || lastHint === null) {
      throw new Error("本地检查滚动夹具未挂载");
    }
    const before = host.scrollTop;
    host.scrollTop = host.scrollHeight;
    const hostBounds = host.getBoundingClientRect();
    const lastHintBounds = lastHint.getBoundingClientRect();
    return {
      overflowY: getComputedStyle(host).overflowY,
      scrollable: host.scrollHeight > host.clientHeight,
      moved: host.scrollTop > before,
      lastHintReachable:
        lastHintBounds.top >= hostBounds.top && lastHintBounds.bottom <= hostBounds.bottom,
    };
  });

  expect(layout.overflowY).toBe("auto");
  expect(layout.scrollable).toBe(true);
  expect(layout.moved).toBe(true);
  expect(layout.lastHintReachable).toBe(true);
  const lastHintAction = page.locator("[data-e2e-last-hint='true'] .mentor-hint__action");
  await lastHintAction.focus();
  await expect(lastHintAction).toBeFocused();

  const splitter = page.locator(
    "#work-area > .resizable-layout__splitter[data-splitter-for='primary']",
  );
  const splitterBounds = await splitter.boundingBox();
  expect(splitterBounds?.height ?? 0).toBeGreaterThanOrEqual(10);
});
