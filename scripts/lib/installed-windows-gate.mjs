import {
  selectSingleArtifact,
  validateAsarEntries,
  validateInstalledWorkbenchSnapshot,
} from "./installed-dmg-gate.mjs";
import {
  WINDOWS_TOOLCHAIN,
  WINDOWS_TOOLCHAIN_REQUIRED_MANIFEST_PATHS,
  isWindowsToolchainManifestPath,
} from "./windows-toolchain.mjs";

export { selectSingleArtifact, validateAsarEntries, validateInstalledWorkbenchSnapshot };

export const WINDOWS_PRODUCT_NAME = "AlgoLatch";
export const WINDOWS_EXECUTABLE_NAME = `${WINDOWS_PRODUCT_NAME}.exe`;
export const WINDOWS_UNINSTALLER_NAME = `Uninstall ${WINDOWS_PRODUCT_NAME}.exe`;
export const WINDOWS_INSTALLER_PREFIX = `${WINDOWS_PRODUCT_NAME}-Setup-`;
export const WINDOWS_RELEASE_DIRECTORY = "release-windows";
export const WINDOWS_BETA_DIRECTORY = "release-windows-beta";
export const WINDOWS_CANARY_STDOUT = "ALGOLATCH_WINDOWS_CANARY\n";
export const WINDOWS_REQUIRED_RUNTIME_FILE_PATHS = WINDOWS_TOOLCHAIN_REQUIRED_MANIFEST_PATHS;

const REQUIRED_SIGNATURE_LABELS = Object.freeze(["installer", "application", "uninstaller"]);
const WINDOWS_RUNTIME_MANIFEST_KEYS = Object.freeze([
  "architecture",
  "files",
  "llvmVersion",
  "schemaVersion",
  "sourceSha256",
  "sourceUrl",
  "target",
  "toolchainVersion",
]);
const UNSIGNED_MARKER = /(?:^|[-_. ])unsigned(?:[-_. ]|$)/iu;
const THUMBPRINT = /^[A-F0-9]{40,64}$/u;
const SHA256 = /^[a-f0-9]{64}$/u;

export function requireWindowsInstallGate(platform, environment) {
  if (platform !== "win32") {
    throw new Error(`Windows 安装态门禁只允许在 Windows 运行，当前平台：${platform}`);
  }
  const explicitlyEnabled = environment?.PANEL_WINDOWS_INSTALL_GATE === "1";
  const runningInCi = environment?.CI === "true" || environment?.CI === "1";
  if (!explicitlyEnabled && !runningInCi) {
    throw new Error(
      "Windows 安装态门禁会安装和卸载程序，只允许在 CI 或 PANEL_WINDOWS_INSTALL_GATE=1 时运行",
    );
  }
}

export function parseWindowsVerificationMode(arguments_) {
  if (!Array.isArray(arguments_)) throw new TypeError("Windows 门禁参数必须是数组");
  if (arguments_.length === 0) {
    return Object.freeze({
      requireAuthenticode: true,
      releaseDirectoryName: WINDOWS_RELEASE_DIRECTORY,
    });
  }
  if (arguments_.length === 1 && arguments_[0] === "--allow-unsigned") {
    return Object.freeze({
      requireAuthenticode: false,
      releaseDirectoryName: WINDOWS_BETA_DIRECTORY,
    });
  }
  throw new Error(`未知 Windows 安装态验证参数：${arguments_.join(" ")}`);
}

