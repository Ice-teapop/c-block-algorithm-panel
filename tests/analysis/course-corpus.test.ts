import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { analyzeProgramCst } from "../../src/analysis/index.js";
import { renderSourceDoc, type CParser } from "../../src/core/index.js";
import { createTestParser } from "../core/parser-fixture.js";

const samplesRoot = resolve(import.meta.dirname, "../../samples");
const sampleDirectories = readdirSync(samplesRoot, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();
let parser: CParser;

beforeAll(async () => {
  parser = await createTestParser();
});

afterAll(() => parser.dispose());

describe("M5a course-style zero-certain and read-only boundary", () => {
  it("locks the complete 20-program undergraduate sample corpus", () => {
    expect(sampleDirectories).toHaveLength(20);
    expect(sampleDirectories).toContain("08-linked-list-insert");
    expect(sampleDirectories).toContain("18-stack-array");
    expect(sampleDirectories).toContain("19-queue-linked");
  });

  it.each(sampleDirectories)("keeps %s free of false certain findings", (directory) => {
    const source = readFileSync(resolve(samplesRoot, directory, "main.c"), "utf8");
    const result = parser.inspect(source, 1, ({ rootNode, document }) => {
      const before = renderSourceDoc(document);
      const snapshot = analyzeProgramCst({ source, revision: 1, rootNode, document });
      const after = renderSourceDoc(document);
      return Object.freeze({ before, after, snapshot });
    }).result;

    expect(result.before).toBe(source);
    expect(result.after).toBe(source);
    expect(result.snapshot.findings.filter((finding) => finding.confidence === "certain")).toEqual(
      [],
    );
  });
});
