import type {
  FoaFadingPlan,
  FoaLessonDefinition,
  FoaLessonInteraction,
  FoaLessonMode,
  FoaLessonPresentation,
  FoaLessonExperience,
  FoaLocalizedText,
  FoaSemanticEvent,
} from "./foa-contracts.js";
import { foaText } from "./foa-contracts.js";
import { getFoaLessonExperience } from "./foa-lesson-experiences.js";
import { buildFoaLessonCode } from "./foa-programs.js";
import { getFoaWorkspaceExercise } from "./foa-workspace-exercises.js";

export interface FoaLessonBlueprint {
  readonly section: string;
  readonly titleZh: string;
  readonly titleEn: string;
  readonly focusZh: string;
  readonly focusEn: string;
  readonly body: string;
  readonly stdin: string;
  readonly stdout: string;
  readonly time: string;
  readonly space: string;
  readonly libraryKnowledgeIds: readonly string[];
}

export function bp(
  section: string,
  titleZh: string,
  titleEn: string,
  focusZh: string,
  focusEn: string,
  body: string,
  stdin: string,
  stdout: string,
  time: string,
  space: string,
  libraryKnowledgeIds: readonly string[],
): FoaLessonBlueprint {
  return Object.freeze({
    section,
    titleZh,
    titleEn,
    focusZh,
    focusEn,
    body,
    stdin,
    stdout,
    time,
    space,
    libraryKnowledgeIds: Object.freeze([...libraryKnowledgeIds]),
  });
}

export function buildFoaLessons(
  groups: readonly { readonly chapter: number; readonly lessons: readonly FoaLessonBlueprint[] }[],
): readonly FoaLessonDefinition[] {
  const definitions: FoaLessonDefinition[] = [];
  for (const group of groups) {
    for (const blueprint of group.lessons) {
      const order = definitions.length + 1;
      definitions.push(buildLesson(order, group.chapter, blueprint));
    }
  }
  return Object.freeze(definitions);
}

function buildLesson(
  order: number,
  chapter: number,
  blueprint: FoaLessonBlueprint,
): FoaLessonDefinition {
  const id = lessonId(chapter, order);
  const mode = modeForOrder(order);
  const presentation = presentationForMode(mode);
  const interaction = interactionForMode(mode);
  const experience = getFoaLessonExperience(order);
  const title = foaText(blueprint.titleZh, blueprint.titleEn);
  const focus = foaText(blueprint.focusZh, blueprint.focusEn);
  const prerequisiteIds = order === 1 ? [] : [lessonIdForPrevious(order, chapter)];
  const libraryKnowledgeIds = Object.freeze([...new Set(blueprint.libraryKnowledgeIds)]);
  const code = buildFoaLessonCode(blueprint.body, mode);
  const semanticEvents = semanticEventsForExperience(id, order, blueprint.focusEn, experience);
  if (mode !== "workspace-evidence") {
    validateSemanticSourceAnchors(id, code.text, semanticEvents);
  }

  return Object.freeze({
    id,
    order,
    chapter,
    section: blueprint.section,
    title,
    summary: lessonSummary(order, focus, experience),
    sourceAttribution: "FOA topic adapted",
    evidenceBoundary: foaText(
      "语义时间线和操作计数属于教学模型；只有真实运行、Trace 或 Benchmark 才能证明当前源码的实际行为。",
      "The semantic timeline and operation counts are instructional models; only a real run, Trace, or Benchmark can establish the current source's actual behaviour.",
    ),
    mode,
    presentation,
    interaction,
    experience,
    prerequisiteIds: Object.freeze(prerequisiteIds),
    objectives: experience.semanticSequence,
    knowledgePoints: Object.freeze([
      Object.freeze({
        id: `foa.kc.c${pad(chapter)}.l${pad(order, 3)}`,
        title: focus,
        explanation: foaText(
          `${blueprint.focusZh}需要同时说明数据如何变化、控制为何前进以及何时终止。`,
          `${capitalize(blueprint.focusEn)} requires an account of how data changes, why control advances, and when the process terminates.`,
        ),
      }),
    ]),
    case: Object.freeze({
      stdin: blueprint.stdin,
      stdout: blueprint.stdout,
      description: foaText(
        `用最小确定性输入检验“${blueprint.titleZh}”的核心路径。`,
        `Use a minimal deterministic input to exercise the core path of “${blueprint.titleEn}”.`,
      ),
    }),
    code,
    workspaceExercise: getFoaWorkspaceExercise(order),
    complexity: Object.freeze({
      time: blueprint.time,
      space: blueprint.space,
      explanation: foaText(
        `该实现的教学模型为时间 ${blueprint.time}、额外空间 ${blueprint.space}；必须用输入规模和操作计数验证增长趋势。`,
        `The teaching model is ${blueprint.time} time and ${blueprint.space} auxiliary space; validate growth with input size and operation counts.`,
      ),
    }),
    semanticEvents,
    relations: Object.freeze([
      relation(
        id,
        "case.input",
        "program.state",
        "input",
        "输入建立状态",
        "Input establishes state",
      ),
      relation(
        id,
        "program.state",
        `concept.${slug(blueprint.titleEn)}`,
        relationRoleForFocus(blueprint.focusEn),
        `状态参与${blueprint.focusZh}`,
        `State participates in ${blueprint.focusEn}`,
      ),
      relation(
        id,
        `concept.${slug(blueprint.titleEn)}`,
        "case.output",
        "output",
        "关键步骤决定可观察输出",
        "The key step determines observable output",
      ),
    ]),
    fading: fadingForMode(mode),
    libraryKnowledgeIds,
  });
}

