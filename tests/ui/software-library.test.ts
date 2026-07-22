import { describe, expect, it, vi } from "vitest";
import { LIBRARY_ENTRIES } from "../../src/library/index.js";
import { FOA_LESSON_BY_ID } from "../../src/tutorials/foa-curriculum.js";
import {
  createSoftwareLibrary,
  LEGACY_LIBRARY_TUTORIAL_TARGETS,
  resolveLibraryTutorialLessonId,
  SOFTWARE_FEATURES,
} from "../../src/ui/software-library.js";
import { MIN_TASK_LESSON_PLAYBACK_STEP_MS } from "../../src/ui/task-lesson-motion.js";
import { createTeachingSourceView } from "../../src/ui/teaching-source-view.js";

describe("software Library catalog", () => {
  it("mounts a stable, accessible C source view and updates only semantic line state", () => {
    const document = new FakeDocument();
    const view = createTeachingSourceView(document as unknown as Document, {
      source: "for (int i = 1; i < count; i++) {\n  values[i] = key;\n}",
      startLine: 10,
    });
    view.setLabel("Live code");
    const lines = teachingSourceLines(view.root as unknown as FakeElement);
    const references = [...lines];

    view.highlight({ activeLine: 11, previousLine: 10, status: "line 11 · insert" });

    expect(lines).toHaveLength(3);
    expect(lines[0]?.dataset.state).toBe("previous");
    expect(lines[1]?.dataset.state).toBe("active");
    expect(lines[1]?.getAttribute("aria-current")).toBe("step");
    expect(
      walk(view.root as unknown as FakeElement).some(
        (element) => element.dataset.syntax === "keyword" && element.textContent === "for",
      ),
    ).toBe(true);
    const viewport = walk(view.root as unknown as FakeElement).find(
      (element) => element.tagName === "PRE",
    );
    expect(viewport?.getAttribute("aria-label")).toBe("Live code");
    expect(viewport?.getAttribute("aria-describedby")).toMatch(/^teaching-source-status-/u);

    view.highlight({ activeLine: 10, previousLine: null, status: "line 10 · loop" });
    expect(teachingSourceLines(view.root as unknown as FakeElement)).toEqual(references);
    expect(lines[0]?.dataset.state).toBe("active");
    expect(() =>
      createTeachingSourceView(document as unknown as Document, { source: "", startLine: 1 }),
    ).toThrow(/不能为空/u);
  });

  it("covers the mainstream product surfaces without duplicate ids", () => {
    expect(new Set(SOFTWARE_FEATURES.map(({ id }) => id)).size).toBe(SOFTWARE_FEATURES.length);
    expect(SOFTWARE_FEATURES.map(({ id }) => id)).toEqual(
      expect.arrayContaining([
        "dashboard",
        "projects",
        "sandboxes",
        "tests",
        "presets",
        "assembly",
        "source",
        "explanation",
        "editing",
        "run",
        "block-library",
        "storage",
        "extensions",
      ]),
    );
  });

  it("documents current capability, limits and concrete extension points for every feature", () => {
    for (const feature of SOFTWARE_FEATURES) {
      expect(feature.pageId.length, feature.id).toBeGreaterThan(0);
      expect(feature.targetId.length, feature.id).toBeGreaterThan(0);
      expect(feature.purpose.length, feature.id).toBeGreaterThan(10);
      expect(feature.currentCapability.length, feature.id).toBeGreaterThan(10);
      expect(feature.limitation.length, feature.id).toBeGreaterThan(6);
      expect(feature.extensionPoints.length, feature.id).toBeGreaterThan(0);
    }
  });

  it("routes every feature to an existing product surface target", () => {
    const existingRoutes = new Set([
      "dashboard:dashboard",
      "dashboard:project",
      "dashboard:sandbox",
      "dashboard:test",
      "build:preset-blocks",
      "build:assembly-canvas",
      "build:code-pane",
      "explanation:explanation",
      "edit:edit",
      "run:run",
      "block-library:block-library-create",
      "build:local-save",
      "software-library:software-library",
    ]);

    for (const feature of SOFTWARE_FEATURES) {
      expect(existingRoutes.has(`${feature.pageId}:${feature.targetId}`), feature.id).toBe(true);
    }
  });

  it("navigates Dock branches, legacy features, cross-dictionary entries and search results", () => {
    const document = new FakeDocument();
    const host = document.createElement("div");
    const onOpenFeature = vi.fn();
    const onStartGuidedLesson = vi.fn();
    const library = createSoftwareLibrary(host as unknown as HTMLElement, {
      onOpenFeature,
      onStartGuidedLesson,
    });

    expect(library.selectedBranchId).toBe("c-syntax");
    expect(library.selectedEntryId.length).toBeGreaterThan(0);
    expect(walk(host).some((element) => element.textContent === "开始第一课")).toBe(false);
    library.selectBranch("manual");
    expect(library.selectedEntryId).toBe("manual.library");
    const startLesson = walk(host).find((element) => element.textContent === "开始第一课");
    if (startLesson === undefined) throw new Error("帮助首页缺少第一课入口");
    startLesson.emit("click");
    expect(onStartGuidedLesson).toHaveBeenCalledOnce();
    const developerDocs = walk(host).find((element) => element.textContent === "开发者文档");
    if (developerDocs === undefined) throw new Error("帮助首页缺少开发者文档入口");
    developerDocs.emit("click");
    expect(library.selectedEntryId).toBe("extension.registry");
    const developerSearch = walk(host).find((element) => element.type === "search");
    if (developerSearch === undefined) throw new Error("fixture 缺少 Library 搜索框");
    developerSearch.value = "sourceFingerprint viewport";
    developerSearch.emit("input");
    expect(library.selectedEntryId).toBe("canvas.view-state");
    library.selectBranch("library.algorithms");
    expect(library.selectedBranchId).toBe("algorithms-complexity");
    expect(library.selectedEntryId.length).toBeGreaterThan(0);
    library.selectEntry("c.pointers");
    expect(library.selectedBranchId).toBe("c-syntax");
    expect(library.selectedEntryId).toBe("c.pointers");
    library.select("run");
    expect(library.selectedFeatureId).toBe("run");
    expect(library.selectedEntryId).toBe("execution.toolchain");
    library.select("tests");
    const openTests = walk(host).find((element) => element.textContent === "打开测试");
    if (openTests === undefined) throw new Error("fixture 缺少兼容功能入口");
    openTests.emit("click");
    expect(onOpenFeature).toHaveBeenCalledWith("dashboard", "test");

    const search = walk(host).find((element) => element.type === "search");
    if (search === undefined) throw new Error("fixture 缺少 Library 搜索框");
    search.value = "memmove";
    search.emit("input");
    expect(library.selectedEntryId).toBe("std.memory");
    search.value = "renderer opaque revision";
    search.emit("input");
    expect(walk(host).some((element) => element.dataset.libraryEntryId === "manual.autosave")).toBe(
      false,
    );
    expect(() => library.selectBranch("missing")).toThrow(/未知 Library 分支/u);
    expect(() => library.selectEntry("missing")).toThrow(/未知 Library 条目/u);

    library.destroy();
    expect(host.children).toEqual([]);
  });

  it("puts guided tutorials first in Examples and renders actions with observable checks", () => {
    const document = new FakeDocument();
    const host = document.createElement("div");
    const onOpenFeature = vi.fn();
    const onStartGuidedLesson = vi.fn();
    const library = createSoftwareLibrary(host as unknown as HTMLElement, {
      onOpenFeature,
      onStartGuidedLesson,
    });

    library.selectBranch("examples");
    expect(library.selectedEntryId).toBe("tutorial.maximum-stream");
    const tutorialButtons = walk(host).filter(
      (element) =>
        element.dataset.libraryEntryId?.startsWith("tutorial.") &&
        !element.dataset.libraryEntryId.startsWith("tutorial.foa."),
    );
    expect(tutorialButtons.map((button) => button.dataset.libraryEntryId)).toEqual([
      "tutorial.maximum-stream",
      "tutorial.blocks-to-c",
      "tutorial.input-cases",
      "tutorial.debug-comparison",
      "tutorial.real-trace",
      "tutorial.complexity-growth",
      "tutorial.pointer-memory",
      "tutorial.failure-recovery",
      "tutorial.insertion-sort-lab",
    ]);
    expect(
      walk(host).some((element) => element.dataset.libraryEntryId === "tutorial.foa.c01.l001"),
    ).toBe(true);
    expect(walk(host).some((element) => element.textContent === "入门路径")).toBe(true);
    expect(walk(host).some((element) => element.textContent === "更多案例")).toBe(true);
    for (const heading of ["你会完成", "通过方式", "可选先修"]) {
      expect(
        walk(host).some((element) => element.textContent === heading),
        heading,
      ).toBe(true);
    }
    expect(walk(host).some((element) => element.textContent === "操作步骤")).toBe(false);
    expect(walk(host).some((element) => element.textContent.startsWith("步骤 1 ·"))).toBe(false);
    expect(walk(host).some((element) => element.textContent === "通俗定义")).toBe(false);

    const startLesson = walk(host).find((element) => element.textContent === "开始交互课程");
    if (startLesson === undefined) throw new Error("找最大值词条缺少交互课程入口");
    expect(startLesson.dataset.guidedLessonId).toBe("lesson.first.maximum-scan");
    startLesson.emit("click");
    expect(onStartGuidedLesson).toHaveBeenCalledOnce();

    library.selectEntry("tutorial.blocks-to-c");
    expect(walk(host).some((element) => element.textContent === "操作步骤")).toBe(true);
    const openSource = walk(host).find(
      (element) => element.dataset.tutorialAction === "compare-source",
    );
    if (openSource === undefined) throw new Error("静态小教程缺少代码面板动作");
    openSource.emit("click");
    expect(onOpenFeature).toHaveBeenCalledWith("build", "code-pane");

    library.selectEntry("examples.binary-search");
    expect(walk(host).some((element) => element.textContent === "通俗定义")).toBe(true);
    const search = walk(host).find((element) => element.type === "search");
    if (search === undefined) throw new Error("fixture 缺少 Library 搜索框");
    search.value = "遮住输出";
    search.emit("input");
    expect(library.selectedEntryId).toBe("tutorial.input-cases");

    library.destroy();
  });

  it("redirects every retired tutorial deep link to an explicit FOA lesson", () => {
    const document = new FakeDocument();
    const host = document.createElement("div");
    const onOpenTutorialLesson = vi.fn();
    const library = createSoftwareLibrary(host as unknown as HTMLElement, {
      onOpenFeature: vi.fn(),
      onStartGuidedLesson: vi.fn(),
      onOpenTutorialLesson,
    });

    const redirects = Object.entries(LEGACY_LIBRARY_TUTORIAL_TARGETS);
    expect(redirects).toHaveLength(9);
    for (const [legacyId, targetId] of redirects) {
      expect(FOA_LESSON_BY_ID.has(targetId), legacyId).toBe(true);
      expect(resolveLibraryTutorialLessonId(legacyId)).toBe(targetId);
      library.selectEntry(legacyId);
      const open = walk(host).find((element) => element.dataset.openTutorialLesson !== undefined);
      expect(open?.dataset.openTutorialLesson, legacyId).toBe(targetId);
      open?.emit("click");
      expect(onOpenTutorialLesson).toHaveBeenLastCalledWith(targetId);
    }
    expect(resolveLibraryTutorialLessonId("tutorial.foa.c01.l001")).toBe("tutorial.foa.c01.l001");

    library.destroy();
  });

  it("runs the v2 insertion-sort lesson with stable tokens, semantic actions and replay", async () => {
    vi.useFakeTimers();
    const document = new FakeDocument();
    const host = document.createElement("div");
    host.dataset.locale = "zh-CN";
    const onOpenFeature = vi.fn();
    const onStartGuidedLesson = vi.fn();
    const library = createSoftwareLibrary(host as unknown as HTMLElement, {
      onOpenFeature,
      onStartGuidedLesson,
    });

    try {
      library.selectEntry("tutorial.insertion-sort-lab");
      expect(library.selectedEntryId).toBe("tutorial.insertion-sort-lab");
      expect(walk(host).some((element) => element.dataset.guidedLessonId !== undefined)).toBe(
        false,
      );
      expect(action(host, "start")?.textContent).toBe("开始实验");
      expect(walk(host).some((element) => element.textContent.includes("不写入项目"))).toBe(true);

      action(host, "start")?.emit("click");
      const root = taskLessonRoot(host);
      expect(root.dataset).toMatchObject({
        taskLessonPhase: "task",
        taskLessonStage: "observe",
        timelinePosition: "0",
      });
      const sourceLineReferences = new Map(
        teachingSourceLines(host).map((line) => [line.dataset.sourceLine!, line]),
      );
      expect(sourceLineReferences.size).toBe(9);
      expect(activeTeachingSourceLine(host)?.dataset.sourceLine).toBe("21");
      expect(
        walk(host).some(
          (element) => element.dataset.syntax === "keyword" && element.textContent === "for",
        ),
      ).toBe(true);
      const sourceViewport = walk(host).find(
        (element) =>
          element.tagName === "PRE" &&
          element.getAttribute("aria-label") === "实时代码 · 与当前语义动作同步",
      );
      expect(sourceViewport?.getAttribute("role")).toBe("region");
      expect(
        teachingSourceLines(host).filter((line) => line.getAttribute("aria-current") === "step"),
      ).toHaveLength(1);
      const sourceSeek = walk(host).find(
        (element) => element.dataset.taskLessonInput === "timeline",
      );
      if (sourceSeek === undefined) throw new Error("教程缺少语义时间轴");
      sourceSeek.value = "2";
      sourceSeek.emit("input");
      expect(activeTeachingSourceLine(host)?.dataset.sourceLine).toBe("23");
      sourceSeek.value = "0";
      sourceSeek.emit("input");
      expect(activeTeachingSourceLine(host)?.dataset.sourceLine).toBe("21");
      for (const line of teachingSourceLines(host)) {
        expect(line).toBe(sourceLineReferences.get(line.dataset.sourceLine!));
      }
      action(host, "play-pause")?.emit("click");
      expect(root.dataset.playbackState).toBe("playing");
      expect(root.dataset.timelinePosition).toBe("1");
      const readableStepMs = MIN_TASK_LESSON_PLAYBACK_STEP_MS * 2;
      vi.advanceTimersByTime(100);
      action(host, "rate-2")?.emit("click");
      vi.advanceTimersByTime((readableStepMs - 100) / 2 - 1);
      expect(root.dataset.timelinePosition).toBe("1");
      vi.advanceTimersByTime(1);
      expect(root.dataset.timelinePosition).toBe("2");
      expect(activeTeachingSourceLine(host)?.dataset.sourceLine).toBe("23");
      expect(
        teachingSourceLines(host).find((line) => line.dataset.sourceLine === "21")?.dataset.state,
      ).toBe("previous");
      action(host, "play-pause")?.emit("click");
      expect(root.dataset.playbackState).toBe("paused");
      action(host, "rate-1")?.emit("click");
      action(host, "play-pause")?.emit("click");
      expect(root.dataset.timelinePosition).toBe("2");
      vi.advanceTimersByTime(readableStepMs - 1);
      expect(root.dataset.timelinePosition).toBe("2");
      vi.advanceTimersByTime(1);
      expect(root.dataset.timelinePosition).toBe("3");
      action(host, "play-pause")?.emit("click");
      expect(root.dataset.playbackState).toBe("paused");
      vi.clearAllTimers();
      const tokenReferences = new Map(
        teachingTokens(host).map((token) => [token.dataset.teachingTokenId!, token]),
      );
      const beforeManualStep = Number(root.dataset.timelinePosition);
      action(host, "next")?.emit("click");
      expect(Number(root.dataset.timelinePosition)).toBe(beforeManualStep + 1);
      for (const token of teachingTokens(host)) {
        expect(token).toBe(tokenReferences.get(token.dataset.teachingTokenId!));
      }

      const positionBeforeLocaleChange = root.dataset.timelinePosition;
      host.dataset.locale = "en";
      host.emit("workbench-locale-change", { detail: { locale: "en" } });
      expect(root.dataset.timelinePosition).toBe(positionBeforeLocaleChange);
      for (const token of teachingTokens(host)) {
        expect(token).toBe(tokenReferences.get(token.dataset.teachingTokenId!));
      }
      expect(visibleLibraryCopy(host)).not.toMatch(/[\u3400-\u9fff]/u);
      expect(
        walk(host).some(
          (element) =>
            element.textContent === "Live code · synced with the current semantic action",
        ),
      ).toBe(true);
      for (const line of teachingSourceLines(host)) {
        expect(line).toBe(sourceLineReferences.get(line.dataset.sourceLine!));
      }
      host.dataset.locale = "zh-CN";
      host.emit("workbench-locale-change", { detail: { locale: "zh-CN" } });

      for (let guard = 0; guard < 100 && root.dataset.taskLessonStage === "observe"; guard += 1) {
        action(host, "next")?.emit("click");
      }
      expect(root.dataset.taskLessonStage).toBe("practice");
      const practiceStart = root.dataset.timelinePosition;
      for (const expectedHintLevel of [1, 2, 3]) {
        action(host, "predict-shift")?.emit("click");
        expect(root.dataset.timelinePosition).toBe(practiceStart);
        expect(root.dataset.hintLevel).toBe(String(expectedHintLevel));
      }

      const draggedKey = teachingTokens(host).find((token) => token.dataset.state === "active");
      const keyTray = action(host, "key-tray");
      if (draggedKey === undefined || keyTray === undefined) {
        throw new Error("练习阶段缺少可拖动 key 或暂存区");
      }
      draggedKey.rectangle = fakeRectangle(0, 0, 40, 40);
      keyTray.rectangle = fakeRectangle(120, 0, 80, 40);
      draggedKey.emit("pointerdown", {
        button: 0,
        pointerId: 7,
        clientX: 20,
        clientY: 20,
      });
      document.emit("pointermove", { pointerId: 7, clientX: 140, clientY: 20 });
      document.emit("pointerup", { pointerId: 7, clientX: 140, clientY: 20 });
      draggedKey.emit("click");
      expect(Number(root.dataset.timelinePosition)).toBe(Number(practiceStart) + 1);
      expect(draggedKey.dataset.slotIndex).toBe("key");

      action(host, "predict-shift")?.emit("click");
      const shiftToken = teachingTokens(host).find((token) => token.dataset.state === "active");
      const compatibleHole = walk(host).find(
        (element) =>
          element.dataset.teachingSlotIndex !== undefined &&
          element.dataset.dropState === "compatible",
      );
      if (shiftToken === undefined || compatibleHole === undefined) {
        throw new Error("练习阶段缺少可键盘操作的移动目标");
      }
      const beforeKeyboardMove = Number(root.dataset.timelinePosition);
      shiftToken.focus();
      shiftToken.emit("keydown", { key: "Enter" });
      compatibleHole.focus();
      compatibleHole.emit("keydown", { key: "Enter" });
      expect(Number(root.dataset.timelinePosition)).toBe(beforeKeyboardMove + 1);
      expect(document.activeElement).toBe(compatibleHole);

      action(host, "predict-stop")?.emit("click");
      const insertPosition = Number(root.dataset.timelinePosition);
      const heldKey = teachingTokens(host).find((token) => token.dataset.slotIndex === "key");
      const insertTarget = walk(host).find(
        (element) =>
          element.dataset.teachingSlotIndex !== undefined &&
          element.dataset.dropState === "compatible",
      );
      if (heldKey === undefined || insertTarget === undefined) {
        throw new Error("练习阶段缺少待插入 key 或目标空槽");
      }
      heldKey.emit("click");
      insertTarget.emit("click");
      expect(Number(root.dataset.timelinePosition)).toBe(insertPosition + 1);
      action(host, "undo-step")?.emit("click");
      expect(Number(root.dataset.timelinePosition)).toBe(insertPosition);
      vi.runAllTimers();
      expect(root.dataset.taskLessonStage).toBe("practice");
      expect(Number(root.dataset.timelinePosition)).toBe(insertPosition);

      completeManualStage(host, "practice");
      expect(root.dataset.taskLessonStage).toBe("transfer");
      expect(document.activeElement?.dataset.teachingTokenId).toBeDefined();
      for (const line of teachingSourceLines(host)) {
        expect(line).toBe(sourceLineReferences.get(line.dataset.sourceLine!));
      }
      completeManualStage(host, "transfer");
      expect(root.dataset.taskLessonStage).toBe("experiment");

      const customInput = walk(host).find(
        (element) => element.dataset.taskLessonInput === "custom-values",
      );
      if (customInput === undefined) throw new Error("自由实验缺少输入框");
      customInput.value = "4, 2, 4, 1";
      action(host, "run-experiment")?.emit("click");
      await vi.runAllTimersAsync();
      expect(root.dataset.taskLessonStage).toBe("reflect");

      action(host, "reflect-key-snapshot")?.emit("click");
      expect(root.dataset.taskLessonPhase).toBe("task");
      action(host, "reflect-reverse")?.emit("click");
      expect(root.dataset.taskLessonPhase).toBe("completed");
      expect(walk(host).some((element) => element.textContent === "插入排序实验已完成")).toBe(true);
      expect(walk(host).some((element) => element.textContent.includes("5/5"))).toBe(true);
      expect(action(host, "replay-lesson")?.textContent).toBe("再来一遍");
      expect(action(host, "back-to-intro")?.textContent).toBe("返回介绍");
      expect(onOpenFeature).not.toHaveBeenCalled();
      expect(onStartGuidedLesson).not.toHaveBeenCalled();

      action(host, "replay-lesson")?.emit("click");
      expect(root.dataset).toMatchObject({
        taskLessonPhase: "task",
        taskLessonStage: "observe",
        timelinePosition: "0",
      });
    } finally {
      library.destroy();
      vi.clearAllTimers();
      vi.useRealTimers();
    }
  });

  it("rerenders Library chrome and details in place without losing query, filter or selection", () => {
    const document = new FakeDocument();
    const host = document.createElement("div");
    host.dataset.locale = "zh-CN";
    const library = createSoftwareLibrary(host as unknown as HTMLElement, {
      onOpenFeature: vi.fn(),
      onStartGuidedLesson: vi.fn(),
    });

    library.selectBranch("library.algorithms");
    const search = walk(host).find((element) => element.type === "search");
    if (search === undefined) throw new Error("fixture 缺少 Library 搜索框");
    search.value = "binary search";
    search.emit("input");
    expect(library.selectedEntryId).toBe("algorithms.binary-search");

    host.dataset.locale = "en";
    host.emit("workbench-locale-change", { detail: { locale: "en" } });

    expect(search.value).toBe("binary search");
    expect(library.selectedBranchId).toBe("algorithms-complexity");
    expect(library.selectedEntryId).toBe("algorithms.binary-search");
    for (const heading of [
      "Plain-language definition",
      "Complexity",
      "Common mistakes",
      "Related concepts",
    ]) {
      expect(
        walk(host).some((element) => element.textContent === heading),
        heading,
      ).toBe(true);
    }
    expect(walk(host).some((element) => element.textContent === "Binary Search")).toBe(true);
    expect(search.placeholder).toBe("Search keywords, aliases or code");

    search.value = "no-entry-can-match-this";
    search.emit("input");
    expect(
      walk(host).some((element) => element.textContent === "No matching dictionary entries."),
    ).toBe(true);
    expect(library.selectedEntryId).toBe("algorithms.binary-search");

    search.value = "";
    search.emit("input");
    library.selectBranch("examples");
    for (const heading of [
      "What you will complete",
      "How completion is verified",
      "Optional prerequisites",
    ]) {
      expect(
        walk(host).some((element) => element.textContent === heading),
        heading,
      ).toBe(true);
    }
    expect(walk(host).some((element) => element.textContent === "Start interactive course")).toBe(
      true,
    );
    library.selectEntry("tutorial.blocks-to-c");
    expect(walk(host).some((element) => element.textContent === "Steps")).toBe(true);
    expect(walk(host).some((element) => element.textContent === "Place the basic blocks")).toBe(
      false,
    );
    expect(
      walk(host).some((element) => element.textContent === "Step 1 · Place the basic blocks"),
    ).toBe(true);
    expect(walk(host).some((element) => element.textContent === "Completion checks")).toBe(true);

    host.dataset.locale = "zh-CN";
    host.emit("workbench-locale-change", { detail: { locale: "zh-CN" } });
    expect(library.selectedEntryId).toBe("tutorial.blocks-to-c");
    expect(walk(host).some((element) => element.textContent === "操作步骤")).toBe(true);
    expect(walk(host).some((element) => element.textContent === "步骤 1 · 拖入基础积木")).toBe(
      true,
    );

    library.destroy();
  });

  it("never exposes Chinese entry or tutorial copy through the English visible surface", () => {
    const document = new FakeDocument();
    const host = document.createElement("div");
    host.dataset.locale = "en";
    const library = createSoftwareLibrary(host as unknown as HTMLElement, {
      onOpenFeature: vi.fn(),
      onStartGuidedLesson: vi.fn(),
    });

    for (const entry of LIBRARY_ENTRIES) {
      library.selectEntry(entry.id);
      expect(visibleLibraryCopy(host), entry.id).not.toMatch(/[\u3400-\u9fff]/u);
    }
    for (const feature of SOFTWARE_FEATURES) {
      library.select(feature.id);
      expect(visibleLibraryCopy(host), feature.id).not.toMatch(/[\u3400-\u9fff]/u);
    }

    library.destroy();
  });

  it("ships complete reviewed English copy for every tutorial step and artifact", () => {
    const tutorials = LIBRARY_ENTRIES.filter(
      (entry): entry is typeof entry & { readonly tutorial: NonNullable<typeof entry.tutorial> } =>
        entry.tutorial !== null && entry.tutorial !== undefined,
    );
    expect(tutorials).toHaveLength(9);

    for (const entry of tutorials) {
      const source = entry.tutorial;
      const english = entry.localizations?.en;
      const localizedTutorial = english?.tutorial;
      expect(english?.title, `${entry.id}.title`).toBeTruthy();
      expect(english?.summary, `${entry.id}.summary`).toBeTruthy();
      expect(english?.details?.length, `${entry.id}.details`).toBeGreaterThanOrEqual(2);
      expect(localizedTutorial?.learningGoals?.length, `${entry.id}.goals`).toBe(
        source.learningGoals.length,
      );
      expect(localizedTutorial?.completionChecks?.length, `${entry.id}.checks`).toBe(
        source.completionChecks.length,
      );
      for (const step of source.steps) {
        const localizedStep = localizedTutorial?.steps?.[step.id];
        expect(localizedStep?.title, `${entry.id}.${step.id}.title`).toBeTruthy();
        expect(localizedStep?.instruction, `${entry.id}.${step.id}.instruction`).toBeTruthy();
        expect(localizedStep?.check, `${entry.id}.${step.id}.check`).toBeTruthy();
        expect(localizedStep?.artifactExamples?.length, `${entry.id}.${step.id}.artifacts`).toBe(
          step.artifacts.length,
        );
        if (step.featureLink !== null) {
          expect(
            localizedStep?.featureLinkLabel,
            `${entry.id}.${step.id}.featureLink`,
          ).toBeTruthy();
        }
      }
    }
  });
});

