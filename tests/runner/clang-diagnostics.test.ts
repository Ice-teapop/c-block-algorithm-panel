import { describe, expect, it } from "vitest";
import { parseClangDiagnostics } from "../../electron/main/runner/clang-diagnostics.js";

describe("clang diagnostic parser", () => {
  it("parses current-file diagnostics, normalizes severity and separates the final option", () => {
    const source = "int main(void) {\n  int unused;\n}\n";
    const raw = [
      "main.c:2:7: warning: unused variable 'unused' [-Wunused-variable]",
      "main.c:1:1: note: declaration starts here",
      "main.c:3:1: error: expected statement",
      "main.c:1:5: fatal error: compiler stopped [-Wfatal-errors]",
      "/private/tmp/main.c:1:1: error: external path",
      "header.h:1:1: warning: external header",
      "  int unused;",
    ].join("\n");

    const diagnostics = parseClangDiagnostics(raw, "main.c", source);

    expect(
      diagnostics.map(({ severity, message, option }) => ({ severity, message, option })),
    ).toEqual([
      {
        severity: "warning",
        message: "unused variable 'unused'",
        option: "-Wunused-variable",
      },
      { severity: "note", message: "declaration starts here", option: null },
      { severity: "error", message: "expected statement", option: null },
      { severity: "fatal-error", message: "compiler stopped", option: "-Wfatal-errors" },
    ]);
    const unused = source.indexOf("unused");
    expect(diagnostics[0]).toMatchObject({
      line: 2,
      byteColumn: 7,
      range: { from: unused, to: unused + 1 },
    });
    expect(deeplyFrozen(diagnostics)).toBe(true);
  });

  it("maps BOM, tabs, Chinese and emoji byte columns to exact UTF-16 ranges", () => {
    const source = '\uFEFFint\t名 = 0;\nchar *s = "😀";';
    const raw = [
      "main.c:1:4: note: ascii after bom",
      "main.c:1:2: error: inside bom",
      "main.c:1:7: warning: tab",
      "main.c:1:8: error: chinese",
      "main.c:1:9: error: inside chinese",
      "main.c:2:12: note: emoji",
      "main.c:2:13: error: inside emoji",
      "main.c:2:18: note: eof",
      "main.c:2:19: error: past eof",
    ].join("\n");

    const diagnostics = parseClangDiagnostics(raw, "main.c", source);

    expect(diagnostics.map((diagnostic) => diagnostic.message)).toEqual([
      "ascii after bom",
      "tab",
      "chinese",
      "emoji",
      "eof",
    ]);
    expect(diagnostics.map((diagnostic) => diagnostic.range)).toEqual([
      rangeAt(source, "i"),
      rangeAt(source, "\t"),
      rangeAt(source, "名"),
      rangeAt(source, "😀"),
      { from: source.length, to: source.length },
    ]);
  });

  it("indexes LF, CRLF, CR and mixed diagnostic line endings without offset drift", () => {
    const source = "a\r\n中\rb\n😀";
    const raw =
      "main.c:1:2: note: first eol\r\n" +
      "main.c:2:1: warning: chinese\r" +
      "main.c:2:2: error: inside chinese\n" +
      "main.c:3:1: note: ascii\r\n" +
      "main.c:4:1: warning: emoji\r" +
      "main.c:4:5: note: final eof\n" +
      "main.c:5:1: error: missing line";

    const diagnostics = parseClangDiagnostics(raw, "main.c", source);

    expect(diagnostics.map((diagnostic) => diagnostic.message)).toEqual([
      "first eol",
      "chinese",
      "ascii",
      "emoji",
      "final eof",
    ]);
    expect(diagnostics.map((diagnostic) => diagnostic.range)).toEqual([
      { from: 1, to: 1 },
      { from: 3, to: 4 },
      { from: 5, to: 6 },
      { from: 7, to: 9 },
      { from: 9, to: 9 },
    ]);
  });

  it("maps empty and trailing-empty source lines to zero-width EOF ranges", () => {
    expect(parseClangDiagnostics("main.c:1:1: error: empty", "main.c", "")).toMatchObject([
      { range: { from: 0, to: 0 } },
    ]);
    expect(parseClangDiagnostics("main.c:1:2: error: past", "main.c", "")).toEqual([]);
    expect(parseClangDiagnostics("main.c:2:1: note: eof", "main.c", "a\n")).toMatchObject([
      { range: { from: 2, to: 2 } },
    ]);
  });

  it("requires an exact safe source name and the documented clang line shape", () => {
    const raw = [
      "lesson-1.test.c:1:1: warning: accepted [-Wexample]",
      "./lesson-1.test.c:1:1: error: prefixed",
      "other.c:1:1: error: other",
      "lesson-1.test.c:0:1: error: zero line",
      "lesson-1.test.c:1:0: error: zero column",
      "lesson-1.test.c:1:9007199254740992: error: unsafe integer",
      "lesson-1.test.c:1:1: remark: unsupported severity",
      "lesson-1.test.c:1:1:error: missing spaces",
      "lesson-1.test.c:1:1: warning: ",
    ].join("\n");

    expect(parseClangDiagnostics(raw, "lesson-1.test.c", "x")).toMatchObject([
      {
        severity: "warning",
        message: "accepted",
        option: "-Wexample",
        range: { from: 0, to: 1 },
      },
    ]);
    expect(parseClangDiagnostics(raw, "../lesson-1.test.c", "x")).toEqual([]);
    expect(parseClangDiagnostics(raw, "lesson+1.c", "x")).toEqual([]);
  });

  it("preserves raw order and gives duplicate diagnostics distinct deterministic ids", () => {
    const raw = [
      "main.c:1:1: warning: repeated [-Wrepeat]",
      "main.c:1:1: warning: repeated [-Wrepeat]",
      "main.c:1:1: note: after duplicates",
    ].join("\n");

    const first = parseClangDiagnostics(raw, "main.c", "x");
    const second = parseClangDiagnostics(raw, "main.c", "x");

    expect(first).toEqual(second);
    expect(first.map((diagnostic) => diagnostic.message)).toEqual([
      "repeated",
      "repeated",
      "after duplicates",
    ]);
    expect(new Set(first.map((diagnostic) => diagnostic.id)).size).toBe(3);
    expect(first.every((diagnostic) => diagnostic.range !== null)).toBe(true);
    expect(deeplyFrozen(first)).toBe(true);
  });
});

function rangeAt(source: string, value: string): { readonly from: number; readonly to: number } {
  const from = source.indexOf(value);
  if (from < 0) throw new Error(`fixture 缺少文本：${value}`);
  return { from, to: from + value.length };
}

function deeplyFrozen(value: unknown, seen = new Set<object>()): boolean {
  if (value === null || typeof value !== "object" || seen.has(value)) return true;
  if (!Object.isFrozen(value)) return false;
  seen.add(value);
  return Object.values(value).every((child) => deeplyFrozen(child, seen));
}
