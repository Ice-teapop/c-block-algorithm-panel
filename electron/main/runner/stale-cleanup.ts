import { lstat, readdir, rm } from "node:fs/promises";
import { join } from "node:path";

export const STALE_WORK_DIRECTORY_AGE_MS = 24 * 60 * 60 * 1_000;
const WORK_DIRECTORY_NAME = /^c-block-(?:compile|run)-[A-Za-z0-9._-]+$/u;

export interface StaleCleanupOptions {
  readonly nowMs?: number;
  readonly maxAgeMs?: number;
  readonly activeDirectories?: ReadonlySet<string>;
}

export async function cleanupStaleWorkDirectories(
  tempRoot: string,
  options: StaleCleanupOptions = {},
): Promise<number> {
  const nowMs = options.nowMs ?? Date.now();
  const maxAgeMs = options.maxAgeMs ?? STALE_WORK_DIRECTORY_AGE_MS;
  const activeDirectories = options.activeDirectories ?? new Set<string>();
  const entries = await readdir(tempRoot, { withFileTypes: true });
  let removed = 0;

  for (const entry of entries) {
    if (!entry.isDirectory() || !WORK_DIRECTORY_NAME.test(entry.name)) {
      continue;
    }
    const candidate = join(tempRoot, entry.name);
    if (activeDirectories.has(candidate)) {
      continue;
    }
    const metadata = await lstat(candidate);
    if (!metadata.isDirectory() || nowMs - metadata.mtimeMs < maxAgeMs) {
      continue;
    }
    await rm(candidate, { force: true, recursive: true });
    removed += 1;
  }
  return removed;
}