export function selectWindowsInstaller(entries, options) {
  const installer = selectSingleArtifact(
    entries,
    ".exe",
    "file",
    `${options?.directoryLabel ?? "Windows release 目录"}中的 installer`,
  );
  const expectedVersion = String(options?.expectedVersion ?? "").trim();
  if (!installer.startsWith(WINDOWS_INSTALLER_PREFIX) || expectedVersion.length === 0) {
    throw new Error("Windows installer 名称或期望版本无效");
  }
  if (!installer.toLowerCase().includes(`-${expectedVersion.toLowerCase()}-`)) {
    throw new Error(`Windows installer 文件名没有包含版本 ${expectedVersion}`);
  }
  const hasUnsignedMarker = UNSIGNED_MARKER.test(installer);
  if (options?.requireAuthenticode === true && hasUnsignedMarker) {
    throw new Error("正式 Windows installer 不得带有 unsigned 标记");
  }
  if (options?.requireAuthenticode !== true && !hasUnsignedMarker) {
    throw new Error("未签名 Beta installer 文件名必须明确包含 unsigned");
  }
  return installer;
}

export function validateAuthenticodeSignatures(records) {
  if (!Array.isArray(records) || records.length !== REQUIRED_SIGNATURE_LABELS.length) {
    throw new Error("Authenticode 检查必须精确覆盖 installer、application 与 uninstaller");
  }
  const byLabel = new Map();
  for (const record of records) {
    const validated = validateAuthenticodeSignatureRecord(record);
    const { label } = validated;
    if (!REQUIRED_SIGNATURE_LABELS.includes(label) || byLabel.has(label)) {
      throw new Error("Authenticode 检查包含未知或重复目标");
    }
    byLabel.set(
      label,
      Object.freeze({
        signerSubject: validated.signerSubject,
        signerThumbprint: validated.signerThumbprint,
      }),
    );
  }
  const installer = byLabel.get("installer");
  for (const label of ["application", "uninstaller"]) {
    const current = byLabel.get(label);
    if (
      current.signerSubject !== installer.signerSubject ||
      current.signerThumbprint !== installer.signerThumbprint
    ) {
      throw new Error(`installer 与 ${label} 的 Authenticode 发布者不一致`);
    }
  }
  return Object.freeze({
    publisherSubject: installer.signerSubject,
    publisherThumbprint: installer.signerThumbprint,
  });
}

export function validateAuthenticodeSignatureRecord(record, expectedLabel) {
  const label = typeof record?.label === "string" ? record.label : "";
  if (!REQUIRED_SIGNATURE_LABELS.includes(label)) {
    throw new Error("Authenticode 检查包含未知目标");
  }
  if (expectedLabel !== undefined && label !== expectedLabel) {
    throw new Error(`Authenticode 检查期望 ${expectedLabel}，实际 ${label}`);
  }
  if (record.status !== "Valid") {
    throw new Error(`${label} 的 Authenticode 状态不是 Valid`);
  }
  return Object.freeze({
    label,
    signerSubject: requiredText(record.signerSubject, `${label} 发布者`),
    signerThumbprint: validateThumbprint(record.signerThumbprint, `${label} 发布证书`),
    timestampSubject: requiredText(record.timestampSubject, `${label} 时间戳机构`),
    timestampThumbprint: validateThumbprint(record.timestampThumbprint, `${label} 时间戳证书`),
  });
}

export function parsePowerShellJson(output, label) {
  return parseJsonDocument(output, label);
}

export function parseJsonDocument(output, label) {
  const source = String(output)
    .replace(/^\uFEFF/u, "")
    .trim();
  if (source.length === 0) throw new Error(`${label} 没有返回 JSON`);
  try {
    return JSON.parse(source);
  } catch {
    throw new Error(`${label} 返回了无效 JSON`);
  }
}

