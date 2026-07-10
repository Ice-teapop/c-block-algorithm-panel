import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readSourceFile, validateDroppedSourceRequest } from "../../electron/main/source-import.js";
import { MAX_SOURCE_BYTES } from "../../src/shared/limits.js";

describe("main source import", () => {
  let workDirectory = "";

  beforeEach(async () => {
    workDirectory = await mkdtemp(join(tmpdir(), "panel-source-import-"));
  });

  afterEach(async () => {
    await rm(workDirectory, { recursive: true, force: true });
  });

  it("reads valid UTF-8 without changing BOM or CRLF", async () => {
    const path = join(workDirectory, "hello.c");
    const bytes = Buffer.from("\uFEFF// 中文\r\nint main(void) { return 0; }\r\n", "utf8");
    await writeFile(path, bytes);

    const result = await readSourceFile(path, "dialog");

    expect(result).toEqual({
      status: "opened",
      document: {
        source: "\uFEFF// 中文\r\nint main(void) { return 0; }\r\n",
        displayName: "hello.c",
        origin: "dialog",
      },
    });
    if (result.status === "opened") {
      expect(Buffer.from(result.document.source, "utf8")).toEqual(bytes);
    }
  });

  it("accepts empty and exactly 512 KiB files", async () => {
    const empty = join(workDirectory, "empty.c");
    const exact = join(workDirectory, "exact.c");
    await writeFile(empty, "");
    await writeFile(exact, Buffer.alloc(MAX_SOURCE_BYTES, 0x20));

    await expect(readSourceFile(empty, "drop")).resolves.toMatchObject({ status: "opened" });
    await expect(readSourceFile(exact, "drop")).resolves.toMatchObject({ status: "opened" });
  });

  it.each([
    ["too-large.c", Buffer.alloc(MAX_SOURCE_BYTES + 1, 0x20), "SOURCE_TOO_LARGE"],
    ["invalid-utf8.c", Buffer.from([0xc3, 0x28]), "SOURCE_INVALID_UTF8"],
    ["nul.c", Buffer.from("int x;\0", "utf8"), "SOURCE_CONTAINS_NUL"],
  ] as const)("rejects %s with a stable error", async (name, contents, code) => {
    const path = join(workDirectory, name);
    await writeFile(path, contents);

    const result = await readSourceFile(path, "drop");

    expect(result).toMatchObject({ status: "failed", error: { code } });
    if (result.status === "failed") {
      expect(result.error.message).not.toContain(path);
    }
  });

  it("rejects directories and non-.c names", async () => {
    const directory = join(workDirectory, "folder.c");
    const header = join(workDirectory, "header.h");
    await mkdir(directory);
    await writeFile(header, "int x;\n");

    await expect(readSourceFile(directory, "dialog")).resolves.toMatchObject({
      status: "failed",
      error: { code: "SOURCE_NOT_REGULAR_FILE" },
    });
    await expect(readSourceFile(header, "dialog")).resolves.toMatchObject({
      status: "failed",
      error: { code: "SOURCE_NOT_C_FILE" },
    });
  });

  it("accepts only an exact, bounded absolute drop request", () => {
    const path = join(workDirectory, "hello.c");
    expect(validateDroppedSourceRequest({ path })).toEqual({ ok: true, path });
    for (const request of [
      null,
      path,
      { path: "relative.c" },
      { path, extra: true },
      { path: `${path}\0suffix` },
      { path: `/${"x".repeat(5_000)}.c` },
    ]) {
      expect(validateDroppedSourceRequest(request)).toMatchObject({
        ok: false,
        result: { status: "failed", error: { code: "SOURCE_INVALID_REQUEST" } },
      });
    }
  });
});
