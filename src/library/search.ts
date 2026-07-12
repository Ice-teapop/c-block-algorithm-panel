import { LIBRARY_BRANCHES } from "./branches.js";
import { LIBRARY_ENTRIES, LIBRARY_ENTRY_BY_ID } from "./catalog.js";
import type { LibraryEntry, LibrarySearchOptions, LibrarySearchResult } from "./contracts.js";

const DEFAULT_LIMIT = 200;
const MAX_LIMIT = 500;

export function searchLibrary(
  query: string,
  options: LibrarySearchOptions = {},
): readonly LibrarySearchResult[] {
  const limit = normalizeLimit(options.limit);
  const branchIds = options.branchId
    ? new Set([options.branchId])
    : options.branchIds === undefined
      ? null
      : new Set(options.branchIds);
  const audiences = options.audiences === undefined ? null : new Set(options.audiences);
  const entries = LIBRARY_ENTRIES.filter(
    (entry) =>
      (branchIds === null || branchIds.has(entry.branchId)) &&
      (audiences === null || audiences.has(entry.audience ?? "learner")),
  );
  const tokens = tokenize(query);
  if (tokens.length === 0) {
    return Object.freeze(
      entries
        .slice(0, limit)
        .map((entry) => Object.freeze({ entry, score: 0, matchedFields: Object.freeze([]) })),
    );
  }

  const results = entries.flatMap((entry) => {
    const match = scoreEntry(entry, tokens);
    return match === null ? [] : [match];
  });
  return Object.freeze(
    results
      .sort(
        (left, right) =>
          right.score - left.score ||
          left.entry.title.localeCompare(right.entry.title, "zh-Hans-CN") ||
          left.entry.id.localeCompare(right.entry.id, "en"),
      )
      .slice(0, limit),
  );
}

function scoreEntry(entry: LibraryEntry, tokens: readonly string[]): LibrarySearchResult | null {
  const branch = LIBRARY_BRANCHES.find((candidate) => candidate.id === entry.branchId);
  const fields = {
    title: normalize(`${entry.id} ${entry.title} ${branch?.label ?? ""}`),
    alias: normalize(entry.aliases.join(" ")),
    summary: normalize(entry.summary),
    detail: normalize(entry.details.join(" ")),
    keyword: normalize(entry.keywords.join(" ")),
    code: normalize(entry.example?.code ?? ""),
    syntax: normalize(entry.syntax?.code ?? ""),
    complexity: normalize(entry.complexity ?? ""),
    pitfall: normalize(entry.pitfalls?.join(" ") ?? ""),
    tutorial: normalize(tutorialSearchText(entry)),
    related: normalize(
      entry.relatedEntryIds
        .map((id) => {
          const related = LIBRARY_ENTRY_BY_ID.get(id);
          return related === undefined ? id : `${id} ${related.title} ${related.aliases.join(" ")}`;
        })
        .join(" "),
    ),
  } as const;
  const matched = new Set<LibrarySearchResult["matchedFields"][number]>();
  let score = 0;
  for (const token of tokens) {
    let tokenScore = 0;
    if (fields.title === token) tokenScore = 100;
    else if (fields.title.includes(token)) tokenScore = 45;
    if (fields.alias.includes(token)) tokenScore = Math.max(tokenScore, 38);
    if (fields.keyword.includes(token)) tokenScore = Math.max(tokenScore, 32);
    if (fields.summary.includes(token)) tokenScore = Math.max(tokenScore, 20);
    if (fields.detail.includes(token)) tokenScore = Math.max(tokenScore, 12);
    if (fields.code.includes(token)) tokenScore = Math.max(tokenScore, 8);
    if (fields.syntax.includes(token)) tokenScore = Math.max(tokenScore, 18);
    if (fields.complexity.includes(token)) tokenScore = Math.max(tokenScore, 22);
    if (fields.pitfall.includes(token)) tokenScore = Math.max(tokenScore, 24);
    if (fields.tutorial.includes(token)) tokenScore = Math.max(tokenScore, 18);
    if (fields.related.includes(token)) tokenScore = Math.max(tokenScore, 10);
    if (tokenScore === 0) return null;
    score += tokenScore;
    for (const [field, value] of Object.entries(fields)) {
      if (value.includes(token)) matched.add(field as LibrarySearchResult["matchedFields"][number]);
    }
  }
  return Object.freeze({
    entry,
    score,
    matchedFields: Object.freeze([...matched]),
  });
}

function tutorialSearchText(entry: LibraryEntry): string {
  const tutorial = entry.tutorial;
  if (tutorial === null || tutorial === undefined) return "";
  return [
    tutorial.pathId,
    tutorial.learningGoals.join(" "),
    tutorial.completionChecks.join(" "),
    ...tutorial.steps.flatMap((step) => [
      step.title,
      step.instruction,
      step.check,
      ...step.artifacts.flatMap((artifact) => [
        artifact.kind,
        artifact.example.caption,
        artifact.example.code,
      ]),
    ]),
  ].join(" ");
}

function tokenize(query: string): readonly string[] {
  return Object.freeze([
    ...new Set(
      normalize(query)
        .split(/[^\p{Letter}\p{Number}_#<>.-]+/u)
        .filter(Boolean),
    ),
  ]);
}

function normalize(value: string): string {
  return value.normalize("NFKC").toLocaleLowerCase("zh-Hans-CN");
}

function normalizeLimit(value: number | undefined): number {
  if (value === undefined) return DEFAULT_LIMIT;
  if (!Number.isSafeInteger(value) || value < 1 || value > MAX_LIMIT) {
    throw new RangeError(`Library 搜索 limit 必须在 1–${String(MAX_LIMIT)} 之间`);
  }
  return value;
}
