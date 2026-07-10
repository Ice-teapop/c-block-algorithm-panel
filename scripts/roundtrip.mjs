import { spawn } from "node:child_process";

const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const child = spawn(
  npmCommand,
  ["exec", "--", "vitest", "run", "tests/core/gold-roundtrip.test.ts"],
  {
    cwd: process.cwd(),
    env: process.env,
    shell: false,
    stdio: "inherit",
  },
);

child.once("error", (error) => {
  console.error(`无法启动 M1 round-trip：${error.message}`);
  process.exitCode = 1;
});
child.once("close", (code, signal) => {
  if (code === 0 && signal === null) {
    console.log("✓ M1 全金样本投影、逐字符重建与幂等门禁通过");
    return;
  }
  console.error(`✗ M1 round-trip 失败：code=${String(code)}, signal=${String(signal)}`);
  process.exitCode = 1;
});
