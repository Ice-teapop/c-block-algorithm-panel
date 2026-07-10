import { spawn } from "node:child_process";

const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const stages = Object.freeze([
  ["M0 全量回归", ["run", "accept:m0"]],
  ["WASM 静态资产", ["run", "verify:wasm-assets"]],
  ["全金样本无损投影", ["run", "verify:roundtrip"]],
  ["2000 例变异 fuzz", ["run", "fuzz", "--", "--runs", "2000"]],
]);

const runStage = (label, args) =>
  new Promise((resolve, reject) => {
    console.log(`\n[M1] ${label}`);
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
  console.log("\n✓ M1 全部门禁通过");
} catch (error) {
  console.error(
    `\n✗ M1 停在首个失败门禁：${error instanceof Error ? error.message : String(error)}`,
  );
  process.exitCode = 1;
}
