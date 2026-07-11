import {
  _electron as electron,
  expect,
  test,
  type ElectronApplication,
  type Locator,
  type Page,
} from "@playwright/test";
import { access, mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const SOURCE = `${[
  "int main(void) {",
  "  int x = 1;",
  "  if (x) {",
  "    x++;",
  "  }",
  "  else {",
  "    x--;",
  "  }",
  "  return 0;",
  "}",
].join("\n")}\n`;

let application: ElectronApplication | undefined;
let page: Page;
let workspaceRoot = "";
let projectDirectory = "";

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  workspaceRoot = await mkdtemp(join(tmpdir(), "c-block-m6-m8-e2e-"));
  const inheritedEnvironment = Object.fromEntries(
    Object.entries(process.env).filter(
      (entry): entry is [string, string] => entry[1] !== undefined,
    ),
  );
  application = await electron.launch({
    args: ["."],
    chromiumSandbox: true,
    env: {
      ...inheritedEnvironment,
      PANEL_RUNNER_MODE: "trusted-only",
      PANEL_WORKSPACE_ROOT: workspaceRoot,
    },
  });
  page = await application.firstWindow();
  await page.evaluate(() => globalThis.localStorage.clear());
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.locator("#startup-loader")).toBeHidden();
  await expect(page.locator("#parser-status")).toHaveAttribute("data-state", "ready");

  await page.getByRole("button", { name: "新建", exact: true }).click();
  const create = page.getByRole("dialog", { name: "新建工作区条目" });
  await create.getByRole("combobox", { name: "条目类型" }).selectOption("project");
  await create.getByRole("textbox", { name: "条目名称" }).fill("M6 自由画布");
  await create.getByRole("button", { name: "创建并打开" }).click();
  await expect(page.getByRole("tab", { name: "搭建", exact: true })).toHaveAttribute(
    "aria-selected",
    "true",
  );

  const projectIds = await readdir(join(workspaceRoot, "Projects"));
  const projectId = projectIds[0];
  if (projectId === undefined) throw new Error("M6 E2E 项目目录不存在");
  projectDirectory = join(workspaceRoot, "Projects", projectId);

  const content = page.locator(".cm-content");
  await content.click();
  await page.keyboard.press("Meta+A");
  await page.keyboard.insertText(SOURCE);
  await expect(page.locator("#workspace-save-status")).toHaveAttribute("data-state", "saved");
  await expect.poll(() => readFile(join(projectDirectory, "main.c"), "utf8")).toBe(SOURCE);
  await expect(page.locator("#parser-status")).toHaveAttribute("data-analysis-state", "complete");
  await expect(page.locator(".flow-node[data-node-kind='branch']")).toHaveCount(1);

  await requireApplication().evaluate(({ dialog }) => {
    const mutableDialog = dialog as unknown as {
      showMessageBox: () => Promise<{
        readonly response: number;
        readonly checkboxChecked: boolean;
      }>;
    };
    mutableDialog.showMessageBox = async () => ({ response: 1, checkboxChecked: false });
  });
});

test.afterAll(async () => {
  await application?.close();
  await rm(workspaceRoot, { recursive: true, force: true });
});

