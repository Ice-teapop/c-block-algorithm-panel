import { foaText, type FoaLocalizedText } from "./foa-contracts.js";

export type TextbookRuntimeMechanism =
  | "input-square"
  | "euclid-loop"
  | "factorial-stack"
  | "insertion-adjacent-swap"
  | "linked-list-insert";

export type TextbookRuntimeEventKind =
  "input" | "bind" | "compare" | "update" | "call" | "return" | "allocate" | "link" | "output";

export interface TextbookRuntimeEvent {
  readonly id: string;
  readonly kind: TextbookRuntimeEventKind;
  readonly label: FoaLocalizedText;
  readonly state: Readonly<Record<string, string | number | boolean | readonly number[]>>;
  readonly activeIndices: readonly number[];
}

export interface TextbookRuntimeTimeline {
  readonly mechanism: TextbookRuntimeMechanism;
  readonly events: readonly TextbookRuntimeEvent[];
}

export function createInputSquareTimeline(value: number): TextbookRuntimeTimeline {
  assertSafeInteger(value, "value");
  const result = value * value;
  if (!Number.isSafeInteger(result)) throw new RangeError("平方结果超出安全整数范围");
  return timeline("input-square", [
    event("input", "input", `输入 ${String(value)}`, `Input ${String(value)}`, { input: value }),
    event("bind", "bind", `value=${String(value)}`, `value=${String(value)}`, { value }),
    event("square", "update", `计算 ${String(result)}`, `Compute ${String(result)}`, {
      value,
      result,
    }),
    event("output", "output", `输出 ${String(result)}`, `Write ${String(result)}`, { result }),
  ]);
}

export function createEuclidTimeline(left: number, right: number): TextbookRuntimeTimeline {
  assertPositiveInteger(left, "a");
  assertPositiveInteger(right, "b");
  const events: TextbookRuntimeEvent[] = [
    event(
      "input",
      "input",
      `输入 (${String(left)}, ${String(right)})`,
      `Input (${String(left)}, ${String(right)})`,
      {
        a: left,
        b: right,
      },
    ),
  ];
  let iteration = 0;
  while (right !== 0) {
    const remainder = left % right;
    iteration += 1;
    events.push(
      event(
        `remainder-${String(iteration)}`,
        "compare",
        `${String(left)} % ${String(right)} = ${String(remainder)}`,
        `${String(left)} % ${String(right)} = ${String(remainder)}`,
        { a: left, b: right, remainder, iteration },
      ),
    );
    left = right;
    right = remainder;
    events.push(
      event(
        `rotate-${String(iteration)}`,
        "update",
        `轮换为 (${String(left)}, ${String(right)})`,
        `Rotate to (${String(left)}, ${String(right)})`,
        { a: left, b: right, iteration },
      ),
    );
  }
  events.push(
    event("output", "output", `输出 gcd=${String(left)}`, `Write gcd=${String(left)}`, {
      gcd: left,
    }),
  );
  return timeline("euclid-loop", events);
}

export function createFactorialTimeline(value: number): TextbookRuntimeTimeline {
  if (!Number.isSafeInteger(value) || value < 0 || value > 12) {
    throw new RangeError("factorial n 必须是 0 到 12 的整数");
  }
  const events: TextbookRuntimeEvent[] = [];
  const bottom = value <= 1 ? value : 1;
  for (let current = value; current >= bottom; current -= 1) {
    events.push(
      event(
        `call-${String(current)}`,
        "call",
        `进入 factorial(${String(current)})`,
        `Enter factorial(${String(current)})`,
        { n: current, depth: value - current + 1 },
      ),
    );
  }
  let product = 1;
  events.push(event("base", "return", "基例返回 1", "Base case returns 1", { n: bottom, product }));
  for (let current = 2; current <= value; current += 1) {
    product *= current;
    events.push(
      event(
        `return-${String(current)}`,
        "return",
        `回卷：×${String(current)} = ${String(product)}`,
        `Unwind: ×${String(current)} = ${String(product)}`,
        { n: current, product },
      ),
    );
  }
  events.push(
    event("output", "output", `输出 ${String(product)}`, `Write ${String(product)}`, { product }),
  );
  return timeline("factorial-stack", events);
}

