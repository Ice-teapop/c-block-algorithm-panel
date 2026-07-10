import { spawn } from "node:child_process";

const DEFAULT_RUNS = 5_000;
const DEFAULT_SEED = 0x4c0de;
const parsed = parseArguments(process.argv.slice(2));
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const child = spawn(
  npmCommand,
  ["exec", "--", "vitest", "run", "tests/core/generator-fuzz.test.ts"],
  {
    cwd: process.cwd(),
    env: {
      ...process.env,
      M4_GENERATOR_RUNS: String(parsed.runs),
      M4_GENERATOR_SEED: String(parsed.seed),
      M4_GENERATOR_WRITE_REGRESSION: "cli-deep-run",
    },
    shell: false,
    stdio: "inherit",
  },
);

child.once("error", (error) => {
  console.error(`无法启动 M4 generator fuzz：${error.message}`);
  process.exitCode = 1;
});
child.once("close", (code, signal) => {
  if (code === 0 && signal === null) {
    console.log(`✓ M4 generator fuzz 通过：runs=${parsed.runs}, seed=${parsed.seed}`);
    return;
  }
  console.error(
    `✗ M4 generator fuzz 失败：runs=${parsed.runs}, seed=${parsed.seed}, code=${String(code)}, signal=${String(signal)}；shrink path 与回归文件见上方失败详情`,
  );
  process.exitCode = 1;
});

function parseArguments(arguments_) {
  let runs = DEFAULT_RUNS;
  let seed = DEFAULT_SEED;
  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index];
    if (argument === "--runs" || argument === "--seed") {
      const value = arguments_[index + 1];
      if (value === undefined) throw new Error(`${argument} 缺少值`);
      if (argument === "--runs") {
        runs = requireInteger(value, "--runs", 1, 100_000);
      } else {
        seed = requireInteger(value, "--seed", -0x80000000, 0x7fffffff);
      }
      index += 1;
      continue;
    }
    if (argument?.startsWith("--runs=")) {
      runs = requireInteger(argument.slice("--runs=".length), "--runs", 1, 100_000);
      continue;
    }
    if (argument?.startsWith("--seed=")) {
      seed = requireInteger(argument.slice("--seed=".length), "--seed", -0x80000000, 0x7fffffff);
      continue;
    }
    throw new Error(`未知参数：${String(argument)}`);
  }
  return Object.freeze({ runs, seed });
}

function requireInteger(value, label, minimum, maximum) {
  const parsedValue = Number(value);
  if (!Number.isSafeInteger(parsedValue) || parsedValue < minimum || parsedValue > maximum) {
    throw new Error(`${label} 必须是 ${minimum} 到 ${maximum} 的整数`);
  }
  return parsedValue;
}
