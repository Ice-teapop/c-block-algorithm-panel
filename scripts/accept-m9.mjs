import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { assertReleaseGateOrder } from "./lib/installed-dmg-gate.mjs";

const expected = Object.freeze({
  version: "0.0.2",
  engine: ">=24.0.0 <25",
  npm: "npm@11.11.0",
  repository: "https://github.com/Ice-teapop/c-block-algorithm-panel.git",
  builderConfig: "build/electron-builder.release.json",
});

const root = new URL("../", import.meta.url);
const require = createRequire(import.meta.url);
const { validateConfiguration } = require("app-builder-lib/out/util/config/config.js");
const failures = [];
let checks = 0;

const readText = (path) => readFile(new URL(path, root), "utf8");
const readJson = async (path) => JSON.parse(await readText(path));

function check(condition, message) {
  checks += 1;
  if (!condition) failures.push(message);
}

function includes(text, fragment, label) {
  check(text.includes(fragment), `${label} 缺少 ${fragment}`);
}

const [
  manifest,
  lockfile,
  builder,
  betaBuilder,
  ci,
  release,
  toolchain,
  credentialGate,
  installedDmgGate,
  installedDmgSupport,
  entitlements,
  inheritedEntitlements,
  gitignore,
  license,
  nvmrc,
  nodeVersion,
  workspaceRootSource,
  playwrightConfiguration,
] = await Promise.all([
  readJson("package.json"),
  readJson("package-lock.json"),
  readJson(expected.builderConfig),
  readJson("build/electron-builder.beta.json"),
  readText(".github/workflows/ci.yml"),
  readText(".github/workflows/release.yml"),
  readText("scripts/verify-toolchain.mjs"),
  readText("scripts/verify-macos-release-credentials.mjs"),
  readText("scripts/verify-installed-dmg.mjs"),
  readText("scripts/lib/installed-dmg-gate.mjs"),
  readText("build/entitlements.mac.plist"),
  readText("build/entitlements.mac.inherit.plist"),
  readText(".gitignore"),
  readText("LICENSE"),
  readText(".nvmrc"),
  readText(".node-version"),
  readText("electron/main/workspace-root.ts"),
  readText("playwright.config.ts"),
]);
const legacyPersistenceSources = await Promise.all(
  [
    "src/ui/interface-preferences.ts",
    "src/ui/theme-controller.ts",
    "src/learning/contracts.ts",
    "src/ui/ai-edit-permission.ts",
    "src/ui/ai-workspace-window.ts",
    "src/app/ai-workspace-integration.ts",
    "src/app/guided-lesson-workspace-controller.ts",
  ].map(readText),
);
const workspaceStoreSource = await readText("electron/main/workspace-store.ts");
const currentReleaseNotes = await readText(`docs/releases/v${expected.version}.md`);

