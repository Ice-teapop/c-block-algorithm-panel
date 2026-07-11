import { Buffer } from "node:buffer";
import type { ClangDiagnostic, ClangDiagnosticSeverity } from "../../../src/shared/api.js";
import { fingerprintSource } from "../../../src/shared/source-snapshot.js";

interface SourceLine {
  readonly start: number;
  readonly end: number;
}

interface ParsedDiagnosticLine {
  readonly severity: ClangDiagnosticSeverity;
  readonly message: string;
  readonly option: string | null;
  readonly line: number;
  readonly byteColumn: number;
}

interface ByteLocation {
  readonly byteColumn: number;
  readonly range: ClangDiagnostic["range"];
}

const SAFE_SOURCE_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*\.c$/u;
const DIAGNOSTIC_OPTION = /^(.*) \[(-[^\]\r\n]+)\]$/u;

/**
 * Parses only diagnostics belonging to the exact validated source name. Raw stderr remains the
 * caller's responsibility; malformed or inexact locations are deliberately omitted here.
 */
export function parseClangDiagnostics(
  raw: string,
  sourceName: string,
  source: string,
): readonly ClangDiagnostic[] {
  if (!SAFE_SOURCE_NAME.test(sourceName)) return Object.freeze([]);
  const diagnosticPattern = new RegExp(
    `^${escapeRegExp(sourceName)}:([1-9][0-9]*):([1-9][0-9]*): (fatal error|error|warning|note): (.+)$`,
    "u",
  );
  const sourceLines = indexSourceLines(source);
  const locationCache = new Map<number, ReadonlyMap<number, ByteLocation>>();
  const duplicateCounts = new Map<string, number>();
  const diagnostics: ClangDiagnostic[] = [];

  for (const rawLine of raw.split(/\r\n|\n|\r/u)) {
    const parsed = parseDiagnosticLine(rawLine, diagnosticPattern);
    if (parsed === null) continue;
    const sourceLine = sourceLines[parsed.line - 1];
    if (sourceLine === undefined) continue;
    let locations = locationCache.get(parsed.line);
    if (locations === undefined) {
      locations = indexByteLocations(source, sourceLine);
      locationCache.set(parsed.line, locations);
    }
    const location = locations.get(parsed.byteColumn);
    if (location === undefined || location.range === null) continue;

    const identity = [
      sourceName,
      String(parsed.line),
      String(parsed.byteColumn),
      parsed.severity,
      parsed.message,
      parsed.option ?? "",
    ].join("\u0000");
    const fingerprint = fingerprintSource(identity).replaceAll(":", "-");
    const duplicate = duplicateCounts.get(identity) ?? 0;
    duplicateCounts.set(identity, duplicate + 1);
    diagnostics.push(
      Object.freeze({
        id: `clang-diagnostic:${fingerprint}:${String(duplicate)}`,
        severity: parsed.severity,
        message: parsed.message,
        option: parsed.option,
        line: parsed.line,
        byteColumn: parsed.byteColumn,
        range: location.range,
      }),
    );
  }
  return Object.freeze(diagnostics);
}

function parseDiagnosticLine(line: string, pattern: RegExp): ParsedDiagnosticLine | null {
  const match = pattern.exec(line);
  if (match === null) return null;
  const lineNumber = parsePositiveSafeInteger(match[1]);
  const byteColumn = parsePositiveSafeInteger(match[2]);
  const severityText = match[3];
  const payload = match[4];
  if (
    lineNumber === null ||
    byteColumn === null ||
    payload === undefined ||
    payload.length === 0 ||
    (severityText !== "fatal error" &&
      severityText !== "error" &&
      severityText !== "warning" &&
      severityText !== "note")
  ) {
    return null;
  }
  const optionMatch = DIAGNOSTIC_OPTION.exec(payload);
  const message = optionMatch?.[1] ?? payload;
  const option = optionMatch?.[2] ?? null;
  if (message.length === 0) return null;
  return Object.freeze({
    severity: severityText === "fatal error" ? "fatal-error" : severityText,
    message,
    option,
    line: lineNumber,
    byteColumn,
  });
}

function indexSourceLines(source: string): readonly SourceLine[] {
  const lines: SourceLine[] = [];
  let start = 0;
  let offset = 0;
  while (offset < source.length) {
    const code = source.charCodeAt(offset);
    if (code !== 0x0a && code !== 0x0d) {
      offset += 1;
      continue;
    }
    lines.push(Object.freeze({ start, end: offset }));
    if (code === 0x0d && source.charCodeAt(offset + 1) === 0x0a) offset += 1;
    offset += 1;
    start = offset;
  }
  lines.push(Object.freeze({ start, end: source.length }));
  return Object.freeze(lines);
}

function indexByteLocations(source: string, line: SourceLine): ReadonlyMap<number, ByteLocation> {
  const output = new Map<number, ByteLocation>();
  let byteOffset = 0;
  let utf16Offset = line.start;
  for (const character of source.slice(line.start, line.end)) {
    const range = Object.freeze({
      from: utf16Offset,
      to: utf16Offset + character.length,
    });
    output.set(byteOffset + 1, Object.freeze({ byteColumn: byteOffset + 1, range }));
    byteOffset += Buffer.byteLength(character, "utf8");
    utf16Offset += character.length;
  }
  const endRange = Object.freeze({ from: line.end, to: line.end });
  output.set(byteOffset + 1, Object.freeze({ byteColumn: byteOffset + 1, range: endRange }));
  return output;
}

function parsePositiveSafeInteger(value: string | undefined): number | null {
  if (value === undefined || !/^[1-9][0-9]*$/u.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}