export function validateWindowsRuntimeManifest(value) {
  if (!isRecord(value) || !sameKeys(value, WINDOWS_RUNTIME_MANIFEST_KEYS)) {
    throw new Error("Windows runtime manifest 结构无效");
  }
  if (
    value.schemaVersion !== WINDOWS_TOOLCHAIN.schemaVersion ||
    value.toolchainVersion !== WINDOWS_TOOLCHAIN.toolchainVersion ||
    value.llvmVersion !== WINDOWS_TOOLCHAIN.llvmVersion ||
    value.architecture !== WINDOWS_TOOLCHAIN.architecture ||
    value.target !== WINDOWS_TOOLCHAIN.target ||
    value.sourceUrl !== WINDOWS_TOOLCHAIN.sourceUrl ||
    value.sourceSha256 !== WINDOWS_TOOLCHAIN.sourceSha256
  ) {
    throw new Error("Windows runtime manifest 与锁定工具链不一致");
  }
  if (!isRecord(value.files)) {
    throw new Error("Windows runtime manifest files 结构无效");
  }
  const filePaths = Object.keys(value.files);
  if (filePaths.join("\n") !== sortedPaths(filePaths).join("\n")) {
    throw new Error("Windows runtime manifest files 键没有排序");
  }
  for (const requiredPath of WINDOWS_REQUIRED_RUNTIME_FILE_PATHS) {
    if (!filePaths.includes(requiredPath)) {
      throw new Error(`Windows runtime manifest 漏掉固定项：${requiredPath}`);
    }
  }
  const files = {};
  for (const path of filePaths) {
    if (!isWindowsToolchainManifestPath(path)) {
      throw new Error(`Windows runtime manifest 包含未允许路径：${path}`);
    }
    const digest = value.files[path];
    if (typeof digest !== "string" || !SHA256.test(digest)) {
      throw new Error(`Windows runtime manifest 的 ${path} SHA-256 无效`);
    }
    files[path] = digest;
  }
  return Object.freeze({
    schemaVersion: WINDOWS_TOOLCHAIN.schemaVersion,
    toolchainVersion: WINDOWS_TOOLCHAIN.toolchainVersion,
    llvmVersion: WINDOWS_TOOLCHAIN.llvmVersion,
    architecture: WINDOWS_TOOLCHAIN.architecture,
    target: WINDOWS_TOOLCHAIN.target,
    sourceUrl: WINDOWS_TOOLCHAIN.sourceUrl,
    sourceSha256: WINDOWS_TOOLCHAIN.sourceSha256,
    files: Object.freeze(files),
  });
}

export function validateWindowsRuntimeDigests(manifest, actualDigests) {
  const validatedManifest = validateWindowsRuntimeManifest(manifest);
  const manifestPaths = Object.keys(validatedManifest.files);
  if (!isRecord(actualDigests) || !sameKeys(actualDigests, manifestPaths)) {
    throw new Error("Windows runtime 实际摘要没有精确覆盖 manifest 文件");
  }
  for (const path of manifestPaths) {
    const actual = actualDigests[path];
    if (typeof actual !== "string" || !SHA256.test(actual)) {
      throw new Error(`Windows runtime 的 ${path} 实际 SHA-256 无效`);
    }
    if (actual !== validatedManifest.files[path]) {
      throw new Error(`Windows runtime 的 ${path} 与 manifest 摘要不一致`);
    }
  }
}

export function windowsJobHostArguments(options) {
  const metricsPath = validateWindowsAbsolutePath(options?.metricsPath, "broker metrics 路径");
  const command = validateWindowsAbsolutePath(options?.command, "broker 目标命令");
  const memoryBytes = positiveSafeInteger(options?.memoryBytes, "broker 内存上限");
  const processLimit = positiveSafeInteger(options?.processLimit, "broker 进程上限");
  const cpuMs = positiveSafeInteger(options?.cpuMs, "broker CPU 上限");
  if (!Array.isArray(options?.args)) throw new Error("broker 目标参数必须是数组");
  const args = options.args.map((argument) => {
    if (typeof argument !== "string" || argument.includes("\0")) {
      throw new Error("broker 目标参数包含无效值");
    }
    return argument;
  });
  return Object.freeze([
    "--metrics",
    metricsPath,
    "--memory-bytes",
    String(memoryBytes),
    "--process-limit",
    String(processLimit),
    "--cpu-ms",
    String(cpuMs),
    "--",
    command,
    ...args,
  ]);
}

