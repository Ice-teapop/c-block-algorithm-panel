import type {
  AlgorithmScenarioDefinition,
  AlgorithmScenarioFamily,
  ScenarioProvider,
  ScenarioRunCase,
} from "./contracts.js";

type CaseGenerator = (size: number) => Omit<ScenarioRunCase, "scenarioId" | "scenarioVersion">;

interface ScenarioSeed {
  readonly id: string;
  readonly family: AlgorithmScenarioFamily;
  readonly label: string;
  readonly description: string;
  readonly minimum: number;
  readonly maximum: number;
  readonly defaultSizes: readonly number[];
  readonly inputModel: string;
  readonly generate: CaseGenerator;
}

const VERSION = "1.0.0";

type SortingInputShape = "random" | "sorted" | "reverse" | "duplicates";

const SEEDS: readonly ScenarioSeed[] = Object.freeze([
  seed(
    "scenario.sorting.integers",
    "sorting",
    "整数排序",
    "读取一组逆序整数并输出升序结果。",
    1,
    256,
    [8, 32, 128],
    "第一项是 n，随后 n 个逆序整数。",
    (size) => {
      const values = descending(size);
      return runCase(
        size,
        `${String(size)}\n${values.join(" ")}\n`,
        `${ascending(size).join(" ")}\n`,
      );
    },
  ),
  ...sortingScenarioSeeds("insertion", "插入排序"),
  ...sortingScenarioSeeds("quick", "快速排序"),
  ...sortingScenarioSeeds("merge", "归并排序"),
  seed(
    "scenario.searching.linear",
    "searching",
    "线性搜索",
    "在递增整数序列中搜索最后一个元素。",
    1,
    1024,
    [16, 128, 512],
    "第一行是 n 与目标值，第二行是 n 个递增整数。",
    (size) => {
      const values = ascending(size);
      const target = values.at(-1) ?? 0;
      return runCase(
        size,
        `${String(size)} ${String(target)}\n${values.join(" ")}\n`,
        `${String(size - 1)}\n`,
      );
    },
  ),
  seed(
    "scenario.searching.maximum",
    "searching",
    "线性扫描最大值",
    "线性扫描一组含负数的整数并输出最大值。",
    1,
    1024,
    [8, 32, 128],
    "第一项是 count，随后是 count 个整数。",
    (size) => {
      const values = maximumScanValues(size);
      return runCase(
        size,
        `${String(size)}\n${values.join(" ")}\n`,
        `${String(maximumOf(values))}\n`,
      );
    },
  ),
  seed(
    "scenario.searching.minimum",
    "searching",
    "线性扫描最小值",
    "线性扫描一组含正负数的整数并输出最小值。",
    1,
    1024,
    [8, 32, 128],
    "第一项是 count，随后是 count 个整数。",
    (size) => {
      const values = maximumScanValues(size);
      return runCase(
        size,
        `${String(size)}\n${values.join(" ")}\n`,
        `${String(minimumOf(values))}\n`,
      );
    },
  ),
  seed(
    "scenario.recursion.factorial",
    "recursion",
    "递归阶乘",
    "计算小规模非负整数的阶乘。",
    1,
    12,
    [4, 8, 12],
    "stdin 只包含 n；范围限制避免整数样例溢出。",
    (size) => runCase(size, `${String(size)}\n`, `${String(factorial(size))}\n`),
  ),
  seed(
    "scenario.linked-list.reverse",
    "linked-list",
    "链表逆序遍历",
    "按输入顺序建立链表，并输出逆序遍历结果。",
    1,
    256,
    [8, 32, 128],
    "第一项是节点数，随后是节点值。",
    (size) => {
      const values = ascending(size);
      return runCase(
        size,
        `${String(size)}\n${values.join(" ")}\n`,
        `${[...values].reverse().join(" ")}\n`,
      );
    },
  ),
  seed(
    "scenario.tree.inorder",
    "tree",
    "二叉搜索树中序遍历",
    "按给定顺序插入不同键，并输出中序遍历。",
    1,
    255,
    [7, 31, 127],
    "第一项是键数，随后使用确定性交错顺序给出不同整数键。",
    (size) => {
      const values = interleaved(size);
      return runCase(
        size,
        `${String(size)}\n${values.join(" ")}\n`,
        `${ascending(size).join(" ")}\n`,
      );
    },
  ),
  seed(
    "scenario.graph.bfs-chain",
    "graph",
    "链式图 BFS",
    "从 0 开始广度优先遍历一条无向链。",
    1,
    512,
    [8, 64, 256],
    "第一行是顶点数与边数，随后每行一条无向边。",
    (size) => {
      const edges = Array.from(
        { length: Math.max(0, size - 1) },
        (_, index) => `${String(index)} ${String(index + 1)}`,
      );
      const stdin = `${String(size)} ${String(edges.length)}\n${edges.join("\n")}${edges.length > 0 ? "\n" : ""}`;
      const traversal = Array.from({ length: size }, (_, index) => index);
      return runCase(size, stdin, `${traversal.join(" ")}\n`);
    },
  ),
  seed(
    "scenario.dynamic-programming.fibonacci",
    "dynamic-programming",
    "动态规划 Fibonacci",
    "自底向上计算 Fibonacci 数列。",
    1,
    46,
    [8, 24, 40],
    "stdin 只包含 n；最大值适配 32 位有符号示例。",
    (size) => runCase(size, `${String(size)}\n`, `${String(fibonacci(size))}\n`),
  ),
]);

