const COMPLETIONS: ReadonlyMap<number, readonly [string, string]> = new Map([
  [
    106,
    [
      `  /* TODO: move values smaller than pivot before store, then place pivot. */
  (void)pivot;
  return store;`,
      `  for (int index = 0; index < length - 1; index++) {
    if (values[index] < pivot) {
      swap_int(&values[index], &values[store]);
      store++;
    }
  }
  swap_int(&values[store], &values[length - 1]);
  return store;`,
    ],
  ],
  [
    107,
    [
      `  /* TODO: build the less-than, equal, and greater-than regions. */
  (void)values; (void)pivot; (void)current;
  *low_end = low;
  *high_start = high;`,
      `  while (current <= high) {
    if (values[current] < pivot) {
      swap_int(&values[low], &values[current]);
      low++;
      current++;
    } else if (values[current] > pivot) {
      swap_int(&values[current], &values[high]);
      high--;
    } else {
      current++;
    }
  }
  *low_end = low;
  *high_start = high;`,
    ],
  ],
  [
    108,
    [
      `  /* TODO: merge both sorted inputs while preserving equal-value order. */
  for (int i = 0; i < left_count + right_count; i++) output[i] = 0;`,
      `  int left_index = 0, right_index = 0, output_index = 0;
  while (left_index < left_count && right_index < right_count) {
    if (left[left_index] <= right[right_index]) {
      output[output_index++] = left[left_index++];
    } else {
      output[output_index++] = right[right_index++];
    }
  }
  while (left_index < left_count) output[output_index++] = left[left_index++];
  while (right_index < right_count) output[output_index++] = right[right_index++];`,
    ],
  ],
  [
    109,
    [
      `  /* TODO: implement bottom-up merge sort with run widths 1, 2, 4, ... */
  (void)values; (void)length;`,
      `  int temporary[64];
  for (int width = 1; width < length; width *= 2) {
    for (int start = 0; start < length; start += width * 2) {
      int middle = start + width < length ? start + width : length;
      int end = start + width * 2 < length ? start + width * 2 : length;
      int left = start, right = middle, output = start;
      while (left < middle && right < end) {
        temporary[output++] = values[left] <= values[right] ? values[left++] : values[right++];
      }
      while (left < middle) temporary[output++] = values[left++];
      while (right < end) temporary[output++] = values[right++];
    }
    for (int index = 0; index < length; index++) values[index] = temporary[index];
  }`,
    ],
  ],
  [
    110,
    [
      `  /* TODO: repeatedly exchange root with its larger child when required. */
  (void)heap; (void)length; (void)root;`,
      `  for (;;) {
    int child = root * 2 + 1;
    if (child >= length) return;
    if (child + 1 < length && heap[child + 1] > heap[child]) child++;
    if (heap[root] >= heap[child]) return;
    swap_int(&heap[root], &heap[child]);
    root = child;
  }`,
    ],
  ],
  [
    111,
    [
      `  /* TODO: build the heap, then grow the sorted suffix. */
  (void)values; (void)length;`,
      `  for (int root = length / 2 - 1; root >= 0; root--) sift_down(values, length, root);
  for (int end = length - 1; end > 0; end--) {
    swap_int(&values[0], &values[end]);
    sift_down(values, end, 0);
  }`,
    ],
  ],
  [
    112,
    [
      `  /* TODO: derive the three comparison-growth models. */
  *best = 0; *worst = 0; *merge = 0;
  (void)length;`,
      `  *best = length - 1;
  *worst = (long long)length * (length - 1) / 2;
  *merge = 0;
  for (long long width = 1; width < length; width *= 2) {
    *merge += length;
    if (width > length / 2) break;
  }`,
    ],
  ],
  [
    113,
    [
      `  /* TODO: express the choice with the conditional operator. */
  return left;`,
      `  return left > right ? left : right;`,
    ],
  ],
  [
    114,
    [
      `  /* TODO: print exactly eight bits, most-significant first. */
  (void)value;
  puts("00000000");`,
      `  for (int bit = 7; bit >= 0; bit--) {
    putchar((value & (uint8_t)(1u << bit)) != 0 ? '1' : '0');
  }
  putchar('\\n');`,
    ],
  ],
  [
    115,
    [
      `  /* TODO: set one flag, then clear one flag. */
  return flags;`,
      `  flags |= 1u << set_bit;
  flags &= ~(1u << clear_bit);
  return flags;`,
    ],
  ],
  [
    116,
    [
      `  /* TODO: shift the field to bit zero and apply a width-bit mask. */
  (void)shift; (void)width;
  return packed;`,
      `  unsigned mask = (1u << width) - 1u;
  return (packed >> shift) & mask;`,
    ],
  ],
  [
    117,
    [
      `  /* TODO: evaluate the parameter exactly once and return its square. */
  return value;`,
      `  return value * value;`,
    ],
  ],
  [
    118,
    [
      `  /* TODO: provide the selected implementation. */
  return value;`,
      `  return value * 2;`,
    ],
  ],
  [
    119,
    [
      `  /* TODO: assert the caller's index invariant, then return the selected value. */
  (void)values; (void)length; (void)index;
  return 0;`,
      `  assert(index >= 0 && index < length);
  return values[index];`,
    ],
  ],
  [
    120,
    [
      `  /* TODO: insert each key into the already-sorted prefix. */
  (void)values; (void)length;`,
      `  for (int index = 1; index < length; index++) {
    int key = values[index];
    int position = index;
    while (position > 0 && values[position - 1] > key) {
      values[position] = values[position - 1];
      position--;
    }
    values[position] = key;
  }`,
    ],
  ],
]);

export function createFoaWorkspaceCanonicalSolution(order: number, scaffold: string): string {
  const completion = COMPLETIONS.get(order);
  if (completion === undefined) {
    throw new RangeError(`Missing canonical FOA workspace completion ${String(order)}`);
  }
  const [placeholder, implementation] = completion;
  if (!scaffold.includes(placeholder)) {
    throw new Error(`FOA workspace scaffold ${String(order)} no longer matches its test fixture`);
  }
  const source = scaffold.replace(placeholder, implementation);
  if (source.includes("TODO:")) {
    throw new Error(`FOA workspace completion ${String(order)} still contains an unresolved TODO`);
  }
  return source;
}
