import {
  _electron as electron,
  expect,
  test,
  type ElectronApplication,
  type Page,
} from "@playwright/test";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

let application: ElectronApplication | undefined;
let page: Page;
let workspaceRoot = "";

test.beforeAll(async () => {
  workspaceRoot = await mkdtemp(join(tmpdir(), "c-block-dashboard-e2e-"));
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
  await expect(page.locator("#parser-status")).toHaveAttribute("data-state", "ready");
  await expect(page.locator("#startup-loader")).toBeHidden();
});

test.afterAll(async () => {
  await application?.close();
  await rm(workspaceRoot, { recursive: true, force: true });
});

test("starts on an empty, dense Dashboard instead of silently loading a demo", async () => {
  await expect(page.getByRole("tab", { name: "Dashboard" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(page.locator(".workspace-dashboard")).toBeVisible();
  await expect(page.getByText("这里还没有本地条目。")).toBeVisible();
  await expect(page.locator(".cm-line")).toHaveText([""]);
  await expect(page.locator(".workspace-dashboard__sidebar")).toHaveCSS("width", "188px");
  await expect(page.getByRole("button", { name: "项目", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "沙箱", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "测试", exact: true })).toBeVisible();
});

test("creates a real project folder, enters the workbench and reopens it after reload", async () => {
  await page.getByRole("button", { name: "新建", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "新建工作区条目" });
  await dialog.getByRole("combobox", { name: "条目类型" }).selectOption("project");
  await dialog.getByRole("textbox", { name: "条目名称" }).fill("二分搜索");
  await dialog.getByRole("button", { name: "创建并打开" }).click();

  await expect(page.getByRole("tab", { name: "搭建", exact: true })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(page.locator("#file-name")).toHaveText("二分搜索.c");
  await expect(page.locator(".cm-line")).toHaveText([
    "int main(void) {",
    "  return 0;",
    "}",
    "",
  ]);

  const projectIds = await readdir(join(workspaceRoot, "Projects"));
  expect(projectIds).toHaveLength(1);
  const projectId = projectIds[0];
  if (projectId === undefined) throw new Error("项目目录不存在");
  expect(await readFile(join(workspaceRoot, "Projects", projectId, "main.c"), "utf8")).toBe(
    "int main(void) {\n  return 0;\n}\n",
  );

  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.locator("#parser-status")).toHaveAttribute("data-state", "ready");
  await expect(page.locator("#startup-loader")).toBeHidden();
  await expect(page.getByRole("tab", { name: "Dashboard" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await page.getByRole("button", { name: "二分搜索", exact: true }).click();
  await expect(page.locator("#file-name")).toHaveText("二分搜索.c");
  await expect(page.getByRole("tab", { name: "搭建", exact: true })).toHaveAttribute(
    "aria-selected",
    "true",
  );
});
