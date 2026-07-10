import { spawn } from "node:child_process";

const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const stages = Object.freeze([
  ["M1 全量回归（含全部 Electron E2E）", ["run", "accept:m1"]],
  ["M2 映射、语句、符号、导入与解释契约", ["run", "verify:m2"]],
]);

const runStage = (label, args) =>
  new Promise((resolve, reject) => {
    console.log(`\n[M2] ${label}`);
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
  console.log("\n✓ M2 全部门禁通过");
} catch (error) {
  console.error(
    `\n✗ M2 停在首个失败门禁：${error instanceof Error ? error.message : String(error)}`,
  );
  process.exitCode = 1;
}