function lessonId(chapter: number, order: number): string {
  return `tutorial.foa.c${pad(chapter)}.l${pad(order, 3)}`;
}

function lessonIdForPrevious(order: number, chapter: number): string {
  const previousOrder = order - 1;
  const previousChapter = chapterForOrder(previousOrder);
  return lessonId(previousChapter, previousOrder);
}

function chapterForOrder(order: number): number {
  const ends = [5, 13, 21, 31, 41, 50, 60, 68, 80, 92, 100, 112, 120];
  const index = ends.findIndex((end) => order <= end);
  if (index < 0) throw new RangeError(`FOA lesson order ${order} is out of range`);
  return index + 1;
}

function modeForOrder(order: number): FoaLessonMode {
  if (order <= 60) return "semantic";
  if (order <= 75) return "block-observe";
  if (order <= 90) return "block-complete";
  if (order <= 105) return "block-compose";
  return "workspace-evidence";
}

function presentationForMode(mode: FoaLessonMode): FoaLessonPresentation {
  if (mode === "semantic" || mode === "block-observe") return "worked-example";
  if (mode === "block-complete" || mode === "block-compose") return "faded-example";
  return "independent";
}

function interactionForMode(mode: FoaLessonMode): FoaLessonInteraction {
  if (mode === "semantic") return "direct-manipulation";
  if (mode === "workspace-evidence") return "workspace";
  return "guided-blocks";
}

function fadingForMode(mode: FoaLessonMode): FoaFadingPlan {
  const plans: Readonly<Record<FoaLessonMode, FoaFadingPlan>> = Object.freeze({
    semantic: plan(
      0,
      ["input", "state", "decision", "output"],
      ["predict"],
      "先预测，再直接操作稳定语义对象；错误只揭示当前关系。",
      "Predict first, then manipulate stable semantic objects; an error reveals only the current relation.",
    ),
    "block-observe": plan(
      1,
      ["input", "control-blocks", "output"],
      ["trace-block"],
      "保留完整积木结构，要求学习者解释线与代码的同步关系。",
      "Keep the full block structure and ask the learner to explain wire-to-code synchronisation.",
    ),
    "block-complete": plan(
      2,
      ["input", "partial-blocks"],
      ["complete-core-block", "verify-output"],
      "一次只隐藏一个关键积木；两次失败后依次显示关系和代码锚点。",
      "Hide one key block at a time; after two failures reveal the relation, then the code anchor.",
    ),
    "block-compose": plan(
      3,
      ["goal", "available-blocks"],
      ["compose-control", "connect-data", "test"],
      "只提供目标与兼容积木；提示从端口类型逐级淡入到结构示例。",
      "Provide only the goal and compatible blocks; hints progress from port types to a structural example.",
    ),
    "workspace-evidence": plan(
      4,
      ["goal", "evidence-contract"],
      ["implement", "design-cases", "trace", "benchmark", "explain"],
      "默认不展示解法；只有真实证据不成立时才提供最小定位提示。",
      "Do not show a solution by default; provide the smallest locating hint only when real evidence fails.",
    ),
  });
  return plans[mode];
}

function plan(
  level: 0 | 1 | 2 | 3 | 4,
  shownSteps: readonly string[],
  learnerSteps: readonly string[],
  zh: string,
  en: string,
): FoaFadingPlan {
  return Object.freeze({
    level,
    shownSteps: Object.freeze([...shownSteps]),
    learnerSteps: Object.freeze([...learnerSteps]),
    hintPolicy: foaText(zh, en),
  });
}

/**
 * Manually reviewed source slices. Each row is authored in the same order as the lesson's semantic
 * sequence and names an exact, unique range in that lesson's generated C source.
 */
