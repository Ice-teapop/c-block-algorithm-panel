import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  assertSourceDocInvariants,
  projectionShape,
  rebuildFromCoverage,
  renderSourceDoc,
  type CParser,
} from "../../src/core/index.js";
import { createTestParser } from "./parser-fixture.js";

const projectRoot = resolve(import.meta.dirname, "../..");
const regressionsRoot = resolve(projectRoot, "corpus/regressions");
const regressionNames = readdirSync(regressionsRoot)
  .filter((name) => name.endsWith(".c"))
  .sort();

let parser: CParser;

beforeAll(async () => {
  parser = await createTestParser();
});

afterAll(() => {
  parser.dispose();
});

describe("permanent fuzz regression corpus", () => {
  it("enumerates every checked-in regression and its reproduction metadata", () => {
    const metadataSources = readdirSync(regressionsRoot)
      .filter((name) => name.endsWith(".json"))
      .map((name) => name.replace(/\.json$/u, ".c"))
      .sort();

    expect(regressionNames.length).toBeGreaterThan(0);
    expect(metadataSources).toEqual(regressionNames);
  });

  it.each(regressionNames)("never throws or loses a character: %s", (name) => {
    const sourceBytes = readFileSync(resolve(regressionsRoot, name));
    const source = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(sourceBytes);
    const metadataPath = resolve(regressionsRoot, name.replace(/\.c$/u, ".json"));
    const metadata: unknown = JSON.parse(readFileSync(metadataPath, "utf8"));

    expect(typeof metadata).toBe("object");
    expect(metadata).not.toBeNull();

    const first = parser.project(source);
    const rendered = renderSourceDoc(first);

    assertSourceDocInvariants(first);
    expect(rebuildFromCoverage(first)).toBe(source);
    expect(rendered).toBe(source);
    expect(Buffer.from(new TextEncoder().encode(rendered)).equals(sourceBytes)).toBe(true);
    expect(projectionShape(parser.project(rendered))).toEqual(projectionShape(first));
  });
});
