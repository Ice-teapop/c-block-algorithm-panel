import {
  _electron as electron,
  expect,
  test,
  type ElectronApplication,
  type Page,
} from "@playwright/test";
import type { CompileRequest } from "../../src/shared/api.js";

let electronApplication: ElectronApplication | undefined;
let page: Page;

function getElectronApplication(): ElectronApplication {
  if (electronApplication === undefined) {
    throw new Error("Electron 应用尚未启动");
  }
  return electronApplication;
}

test.beforeAll(async () => {
  const inheritedEnvironment = Object.fromEntries(
    Object.entries(process.env).filter(
      (entry): entry is [string, string] => entry[1] !== undefined,
    ),
  );
  electronApplication = await electron.launch({
    args: ["."],
    chromiumSandbox: true,
    env: {
      ...inheritedEnvironment,
      PANEL_RUNNER_MODE: "trusted-only",
    },
  });
  page = await electronApplication.firstWindow();
});

test("keeps native trust confirmation in main and rejects stale renderer acknowledgements", async () => {
  const application = getElectronApplication();
  await application.evaluate(({ dialog }) => {
    const state = globalThis as typeof globalThis & {
      __panelTrustDialogDetails?: string[];
    };
    state.__panelTrustDialogDetails = [];
    const mutableDialog = dialog as unknown as {
      showMessageBox: (
        window: unknown,
        options: { readonly detail?: string },
      ) => Promise<{ readonly response: number; readonly checkboxChecked: boolean }>;
    };
    mutableDialog.showMessageBox = async (_window, options) => {
      state.__panelTrustDialogDetails?.push(options.detail ?? "");
      return { response: 0, checkboxChecked: false };
    };
  });

  const rejected = await page.evaluate(() =>
    window.panelApi.compile({ source: "int main(void){return 0;}" }),
  );
  expect(rejected).toMatchObject({
    ok: false,
    error: { code: "TRUST_CONFIRMATION_REQUIRED" },
  });

  const staleAcknowledgement = await page.evaluate(() => {
    const request = {
      source: "int main(void){return 0;}",
      trustedAcknowledgement: { acknowledged: true, scope: "this-request" },
    } as unknown as CompileRequest;
    return window.panelApi.compile(request);
  });
  expect(staleAcknowledgement).toMatchObject({
    ok: false,
    error: { code: "INVALID_REQUEST" },
  });

  const details = await application.evaluate(() => {
    const state = globalThis as typeof globalThis & {
      __panelTrustDialogDetails?: string[];
    };
    return state.__panelTrustDialogDetails ?? [];
  });
  expect(details).toHaveLength(1);
  expect(details[0]).toContain("操作：编译 C 源码");
  expect(details[0]).toMatch(/请求 SHA-256：[0-9a-f]{64}/u);
  expect(details[0]).toContain("授权仅绑定上述请求摘要");
});

test("opens at most one native confirmation dialog for concurrent requests", async () => {
  const application = getElectronApplication();
  await application.evaluate(({ dialog }) => {
    const state = globalThis as typeof globalThis & {
      __panelTrustDialogCount?: number;
      __resolvePanelTrustDialog?: () => void;
    };
    state.__panelTrustDialogCount = 0;
    const mutableDialog = dialog as unknown as {
      showMessageBox: () => Promise<{
        readonly response: number;
        readonly checkboxChecked: boolean;
      }>;
    };
    mutableDialog.showMessageBox = () =>
      new Promise((resolve) => {
        state.__panelTrustDialogCount = (state.__panelTrustDialogCount ?? 0) + 1;
        state.__resolvePanelTrustDialog = () => resolve({ response: 0, checkboxChecked: false });
      });
  });

  const firstRequest = page.evaluate(() =>
    window.panelApi.compile({ source: "int main(void){return 0;}" }),
  );
  await expect
    .poll(() =>
      application.evaluate(() => {
        const state = globalThis as typeof globalThis & {
          __panelTrustDialogCount?: number;
        };
        return state.__panelTrustDialogCount ?? 0;
      }),
    )
    .toBe(1);

  const concurrentRequest = await page.evaluate(() =>
    window.panelApi.compile({ source: "int main(void){return 1;}" }),
  );
  expect(concurrentRequest).toMatchObject({
    ok: false,
    error: { code: "RUNNER_BUSY" },
  });

  await application.evaluate(() => {
    const state = globalThis as typeof globalThis & {
      __resolvePanelTrustDialog?: () => void;
    };
    state.__resolvePanelTrustDialog?.();
  });
  await expect(firstRequest).resolves.toMatchObject({
    ok: false,
    error: { code: "TRUST_CONFIRMATION_REQUIRED" },
  });
  const dialogCount = await application.evaluate(() => {
    const state = globalThis as typeof globalThis & {
      __panelTrustDialogCount?: number;
    };
    return state.__panelTrustDialogCount ?? 0;
  });
  expect(dialogCount).toBe(1);
});

