import { spawn } from "node:child_process";

const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";

export async function runMilestone(label, stages) {
  try {
    for (const [stage, args] of stages) await runStage(label, stage, args);
    console.log(`\n✓ ${label} 全部门禁通过`);
  } catch (error) {
    console.error(
      `\n✗ ${label} 停在首个失败门禁：${error instanceof Error ? error.message : String(error)}`,
    );
    process.exitCode = 1;
  }
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