export function createTextbookInsertionTimeline(input: readonly number[]): TextbookRuntimeTimeline {
  assertSequence(input, 1, 256);
  const values = [...input];
  const events: TextbookRuntimeEvent[] = [
    event("input", "input", `输入 ${values.join(" ")}`, `Input ${values.join(" ")}`, {
      values: [...values],
    }),
  ];
  for (let outer = 1; outer < values.length; outer += 1) {
    let cursor = outer;
    while (cursor > 0) {
      const shouldSwap = values[cursor - 1]! > values[cursor]!;
      events.push(
        event(
          `compare-${String(outer)}-${String(cursor)}`,
          "compare",
          `比较 ${String(values[cursor - 1])} > ${String(values[cursor])}`,
          `Compare ${String(values[cursor - 1])} > ${String(values[cursor])}`,
          { values: [...values], outer, cursor, shouldSwap },
          [cursor - 1, cursor],
        ),
      );
      if (!shouldSwap) break;
      const temporary = values[cursor - 1]!;
      values[cursor - 1] = values[cursor]!;
      values[cursor] = temporary;
      events.push(
        event(
          `swap-${String(outer)}-${String(cursor)}`,
          "update",
          `交换槽位 ${String(cursor - 1)} 与 ${String(cursor)}`,
          `Swap slots ${String(cursor - 1)} and ${String(cursor)}`,
          { values: [...values], outer, cursor: cursor - 1 },
          [cursor - 1, cursor],
        ),
      );
      cursor -= 1;
    }
  }
  events.push(
    event("output", "output", `输出 ${values.join(" ")}`, `Write ${values.join(" ")}`, {
      values: [...values],
    }),
  );
  return timeline("insertion-adjacent-swap", events);
}

export function createLinkedListInsertionTimeline(
  input: readonly number[],
  insertIndex: number,
  insertedValue: number,
): TextbookRuntimeTimeline {
  assertSequence(input, 0, 64);
  if (!Number.isSafeInteger(insertIndex) || insertIndex < 0 || insertIndex > input.length) {
    throw new RangeError("链表插入位置必须位于 0..length");
  }
  assertSafeInteger(insertedValue, "insertedValue");
  const events: TextbookRuntimeEvent[] = [
    event(
      "input",
      "input",
      `链表 ${input.join(" → ") || "∅"}`,
      `List ${input.join(" → ") || "∅"}`,
      {
        values: [...input],
        insertIndex,
        insertedValue,
      },
    ),
  ];
  for (let index = 0; index < insertIndex; index += 1) {
    events.push(
      event(
        `traverse-${String(index)}`,
        "compare",
        `游标经过索引 ${String(index)}`,
        `Cursor visits index ${String(index)}`,
        { values: [...input], cursor: index },
        [index],
      ),
    );
  }
  events.push(
    event(
      "allocate",
      "allocate",
      `分配值 ${String(insertedValue)} 的节点`,
      `Allocate node ${String(insertedValue)}`,
      {
        insertedValue,
      },
    ),
    event("link-next", "link", "新节点 next 指向后继", "Point new.next to the successor", {
      successorIndex: insertIndex < input.length ? insertIndex : -1,
    }),
    event(
      "link-owner",
      "link",
      "前驱或 head 指向新节点",
      "Point predecessor or head to the new node",
      {
        ownerIndex: insertIndex - 1,
      },
    ),
  );
  const result = [...input.slice(0, insertIndex), insertedValue, ...input.slice(insertIndex)];
  events.push(
    event("output", "output", `链表 ${result.join(" → ")}`, `List ${result.join(" → ")}`, {
      values: result,
    }),
  );
  return timeline("linked-list-insert", events);
}

function timeline(
  mechanism: TextbookRuntimeMechanism,
  events: readonly TextbookRuntimeEvent[],
): TextbookRuntimeTimeline {
  if (events.length < 2) throw new RangeError("教材运行时间线至少需要两个事件");
  return Object.freeze({ mechanism, events: Object.freeze([...events]) });
}

function event(
  id: string,
  kind: TextbookRuntimeEventKind,
  zh: string,
  en: string,
  state: Readonly<Record<string, string | number | boolean | readonly number[]>>,
  activeIndices: readonly number[] = [],
): TextbookRuntimeEvent {
  return Object.freeze({
    id,
    kind,
    label: foaText(zh, en),
    state: Object.freeze(
      Object.fromEntries(
        Object.entries(state).map(([key, value]) => [
          key,
          Array.isArray(value) ? Object.freeze([...value]) : value,
        ]),
      ),
    ),
    activeIndices: Object.freeze([...activeIndices]),
  });
}

function assertSequence(values: readonly number[], minimum: number, maximum: number): void {
  if (!Array.isArray(values) || values.length < minimum || values.length > maximum) {
    throw new RangeError(`序列长度必须位于 ${String(minimum)}..${String(maximum)}`);
  }
  values.forEach((value, index) => assertSafeInteger(value, `values[${String(index)}]`));
}

function assertPositiveInteger(value: number, label: string): void {
  assertSafeInteger(value, label);
  if (value <= 0) throw new RangeError(`${label} 必须是正整数`);
}

function assertSafeInteger(value: number, label: string): void {
  if (!Number.isSafeInteger(value)) throw new RangeError(`${label} 必须是安全整数`);
}