class FakeClassList {
  readonly #values = new Set<string>();

  add(...values: string[]): void {
    for (const value of values) this.#values.add(value);
  }

  remove(...values: string[]): void {
    for (const value of values) this.#values.delete(value);
  }

  contains(value: string): boolean {
    return this.#values.has(value);
  }

  toggle(value: string, force?: boolean): boolean {
    const enabled = force ?? !this.#values.has(value);
    if (enabled) this.#values.add(value);
    else this.#values.delete(value);
    return enabled;
  }
}

class FakeElement {
  readonly ownerDocument: FakeDocument;
  readonly children: FakeElement[] = [];
  readonly dataset: Record<string, string> = {};
  readonly style: Record<string, string> = {};
  readonly classList = new FakeClassList();
  readonly #listeners = new Map<string, Set<(event: unknown) => void>>();
  readonly #attributes = new Map<string, string>();
  readonly #capturedPointers = new Set<number>();
  readonly tagName: string;
  parent: FakeElement | null = null;
  className = "";
  textContent = "";
  type = "";
  value = "";
  placeholder = "";
  title = "";
  id = "";
  htmlFor = "";
  min = "";
  max = "";
  step = "";
  tabIndex = 0;
  hidden = false;
  disabled = false;
  isContentEditable = false;
  rectangle = fakeRectangle();

