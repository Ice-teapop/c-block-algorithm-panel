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

test("keeps the complete AI conversation reachable in a short runtime pane", async () => {
  await page.locator("#build-tab").click();
  await page.locator("#mentor-tab").click();
  await expect(page.locator("#mentor-panel")).toBeVisible();
  await page.waitForFunction(() => {
    const form = document.querySelector<HTMLElement>(".mentor-panel__remote-form");
    const missing = document.querySelector<HTMLElement>(".mentor-panel__setup");
    return form !== null && missing !== null && (!form.hidden || !missing.hidden);
  });

  await page.evaluate(() => {
    const form = document.querySelector<HTMLElement>(".mentor-panel__remote-form");
    const missing = document.querySelector<HTMLElement>(".mentor-panel__setup");
    if (form === null || missing === null) throw new Error("AI 对话表单未挂载");
    form.hidden = false;
    missing.hidden = true;
  });

  const layout = await page.evaluate(() => {
    const host = document.querySelector<HTMLElement>("#mentor-hints-host");
    const actions = document.querySelector<HTMLElement>(".mentor-panel__remote-actions");
    const prompt = document.querySelector<HTMLTextAreaElement>(".mentor-panel__composer textarea");
    if (host === null || actions === null || prompt === null) {
      throw new Error("AI 对话控件未挂载");
    }
    const before = host.scrollTop;
    host.scrollTop = host.scrollHeight;
    const hostBounds = host.getBoundingClientRect();
    const actionBounds = actions.getBoundingClientRect();
    const promptBounds = prompt.getBoundingClientRect();
    return {
      overflowY: getComputedStyle(host).overflowY,
      scrollable: host.scrollHeight > host.clientHeight,
      moved: host.scrollTop > before,
      actionsReachable:
        actionBounds.top >= hostBounds.top && actionBounds.bottom <= hostBounds.bottom,
      promptReachable:
        promptBounds.top >= hostBounds.top && promptBounds.bottom <= hostBounds.bottom,
    };
  });

  expect(layout.overflowY).toBe("auto");
  expect(layout.scrollable).toBe(true);
  expect(layout.moved).toBe(true);
  expect(layout.actionsReachable).toBe(true);
  expect(layout.promptReachable).toBe(true);
  await page.locator(".mentor-panel__composer textarea").focus();
  await page.keyboard.insertText("解释当前算法");
  await expect(page.locator(".mentor-panel__composer textarea")).toHaveValue("解释当前算法");

  const splitter = page.locator(
    "#work-area > .resizable-layout__splitter[data-splitter-for='primary']",
  );
  const splitterBounds = await splitter.boundingBox();
  expect(splitterBounds?.height ?? 0).toBeGreaterThanOrEqual(10);
});
