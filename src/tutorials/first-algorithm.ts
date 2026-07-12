export interface FirstAlgorithmCase {
  readonly id: "normal" | "negative" | "single";
  readonly label: string;
  readonly stdin: string;
  readonly stdout: string;
  readonly purpose: string;
}

export const FIRST_ALGORITHM_TITLE = "逐项扫描找最大值";

export const FIRST_ALGORITHM_PSEUDOCODE = [
  "先把第一个数当作当前最大值",
  "从第二个数开始逐个读取",
  "如果新数更大，就更新当前最大值",
  "扫描结束后输出最大值",
].join("\n");

export const FIRST_ALGORITHM_SOURCE = `#include <stdio.h>

int main(void) {
  int count;
  if (scanf("%d", &count) != 1 || count <= 0) {
    return 1;
  }

  int maximum;
  if (scanf("%d", &maximum) != 1) {
    return 1;
  }

  for (int i = 1; i < count; i++) {
    int value;
    if (scanf("%d", &value) != 1) {
      return 1;
    }
    if (value > maximum) {
      maximum = value;
    }
  }

  printf("%d\\n", maximum);
  return 0;
}
`;

export const FIRST_ALGORITHM_BUG = Object.freeze({
  wrong: "if (value < maximum)",
  reason: "比较方向写反后，程序会在遇到更小的值时更新，最后得到的更接近最小值。",
  fix: "恢复 `value > maximum`，只在新输入更大时更新 maximum。",
});

export const FIRST_ALGORITHM_CASES: readonly FirstAlgorithmCase[] = Object.freeze([
  Object.freeze({
    id: "normal",
    label: "普通输入",
    stdin: "5\n3 8 2 7 4\n",
    stdout: "8\n",
    purpose: "最大值位于中间，能确认循环和更新分支都执行。",
  }),
  Object.freeze({
    id: "negative",
    label: "全负数输入",
    stdin: "4\n-9 -4 -12 -7\n",
    stdout: "-4\n",
    purpose: "专门暴露把 maximum 错误初始化为 0 的逻辑缺陷。",
  }),
  Object.freeze({
    id: "single",
    label: "单元素输入",
    stdin: "1\n42\n",
    stdout: "42\n",
    purpose: "循环不执行时，初始化结果仍应直接成为答案。",
  }),
]);

export function firstAlgorithmCase(id: FirstAlgorithmCase["id"]): FirstAlgorithmCase {
  const item = FIRST_ALGORITHM_CASES.find((candidate) => candidate.id === id);
  if (item === undefined) throw new RangeError(`未知首个算法案例：${id}`);
  return item;
}
