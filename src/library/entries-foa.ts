import { FOA_LESSONS } from "../tutorials/foa-curriculum.js";
import type {
  FoaKnowledgePoint,
  FoaLessonDefinition,
  FoaSemanticEventType,
} from "../tutorials/foa-contracts.js";
import type { FoaSceneProfile } from "../tutorials/foa-scene-profile.js";
import { getFoaSceneProfile } from "../tutorials/foa-scene-profiles.js";
import type { LibraryBranchId, LibraryEntryInput, LibraryEntryLocalization } from "./contracts.js";

/**
 * Searchable Library projections for the standalone FOA course.
 *
 * Course content remains authoritative: this adapter deliberately derives both the lesson entry
 * and its knowledge-point dictionary entries from the same frozen definitions. Adding a course
 * lesson therefore cannot silently omit its concepts from Library search.
 */
export const FOA_LIBRARY_ENTRIES: readonly LibraryEntryInput[] = Object.freeze([
  ...FOA_LESSONS.map(lessonEntry),
  ...FOA_LESSONS.flatMap(knowledgeEntries),
]);

function lessonEntry(lesson: FoaLessonDefinition): LibraryEntryInput {
  const profile = sceneProfileForLesson(lesson);
  const eventTypes = unique(lesson.semanticEvents.map((event) => event.type));
  const knowledgeIds = lesson.knowledgePoints.map((point) => point.id);
  const related = unique([...lesson.prerequisiteIds, ...knowledgeIds]);
  const lessonSource = lesson.workspaceExercise?.initialSource ?? lesson.code.text;
  const knowledge = lesson.knowledgePoints[0]!;
  return Object.freeze({
    id: lesson.id,
    branchId: "examples",
    title: lesson.title.zh,
    summary: lesson.summary.zh,
    details: Object.freeze([
      `概念说明：${sentenceFragment(knowledge.explanation.zh)}。`,
      ...(profile === null
        ? []
        : [
            `实验目标：${sentenceFragment(profile.caseGoal.zh)}。`,
            `可观察状态：${observableList(profile, "zh")}。`,
          ]),
      `案例约束：输入 ${inlineCase(lesson.case.stdin)} 应得到 ${inlineCase(lesson.case.stdout)}。`,
      `证据边界：${sentenceFragment(lesson.evidenceBoundary.zh)}。`,
      `复杂度说明：${lesson.complexity.explanation.zh}`,
    ]),
    aliases: Object.freeze([
      lesson.title.en,
      lesson.experience.visualModel.en,
      `FOA ${lesson.section}`,
    ]),
    keywords: Object.freeze([
      `chapter ${String(lesson.chapter)}`,
      lesson.mode,
      lesson.presentation,
      lesson.interaction,
      lesson.experience.visualFamily,
      ...eventTypes,
      ...lesson.libraryKnowledgeIds,
      ...mechanismKeywords(profile, "zh"),
    ]),
    example: Object.freeze({
      language: "c",
      caption: `${lesson.title.zh} · ${lesson.code.kind === "complete" ? "完整程序" : "练习模板"}`,
      code: lessonSource,
    }),
    relatedEntryIds: Object.freeze(related),
    featureLink: Object.freeze({
      label: "打开交互教程",
      pageId: "tutorials",
      targetId: lesson.id,
    }),
    audience: "learner",
    complexity: `${lesson.complexity.time} 时间；${lesson.complexity.space} 额外空间。${lesson.complexity.explanation.zh}`,
    pitfalls: Object.freeze([lesson.experience.hiddenByDefault.zh, lesson.fading.hintPolicy.zh]),
    localizations: Object.freeze({
      en: lessonLocalization(lesson, profile, related, eventTypes),
    }),
  });
}

function knowledgeEntries(lesson: FoaLessonDefinition): readonly LibraryEntryInput[] {
  return lesson.knowledgePoints.map((point) => knowledgeEntry(lesson, point));
}

