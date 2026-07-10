import { Buffer } from "node:buffer";
import type { RunnerLimits } from "../../../src/shared/limits.js";
import { RunnerFailure } from "./errors.js";

const SOURCE_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*\.c$/;
const ARTIFACT_ID_PATTERN = /^[A-Za-z0-9_-]{16,128}$/;
const FIXTURE_SEGMENT_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const RESERVED_FIXTURE_PATHS = new Set(["program", "runner-limits.sh"]);

export interface ValidatedCompileRequest {
  readonly source: string;
  readonly sourceName: string;
}

export interface ValidatedFixture {
  readonly path: string;
  readonly contents: Uint8Array;
}

export interface ValidatedRunRequest {
  readonly artifactId: string;
  readonly args: readonly string[];
  readonly stdin: string;
  readonly fixtures: readonly ValidatedFixture[];
}

export function validateWritableFiles(value: unknown, limits: RunnerLimits): readonly string[] {
  if (!Array.isArray(value) || value.length > limits.maxFixtureCount) {
    throw invalid("writableFiles 必须是未超过数量限制的数组。");
  }
  const canonicalPaths = new Set<string>();
  const paths = value.map((path) => {
    const safePath = validateFixturePath(path, limits);
    const canonicalPath = safePath.normalize("NFC").toLowerCase();
    if (canonicalPaths.has(canonicalPath)) {
      throw invalid("writableFiles 路径重复。");
    }
    canonicalPaths.add(canonicalPath);
    return safePath;
  });
  return Object.freeze(paths);
}

export function validateCompileRequest(
  value: unknown,
  limits: RunnerLimits,
): ValidatedCompileRequest {
  const request = requireRecord(value, "编译请求必须是对象。");
  assertOnlyKeys(request, ["source", "sourceName"], "编译请求包含不支持的字段。");

  const source = requireString(request.source, "source 必须是字符串。");
  assertByteLimit(source, limits.maxSourceBytes, "C 源码超过大小限制。");
  if (source.includes("\0")) {
    throw invalid("C 源码不能包含 NUL 字符。");
  }

  const sourceName =
    request.sourceName === undefined
      ? "main.c"
      : requireString(request.sourceName, "sourceName 必须是字符串。");
  assertByteLimit(sourceName, limits.maxSourceNameBytes, "源码文件名超过大小限制。");
  if (!SOURCE_NAME_PATTERN.test(sourceName)) {
    throw invalid("sourceName 只能是安全的单个 .c 文件名。");
  }

  return Object.freeze({
    source,
    sourceName,
  });
}

export function validateRunRequest(value: unknown, limits: RunnerLimits): ValidatedRunRequest {
  const request = requireRecord(value, "运行请求必须是对象。");
  assertOnlyKeys(
    request,
    ["artifactId", "args", "stdin", "fixtures"],
    "运行请求包含不支持的字段。",
  );

  const artifactId = requireString(request.artifactId, "artifactId 必须是字符串。");
  assertByteLimit(artifactId, limits.maxArtifactIdBytes, "artifactId 超过大小限制。");
  if (!ARTIFACT_ID_PATTERN.test(artifactId)) {
    throw invalid("artifactId 格式无效。");
  }

  const args = validateArguments(request.args, limits);
  const stdin =
    request.stdin === undefined ? "" : requireString(request.stdin, "stdin 必须是字符串。");
  assertByteLimit(stdin, limits.maxStdinBytes, "标准输入超过大小限制。");
  if (stdin.includes("\0")) {
    throw invalid("标准输入不能包含 NUL 字符。");
  }

  const fixtures = validateFixtures(request.fixtures, limits);

  return Object.freeze({
    artifactId,
    args,
    stdin,
    fixtures,
  });
}

function validateArguments(value: unknown, limits: RunnerLimits): readonly string[] {
  if (value === undefined) {
    return Object.freeze([]);
  }
  if (!Array.isArray(value) || value.length > limits.maxArgumentCount) {
    throw invalid("args 必须是未超过数量限制的字符串数组。");
  }

  let totalBytes = 0;
  const args = value.map((argument) => {
    const text = requireString(argument, "每个命令行参数都必须是字符串。");
    if (text.includes("\0")) {
      throw invalid("命令行参数不能包含 NUL 字符。");
    }
    const bytes = Buffer.byteLength(text);
    if (bytes > limits.maxArgumentBytes) {
      throw invalid("单个命令行参数超过大小限制。");
    }
    totalBytes += bytes;
    return text;
  });

  if (totalBytes > limits.maxTotalArgumentBytes) {
    throw invalid("命令行参数总大小超过限制。");
  }
  return Object.freeze(args);
}

