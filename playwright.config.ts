import { tmpdir } from "node:os";
import { join } from "node:path";
import { defineConfig } from "@playwright/test";

process.env.PANEL_WORKSPACE_ROOT ??= join(tmpdir(), `c-block-e2e-${String(process.pid)}`);

const requestedPort = process.env.PANEL_E2E_PORT ?? "5173";
const developmentServerPort = Number(requestedPort);
if (
  !/^\d{1,5}$/u.test(requestedPort) ||
  !Number.isInteger(developmentServerPort) ||
  developmentServerPort < 1 ||
  developmentServerPort > 65_535
) {
  throw new Error("PANEL_E2E_PORT 必须是 1 到 65535 的整数端口");
}
const developmentServerUrl = `http://127.0.0.1:${String(developmentServerPort)}/`;

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 30_000,
  expect: { timeout: 15_000 },
  outputDir: join(tmpdir(), "c-block-algorithm-panel-playwright"),
  reporter: "line",
  webServer: {
    command: `npm run dev:web -- --host 127.0.0.1 --port ${String(developmentServerPort)} --strictPort`,
    url: developmentServerUrl,
    reuseExistingServer: false,
    timeout: 30_000,
  },
  use: {
    trace: "retain-on-failure",
  },
});
