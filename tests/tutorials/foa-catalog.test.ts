import { describe, expect, it } from "vitest";
import {
  FOA_CHAPTERS,
  FOA_CURRICULUM_VERSION,
  FOA_LESSON_BY_ID,
  FOA_LESSONS,
  foaLessonsForChapter,
  getFoaLesson,
} from "../../src/tutorials/foa-curriculum.js";
import {
  createFoaCourse,
  createFoaWorkspaceLaunchContract,
} from "../../src/tutorials/foa-course-adapter.js";

const CHAPTER_LENGTHS = [5, 8, 8, 10, 10, 9, 10, 8, 12, 12, 8, 12, 8];
const MODE_LENGTHS = [
  ["semantic", 60],
  ["block-observe", 15],
  ["block-complete", 15],
  ["block-compose", 15],
  ["workspace-evidence", 15],
] as const;

describe("FOA curriculum catalog", () => {
  it("has a continuous 13-chapter catalog with the required chapter-seven boundary", () => {
    expect(FOA_CURRICULUM_VERSION).toMatch(/^\d+\.\d+\.\d+$/u);
    expect(FOA_LESSONS).toHaveLength(120);
    expect(FOA_CHAPTERS).toHaveLength(13);
    expect(FOA_CHAPTERS.map((chapter) => chapter.lessonIds.length)).toEqual(CHAPTER_LENGTHS);
    expect(FOA_LESSONS.map((lesson) => lesson.order)).toEqual(
      Array.from({ length: 120 }, (_, index) => index + 1),
    );
    expect(FOA_LESSONS[59]?.chapter).toBe(7);
    expect(FOA_LESSONS[59]?.libraryKnowledgeIds).toContain("tutorial.insertion-sort-lab");
    expect(FOA_LESSONS[59]?.title.en).toBe("Insertion sort's sorted prefix");
    expect(FOA_LESSONS[60]?.chapter).toBe(8);
    expect(new Set(FOA_LESSONS.map((lesson) => lesson.id)).size).toBe(120);
    expect(
      new Set(FOA_LESSONS.flatMap((lesson) => lesson.knowledgePoints.map((point) => point.id)))
        .size,
    ).toBe(120);
  });

  it("keeps bilingual, original teaching metadata for every lesson", () => {
    for (const lesson of FOA_LESSONS) {
      expect(lesson.sourceAttribution).toBe("FOA topic adapted");
      expect(lesson.title.zh).not.toHaveLength(0);
      expect(lesson.title.en).not.toHaveLength(0);
      expect(lesson.summary.zh).not.toHaveLength(0);
      expect(lesson.summary.en).not.toHaveLength(0);
      expect(lesson.objectives.length).toBeGreaterThanOrEqual(2);
      expect(lesson.objectives.length).toBeLessThanOrEqual(lesson.order === 63 ? 5 : 4);
      expect(lesson.knowledgePoints).toHaveLength(1);
      expect(lesson.case.description.zh).not.toHaveLength(0);
      expect(lesson.case.description.en).not.toHaveLength(0);
      expect(lesson.code.text).toContain("int main(void)");
      expect(lesson.code.text).toContain(lesson.code.kind === "complete" ? "FOA_STEP" : "TODO:");
      expect(lesson.complexity.time).toMatch(/^O\(/u);
      expect(lesson.complexity.space).toMatch(/^O\(/u);
      expect(lesson.semanticEvents.length).toBe(lesson.experience.semanticSequence.length);
      expect(lesson.experience.playbackMs).toBeGreaterThanOrEqual(1_000);
      expect(lesson.experience.playbackMs).toBeLessThanOrEqual(3_000);
      expect(lesson.experience.researchUrls.length).toBeGreaterThan(0);
      expect(lesson.experience.researchUrls.every((url) => url.startsWith("https://"))).toBe(true);
      expect(lesson.relations).toHaveLength(3);
      expect(Object.isFrozen(lesson)).toBe(true);
      expect(Object.isFrozen(lesson.title)).toBe(true);
      expect(Object.isFrozen(lesson.code)).toBe(true);
      expect(Object.isFrozen(lesson.semanticEvents)).toBe(true);
    }
  });

  it("gives every lesson an independently researched action, pace, evidence, and visual model", () => {
    expect(new Set(FOA_LESSONS.map((lesson) => lesson.experience.primaryAction.zh)).size).toBe(120);
    expect(new Set(FOA_LESSONS.map((lesson) => lesson.experience.visualModel.zh)).size).toBe(120);
    expect(
      FOA_LESSONS.slice(0, 105).every((lesson) => lesson.experience.playbackPolicy === "guided"),
    ).toBe(true);
    expect(
      FOA_LESSONS.slice(105).every((lesson) => lesson.experience.playbackPolicy === "manual"),
    ).toBe(true);
    expect(FOA_LESSONS[41]?.title.en).toBe("The exit status of main");
    expect(FOA_LESSONS[41]?.code.text).toContain("return ok ? EXIT_SUCCESS : EXIT_FAILURE;");
    expect(FOA_LESSONS[87]?.title.en).toBe("Iterative BST search");
    expect(FOA_LESSONS[110]?.title.en).toBe("Heap boundary and suffix count");
    expect(FOA_LESSONS[110]?.complexity.time).toBe("O(n)");
    expect(FOA_LESSONS[111]?.title.en).toBe("Teaching model for sort growth");
    expect(FOA_LESSONS[111]?.complexity.time).toBe("O(1)");
  });

  it("keeps the variable-depth recursion lesson copy independent of its default input", () => {
    const lesson = FOA_LESSONS[74]!;
    const authoredCopy = [
      lesson.experience.visualModel.zh,
      lesson.experience.visualModel.en,
      ...lesson.experience.semanticSequence.flatMap((step) => [step.zh, step.en]),
    ].join("\n");
    expect(authoredCopy).not.toContain("moves(4)");
    expect(authoredCopy).not.toMatch(/最终返回 15|return 15/u);
    expect(authoredCopy).toContain("moves(n)");
  });

  it("uses the five progressively fading modes in contiguous phases and correct templates", () => {
    let start = 0;
    for (const [mode, count] of MODE_LENGTHS) {
      const phase = FOA_LESSONS.slice(start, start + count);
      expect(phase).toHaveLength(count);
      expect(phase.every((lesson) => lesson.mode === mode)).toBe(true);
      expect(
        phase.every(
          (lesson) => lesson.fading.level === MODE_LENGTHS.findIndex(([name]) => name === mode),
        ),
      ).toBe(true);
      start += count;
    }
    expect(FOA_LESSONS.slice(0, 75).every((lesson) => lesson.code.kind === "complete")).toBe(true);
    expect(FOA_LESSONS.slice(75).every((lesson) => lesson.code.kind === "template")).toBe(true);
    expect(FOA_LESSONS.slice(75).every((lesson) => lesson.code.placeholders.length === 1)).toBe(
      true,
    );
    expect(FOA_LESSONS.slice(75).every((lesson) => lesson.code.text.includes("TODO:"))).toBe(true);
    expect(FOA_LESSONS.every((lesson) => !/TODO\(\{\{/u.test(lesson.code.text))).toBe(true);
  });

  it("keeps all bilingual summaries natural and free of template residue", () => {
    const doubledPunctuation =
      /(?:[。！？；：，、]\s*[。！？；：，、.!?;:,]|[.!?;:,]\s*[。！？；：，、.!?;:,])/u;
    for (const lesson of FOA_LESSONS) {
      for (const summary of [lesson.summary.zh, lesson.summary.en]) {
        expect(summary, lesson.id).not.toMatch(doubledPunctuation);
        expect(summary, lesson.id).not.toContain("{{");
        expect(summary, lesson.id).not.toContain("TODO(");
      }
      expect(lesson.summary.zh, lesson.id).not.toContain("始终保留");
      expect(lesson.summary.en, lesson.id).not.toMatch(/keep .+ visible as evidence/iu);
    }
  });

  it("gives every guided event one explicit, unique range in its generated C source", () => {
    for (const lesson of FOA_LESSONS.slice(0, 105)) {
      for (const event of lesson.semanticEvents) {
        const exact = event.sourceAnchor?.exact;
        expect(exact, `${lesson.id} ${event.id}`).toBeDefined();
        expect(exact, `${lesson.id} ${event.id}`).not.toContain("\n");
        const first = lesson.code.text.indexOf(exact!);
        expect(first, `${lesson.id} ${event.id}`).toBeGreaterThanOrEqual(0);
        expect(lesson.code.text.indexOf(exact!, first + 1), `${lesson.id} ${event.id}`).toBe(-1);
        expect(event.codeAnchor).toBe(exact);
        expect(Object.isFrozen(event.sourceAnchor)).toBe(true);
      }
    }
  });

  it("relabels events whose original descriptions had no matching C operation", () => {
    expect(FOA_LESSONS[2]!.semanticEvents.map((event) => event.label)).toEqual([
      { zh: "进入 main", en: "Enter main" },
      { zh: "建立 compiled=1", en: "Create compiled=1" },
      {
        zh: "根据 compiled 选择并输出 run 或 stop",
        en: "Choose and write run or stop from compiled",
      },
      { zh: "main 返回状态码 0", en: "Return status 0 from main" },
    ]);
    expect(FOA_LESSONS[2]!.semanticEvents.map((event) => event.sourceAnchor?.exact)).toEqual([
      "int main(void) {",
      "int compiled = 1;",
      'printf("%s\\n", compiled ? "run" : "stop");',
      "return 0;",
    ]);

    const event = FOA_LESSONS[36]!.semanticEvents[3]!;
    expect(event.label).toEqual({
      zh: "完成固定 20 轮迭代",
      en: "Complete the fixed 20 iterations",
    });
    expect(event.sourceAnchor?.exact).toBe("i < 20");
  });

  it("aligns lessons 61–83 with their audited C operations", () => {
    const replacements = [
      [63, 3, "link->value"],
      [63, 4, "link->value++;"],
      [64, 3, "struct Point p = translated((struct Point){1, 2}, 3, 4);"],
      [65, 3, "printf(\"%s%c\", items[i].name, i == 2 ? '\\n' : ' ')"],
      [73, 0, "position += velocity * dt;"],
      [75, 2, "moves(disks - 1)"],
      [75, 3, "2 * moves(disks - 1) + 1"],
      [76, 0, "if (target == 0) return 1; if (n == 0) return 0;"],
      [
        77,
        0,
        "state = state * 1664525u + 1013904223u; double x = (state & 0xffffu) / 65535.0; state = state * 1664525u + 1013904223u; double y = (state & 0xffffu) / 65535.0;",
      ],
      [79, 1, "int t = values[i]; values[i] = values[j];"],
      [82, 0, "int *grown = realloc(values, next * sizeof *values);"],
    ] as const;
    for (const [order, eventIndex, exact] of replacements) {
      expect(FOA_LESSONS[order - 1]!.semanticEvents[eventIndex]!.sourceAnchor?.exact).toBe(exact);
    }

    const relabels = [
      [65, 0, "选择下一条记录的索引", "Select the next record index"],
      [68, 2, "处理当前记录后前进", "Advance after processing the current record"],
      [72, 3, "显示最终中点估计", "Display the final midpoint estimate"],
      [73, 3, "推进离散时间步", "Advance the discrete time step"],
      [77, 2, "根据分类结果累加 inside", "Accumulate inside from the classification result"],
      [78, 3, "显示新的根近似值", "Display the new root approximation"],
    ] as const;
    for (const [order, eventIndex, zh, en] of relabels) {
      expect(FOA_LESSONS[order - 1]!.semanticEvents[eventIndex]!.label).toEqual({ zh, en });
    }
  });

  it("aligns lessons 84–105 with their audited C operations", () => {
    const replacements = [
      [88, 3, "while (p && p->key != target)"],
      [92, 3, 'printf("%d ",value)'],
      [93, 1, 'fprintf(file,"3 5\\n");'],
      [94, 1, "fgets(line,sizeof line,file)"],
      [95, 1, "&a"],
      [98, 2, "?a[i++]:b[j++]"],
      [98, 3, "j==3||(i<3&&a[i]<=b[j])"],
      [101, 2, "if(values[j]<values[i]){int t=values[i];values[i]=values[j];values[j]=t;}"],
      [101, 3, "for(size_t i=0;i<4;i++) for(size_t j=i+1;j<4;j++)"],
    ] as const;
    for (const [order, eventIndex, exact] of replacements) {
      expect(FOA_LESSONS[order - 1]!.semanticEvents[eventIndex]!.sourceAnchor?.exact).toBe(exact);
    }

    const relabels = [
      [87, 3, "在当前 tail 空槽写入 9", "Write 9 into the current tail slot"],
      [90, 1, "按有序键逐项累计高度", "Accumulate height once per sorted key"],
      [90, 2, "输出累计高度", "Output the accumulated height"],
      [100, 3, "关闭后输出状态", "Output status after closing"],
      [
        102,
        2,
        "命中时保存 i 并停止，否则继续 i++",
        "Save i and stop on a hit; otherwise continue with i++",
      ],
      [105, 0, "设置查找目标 key=5", "Set the lookup target key to 5"],
      [105, 1, "从链头 a 开始遍历", "Traverse from chain head a"],
      [105, 3, "输出 found 或 missing", "Output found or missing"],
    ] as const;
    for (const [order, eventIndex, zh, en] of relabels) {
      expect(FOA_LESSONS[order - 1]!.semanticEvents[eventIndex]!.label).toEqual({ zh, en });
    }

    expect(FOA_LESSONS[104]!.semanticEvents.map((event) => event.label.en)).toEqual([
      "Set the lookup target key to 5",
      "Traverse from chain head a",
      "Compare nodes sequentially",
      "Output found or missing",
    ]);
    expect(FOA_LESSONS[104]!.experience.semanticSequence).toEqual([
      { zh: "设置查找目标 key=5", en: "Set the lookup target key to 5" },
      { zh: "从链头 a 开始遍历", en: "Traverse from chain head a" },
      { zh: "顺序比较节点", en: "Compare nodes sequentially" },
      { zh: "输出 found 或 missing", en: "Output found or missing" },
    ]);
    expect(FOA_LESSONS[104]!.experience.primaryAction.en).not.toMatch(/bucket|hash/u);
    expect(FOA_LESSONS[104]!.experience.hiddenByDefault.en).toContain("absent from the source");
  });

  it("exposes a frozen lookup facade and an acyclic prerequisite graph", () => {
    expect(Object.isFrozen(FOA_LESSON_BY_ID)).toBe(true);
    expect(FOA_LESSON_BY_ID.size).toBe(FOA_LESSONS.length);
    expect(getFoaLesson(FOA_LESSONS[0]!.id)).toBe(FOA_LESSONS[0]);
    expect(getFoaLesson("tutorial.foa.missing")).toBeNull();
    expect(foaLessonsForChapter(7).map((lesson) => lesson.order)).toEqual(
      Array.from({ length: 10 }, (_, index) => index + 51),
    );
    expect(foaLessonsForChapter(0)).toEqual([]);

    for (const lesson of FOA_LESSONS) {
      for (const prerequisiteId of lesson.prerequisiteIds) {
        const prerequisite = FOA_LESSON_BY_ID.get(prerequisiteId);
        expect(prerequisite).toBeDefined();
        expect(prerequisite!.order).toBeLessThan(lesson.order);
      }
    }
  });

  it("adapts both locales into a valid course without changing stable lesson IDs", () => {
    const zh = createFoaCourse("zh");
    const en = createFoaCourse("en");
    expect(zh.units).toHaveLength(120);
    expect(en.units.map((unit) => unit.id)).toEqual(zh.units.map((unit) => unit.id));
    expect(en.units[0]?.title).toBe(FOA_LESSONS[0]?.title.en);
    expect(zh.units[0]?.title).toBe(FOA_LESSONS[0]?.title.zh);
  });

  it("gives lessons 106–120 a scaffold, structural contract, and three fixed runtime cases", () => {
    expect(FOA_LESSONS.slice(0, 105).every((lesson) => lesson.workspaceExercise === null)).toBe(
      true,
    );
    for (const lesson of FOA_LESSONS.slice(105)) {
      const exercise = lesson.workspaceExercise;
      expect(exercise).not.toBeNull();
      expect(exercise!.initialSource).toContain("TODO:");
      expect(exercise!.initialSource).not.toBe(lesson.code.text);
      expect(exercise!.cases).toHaveLength(3);
      expect(new Set(exercise!.cases.map((item) => item.id)).size).toBe(3);
      expect(exercise!.sourceRequirements.length).toBeGreaterThan(0);
      expect(Object.isFrozen(exercise)).toBe(true);
      expect(Object.isFrozen(exercise!.cases)).toBe(true);
      const launch = createFoaWorkspaceLaunchContract(lesson);
      expect(launch).not.toBeNull();
      expect(launch!.initialSource).toBe(exercise!.initialSource);
      expect(launch!.runtimeCase.cases.map((item) => item.id)).toEqual(
        exercise!.cases.map((item) => item.id),
      );
    }
  });

  it("requires all fixed cases and the source contract for independent course mastery", () => {
    const course = createFoaCourse("en");
    for (const unit of course.units.slice(105)) {
      const requirements = unit.stages[0]!.requirements;
      expect(requirements).toHaveLength(3);
      expect(
        requirements.map(
          (item) => item.expectations.find((entry) => entry.key === "caseId")?.value,
        ),
      ).toEqual(["case-1", "case-2", "case-3"]);
      expect(
        requirements.every(
          (item) =>
            item.binding === "workspace-source" &&
            item.trust === "verified" &&
            item.expectations.some((entry) => entry.key === "sourceContractId"),
        ),
      ).toBe(true);
    }
  });
});