function knowledgeEntry(lesson: FoaLessonDefinition, point: FoaKnowledgePoint): LibraryEntryInput {
  const profile = sceneProfileForLesson(lesson);
  const branchId = branchForKnowledgePoint(lesson, point);
  const workspaceScaffold = lesson.workspaceExercise?.initialSource;
  const anchor =
    workspaceScaffold ??
    lesson.semanticEvents[0]?.codeAnchor ??
    lesson.code.text.split("\n")[0] ??
    "";
  return Object.freeze({
    id: point.id,
    branchId,
    title: point.title.zh,
    summary: point.explanation.zh,
    details: Object.freeze([
      `本概念在“${lesson.title.zh}”中通过一项可观察任务练习：${sentenceFragment(lesson.experience.primaryAction.zh)}。`,
      ...(profile === null
        ? []
        : [
            `实验目标：${sentenceFragment(profile.caseGoal.zh)}。`,
            `重点观察：${observableList(profile, "zh")}。`,
          ]),
      `案例约束：输入 ${inlineCase(lesson.case.stdin)} 应得到 ${inlineCase(lesson.case.stdout)}。`,
      `证据边界：${sentenceFragment(lesson.evidenceBoundary.zh)}。`,
    ]),
    aliases: Object.freeze([point.title.en, lesson.title.zh, lesson.title.en]),
    keywords: Object.freeze([
      `FOA ${lesson.section}`,
      lesson.mode,
      ...lesson.semanticEvents.map((event) => event.type),
      ...lesson.relations.map((relation) => relation.role),
      ...mechanismKeywords(profile, "zh"),
    ]),
    example: Object.freeze({
      language: "c",
      caption:
        workspaceScaffold === undefined
          ? `${lesson.title.zh}中的最小代码锚点`
          : `${lesson.title.zh}的独立练习起始源码`,
      code: anchor,
    }),
    relatedEntryIds: Object.freeze([lesson.id]),
    featureLink: Object.freeze({
      label: "在教程中练习",
      pageId: "tutorials",
      targetId: lesson.id,
    }),
    audience: "learner",
    complexity: `${lesson.complexity.time} 时间；${lesson.complexity.space} 额外空间。`,
    pitfalls: Object.freeze([lesson.experience.hiddenByDefault.zh]),
    localizations: Object.freeze({
      en: Object.freeze({
        title: point.title.en,
        summary: point.explanation.en,
        details: Object.freeze([
          `Practise this concept through the observable task in “${lesson.title.en}”: ${sentenceFragment(lesson.experience.primaryAction.en)}.`,
          ...(profile === null
            ? []
            : [
                `Experiment goal: ${sentenceFragment(profile.caseGoal.en)}.`,
                `Observe: ${observableList(profile, "en")}.`,
              ]),
          `Case contract: input ${inlineCase(lesson.case.stdin)} must produce ${inlineCase(lesson.case.stdout)}.`,
          `Evidence boundary: ${sentenceFragment(lesson.evidenceBoundary.en)}.`,
        ]),
        aliases: Object.freeze([point.title.en, lesson.title.en, `FOA ${lesson.section}`]),
        keywords: Object.freeze([
          `FOA ${lesson.section}`,
          lesson.mode,
          ...lesson.semanticEvents.map((event) => event.type),
          ...lesson.relations.map((relation) => relation.role),
          ...mechanismKeywords(profile, "en"),
        ]),
        example: Object.freeze({
          caption:
            workspaceScaffold === undefined
              ? `Minimal source anchor from ${lesson.title.en}`
              : `Independent-practice starting source for ${lesson.title.en}`,
        }),
        complexity: `${lesson.complexity.time} time; ${lesson.complexity.space} auxiliary space.`,
        pitfalls: Object.freeze([lesson.experience.hiddenByDefault.en]),
        featureLinkLabel: "Practise in Tutorials",
      }),
    }),
  });
}