check(manifest.version === expected.version, `package version 必须为 ${expected.version}`);
check(/^0\.\d+\.\d+$/u.test(manifest.version), "当前公开版本线只允许 0.x.y 初始版本");
check(manifest.name === "c-block-algorithm-panel", "内部 package name 必须保持旧数据兼容");
check(manifest.private === true, "npm 包必须保持 private，防止误发布到 npm");
check(manifest.license === "MIT", "package license 必须为 MIT");
check(manifest.packageManager === expected.npm, `packageManager 必须为 ${expected.npm}`);
check(manifest.engines?.node === expected.engine, `engines.node 必须为 ${expected.engine}`);
check(nvmrc.trim() === "24.14.0", ".nvmrc 必须固定当前 Node 24 LTS");
check(nodeVersion.trim() === "24.14.0", ".node-version 必须固定当前 Node 24 LTS");
check(manifest.repository?.url === expected.repository, "GitHub repository 元数据不正确");
includes(currentReleaseNotes, `# AlgoLatch v${expected.version}`, "current release notes");
includes(currentReleaseNotes, "Developer ID", "current release notes");
check(
  !currentReleaseNotes.includes("Control-click bypass required"),
  "签名版说明不得要求绕过 Gatekeeper",
);
check(
  manifest.build?.extends === `file:${expected.builderConfig}`,
  "package.json 默认 build 必须继承 release 配置",
);
check(manifest.build?.mac?.icon === "build/icon.icns", "package.json 缺少 macOS 图标入口");
check(manifest.scripts?.["accept:m9"] === "node scripts/accept-m9.mjs", "缺少 accept:m9");
check(
  manifest.scripts?.["notices:check"] === "node scripts/generate-third-party-notices.mjs --check",
  "缺少 notices:check",
);
check(
  manifest.scripts?.["verify:installed-dmg"] === "node scripts/verify-installed-dmg.mjs",
  "缺少 verify:installed-dmg",
);
check(
  manifest.scripts?.["verify:installed-dmg:beta"] ===
    "node scripts/verify-installed-dmg.mjs --allow-unsigned",
  "缺少显式未签名 Beta 安装态门禁",
);
check(
  manifest.scripts?.["verify:mac-release-credentials"] ===
    "node scripts/verify-macos-release-credentials.mjs",
  "缺少 macOS 正式发布凭据门禁",
);
check(
  manifest.scripts?.["accept:m0-m5-regression"] === "node scripts/accept-m0-m5-regression.mjs",
  "缺少 accept:m0-m5-regression",
);
for (const milestone of ["m6", "m7", "m8", "m6-m8"]) {
  check(
    manifest.scripts?.[`accept:${milestone}`] === `node scripts/accept-${milestone}.mjs`,
    `缺少 accept:${milestone}`,
  );
}
includes(manifest.scripts?.["dist:mac"] ?? "", expected.builderConfig, "dist:mac");
includes(manifest.scripts?.["dist:mac"] ?? "", "--publish never", "dist:mac");
includes(manifest.scripts?.["dist:mac"] ?? "", "verify:mac-release-credentials", "dist:mac");
includes(
  manifest.scripts?.["dist:mac:beta"] ?? "",
  "build/electron-builder.beta.json",
  "dist:mac:beta",
);

const directPlatformPin = "@typescript/typescript-darwin-arm64";
check(
  manifest.devDependencies?.[directPlatformPin] === undefined,
  `不得直接锁定 ${directPlatformPin}`,
);

const lockedRoot = lockfile.packages?.[""];
check(lockfile.version === expected.version, "package-lock 顶层 version 与 manifest 不一致");
check(lockedRoot?.version === expected.version, "package-lock 根包 version 与 manifest 不一致");
check(lockedRoot?.license === "MIT", "package-lock 根包缺少 MIT license");
check(lockedRoot?.engines?.node === expected.engine, "package-lock 根包 Node engine 不一致");
check(
  lockedRoot?.devDependencies?.[directPlatformPin] === undefined,
  `package-lock 根包仍直接锁定 ${directPlatformPin}`,
);
check(
  lockfile.packages?.[`node_modules/${directPlatformPin}`]?.optional === true,
  `${directPlatformPin} 只能作为 TypeScript 的可选平台依赖存在`,
);
check(
  lockfile.packages?.["node_modules/typescript"]?.optionalDependencies?.[directPlatformPin] ===
    manifest.devDependencies?.typescript,
  "TypeScript 的可选平台依赖版本与直接 TypeScript 版本不一致",
);