function validateFixtures(value: unknown, limits: RunnerLimits): readonly ValidatedFixture[] {
  if (value === undefined) {
    return Object.freeze([]);
  }
  if (!Array.isArray(value) || value.length > limits.maxFixtureCount) {
    throw invalid("fixtures 必须是未超过数量限制的数组。");
  }

  const canonicalPaths: string[] = [];
  let totalBytes = 0;
  const fixtures = value.map((fixture) => {
    const record = requireRecord(fixture, "每个 fixture 必须是对象。");
    assertOnlyKeys(record, ["path", "contents"], "fixture 包含不支持的字段。");
    const safePath = validateFixturePath(record.path, limits);
    const canonicalPath = safePath.normalize("NFC").toLowerCase();
    if (
      canonicalPaths.some(
        (existing) =>
          existing === canonicalPath ||
          existing.startsWith(`${canonicalPath}/`) ||
          canonicalPath.startsWith(`${existing}/`),
      )
    ) {
      throw invalid("fixture 路径重复或存在文件与目录冲突。");
    }
    canonicalPaths.push(canonicalPath);

    const contents = copyFixtureContents(record.contents);
    if (contents.byteLength > limits.maxFixtureBytes) {
      throw invalid("单个 fixture 超过大小限制。");
    }
    totalBytes += contents.byteLength;
    if (totalBytes > limits.maxTotalFixtureBytes) {
      throw invalid("fixtures 总大小超过限制。");
    }

    return Object.freeze({ path: safePath, contents });
  });

  return Object.freeze(fixtures);
}

function validateFixturePath(value: unknown, limits: RunnerLimits): string {
  const candidate = requireString(value, "fixture path 必须是字符串。");
  assertByteLimit(candidate, limits.maxFixturePathBytes, "fixture path 超过大小限制。");
  if (
    candidate.length === 0 ||
    candidate.startsWith("/") ||
    candidate.includes("\\") ||
    candidate.includes("\0")
  ) {
    throw invalid("fixture path 必须是安全的相对 POSIX 路径。");
  }

  const segments = candidate.split("/");
  if (
    segments.some(
      (segment) => segment === "." || segment === ".." || !FIXTURE_SEGMENT_PATTERN.test(segment),
    )
  ) {
    throw invalid("fixture path 包含不安全的路径段。");
  }

  const safePath = segments.join("/");
  if (RESERVED_FIXTURE_PATHS.has(safePath.toLowerCase())) {
    throw invalid("fixture path 与运行器保留文件冲突。");
  }
  return safePath;
}

function copyFixtureContents(value: unknown): Uint8Array {
  if (typeof value === "string") {
    return Uint8Array.from(Buffer.from(value, "utf8"));
  }
  if (value instanceof Uint8Array) {
    return Uint8Array.from(value);
  }
  throw invalid("fixture contents 必须是字符串或 Uint8Array。");
}

function requireRecord(value: unknown, message: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw invalid(message);
  }
  const prototype = Object.getPrototypeOf(value) as object | null;
  if (prototype !== Object.prototype && prototype !== null) {
    throw invalid(message);
  }
  return value as Record<string, unknown>;
}

function requireString(value: unknown, message: string): string {
  if (typeof value !== "string") {
    throw invalid(message);
  }
  return value;
}

function assertOnlyKeys(
  record: Record<string, unknown>,
  allowedKeys: readonly string[],
  message: string,
): void {
  const allowed = new Set(allowedKeys);
  if (Object.keys(record).some((key) => !allowed.has(key))) {
    throw invalid(message);
  }
}

function assertByteLimit(value: string, maxBytes: number, message: string): void {
  if (Buffer.byteLength(value, "utf8") > maxBytes) {
    throw invalid(message);
  }
}

function invalid(message: string): RunnerFailure {
  return new RunnerFailure("INVALID_REQUEST", message);
}