export function validateWindowsBrokerProcessOutcome(outcome, options) {
  const label = requiredText(options?.label, "broker 阶段标签");
  if (outcome?.errorMessage !== null && outcome?.errorMessage !== undefined) {
    throw new Error(`${label}启动或执行失败：${String(outcome.errorMessage)}`);
  }
  if (outcome?.signal !== null && outcome?.signal !== undefined) {
    throw new Error(`${label}被信号 ${String(outcome.signal)} 终止`);
  }
  if (outcome?.exitCode !== 0) {
    throw new Error(`${label}退出码不是 0（实际 ${String(outcome?.exitCode)}）`);
  }
  const stdout = normalizeNewlines(outcome?.stdout);
  const expectedStdout = normalizeNewlines(options?.expectedStdout ?? "");
  if (stdout !== expectedStdout) {
    throw new Error(`${label} stdout 与 canary 契约不一致`);
  }
  if (String(outcome?.stderr ?? "").trim().length > 0) {
    throw new Error(`${label}产生了 stderr`);
  }
}

export function validateWindowsBrokerMetrics(value, options) {
  const label = requiredText(options?.label, "broker metrics 标签");
  if (!isRecord(value) || !sameKeys(value, ["processCount", "rssBytes"])) {
    throw new Error(`${label} metrics 结构无效`);
  }
  const maxRssBytes = positiveSafeInteger(options?.maxRssBytes, `${label} RSS 上限`);
  const maxProcessCount = positiveSafeInteger(options?.maxProcessCount, `${label}进程数上限`);
  if (!Number.isSafeInteger(value.rssBytes) || value.rssBytes <= 0) {
    throw new Error(`${label}没有记录有效 RSS`);
  }
  if (!Number.isSafeInteger(value.processCount) || value.processCount <= 0) {
    throw new Error(`${label}没有记录有效进程数`);
  }
  if (value.rssBytes > maxRssBytes || value.processCount > maxProcessCount) {
    throw new Error(`${label} metrics 超过 broker 配置上限`);
  }
  return Object.freeze({ rssBytes: value.rssBytes, processCount: value.processCount });
}

export function validateWindowsInstalledCapabilities(value) {
  if (!isRecord(value)) throw new Error("Windows 安装态 capabilities 结构无效");
  if (value.runnerEnabled !== true) throw new Error("Windows 安装态 runnerEnabled 不是 true");
  if (value.mode !== "trusted-only")
    throw new Error("Windows 安装态 runner mode 不是 trusted-only");
  if (!isRecord(value.isolationProbe) || value.isolationProbe.kind !== "windows-job-object") {
    throw new Error("Windows 安装态没有启用 windows-job-object");
  }
  if (value.isolationProbe.status !== "probe-succeeded") {
    throw new Error("Windows Job Object capability probe 没有成功");
  }
  if (!isRecord(value.memoryDiagnostics) || value.memoryDiagnostics.available !== false) {
    throw new Error("Windows 安装态 memoryDiagnostics.available 必须为 false");
  }
}

export function readPeOffset(dosHeader) {
  const header = toBuffer(dosHeader, "DOS header");
  if (header.length < 64 || header[0] !== 0x4d || header[1] !== 0x5a) {
    throw new Error("AlgoLatch.exe 缺少有效 MZ header");
  }
  const offset = header.readUInt32LE(0x3c);
  if (!Number.isSafeInteger(offset) || offset < 64 || offset > 16 * 1024 * 1024) {
    throw new Error("AlgoLatch.exe 的 PE header offset 无效");
  }
  return offset;
}

export function validateX64PeHeader(peHeader) {
  const header = toBuffer(peHeader, "PE header");
  if (
    header.length < 6 ||
    header[0] !== 0x50 ||
    header[1] !== 0x45 ||
    header[2] !== 0 ||
    header[3] !== 0
  ) {
    throw new Error("AlgoLatch.exe 缺少有效 PE signature");
  }
  const machine = header.readUInt16LE(4);
  if (machine !== 0x8664) {
    throw new Error(`AlgoLatch.exe 不是 x64 PE（Machine=0x${machine.toString(16)}）`);
  }
}