test("grants exactly one compile and one run after separate native confirmations", async () => {
  const application = getElectronApplication();
  await application.evaluate(({ dialog }) => {
    const state = globalThis as typeof globalThis & {
      __panelTrustResponses?: number[];
      __panelAcceptedDialogCount?: number;
    };
    state.__panelTrustResponses = [1, 1, 0];
    state.__panelAcceptedDialogCount = 0;
    const mutableDialog = dialog as unknown as {
      showMessageBox: () => Promise<{
        readonly response: number;
        readonly checkboxChecked: boolean;
      }>;
    };
    mutableDialog.showMessageBox = async () => {
      state.__panelAcceptedDialogCount = (state.__panelAcceptedDialogCount ?? 0) + 1;
      return {
        response: state.__panelTrustResponses?.shift() ?? 0,
        checkboxChecked: false,
      };
    };
  });

  const compileResult = await page.evaluate(() =>
    window.panelApi.compile({
      source: '#include <stdio.h>\nint main(void){fputs("hello\\n", stdout);return 0;}',
      sourceName: "hello.c",
    }),
  );
  expect(compileResult).toMatchObject({ ok: true });
  if (!compileResult.ok) {
    throw new Error(`hello compile failed: ${compileResult.error.message}`);
  }

  const runResult = await page.evaluate(
    (artifactId) => window.panelApi.run({ artifactId }),
    compileResult.artifactId,
  );
  expect(runResult).toMatchObject({
    ok: true,
    termination: "process-exit",
    exitCode: 0,
  });
  expect(Array.from(runResult.stdout)).toEqual(Array.from(new TextEncoder().encode("hello\n")));

  const cancelledNextRequest = await page.evaluate(() =>
    window.panelApi.compile({ source: "int main(void){return 0;}" }),
  );
  expect(cancelledNextRequest).toMatchObject({
    ok: false,
    error: { code: "TRUST_CONFIRMATION_REQUIRED" },
  });
  const dialogCount = await application.evaluate(() => {
    const state = globalThis as typeof globalThis & {
      __panelAcceptedDialogCount?: number;
    };
    return state.__panelAcceptedDialogCount ?? 0;
  });
  expect(dialogCount).toBe(3);
});

test("opens the local desktop shell with a narrow preload API", async () => {
  await expect(page).toHaveTitle("C 积木算法面板");
  await expect(page.getByRole("heading", { name: "C 积木算法面板" })).toBeVisible();

  const rendererBoundary = await page.evaluate(() => ({
    apiKeys: Object.keys(window.panelApi).sort(),
    hasNodeProcess: "process" in window,
    hasNodeRequire: "require" in window,
  }));

  expect(rendererBoundary).toEqual({
    apiKeys: ["capabilities", "compile", "run"],
    hasNodeProcess: false,
    hasNodeRequire: false,
  });

  const capabilitySnapshot = await page.evaluate(async () => {
    const first = await window.panelApi.capabilities();
    try {
      (first as { mode: string }).mode = "disabled";
      (first.seatbeltProbe as { detail: string }).detail = "renderer-tampered";
    } catch {
      // A future Electron bridge may preserve freezing; isolation is still required.
    }
    const second = await window.panelApi.capabilities();
    return {
      distinctSnapshots: first !== second,
      secondMode: second.mode,
      secondDetail: second.seatbeltProbe.detail,
    };
  });
  expect(capabilitySnapshot.distinctSnapshots).toBe(true);
  expect(capabilitySnapshot.secondMode).toBe("trusted-only");
  expect(capabilitySnapshot.secondDetail).not.toBe("renderer-tampered");

  const contentSecurityPolicy = await page
    .locator('meta[http-equiv="Content-Security-Policy"]')
    .getAttribute("content");
  expect(contentSecurityPolicy).toContain("default-src 'self'");
  expect(contentSecurityPolicy).toContain("object-src 'none'");
  expect(contentSecurityPolicy).not.toContain("unsafe-eval");
  expect(contentSecurityPolicy).not.toContain("unsafe-inline");
  const scriptSources = await page
    .locator("script[src]")
    .evaluateAll((scripts) => scripts.map((script) => (script as HTMLScriptElement).src));
  expect(scriptSources.every((source) => source.startsWith("file://"))).toBe(true);
});

test("uses the enforced BrowserWindow security preferences", async () => {
  const security = await getElectronApplication().evaluate(({ app, BrowserWindow }) => {
    const mainWindow = BrowserWindow.getAllWindows()[0] as
      | (Electron.BrowserWindow & {
          readonly panelSecurityPreferences?: Readonly<Electron.WebPreferences>;
        })
      | undefined;

    if (mainWindow === undefined) {
      throw new Error("Electron 主窗口未创建");
    }

    const processMetric = app
      .getAppMetrics()
      .find((metric) => metric.pid === mainWindow.webContents.getOSProcessId());
    const preferences = mainWindow.panelSecurityPreferences;

    return {
      contextIsolation: preferences?.contextIsolation,
      nodeIntegration: preferences?.nodeIntegration,
      sandbox: preferences?.sandbox,
      webSecurity: preferences?.webSecurity,
      rendererProcessSandboxed: processMetric?.sandboxed,
      visible: mainWindow.isVisible(),
    };
  });

  expect(security).toEqual({
    contextIsolation: true,
    nodeIntegration: false,
    sandbox: true,
    webSecurity: true,
    rendererProcessSandboxed: true,
    visible: true,
  });
});

test.afterAll(async () => {
  await electronApplication?.close();
});
