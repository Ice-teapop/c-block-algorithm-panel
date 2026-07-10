import { spawn } from "node:child_process";
import electronPath from "electron";

const DEFAULT_DEV_SERVER_PORT = "5173";
const DEV_SERVER_WAIT_TIMEOUT_MS = 30_000;
const DEV_SERVER_POLL_INTERVAL_MS = 200;

const port = process.env.PANEL_DEV_SERVER_PORT ?? DEFAULT_DEV_SERVER_PORT;
const developmentServerUrl = process.env.PANEL_DEV_SERVER_URL ?? `http://127.0.0.1:${port}`;

const sleep = (durationMs) => new Promise((resolve) => setTimeout(resolve, durationMs));

const waitForDevelopmentServer = async () => {
  const deadline = Date.now() + DEV_SERVER_WAIT_TIMEOUT_MS;

  while (Date.now() < deadline) {
    try {
      const response = await fetch(developmentServerUrl, {
        signal: AbortSignal.timeout(1_000),
      });
      if (response.ok) {
        return;
      }
    } catch {
      // Vite is expected to reject connections while it is still starting.
    }
    await sleep(DEV_SERVER_POLL_INTERVAL_MS);
  }

  throw new Error(
    `等待 Vite 开发服务器超时（${DEV_SERVER_WAIT_TIMEOUT_MS}ms）：${developmentServerUrl}`,
  );
};

await waitForDevelopmentServer();

const electronProcess = spawn(electronPath, ["."], {
  env: {
    ...process.env,
    VITE_DEV_SERVER_URL: developmentServerUrl,
  },
  stdio: "inherit",
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => electronProcess.kill(signal));
}

electronProcess.once("error", (error) => {
  console.error("Electron 启动失败", error);
  process.exitCode = 1;
});

electronProcess.once("exit", (code, signal) => {
  if (signal !== null) {
    process.kill(process.pid, signal);
    return;
  }
  process.exitCode = code ?? 1;
});
