import { execFile } from "node:child_process";
import { constants } from "node:fs";
import { access, lstat, mkdir, mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { _electron as electron } from "@playwright/test";
import {
  mountDmgArguments,
  requireMacPlatform,
  selectSingleArtifact,
  validateAsarEntries,
  validateBundleExecutableName,
  validateInstalledWorkbenchSnapshot,
  validateUniversalArchitectures,
} from "./lib/installed-dmg-gate.mjs";

const runFile = promisify(execFile);
const projectRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const releaseDirectory = join(projectRoot, "release");
const commandOptions = Object.freeze({
  encoding: "utf8",
  maxBuffer: 4 * 1024 * 1024,
  timeout: 60_000,
});

requireMacPlatform(process.platform);

let application;
let mountAttempted = false;
let detached = false;
let temporaryRoot;
let mountPoint;
const cleanupFailures = [];

try {
  const releaseEntries = await describeDirectory(releaseDirectory);
  const dmgName = selectSingleArtifact(releaseEntries, ".dmg", "file", "release/ 中的 DMG");
  const dmgPath = join(releaseDirectory, dmgName);

  temporaryRoot = await mkdtemp(join(tmpdir(), "c-block-installed-dmg-"));
  mountPoint = join(temporaryRoot, "mounted-dmg");
  const installDirectory = join(temporaryRoot, "Applications");
  await mkdir(mountPoint);
  await mkdir(installDirectory);

  await runFile("/usr/bin/hdiutil", ["verify", dmgPath], commandOptions);
  mountAttempted = true;
  await runFile("/usr/bin/hdiutil", mountDmgArguments(dmgPath, mountPoint), commandOptions);

  const mountedEntries = await describeDirectory(mountPoint);
  const appName = selectSingleArtifact(mountedEntries, ".app", "directory", "DMG 中的 .app");
  const mountedApp = join(mountPoint, appName);
  const installedApp = join(installDirectory, appName);
  await runFile("/usr/bin/ditto", [mountedApp, installedApp], commandOptions);

  await detachMountedDmg(mountPoint);
  detached = true;

  const plistPath = join(installedApp, "Contents", "Info.plist");
  const { stdout: executableOutput } = await runFile(
    "/usr/bin/plutil",
    ["-extract", "CFBundleExecutable", "raw", "-o", "-", plistPath],
    commandOptions,
  );
  const executableName = validateBundleExecutableName(executableOutput.trim());
  const executablePath = join(installedApp, "Contents", "MacOS", executableName);
  const executableStat = await lstat(executablePath);
  if (!executableStat.isFile()) throw new Error("复制后的 Contents/MacOS 可执行文件无效");
  await access(executablePath, constants.X_OK);
  const { stdout: architectures } = await runFile(
    "/usr/bin/lipo",
    ["-archs", executablePath],
    commandOptions,
  );
  validateUniversalArchitectures(architectures);
  const asarPath = join(installedApp, "Contents", "Resources", "app.asar");
  const asarCli = join(projectRoot, "node_modules", "@electron", "asar", "bin", "asar.js");
  const { stdout: asarEntries } = await runFile(
    process.execPath,
    [asarCli, "list", asarPath],
    commandOptions,
  );
  validateAsarEntries(asarEntries);

  const inheritedEnvironment = Object.fromEntries(
    Object.entries(process.env).filter(
      (entry) => entry[1] !== undefined && entry[0] !== "VITE_DEV_SERVER_URL",
    ),
  );
  application = await electron.launch({
    executablePath,
    args: [`--user-data-dir=${join(temporaryRoot, "user-data")}`],
    chromiumSandbox: true,
    env: {
      ...inheritedEnvironment,
      PANEL_INSTALLED_DMG_GATE: "1",
      PANEL_RUNNER_MODE: "trusted-only",
      PANEL_WORKSPACE_ROOT: join(temporaryRoot, "workspace"),
    },
    timeout: 30_000,
  });
  const page = await application.firstWindow({ timeout: 30_000 });
  await page.waitForLoadState("domcontentloaded");
  await page.locator("#startup-loader").waitFor({ state: "hidden", timeout: 30_000 });
  await page.waitForFunction(
    () => document.querySelector("#parser-status")?.getAttribute("data-state") === "ready",
    undefined,
    { timeout: 30_000 },
  );
  const dashboardInitiallyVisible = await page.locator("#dashboard-panel").isVisible();

  await page.getByRole("button", { name: "新建", exact: true }).click();
  const create = page.getByRole("dialog", { name: "新建工作区条目" });
  await create.getByRole("combobox", { name: "条目类型" }).selectOption("project");
  await create.getByRole("textbox", { name: "条目名称" }).fill("Installed Gate");
  await create.getByRole("button", { name: "创建并打开" }).click();
  const source =
    "int main(void) {\n  int value = 1;\n  value++;\n  return value == 2 ? 0 : 1;\n}\n";
  const editor = page.locator(".cm-content");
  await editor.click();
  await page.keyboard.press("Meta+A");
  await page.keyboard.insertText(source);
  await page.waitForFunction(
    () =>
      document.querySelector("#parser-status")?.getAttribute("data-state") === "ready" &&
      document.querySelector("#parser-status")?.getAttribute("data-analysis-state") ===
        "complete" &&
      document.querySelector("#workspace-save-status")?.getAttribute("data-state") === "saved",
    undefined,
    { timeout: 30_000 },
  );
  await page.locator(".flow-node").first().waitFor({ state: "visible", timeout: 30_000 });
  const appIsPackaged = await application.evaluate(({ app }) => app.isPackaged);

  const snapshot = await page.evaluate(
    ({ packaged, dashboardWasVisible }) => {
      const startup = document.querySelector("#startup-loader");
      const dashboard = document.querySelector("#dashboard-panel");
      const parser = document.querySelector("#parser-status");
      return {
        appIsPackaged: packaged,
        protocol: globalThis.location.protocol,
        startupHidden: startup instanceof HTMLElement && startup.hidden,
        dashboardVisible: dashboardWasVisible,
        dockLabels: Array.from(document.querySelectorAll("[data-menu-root-trigger]"), (element) =>
          element.textContent?.trim(),
        ),
        parserState: parser?.getAttribute("data-state"),
        analysisState: parser?.getAttribute("data-analysis-state"),
        flowNodeCount: document.querySelectorAll(".flow-node").length,
      };
    },
    { packaged: appIsPackaged, dashboardWasVisible: dashboardInitiallyVisible },
  );
  validateInstalledWorkbenchSnapshot(snapshot);

  await application.close();
  application = undefined;
  console.log(`✓ 已安装 DMG 门禁通过：${dmgName}（复制、卸载后启动、Dashboard/Dock/parser）`);
} catch (error) {
  console.error(`✗ 已安装 DMG 门禁失败：${formatError(error)}`);
  process.exitCode = 1;
} finally {
  if (application !== undefined) {
    try {
      await application.close();
    } catch (error) {
      cleanupFailures.push(`Electron 关闭失败：${formatError(error)}`);
    }
  }
  if (mountAttempted && !detached && mountPoint !== undefined) {
    try {
      await detachMountedDmg(mountPoint);
      detached = true;
    } catch (error) {
      cleanupFailures.push(`DMG 卸载失败：${formatError(error)}`);
    }
  }
  if (temporaryRoot !== undefined) {
    try {
      await rm(temporaryRoot, { recursive: true, force: true });
    } catch (error) {
      cleanupFailures.push(`临时目录清理失败：${formatError(error)}`);
    }
  }
  for (const failure of cleanupFailures) console.error(`✗ ${failure}`);
  if (cleanupFailures.length > 0) process.exitCode = 1;
}

async function describeDirectory(path) {
  const entries = await readdir(path, { withFileTypes: true });
  return entries.map((entry) => ({
    name: entry.name,
    kind: entry.isFile() ? "file" : entry.isDirectory() ? "directory" : "other",
  }));
}

async function detachMountedDmg(path) {
  await runFile("/usr/bin/hdiutil", ["detach", path], commandOptions);
}

function formatError(error) {
  return error instanceof Error ? error.message : String(error);
}
