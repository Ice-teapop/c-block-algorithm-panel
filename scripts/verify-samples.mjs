import { readFile, readdir } from "node:fs/promises";
import { basename, resolve, sep } from "node:path";

const projectRoot = resolve(new URL("..", import.meta.url).pathname);
const samplesRoot = resolve(projectRoot, "samples");
const pressureRoot = resolve(projectRoot, "malicious");
const backendUrl = new URL(
  "../dist-electron/electron/main/runner/verification.js",
  import.meta.url,
);
const minimumGoldSamples = 20;
const expectedPressureSamples = 5;
const knownPressureOutcomes = new Set([
  "wall_timeout",
  "cpu_limit",
  "rss_limit",
  "file_limit",
  "signal",
  "exited_nonzero",
]);
const sanitizerReportPattern =
  /AddressSanitizer|UndefinedBehaviorSanitizer|runtime error:|SUMMARY:\s+.*Sanitizer/iu;
const nonZeroLeakReportPattern = /\b[1-9]\d* leaks? for \d+ total leaked bytes\b/iu;
// ignoreBOM=true preserves U+FEFF in the decoded string, so a UTF-8 BOM
// survives the string-only compile/stdin boundary byte-for-byte.
const decoder = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });
const encoder = new TextEncoder();
let stringOutputObserved = false;

const fail = (message) => {
  throw new Error(message);
};

const listDirectories = async (root) =>
  (await readdir(root, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();

const readJson = async (path, label) => {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    fail(`${label} 不是有效 JSON：${error instanceof Error ? error.message : String(error)}`);
  }
};

const requireRecord = (value, label) => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    fail(`${label} 必须是对象`);
  }
  return value;
};

const requireStringArray = (value, label) => {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    fail(`${label} 必须是字符串数组`);
  }
  for (const item of value) {
    if (item.includes("\0")) {
      fail(`${label} 不能包含 NUL`);
    }
  }
  return Object.freeze([...value]);
};

const assertOnlyKeys = (record, allowed, label) => {
  const allowedKeys = new Set(allowed);
  const extra = Object.keys(record).filter((key) => !allowedKeys.has(key));
  if (extra.length > 0) {
    fail(`${label} 包含未知字段：${extra.join(", ")}`);
  }
};

const assertSafeRelativePath = (value, label) => {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.includes("\0") ||
    value.startsWith("/") ||
    value.includes("\\") ||
    value.split("/").some((part) => part === "" || part === "." || part === "..")
  ) {
    fail(`${label} 不是安全的相对 POSIX 路径：${String(value)}`);
  }
  return value;
};

const resolveInside = (root, relativePath, label) => {
  const candidate = resolve(root, relativePath);
  if (candidate !== root && !candidate.startsWith(`${root}${sep}`)) {
    fail(`${label} 越出允许目录：${candidate}`);
  }
  return candidate;
};

const decodeUtf8RoundTrip = (bytes, label) => {
  let text;
  try {
    text = decoder.decode(bytes);
  } catch {
    fail(
      `${label} 不是合法 UTF-8；当前 runner 的 source/stdin string 接口无法逐字节保真，拒绝继续。`,
    );
  }
  if (!Buffer.from(encoder.encode(text)).equals(Buffer.from(bytes))) {
    fail(`${label} 经 runner string 接口往返后字节发生变化，拒绝继续。`);
  }
  return text;
};

const outputBytes = (value, label) => {
  if (value instanceof Uint8Array) {
    return Buffer.from(value);
  }
  if (typeof value === "string") {
    stringOutputObserved = true;
    return Buffer.from(value, "utf8");
  }
  fail(`${label} 必须是 string 或 Uint8Array`);
};

const firstByteDifference = (expected, actual) => {
  const sharedLength = Math.min(expected.length, actual.length);
  for (let index = 0; index < sharedLength; index += 1) {
    if (expected[index] !== actual[index]) {
      return index;
    }
  }
  return expected.length === actual.length ? -1 : sharedLength;
};

const assertBytesEqual = (actual, expected, label) => {
  if (actual.equals(expected)) {
    return;
  }
  const offset = firstByteDifference(expected, actual);
  const expectedByte = offset < expected.length ? expected[offset] : "EOF";
  const actualByte = offset < actual.length ? actual[offset] : "EOF";
  fail(
    `${label} 输出字节不一致：首个差异 offset=${offset}，expected=${String(expectedByte)}，actual=${String(actualByte)}，expectedLength=${expected.length}，actualLength=${actual.length}`,
  );
};

