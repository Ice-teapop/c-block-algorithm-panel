import type { FoaChapterDefinition, FoaLessonDefinition } from "./foa-contracts.js";
import { foaText } from "./foa-contracts.js";
import { buildFoaLessons } from "./foa-catalog-builder.js";
import { FOA_ADVANCED_GROUPS } from "./foa-lessons-advanced.js";
import { FOA_FOUNDATION_GROUPS } from "./foa-lessons-foundations.js";

export const FOA_CURRICULUM_VERSION = "1.3.0";

export const FOA_LESSONS: readonly FoaLessonDefinition[] = buildFoaLessons([
  ...FOA_FOUNDATION_GROUPS,
  ...FOA_ADVANCED_GROUPS,
]);

export const FOA_LESSON_BY_ID: ReadonlyMap<string, FoaLessonDefinition> = freezeReadonlyMap(
  FOA_LESSONS.map((lesson) => [lesson.id, lesson] as const),
);

const CHAPTER_TITLES = Object.freeze([
  foaText("计算机与程序", "Computers and Programs"),
  foaText("数字输入与输出", "Numbers In, Numbers Out"),
  foaText("作出选择", "Making Choices"),
  foaText("循环", "Loops"),
  foaText("函数入门", "Getting Started with Functions"),
  foaText("函数与指针", "Functions and Pointers"),
  foaText("数组", "Arrays"),
  foaText("结构体", "Structures"),
  foaText("问题求解策略", "Problem Solving Strategies"),
  foaText("动态结构", "Dynamic Structures"),
  foaText("文件操作", "File Operations"),
  foaText("算法", "Algorithms"),
  foaText("其他 C 工具", "Everything Else"),
]);

export const FOA_CHAPTERS: readonly FoaChapterDefinition[] = Object.freeze(
  CHAPTER_TITLES.map((title, index) => {
    const chapter = index + 1;
    return Object.freeze({
      chapter,
      title,
      lessonIds: Object.freeze(
        FOA_LESSONS.filter((lesson) => lesson.chapter === chapter).map((lesson) => lesson.id),
      ),
    });
  }),
);

validateCatalog();

export function getFoaLesson(lessonId: string): FoaLessonDefinition | null {
  return FOA_LESSON_BY_ID.get(lessonId) ?? null;
}

export function foaLessonsForChapter(chapter: number): readonly FoaLessonDefinition[] {
  if (!Number.isInteger(chapter) || chapter < 1 || chapter > 13) return Object.freeze([]);
  return Object.freeze(FOA_LESSONS.filter((lesson) => lesson.chapter === chapter));
}

function validateCatalog(): void {
  if (FOA_LESSONS.length !== 120) {
    throw new RangeError(`FOA catalog must contain 120 lessons; received ${FOA_LESSONS.length}`);
  }
  if (FOA_LESSON_BY_ID.size !== FOA_LESSONS.length) {
    throw new RangeError("FOA lesson IDs must be unique");
  }
  const idPattern = /^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$/u;
  for (const [index, lesson] of FOA_LESSONS.entries()) {
    if (lesson.order !== index + 1) throw new RangeError(`FOA lesson order gap at ${lesson.id}`);
    if (!idPattern.test(lesson.id)) throw new TypeError(`Invalid FOA lesson ID ${lesson.id}`);
    for (const prerequisiteId of lesson.prerequisiteIds) {
      if (!FOA_LESSON_BY_ID.has(prerequisiteId)) {
        throw new RangeError(`${lesson.id} references missing prerequisite ${prerequisiteId}`);
      }
      const prerequisite = FOA_LESSON_BY_ID.get(prerequisiteId);
      if (prerequisite !== undefined && prerequisite.order >= lesson.order) {
        throw new RangeError(`${lesson.id} prerequisite must precede the lesson`);
      }
    }
    if ((lesson.mode === "workspace-evidence") !== (lesson.workspaceExercise !== null)) {
      throw new RangeError(`${lesson.id} has an invalid workspace exercise contract`);
    }
  }
  if (FOA_LESSONS[59]?.chapter !== 7 || FOA_LESSONS[60]?.chapter !== 8) {
    throw new RangeError("FOA lesson 60 must close Chapter 7 and lesson 61 must open Chapter 8");
  }
  const insertionStageLessons = FOA_LESSONS.filter((lesson) =>
    lesson.libraryKnowledgeIds.includes("tutorial.insertion-sort-lab"),
  );
  if (insertionStageLessons.length !== 1 || insertionStageLessons[0]?.order !== 60) {
    throw new RangeError("FOA lesson 60 must own the insertion-sort semantic capstone stage");
  }
}

/**
 * `Object.freeze(new Map())` still permits `set()`. Expose a frozen ReadonlyMap facade instead,
 * while retaining the private Map in a closure for efficient lookup.
 */
function freezeReadonlyMap<Key, Value>(
  entries: readonly (readonly [Key, Value])[],
): ReadonlyMap<Key, Value> {
  const map = new Map(entries);
  return Object.freeze({
    get: map.get.bind(map),
    has: map.has.bind(map),
    entries: map.entries.bind(map),
    keys: map.keys.bind(map),
    values: map.values.bind(map),
    forEach: map.forEach.bind(map),
    get size() {
      return map.size;
    },
    [Symbol.iterator]: map[Symbol.iterator].bind(map),
    get [Symbol.toStringTag]() {
      return "ReadonlyMap";
    },
  }) as ReadonlyMap<Key, Value>;
}

export type {
  FoaChapterDefinition,
  FoaComplexity,
  FoaFadingPlan,
  FoaKnowledgePoint,
  FoaLessonCase,
  FoaLessonCode,
  FoaLessonDefinition,
  FoaLessonInteraction,
  FoaLessonMode,
  FoaLessonPresentation,
  FoaLessonExperience,
  FoaVisualFamily,
  FoaLocale,
  FoaLocalizedText,
  FoaSemanticEvent,
  FoaSemanticRelation,
  FoaWorkspaceExercise,
  FoaWorkspaceExerciseCase,
  FoaWorkspaceSourceRequirement,
} from "./foa-contracts.js";
