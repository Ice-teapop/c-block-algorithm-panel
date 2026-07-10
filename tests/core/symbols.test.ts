import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  rangesForSymbol,
  symbolAt,
  type CParser,
  type SourceDoc,
  type SymbolRecord,
} from "../../src/core/index.js";
import { createTestParser } from "./parser-fixture.js";

let parser: CParser;

beforeAll(async () => {
  parser = await createTestParser();
});

afterAll(() => {
  parser.dispose();
});

describe("M2 lexical symbol snapshot", () => {
  it("binds file, function, parameter, local, recursive, and shadowed names", () => {
    const source = [
      "int global = 1;",
      "int sum(int value) {",
      "  int total = value + global;",
      "  { int total = value; total++; }",
      "  return total ? sum(total - 1) : 0;",
      "}",
      "",
    ].join("\n");
    const document = parser.project(source);

    const global = requireSymbol(document, "global", "file-variable");
    const sum = requireSymbol(document, "sum", "function");
    const value = requireSymbol(document, "value", "parameter");
    const totals = document.symbols.symbols.filter(
      (symbol) => symbol.name === "total" && symbol.kind === "local-variable",
    );

    expect(totals).toHaveLength(2);
    expect(rangesForSymbol(document.symbols, global.id)).toHaveLength(2);
    expect(rangesForSymbol(document.symbols, sum.id)).toHaveLength(2);
    expect(rangesForSymbol(document.symbols, value.id)).toHaveLength(3);
    expect(
      totals.map((symbol) => rangesForSymbol(document.symbols, symbol.id).length).sort(),
    ).toEqual([2, 3]);
    expect(document.symbols.symbols.every(Object.isFrozen)).toBe(true);
    expect(document.symbols.occurrences.every(Object.isFrozen)).toBe(true);
  });

  it("keeps for-initializer scope local to the loop", () => {
    const source = "int main(void){for(int i=0;i<2;i++){} return i;}";
    const document = parser.project(source);
    const loopI = requireSymbol(document, "i", "local-variable");
    const unknownI = requireSymbol(document, "i", "unknown-external");

    expect(rangesForSymbol(document.symbols, loopI.id)).toHaveLength(3);
    expect(rangesForSymbol(document.symbols, unknownI.id)).toHaveLength(1);
  });

  it("keeps function pointers as variables and nested prototype names out of the function scope", () => {
    const source = [
      "int apply(int (*cb)(int inner)) {",
      "  int (*fp)(int) = cb;",
      "  return fp(1) + inner;",
      "}",
      "",
    ].join("\n");
    const document = parser.project(source);

    expect(requireSymbol(document, "cb", "parameter")).toBeDefined();
    const fp = requireSymbol(document, "fp", "local-variable");
    expect(rangesForSymbol(document.symbols, fp.id)).toHaveLength(2);
    expect(
      document.symbols.symbols.some((symbol) => symbol.name === "fp" && symbol.kind === "function"),
    ).toBe(false);
    expect(
      document.symbols.symbols.some(
        (symbol) => symbol.name === "inner" && symbol.kind === "parameter",
      ),
    ).toBe(false);
    expect(requireSymbol(document, "inner", "unknown-external")).toBeDefined();
  });

  it("respects local shadowing before builtin typedef fallback", () => {
    const source = "int main(void){ int size_t = 1; size_t *p; return size_t; }";
    const document = parser.project(source);

    const local = requireSymbol(document, "size_t", "local-variable");
    expect(rangesForSymbol(document.symbols, local.id)).toHaveLength(3);
    expect(
      document.symbols.symbols.some(
        (symbol) => symbol.name === "size_t" && symbol.kind === "builtin-typedef",
      ),
    ).toBe(false);
    expect(document.concerns.map((concern) => concern.code)).toContain("variable-used-as-type");
  });

  it("declares enum constants in their surrounding lexical scope", () => {
    const source = "enum Color { RED, GREEN = RED + 1 }; int main(void){ return GREEN; }";
    const document = parser.project(source);
    const red = requireSymbol(document, "RED", "enum-constant");
    const green = requireSymbol(document, "GREEN", "enum-constant");

    expect(rangesForSymbol(document.symbols, red.id)).toHaveLength(2);
    expect(rangesForSymbol(document.symbols, green.id)).toHaveLength(2);
    expect(
      document.symbols.symbols.some(
        (symbol) =>
          (symbol.name === "RED" || symbol.name === "GREEN") && symbol.kind === "unknown-external",
      ),
    ).toBe(false);
  });

  it("resolves user macros and the three builtin tables without claiming semantics", () => {
    const source = [
      "#include <stdio.h>",
      "#include <stddef.h>",
      "#include <limits.h>",
      "#define LIMIT 3",
      'int main(void){ FILE *f = NULL; size_t n = LIMIT; printf("%zu %d\\n", n, EOF + INT_MAX); return f == NULL; }',
      "",
    ].join("\n");
    const document = parser.project(source);

    expect(requireSymbol(document, "LIMIT", "object-macro").valueText).toBe("3");
    expect(requireSymbol(document, "printf", "builtin-function")).toMatchObject({
      header: "<stdio.h>",
    });
    expect(requireSymbol(document, "FILE", "builtin-typedef")).toMatchObject({
      header: "<stdio.h>",
    });
    expect(requireSymbol(document, "size_t", "builtin-typedef")).toMatchObject({
      header: "<stddef.h>",
    });
    expect(requireSymbol(document, "NULL", "builtin-object-macro").valueText).toMatch(
      /实现|空指针/u,
    );
    expect(requireSymbol(document, "EOF", "builtin-object-macro")).toBeDefined();
    expect(requireSymbol(document, "INT_MAX", "builtin-object-macro")).toBeDefined();
  });

  it("labels unknown external names neutrally", () => {
    const document = parser.project("int main(void){ return external_value(); }\n");
    const unknown = requireSymbol(document, "external_value", "unknown-external");
    expect(unknown.confidence).toBe("unknown");
    expect(unknown.description).toMatch(/中性|未知外部/u);
    expect(document.concerns).toEqual([]);
  });

  it("marks detectable ambiguous parses without polluting later bindings", () => {
    const source = [
      "typedef int Number;",
      "int main(void){",
      "  int a = 1, b = 2;",
      "  a * b;",
      "  Mystery value;",
      "  Number(b);",
      "  return b + value;",
      "}",
      "",
    ].join("\n");
    const document = parser.project(source);

    expect(document.concerns.map((concern) => concern.code).sort()).toEqual([
      "typedef-used-as-call",
      "unknown-type-name",
      "variable-used-as-type",
    ]);
    const b = requireSymbol(document, "b", "local-variable");
    expect(rangesForSymbol(document.symbols, b.id).length).toBeGreaterThanOrEqual(4);
    expect(
      document.symbols.symbols.filter(
        (symbol) => symbol.name === "b" && symbol.kind === "local-variable",
      ),
    ).toHaveLength(1);
    expect(requireSymbol(document, "value", "local-variable").confidence).toBe("low");
  });

  it("does not treat struct fields or labels as variable usages", () => {
    const source =
      "struct Item { int value; }; int main(void){ struct Item x; goto done; done: return x.value; }";
    const document = parser.project(source);
    expect(document.symbols.symbols.some((symbol) => symbol.name === "done")).toBe(false);
    expect(document.symbols.symbols.some((symbol) => symbol.name === "value")).toBe(false);
    const xOffset = source.lastIndexOf("x.value");
    const x = symbolAt(document.symbols, xOffset);
    expect(x).toMatchObject({ name: "x", kind: "local-variable" });
    expect(symbolAt(document.symbols, xOffset + 2)).toBeNull();
  });
});

function requireSymbol(
  document: SourceDoc,
  name: string,
  kind: SymbolRecord["kind"],
): SymbolRecord {
  const symbol = document.symbols.symbols.find(
    (candidate) => candidate.name === name && candidate.kind === kind,
  );
  if (symbol === undefined) {
    throw new Error(`缺少 symbol ${kind}:${name}`);
  }
  return symbol;
}