const loadGoldSample = async (sampleName) => {
  const sampleRoot = resolve(samplesRoot, sampleName);
  const metadata = requireRecord(
    await readJson(resolve(sampleRoot, "meta.json"), `${sampleName}/meta.json`),
    `${sampleName}/meta.json`,
  );
  assertOnlyKeys(
    metadata,
    ["schemaVersion", "id", "args", "fixtures", "writableFiles"],
    `${sampleName}/meta.json`,
  );
  if (metadata.schemaVersion !== 1 || metadata.id !== sampleName) {
    fail(`${sampleName}/meta.json 的 schemaVersion 或 id 不匹配`);
  }
  const args = requireStringArray(metadata.args ?? [], `${sampleName}.args`);
  const writableFiles = requireStringArray(
    metadata.writableFiles ?? [],
    `${sampleName}.writableFiles`,
  ).map((path) => assertSafeRelativePath(path, `${sampleName}.writableFiles`));
  if (!Array.isArray(metadata.fixtures)) {
    fail(`${sampleName}.fixtures 必须是数组`);
  }
  const fixtureTargets = new Set();
  const fixtures = [];
  for (const [index, value] of metadata.fixtures.entries()) {
    const fixture = requireRecord(value, `${sampleName}.fixtures[${index}]`);
    assertOnlyKeys(fixture, ["source", "target"], `${sampleName}.fixtures[${index}]`);
    const source = assertSafeRelativePath(
      fixture.source,
      `${sampleName}.fixtures[${index}].source`,
    );
    const target = assertSafeRelativePath(
      fixture.target,
      `${sampleName}.fixtures[${index}].target`,
    );
    const canonicalTarget = target.normalize("NFC").toLowerCase();
    if (fixtureTargets.has(canonicalTarget)) {
      fail(`${sampleName} fixture target 重复：${target}`);
    }
    fixtureTargets.add(canonicalTarget);
    fixtures.push(
      Object.freeze({
        path: target,
        contents: new Uint8Array(
          await readFile(resolveInside(sampleRoot, source, `${sampleName} fixture source`)),
        ),
      }),
    );
  }

  const sourceBytes = await readFile(resolve(sampleRoot, "main.c"));
  const source = decodeUtf8RoundTrip(sourceBytes, `${sampleName}/main.c`);
  const testsRoot = resolve(sampleRoot, "tests");
  const entries = await readdir(testsRoot, { withFileTypes: true });
  const inputNames = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".in"))
    .map((entry) => entry.name)
    .sort();
  if (inputNames.length === 0) {
    fail(`${sampleName} 没有测试输入`);
  }
  const tests = [];
  for (const inputName of inputNames) {
    const stem = basename(inputName, ".in");
    const input = await readFile(resolve(testsRoot, inputName));
    const expected = await readFile(resolve(testsRoot, `${stem}.expected`));
    tests.push(
      Object.freeze({
        id: stem,
        stdin: decodeUtf8RoundTrip(input, `${sampleName}/${inputName}`),
        expected,
      }),
    );
  }

  return Object.freeze({
    name: sampleName,
    source,
    args,
    fixtures: Object.freeze(fixtures),
    writableFiles: Object.freeze(writableFiles),
    tests: Object.freeze(tests),
  });
};

const loadPressureSample = async (sampleName) => {
  const sampleRoot = resolve(pressureRoot, sampleName);
  const metadata = requireRecord(
    await readJson(resolve(sampleRoot, "expected.json"), `${sampleName}/expected.json`),
    `${sampleName}/expected.json`,
  );
  assertOnlyKeys(
    metadata,
    ["schemaVersion", "acceptableTerminations", "writableFiles"],
    `${sampleName}/expected.json`,
  );
  if (metadata.schemaVersion !== 1) {
    fail(`${sampleName}/expected.json schemaVersion 必须为 1`);
  }
  const acceptableTerminations = requireStringArray(
    metadata.acceptableTerminations,
    `${sampleName}.acceptableTerminations`,
  );
  if (acceptableTerminations.length === 0) {
    fail(`${sampleName}.acceptableTerminations 不能为空`);
  }
  for (const outcome of acceptableTerminations) {
    if (!knownPressureOutcomes.has(outcome)) {
      fail(`${sampleName} 使用未知终止类型：${outcome}`);
    }
  }
  const writableFiles = requireStringArray(
    metadata.writableFiles ?? [],
    `${sampleName}.writableFiles`,
  ).map((path) => assertSafeRelativePath(path, `${sampleName}.writableFiles`));
  const sourceBytes = await readFile(resolve(sampleRoot, "main.c"));
  return Object.freeze({
    name: sampleName,
    source: decodeUtf8RoundTrip(sourceBytes, `${sampleName}/main.c`),
    acceptableTerminations: Object.freeze(new Set(acceptableTerminations)),
    writableFiles: Object.freeze(writableFiles),
  });
};

