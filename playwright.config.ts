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
  use: {
    trace: "retain-on-failure",
  },
});
