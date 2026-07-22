import { describe, expect, it } from "vitest";
import {
  createFoaTutorialsCatalog,
  createLibraryTutorialsCatalog,
} from "../../src/ui/library-tutorials-module.js";

describe("standalone Tutorials catalog", () => {
  it("projects the complete FOA course with stable chapter, prerequisite and task-mode fields", () => {
    const catalog = createFoaTutorialsCatalog();

    expect(catalog.items).toHaveLength(120);
    expect(new Set(catalog.items.map((item) => item.id)).size).toBe(120);
    expect(new Set(catalog.items.map((item) => item.chapterId)).size).toBe(13);
    expect(catalog.items[0]).toMatchObject({
      id: "tutorial.foa.c01.l001",
      chapterId: "foa.chapter.01",
      masteryStatus: "not-started",
      mode: "semantic",
    });
    expect(catalog.items[59]?.chapterId).toBe("foa.chapter.07");
    expect(catalog.items[59]).toMatchObject({
      taskLessonId: "lesson.task.insertion-sort",
      title: {
        "zh-CN": "插入排序的已排序前缀",
        en: "Insertion sort's sorted prefix",
      },
    });
    expect(catalog.items[60]?.chapterId).toBe("foa.chapter.08");
    expect(
      catalog.items.slice(0, 59).every((item) => item.taskLessonId === "lesson.task.foa"),
    ).toBe(true);
    expect(catalog.items.slice(0, 60).every((item) => item.mode === "semantic")).toBe(true);
    expect(catalog.items.slice(60).some((item) => item.mode === "block-observe")).toBe(true);

    for (const lesson of catalog.items) {
      expect(lesson.taskLessonId).toMatch(/^lesson\.task\.(?:foa|insertion-sort)$/u);
      expect(lesson.chapterTitle["zh-CN"].length).toBeGreaterThan(0);
      expect(lesson.chapterTitle.en.length).toBeGreaterThan(0);
      expect(lesson.title["zh-CN"].length).toBeGreaterThan(0);
      expect(lesson.title.en.length).toBeGreaterThan(0);
      expect(lesson.knowledgePointIds.length).toBeGreaterThan(0);
    }
  });

  it("uses the FOA course as the only Tutorials catalog", () => {
    const catalog = createLibraryTutorialsCatalog();

    expect(catalog.items).toHaveLength(120);
    expect(catalog.items.every((item) => item.id.startsWith("tutorial.foa."))).toBe(true);
    expect(catalog.items.some((item) => item.chapterId.startsWith("workbench."))).toBe(false);
  });
});
