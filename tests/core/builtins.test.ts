import { describe, expect, it } from "vitest";
import {
  BUILTIN_FUNCTIONS,
  BUILTIN_OBJECT_MACROS,
  BUILTIN_TYPEDEFS,
  findBuiltinFunction,
  findBuiltinObjectMacro,
  findBuiltinTypedef,
} from "../../src/core/builtins.js";

describe("R9 deterministic C17 built-in tables", () => {
  it("ships substantial, duplicate-free function, typedef and object-macro tables", () => {
    expect(BUILTIN_FUNCTIONS.length).toBeGreaterThanOrEqual(100);
    expect(BUILTIN_FUNCTIONS.length).toBeLessThanOrEqual(140);
    expect(BUILTIN_TYPEDEFS.length).toBeGreaterThanOrEqual(30);
    expect(BUILTIN_OBJECT_MACROS.length).toBeGreaterThanOrEqual(50);

    expectUniqueNames(BUILTIN_FUNCTIONS);
    expectUniqueNames(BUILTIN_TYPEDEFS);
    expectUniqueNames(BUILTIN_OBJECT_MACROS);
    expectUniqueNames([...BUILTIN_FUNCTIONS, ...BUILTIN_TYPEDEFS, ...BUILTIN_OBJECT_MACROS]);
  });

  it("resolves representative course symbols with deterministic teaching metadata", () => {
    expect(findBuiltinFunction("printf")).toEqual({
      name: "printf",
      signatureText: "int printf(const char * restrict format, ...);",
      header: "<stdio.h>",
      description: "按格式把文本写到标准输出。",
    });
    expect(findBuiltinTypedef("FILE")).toMatchObject({ header: "<stdio.h>" });
    expect(findBuiltinTypedef("size_t")).toMatchObject({ header: "<stddef.h>" });
    expect(findBuiltinObjectMacro("EOF")).toMatchObject({ header: "<stdio.h>" });
    expect(findBuiltinObjectMacro("INT_MAX")).toMatchObject({ header: "<limits.h>" });

    const nullMacro = findBuiltinObjectMacro("NULL");
    expect(nullMacro).toMatchObject({ header: "<stddef.h>" });
    expect(nullMacro?.valueText).toContain("实现定义");
    expect(nullMacro?.valueText).not.toMatch(/(?:^|\s)(?:0L?|\(void \*\)0)(?:\s|$)/u);

    expect(findBuiltinFunction("not_a_c17_function")).toBeUndefined();
    expect(findBuiltinTypedef("not_a_c17_type")).toBeUndefined();
    expect(findBuiltinObjectMacro("not_a_c17_macro")).toBeUndefined();
  });

  it("deep-freezes all exported tables and entries", () => {
    for (const table of [BUILTIN_FUNCTIONS, BUILTIN_TYPEDEFS, BUILTIN_OBJECT_MACROS]) {
      expect(Object.isFrozen(table)).toBe(true);
      expect(table.every((entry) => Object.isFrozen(entry))).toBe(true);
    }
    expect(findBuiltinFunction("printf")).toBe(
      BUILTIN_FUNCTIONS.find(({ name }) => name === "printf"),
    );
    expect(findBuiltinTypedef("FILE")).toBe(BUILTIN_TYPEDEFS.find(({ name }) => name === "FILE"));
    expect(findBuiltinObjectMacro("NULL")).toBe(
      BUILTIN_OBJECT_MACROS.find(({ name }) => name === "NULL"),
    );
  });
});

function expectUniqueNames(entries: readonly { readonly name: string }[]): void {
  expect(new Set(entries.map(({ name }) => name)).size).toBe(entries.length);
}