test("uses four expandable Dock roots, links Library branches and defaults to light", async () => {
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expect(page.locator("[data-menu-root-trigger]")).toHaveText([
    "设置",
    "预设块",
    "Library",
    "面板预览",
  ]);

  await openMenuBranch("Library", "C 语法词典");
  await expect(page.locator("#software-library-panel")).toBeVisible();
  await expect(page.locator("#workbench-shell")).toHaveAttribute("data-library-branch", "c-syntax");
  await expect(
    page.locator("[data-library-branch-id='c-syntax'][aria-current='true']"),
  ).toBeVisible();
  await expect(page.locator(".software-library__detail h2")).not.toHaveText("");

  await openMenuBranch("设置", "外观");
  const drawer = page.locator("#workbench-drawer");
  await expect(drawer).toBeVisible();
  await expect(drawer).toContainText("浅色为默认界面");
  await page.getByRole("button", { name: "切换为深色主题" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.getByRole("button", { name: "切换为浅色主题" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.getByRole("button", { name: "关闭设置" }).click();
});

test("keeps root scrolling locked while every meaningful region is independently resizable", async () => {
  await page.getByRole("tab", { name: "搭建", exact: true }).click();
  const splitters = page.locator(".resizable-layout__splitter");
  await expect(splitters).toHaveCount(7);
  await expect(page.locator("#build-layout > .resizable-layout__splitter")).toHaveCount(2);
  await expect(page.locator("#left-pane > .resizable-layout__splitter")).toHaveCount(1);
  await expect(page.locator("#center-pane > .resizable-layout__splitter")).toHaveCount(1);
  await expect(page.locator("#right-pane > .resizable-layout__splitter")).toHaveCount(1);
  await expect(page.locator("#run-panel > .resizable-layout__splitter")).toHaveCount(2);

  const mainSplitter = page.locator(
    "#build-layout > .resizable-layout__splitter[data-splitter-for='left']",
  );
  const initialSize = Number(await mainSplitter.getAttribute("aria-valuenow"));
  await mainSplitter.focus();
  await page.keyboard.press("ArrowRight");
  await expect(mainSplitter).toHaveAttribute("aria-valuenow", String(initialSize + 8));

  const scrolling = await page.evaluate(() => {
    const palette = document.querySelector<HTMLElement>("#block-palette .block-palette__list");
    const code = document.querySelector<HTMLElement>("#code-pane .cm-scroller");
    const canvas = document.querySelector<HTMLElement>("#flow-canvas");
    if (palette === null || code === null || canvas === null) {
      throw new Error("独立滚动区域未挂载");
    }
    palette.scrollTop = 120;
    return {
      rootLocked:
        document.documentElement.scrollHeight === document.documentElement.clientHeight &&
        document.body.scrollHeight === document.body.clientHeight,
      paletteOverflow: getComputedStyle(palette).overflowY,
      paletteScrollable: palette.scrollHeight > palette.clientHeight,
      paletteScrollTop: palette.scrollTop,
      codeOverflow: getComputedStyle(code).overflowY,
      codeScrollTop: code.scrollTop,
      canvasOverflow: getComputedStyle(canvas).overflow,
    };
  });
  expect(scrolling.rootLocked).toBe(true);
  expect(scrolling.paletteOverflow).toBe("auto");
  expect(scrolling.paletteScrollable).toBe(true);
  expect(scrolling.paletteScrollTop).toBeGreaterThan(0);
  expect(scrolling.codeOverflow).toBe("auto");
  expect(scrolling.codeScrollTop).toBe(0);
  expect(scrolling.canvasOverflow).toBe("hidden");
});

test("drags a projected node freely and restores its sidecar position after reload", async () => {
  const node = page.locator(".flow-node[data-node-kind='declaration']").first();
  await expect(node).toBeVisible();
  await node.click();
  const detail = page.getByRole("region", { name: "节点详情" });
  await expect(detail).toBeVisible();
  await expect(detail.getByRole("textbox", { name: /的 C 源码$/u })).toHaveValue(/int x = 1;/u);
  await expect(detail).toContainText("静态诊断：");
  await expect(detail).toContainText("运行证据：");
  await expect(detail).toContainText("main.c 的精确投影");
  await detail.getByRole("button", { name: "收起", exact: true }).click();
  await expect(detail).toHaveAttribute("data-minimized", "true");

  const before = await node.evaluate((element) => (element as HTMLElement).style.transform);
  const bounds = await node.boundingBox();
  if (bounds === null) throw new Error("声明节点不可拖动");
  await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
  await page.mouse.down();
  await page.mouse.move(bounds.x + bounds.width / 2 + 96, bounds.y + bounds.height / 2 + 54, {
    steps: 6,
  });
  await page.mouse.up();
  const moved = await node.evaluate((element) => (element as HTMLElement).style.transform);
  expect(moved).not.toBe(before);
  const position = /^translate\(([-0-9.]+)px, ([-0-9.]+)px\)$/u.exec(moved);
  if (position === null) throw new Error(`节点坐标格式异常：${moved}`);
  const expectedPosition = { x: Number(position[1]), y: Number(position[2]) };

  const sidecarPath = join(projectDirectory, "flow-view.json");
  await expect
    .poll(async () => {
      try {
        const document = JSON.parse(await readFile(sidecarPath, "utf8")) as {
          readonly payload?: {
            readonly viewState?: {
              readonly positions?: readonly {
                readonly anchor?: {
                  readonly structurePath?: string;
                  readonly kind?: string;
                  readonly nodeType?: string | null;
                  readonly textFingerprint?: string;
                };
                readonly point?: { readonly x?: number; readonly y?: number };
              }[];
            };
          };
        };
        const declarationPositions = (document.payload?.viewState?.positions ?? []).filter(
          (entry) =>
            entry.anchor?.kind === "declaration" && entry.anchor.nodeType === "declaration",
        );
        if (declarationPositions.length !== 1) return null;
        const entry = declarationPositions[0];
        if (
          entry?.point?.x === undefined ||
          entry.point.y === undefined ||
          entry.anchor?.structurePath === undefined ||
          entry.anchor.textFingerprint === undefined
        ) {
          return null;
        }
        return {
          point: { x: entry.point.x, y: entry.point.y },
          hasMainStructurePath: /^function:main:0\/node:declaration:declaration:\d+$/u.test(
            entry.anchor.structurePath,
          ),
          hasTextFingerprint: entry.anchor.textFingerprint.length > 0,
        };
      } catch {
        return null;
      }
    })
    .toEqual({
      point: expectedPosition,
      hasMainStructurePath: true,
      hasTextFingerprint: true,
    });

  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.locator("#startup-loader")).toBeHidden();
  const row = page.getByRole("link", { name: "打开项目“M6 自由画布”" });
  await row.focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("#parser-status")).toHaveAttribute("data-analysis-state", "complete");
  const restored = page.locator(".flow-node[data-node-kind='declaration']");
  await expect(restored).toHaveCount(1);
  await expect
    .poll(() => restored.evaluate((element) => (element as HTMLElement).style.transform))
    .toBe(moved);
  await expect(page.getByRole("region", { name: "节点详情" })).toBeVisible();
  await page.getByRole("button", { name: "关闭", exact: true }).click();
});

test("shows virtual presets and edits detached source drafts without touching main.c", async () => {
  const search = page.getByRole("searchbox", { name: "筛选积木" });
  const canvas = page.locator("#flow-canvas");

  await search.fill("暂停");
  const pause = page.locator(".block-palette__drag-surface[data-template-id='builtin.flow.pause']");
  await expect(pause).toBeVisible();
  await expect(pause).toContainText("虚拟控制节点 · 不改变 C 语义");
  await pause.dragTo(canvas, { targetPosition: { x: 260, y: 180 } });
  const pauseDraft = page.getByRole("button", { name: "暂停，未接入草稿" });
  await expect(pauseDraft).toBeVisible();
  const pauseSource = page.getByRole("textbox", { name: "暂停 草稿源码" });
  await expect(pauseSource).toBeDisabled();
  await expect(pauseSource).toHaveValue(/不生成或改写 C 语句/u);

  await search.fill("声明整数");
  const declaration = page.locator(
    ".block-palette__drag-surface[data-template-id='builtin.c.declare-integer']",
  );
  await declaration.dragTo(canvas, { targetPosition: { x: 430, y: 230 } });
  const declarationDraft = page.getByRole("button", { name: "声明整数，未接入草稿" });
  await expect(declarationDraft).toBeVisible();
  const draftSource = page.getByRole("textbox", { name: "声明整数 草稿源码" });
  await expect(draftSource).toHaveValue("int value = 0;");
  await draftSource.fill("int draft_value = 7;");
  await page.getByRole("button", { name: "保存草稿快照" }).click();
  await expect(draftSource).toHaveValue("int draft_value = 7;");
  expect(await editorText()).toBe(SOURCE);
});

test("keeps teaching simulation isolated, then renders a backend-confirmed real Trace path", async () => {
  await page.getByRole("tab", { name: "运行", exact: true }).click();
  const tracePanel = page.locator(".trace-panel");
  const traceEvents = page.locator(".trace-panel__event");
  await expect(tracePanel).toHaveAttribute("data-status", "idle");

  await page.getByRole("button", { name: "教学模拟" }).click();
  await expect(page.locator(".scenario-panel__status")).toHaveText("教学模拟请求已完成");
  await expect(page.locator(".flow-node[data-execution-mode='simulation']").first()).toBeVisible();
  await expect(traceEvents).toHaveCount(0);
  expect(await fileExists(join(projectDirectory, "run-history.json"))).toBe(false);

  await page.getByRole("button", { name: "开始 Trace" }).click();
  await expect(tracePanel).toHaveAttribute("data-status", "completed", { timeout: 20_000 });
  await expect(traceEvents.first()).toBeVisible();
  expect(await traceEvents.count()).toBeGreaterThan(0);
  await expect(
    page.locator(
      ".trace-panel__event[data-kind='branch'][data-branch-taken='true'][data-trace-mode='real']",
    ),
  ).toHaveCount(1);
  await expect(page.locator(".trace-panel__events")).toHaveAttribute("data-trace-mode", "real");
  await expect(page.locator(".flow-node[data-execution-mode='real']").first()).toBeVisible();
  await expect(page.locator("[data-trace-field='operation-count']")).toContainText(
    "真实 Trace 事件",
  );
  expect(await fileExists(join(projectDirectory, "run-history.json"))).toBe(false);
});

function requireApplication(): ElectronApplication {
  if (application === undefined) throw new Error("Electron 应用尚未启动");
  return application;
}

function menuTrigger(name: string): Locator {
  return page.locator("[data-menu-root-trigger]").filter({ hasText: name });
}

async function openMenuBranch(rootName: string, branchName: string): Promise<void> {
  const trigger = menuTrigger(rootName);
  if ((await trigger.getAttribute("aria-expanded")) !== "true") await trigger.click();
  const menu = page.getByRole("menu", { name: rootName });
  await expect(menu).toBeVisible();
  await menu.getByRole("menuitem", { name: branchName, exact: true }).click();
}

async function editorText(): Promise<string> {
  return page
    .locator(".cm-line")
    .evaluateAll((lines) => lines.map((line) => line.textContent ?? "").join("\n"));
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}