const loadBackend = async () => {
  let module;
  try {
    module = await import(backendUrl.href);
  } catch (error) {
    fail(
      `缺少 main/CLI-internal verification API：${backendUrl.pathname}。样本门禁禁止 fallback 到裸 spawn。${error instanceof Error ? ` 原因：${error.message}` : ""}`,
    );
  }
  if (typeof module.createSampleVerificationRunner !== "function") {
    fail(
      "verification.js 必须导出 createSampleVerificationRunner()；样本门禁禁止 fallback 到裸 spawn。",
    );
  }
  const backend = await module.createSampleVerificationRunner();
  for (const method of ["capabilities", "compile", "run", "dispose"]) {
    if (typeof backend?.[method] !== "function") {
      fail(`CLI-internal verification API 缺少 ${method}()`);
    }
  }
  return backend;
};

const assertBackendReady = async (backend) => {
  const capabilities = requireRecord(await backend.capabilities(), "verification capabilities");
  if (
    capabilities.mode !== "seatbelt-best-effort" ||
    capabilities.runnerEnabled !== true ||
    capabilities.seatbeltProbe?.status !== "probe-succeeded" ||
    capabilities.requiresNativeTrustConfirmation !== false
  ) {
    fail(
      `样本门禁要求 seatbelt-best-effort canary 成功；实际 ${JSON.stringify(capabilities)}。禁止自动降级 trusted-only。`,
    );
  }
};

const compile = async (backend, sample, preset) => {
  const result = requireRecord(
    await backend.compile({
      source: sample.source,
      sourceName: "main.c",
      preset,
    }),
    `${sample.name} ${preset} compile result`,
  );
  if (result.ok !== true || typeof result.artifactId !== "string") {
    fail(`${sample.name} ${preset} 编译失败：${formatBackendFailure(result)}`);
  }
  return result.artifactId;
};

const runGoldCase = async (backend, sample, test, artifactId, mode) => {
  const result = requireRecord(
    await backend.run({
      artifactId,
      args: sample.args,
      stdin: test.stdin,
      fixtures: sample.fixtures,
      writableFiles: sample.writableFiles,
      mode,
    }),
    `${sample.name}/${test.id} ${mode} run result`,
  );
  if (
    result.ok !== true ||
    result.termination !== "process-exit" ||
    result.exitCode !== 0 ||
    result.signal !== null
  ) {
    fail(`${sample.name}/${test.id} ${mode} 运行失败：${formatBackendFailure(result)}`);
  }
  const stdout = outputBytes(result.stdout, `${sample.name}/${test.id} stdout`);
  const stderr = outputBytes(result.stderr, `${sample.name}/${test.id} stderr`);
  assertBytesEqual(stdout, test.expected, `${sample.name}/${test.id} ${mode}`);
  return { result, stdout, stderr };
};

const runGoldLeakCase = async (backend, sample, test, artifactId) => {
  const result = requireRecord(
    await backend.run({
      artifactId,
      args: sample.args,
      stdin: test.stdin,
      fixtures: sample.fixtures,
      writableFiles: sample.writableFiles,
      mode: "leaks",
    }),
    `${sample.name}/${test.id} leaks run result`,
  );
  const leakCheck = requireRecord(result.leakCheck, `${sample.name}/${test.id} leakCheck`);
  if (
    result.ok !== true ||
    result.termination !== "process-exit" ||
    result.exitCode !== 0 ||
    result.signal !== null ||
    leakCheck.ok !== true
  ) {
    fail(`${sample.name}/${test.id} leaks 门禁失败：${formatBackendFailure(result)}`);
  }
};

const verifyGoldSample = async (backend, sample) => {
  const sanitizerArtifact = await compile(backend, sample, "asan-ubsan");
  for (const test of sample.tests) {
    const { stdout, stderr } = await runGoldCase(
      backend,
      sample,
      test,
      sanitizerArtifact,
      "direct",
    );
    const reportText = Buffer.concat([stdout, stderr]).toString("utf8");
    if (sanitizerReportPattern.test(reportText)) {
      fail(`${sample.name}/${test.id} 检测到 ASan/UBSan 报告`);
    }
  }

  const plainArtifact = await compile(backend, sample, "plain");
  for (const test of sample.tests) {
    await runGoldLeakCase(backend, sample, test, plainArtifact);
  }
  console.log(`✓ ${sample.name}：ASan+UBSan 与 plain+leaks 双闸通过`);
};