const DEFINITIONS: readonly AlgorithmScenarioDefinition[] = Object.freeze(
  SEEDS.map((entry) =>
    Object.freeze({
      id: entry.id,
      version: VERSION,
      family: entry.family,
      label: entry.label,
      description: entry.description,
      example: generate(entry, entry.defaultSizes[0] ?? entry.minimum),
      sizeGenerator: Object.freeze({
        minimum: entry.minimum,
        maximum: entry.maximum,
        defaultSizes: Object.freeze([...entry.defaultSizes]),
        ...(isScanExtremaScenario(entry.id)
          ? { caseSizes: Object.freeze([5, 4, 1, ...entry.defaultSizes]) }
          : {}),
        inputModel: entry.inputModel,
      }),
    }),
  ),
);

export const BUILTIN_ALGORITHM_SCENARIOS = DEFINITIONS;

export function createBuiltinScenarioProvider(): ScenarioProvider {
  const byId = new Map(DEFINITIONS.map((definition) => [definition.id, definition]));
  const seedById = new Map(SEEDS.map((entry) => [entry.id, entry]));
  return Object.freeze({
    id: "builtin.local-scenarios",
    version: VERSION,
    networkAccess: "none",
    list: () => DEFINITIONS,
    get(id: string): AlgorithmScenarioDefinition | null {
      return byId.get(id) ?? null;
    },
    generate(id: string, size: number): ScenarioRunCase {
      const entry = seedById.get(id);
      if (entry === undefined) throw new RangeError(`未知算法情景：${id}`);
      if (!Number.isSafeInteger(size) || size < entry.minimum || size > entry.maximum) {
        throw new RangeError(
          `情景 ${id} 的 size 必须在 ${String(entry.minimum)} 到 ${String(entry.maximum)} 之间`,
        );
      }
      return generate(entry, size);
    },
  });
}

function seed(
  id: string,
  family: AlgorithmScenarioFamily,
  label: string,
  description: string,
  minimum: number,
  maximum: number,
  defaultSizes: readonly number[],
  inputModel: string,
  generateCase: CaseGenerator,
): ScenarioSeed {
  return Object.freeze({
    id,
    family,
    label,
    description,
    minimum,
    maximum,
    defaultSizes: Object.freeze([...defaultSizes]),
    inputModel,
    generate: generateCase,
  });
}

function isScanExtremaScenario(id: string): boolean {
  return id === "scenario.searching.maximum" || id === "scenario.searching.minimum";
}

function generate(entry: ScenarioSeed, size: number): ScenarioRunCase {
  const generated = entry.generate(size);
  return Object.freeze({
    scenarioId: entry.id,
    scenarioVersion: VERSION,
    size,
    stdin: generated.stdin,
    arguments: Object.freeze([...generated.arguments]),
    expected: Object.freeze({ ...generated.expected }),
  });
}

