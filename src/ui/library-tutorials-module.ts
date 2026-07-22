import { getLibraryEntry, localizeLibraryEntry } from "../library/index.js";
import type { PanelApi } from "../shared/api.js";
import type { InterfaceLocale } from "../shared/interface-locale.js";
import {
  createFoaCourseSession,
  type FoaCourseProgressStorage,
} from "../app/foa-course-session.js";
import type { RuntimeLearningObservation } from "../app/runtime-workspace-controller.js";
import {
  FOA_CHAPTERS,
  FOA_LESSONS,
  getFoaLesson,
  type FoaLessonDefinition,
} from "../tutorials/foa-curriculum.js";
import { createFoaTaskLesson, type FoaTaskLesson } from "./foa-task-lesson.js";
import { createLibraryTaskLesson } from "./library-task-lesson.js";
import {
  createTutorialsModule,
  type TutorialLessonMode,
  type TutorialsModule,
  type TutorialsModuleCallbacks,
  type TutorialsModuleCatalog,
  type TutorialsModuleLesson,
  type TutorialsProgressSnapshot,
  type TutorialsTaskLessonMount,
} from "./tutorials-module.js";

export interface LibraryTutorialsModuleCallbacks extends Pick<
  TutorialsModuleCallbacks,
  "onOpenLibraryEntry" | "onProgressChange"
> {
  readonly storage?: FoaCourseProgressStorage | undefined;
  readonly traceApi?: Pick<PanelApi, "startTrace" | "readTrace" | "cancelTrace"> | undefined;
  readonly onOpenFoaWorkspace?: ((lesson: FoaLessonDefinition) => void) | undefined;
  readonly onCourseBlocked?: ((message: string) => void) | undefined;
}

export interface LibraryTutorialsModule extends TutorialsModule {
  recordRuntimeObservation(observation: RuntimeLearningObservation): void;
}

/**
 * The FOA course owns the primary learning sequence. Library still projects every course lesson
 * and knowledge point for lookup, while this adapter gives the standalone Tutorials page its
 * ordered, chapter-aware navigation model.
 */
export function createFoaTutorialsCatalog(
  statuses: ReadonlyMap<string, TutorialsModuleLesson["masteryStatus"]> = new Map(),
): TutorialsModuleCatalog {
  const chapterTitles = new Map(FOA_CHAPTERS.map((chapter) => [chapter.chapter, chapter.title]));
  return Object.freeze({
    items: Object.freeze(
      FOA_LESSONS.map((lesson) => {
        const chapter = chapterTitles.get(lesson.chapter);
        if (chapter === undefined) throw new Error(`FOA 教程缺少章节标题：${lesson.id}`);
        return Object.freeze({
          id: lesson.id,
          chapterId: `foa.chapter.${String(lesson.chapter).padStart(2, "0")}`,
          chapterTitle: localized(chapter.zh, chapter.en),
          title: localized(lesson.title.zh, lesson.title.en),
          summary: localized(lesson.summary.zh, lesson.summary.en),
          order: lesson.order,
          level: lesson.order <= 60 ? "beginner" : "intermediate",
          estimatedMinutes: estimatedMinutes(lesson.mode),
          prerequisiteIds: Object.freeze([...lesson.prerequisiteIds]),
          knowledgePointIds: Object.freeze(lesson.knowledgePoints.map((point) => point.id)),
          masteryStatus: statuses.get(lesson.id) ?? ("not-started" as const),
          mode: lesson.mode,
          taskLessonId: lesson.libraryKnowledgeIds.includes("tutorial.insertion-sort-lab")
            ? "lesson.task.insertion-sort"
            : "lesson.task.foa",
          libraryEntryId: lesson.id,
        }) satisfies TutorialsModuleLesson;
      }),
    ),
  });
}

export function createLibraryTutorialsCatalog(
  statuses: ReadonlyMap<string, TutorialsModuleLesson["masteryStatus"]> = new Map(),
): TutorialsModuleCatalog {
  return createFoaTutorialsCatalog(statuses);
}