  constructor(ownerDocument: FakeDocument, tagName: string) {
    this.ownerDocument = ownerDocument;
    this.tagName = tagName.toUpperCase();
  }

  get firstElementChild(): FakeElement | null {
    return this.children[0] ?? null;
  }

  get firstChild(): FakeElement | null {
    return this.children[0] ?? null;
  }

  append(...children: FakeElement[]): void {
    for (const child of children) {
      if (child.parent !== null) {
        const previousIndex = child.parent.children.indexOf(child);
        if (previousIndex >= 0) child.parent.children.splice(previousIndex, 1);
      }
      child.parent = this;
      this.children.push(child);
    }
  }

  insertBefore(child: FakeElement, before: FakeElement | null): void {
    if (before === null) {
      this.append(child);
      return;
    }
    const index = this.children.indexOf(before);
    if (index < 0) throw new Error("reference child is not attached");
    if (child.parent !== null) child.remove();
    child.parent = this;
    this.children.splice(index, 0, child);
  }

  replaceChildren(...children: FakeElement[]): void {
    for (const child of this.children) child.parent = null;
    this.children.splice(0, this.children.length);
    this.append(...children);
  }

  remove(): void {
    if (this.parent === null) return;
    const index = this.parent.children.indexOf(this);
    if (index >= 0) this.parent.children.splice(index, 1);
    this.parent = null;
  }