function runCase(
  size: number,
  stdin: string,
  stdout: string,
): Omit<ScenarioRunCase, "scenarioId" | "scenarioVersion"> {
  return {
    size,
    stdin,
    arguments: Object.freeze([]),
    expected: Object.freeze({
      stdout,
      explanation: "输出必须与该确定性情景的预期结果逐字节一致。",
    }),
  };
}

function ascending(size: number): number[] {
  return Array.from({ length: size }, (_, index) => index + 1);
}

function descending(size: number): number[] {
  return ascending(size).reverse();
}

function sortingScenarioSeeds(
  algorithm: "insertion" | "quick" | "merge",
  algorithmLabel: string,
): readonly ScenarioSeed[] {
  const shapes: readonly SortingInputShape[] = ["random", "sorted", "reverse", "duplicates"];
  return Object.freeze(
    shapes.map((shape) => {
      const suffix = shape === "random" ? "" : `.${shape}`;
      const shapeLabel = sortingShapeLabel(shape);
      return seed(
        `scenario.sorting.${algorithm}${suffix}`,
        "sorting",
        `${algorithmLabel} · ${shapeLabel}`,
        `使用${shapeLabel}输入核对${algorithmLabel}输出，并把该输入分布与其他 Benchmark cohort 分开。`,
        1,
        256,
        [8, 32, 128],
        `第一项是 n，随后 n 个${shapeLabel}整数；输出为升序整数。`,
        (size) => {
          const values = sortingValues(size, shape);
          return runCase(
            size,
            `${String(size)}\n${values.join(" ")}\n`,
            `${[...values].sort((left, right) => left - right).join(" ")}\n`,
          );
        },
      );
    }),
  );
}

function sortingShapeLabel(shape: SortingInputShape): string {
  if (shape === "sorted") return "已排序";
  if (shape === "reverse") return "逆序";
  if (shape === "duplicates") return "重复值";
  return "确定性随机";
}

function sortingValues(size: number, shape: SortingInputShape): number[] {
  if (shape === "sorted") return ascending(size);
  if (shape === "reverse") return descending(size);
  if (shape === "duplicates") {
    const distinct = Math.max(2, Math.min(7, Math.ceil(Math.sqrt(size))));
    return Array.from({ length: size }, (_, index) => index % distinct).reverse();
  }
  const values = ascending(size);
  let state = (size * 2_654_435_761) >>> 0;
  for (let index = values.length - 1; index > 0; index -= 1) {
    state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
    const target = state % (index + 1);
    const previous = values[index]!;
    values[index] = values[target]!;
    values[target] = previous;
  }
  return values;
}

/** Alternates record-setting values with lower negatives to exercise both comparison outcomes. */
function maximumScanValues(size: number): number[] {
  if (size === 1) return [42];
  if (size === 4) return [-9, -4, -12, -7];
  if (size === 5) return [3, 8, 2, 7, 4];
  return Array.from({ length: size }, (_, index) =>
    index === 0 || index % 2 === 0 ? -size - index : index,
  );
}

function maximumOf(values: readonly number[]): number {
  const first = values[0];
  if (first === undefined) throw new RangeError("最大值案例至少需要一个整数");
  return values.slice(1).reduce((maximum, value) => Math.max(maximum, value), first);
}

function minimumOf(values: readonly number[]): number {
  const first = values[0];
  if (first === undefined) throw new RangeError("最小值案例至少需要一个整数");
  return values.slice(1).reduce((minimum, value) => Math.min(minimum, value), first);
}

function interleaved(size: number): number[] {
  const result: number[] = [];
  const visit = (from: number, to: number): void => {
    if (from > to) return;
    const middle = Math.floor((from + to) / 2);
    result.push(middle);
    visit(from, middle - 1);
    visit(middle + 1, to);
  };
  visit(1, size);
  return result;
}

function factorial(value: number): number {
  let result = 1;
  for (let current = 2; current <= value; current += 1) result *= current;
  return result;
}

function fibonacci(value: number): number {
  let previous = 0;
  let current = 1;
  for (let index = 0; index < value; index += 1) {
    const next = previous + current;
    previous = current;
    current = next;
  }
  return previous;
}