check(builder.appId === "io.han.c-block-algorithm-panel", "electron-builder appId 不正确");
check(builder.productName === "AlgoLatch", "正式构建 productName 必须为 AlgoLatch");
check(builder.directories?.output === "release", "electron-builder 输出目录必须为 release");
for (const packagedDocument of [
  "package-lock.json",
  "LICENSE",
  "NOTICE.md",
  "THIRD_PARTY_NOTICES.md",
  "PRIVACY.md",
  "SECURITY.md",
]) {
  check(builder.files?.includes(packagedDocument), `发布包未包含 ${packagedDocument}`);
}
check(builder.mac?.identity === undefined, "正式构建不得禁用签名或固定证书名称");
check(builder.electronDownload?.force === false, "Electron 下载缓存不得被强制绕过");
check(
  builder.electronDownload?.checksums?.["electron-v43.0.0-darwin-arm64.zip"] ===
    "e6994f68dba65a6371577eaf68ac69a5858d2c52371869837c64affc6157eca5",
  "Electron arm64 官方 SHA-256 必须固定",
);
check(
  builder.electronDownload?.checksums?.["electron-v43.0.0-darwin-x64.zip"] ===
    "c0102711ff41d8329426e2ca7378fa13a467775e721b69ebe413c0898da14f6e",
  "Electron x64 官方 SHA-256 必须固定",
);
check(builder.mac?.forceCodeSigning === true, "正式构建必须 fail-closed 强制代码签名");
check(builder.mac?.type === "distribution", "正式构建必须锁定 distribution 证书类型");
check(builder.mac?.hardenedRuntime === true, "正式构建必须启用 Hardened Runtime");
check(builder.mac?.strictVerify === true, "正式构建必须启用严格签名验证");
check(builder.mac?.preAutoEntitlements === false, "正式构建必须禁用自动 entitlement 扩张");
check(builder.mac?.notarize === true, "正式构建必须启用 notarization");
check(
  builder.mac?.entitlements === "build/entitlements.mac.plist",
  "正式构建缺少主应用 entitlements",
);
check(
  builder.mac?.entitlementsInherit === "build/entitlements.mac.inherit.plist",
  "正式构建缺少继承 entitlements",
);
check(builder.dmg?.sign === false, "公证应用所在 DMG 不应额外签名");
check(
  builder.mac?.artifactName === "AlgoLatch-${version}-${arch}.${ext}",
  "DMG artifactName 必须包含版本、架构和扩展名",
);
check(betaBuilder.productName === "AlgoLatch", "Beta 构建 productName 必须为 AlgoLatch");
check(betaBuilder.directories?.output === "release-beta", "未签名 Beta 必须使用独立输出目录");
check(betaBuilder.mac?.identity === null, "未签名 Beta 必须显式设置 mac.identity=null");
check(betaBuilder.mac?.hardenedRuntime === false, "未签名 Beta 必须禁用 Hardened Runtime");
check(betaBuilder.mac?.notarize === false, "未签名 Beta 必须禁用 notarization");
check(betaBuilder.dmg?.sign === false, "未签名 Beta DMG 必须显式设置 sign=false");
check(
  betaBuilder.mac?.artifactName === "AlgoLatch-${version}-unsigned-${arch}.${ext}",
  "未签名 Beta 文件名必须显式包含 unsigned",
);
for (const entitlement of [entitlements, inheritedEntitlements]) {
  includes(entitlement, "com.apple.security.cs.allow-jit", "macOS entitlements");
  check(
    !entitlement.includes("com.apple.security.cs.allow-unsigned-executable-memory"),
    "Electron 12+ 不得启用 allow-unsigned-executable-memory",
  );
  check(!entitlement.includes("disable-library-validation"), "不得无依据禁用 library validation");
}

const macTargets = builder.mac?.target;
check(Array.isArray(macTargets) && macTargets.length === 1, "发布配置只应声明一个 macOS target");
const dmgTarget = Array.isArray(macTargets) ? macTargets[0] : undefined;
check(dmgTarget?.target === "dmg", "发布 target 必须为 DMG");
check(
  Array.isArray(dmgTarget?.arch) &&
    dmgTarget.arch.length === 1 &&
    dmgTarget.arch[0] === "universal",
  "发布 DMG 必须只构建 universal 架构",
);

try {
  await validateConfiguration(builder, { isEnabled: false, add() {} });
  check(true, "electron-builder schema");
} catch (error) {
  check(
    false,
    `electron-builder schema 校验失败：${error instanceof Error ? error.message : String(error)}`,
  );
}

