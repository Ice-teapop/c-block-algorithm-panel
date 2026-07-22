import type {
  FoaWorkspaceExercise,
  FoaWorkspaceExerciseCase,
  FoaWorkspaceSourceRequirement,
} from "./foa-contracts.js";
import { foaText } from "./foa-contracts.js";

const HEADER = `#include <assert.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>

`;

const EXERCISES: ReadonlyMap<number, FoaWorkspaceExercise> = new Map(
  [
    exercise(
      106,
      `${HEADER}static void swap_int(int *left, int *right) {
  int temporary = *left;
  *left = *right;
  *right = temporary;
}

static int partition(int *values, int length) {
  int pivot = values[length - 1];
  int store = 0;
  /* TODO: move values smaller than pivot before store, then place pivot. */
  (void)pivot;
  return store;
}

int main(void) {
  int length = 0, values[32];
  if (scanf("%d", &length) != 1 || length < 1 || length > 32) return 1;
  for (int i = 0; i < length; i++) if (scanf("%d", &values[i]) != 1) return 1;
  int pivot_index = partition(values, length);
  printf("%d\\n", pivot_index);
  for (int i = 0; i < length; i++) printf("%d%c", values[i], i + 1 == length ? '\\n' : ' ');
  return 0;
}
`,
      [
        ["5\n4 2 5 1 3\n", "2\n2 1 3 4 5\n"],
        ["4\n1 2 3 4\n", "3\n1 2 3 4\n"],
        ["5\n5 4 3 2 1\n", "0\n1 4 3 2 5\n"],
      ],
      [
        [
          "partition-loop",
          "partition function loop",
          "partition 函数中的循环",
          "partition\\s*\\([^)]*\\)\\s*\\{[\\s\\S]*for\\s*\\(",
        ],
        [
          "partition-compare",
          "comparison with the pivot",
          "与枢轴比较",
          "partition\\s*\\([^)]*\\)\\s*\\{[\\s\\S]*<\\s*pivot",
        ],
        [
          "partition-swap",
          "swap during partitioning",
          "分区中的交换",
          "partition\\s*\\([^)]*\\)\\s*\\{[\\s\\S]*swap_int\\s*\\(",
        ],
      ],
    ),
    exercise(
      107,
      `${HEADER}static void swap_int(int *left, int *right) { int t = *left; *left = *right; *right = t; }

static void partition_three(int *values, int length, int pivot, int *low_end, int *high_start) {
  int low = 0, current = 0, high = length - 1;
  /* TODO: build the less-than, equal, and greater-than regions. */
  (void)values; (void)pivot; (void)current;
  *low_end = low;
  *high_start = high;
}

int main(void) {
  int length = 0, pivot = 0, values[32], low = 0, high = 0;
  if (scanf("%d%d", &length, &pivot) != 2 || length < 1 || length > 32) return 1;
  for (int i = 0; i < length; i++) if (scanf("%d", &values[i]) != 1) return 1;
  partition_three(values, length, pivot, &low, &high);
  printf("%d %d\\n", low, high);
  for (int i = 0; i < length; i++) printf("%d%c", values[i], i + 1 == length ? '\\n' : ' ');
  return 0;
}
`,
      [
        ["5 3\n3 1 3 2 3\n", "2 4\n1 2 3 3 3\n"],
        ["4 2\n1 2 3 2\n", "1 2\n1 2 2 3\n"],
        ["3 7\n7 7 7\n", "0 2\n7 7 7\n"],
      ],
      [
        [
          "three-way-loop",
          "single scanning loop",
          "单次扫描循环",
          "partition_three\\s*\\([^)]*\\)\\s*\\{[\\s\\S]*while\\s*\\(",
        ],
        [
          "three-way-less",
          "less-than branch",
          "小于分支",
          "partition_three\\s*\\([^)]*\\)\\s*\\{[\\s\\S]*<\\s*pivot",
        ],
        [
          "three-way-greater",
          "greater-than branch",
          "大于分支",
          "partition_three\\s*\\([^)]*\\)\\s*\\{[\\s\\S]*>\\s*pivot",
        ],
      ],
    ),
    exercise(
      108,
      `${HEADER}static void merge_sorted(const int *left, int left_count, const int *right, int right_count, int *output) {
  /* TODO: merge both sorted inputs while preserving equal-value order. */
  for (int i = 0; i < left_count + right_count; i++) output[i] = 0;
}

int main(void) {
  int left_count = 0, right_count = 0, left[32], right[32], output[64];
  if (scanf("%d%d", &left_count, &right_count) != 2 || left_count < 0 || right_count < 0 || left_count + right_count < 1 || left_count + right_count > 64) return 1;
  for (int i = 0; i < left_count; i++) if (scanf("%d", &left[i]) != 1) return 1;
  for (int i = 0; i < right_count; i++) if (scanf("%d", &right[i]) != 1) return 1;
  merge_sorted(left, left_count, right, right_count, output);
  for (int i = 0; i < left_count + right_count; i++) printf("%d%c", output[i], i + 1 == left_count + right_count ? '\\n' : ' ');
  return 0;
}
`,
      [
        ["3 3\n1 4 7\n2 3 8\n", "1 2 3 4 7 8\n"],
        ["2 3\n1 1\n1 2 2\n", "1 1 1 2 2\n"],
        ["1 4\n9\n-3 0 5 10\n", "-3 0 5 9 10\n"],
      ],
      [
        [
          "merge-cursors",
          "two merge cursors",
          "两个归并游标",
          "merge_sorted\\s*\\([^)]*\\)\\s*\\{[\\s\\S]*(?:left_index|right_index|\\bi\\b)[\\s\\S]*(?:right_index|\\bj\\b)",
        ],
        [
          "merge-loop",
          "merge loop",
          "归并循环",
          "merge_sorted\\s*\\([^)]*\\)\\s*\\{[\\s\\S]*while\\s*\\(",
        ],
        [
          "merge-stable",
          "stable less-than-or-equal choice",
          "稳定的小于等于选择",
          "merge_sorted\\s*\\([^)]*\\)\\s*\\{[\\s\\S]*<=",
        ],
      ],
    ),
    exercise(
      109,
      `${HEADER}static void merge_sort(int *values, int length) {
  /* TODO: implement bottom-up merge sort with run widths 1, 2, 4, ... */
  (void)values; (void)length;
}

int main(void) {
  int length = 0, values[64];
  if (scanf("%d", &length) != 1 || length < 1 || length > 64) return 1;
  for (int i = 0; i < length; i++) if (scanf("%d", &values[i]) != 1) return 1;
  merge_sort(values, length);
  for (int i = 0; i < length; i++) printf("%d%c", values[i], i + 1 == length ? '\\n' : ' ');
  return 0;
}
`,
      [
        ["5\n5 2 4 6 1\n", "1 2 4 5 6\n"],
        ["6\n3 1 3 2 1 2\n", "1 1 2 2 3 3\n"],
        ["4\n-1 -4 9 0\n", "-4 -1 0 9\n"],
      ],
      [
        [
          "bottom-up-width",
          "doubling run width",
          "子段宽度翻倍",
          "merge_sort\\s*\\([^)]*\\)\\s*\\{[\\s\\S]*width[\\s\\S]*(?:\\*=\\s*2|=\\s*width\\s*\\*\\s*2)",
        ],
        [
          "bottom-up-pass",
          "nested merge passes",
          "嵌套归并轮次",
          "merge_sort\\s*\\([^)]*\\)\\s*\\{[\\s\\S]*for\\s*\\([\\s\\S]*for\\s*\\(",
        ],
        [
          "bottom-up-buffer",
          "temporary merge storage",
          "临时归并存储",
          "merge_sort\\s*\\([^)]*\\)\\s*\\{[\\s\\S]*(?:temporary|buffer|output)",
        ],
      ],
    ),
    exercise(
      110,
      `${HEADER}static void swap_int(int *left, int *right) { int t = *left; *left = *right; *right = t; }

static void sift_down(int *heap, int length) {
  int root = 0;
  /* TODO: repeatedly exchange root with its larger child when required. */
  (void)heap; (void)length; (void)root;
}

int main(void) {
  int length = 0, heap[32];
  if (scanf("%d", &length) != 1 || length < 1 || length > 32) return 1;
  for (int i = 0; i < length; i++) if (scanf("%d", &heap[i]) != 1) return 1;
  sift_down(heap, length);
  for (int i = 0; i < length; i++) printf("%d%c", heap[i], i + 1 == length ? '\\n' : ' ');
  return 0;
}
`,
      [
        ["5\n1 8 6 4 3\n", "8 4 6 1 3\n"],
        ["3\n2 9 7\n", "9 2 7\n"],
        ["3\n10 8 9\n", "10 8 9\n"],
      ],
      [
        [
          "sift-loop",
          "repeated sift-down loop",
          "重复下滤循环",
          "sift_down\\s*\\([^)]*\\)\\s*\\{[\\s\\S]*(?:while|for)\\s*\\(",
        ],
        [
          "sift-child",
          "left-child index calculation",
          "左子节点下标计算",
          "sift_down\\s*\\([^)]*\\)\\s*\\{[\\s\\S]*root\\s*\\*\\s*2\\s*\\+\\s*1",
        ],
        [
          "sift-swap",
          "parent-child exchange",
          "父子节点交换",
          "sift_down\\s*\\([^)]*\\)\\s*\\{[\\s\\S]*swap_int\\s*\\(",
        ],
      ],
    ),
    exercise(
      111,
      `${HEADER}static void swap_int(int *left, int *right) { int t = *left; *left = *right; *right = t; }
static void sift_down(int *heap, int length, int root) {
  for (;;) {
    int child = root * 2 + 1;
    if (child >= length) return;
    if (child + 1 < length && heap[child + 1] > heap[child]) child++;
    if (heap[root] >= heap[child]) return;
    swap_int(&heap[root], &heap[child]);
    root = child;
  }
}

static void heap_sort(int *values, int length) {
  /* TODO: build the heap, then grow the sorted suffix. */
  (void)values; (void)length;
}

int main(void) {
  int length = 0, values[64];
  if (scanf("%d", &length) != 1 || length < 1 || length > 64) return 1;
  for (int i = 0; i < length; i++) if (scanf("%d", &values[i]) != 1) return 1;
  heap_sort(values, length);
  for (int i = 0; i < length; i++) printf("%d%c", values[i], i + 1 == length ? '\\n' : ' ');
  return 0;
}
`,
      [
        ["5\n4 1 3 2 5\n", "1 2 3 4 5\n"],
        ["6\n3 1 3 2 1 2\n", "1 1 2 2 3 3\n"],
        ["4\n-2 7 0 -5\n", "-5 -2 0 7\n"],
      ],
      [
        [
          "heap-build",
          "bottom-up heap construction",
          "自底向上建堆",
          "heap_sort\\s*\\([^)]*\\)\\s*\\{[\\s\\S]*sift_down\\s*\\(",
        ],
        [
          "heap-suffix",
          "shrinking heap boundary",
          "收缩堆边界",
          "heap_sort\\s*\\([^)]*\\)\\s*\\{[\\s\\S]*(?:end|heap_size)[\\s\\S]*(?:--|-=\\s*1)",
        ],
        [
          "heap-root-swap",
          "root-to-suffix exchange",
          "堆顶与后缀交换",
          "heap_sort\\s*\\([^)]*\\)\\s*\\{[\\s\\S]*swap_int\\s*\\(",
        ],
      ],
    ),
    exercise(
      112,
      `${HEADER}static void growth_counts(int length, long long *best, long long *worst, long long *merge) {
  /* TODO: derive the three comparison-growth models. */
  *best = 0; *worst = 0; *merge = 0;
  (void)length;
}

int main(void) {
  int length = 0; long long best = 0, worst = 0, merge = 0;
  if (scanf("%d", &length) != 1 || length < 1) return 1;
  growth_counts(length, &best, &worst, &merge);
  printf("%lld %lld %lld\\n", best, worst, merge);
  return 0;
}
`,
      [
        ["1\n", "0 0 0\n"],
        ["4\n", "3 6 8\n"],
        ["8\n", "7 28 24\n"],
      ],
      [
        [
          "growth-linear",
          "linear best-case expression",
          "线性最好情况表达式",
          "growth_counts\\s*\\([^)]*\\)\\s*\\{[\\s\\S]*length\\s*-\\s*1",
        ],
        [
          "growth-quadratic",
          "quadratic worst-case expression",
          "二次最坏情况表达式",
          "growth_counts\\s*\\([^)]*\\)\\s*\\{[\\s\\S]*length\\s*\\*\\s*\\(\\s*length\\s*-\\s*1\\s*\\)\\s*/\\s*2",
        ],
        [
          "growth-log-pass",
          "doubling merge passes",
          "归并轮次翻倍",
          "growth_counts\\s*\\([^)]*\\)\\s*\\{[\\s\\S]*(?:width|passes)[\\s\\S]*(?:\\*=\\s*2|\\*\\s*2)",
        ],
      ],
    ),
    exercise(
      113,
      `${HEADER}static int maximum(int left, int right) {
  /* TODO: express the choice with the conditional operator. */
  return left;
}
int main(void) { int left = 0, right = 0; if (scanf("%d%d", &left, &right) != 2) return 1; printf("%d\\n", maximum(left, right)); return 0; }
`,
      [
        ["4 9\n", "9\n"],
        ["12 -3\n", "12\n"],
        ["-8 -2\n", "-2\n"],
      ],
      [
        [
          "conditional-choice",
          "conditional operator",
          "条件运算符",
          "maximum\\s*\\([^)]*\\)\\s*\\{[\\s\\S]*\\?[^:]+:",
        ],
      ],
    ),
    exercise(
      114,
      `${HEADER}static void print_bits(uint8_t value) {
  /* TODO: print exactly eight bits, most-significant first. */
  (void)value;
  puts("00000000");
}
int main(void) { unsigned value = 0; if (scanf("%u", &value) != 1 || value > 255) return 1; print_bits((uint8_t)value); return 0; }
`,
      [
        ["13\n", "00001101\n"],
        ["255\n", "11111111\n"],
        ["128\n", "10000000\n"],
      ],
      [
        [
          "bits-loop",
          "eight-position loop",
          "八位循环",
          "print_bits\\s*\\([^)]*\\)\\s*\\{[\\s\\S]*(?:for|while)\\s*\\(",
        ],
        ["bits-mask", "bit mask test", "位掩码检测", "print_bits\\s*\\([^)]*\\)\\s*\\{[\\s\\S]*&"],
        ["bits-shift", "bit shift", "位移", "print_bits\\s*\\([^)]*\\)\\s*\\{[\\s\\S]*(?:<<|>>)"],
      ],
    ),
    exercise(
      115,
      `${HEADER}static unsigned update_flags(unsigned flags, unsigned set_bit, unsigned clear_bit) {
  /* TODO: set one flag, then clear one flag. */
  return flags;
}
int main(void) { unsigned flags = 0, set_bit = 0, clear_bit = 0; if (scanf("%u%u%u", &flags, &set_bit, &clear_bit) != 3 || set_bit >= 32 || clear_bit >= 32) return 1; printf("%u\\n", update_flags(flags, set_bit, clear_bit)); return 0; }
`,
      [
        ["0 2 0\n", "4\n"],
        ["7 3 1\n", "13\n"],
        ["16 0 4\n", "1\n"],
      ],
      [
        [
          "flags-set",
          "OR-based flag setting",
          "用或设置标志",
          "update_flags\\s*\\([^)]*\\)\\s*\\{[\\s\\S]*(?:\\|=|=.+\\|)",
        ],
        [
          "flags-clear",
          "AND and complement clearing",
          "用与和取反清除标志",
          "update_flags\\s*\\([^)]*\\)\\s*\\{[\\s\\S]*(?:&=|=.+&)[\\s\\S]*~",
        ],
        [
          "flags-shift",
          "bit-position shift",
          "位位置移位",
          "update_flags\\s*\\([^)]*\\)\\s*\\{[\\s\\S]*1u?\\s*<<",
        ],
      ],
    ),
    exercise(
      116,
      `${HEADER}static unsigned extract_field(unsigned packed, unsigned shift, unsigned width) {
  /* TODO: shift the field to bit zero and apply a width-bit mask. */
  (void)shift; (void)width;
  return packed;
}
int main(void) { unsigned packed = 0, shift = 0, width = 0; if (scanf("%u%u%u", &packed, &shift, &width) != 3 || width < 1 || width > 16 || shift + width > 32) return 1; printf("%u\\n", extract_field(packed, shift, width)); return 0; }
`,
      [
        ["43981 8 8\n", "171\n"],
        ["43981 0 4\n", "13\n"],
        ["240 4 4\n", "15\n"],
      ],
      [
        [
          "field-shift",
          "right shift to bit zero",
          "右移到最低位",
          "extract_field\\s*\\([^)]*\\)\\s*\\{[\\s\\S]*packed\\s*>>\\s*shift",
        ],
        [
          "field-mask",
          "width-derived mask",
          "由宽度生成掩码",
          "extract_field\\s*\\([^)]*\\)\\s*\\{[\\s\\S]*(?:1u?|UINT32_C\\(1\\))\\s*<<\\s*width[\\s\\S]*-\\s*1",
        ],
        [
          "field-and",
          "mask application",
          "应用掩码",
          "extract_field\\s*\\([^)]*\\)\\s*\\{[\\s\\S]*&",
        ],
      ],
    ),
    exercise(
      117,
      `${HEADER}static int square_once(int value) {
  /* TODO: evaluate the parameter exactly once and return its square. */
  return value;
}
int main(void) { int value = 0; if (scanf("%d", &value) != 1) return 1; printf("%d\\n", square_once(value)); return 0; }
`,
      [
        ["3\n", "9\n"],
        ["-4\n", "16\n"],
        ["0\n", "0\n"],
      ],
      [
        [
          "single-evaluation-helper",
          "single-evaluation helper body",
          "单次求值辅助函数",
          "square_once\\s*\\([^)]*\\)\\s*\\{[\\s\\S]*return\\s+value\\s*\\*\\s*value",
        ],
      ],
    ),
    exercise(
      118,
      `${HEADER}#define USE_FAST 1
static int transform(int value) {
#if USE_FAST
  /* TODO: provide the selected implementation. */
  return value;
#else
  return value;
#endif
}
int main(void) { int value = 0; if (scanf("%d", &value) != 1) return 1; printf("%d\\n", transform(value)); return 0; }
`,
      [
        ["6\n", "12\n"],
        ["-3\n", "-6\n"],
        ["0\n", "0\n"],
      ],
      [
        [
          "conditional-compile",
          "conditional compilation branch",
          "条件编译分支",
          "#\\s*if\\s+USE_FAST[\\s\\S]*#\\s*else[\\s\\S]*#\\s*endif",
        ],
        [
          "selected-transform",
          "input-dependent selected implementation",
          "依赖输入的选定实现",
          "transform\\s*\\([^)]*\\)\\s*\\{[\\s\\S]*#\\s*if\\s+USE_FAST[\\s\\S]*value\\s*\\*\\s*2",
        ],
      ],
    ),
    exercise(
      119,
      `${HEADER}static int assertions_enabled(void) {
#ifdef NDEBUG
  return 0;
#else
  return 1;
#endif
}

static int checked_value(const int *values, int length, int index) {
  /* TODO: assert the caller's index invariant, then return the selected value. */
  (void)values; (void)length; (void)index;
  return 0;
}

int main(void) {
  int length = 0, index = 0, values[16];
  if (scanf("%d%d", &length, &index) != 2 || length < 1 || length > 16) return 1;
  for (int i = 0; i < length; i++) if (scanf("%d", &values[i]) != 1) return 1;
  if (index < 0 || index >= length) {
    printf("input-error assertions=%s\\n", assertions_enabled() ? "on" : "off");
    return 0;
  }
  printf("safe %d assertions=%s\\n", checked_value(values, length, index), assertions_enabled() ? "on" : "off");
  return 0;
}
`,
      [
        ["3 1\n10 20 30\n", "safe 20 assertions=on\n"],
        ["3 2\n10 20 30\n", "safe 30 assertions=on\n"],
        ["3 3\n10 20 30\n", "input-error assertions=on\n"],
      ],
      [
        [
          "index-invariant",
          "asserted index invariant",
          "断言索引不变量",
          "checked_value\\s*\\([^)]*\\)\\s*\\{[\\s\\S]*assert\\s*\\(\\s*index\\s*>=\\s*0\\s*&&\\s*index\\s*<\\s*length\\s*\\)",
        ],
        [
          "input-index-validation",
          "user-input index validation before the asserted call",
          "在断言调用前验证用户输入索引",
          "main\\s*\\([^)]*\\)\\s*\\{[\\s\\S]*index\\s*<\\s*0\\s*\\|\\|\\s*index\\s*>=\\s*length[\\s\\S]*checked_value\\s*\\(",
        ],
        [
          "indexed-read",
          "read through the proven-safe index",
          "通过已证明安全的索引读取",
          "checked_value\\s*\\([^)]*\\)\\s*\\{[\\s\\S]*return\\s+values\\s*\\[\\s*index\\s*\\]",
        ],
      ],
    ),
    exercise(
      120,
      `${HEADER}static void insertion_sort(int *values, int length) {
  /* TODO: insert each key into the already-sorted prefix. */
  (void)values; (void)length;
}
int main(void) { int length = 0, values[64]; if (scanf("%d", &length) != 1 || length < 1 || length > 64) return 1; for (int i = 0; i < length; i++) if (scanf("%d", &values[i]) != 1) return 1; insertion_sort(values, length); for (int i = 0; i < length; i++) printf("%d%c", values[i], i + 1 == length ? '\\n' : ' '); return 0; }
`,
      [
        ["5\n5 2 4 6 1\n", "1 2 4 5 6\n"],
        ["5\n5 4 3 2 1\n", "1 2 3 4 5\n"],
        ["6\n3 1 3 2 1 2\n", "1 1 2 2 3 3\n"],
      ],
      [
        [
          "insertion-outer",
          "key-selection loop",
          "选择 key 的外层循环",
          "insertion_sort\\s*\\([^)]*\\)\\s*\\{[\\s\\S]*for\\s*\\(",
        ],
        [
          "insertion-shift",
          "right-shift loop",
          "右移循环",
          "insertion_sort\\s*\\([^)]*\\)\\s*\\{[\\s\\S]*while\\s*\\([\\s\\S]*>\\s*key",
        ],
        [
          "insertion-place",
          "key placement",
          "key 放回空槽",
          "insertion_sort\\s*\\([^)]*\\)\\s*\\{[\\s\\S]*values\\s*\\[[^\\]]+\\]\\s*=\\s*key",
        ],
      ],
    ),
  ].map(([order, value]) => [order, value] as const),
);

