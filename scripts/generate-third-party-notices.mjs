import { readFile, readdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = new URL("../", import.meta.url);
const lockfile = JSON.parse(await readFile(new URL("package-lock.json", root), "utf8"));
const outputUrl = new URL("THIRD_PARTY_NOTICES.md", root);
const packages = [];
const texts = new Map();

for (const [lockPath, metadata] of Object.entries(lockfile.packages ?? {})) {
  if (lockPath.length === 0) continue;
  if (!lockPath.startsWith("node_modules/") || lockPath.includes("..")) {
    throw new Error(`Unsafe package-lock path: ${lockPath}`);
  }
  const name = packageNameFromLockPath(lockPath);
  const version = String(metadata.version ?? "unknown");
  const license = String(metadata.license ?? "UNKNOWN");
  const identity = `${name}@${version}`;
  packages.push(Object.freeze({ identity, license, lockPath }));

  const directory = resolve(new URL(root).pathname, lockPath);
  let entries = [];
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch {
    continue;
  }
  for (const entry of entries) {
    if (!entry.isFile() || !/^(licen[cs]e|copying|notice)(\.|$)/iu.test(entry.name)) continue;
    let contents;
    try {
      contents = normalizeText(await readFile(resolve(directory, entry.name), "utf8"));
    } catch {
      continue;
    }
    if (contents.length === 0) continue;
    const existing = texts.get(contents) ?? {
      kind: /^notice/iu.test(entry.name) ? "Notice" : "License",
      packages: new Set(),
    };
    existing.packages.add(identity);
    texts.set(contents, existing);
  }
}

packages.sort((left, right) =>
  left.identity.localeCompare(right.identity, "en", { numeric: true }),
);
const rendered = render(packages, texts);
if (process.argv.includes("--check")) {
  const current = await readFile(outputUrl, "utf8").catch(() => "");
  if (current !== rendered) {
    console.error("THIRD_PARTY_NOTICES.md is stale; run npm run notices:generate.");
    process.exitCode = 1;
  } else {
    console.log(`✓ Third-party notices are current (${String(packages.length)} lock entries).`);
  }
} else {
  await writeFile(outputUrl, rendered, "utf8");
  console.log(`Generated THIRD_PARTY_NOTICES.md for ${String(packages.length)} lock entries.`);
}

function packageNameFromLockPath(lockPath) {
  const marker = "node_modules/";
  return lockPath.slice(lockPath.lastIndexOf(marker) + marker.length);
}

function normalizeText(value) {
  return value.replace(/\r\n?/gu, "\n").trim();
}

function render(packageEntries, textEntries) {
  const lines = [
    "# Third-Party Notices",
    "",
    "Generated from the exact `package-lock.json` used for C Block Algorithm Panel v0.0.1.",
    "The table records every locked package and its declared license. License and NOTICE files",
    "present in the installed dependency tree are reproduced below, with identical texts grouped",
    "together. Packages unavailable on the generating platform remain listed by SPDX declaration.",
    "",
    `Locked dependency entries: ${String(packageEntries.length)}.`,
    "",
    "## Dependency inventory",
    "",
    "| Package | License | Lock path |",
    "| --- | --- | --- |",
    ...packageEntries.map(
      (entry) =>
        `| ${escapeCell(entry.identity)} | ${escapeCell(entry.license)} | \`${entry.lockPath}\` |`,
    ),
    "",
    "## Included license and notice texts",
    "",
  ];

  const groups = [...textEntries.entries()].sort((left, right) => {
    const leftPackages = [...left[1].packages].sort().join(",");
    const rightPackages = [...right[1].packages].sort().join(",");
    return leftPackages.localeCompare(rightPackages, "en");
  });
  groups.forEach(([contents, group], index) => {
    const identities = [...group.packages].sort((left, right) => left.localeCompare(right, "en"));
    lines.push(`### ${group.kind} text ${String(index + 1)}`, "");
    lines.push(`Applies to: ${identities.map((identity) => `\`${identity}\``).join(", ")}.`, "");
    lines.push(...contents.split("\n").map((line) => `    ${line}`), "");
  });
  return `${lines.join("\n").trimEnd()}\n`;
}

function escapeCell(value) {
  return String(value).replaceAll("|", "\\|");
}
