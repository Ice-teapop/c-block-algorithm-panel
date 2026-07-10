import { describe, expect, it } from "vitest";
import { toRunnerSourceName } from "../../src/ui/run-panel.js";

const RUNNER_SOURCE_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*\.c$/u;

describe("run panel source names", () => {
  it.each([
    ["hello.c", "hello.c"],
    ["/tmp/My source.C", "My-source.c"],
    ["C:\\Users\\student\\sort demo.c", "sort-demo.c"],
    [".hidden.c", "hidden.c"],
    ["保真.c", "main.c"],
    ["", "main.c"],
  ])("converts %j to a safe runner file name", (displayName, expected) => {
    expect(toRunnerSourceName(displayName)).toBe(expected);
  });

  it("removes paths and bounds the generated ASCII name", () => {
    const sourceName = toRunnerSourceName(`/private/tmp/../${"a".repeat(300)}\0.c`);

    expect(sourceName).toMatch(RUNNER_SOURCE_NAME_PATTERN);
    expect(sourceName).toHaveLength(128);
    expect(sourceName).not.toContain("/");
    expect(sourceName).not.toContain("\\");
    expect(sourceName).not.toContain("\0");
  });
});