export function validateWindowsVersionInfo(info, expectedVersion) {
  if (info?.productName !== WINDOWS_PRODUCT_NAME) {
    throw new Error(`AlgoLatch.exe ProductName 不是 ${WINDOWS_PRODUCT_NAME}`);
  }
  const expected = normalizeNumericVersion(expectedVersion, "期望版本");
  for (const [field, label] of [
    [info?.productVersion, "ProductVersion"],
    [info?.fileVersion, "FileVersion"],
  ]) {
    const actual = normalizeNumericVersion(field, label);
    if (!equivalentWindowsVersion(actual, expected)) {
      throw new Error(`${label} 与发布版本 ${expected.join(".")} 不一致`);
    }
  }
}

export function windowsInstallerArguments(installDirectory) {
  const directory = requiredText(installDirectory, "Windows 安装目录");
  if (!/^[A-Za-z]:\\/u.test(directory) && !/^\\\\[^\\]+\\[^\\]+/u.test(directory)) {
    throw new Error("Windows 安装目录必须是绝对路径");
  }
  return Object.freeze(["/S", "/currentuser", "/no-desktop-shortcut", `/D=${directory}`]);
}

export function windowsUninstallerArguments() {
  return Object.freeze(["/S", "/KEEP_APP_DATA"]);
}

export function validateUninstallOutcome(outcome) {
  if (outcome?.applicationExists !== false) {
    throw new Error("卸载完成后 AlgoLatch.exe 仍然存在");
  }
  if (outcome?.uninstallerExists !== false) {
    throw new Error("卸载完成后 AlgoLatch uninstaller 仍然存在");
  }
  if (outcome?.projectExists !== true) {
    throw new Error("卸载错误删除了用户项目");
  }
}

function requiredText(value, label) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${label}缺失`);
  }
  return value.trim();
}

function validateThumbprint(value, label) {
  const normalized = requiredText(value, label).replace(/\s+/gu, "").toUpperCase();
  if (!THUMBPRINT.test(normalized)) throw new Error(`${label} thumbprint 无效`);
  return normalized;
}

function toBuffer(value, label) {
  if (!(value instanceof Uint8Array)) throw new TypeError(`${label} 必须是 Uint8Array`);
  return Buffer.from(value.buffer, value.byteOffset, value.byteLength);
}

function normalizeNumericVersion(value, label) {
  const source = requiredText(value, label)
    .split(/[+-]/u, 1)[0]
    .replace(/,\s*/gu, ".")
    .replace(/\s+/gu, "");
  if (!/^\d+(?:\.\d+){1,3}$/u.test(source)) throw new Error(`${label} 不是 Windows 数字版本`);
  return source.split(".").map((part) => Number.parseInt(part, 10));
}

function equivalentWindowsVersion(actual, expected) {
  const width = Math.max(actual.length, expected.length);
  for (let index = 0; index < width; index += 1) {
    if ((actual[index] ?? 0) !== (expected[index] ?? 0)) return false;
  }
  return true;
}

function validateWindowsAbsolutePath(value, label) {
  const path = requiredText(value, label);
  if (
    path.includes("\0") ||
    (!/^[A-Za-z]:[\\/]/u.test(path) && !/^\\\\[^\\]+\\[^\\]+/u.test(path))
  ) {
    throw new Error(`${label}必须是绝对 Windows 路径`);
  }
  return path;
}

function positiveSafeInteger(value, label) {
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`${label}必须是正安全整数`);
  return value;
}

function normalizeNewlines(value) {
  return String(value ?? "").replace(/\r\n?/gu, "\n");
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function sameKeys(value, expectedKeys) {
  return sortedPaths(Object.keys(value)).join("\n") === sortedPaths(expectedKeys).join("\n");
}

function sortedPaths(paths) {
  return [...paths].sort((left, right) => (left < right ? -1 : left > right ? 1 : 0));
}
