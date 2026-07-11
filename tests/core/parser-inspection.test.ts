import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type CParser } from "../../src/core/index.js";
import { createTestParser } from "./parser-fixture.js";

describe("CParser borrowed CST inspection", () => {
  let parser: CParser;

  beforeEach(async () => {
    parser = await createTestParser();
  });

  afterEach(() => {
    parser.dispose();
  });

  it("copies a plain value while preserving the normal projection snapshot", () => {
    const source = "int main(void) { return 0; }";
    const inspected = parser.inspect(source, 7, ({ rootNode, document, revision }) =>
      Object.freeze({
        rootType: rootNode.type,
        rootRange: Object.freeze([rootNode.startIndex, rootNode.endIndex] as const),
        sameDocument: document.source === source,
        revision,
      }),
    );

    expect(inspected.analysis.document.source).toBe(source);
    expect(inspected.analysis.editTargets.revision).toBe(7);
    expect(inspected.result).toEqual({
      rootType: "translation_unit",
      rootRange: [0, source.length],
      sameDocument: true,
      revision: 7,
    });
    expect(Object.isFrozen(inspected)).toBe(true);
  });

  it("rejects asynchronous readers and remains usable after cleanup", () => {
    expect(() =>
      parser.inspect("int first(void) { return 1; }", 1, async ({ rootNode }) => rootNode.type),
    ).toThrowError(/必须同步返回/u);

    expect(parser.analyze("int second(void) { return 2; }", 2).document.parse.hasError).toBe(false);
  });

  it("rejects direct and nested Tree Node escape", () => {
    const source = "int f(void) { return 0; }";

    expect(() => parser.inspect(source, 1, ({ rootNode }) => rootNode)).toThrowError(
      /不得返回 Tree Node/u,
    );
    expect(() =>
      parser.inspect(source, 2, ({ rootNode }) => Object.freeze({ nested: rootNode })),
    ).toThrowError(/不得返回 Tree Node/u);
  });

  it("requires the complete returned object graph to be frozen plain data", () => {
    const source = "int f(void) { return 0; }";
    const cyclic: { self?: unknown } = {};
    cyclic.self = cyclic;
    Object.freeze(cyclic);
    const accessor = {};
    Object.defineProperty(accessor, "value", { enumerable: true, get: () => 1 });
    Object.freeze(accessor);

    expect(() => parser.inspect(source, 1, () => ({ mutable: true }))).toThrowError(/完全冻结/u);
    expect(() =>
      parser.inspect(source, 2, () => Object.freeze({ nested: { mutable: true } })),
    ).toThrowError(/完全冻结/u);
    expect(() =>
      parser.inspect(source, 3, () => Object.freeze({ value: new Date(0) })),
    ).toThrowError(/带原型实例/u);
    expect(() => parser.inspect(source, 4, () => cyclic)).toThrowError(/循环引用/u);
    expect(() => parser.inspect(source, 5, () => accessor)).toThrowError(/访问器属性/u);
  });
});