const FOA_EXPLICIT_SOURCE_ANCHORS: Readonly<Record<number, readonly string[]>> = Object.freeze({
  1: ["int main(void) {", 'puts("Hello, algorithm!");', 'puts("Hello, algorithm!");', "return 0;"],
  2: ['scanf("%d", &value)', "value * value", "value * value", 'printf("%d\\n", value * value);'],
  3: [
    "int main(void) {",
    "int compiled = 1;",
    'printf("%s\\n", compiled ? "run" : "stop");',
    "return 0;",
  ],
  4: ["int total = 0;", "total += 2;", "total *= 3;", 'printf("%d\\n", total);'],
  5: [
    'scanf("%d", &value)',
    "value > 0",
    'printf("%s\\n", value > 0 ? "positive" : value < 0 ? "negative" : "zero");',
    'printf("%s\\n", value > 0 ? "positive" : value < 0 ? "negative" : "zero");',
  ],
  6: [
    "int item_count = 3;",
    "int item_price = 4;",
    'printf("%d\\n", item_count * item_price);',
    "item_count * item_price",
  ],
  7: ["const int limit = 10;", "used += 2;", "used += 2;", 'printf("%d/%d\\n", used, limit);'],
  8: [
    "int a = 2, b = 3, c = 4;",
    'printf("%d %d\\n", a + b * c, (a + b) * c);',
    "a + b * c, (a + b) * c",
    'printf("%d %d\\n", a + b * c, (a + b) * c);',
  ],
  9: [
    'scanf("%d", &value)',
    'if (scanf("%d", &value) != 1) { puts("invalid");',
    'puts("invalid"); return 0;',
    'printf("%d\\n", value + 1);',
  ],
  10: [
    "double value = 2.0 / 3.0;",
    '"%.3f\\n"',
    'printf("%.3f\\n", value);',
    'printf("%.3f\\n", value);',
  ],
  11: ["score = score + 5;", "score = score + 5;", "score *= 2;", 'printf("%d\\n", score);'],
  12: [
    "radius < 0.0",
    "4.0 / 3.0",
    "double volume = 4.0 / 3.0 * pi * radius * radius * radius;",
    'printf("%.2f\\n", volume);',
  ],
  13: [
    "denominator == 0",
    "numerator / denominator",
    "numerator / denominator",
    'printf("%d %d\\n", numerator / denominator, numerator % denominator);',
  ],
  14: [
    'scanf("%d%d", &left, &right)',
    "left < right",
    "left < right",
    'printf("%s\\n", left < right ? "true" : "false");',
  ],
  15: [
    "value >= 1",
    "value <= 10",
    'printf("%s\\n", value >= 1 && value <= 10 ? "inside" : "outside");',
    'printf("%s\\n", value >= 1 && value <= 10 ? "inside" : "outside");',
  ],
  16: ["value < 0", "if (value < 0)", "if (value < 0) value = -value;", 'printf("%d\\n", value);'],
  17: ["a > b", "a > b ? a : b", "int maximum = a > b ? a : b;", 'printf("%d\\n", maximum);'],
  18: [
    "score >= 80",
    "score >= 70",
    "char grade = score >= 80 ? 'A' : score >= 70 ? 'B' : score >= 60 ? 'C' : 'F';",
    'printf("%c\\n", grade);',
  ],
  19: [
    "income < 0.0",
    "income > 45000.0",
    "double tax = income > 45000.0 ? (income - 45000.0) * 0.30 : 0.0;",
    "(income - 45000.0) * 0.30",
  ],
  20: [
    'scanf("%d", &month)',
    "switch (month) { case 2: days = 28;",
    "days = 28;",
    "days = 28; break;",
  ],
  21: [
    'scanf("%d", &count)',
    'if (scanf("%d", &count) != 1 || count <= 0) { puts("invalid");',
    'puts("invalid");',
    'puts("invalid"); return 0;',
  ],
  22: ["int sum = 0;", "i <= n", "for (int i = 1; i <= n; i++) sum += i;", "i++"],
  23: ["int result = 1;", "result *= i", "for (int i = 2; i <= n; i++) result *= i;", "i++"],
  24: [
    "int cents = 1000;",
    "for (int year = 0; year < 3; year++) cents = cents * 105 / 100;",
    "cents * 105 / 100",
    "cents = cents * 105 / 100;",
  ],
  25: [
    'scanf("%d", &value)',
    'while (scanf("%d", &value) == 1 && value != -1) sum += value;',
    "sum += value;",
    'printf("%d\\n", sum);',
  ],
  26: ["digits++;", "value /= 10;", "value != 0", "while (value != 0)"],
  27: [
    "count <= 0",
    "for (int i = 0, value; i < count; i++)",
    "sum += value;",
    'printf("%.2f\\n", (double)sum / count);',
  ],
  28: [
    'scanf("%d%d", &count, &maximum)',
    'scanf("%d", &value)',
    "if (value > maximum) maximum = value;",
    'printf("%d\\n", maximum);',
  ],
  29: [
    "for (int row = 1; row <= rows; row++)",
    "for (int col = 0; col < row; col++) putchar('*');",
    "putchar('\\n');",
    "row++",
  ],
  30: [
    "int prime = n >= 2;",
    "divisor <= n / divisor",
    "for (int divisor = 2; prime && divisor <= n / divisor; divisor++) if (n % divisor == 0) prime = 0;",
    "for (int divisor = 2; prime && divisor <= n / divisor; divisor++) if (n % divisor == 0) prime = 0;",
  ],
  31: ["int remainder = a % b;", "a = b;", "b = remainder;", 'printf("%d\\n", a);'],
  32: ["square(value)", "int x", "x * x", 'printf("%d\\n", square(value));'],
  33: [
    "static int add(int left, int right);",
    "add(7, 5)",
    "static int add(int left, int right) ",
    'printf("%d\\n", add(7, 5));',
  ],
  34: ["#include <stdlib.h>", "abs(value)", "abs(value)", 'printf("%d\\n", abs(value));'],
  35: [
    "static int clamp(int value, int low, int high) { if (value < low) return low;",
    "if (value > high) return high;",
    "return high;",
    'printf("%d\\n", clamp(14, 0, 10));',
  ],
  36: [
    "static int factorial(int n) { return n <= 1 ? 1 : n * factorial(n - 1);",
    "n <= 1 ? 1",
    "n * factorial(n - 1)",
    'printf("%d\\n", factorial(5));',
  ],
  37: [
    "static double cube_root(double value) { double guess = value > 1.0 ? value : 1.0;",
    "for (int i = 0; i < 20; i++) guess = (2.0 * guess + value / (guess * guess)) / 3.0;",
    "guess = (2.0 * guess + value / (guess * guess)) / 3.0",
    "i < 20",
  ],
  38: [
    "for (size_t i = 0; i < 3; i++)",
    "minimum(tests[i][0], tests[i][1])",
    "for (size_t i = 0; i < 3; i++) passed += minimum(tests[i][0], tests[i][1]) == tests[i][2];",
    "passed += minimum(tests[i][0], tests[i][1]) == tests[i][2]",
  ],
  39: [
    "static void increment_copy(int value) { value++;",
    "value++;",
    'printf("inside=%d\\n", value);',
    'printf("outside=%d\\n", value);',
  ],
  40: [
    "distance_from_zero(-12)",
    "value < 0 ? -value : value",
    "return value < 0 ? -value : value;",
    'printf("%d\\n", distance);',
  ],
  41: ["return x * 2;", "twice(10)", "return x + 1;", 'printf("%d\\n", plus_one(twice(10)));'],
  42: [
    "int main(void) {",
    'printf("%s\\n", ok ? "success" : "failure");',
    "return ok ? EXIT_SUCCESS : EXIT_FAILURE;",
    "return ok ? EXIT_SUCCESS : EXIT_FAILURE;",
  ],
  43: [
    'static void print_separator(void) { puts("---");',
    'puts("---")',
    "print_separator();",
    'static void print_separator(void) { puts("---"); }',
  ],
  44: ["int value = 3;", "{ int value = 8;", 'printf("%d ", value);', 'printf("%d\\n", value);'],
  45: [
    "static int counter = 0;",
    "static void count_once(void) { counter++;",
    "; count_once();",
    'printf("%d\\n", counter);',
  ],
  46: [
    "static int next_id(void) { static int id = 0;",
    "return ++id;",
    "int second = next_id();",
    "return ++id;",
  ],
  47: ["int value = 7;", "int *address = &value;", "*address = 9;", "*address = 9;"],
  48: [
    "static void swap(int *left, int *right) { int temporary = *left;",
    "*left = *right;",
    "*right = temporary;",
    'printf("%d %d\\n", a, b);',
  ],
  49: [
    "static void minmax(int a, int b, int *minimum, int *maximum) { *minimum = a < b ? a : b;",
    "*minimum = a < b ? a : b;",
    "*maximum = a > b ? a : b;",
    'printf("%d %d\\n", low, high);',
  ],
  50: [
    'static int read_int(int *out) { return scanf("%d", out) == 1;',
    'scanf("%d", out) == 1',
    'scanf("%d", out)',
    "if (!read_int(&value))",
  ],
  51: [
    "for (size_t i = 0; i < 4; i++)",
    "values[i]",
    "for (size_t i = 0; i < 4; i++) sum += values[i];",
    "i < 4; i++",
  ],
  52: [
    'scanf("%d", &count)',
    "count < 0 || count > CAPACITY",
    'for (int i = 0; i < count; i++) if (scanf("%d", &values[i]) != 1) return 1;',
    'printf("%d\\n", count == 0 ? 0 : values[count - 1]);',
  ],
  53: [
    "static int array_max(const int values[], size_t length) { int maximum = values[0];",
    "for (size_t i = 1; i < length; i++) if (values[i] > maximum) maximum = values[i];",
    "values[i] > maximum",
    "return maximum;",
  ],
  54: [
    "for (size_t row = 0; row < 2; row++)",
    "for (size_t col = 0; col < 3; col++) sum += matrix[row][col];",
    "printf(\"%d%c\", sum, row == 1 ? '\\n' : ' ');",
    "int sum = 0;",
  ],
  55: [
    "int counts[5] = {[1] = 3, [4] = 2};",
    "[1] = 3",
    "[4] = 2",
    "int counts[5] = {[1] = 3, [4] = 2};",
  ],
  56: [
    "int *cursor = values",
    "for (int *cursor = values; cursor != values + 3; cursor++) printf(\"%d%c\", *cursor, cursor == values + 2 ? '\\n' : ' ');",
    "for",
    "cursor != values + 3",
  ],
  57: [
    "word[length]",
    "length++",
    "while (word[length] != '\\0') length++;",
    "word[length] != '\\0'",
  ],
  58: [
    "for (size_t i = 0; i < 5; i++)",
    "size_t j = 0;",
    "while (j < used && strcmp(input[i], unique[j]) != 0) j++;",
    "for (size_t i = 0; i < used; i++) printf(\"%s%c\", unique[i], i + 1 == used ? '\\n' : ' ');",
  ],
  59: ['scanf("%d", &index)', "index < 0 || index >= 7", "days[index]", "puts(days[index]);"],
  60: [
    "size_t j = i;",
    "values[j - 1] > values[j]",
    "values[j - 1] = values[j];",
    "values[j] = temporary;",
  ],
  61: ["struct Point { int x; int y; };", "struct Point point", "{3, 4}", "point.x + point.y"],
  62: [
    "struct Pair first = {2, 8};",
    "struct Pair second = first;",
    "second.left = 5;",
    "first.left, second.left",
  ],
  63: [
    "struct Counter counter;",
    'scanf("%d", &counter.value)',
    "struct Counter *link = &counter;",
    "link->value",
    "link->value++;",
  ],
  64: [
    "(struct Point){1, 2}, 3, 4",
    "p.x += dx; p.y += dy;",
    "return p;",
    "struct Point p = translated((struct Point){1, 2}, 3, 4);",
  ],
  65: [
    "for (size_t i = 0; i < 3; i++)",
    "items[i].score",
    "items[i].score >= 7",
    "printf(\"%s%c\", items[i].name, i == 2 ? '\\n' : ' ')",
  ],
  66: ["enum State state = RUNNING;", "switch (state)", "case RUNNING:", 'puts("running"); break;'],
  67: [
    "struct Value value = {INTEGER, {.integer = 42}};",
    ".integer = 42",
    "value.kind == INTEGER",
    "value.as.integer",
  ],
  68: ["int wanted = 9;", "students[i].id == wanted", "i++", "puts(students[i].name)"],
  69: [
    "size_t i = 0; i < 4; i++",
    "size_t j = i + 1; j < 4; j++",
    "values[i] + values[j]",
    "== target) printf",
  ],
  70: [
    "size_t mid = low + (high - low) / 2",
    "values[mid] < target",
    "low = mid + 1; else high = mid;",
    'printf("%zu\\n", low);',
  ],
  71: [
    "queue[tail++] = 3; queue[tail++] = 5;",
    'printf("%d ", queue[head++]);',
    "queue[tail++] = 8;",
    'printf("%d %d\\n", queue[head++], queue[head++]);',
  ],
  72: [
    "double mid = (low + high) / 2.0",
    "mid * mid",
    "if (mid * mid < value) low = mid; else high = mid;",
    'printf("%.5f\\n", (low + high) / 2.0);',
  ],
  73: [
    "position += velocity * dt;",
    "position += velocity * dt;",
    "velocity -= 9.8 * dt;",
    "step++",
  ],
  74: [
    "int current = -(x - 3) * (x - 3);",
    "int next = -(x + 1 - 3) * (x + 1 - 3);",
    "x++;",
    "if (next <= current) break;",
  ],
  75: ["disks == 0", "2 * moves(disks - 1) + 1", "moves(disks - 1)", "2 * moves(disks - 1) + 1"],
  76: [
    "if (target == 0) return 1; if (n == 0) return 0;",
    "subset_sum(v + 1, n - 1, target) ||",
    "target - v[0]",
    "return subset_sum(v + 1, n - 1, target) || subset_sum(v + 1, n - 1, target - v[0]);",
  ],
  77: [
    "state = state * 1664525u + 1013904223u; double x = (state & 0xffffu) / 65535.0; state = state * 1664525u + 1013904223u; double y = (state & 0xffffu) / 65535.0;",
    "x * x + y * y <= 1.0",
    "inside += x * x + y * y <= 1.0;",
    "4.0 * inside / samples",
  ],
  78: ["x * x - 2.0", "2.0 * x", "x -= (x * x - 2.0) / (2.0 * x);", 'printf("%.6f\\n", x);'],
  79: [
    "int j = (int)(state % (uint32_t)(i + 1));",
    "int t = values[i]; values[i] = values[j];",
    "values[i] = values[j]; values[j] = t;",
    "i--",
  ],
  80: [
    "paths[0][0] = 1;",
    "for (int r = 0; r < 3; r++) for (int c = 0; c < 3; c++)",
    "paths[r][c] += paths[r-1][c]; if (c) paths[r][c] += paths[r][c-1];",
    "paths[2][2]",
  ],
  81: [
    "count * sizeof *values",
    "malloc(count * sizeof *values)",
    "for (size_t i = 0; i < count; i++) values[i] = (int)(i * i);",
    "free(values);",
  ],
  82: [
    "int *grown = realloc(values, next * sizeof *values);",
    "realloc(values, next * sizeof *values)",
    "if (!grown)",
    "if (!grown) { free(values); return 1; } values = grown;",
  ],
  83: [
    "struct Node third={3,NULL}, second={2,&third}, first={1,&second};",
    "second={2,&third}, first={1,&second}",
    "for (struct Node *p=&first; p; p=p->next)",
  ],
  84: [
    "struct Node *head=&first;",
    "struct Node zero={0,head};",
    "head=&zero;",
    "for (struct Node *p=head; p; p=p->next)",
  ],
  85: [
    "struct Node c={3,NULL}, b={2,&c}, a={1,&b};",
    "= b.next;",
    "a.next = b.next;",
    "b.next = NULL;",
  ],
  86: ['printf("%d ", top->value);', "top=top->next;", 'printf("%d\\n", top->value);'],
  87: [
    "size=0; queue[tail]=4;",
    "tail=(tail+1)%3; size++; queue[tail]=7;",
    'printf("%d ", queue[head]); head=(head+1)%3;',
    "queue[tail]=9;",
  ],
  88: [
    "struct Node *p=&root;",
    "p->key != target",
    "p = target < p->key ? p->left : p->right;",
    "while (p && p->key != target)",
  ],
  89: ["inorder(n->left);", 'printf("%d ", n->key);', "inorder(n->right);", "if (!n) return;"],
  90: ["int sorted[] = {1,2,3,4,5};", "for (size_t i=0;i<5;i++)", 'printf("%d\\n", height);'],
  91: ["int (*operation)(int,int)", "=multiply;", "operation(3,4)"],
  92: ["walk(&root,show)", "walk(n->left,visit)", "visit(n->value)", 'printf("%d ",value)'],
  93: [
    'fprintf(file,"3 5\\n");',
    'fprintf(file,"3 5\\n");',
    "rewind(file);",
    'if(fscanf(file,"%d%d",&a,&b)!=2){fclose(file);return 1;} printf("%d\\n",a+b);',
  ],
  94: [
    "while(fgets(line,sizeof line,file))",
    "fgets(line,sizeof line,file)",
    "fgets(line,sizeof line,file)",
  ],
  95: ['fscanf(file,"%d%d",&a,&b)', "&a", '"12 x"', 'int read=fscanf(file,"%d%d",&a,&b);'],
  96: [
    "fwrite(&out,sizeof out,1,file)",
    "rewind(file);",
    "fread(&in,sizeof in,1,file)",
    "in.id,in.score",
  ],
  97: [
    "fwrite(data,1,3,file);",
    "fseek(file,1,SEEK_SET);",
    "fputc(9,file);",
    "rewind(file); for(int i=0;i<3;i++)",
  ],
  98: ["a[i]<=b[j]", "?a[i++]:b[j++]", "?a[i++]:b[j++]", "j==3||(i<3&&a[i]<=b[j])"],
  99: ["int chosen=0;", "for(int i=1;i<3;i++)", "chosen,front[chosen]"],
  100: [
    "FILE *file=tmpfile();",
    'if(file){ if(fputs("ok",file)>=0) status=0;',
    "fclose(file);",
    'puts(status==0?"closed":"failed");',
  ],
  101: [
    "size_t j=i+1;j<4;j++",
    "comparisons++;",
    "if(values[j]<values[i]){int t=values[i];values[i]=values[j];values[j]=t;}",
    "for(size_t i=0;i<4;i++) for(size_t j=i+1;j<4;j++)",
  ],
  102: ["for(int i=0;i<3;i++)", "strcmp(words[i],target)==0", "{index=i;break;}"],
  103: [
    "size_t mid=low+(high-low)/2;",
    "strcmp(words[mid],target)",
    "if(cmp<0)low=mid+1;else high=mid;",
    'printf("%zu\\n",low);',
  ],
  104: ["*text++", "hash*31u", "hash=hash*31u+*text++;"],
  105: ["int target=5", "struct Entry *p=&a", "p->key==target", 'puts(found?"found":"missing");'],
});

