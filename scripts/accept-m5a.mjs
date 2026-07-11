import { spawn } from "node:child_process";

const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const stages = Object.freeze([
  ["格式门禁", ["run", "format:check"]],
  ["CFG、def-use、内存与精确 findings", ["run", "verify:m5a:analysis"]],
  [
    "Explanation v2",
    ["exec", "vitest", "run", "tests/ui/explanation.test.ts", "tests/ui/explanation-view.test.ts"],
  ],
  ["生产构建", ["run", "build"]],
]);

await runMilestone("M5a", stages);

function runMilestone(label, entries) {
  return entries
    .reduce(
      (previous, [stage, args]) => previous.then(() => runStage(label, stage, args)),
      Promise.resolve(),
    )
    .then(() => console.log(`\n✓ ${label} 全部门禁通过`))
    .catch((error) => {
      console.error(`\n✗ ${label} 停在首个失败门禁：${error.message}`);
      process.exitCode = 1;
    });
}

function runStage(label, stage, args) {
  return new Promise((resolveStage, rejectStage) => {
    console.log(`\n[${label}] ${stage}`);
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
        rejectStage(new Error(`${stage} 未通过（code=${String(code)}, signal=${String(signal)}）`));
    });
  });
}
