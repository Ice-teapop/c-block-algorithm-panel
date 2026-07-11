import { spawn } from "node:child_process";

const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const stages = Object.freeze([
  ["工具链", ["run", "verify:toolchain"]],
  ["格式", ["run", "format:check"]],
  ["全量单元、集成与架构回归", ["test"]],
  ["生产构建", ["run", "build"]],
  [
    "M5 Electron 静态诊断、Explanation v2 与双闸实机",
    ["exec", "playwright", "test", "tests/e2e/m5-diagnostics.spec.ts"],
  ],
]);

try {
  for (const [label, args] of stages) await runStage(label, args);
  console.log("\n✓ M5 全部门禁通过");
} catch (error) {
  console.error(
    `\n✗ M5 停在首个失败门禁：${error instanceof Error ? error.message : String(error)}`,
  );
  process.exitCode = 1;
}

function runStage(label, args) {
  return new Promise((resolveStage, rejectStage) => {
    console.log(`\n[M5] ${label}`);
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