export function createLibraryTutorialsModule(
  host: HTMLElement,
  callbacks: LibraryTutorialsModuleCallbacks = {},
  catalog?: TutorialsModuleCatalog,
): LibraryTutorialsModule {
  const localeHost = host.closest?.<HTMLElement>("[data-locale]") ?? null;
  const initialLocale: InterfaceLocale = localeHost?.dataset.locale === "en" ? "en" : "zh-CN";
  let module: TutorialsModule | null = null;
  let activeFoaTask: FoaTaskLesson | null = null;
  let activeFoaLessonId: string | null = null;
  let latestProgress: TutorialsProgressSnapshot | null = null;
  const session = createFoaCourseSession({
    locale: initialLocale,
    storage: callbacks.storage ?? browserCourseStorage(host.ownerDocument),
    onChange() {
      syncCourseProgress();
    },
  });
  const initialCatalog = catalog ?? createLibraryTutorialsCatalog(statusMap(session));
  latestProgress = progressForCatalog(initialCatalog);

  module = createTutorialsModule(host, initialCatalog, {
    onOpenLibraryEntry: callbacks.onOpenLibraryEntry,
    onProgressChange(snapshot) {
      latestProgress = snapshot;
      applyTraversalProgress(snapshot);
      callbacks.onProgressChange?.(snapshot);
    },
    mountTaskLesson(taskHost, lesson, locale, onPhaseChange) {
      const foaLesson = getFoaLesson(lesson.id);
      if (foaLesson !== null) {
        return mountFoaTaskLesson(taskHost, lesson, foaLesson, locale, onPhaseChange);
      }
      return mountLegacyLibraryTaskLesson(taskHost, lesson, locale, onPhaseChange);
    },
  });

  const onLocaleChange = (event: Event): void => {
    const detail = (event as CustomEvent<{ readonly locale?: unknown }>).detail;
    session.setLocale(detail?.locale === "en" ? "en" : "zh-CN");
  };
  localeHost?.addEventListener("workbench-locale-change", onLocaleChange);

  function applyTraversalProgress(snapshot: TutorialsProgressSnapshot): void {
    const current = session.getStatuses();
    for (const entry of snapshot.entries) {
      if (getFoaLesson(entry.lessonId) === null) continue;
      const actual = current.get(entry.lessonId);
      if (entry.masteryStatus === "skipped" && actual !== "skipped" && actual !== "mastered") {
        session.skipLesson(entry.lessonId);
      } else if (
        entry.masteryStatus === "in-progress" &&
        actual !== "active" &&
        actual !== "in-progress" &&
        actual !== "mastered"
      ) {
        const result = session.startLesson(entry.lessonId);
        if (result.status === "blocked") callbacks.onCourseBlocked?.(result.message);
      }
    }
  }

  function syncCourseProgress(): void {
    if (module === null || latestProgress === null) return;
    const statuses = statusMap(session);
    latestProgress = Object.freeze({
      entries: Object.freeze(
        latestProgress.entries.map((entry) =>
          statuses.has(entry.lessonId)
            ? Object.freeze({
                lessonId: entry.lessonId,
                masteryStatus: statuses.get(entry.lessonId)!,
              })
            : entry,
        ),
      ),
    });
    module.setProgress(latestProgress);
  }

  function mountFoaTaskLesson(
    taskHost: HTMLElement,
    lesson: TutorialsModuleLesson,
    foaLesson: FoaLessonDefinition,
    locale: InterfaceLocale,
    onPhaseChange: (phase: TutorialsTaskLessonMount["phase"]) => void,
  ): TutorialsTaskLessonMount | null {
    if (lesson.taskLessonId === "lesson.task.insertion-sort") {
      const sourceEntry = getLibraryEntry("tutorial.insertion-sort-lab");
      if (sourceEntry === null) return null;
      const task = createLibraryTaskLesson(taskHost, lesson.taskLessonId, {
        locale,
        entry: localizeLibraryEntry(sourceEntry, locale),
        onPhaseChange(phase) {
          if (phase === "task") startFoaLesson(foaLesson.id);
          if (phase === "completed") {
            session.recordLocalEvidence({
              type: "semantic-sequence-completed",
              lessonId: foaLesson.id,
              complete: true,
            });
          }
          onPhaseChange(phase);
        },
      });
      if (task === null) return null;
      return Object.freeze({
        get phase() {
          return task.phase;
        },
        setLocale(nextLocale: InterfaceLocale): void {
          task.setLocale(nextLocale, localizeLibraryEntry(sourceEntry, nextLocale));
        },
        destroy(): void {
          task.destroy();
        },
      });
    }

    const task = createFoaTaskLesson(taskHost, foaLesson, {
      locale: locale === "en" ? "en" : "zh",
      traceApi: callbacks.traceApi,
      onPhaseChange(phase) {
        if (phase === "task") startFoaLesson(foaLesson.id);
        onPhaseChange(phase);
      },
      onLocalEvidence(evidence) {
        const result = session.recordLocalEvidence(evidence);
        if (result.status === "ignored") callbacks.onCourseBlocked?.(result.reason);
      },
      onOpenWorkspace() {
        if (startFoaLesson(foaLesson.id)) callbacks.onOpenFoaWorkspace?.(foaLesson);
      },
      onOpenLibraryEntry: callbacks.onOpenLibraryEntry,
    });
    activeFoaTask = task;
    activeFoaLessonId = foaLesson.id;
    return Object.freeze({
      get phase() {
        return task.phase;
      },
      setLocale(nextLocale: InterfaceLocale): void {
        task.setLocale(nextLocale === "en" ? "en" : "zh");
      },
      destroy(): void {
        if (activeFoaTask === task) {
          activeFoaTask = null;
          activeFoaLessonId = null;
        }
        task.destroy();
      },
    });
  }

  function startFoaLesson(lessonId: string): boolean {
    const result = session.startLesson(lessonId);
    if (result.status !== "blocked") return true;
    callbacks.onCourseBlocked?.(result.message);
    return false;
  }

  const visualModule = module;
  return Object.freeze({
    element: visualModule.element,
    get selectedLessonId(): string | null {
      return visualModule.selectedLessonId;
    },
    selectLesson: (lessonId: string) => visualModule.selectLesson(lessonId),
    setProgress(snapshot: TutorialsProgressSnapshot): void {
      latestProgress = snapshot;
      applyTraversalProgress(snapshot);
      syncCourseProgress();
    },
    recordRuntimeObservation(observation: RuntimeLearningObservation): void {
      const lessonId = session.activeLessonId;
      const result = session.recordRuntimeObservation(observation);
      if (
        result.status === "accepted" &&
        lessonId !== null &&
        activeFoaLessonId === lessonId &&
        observation.type === "run-completed"
      ) {
        activeFoaTask?.setVerifiedWorkspaceEvidence({
          lessonId,
          mastered: result.mastered,
          completedCaseId: observation.caseId,
          nextCaseId: result.nextCaseId,
          verified: true,
        });
      }
    },
    destroy(): void {
      localeHost?.removeEventListener("workbench-locale-change", onLocaleChange);
      activeFoaTask = null;
      activeFoaLessonId = null;
      visualModule.destroy();
    },
  });
}

