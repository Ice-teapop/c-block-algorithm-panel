import { tmpdir } from "node:os";
import { join } from "node:path";
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 30_000,
  outputDir: join(tmpdir(), "c-block-algorithm-panel-playwright"),
  reporter: "line",
  webServer: {
    command: "npm run dev:web -- --host 127.0.0.1 --port 5173 --strictPort",
    url: "http://127.0.0.1:5173/",
    reuseExistingServer: false,
    timeout: 30_000,
  },
  use: {
    trace: "retain-on-failure",
  },
});
