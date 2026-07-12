import { LIBRARY_BRANCHES, LIBRARY_BRANCH_IDS } from "./branches.js";
import type {
  LibraryAudience,
  LibraryBranchId,
  LibraryCodeExample,
  LibraryEntry,
  LibraryEntryInput,
  LibraryFeatureLink,
  LibraryTutorial,
  LibraryTutorialArtifactKind,
} from "./contracts.js";
import { DSA_LIBRARY_ENTRIES } from "./entries-dsa.js";
import { LANGUAGE_LIBRARY_ENTRIES } from "./entries-language.js";
import { PLATFORM_LIBRARY_ENTRIES } from "./entries-platform.js";
import { TUTORIAL_LIBRARY_ENTRIES } from "./entries-tutorials.js";

const ENTRY_ID_PATTERN = /^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$/u;
const TUTORIAL_STEP_ID_PATTERN = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/u;
const TUTORIAL_LEVELS = new Set(["beginner", "intermediate"]);
const TUTORIAL_ARTIFACT_KINDS: ReadonlySet<LibraryTutorialArtifactKind> = new Set([
  "source",
  "snippet",
  "stdin",
  "expected-output",
]);

const RAW_ENTRIES: readonly LibraryEntryInput[] = [
  ...PLATFORM_LIBRARY_ENTRIES,
  ...LANGUAGE_LIBRARY_ENTRIES,
  ...DSA_LIBRARY_ENTRIES,
  ...TUTORIAL_LIBRARY_ENTRIES,
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
  const normalized: LibraryEntry[] = inputs.map((input) => {
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
    const example = normalizeCodeExample(input.example, `${input.id}.example`);
    const syntaxInput = input.syntax ?? (input.branchId === "c-syntax" ? input.example : null);
    const syntax = normalizeCodeExample(syntaxInput, `${input.id}.syntax`);
    const pitfalls = uniqueText(input.pitfalls ?? []);
    const featureLink = normalizeFeatureLink(input.featureLink, `${input.id}.featureLink`);
    const tutorial = normalizeTutorial(input);
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
      audience: input.audience ?? defaultAudience(input.branchId),
      syntax,
      complexity: normalizeComplexity(input),
      pitfalls,
      tutorial,
    });
  });

  const tutorialPositions = new Set<string>();
  for (const entry of normalized) {
    for (const relatedId of entry.relatedEntryIds) {
      if (!ids.has(relatedId)) {
        throw new TypeError(`Library 条目 ${entry.id} 的交叉链接不存在：${relatedId}`);
      }
    }
    if (entry.tutorial === null || entry.tutorial === undefined) continue;
    for (const prerequisiteId of entry.tutorial.prerequisiteEntryIds) {
      if (prerequisiteId === entry.id) {
        throw new TypeError(`Library 教程 ${entry.id} 不能把自身设为前置词条`);
      }
      if (!ids.has(prerequisiteId)) {
        throw new TypeError(`Library 教程 ${entry.id} 的前置词条不存在：${prerequisiteId}`);
      }
    }
    const position = `${entry.tutorial.pathId}:${String(entry.tutorial.order)}`;
    if (tutorialPositions.has(position)) {
      throw new TypeError(`Library 教程路径位置重复：${position}`);
    }
    tutorialPositions.add(position);
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

function normalizeTutorial(input: LibraryEntryInput): LibraryTutorial | null {
  const tutorial = input.tutorial;
  if (tutorial === null || tutorial === undefined) return null;
  if (input.branchId !== "examples") {
    throw new TypeError(`Library 教程 ${input.id} 必须位于案例分支`);
  }
  const pathId = requireText(tutorial.pathId, `${input.id}.tutorial.pathId`);
  if (!ENTRY_ID_PATTERN.test(pathId)) {
    throw new TypeError(`Library 教程 ${input.id} 的 pathId 非法：${pathId}`);
  }
  const guidedLessonId =
    tutorial.guidedLessonId === undefined
      ? undefined
      : requireText(tutorial.guidedLessonId, `${input.id}.tutorial.guidedLessonId`);
  if (guidedLessonId !== undefined && !ENTRY_ID_PATTERN.test(guidedLessonId)) {
    throw new TypeError(`Library 教程 ${input.id} 的 guidedLessonId 非法：${guidedLessonId}`);
  }
  assertIntegerInRange(tutorial.order, 1, 1000, `${input.id}.tutorial.order`);
  assertIntegerInRange(tutorial.estimatedMinutes, 1, 180, `${input.id}.tutorial.estimatedMinutes`);
  if (!TUTORIAL_LEVELS.has(tutorial.level)) {
    throw new TypeError(`Library 教程 ${input.id} 的 level 非法：${tutorial.level}`);
  }
  const prerequisiteEntryIds = uniqueText(tutorial.prerequisiteEntryIds);
  const learningGoals = boundedTextList(
    tutorial.learningGoals,
    1,
    6,
    `${input.id}.tutorial.learningGoals`,
  );
  const completionChecks = boundedTextList(
    tutorial.completionChecks,
    1,
    8,
    `${input.id}.tutorial.completionChecks`,
  );
  if (tutorial.steps.length < 2 || tutorial.steps.length > 8) {
    throw new TypeError(`Library 教程 ${input.id} 必须包含 2–8 个步骤`);
  }
  const stepIds = new Set<string>();
  const steps = Object.freeze(
    tutorial.steps.map((step, stepIndex) => {
      if (!TUTORIAL_STEP_ID_PATTERN.test(step.id) || stepIds.has(step.id)) {
        throw new TypeError(`Library 教程 ${input.id} 的步骤 id 非法或重复：${step.id}`);
      }
      stepIds.add(step.id);
      const title = requireText(
        step.title,
        `${input.id}.tutorial.steps[${String(stepIndex)}].title`,
      );
      const instruction = requireText(
        step.instruction,
        `${input.id}.tutorial.steps[${String(stepIndex)}].instruction`,
      );
      if (instruction.length < 15) {
        throw new TypeError(`Library 教程 ${input.id} 的步骤 ${step.id} 缺少实质操作说明`);
      }
      const check = requireText(
        step.check,
        `${input.id}.tutorial.steps[${String(stepIndex)}].check`,
      );
      if (check.length < 8) {
        throw new TypeError(`Library 教程 ${input.id} 的步骤 ${step.id} 缺少可观察检查`);
      }
      if (step.artifacts.length > 4) {
        throw new TypeError(`Library 教程 ${input.id} 的步骤 ${step.id} 附件过多`);
      }
      const artifacts = Object.freeze(
        step.artifacts.map((artifact, artifactIndex) => {
          if (!TUTORIAL_ARTIFACT_KINDS.has(artifact.kind)) {
            throw new TypeError(
              `Library 教程 ${input.id} 的步骤 ${step.id} 附件类型非法：${artifact.kind}`,
            );
          }
          const example = normalizeCodeExample(
            artifact.example,
            `${input.id}.tutorial.steps[${String(stepIndex)}].artifacts[${String(artifactIndex)}]`,
          );
          if (example === null) throw new TypeError(`Library 教程 ${input.id} 的附件不能为空`);
          return Object.freeze({ kind: artifact.kind, example });
        }),
      );
      const featureLink = normalizeFeatureLink(
        step.featureLink,
        `${input.id}.tutorial.steps[${String(stepIndex)}].featureLink`,
      );
      return Object.freeze({
        id: step.id,
        title,
        instruction,
        artifacts,
        featureLink,
        check,
      });
    }),
  );
  return Object.freeze({
    ...(guidedLessonId === undefined ? {} : { guidedLessonId }),
    pathId,
    order: tutorial.order,
    level: tutorial.level,
    estimatedMinutes: tutorial.estimatedMinutes,
    prerequisiteEntryIds,
    learningGoals,
    steps,
    completionChecks,
  });
}

function normalizeCodeExample(
  example: LibraryCodeExample | null | undefined,
  field: string,
): LibraryCodeExample | null {
  if (example === null || example === undefined) return null;
  return Object.freeze({
    language: example.language,
    caption: requireText(example.caption, `${field}.caption`),
    code: requireText(example.code, `${field}.code`),
  });
}

function normalizeFeatureLink(
  featureLink: LibraryFeatureLink | null | undefined,
  field: string,
): LibraryFeatureLink | null {
  if (featureLink === null || featureLink === undefined) return null;
  return Object.freeze({
    label: requireText(featureLink.label, `${field}.label`),
    pageId: requireText(featureLink.pageId, `${field}.pageId`),
    targetId: requireText(featureLink.targetId, `${field}.targetId`),
  });
}

function boundedTextList(
  values: readonly string[],
  minimum: number,
  maximum: number,
  field: string,
): readonly string[] {
  if (values.length < minimum || values.length > maximum) {
    throw new TypeError(`${field} 必须包含 ${String(minimum)}–${String(maximum)} 项`);
  }
  return Object.freeze(
    values.map((value, index) => requireText(value, `${field}[${String(index)}]`)),
  );
}

function assertIntegerInRange(
  value: number,
  minimum: number,
  maximum: number,
  field: string,
): void {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new TypeError(`${field} 必须是 ${String(minimum)}–${String(maximum)} 的整数`);
  }
}

function defaultAudience(branchId: LibraryBranchId): LibraryAudience {
  if (branchId === "extension-api") return "developer";
  if (
    branchId === "c-syntax" ||
    branchId === "standard-library" ||
    branchId === "data-structure-dictionary" ||
    branchId === "algorithms-complexity" ||
    branchId === "examples"
  ) {
    return "learner";
  }
  return "help";
}

function normalizeComplexity(input: LibraryEntryInput): string | null {
  if (input.complexity !== null && input.complexity !== undefined) {
    return requireText(input.complexity, `${input.id}.complexity`);
  }
  const matches = [
    ...`${input.summary} ${input.details.join(" ")}`.matchAll(/O\([^)]{1,24}\)/gu),
  ].map((match) => match[0]);
  const distinct = [...new Set(matches)];
  return distinct.length === 0 ? null : distinct.join(" / ");
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
