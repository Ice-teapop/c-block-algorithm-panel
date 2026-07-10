import { existsSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, utimesSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { cleanupStaleWorkDirectories } from "../../electron/main/runner/stale-cleanup.js";

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { force: true, recursive: true });
  }
});

describe("cleanupStaleWorkDirectories", () => {
  it("removes only old matching direct child directories and preserves active work", async () => {
    const root = mkdtempSync(join(tmpdir(), "c-block-stale-test-"));
    roots.push(root);
    const nowMs = Date.now();
    const maxAgeMs = 1_000;
    const removableCompile = join(root, "c-block-compile-old");
    const removableRun = join(root, "c-block-run-old");
    const active = join(root, "c-block-run-active");
    const recent = join(root, "c-block-compile-recent");
    const unrelated = join(root, "unrelated-old");
    const wrongPrefix = join(root, "c-block-compilex-old");
    const symlink = join(root, "c-block-run-link");
    for (const directory of [
      removableCompile,
      removableRun,
      active,
      recent,
      unrelated,
      wrongPrefix,
    ]) {
      mkdirSync(directory);
    }
    symlinkSync(unrelated, symlink);
    const oldSeconds = (nowMs - maxAgeMs - 1) / 1_000;
    for (const directory of [removableCompile, removableRun, active, unrelated, wrongPrefix]) {
      utimesSync(directory, oldSeconds, oldSeconds);
    }

    await expect(
      cleanupStaleWorkDirectories(root, {
        nowMs,
        maxAgeMs,
        activeDirectories: new Set([active]),
      }),
    ).resolves.toBe(2);

    expect(existsSync(removableCompile)).toBe(false);
    expect(existsSync(removableRun)).toBe(false);
    expect(existsSync(active)).toBe(true);
    expect(existsSync(recent)).toBe(true);
    expect(existsSync(unrelated)).toBe(true);
    expect(existsSync(wrongPrefix)).toBe(true);
    expect(existsSync(symlink)).toBe(true);
  });
});
