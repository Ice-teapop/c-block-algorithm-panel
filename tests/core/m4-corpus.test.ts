import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  assertSourceDocInvariants,
  projectionShape,
  rebuildFromCoverage,
  renderSourceDoc,
  type Block,
  type CParser,
  type RawReason,
} from "../../src/core/index.js";
import { createTestParser } from "./parser-fixture.js";

const projectRoot = resolve(import.meta.dirname, "../..");
const corpusRoot = resolve(projectRoot, "corpus/m4");
const fixtureNames = readdirSync(corpusRoot)
  .filter((name) => name.endsWith(".c"))
  .sort();

type ParserState = "ready" | "recovery";
type SyntaxRole = "function" | "statement" | "declaration" | "preprocessor";

interface OracleBase {
  readonly label: string;
  readonly range: readonly [number, number];
}

interface SyntaxOracle extends OracleBase {
  readonly kind: "syntax";
  readonly role: SyntaxRole;
  readonly nodeType: string;
}

interface RawOracle extends OracleBase {
  readonly kind: "raw";
  readonly reason: RawReason;
}

type ProjectionOracle = SyntaxOracle | RawOracle;

interface ExpectedProjection {
  readonly schemaVersion: 1;
  readonly sourceSha256: string;
  readonly parserState: ParserState;
  readonly oracles: readonly ProjectionOracle[];
}

let parser: CParser;

beforeAll(async () => {
  parser = await createTestParser();
});

afterAll(() => {
  parser.dispose();
});

