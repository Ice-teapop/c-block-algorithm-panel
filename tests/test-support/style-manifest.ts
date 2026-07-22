import { readFileSync } from "node:fs";

const STYLE_IMPORT = /^@import\s+["']([^"']+)["'];$/u;

export interface StyleManifestEntry {
  readonly specifier: string;
  readonly url: URL;
  readonly source: string;
}

export function readStyleManifestEntries(manifestUrl: URL): readonly StyleManifestEntry[] {
  const manifest = readFileSync(manifestUrl, "utf8");
  return Object.freeze(
    manifest
      .split(/\r?\n/u)
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .map((line) => {
        const match = STYLE_IMPORT.exec(line);
        if (match?.[1] === undefined) {
          throw new Error(`Style entry must contain only ordered @import rules: ${line}`);
        }
        const url = new URL(match[1], manifestUrl);
        return Object.freeze({
          specifier: match[1],
          url,
          source: readFileSync(url, "utf8"),
        });
      }),
  );
}

export function readStyleManifestSource(manifestUrl: URL): string {
  return readStyleManifestEntries(manifestUrl)
    .map((entry) => entry.source)
    .join("");
}