export function getFoaWorkspaceExercise(order: number): FoaWorkspaceExercise | null {
  return EXERCISES.get(order) ?? null;
}

export function foaWorkspaceSourceContractId(exercise: FoaWorkspaceExercise): string {
  return `foa-source:${exercise.sourceRequirements.map((item) => item.id).join("+")}`;
}

function exercise(
  order: number,
  source: string,
  cases: readonly (readonly [string, string])[],
  requirements: readonly (readonly [string, string, string, string])[],
): readonly [number, FoaWorkspaceExercise] {
  const lessonCases: readonly FoaWorkspaceExerciseCase[] = Object.freeze(
    cases.map(([stdin, stdout], index) =>
      Object.freeze({
        id: `case-${String(index + 1)}`,
        size: index + 1,
        stdin,
        stdout,
        description: foaText(
          `固定验证案例 ${String(index + 1)}`,
          `Fixed verification case ${String(index + 1)}`,
        ),
      }),
    ),
  );
  const sourceRequirements: readonly FoaWorkspaceSourceRequirement[] = Object.freeze(
    requirements.map(([id, en, zh, pattern]) =>
      Object.freeze({ id, label: foaText(zh, en), pattern }),
    ),
  );
  return Object.freeze([
    order,
    Object.freeze({ initialSource: source, cases: lessonCases, sourceRequirements }),
  ]);
}

export function assertFoaWorkspaceExerciseCatalog(): void {
  if (EXERCISES.size !== 15)
    throw new RangeError("FOA workspace exercise catalog must contain 15 lessons");
  for (let order = 106; order <= 120; order += 1) {
    const value = EXERCISES.get(order);
    if (value === undefined)
      throw new RangeError(`Missing FOA workspace exercise ${String(order)}`);
    if (value.cases.length < 3)
      throw new RangeError(`FOA workspace exercise ${String(order)} needs at least three cases`);
    if (value.sourceRequirements.length === 0)
      throw new RangeError(`FOA workspace exercise ${String(order)} needs source requirements`);
    for (const requirement of value.sourceRequirements) new RegExp(requirement.pattern, "u");
  }
}

assertFoaWorkspaceExerciseCatalog();
