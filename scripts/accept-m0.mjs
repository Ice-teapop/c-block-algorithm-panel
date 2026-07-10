import { spawn } from "node:child_process";

const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const stages = Object.freeze([
  ["工具链与锁文件", ["run", "verify:toolchain"]],
  ["TypeScript", ["run", "typecheck"]],
  ["格式与架构边界", ["run", "format:check"]],
  ["单元与集成测试", ["test"]],
  ["生产构建", ["run", "build"]],
  ["C 金样本、双泄漏闸与压力样本", ["run", "verify:samples"]],
  ["Electron IPC E2E", ["run", "test:e2e"]],
]);

const runStage = (label, args) =>
  new Promise((resolve, reject) => {
    console.log(`\n[M0] ${label}`);
    const child = spawn(npmCommand, args, {
      cwd: process.cwd(),
      env: process.env,
      shell: false,
      stdio: "inherit",
    });

    child.once("error", reject);
    child.once("close", (code, signal) => {
      if (code === 0 && signal === null) {
        resolve();
        return;
      }
      reject(new Error(`${label} 未通过（code=${String(code)}, signal=${String(signal)}）`));
    });
  });

try {
  for (const [label, args] of stages) {
    await runStage(label, args);
  }
  console.log("\n✓ M0 全部门禁通过");
} catch (error) {
  console.error(
    `\n✗ M0 停在首个失败门禁：${error instanceof Error ? error.message : String(error)}`,
  );
  process.exitCode = 1;
}
