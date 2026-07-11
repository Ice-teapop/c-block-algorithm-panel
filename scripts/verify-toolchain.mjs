import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { promisify } from "node:util";

const expectedNodeMajor = 24;
const expectedNodeEngine = ">=24.0.0 <25";
const expectedNpmVersion = "11.11.0";
const exactVersion = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/u;
const runFile = promisify(execFile);

const readJson = async (path) => JSON.parse(await readFile(path, "utf8"));

const manifest = await readJson(new URL("../package.json", import.meta.url));
const lockfile = await readJson(new URL("../package-lock.json", import.meta.url));

const failures = [];

const readCommandVersion = async (command, args, label) => {
  try {
    const { stdout, stderr } = await runFile(command, args, {
      encoding: "utf8",
      env: { PATH: process.env.PATH ?? "/usr/local/bin:/usr/bin:/bin" },
      timeout: 5_000,
      maxBuffer: 64 * 1024,
    });
    return `${stdout}${stderr}`.trim();
  } catch (error) {
    failures.push(`${label} 无法执行：${error instanceof Error ? error.message : String(error)}`);
    return undefined;
  }
};

if (Number(process.versions.node.split(".")[0]) !== expectedNodeMajor) {
  failures.push(`Node 版本不符：要求 Node ${expectedNodeMajor}.x LTS，实际 ${process.version}`);
}

if (manifest.engines?.node !== expectedNodeEngine) {
  failures.push(
    `engines.node 不符：期望 ${expectedNodeEngine}，实际 ${String(manifest.engines?.node)}`,
  );
}

if (manifest.packageManager !== `npm@${expectedNpmVersion}`) {
  failures.push(
    `packageManager 不符：期望 npm@${expectedNpmVersion}，实际 ${String(manifest.packageManager)}`,
  );
}

const [actualNpmVersion, clangVersion] = await Promise.all([
  readCommandVersion("/usr/bin/env", ["npm", "--version"], "npm"),
  readCommandVersion("/usr/bin/clang", ["--version"], "Apple clang"),
]);

if (actualNpmVersion !== undefined && actualNpmVersion !== expectedNpmVersion) {
  failures.push(`npm 版本不符：期望 ${expectedNpmVersion}，实际 ${actualNpmVersion}`);
}

if (clangVersion !== undefined && !/^Apple clang version 21\./u.test(clangVersion)) {
  failures.push(
    `clang 未验证：要求 /usr/bin/clang 为 Apple clang 21.x，实际首行为 ${clangVersion.split("\n")[0] ?? "<空>"}`,
  );
}

const directDependencies = {
  ...(manifest.dependencies ?? {}),
  ...(manifest.devDependencies ?? {}),
};

for (const [name, version] of Object.entries(directDependencies)) {
  if (typeof version !== "string" || !exactVersion.test(version)) {
    failures.push(`直接依赖 ${name} 未锁定精确版本：${String(version)}`);
  }
}

if (lockfile.lockfileVersion !== 3) {
  failures.push(`package-lock 版本不符：期望 3，实际 ${String(lockfile.lockfileVersion)}`);
}

const lockedRoot = lockfile.packages?.[""];
if (lockedRoot === undefined) {
  failures.push("package-lock 缺少根包记录");
} else {
  const lockedDependencies = {
    ...(lockedRoot.dependencies ?? {}),
    ...(lockedRoot.devDependencies ?? {}),
  };

  for (const [name, version] of Object.entries(directDependencies)) {
    if (lockedDependencies[name] !== version) {
      failures.push(
        `manifest/lock 不一致：${name} 在 manifest 为 ${version}，在 lock 为 ${String(lockedDependencies[name])}`,
      );
    }
  }
}

if (failures.length > 0) {
  for (const failure of failures) {
    console.error(`✗ ${failure}`);
  }
  process.exitCode = 1;
} else {
  console.log(
    `✓ 工具链锁定有效（Node ${process.version}, npm ${actualNpmVersion}, ${clangVersion?.split("\n")[0]}, ${Object.keys(directDependencies).length} 个直接依赖）`,
  );
}
