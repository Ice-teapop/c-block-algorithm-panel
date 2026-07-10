import { spawn } from "node:child_process";

const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const stages = Object.freeze([
  ["M3a 全量回归", ["run", "accept:m3a"]],
  ["M3b 结构编辑、源码同步与恢复门禁", ["run", "verify:m3b"]],
  ["M3 局部重命名 I/O 等价矩阵", ["run", "verify:edit-equiv"]],
  ["M3b Electron 编辑闭环 E2E", ["run", "test:e2e:m3b"]],
]);

const runStage = (label, args) =>
  new Promise((resolveStage, rejectStage) => {
    console.log(`\n[M3] ${label}`);
    const child = spawn(npmCommand, args, {
      cwd: process.cwd(),
      env: process.env,
      shell: false,
      stdio: "inherit",
    });
    child.once("error", rejectStage);
    child.once("close", (code, signal) => {
      if (code === 0 && signal === null) {
        resolveStage();
        return;
      }
      rejectStage(new Error(`${label} 未通过（code=${String(code)}, signal=${String(signal)}）`));
    });
  });

try {
  for (const [label, args] of stages) {
    await runStage(label, args);
  }
  console.log("\n✓ M3 全部门禁通过");
} catch (error) {
  console.error(
    `\n✗ M3 停在首个失败门禁：${error instanceof Error ? error.message : String(error)}`,
  );
  process.exitCode = 1;
}