function mountLegacyLibraryTaskLesson(
  host: HTMLElement,
  lesson: TutorialsModuleLesson,
  locale: InterfaceLocale,
  onPhaseChange: (phase: TutorialsTaskLessonMount["phase"]) => void,
): TutorialsTaskLessonMount | null {
  if (lesson.taskLessonId === undefined || lesson.libraryEntryId === undefined) return null;
  const sourceEntry = getLibraryEntry(lesson.libraryEntryId);
  if (sourceEntry === null) return null;
  let currentLocale = locale;
  const task = createLibraryTaskLesson(host, lesson.taskLessonId, {
    locale,
    entry: localizeLibraryEntry(sourceEntry, locale),
    onPhaseChange,
  });
  if (task === null) return null;
  return Object.freeze({
    get phase() {
      return task.phase;
    },
    setLocale(nextLocale: InterfaceLocale): void {
      currentLocale = nextLocale;
      task.setLocale(currentLocale, localizeLibraryEntry(sourceEntry, currentLocale));
    },
    destroy(): void {
      task.destroy();
    },
  });
}

function statusMap(
  session: ReturnType<typeof createFoaCourseSession>,
): ReadonlyMap<string, TutorialsModuleLesson["masteryStatus"]> {
  return new Map(
    [...session.getStatuses()].map(([lessonId, status]) => [
      lessonId,
      status === "active" || status === "in-progress" ? "in-progress" : status,
    ]),
  );
}

function progressForCatalog(catalog: TutorialsModuleCatalog): TutorialsProgressSnapshot {
  return Object.freeze({
    entries: Object.freeze(
      catalog.items.map((item) =>
        Object.freeze({ lessonId: item.id, masteryStatus: item.masteryStatus }),
      ),
    ),
  });
}

function browserCourseStorage(ownerDocument: Document): FoaCourseProgressStorage | undefined {
  try {
    return ownerDocument.defaultView?.localStorage;
  } catch {
    return undefined;
  }
}

function estimatedMinutes(mode: TutorialLessonMode): number {
  if (mode === "semantic") return 12;
  if (mode === "block-observe") return 14;
  if (mode === "block-complete") return 16;
  if (mode === "block-compose") return 20;
  return 28;
}

function localized(zh: string, en: string): { readonly "zh-CN": string; readonly en: string } {
  return Object.freeze({ "zh-CN": zh, en });
}