function validateSemanticSourceAnchors(
  lessonIdValue: string,
  source: string,
  semanticEvents: readonly FoaSemanticEvent[],
): void {
  for (const semanticEvent of semanticEvents) {
    const exact = semanticEvent.sourceAnchor?.exact;
    if (exact === undefined || exact.trim().length === 0 || exact.includes("\n")) {
      throw new TypeError(`FOA event ${semanticEvent.id} has no single-line source anchor`);
    }
    const first = source.indexOf(exact);
    if (first < 0) {
      throw new RangeError(
        `FOA event ${semanticEvent.id} source anchor is missing from ${lessonIdValue}`,
      );
    }
    if (source.indexOf(exact, first + 1) >= 0) {
      throw new RangeError(
        `FOA event ${semanticEvent.id} source anchor is ambiguous in ${lessonIdValue}`,
      );
    }
  }
}

function semanticEventLabel(
  order: number,
  index: number,
  fallback: FoaLocalizedText,
): FoaLocalizedText {
  if (order === 2) {
    const labels = [
      foaText("输入数字 7", "Input the number 7"),
      foaText("scanf 把 7 存入 value", "scanf stores 7 in value"),
      foaText("计算 value × value = 49", "Calculate value × value = 49"),
      foaText("printf 输出 49", "printf writes 49"),
    ];
    return labels[index] ?? fallback;
  }
  if (order === 3) {
    const labels = [
      foaText("进入 main", "Enter main"),
      foaText("建立 compiled=1", "Create compiled=1"),
      foaText("根据 compiled 选择并输出 run 或 stop", "Choose and write run or stop from compiled"),
      foaText("main 返回状态码 0", "Return status 0 from main"),
    ];
    return labels[index] ?? fallback;
  }
  if (order === 37 && index === 3) {
    return foaText("完成固定 20 轮迭代", "Complete the fixed 20 iterations");
  }
  if (order === 65 && index === 0) {
    return foaText("选择下一条记录的索引", "Select the next record index");
  }
  if (order === 68 && index === 2) {
    return foaText("处理当前记录后前进", "Advance after processing the current record");
  }
  if (order === 72 && index === 3) {
    return foaText("显示最终中点估计", "Display the final midpoint estimate");
  }
  if (order === 73 && index === 3) {
    return foaText("推进离散时间步", "Advance the discrete time step");
  }
  if (order === 77 && index === 2) {
    return foaText("根据分类结果累加 inside", "Accumulate inside from the classification result");
  }
  if (order === 78 && index === 3) {
    return foaText("显示新的根近似值", "Display the new root approximation");
  }
  if (order === 87 && index === 3) {
    return foaText("在当前 tail 空槽写入 9", "Write 9 into the current tail slot");
  }
  if (order === 90 && index === 1) {
    return foaText("按有序键逐项累计高度", "Accumulate height once per sorted key");
  }
  if (order === 90 && index === 2) {
    return foaText("输出累计高度", "Output the accumulated height");
  }
  if (order === 100 && index === 3) {
    return foaText("关闭后输出状态", "Output status after closing");
  }
  if (order === 102 && index === 2) {
    return foaText(
      "命中时保存 i 并停止，否则继续 i++",
      "Save i and stop on a hit; otherwise continue with i++",
    );
  }
  if (order === 105 && index === 0) {
    return foaText("设置查找目标 key=5", "Set the lookup target key to 5");
  }
  if (order === 105 && index === 1) {
    return foaText("从链头 a 开始遍历", "Traverse from chain head a");
  }
  if (order === 105 && index === 3) {
    return foaText("输出 found 或 missing", "Output found or missing");
  }
  return fallback;
}

