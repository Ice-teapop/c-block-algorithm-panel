import { spawn } from "node:child_process";

const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const stages = Object.freeze([
  ["M2 全量回归", ["run", "accept:m2"]],
  ["M3a 补丁、目标、事务与属性门禁", ["run", "verify:m3a"]],
  ["M3a Electron 编辑闭环 E2E", ["run", "test:e2e:m3a"]],
]);

const runStage = (label, args) =>
  new Promise((resolveStage, rejectStage) => {
    console.log(`\n[M3a] ${label}`);
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
  console.log("\n✓ M3a 全部门禁通过");
} catch (error) {
  console.error(
    `\n✗ M3a 停在首个失败门禁：${error instanceof Error ? error.message : String(error)}`,
  );
  process.exitCode = 1;
}