describe("M4 tricky corpus P1/P2/P5", () => {
  it("contains at least 15 source/expected pairs with no orphaned snapshot", () => {
    const expectedNames = readdirSync(corpusRoot)
      .filter((name) => name.endsWith(".expected.json"))
      .map((name) => name.replace(/\.expected\.json$/u, ".c"))
      .sort();

    expect(fixtureNames.length).toBeGreaterThanOrEqual(15);
    expect(expectedNames).toEqual(fixtureNames);
  });

  it("stores the CRLF and BOM fixtures as real source bytes", () => {
    const crlf = readFileSync(resolve(corpusRoot, "10-crlf-for-loop.c"));
    const bomCrlf = readFileSync(resolve(corpusRoot, "11-bom-crlf-unicode-comments.c"));

    expect(hasOnlyCrlfLineEndings(crlf)).toBe(true);
    expect(hasOnlyCrlfLineEndings(bomCrlf)).toBe(true);
    expect([...bomCrlf.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);

    const attributes = readFileSync(resolve(projectRoot, ".gitattributes"), "utf8");
    expect(attributes).toContain("corpus/m4/10-crlf-for-loop.c -text");
    expect(attributes).toContain("corpus/m4/11-bom-crlf-unicode-comments.c -text");
  });

  it.each(fixtureNames)("matches the reviewed projection oracle: %s", (name) => {
    const sourceBytes = readFileSync(resolve(corpusRoot, name));
    const source = decodeUtf8Exactly(sourceBytes);
    const expected = readExpectedProjection(name, source.length);
    const sourceHash = createHash("sha256").update(sourceBytes).digest("hex");

    expect(sourceHash).toBe(expected.sourceSha256);

    const document = parser.project(source);
    const rendered = renderSourceDoc(document);
    const blocks = flattenBlocks(document.blocks);

    assertSourceDocInvariants(document);
    expect(rebuildFromCoverage(document)).toBe(source);
    expect(rendered).toBe(source);
    expect(Buffer.from(new TextEncoder().encode(rendered)).equals(sourceBytes)).toBe(true);
    expect(projectionShape(parser.project(rendered))).toEqual(projectionShape(document));
    expect(document.parse.hasError ? "recovery" : "ready").toBe(expected.parserState);

    for (const oracle of expected.oracles) {
      assertOracle(name, source, blocks, oracle);
    }
  });
});

function readExpectedProjection(name: string, sourceLength: number): ExpectedProjection {
  const path = resolve(corpusRoot, name.replace(/\.c$/u, ".expected.json"));
  const value: unknown = JSON.parse(readFileSync(path, "utf8"));
  const record = requireRecord(value, `${name}: expected root`);

  if (record.schemaVersion !== 1) throw new Error(`${name}: schemaVersion 必须为 1`);
  if (typeof record.sourceSha256 !== "string" || !/^[0-9a-f]{64}$/u.test(record.sourceSha256)) {
    throw new Error(`${name}: sourceSha256 必须是 64 位小写十六进制`);
  }
  if (record.parserState !== "ready" && record.parserState !== "recovery") {
    throw new Error(`${name}: parserState 必须为 ready 或 recovery`);
  }
  if (!Array.isArray(record.oracles) || record.oracles.length === 0) {
    throw new Error(`${name}: oracles 必须是非空数组`);
  }

  const oracles = record.oracles.map((entry, index) =>
    parseOracle(entry, `${name}: oracle ${String(index)}`, sourceLength),
  );
  if (!oracles.some((oracle) => oracle.kind === "syntax")) {
    throw new Error(`${name}: 至少需要一个 syntax oracle，禁止整文件 raw 宽松快照`);
  }

  return Object.freeze({
    schemaVersion: 1,
    sourceSha256: record.sourceSha256,
    parserState: record.parserState,
    oracles: Object.freeze(oracles),
  });
}

function parseOracle(value: unknown, context: string, sourceLength: number): ProjectionOracle {
  const record = requireRecord(value, context);
  if (typeof record.label !== "string" || record.label.length === 0) {
    throw new Error(`${context}: label 不得为空`);
  }
  if (
    !Array.isArray(record.range) ||
    record.range.length !== 2 ||
    !Number.isSafeInteger(record.range[0]) ||
    !Number.isSafeInteger(record.range[1])
  ) {
    throw new Error(`${context}: range 必须是两个安全整数`);
  }
  const from = record.range[0] as number;
  const to = record.range[1] as number;
  if (from < 0 || to <= from || to > sourceLength) {
    throw new Error(`${context}: range [${String(from)}, ${String(to)}) 超出源码`);
  }
  const base = Object.freeze({
    label: record.label,
    range: Object.freeze([from, to]) as readonly [number, number],
  });

  if (record.kind === "syntax") {
    if (!isSyntaxRole(record.role) || typeof record.nodeType !== "string" || !record.nodeType) {
      throw new Error(`${context}: syntax oracle 缺少合法 role/nodeType`);
    }
    return Object.freeze({ ...base, kind: "syntax", role: record.role, nodeType: record.nodeType });
  }
  if (record.kind === "raw") {
    if (!isRawReason(record.reason)) {
      throw new Error(`${context}: raw oracle 缺少合法 reason`);
    }
    return Object.freeze({ ...base, kind: "raw", reason: record.reason });
  }
  throw new Error(`${context}: kind 必须为 syntax 或 raw`);
}

function assertOracle(
  name: string,
  source: string,
  blocks: readonly Block[],
  oracle: ProjectionOracle,
): void {
  const matches = blocks.filter(
    (block) =>
      block.kind === oracle.kind &&
      block.range.from === oracle.range[0] &&
      block.range.to === oracle.range[1],
  );
  const excerpt = JSON.stringify(source.slice(oracle.range[0], oracle.range[1]));
  expect(matches, `${name}: ${oracle.label} ${excerpt}`).toHaveLength(1);

  const block = matches[0];
  if (block === undefined) return;
  if (oracle.kind === "syntax") {
    expect(block.kind, `${name}: ${oracle.label}`).toBe("syntax");
    if (block.kind === "syntax") {
      expect(block.role, `${name}: ${oracle.label}`).toBe(oracle.role);
      expect(block.nodeType, `${name}: ${oracle.label}`).toBe(oracle.nodeType);
    }
  } else {
    expect(block.kind, `${name}: ${oracle.label}`).toBe("raw");
    if (block.kind === "raw") {
      expect(block.reason, `${name}: ${oracle.label}`).toBe(oracle.reason);
    }
  }
}

function flattenBlocks(blocks: readonly Block[]): readonly Block[] {
  const flattened: Block[] = [];
  const stack = [...blocks].reverse();
  while (stack.length > 0) {
    const block = stack.pop();
    if (block === undefined) continue;
    flattened.push(block);
    stack.push(...[...block.children].reverse());
  }
  return flattened;
}

function decodeUtf8Exactly(bytes: Uint8Array): string {
  return new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes);
}

function hasOnlyCrlfLineEndings(bytes: Uint8Array): boolean {
  let sawCrlf = false;
  for (let index = 0; index < bytes.length; index += 1) {
    if (bytes[index] !== 0x0a) continue;
    if (index === 0 || bytes[index - 1] !== 0x0d) return false;
    sawCrlf = true;
  }
  return sawCrlf;
}

function requireRecord(value: unknown, context: string): Readonly<Record<string, unknown>> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${context}: 必须是对象`);
  }
  return value as Readonly<Record<string, unknown>>;
}

function isSyntaxRole(value: unknown): value is SyntaxRole {
  return (
    value === "function" ||
    value === "statement" ||
    value === "declaration" ||
    value === "preprocessor"
  );
}

function isRawReason(value: unknown): value is RawReason {
  return (
    value === "not-yet-structured" || value === "parse-error" || value === "unsupported-syntax"
  );
}