includes(toolchain, "const expectedNodeMajor = 24;", "verify-toolchain");
check(!toolchain.includes('"v25.8.1"'), "verify-toolchain 仍锁定已迁出的 Node 25");
includes(credentialGate, "assertMacReleaseCredentials", "macOS release credential gate");
includes(credentialGate, "APPLE_API_KEY", "macOS release credential gate");
includes(installedDmgGate, "requireMacPlatform(process.platform)", "verify-installed-dmg");
includes(installedDmgGate, 'runFile("/usr/bin/hdiutil"', "verify-installed-dmg");
includes(installedDmgGate, 'runFile("/usr/bin/ditto"', "verify-installed-dmg");
includes(installedDmgGate, '"/usr/bin/lipo"', "verify-installed-dmg");
includes(installedDmgGate, '"/usr/bin/codesign"', "verify-installed-dmg");
includes(installedDmgGate, '"/usr/sbin/spctl"', "verify-installed-dmg");
includes(installedDmgGate, '["stapler", "validate", installedApp]', "verify-installed-dmg");
includes(installedDmgGate, '"com.apple.quarantine"', "verify-installed-dmg");
includes(installedDmgGate, "validateReleaseEntitlements", "verify-installed-dmg");
includes(installedDmgGate, "validateBundleMetadata", "verify-installed-dmg");
includes(installedDmgGate, "rendererTeam !== applicationTeam", "verify-installed-dmg");
includes(installedDmgSupport, "Hardened Runtime", "installed-dmg support");
includes(installedDmgSupport, "CFBundleIdentifier", "installed-dmg support");
includes(installedDmgSupport, "超出固定最小集合", "installed-dmg support");
includes(installedDmgGate, 'asarCli, "list", asarPath', "verify-installed-dmg");
includes(installedDmgGate, "app.isPackaged", "verify-installed-dmg");
includes(installedDmgGate, '[data-tour-target="create-entry"]', "verify-installed-dmg");
includes(installedDmgGate, "mountDmgArguments(dmgPath, mountPoint)", "verify-installed-dmg");
includes(installedDmgGate, "await detachMountedDmg(mountPoint)", "verify-installed-dmg");
includes(installedDmgGate, "executablePath,", "verify-installed-dmg");
includes(installedDmgGate, 'locator("#startup-loader")', "verify-installed-dmg");
includes(installedDmgGate, 'querySelector("#dashboard-panel")', "verify-installed-dmg");
includes(installedDmgGate, 'querySelector("#parser-status")', "verify-installed-dmg");
includes(installedDmgGate, 'PANEL_INSTALLED_DMG_GATE: "1"', "verify-installed-dmg");
includes(installedDmgGate, 'querySelector("#workspace-save-status")', "verify-installed-dmg");
includes(installedDmgGate, 'querySelectorAll("[data-menu-root-trigger]")', "verify-installed-dmg");
includes(workspaceRootSource, 'options.installedGate !== "1"', "workspace-root");
includes(workspaceRootSource, 'startsWith("c-block-installed-dmg-")', "workspace-root");
includes(
  workspaceStoreSource,
  'WORKSPACE_ROOT_NAME = "C Algorithm Workbench"',
  "managed workspace compatibility",
);
for (const source of legacyPersistenceSources) {
  includes(source, "c-block-algorithm-panel", "legacy local persistence ID");
}
includes(installedDmgSupport, '"-readonly"', "installed-dmg support");
includes(installedDmgSupport, "selectSingleArtifact", "installed-dmg support");
check(
  installedDmgGate.indexOf('runFile("/usr/bin/ditto"') <
    installedDmgGate.indexOf("await detachMountedDmg(mountPoint)"),
  "verify-installed-dmg 必须先复制 .app 再卸载 DMG",
);
check(
  installedDmgGate.indexOf("await detachMountedDmg(mountPoint)") <
    installedDmgGate.indexOf("application = await electron.launch"),
  "verify-installed-dmg 必须先卸载 DMG 再启动复制后的应用",
);
includes(gitignore, "!/build/electron-builder.release.json", ".gitignore");
includes(gitignore, "!/build/entitlements.mac.plist", ".gitignore");
includes(gitignore, "!/build/entitlements.mac.inherit.plist", ".gitignore");
includes(license, "MIT License", "LICENSE");
includes(license, "Copyright (c) 2026 HAN Chen", "LICENSE");

for (const document of [
  "SECURITY.md",
  "PRIVACY.md",
  "NOTICE.md",
  "CHANGELOG.md",
  "CONTRIBUTING.md",
]) {
  const contents = await readText(document);
  check(contents.trim().length > 100, `${document} 缺失或内容不足`);
}

check(!ci.includes("pull_request_target"), "CI 禁止使用高风险 pull_request_target");
includes(ci, "node-version: 24", "CI");
includes(ci, "npm install --global npm@11.11.0", "CI");
includes(ci, "npm ci", "CI");
includes(ci, "npm run accept:m9", "CI");
includes(ci, "npm run notices:check", "CI");
includes(ci, "npm test", "CI");
includes(ci, "npm run accept:m0-m5-regression", "CI");
includes(ci, "npm run build", "CI");
includes(ci, "npm run test:e2e", "CI");
includes(ci, "id: electron_e2e", "CI");
includes(ci, "steps.electron_e2e.outcome == 'failure'", "CI");
includes(ci, "Upload Electron failure traces", "CI");
includes(ci, "${{ runner.temp }}/c-block-algorithm-panel-playwright", "CI");
includes(ci, "actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683", "CI");
includes(ci, "actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020", "CI");
includes(ci, "actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02", "CI");
includes(ci, "persist-credentials: false", "CI");