function event(
  lessonIdValue: string,
  type:
    | "read"
    | "bind"
    | "compare"
    | "branch"
    | "iterate"
    | "call"
    | "return"
    | "write"
    | "allocate"
    | "release"
    | "measure",
  zh: string,
  en: string,
  codeAnchor: string,
  sourceAnchor: string | null = null,
  idSuffix = "",
) {
  return Object.freeze({
    id: `${lessonIdValue}.event.${type}${idSuffix}`,
    type,
    label: foaText(zh, en),
    codeAnchor,
    sourceAnchor: sourceAnchor === null ? null : Object.freeze({ exact: sourceAnchor }),
  });
}

function semanticEventsForExperience(
  lessonIdValue: string,
  order: number,
  focus: string,
  experience: FoaLessonExperience,
): readonly FoaSemanticEvent[] {
  const coreType = eventTypeForFocus(focus);
  const explicitSourceAnchors = FOA_EXPLICIT_SOURCE_ANCHORS[order];
  if (
    explicitSourceAnchors !== undefined &&
    explicitSourceAnchors.length !== experience.semanticSequence.length
  ) {
    throw new RangeError(
      `FOA lesson ${String(order)} defines ${String(explicitSourceAnchors.length)} source anchors for ${String(experience.semanticSequence.length)} semantic events`,
    );
  }
  const count = experience.semanticSequence.length;
  const shapes = experience.semanticSequence.map((_, index) => {
    if (index === 0) return ["read", "scanf/input"] as const;
    if (index === count - 1) return ["write", "printf/output"] as const;
    if (index === 1 && count >= 4) return ["bind", "FOA_STEP"] as const;
    return [coreType, "core-step"] as const;
  });
  return Object.freeze(
    experience.semanticSequence.map((label, index) => {
      const [type, legacyAnchor] = shapes[index]!;
      const sourceAnchor = explicitSourceAnchors?.[index] ?? null;
      const eventLabel = semanticEventLabel(order, index, label);
      return event(
        lessonIdValue,
        type,
        eventLabel.zh,
        eventLabel.en,
        sourceAnchor ?? legacyAnchor,
        sourceAnchor,
        count > 4 ? `.${String(index + 1)}` : "",
      );
    }),
  );
}

