import { describe, expect, it } from "vitest";
import {
  containsHan,
  getLibraryEntry,
  LIBRARY_ENTRIES,
  localizeLibraryEntry,
  searchLibrary,
} from "../../src/library/index.js";
import { FOA_LESSONS, getFoaLesson } from "../../src/tutorials/foa-curriculum.js";

describe("FOA Library coverage", () => {
  it("keeps every lesson and knowledge point searchable in both authored languages", () => {
    const lessonEntries = LIBRARY_ENTRIES.filter(({ id }) => id.startsWith("tutorial.foa."));
    const knowledgeEntries = LIBRARY_ENTRIES.filter(({ id }) => id.startsWith("foa.kc."));
    expect(lessonEntries).toHaveLength(120);
    expect(knowledgeEntries).toHaveLength(120);

    for (const lesson of FOA_LESSONS) {
      const point = lesson.knowledgePoints[0];
      if (point === undefined) throw new Error(`${lesson.id} has no knowledge point`);
      for (const query of [lesson.title.zh, lesson.title.en]) {
        expect(
          searchLibrary(query, { branchId: "examples", limit: 500 }).map(({ entry }) => entry.id),
          `${lesson.id} <- ${query}`,
        ).toContain(lesson.id);
      }
      for (const query of [point.title.zh, point.title.en]) {
        expect(
          searchLibrary(query, { audiences: ["learner"], limit: 500 }).map(({ entry }) => entry.id),
          `${point.id} <- ${query}`,
        ).toContain(point.id);
      }
    }
  });

  it("deep-links every lesson and knowledge point to the same Tutorials lesson", () => {
    for (const lesson of FOA_LESSONS) {
      const lessonEntry = requiredEntry(lesson.id);
      expect(lessonEntry.featureLink, lesson.id).toEqual({
        label: "打开交互教程",
        pageId: "tutorials",
        targetId: lesson.id,
      });
      expect(getFoaLesson(lessonEntry.featureLink!.targetId), lesson.id).toBe(lesson);

      for (const point of lesson.knowledgePoints) {
        const pointEntry = requiredEntry(point.id);
        expect(lessonEntry.relatedEntryIds, `${lesson.id} -> ${point.id}`).toContain(point.id);
        expect(pointEntry.relatedEntryIds, `${point.id} -> ${lesson.id}`).toContain(lesson.id);
        expect(pointEntry.featureLink, point.id).toEqual({
          label: "在教程中练习",
          pageId: "tutorials",
          targetId: lesson.id,
        });
        expect(getFoaLesson(pointEntry.featureLink!.targetId), point.id).toBe(lesson);
      }
    }
  });

  it("uses only the TODO workspace scaffold in Library for lessons 106 through 120", () => {
    for (const lesson of FOA_LESSONS.slice(105)) {
      const exercise = lesson.workspaceExercise;
      if (exercise === null) throw new Error(`${lesson.id} has no workspace exercise`);
      expect(exercise.initialSource, lesson.id).toContain("TODO:");
      expect(exercise.initialSource, lesson.id).not.toBe(lesson.code.text);

      for (const entryId of [lesson.id, ...lesson.knowledgePoints.map(({ id }) => id)]) {
        const entry = requiredEntry(entryId);
        expect(entry.example?.code, entryId).toBe(exercise.initialSource.trim());
        expect(entry.example?.code, entryId).not.toBe(lesson.code.text.trim());
        expect(localizeLibraryEntry(entry, "en").example?.code, `${entryId}.en`).toContain("TODO:");
        expect(localizeLibraryEntry(entry, "en").example?.code, `${entryId}.en`).not.toBe(
          lesson.code.text.trim(),
        );
      }
    }
  });

  it("provides complete Chinese and English fields without Chinese presentation residue in en", () => {
    for (const lesson of FOA_LESSONS) {
      expectBilingual(lesson.title, `${lesson.id}.title`);
      expectBilingual(lesson.summary, `${lesson.id}.summary`);
      expectBilingual(lesson.evidenceBoundary, `${lesson.id}.evidenceBoundary`);
      expectBilingual(lesson.case.description, `${lesson.id}.case.description`);
      expectBilingual(lesson.complexity.explanation, `${lesson.id}.complexity.explanation`);
      expectBilingual(lesson.fading.hintPolicy, `${lesson.id}.fading.hintPolicy`);
      for (const [index, objective] of lesson.objectives.entries())
        expectBilingual(objective, `${lesson.id}.objectives[${String(index)}]`);
      for (const point of lesson.knowledgePoints) {
        expectBilingual(point.title, `${point.id}.title`);
        expectBilingual(point.explanation, `${point.id}.explanation`);
      }
      for (const event of lesson.semanticEvents)
        expectBilingual(event.label, `${lesson.id}.${event.id}.label`);
      for (const relation of lesson.relations)
        expectBilingual(relation.label, `${lesson.id}.${relation.id}.label`);

      for (const entryId of [lesson.id, ...lesson.knowledgePoints.map(({ id }) => id)]) {
        const entry = requiredEntry(entryId);
        const english = entry.localizations?.en;
        expect(english?.title, `${entryId}.en.title`).toBeTruthy();
        expect(english?.summary, `${entryId}.en.summary`).toBeTruthy();
        expect(english?.details?.length, `${entryId}.en.details`).toBeGreaterThanOrEqual(2);
        expect(english?.aliases?.length, `${entryId}.en.aliases`).toBeGreaterThan(0);
        expect(english?.keywords?.length, `${entryId}.en.keywords`).toBeGreaterThan(0);
        expect(english?.example?.caption, `${entryId}.en.example.caption`).toBeTruthy();
        expect(english?.complexity, `${entryId}.en.complexity`).toBeTruthy();
        expect(english?.pitfalls?.length, `${entryId}.en.pitfalls`).toBeGreaterThan(0);
        expect(english?.featureLinkLabel, `${entryId}.en.featureLinkLabel`).toBeTruthy();

        const localized = localizeLibraryEntry(entry, "en");
        const presentationCopy = [
          localized.title,
          localized.summary,
          ...localized.details,
          ...localized.aliases,
          ...localized.keywords,
          localized.example?.caption ?? "",
          localized.complexity ?? "",
          ...(localized.pitfalls ?? []),
          localized.featureLink?.label ?? "",
        ].join("\n");
        expect(containsHan(presentationCopy), entryId).toBe(false);
      }
    }
  });

  it("keeps bilingual Library presentation free of duplicate punctuation and internal templates", () => {
    const doubledPunctuation =
      /(?:[。！？；：，、]\s*[。！？；：，、.!?;:,]|[.!?;:,]\s*[。！？；：，、.!?;:,])/u;
    const entries = LIBRARY_ENTRIES.filter(
      ({ id }) => id.startsWith("tutorial.foa.") || id.startsWith("foa.kc."),
    );
    expect(entries).toHaveLength(240);

    for (const entry of entries) {
      for (const locale of ["zh-CN", "en"] as const) {
        const localized = localizeLibraryEntry(entry, locale);
        const prose = [
          localized.title,
          localized.summary,
          ...localized.details,
          localized.example?.caption ?? "",
          localized.complexity ?? "",
          ...(localized.pitfalls ?? []),
          localized.featureLink?.label ?? "",
        ].join("\n");
        expect(prose, `${entry.id}.${locale}`).not.toMatch(doubledPunctuation);
        expect(prose, `${entry.id}.${locale}`).not.toMatch(/TODO\(\{\{|\{\{core_step\}\}/u);
        expect(prose, `${entry.id}.${locale}`).not.toContain("foa.kc.");
        expect(prose, `${entry.id}.${locale}`).not.toMatch(
          /常驻证据|完成前始终保留的证据|Persistent evidence|evidence kept visible/iu,
        );
      }
    }
  });
});

function requiredEntry(entryId: string) {
  const entry = getLibraryEntry(entryId);
  if (entry === null) throw new Error(`Missing Library entry ${entryId}`);
  return entry;
}

function expectBilingual(
  value: Readonly<{ readonly zh: string; readonly en: string }>,
  label: string,
): void {
  expect(value.zh.trim().length, `${label}.zh`).toBeGreaterThan(0);
  expect(value.en.trim().length, `${label}.en`).toBeGreaterThan(0);
}