  setAttribute(name: string, value: string): void {
    this.#attributes.set(name, value);
  }

  getAttribute(name: string): string | null {
    return this.#attributes.get(name) ?? null;
  }

  addEventListener(type: string, listener: (event: unknown) => void): void {
    const listeners = this.#listeners.get(type) ?? new Set();
    listeners.add(listener);
    this.#listeners.set(type, listeners);
  }

  removeEventListener(type: string, listener: (event: unknown) => void): void {
    this.#listeners.get(type)?.delete(listener);
  }

  emit(type: string, event: unknown = {}): void {
    const normalized = normalizeFakeEvent(event, this);
    for (const listener of this.#listeners.get(type) ?? []) listener(normalized);
  }

  focus(): void {
    this.ownerDocument.activeElement = this;
  }

  blur(): void {
    if (this.ownerDocument.activeElement === this) this.ownerDocument.activeElement = null;
  }

  getBoundingClientRect(): FakeRectangle {
    return this.rectangle;
  }

  setPointerCapture(pointerId: number): void {
    this.#capturedPointers.add(pointerId);
  }

  releasePointerCapture(pointerId: number): void {
    this.#capturedPointers.delete(pointerId);
  }
}

class FakeDocument {
  readonly #listeners = new Map<string, Set<(event: unknown) => void>>();
  activeElement: FakeElement | null = null;