function lessonLocalization(
  lesson: FoaLessonDefinition,
  profile: FoaSceneProfile | null,
  related: readonly string[],
  eventTypes: readonly FoaSemanticEventType[],
): LibraryEntryLocalization {
  void related;
  void eventTypes;
  return Object.freeze({
    title: lesson.title.en,
    summary: lesson.summary.en,
    details: Object.freeze([
      `Concept: ${sentenceFragment(lesson.knowledgePoints[0]!.explanation.en)}.`,
      ...(profile === null
        ? []
        : [
            `Experiment goal: ${sentenceFragment(profile.caseGoal.en)}.`,
            `Observable state: ${observableList(profile, "en")}.`,
          ]),
      `Case contract: input ${inlineCase(lesson.case.stdin)} must produce ${inlineCase(lesson.case.stdout)}.`,
      `Evidence boundary: ${sentenceFragment(lesson.evidenceBoundary.en)}.`,
      `Complexity note: ${lesson.complexity.explanation.en}`,
    ]),
    aliases: Object.freeze([
      lesson.title.en,
      lesson.experience.visualModel.en,
      `FOA ${lesson.section}`,
    ]),
    keywords: Object.freeze([
      `chapter ${String(lesson.chapter)}`,
      lesson.mode,
      lesson.presentation,
      lesson.interaction,
      lesson.experience.visualFamily,
      ...lesson.semanticEvents.map((event) => event.type),
      ...lesson.libraryKnowledgeIds,
      ...mechanismKeywords(profile, "en"),
    ]),
    example: Object.freeze({
      caption: `${lesson.title.en} · ${lesson.code.kind === "complete" ? "complete program" : "practice template"}`,
    }),
    complexity: `${lesson.complexity.time} time; ${lesson.complexity.space} auxiliary space. ${lesson.complexity.explanation.en}`,
    pitfalls: Object.freeze([lesson.experience.hiddenByDefault.en, lesson.fading.hintPolicy.en]),
    featureLinkLabel: "Open interactive lesson",
  });
}

function observableList(profile: FoaSceneProfile, locale: "zh" | "en"): string {
  return profile.observableLabels.map((label) => label[locale]).join("、");
}

function mechanismKeywords(
  profile: FoaSceneProfile | null,
  locale: "zh" | "en",
): readonly string[] {
  if (profile === null) return Object.freeze([]);
  return unique([
    profile.mechanismId,
    profile.observableKind,
    profile.learnerControl,
    ...profile.stateShape.map(({ id }) => id),
    ...profile.observableLabels.map((label) => label[locale]),
  ]);
}

function sceneProfileForLesson(lesson: FoaLessonDefinition): FoaSceneProfile | null {
  return lesson.order <= 60 ? getFoaSceneProfile(lesson.order) : null;
}

function branchForKnowledgePoint(
  lesson: FoaLessonDefinition,
  point: FoaKnowledgePoint,
): LibraryBranchId {
  const searchable = `${point.title.zh} ${point.title.en} ${point.explanation.en}`.toLowerCase();
  if (
    /(array|string|pointer|struct|list|tree|hash|file|memory|数组|字符串|指针|结构|链表|树|文件|内存)/u.test(
      searchable,
    )
  ) {
    return "data-structure-dictionary";
  }
  if (
    lesson.chapter >= 9 ||
    /(algorithm|sort|search|performance|complexity|recurs|算法|排序|搜索|性能|复杂度|递归)/u.test(
      searchable,
    )
  ) {
    return "algorithms-complexity";
  }
  return "c-syntax";
}

function unique<Value>(values: readonly Value[]): readonly Value[] {
  return Object.freeze([...new Set(values)]);
}

function sentenceFragment(value: string): string {
  return value.trim().replace(/[\s。！？；：，、.!?;:,]+$/gu, "");
}

function inlineCase(value: string): string {
  const normalized = value.trim().replace(/\s+/gu, " ");
  return normalized.length === 0 ? "∅" : `“${normalized}”`;
}