function relation(
  lessonIdValue: string,
  from: string,
  to: string,
  role: "input" | "value" | "predicate" | "control" | "mutation" | "output" | "evidence",
  zh: string,
  en: string,
) {
  return Object.freeze({
    id: `${lessonIdValue}.relation.${role}`,
    from,
    to,
    role,
    label: foaText(zh, en),
  });
}

function eventTypeForFocus(
  focus: string,
): "compare" | "branch" | "iterate" | "call" | "allocate" | "measure" {
  const lower = focus.toLowerCase();
  if (/(condition|choice|branch|switch|guard)/u.test(lower)) return "branch";
  if (/(loop|scan|sort|iteration|travers)/u.test(lower)) return "iterate";
  if (/(function|recursion|call|callback)/u.test(lower)) return "call";
  if (/(pointer|dynamic|list|tree|allocation|memory)/u.test(lower)) return "allocate";
  if (/(performance|complexity|benchmark|approximation)/u.test(lower)) return "measure";
  return "compare";
}

function relationRoleForFocus(
  focus: string,
): "predicate" | "control" | "mutation" | "value" | "evidence" {
  const lower = focus.toLowerCase();
  if (/(condition|choice|branch|switch|guard|search)/u.test(lower)) return "predicate";
  if (/(loop|recursion|call|return)/u.test(lower)) return "control";
  if (/(pointer|array|sort|list|tree|file|memory)/u.test(lower)) return "mutation";
  if (/(performance|complexity|benchmark)/u.test(lower)) return "evidence";
  return "value";
}