  createElement(tagName: string): FakeElement {
    return new FakeElement(this, tagName);
  }

  createElementNS(_namespace: string, tagName: string): FakeElement {
    return this.createElement(tagName);
  }

  addEventListener(type: string, listener: (event: unknown) => void): void {
    const listeners = this.#listeners.get(type) ?? new Set();
    listeners.add(listener);
    this.#listeners.set(type, listeners);
  }

  removeEventListener(type: string, listener: (event: unknown) => void): void {
    this.#listeners.get(type)?.delete(listener);
  }

  emit(type: string, event: unknown = {}): void {
    const normalized = normalizeFakeEvent(event, this);
    for (const listener of this.#listeners.get(type) ?? []) listener(normalized);
  }
}

function walk(root: FakeElement): readonly FakeElement[] {
  return [root, ...root.children.flatMap((child) => walk(child))];
}

function visibleLibraryCopy(host: FakeElement): string {
  return walk(host)
    .flatMap((element) => [element.textContent, element.title, element.placeholder])
    .join("\n");
}

function action(host: FakeElement, id: string): FakeElement | undefined {
  return walk(host).find((element) => element.dataset.taskLessonAction === id);
}

function taskLessonRoot(host: FakeElement): FakeElement {
  const root = walk(host).find((element) => element.dataset.taskLessonStage !== undefined);
  if (root === undefined) throw new Error("fixture 缺少任务教程根节点");
  return root;
}

function teachingTokens(host: FakeElement): readonly FakeElement[] {
  return walk(host).filter((element) => element.dataset.teachingTokenId !== undefined);
}

function teachingSourceLines(host: FakeElement): readonly FakeElement[] {
  return walk(host).filter((element) => element.dataset.sourceLine !== undefined);
}

function activeTeachingSourceLine(host: FakeElement): FakeElement | undefined {
  return teachingSourceLines(host).find((line) => line.dataset.state === "active");
}

function completeManualStage(host: FakeElement, stage: "practice" | "transfer"): void {
  const root = taskLessonRoot(host);
  for (let guard = 0; guard < 100 && root.dataset.taskLessonStage === stage; guard += 1) {
    const keyTray = action(host, "key-tray");
    const compatibleSlot = walk(host).find(
      (element) =>
        element.dataset.teachingSlotIndex !== undefined &&
        element.dataset.dropState === "compatible",
    );
    const tokens = teachingTokens(host);
    const activeTokens = tokens.filter((token) => token.dataset.state === "active");
    const heldKey = tokens.find((token) => token.dataset.slotIndex === "key");
    const predecessor = activeTokens.find((token) => token.dataset.slotIndex !== "key");
    const prediction = action(host, "predict-shift")?.parent;

    if (keyTray?.dataset.dropState === "compatible") {
      const token = activeTokens[0];
      if (token === undefined) throw new Error(`${stage} 缺少应暂存的活动 token`);
      token.emit("click");
      keyTray.emit("click");
    } else if (prediction?.hidden === false) {
      if (heldKey === undefined || predecessor === undefined) {
        throw new Error(`${stage} 的比较事件缺少 key 或前驱 token`);
      }
      const shouldShift = Number(predecessor.textContent) > Number(heldKey.textContent);
      action(host, shouldShift ? "predict-shift" : "predict-stop")?.emit("click");
    } else if (compatibleSlot !== undefined) {
      const token = predecessor ?? heldKey;
      if (token === undefined) throw new Error(`${stage} 缺少应移动的活动 token`);
      token.emit("click");
      compatibleSlot.emit("click");
    } else if (vi.getTimerCount() > 0) {
      vi.runOnlyPendingTimers();
    } else {
      throw new Error(`${stage} 无法判定下一项语义动作`);
    }
  }
  if (root.dataset.taskLessonStage === stage) throw new Error(`${stage} 未在 100 个动作内完成`);
}

interface FakeRectangle {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly width: number;
  readonly height: number;
  readonly x: number;
  readonly y: number;
  readonly toJSON: () => Record<string, never>;
}

function fakeRectangle(left = 0, top = 0, width = 80, height = 40): FakeRectangle {
  return {
    left,
    top,
    right: left + width,
    bottom: top + height,
    width,
    height,
    x: left,
    y: top,
    toJSON: () => ({}),
  };
}

function normalizeFakeEvent(event: unknown, currentTarget: unknown): Record<string, unknown> {
  const normalized =
    event !== null && typeof event === "object"
      ? (event as Record<string, unknown>)
      : ({} as Record<string, unknown>);
  normalized.target ??= currentTarget;
  normalized.currentTarget = currentTarget;
  normalized.defaultPrevented ??= false;
  normalized.preventDefault ??= () => {
    normalized.defaultPrevented = true;
  };
  normalized.stopPropagation ??= () => undefined;
  return normalized;
}