includes(release, '      - "v*"', "release workflow");
includes(release, "RELEASE_TAG: ${{ github.ref_name }}", "release workflow");
includes(release, "npm run accept:m9", "release workflow");
includes(release, "npm run notices:check", "release workflow");
includes(release, "npm run accept:m6", "release workflow");
includes(release, "npm run accept:m7", "release workflow");
includes(release, "npm run accept:m8", "release workflow");
includes(release, "npm run accept:m0-m5-regression", "release workflow");
includes(release, "npm run test:e2e", "release workflow");
includes(release, "id: electron_e2e", "release workflow");
includes(release, "steps.electron_e2e.outcome == 'failure'", "release workflow");
includes(release, "Upload Electron failure traces", "release workflow");
includes(release, "${{ runner.temp }}/c-block-algorithm-panel-playwright", "release workflow");
includes(release, "npm run dist:mac", "release workflow");
includes(release, "npm run verify:installed-dmg", "release workflow");
includes(release, "MACOS_CERTIFICATE_P12_BASE64", "release workflow");
includes(release, "APPLE_API_KEY_P8_BASE64", "release workflow");
includes(release, "APPLE_API_KEY_ID", "release workflow");
includes(release, "APPLE_API_ISSUER", "release workflow");
includes(release, '--title "AlgoLatch ${GITHUB_REF_NAME}"', "release workflow");
includes(release, "environment: macos-release", "release workflow");
includes(release, "git merge-base --is-ancestor", "release workflow");
includes(release, "Remove temporary notarization key", "release workflow");
check(!release.includes("gh release edit"), "已发布 Release 元数据不得被工作流覆盖");
check(!release.includes("--clobber"), "已发布 Release 资产不得被工作流覆盖");
includes(release, "shasum -a 256", "release workflow");
includes(release, "shasum -a 256 --check", "release workflow");
includes(
  release,
  "actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02",
  "release workflow",
);
includes(
  release,
  "actions/download-artifact@d3f86a106a0bac45b974a628896c90dbdf5c8093",
  "release workflow",
);
includes(release, "actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683", "release workflow");
includes(
  release,
  "actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020",
  "release workflow",
);
includes(release, "persist-credentials: false", "release workflow");
includes(release, "permissions:\n      contents: write", "release publish job");
includes(release, "gh release view", "release workflow");
includes(release, "gh release create", "release workflow");
includes(release, "--verify-tag", "release workflow");
includes(release, "--latest", "release workflow");
includes(release, 'notes_file="docs/releases/${GITHUB_REF_NAME}.md"', "release workflow");
check(!release.includes("--prerelease"), "正式 GitHub Release 不得标记为 prerelease");
includes(playwrightConfiguration, "process.env.RUNNER_TEMP ?? tmpdir()", "Playwright config");
includes(playwrightConfiguration, '"c-block-algorithm-panel-playwright"', "Playwright config");
try {
  assertReleaseGateOrder(release);
  check(true, "release workflow installed-DMG order");
} catch (error) {
  check(
    false,
    error instanceof Error ? error.message : "release workflow 的安装态 DMG 门禁顺序无效",
  );
}

const releaseTag = process.env.RELEASE_TAG?.trim();
if (releaseTag !== undefined && releaseTag.length > 0) {
  check(releaseTag === `v${manifest.version}`, `tag ${releaseTag} 与 v${manifest.version} 不一致`);
}

if (failures.length > 0) {
  for (const failure of failures) console.error(`✗ ${failure}`);
  console.error(`\nM9 发布基础未通过：${failures.length}/${checks} 项失败`);
  process.exitCode = 1;
} else {
  console.log(`✓ M9 发布基础通过：${checks} 项离线配置检查`);
  console.log("  正式通道强制 Developer ID、Hardened Runtime、公证、staple 与安装态验证。");
  console.log("  未签名构建只保留在显式 Beta 通道，不允许发布流程调用。");
}
