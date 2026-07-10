import { describe, expect, it } from "vitest";
import { newlineLabel, sourceMetadata } from "../../src/app/source-display.js";

describe("source display metadata", () => {
  it.each([
    ["int x;", "单行"],
    ["int x;\n", "LF"],
    ["int x;\r", "CR"],
    ["int x;\r\n", "CRLF"],
    ["int x;\r\nint y;\n", "混合换行"],
  ])("labels exact newline conventions", (source, expected) => {
    expect(newlineLabel(source)).toBe(expected);
  });

  it("reports UTF-8 byte size rather than UTF-16 string length", () => {
    expect(sourceMetadata("变量\n")).toBe("LF · 7 B · UTF-8");
  });
});