function pad(value: number, width = 2): string {
  return String(value).padStart(width, "0");
}

function slug(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/gu, "-")
      .replace(/^-|-$/gu, "") || "concept"
  );
}

function capitalize(value: string): string {
  return `${value.charAt(0).toUpperCase()}${value.slice(1)}`;
}

function lessonSummary(
  order: number,
  focus: FoaLocalizedText,
  experience: FoaLessonExperience,
): FoaLocalizedText {
  const focusZh = terminalText(focus.zh);
  const focusEn = lowerInitial(terminalText(focus.en));
  const actionZh = terminalText(experience.primaryAction.zh);
  const actionEn = terminalText(experience.primaryAction.en);
  const actionEnLower = lowerInitial(actionEn);
  const evidenceZh = terminalText(experience.persistentEvidence.zh);
  const evidenceEn = lowerInitial(terminalText(experience.persistentEvidence.en));
  const variant = (order - 1) % 12;
  const summariesZh = [
    `围绕“${focusZh}”，${actionZh}；用${evidenceZh}核对结果。`,
    `${focusZh}是本课核心。${actionZh}；完成后检查${evidenceZh}。`,
    `本课把${focusZh}落实为可观察操作：${actionZh}；结果由${evidenceZh}验证。`,
    `先理解${focusZh}，再${actionZh}；最后根据${evidenceZh}确认结果。`,
    `要掌握${focusZh}，学习者将${actionZh}；${evidenceZh}提供核对依据。`,
    `从${focusZh}出发，${actionZh}；随后以${evidenceZh}判断是否达成目标。`,
    `本课通过“${actionZh}”解释${focusZh}；可观察结果记录在${evidenceZh}中。`,
    `针对${focusZh}，先${actionZh}；再查看${evidenceZh}以确认行为。`,
    `${focusZh}不只停留在定义上：${actionZh}；${evidenceZh}用来检验结论。`,
    `学习任务聚焦${focusZh}，要求${actionZh}；判断标准是${evidenceZh}。`,
    `为看清${focusZh}，${actionZh}；结束时对照${evidenceZh}。`,
    `${focusZh}通过一次具体任务展开：${actionZh}；完成情况由${evidenceZh}体现。`,
  ] as const;
  const summariesEn = [
    `Explore ${focusEn}: ${actionEn}; check the result against ${evidenceEn}.`,
    `The lesson centres on ${focusEn}. ${actionEn}; finish by inspecting ${evidenceEn}.`,
    `Turn ${focusEn} into an observable task: ${actionEn}; verify it with ${evidenceEn}.`,
    `First understand ${focusEn}, then ${actionEnLower}; confirm the outcome from ${evidenceEn}.`,
    `To master ${focusEn}, ${actionEnLower}; use ${evidenceEn} as the check.`,
    `Start from ${focusEn} and ${actionEnLower}; judge completion against ${evidenceEn}.`,
    `The task explains ${focusEn} by asking you to ${actionEnLower}; the observable result appears in ${evidenceEn}.`,
    `For ${focusEn}, first ${actionEnLower}; then inspect ${evidenceEn} to confirm the behaviour.`,
    `${capitalize(focusEn)} becomes concrete when you ${actionEnLower}; test the conclusion with ${evidenceEn}.`,
    `The learning task focuses on ${focusEn}: ${actionEn}; ${evidenceEn} supplies the success criterion.`,
    `To make ${focusEn} visible, ${actionEnLower}; finish by comparing ${evidenceEn}.`,
    `A concrete task develops ${focusEn}: ${actionEn}; completion is reflected in ${evidenceEn}.`,
  ] as const;
  return foaText(summariesZh[variant]!, summariesEn[variant]!);
}

function terminalText(value: string): string {
  return value.trim().replace(/[\s。！？；：，、.!?;:,]+$/gu, "");
}

function lowerInitial(value: string): string {
  return `${value.charAt(0).toLocaleLowerCase("en")}${value.slice(1)}`;
}
