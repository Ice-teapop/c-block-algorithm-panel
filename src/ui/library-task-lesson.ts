import type { LibraryEntry } from "../library/index.js";
import type { InterfaceLocale } from "../shared/interface-locale.js";
import { createInsertionSortTaskLesson } from "./insertion-sort-task-lesson.js";

export const INSERTION_SORT_TASK_LESSON_ID = "lesson.task.insertion-sort";

export type LibraryTaskLessonPhase = "intro" | "task" | "completed";

export interface LibraryTaskLesson {
  readonly phase: LibraryTaskLessonPhase;
  setLocale(locale: InterfaceLocale, entry: LibraryEntry): void;
  destroy(): void;
}

export interface LibraryTaskLessonOptions {
  readonly locale: InterfaceLocale;
  readonly entry: LibraryEntry;
  readonly onPhaseChange?: ((phase: LibraryTaskLessonPhase) => void) | undefined;
}

export function createLibraryTaskLesson(
  host: HTMLElement,
  taskLessonId: string,
  options: LibraryTaskLessonOptions,
): LibraryTaskLesson | null {
  if (taskLessonId !== INSERTION_SORT_TASK_LESSON_ID) return null;
  return createInsertionSortTaskLesson(host, options);
}
