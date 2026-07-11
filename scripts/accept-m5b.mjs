import { spawn } from "node:child_process";

const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const stages = Object.freeze([
  ["Apple clang 工具链", ["run", "verify:toolchain"]],
  ["诊断、IPC、双闸与 UI 单元门禁", ["run", "verify:m5b"]],
  ["真实 Electron M5b", ["run", "test:e2e:m5"]],
]);

try {
  for (const [label, args] of stages) await runStage(label, args);
  console.log("\n✓ M5b 全部门禁通过");
} catch (error) {
  console.error(
    `\n✗ M5b 停在首个失败门禁：${error instanceof Error ? error.message : String(error)}`,
  );
  process.exitCode = 1;
}

function runStage(label, args) {
  return new Promise((resolveStage, rejectStage) => {
    console.log(`\n[M5b] ${label}`);
    const child = spawn(npmCommand, args, {
      cwd: process.cwd(),
      env: process.env,
      shell: false,
      stdio: "inherit",
    });
    child.once("error", rejectStage);
    child.once("close", (code, signal) => {
      if (code === 0 && signal === null) resolveStage();
      else
        rejectStage(new Error(`${label} 未通过（code=${String(code)}, signal=${String(signal)}）`));
    });
  });
}
