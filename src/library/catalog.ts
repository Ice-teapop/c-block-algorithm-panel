import { LIBRARY_BRANCHES, LIBRARY_BRANCH_IDS } from "./branches.js";
import type { LibraryBranchId, LibraryEntry, LibraryEntryInput } from "./contracts.js";
import { DSA_LIBRARY_ENTRIES } from "./entries-dsa.js";
import { LANGUAGE_LIBRARY_ENTRIES } from "./entries-language.js";
import { PLATFORM_LIBRARY_ENTRIES } from "./entries-platform.js";

const ENTRY_ID_PATTERN = /^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$/u;

const RAW_ENTRIES: readonly LibraryEntryInput[] = [
  ...PLATFORM_LIBRARY_ENTRIES,
  ...LANGUAGE_LIBRARY_ENTRIES,
  ...DSA_LIBRARY_ENTRIES,
];

export const LIBRARY_ENTRIES: readonly LibraryEntry[] = normalizeCatalog(RAW_ENTRIES);

export const LIBRARY_ENTRY_BY_ID: ReadonlyMap<string, LibraryEntry> = new Map(
  LIBRARY_ENTRIES.map((entry) => [entry.id, entry]),
);

export function getLibraryEntry(entryId: string): LibraryEntry | null {
  return LIBRARY_ENTRY_BY_ID.get(entryId) ?? null;
}

export function libraryEntriesForBranch(branchId: LibraryBranchId): readonly LibraryEntry[] {
  return Object.freeze(LIBRARY_ENTRIES.filter((entry) => entry.branchId === branchId));
}

export function relatedLibraryEntries(entry: LibraryEntry): readonly LibraryEntry[] {
  return Object.freeze(
    entry.relatedEntryIds.map((entryId) => {
      const related = LIBRARY_ENTRY_BY_ID.get(entryId);
      if (related === undefined) throw new Error(`Library 交叉链接失效：${entry.id} -> ${entryId}`);
      return related;
    }),
  );
}

function normalizeCatalog(inputs: readonly LibraryEntryInput[]): readonly LibraryEntry[] {
  const ids = new Set<string>();
  const normalized = inputs.map((input) => {
    if (!ENTRY_ID_PATTERN.test(input.id) || ids.has(input.id)) {
      throw new TypeError(`Library 条目 id 非法或重复：${input.id}`);
    }
    ids.add(input.id);
    if (!LIBRARY_BRANCH_IDS.has(input.branchId)) {
      throw new TypeError(`Library 条目 ${input.id} 引用了未知分支：${input.branchId}`);
    }
    if (input.title.trim().length < 1 || input.summary.trim().length < 20) {
      throw new TypeError(`Library 条目 ${input.id} 缺少实质标题或摘要`);
    }
    if (
      input.details.length < 2 ||
      input.details.some((paragraph) => paragraph.trim().length < 15)
    ) {
      throw new TypeError(`Library 条目 ${input.id} 必须包含至少两段实质说明`);
    }
    const aliases = uniqueText(input.aliases ?? []);
    const keywords = uniqueText(input.keywords ?? []);
    const relatedEntryIds = uniqueText(input.relatedEntryIds ?? []);
    if (relatedEntryIds.includes(input.id)) {
      throw new TypeError(`Library 条目 ${input.id} 不能链接自身`);
    }
    const example =
      input.example === null || input.example === undefined
        ? null
        : Object.freeze({
            language: input.example.language,
            caption: requireText(input.example.caption, `${input.id}.example.caption`),
            code: requireText(input.example.code, `${input.id}.example.code`),
          });
    const featureLink =
      input.featureLink === null || input.featureLink === undefined
        ? null
        : Object.freeze({
            label: requireText(input.featureLink.label, `${input.id}.featureLink.label`),
            pageId: requireText(input.featureLink.pageId, `${input.id}.featureLink.pageId`),
            targetId: requireText(input.featureLink.targetId, `${input.id}.featureLink.targetId`),
          });
    return Object.freeze({
      id: input.id,
      branchId: input.branchId,
      title: input.title.trim(),
      aliases,
      summary: input.summary.trim(),
      details: Object.freeze(input.details.map((paragraph) => paragraph.trim())),
      keywords,
      example,
      relatedEntryIds,
      featureLink,
    });
  });

  for (const entry of normalized) {
    for (const relatedId of entry.relatedEntryIds) {
      if (!ids.has(relatedId)) {
        throw new TypeError(`Library 条目 ${entry.id} 的交叉链接不存在：${relatedId}`);
      }
    }
  }
  const branchOrder = new Map(LIBRARY_BRANCHES.map((branch) => [branch.id, branch.order]));
  return Object.freeze(
    normalized.sort(
      (left, right) =>
        (branchOrder.get(left.branchId) ?? 0) - (branchOrder.get(right.branchId) ?? 0) ||
        left.title.localeCompare(right.title, "zh-Hans-CN") ||
        left.id.localeCompare(right.id, "en"),
    ),
  );
}

function uniqueText(values: readonly string[]): readonly string[] {
  const normalized = values.map((value) => requireText(value, "Library text"));
  return Object.freeze([...new Set(normalized)]);
}

function requireText(value: string, field: string): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) throw new TypeError(`${field} 不能为空`);
  return trimmed;
}