const verifyLeaksPositiveControl = async (backend) => {
  const control = Object.freeze({
    name: "leaks-positive-control",
    source: [
      "#include <stdlib.h>",
      "int main(void) {",
      "    void *memory = malloc(32);",
      "    return memory == NULL;",
      "}",
      "",
    ].join("\n"),
  });
  const artifactId = await compile(backend, control, "plain");
  const result = requireRecord(
    await backend.run({
      artifactId,
      args: [],
      stdin: "",
      fixtures: [],
      writableFiles: [],
      mode: "leaks",
    }),
    "leaks positive control result",
  );
  const leakCheck = requireRecord(result.leakCheck, "leaks positive control leakCheck");
  if (
    result.ok !== false ||
    result.termination !== "process-exit" ||
    result.exitCode !== 1 ||
    result.error?.code !== "LEAK_CHECK_FAILED" ||
    leakCheck.ok !== false ||
    typeof leakCheck.summary !== "string" ||
    !nonZeroLeakReportPattern.test(leakCheck.summary)
  ) {
    fail(`leaks 正控未检出故意泄漏，拒绝信任零泄漏结果：${formatBackendFailure(result)}`);
  }
  console.log("✓ leaks 正控：故意泄漏被真实检出");
};

const classifyPressureTermination = (result) => {
  if (result.termination === "wall-time-limit") {
    return "wall_timeout";
  }
  if (result.termination === "rss-limit") {
    return "rss_limit";
  }
  if (result.termination !== "process-exit") {
    return String(result.termination);
  }
  if (result.signal === "SIGXCPU") {
    return "cpu_limit";
  }
  if (result.signal === "SIGXFSZ") {
    return "file_limit";
  }
  if (typeof result.signal === "string" && result.signal.length > 0) {
    return "signal";
  }
  if (typeof result.exitCode === "number" && result.exitCode !== 0) {
    return "exited_nonzero";
  }
  return "clean_exit";
};

const verifyPressureSample = async (backend, sample) => {
  const artifactId = await compile(backend, sample, "plain");
  const result = requireRecord(
    await backend.run({
      artifactId,
      args: [],
      stdin: "",
      fixtures: [],
      writableFiles: sample.writableFiles,
      mode: "direct",
    }),
    `${sample.name} pressure result`,
  );
  if (result.termination === "not-started") {
    fail(`${sample.name} 压力样本没有实际启动：${formatBackendFailure(result)}`);
  }
  if (
    result.termination === "rss-monitor-error" ||
    result.error?.code === "PROCESS_CONTROL_FAILED"
  ) {
    fail(
      `${sample.name} 资源监控或进程组回收失败，不能算作预期资源终止：${formatBackendFailure(result)}`,
    );
  }
  const classified = classifyPressureTermination(result);
  if (!sample.acceptableTerminations.has(classified)) {
    fail(
      `${sample.name} 实际终止 ${classified} 不在允许集合 [${[...sample.acceptableTerminations].join(", ")}]；原始结果 ${formatBackendFailure(result)}`,
    );
  }
  console.log(`✓ ${sample.name}：实际运行并按 ${classified} 终止`);
};

const formatBackendFailure = (result) =>
  JSON.stringify({
    ok: result.ok,
    termination: result.termination,
    exitCode: result.exitCode,
    signal: result.signal,
    diagnostics: result.diagnostics,
    leakCheck: result.leakCheck,
    error: result.error,
  });

const goldNames = await listDirectories(samplesRoot);
const pressureNames = await listDirectories(pressureRoot);
if (goldNames.length < minimumGoldSamples) {
  fail(`金样本不足：要求至少 ${minimumGoldSamples}，实际 ${goldNames.length}`);
}
if (pressureNames.length !== expectedPressureSamples) {
  fail(`压力样本数量不符：要求 ${expectedPressureSamples}，实际 ${pressureNames.length}`);
}

const goldSamples = [];
for (const name of goldNames) {
  goldSamples.push(await loadGoldSample(name));
}
const pressureSamples = [];
for (const name of pressureNames) {
  pressureSamples.push(await loadPressureSample(name));
}

const backend = await loadBackend();
try {
  await assertBackendReady(backend);
  await verifyLeaksPositiveControl(backend);
  for (const sample of goldSamples) {
    await verifyGoldSample(backend, sample);
  }
  for (const sample of pressureSamples) {
    await verifyPressureSample(backend, sample);
  }
} finally {
  await backend.dispose();
}

if (stringOutputObserved) {
  console.warn(
    "注意：verification API 返回了 string stdout/stderr；当前语料均为可往返 UTF-8，已重新编码后逐字节比较，但该接口尚不能证明任意二进制输出保真。",
  );
}
console.log(
  `✓ 样本验收通过：${goldSamples.length} 个金样本完成 R13 双闸，${pressureSamples.length} 个压力样本均已真实运行`,
);
