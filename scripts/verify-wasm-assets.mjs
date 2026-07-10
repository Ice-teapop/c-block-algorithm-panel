import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const assets = Object.freeze([
  Object.freeze({
    name: "web-tree-sitter.wasm",
    packageName: "web-tree-sitter",
    expectedVersion: "0.26.10",
  }),
  Object.freeze({
    name: "tree-sitter-c.wasm",
    packageName: "tree-sitter-c",
    expectedVersion: "0.24.1",
  }),
]);

const failures = [];
const builtDigests = [];
let builtAssetNames = [];

try {
  builtAssetNames = (await readdir(join(projectRoot, "dist", "assets"))).filter((name) =>
    name.endsWith(".wasm"),
  );
} catch (error) {
  failures.push(`无法枚举 dist/assets：${formatError(error)}`);
}

if (builtAssetNames.length !== assets.length) {
  failures.push(
    `dist/assets 必须恰好包含 ${assets.length} 枚 WASM，实际 ${builtAssetNames.length}：${builtAssetNames.join(", ")}`,
  );
}

for (const asset of assets) {
  const packageRoot = join(projectRoot, "node_modules", asset.packageName);
  const packageManifest = JSON.parse(await readFile(join(packageRoot, "package.json"), "utf8"));
  if (packageManifest.version !== asset.expectedVersion) {
    failures.push(
      `${asset.packageName} 版本漂移：期望 ${asset.expectedVersion}，实际 ${String(packageManifest.version)}`,
    );
    continue;
  }

  const source = await readRequired(join(packageRoot, asset.name), `${asset.packageName} 源 WASM`);
  const vendored = await readRequired(
    join(projectRoot, "resources", "wasm", asset.name),
    `resources/${asset.name}`,
  );
  const assetStem = asset.name.slice(0, -".wasm".length);
  const matchingBuiltNames = builtAssetNames.filter(
    (name) => name.startsWith(`${assetStem}-`) && name.endsWith(".wasm"),
  );
  if (matchingBuiltNames.length !== 1) {
    failures.push(
      `${asset.name} 必须对应唯一哈希构建产物，实际 ${matchingBuiltNames.length}：${matchingBuiltNames.join(", ")}`,
    );
    continue;
  }
  const builtName = matchingBuiltNames[0];
  if (builtName === undefined) {
    continue;
  }
  const built = await readRequired(
    join(projectRoot, "dist", "assets", builtName),
    `dist/assets/${builtName}`,
  );
  if (source === undefined || vendored === undefined || built === undefined) {
    continue;
  }

  if (!source.equals(vendored)) {
    failures.push(`${asset.name} 的 vendored 副本与锁定 npm 包不一致`);
  }
  if (!source.equals(built)) {
    failures.push(`${asset.name} 的构建产物与锁定 npm 包不一致`);
  }
  if (!WebAssembly.validate(built)) {
    failures.push(`${asset.name} 不是有效 WebAssembly 模块`);
  }
  builtDigests.push(`${builtName}=${sha256(built)}`);
}

let rendererJavaScript = "";
try {
  const assetDirectory = join(projectRoot, "dist", "assets");
  const files = (await readdir(assetDirectory)).filter((name) => name.endsWith(".js"));
  rendererJavaScript = (
    await Promise.all(files.map((name) => readFile(join(assetDirectory, name), "utf8")))
  ).join("\n");
} catch (error) {
  failures.push(`无法读取 renderer JS 构建产物：${formatError(error)}`);
}

for (const asset of assets) {
  const assetStem = asset.name.slice(0, -".wasm".length);
  const builtName = builtAssetNames.find(
    (name) => name.startsWith(`${assetStem}-`) && name.endsWith(".wasm"),
  );
  if (builtName !== undefined && !rendererJavaScript.includes(builtName)) {
    failures.push(`renderer JS 未引用 ${builtName}`);
  }
}

if (failures.length > 0) {
  for (const failure of failures) {
    console.error(`✗ ${failure}`);
  }
  process.exitCode = 1;
} else {
  console.log(`✓ WASM 资产有效且逐字节一致（${builtDigests.join(", ")}）`);
}

async function readRequired(path, label) {
  try {
    return await readFile(path);
  } catch (error) {
    failures.push(`${label} 缺失或不可读：${formatError(error)}`);
    return undefined;
  }
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function formatError(error) {
  return error instanceof Error ? error.message : String(error);
}
