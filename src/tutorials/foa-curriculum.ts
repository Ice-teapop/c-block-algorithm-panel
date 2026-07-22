/**
 * Public, data-only entry point for the Foundations of Algorithms with C curriculum.
 *
 * Keep consumers on this module so the catalog's internal grouping and construction can evolve
 * without changing Library or course-runtime imports.
 */
export {
  FOA_CHAPTERS,
  FOA_CURRICULUM_VERSION,
  FOA_LESSON_BY_ID,
  FOA_LESSONS,
  foaLessonsForChapter,
  getFoaLesson,
} from "./foa-catalog.js";

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
  FoaWorkspaceExercise,
  FoaWorkspaceExerciseCase,
  FoaWorkspaceSourceRequirement,
  FoaLocale,
  FoaLocalizedText,
  FoaSemanticEvent,
  FoaSemanticRelation,
} from "./foa-catalog.js";
