import { describe, expect, it } from "vitest";
import { MAX_SOURCE_BYTES } from "../../src/shared/limits.js";
import { importPastedSource, validateSourceText } from "../../src/shared/source-import.js";

describe("source text import", () => {
  it("preserves BOM, CRLF, unicode, and empty text exactly", () => {
    for (const source of ["", "\uFEFFint main(void) {\r\n  return 0;\r\n}\r\n", "// 中文 😀\n"]) {
      const result = importPastedSource(source);
      expect(result).toEqual({
        status: "opened",
        document: { source, displayName: "pasted.c", origin: "paste" },
      });
    }
  });

  it("measures the 512 KiB limit in UTF-8 bytes", () => {
    expect(validateSourceText("a".repeat(MAX_SOURCE_BYTES))).toMatchObject({
      ok: true,
      byteLength: MAX_SOURCE_BYTES,
    });
    expect(validateSourceText("😀".repeat(MAX_SOURCE_BYTES / 4 + 1))).toMatchObject({
      ok: false,
      code: "SOURCE_TOO_LARGE",
    });
  });

  it("rejects NUL and non-round-trippable lone surrogates", () => {
    expect(validateSourceText("int x;\0")).toMatchObject({
      ok: false,
      code: "SOURCE_CONTAINS_NUL",
    });
    expect(validateSourceText("\ud800")).toMatchObject({
      ok: false,
      code: "SOURCE_INVALID_UTF8",
    });
  });
});
