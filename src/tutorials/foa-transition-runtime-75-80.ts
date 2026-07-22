import type { TraceObservationProfileId } from "../shared/trace.js";
import { foaText, type FoaLocalizedText } from "./foa-contracts.js";

export const FOA_TRANSITION_RUNTIME_75_80_ORDERS = Object.freeze([75, 80] as const);

export type FoaTransitionRuntime7580Order = (typeof FOA_TRANSITION_RUNTIME_75_80_ORDERS)[number];

export type FoaTransitionRuntime7580EventKind =
  "call-enter" | "call-exit" | "dependency-read" | "array-write" | "cell-skip" | "output";

export interface FoaTransitionTeachingProvenance {
  readonly kind: "teaching-model";
  readonly lessonId: string;
  readonly caseId: string;
  readonly notice: FoaLocalizedText;
}

export interface FoaTransitionRuntime7580RealTraceProvenance {
  readonly kind: "real-trace";
  readonly lessonId: string;
  readonly caseId: string;
  readonly sessionId: string;
  readonly sourceFingerprint: string;
  readonly inputDigest: string;
  readonly inputFingerprint: string;
  readonly observationProfileId: TraceObservationProfileId;
  readonly observationAuthorizationDigest: string;
  readonly notice: FoaLocalizedText;
}

export type FoaTransitionRuntime7580Provenance =
  FoaTransitionTeachingProvenance | FoaTransitionRuntime7580RealTraceProvenance;

/**
 * An exact, author-owned source slice that a future shadow-Trace probe may target. The slice must
 * occur exactly once in the lesson source. This model never turns an anchor into runtime proof by
 * itself; only the main-process Trace pipeline may do that.
 */
export interface FoaTransitionSourceAnchor {
  readonly id: string;
  readonly exact: string;
  readonly allowedTraceKinds: readonly FoaTransitionRuntime7580EventKind[];
}

export interface FoaTransitionStackFrame {
  readonly frameId: string;
  readonly functionName: "moves";
  readonly depth: number;
  readonly argument: number;
  readonly returnValue: number | null;
}

export interface FoaTransitionCell {
  readonly row: number;
  readonly column: number;
}

export interface FoaTransitionDependency {
  readonly from: FoaTransitionCell;
  readonly to: FoaTransitionCell;
  readonly value: number;
}

export interface FoaTransitionRuntime7580Event {
  readonly id: string;
  readonly sequence: number;
  readonly kind: FoaTransitionRuntime7580EventKind;
  readonly sourceAnchorId: string;
  readonly label: FoaLocalizedText;
  readonly stackFrames: readonly FoaTransitionStackFrame[];
  readonly activeFrameId: string | null;
  readonly matrix: readonly (readonly number[])[];
  readonly activeCell: FoaTransitionCell | null;
  readonly dependencies: readonly FoaTransitionDependency[];
  readonly output: string | null;
}

export interface FoaTransitionRuntime7580Timeline {
  readonly lessonOrder: FoaTransitionRuntime7580Order;
  readonly provenance: FoaTransitionRuntime7580Provenance;
  readonly verification: "simulation-only" | "real-trace";
  readonly anchors: readonly FoaTransitionSourceAnchor[];
  readonly events: readonly FoaTransitionRuntime7580Event[];
  readonly stdout: string;
}

export const FOA_LESSON_80_DEFAULT_OPEN_GRID: readonly (readonly number[])[] = deepFreezeMatrix([
  [1, 1, 0],
  [0, 1, 1],
  [0, 0, 1],
]);

const TEACHING_NOTICE = foaText(
  "教学推演：状态由课程模型计算，不代表本次 C 程序已被真实探测。",
  "Teaching simulation: state is computed by the lesson model and is not proof that this C run was probed.",
);

const LESSON_75_ANCHORS: readonly FoaTransitionSourceAnchor[] = anchors([
  {
    id: "lesson-75.moves-definition",
    exact: "static int moves(int disks) {",
    allowedTraceKinds: ["call-enter", "call-exit"],
  },
  {
    id: "lesson-75.output",
    exact: 'printf("%d\\n", result);',
    allowedTraceKinds: ["output"],
  },
]);

const LESSON_80_ANCHORS: readonly FoaTransitionSourceAnchor[] = anchors([
  {
    id: "lesson-80.start-write",
    exact: "paths[0][0] = 1;",
    allowedTraceKinds: ["array-write"],
  },
  {
    id: "lesson-80.open-cell",
    exact: "if (open[r][c] == 0) {",
    allowedTraceKinds: ["cell-skip"],
  },
  {
    id: "lesson-80.from-above",
    exact: "paths[r][c] += paths[r - 1][c];",
    allowedTraceKinds: ["dependency-read", "array-write"],
  },
  {
    id: "lesson-80.from-left",
    exact: "paths[r][c] += paths[r][c - 1];",
    allowedTraceKinds: ["dependency-read", "array-write"],
  },
  {
    id: "lesson-80.output",
    exact: 'printf("%d\\n", paths[2][2]);',
    allowedTraceKinds: ["output"],
  },
]);

/** Builds the authored call-stack simulation for lesson 75. */
export function createFoaTransitionRuntime75(disks = 4): FoaTransitionRuntime7580Timeline {
  assertIntegerInRange(disks, 0, 12, "disks");
  const events: FoaTransitionRuntime7580Event[] = [];
  const stack: FoaTransitionStackFrame[] = [];

  for (let argument = disks, depth = 0; argument >= 0; argument -= 1, depth += 1) {
    const frame = stackFrame(depth, argument, null);
    stack.push(frame);
    events.push(
      runtimeEvent({
        id: `lesson-75.call-enter.${String(depth)}`,
        kind: "call-enter",
        sourceAnchorId: "lesson-75.moves-definition",
        label: foaText(`进入 moves(${String(argument)})`, `Enter moves(${String(argument)})`),
        stackFrames: stack,
        activeFrameId: frame.frameId,
      }),
    );
  }

  let result = 0;
  for (let depth = disks; depth >= 0; depth -= 1) {
    const argument = disks - depth;
    if (argument > 0) result = 2 * result + 1;
    const returningStack = stack.map((frame) =>
      frame.depth === depth ? stackFrame(frame.depth, frame.argument, result) : frame,
    );
    const active = returningStack[depth]!;
    events.push(
      runtimeEvent({
        id: `lesson-75.call-exit.${String(depth)}`,
        kind: "call-exit",
        sourceAnchorId: "lesson-75.moves-definition",
        label:
          argument === 0
            ? foaText("基例返回 0", "Base case returns 0")
            : foaText(
                `moves(${String(argument)}) 返回 ${String(result)}`,
                `moves(${String(argument)}) returns ${String(result)}`,
              ),
        stackFrames: returningStack,
        activeFrameId: active.frameId,
      }),
    );
    stack.pop();
  }

  events.push(
    runtimeEvent({
      id: "lesson-75.output",
      kind: "output",
      sourceAnchorId: "lesson-75.output",
      label: foaText(`输出 ${String(result)}`, `Write ${String(result)}`),
      stackFrames: [],
      activeFrameId: null,
      output: String(result),
    }),
  );

  return timeline(
    75,
    "tutorial.foa.c09.l075",
    `moves-${String(disks)}`,
    LESSON_75_ANCHORS,
    events,
    `${String(result)}\n`,
  );
}

/**
 * Builds the row-major dependency simulation for lesson 80. Each += statement produces its own
 * dependency-read followed by array-write so a later real Trace can compare statement by statement.
 */
export function createFoaTransitionRuntime80(
  openGrid: readonly (readonly number[])[] = FOA_LESSON_80_DEFAULT_OPEN_GRID,
): FoaTransitionRuntime7580Timeline {
  const open = normalizeOpenGrid(openGrid);
  const paths = Array.from({ length: 3 }, () => [0, 0, 0]);
  const events: FoaTransitionRuntime7580Event[] = [];
  paths[0]![0] = 1;
  events.push(
    runtimeEvent({
      id: "lesson-80.write.start",
      kind: "array-write",
      sourceAnchorId: "lesson-80.start-write",
      label: foaText("起点 paths[0][0] 写入 1", "Write 1 to the start cell paths[0][0]"),
      matrix: paths,
      activeCell: cell(0, 0),
    }),
  );

  for (let row = 0; row < 3; row += 1) {
    for (let column = 0; column < 3; column += 1) {
      if (open[row]![column] === 0) {
        events.push(
          runtimeEvent({
            id: `lesson-80.skip.${String(row)}.${String(column)}`,
            kind: "cell-skip",
            sourceAnchorId: "lesson-80.open-cell",
            label: foaText(
              `障碍 (${String(row)},${String(column)})：不写入`,
              `Obstacle (${String(row)},${String(column)}): skip the write`,
            ),
            matrix: paths,
            activeCell: cell(row, column),
          }),
        );
        continue;
      }
      if (row > 0) {
        appendDependencyPair(
          events,
          paths,
          "above",
          "lesson-80.from-above",
          cell(row - 1, column),
          cell(row, column),
        );
      }
      if (column > 0) {
        appendDependencyPair(
          events,
          paths,
          "left",
          "lesson-80.from-left",
          cell(row, column - 1),
          cell(row, column),
        );
      }
    }
  }

  const result = paths[2]![2]!;
  events.push(
    runtimeEvent({
      id: "lesson-80.output",
      kind: "output",
      sourceAnchorId: "lesson-80.output",
      label: foaText(`输出路径数 ${String(result)}`, `Write path count ${String(result)}`),
      matrix: paths,
      activeCell: cell(2, 2),
      output: String(result),
    }),
  );

  return timeline(
    80,
    "tutorial.foa.c09.l080",
    `open-${open.flat().join("")}`,
    LESSON_80_ANCHORS,
    events,
    `${String(result)}\n`,
  );
}

/** Dispatcher kept deliberately small so the root tutorial registry can aggregate prototypes. */
export function createFoaTransitionRuntime7580(
  order: 75,
  input?: number,
): FoaTransitionRuntime7580Timeline;
export function createFoaTransitionRuntime7580(
  order: 80,
  input?: readonly (readonly number[])[],
): FoaTransitionRuntime7580Timeline;
export function createFoaTransitionRuntime7580(
  order: FoaTransitionRuntime7580Order,
  input?: number | readonly (readonly number[])[],
): FoaTransitionRuntime7580Timeline {
  if (order === 75) {
    if (input !== undefined && typeof input !== "number") {
      throw new TypeError("FOA lesson 75 expects an integer disk count");
    }
    return createFoaTransitionRuntime75(input);
  }
  if (input !== undefined && typeof input === "number") {
    throw new TypeError("FOA lesson 80 expects a 3×3 open-cell grid");
  }
  return createFoaTransitionRuntime80(input);
}

/** Fail closed when an authored probe slice is missing or ambiguous. */
export function assertFoaTransitionRuntime7580Anchors(
  source: string,
  timeline: Pick<FoaTransitionRuntime7580Timeline, "anchors" | "events">,
): void {
  const anchorIds = new Set(timeline.anchors.map(({ id }) => id));
  for (const anchor of timeline.anchors) {
    const first = source.indexOf(anchor.exact);
    if (first < 0 || first !== source.lastIndexOf(anchor.exact)) {
      throw new RangeError(`FOA transition source anchor ${anchor.id} must occur exactly once`);
    }
  }
  for (const event of timeline.events) {
    if (!anchorIds.has(event.sourceAnchorId)) {
      throw new RangeError(`FOA transition event ${event.id} references an unknown source anchor`);
    }
    const anchor = timeline.anchors.find(({ id }) => id === event.sourceAnchorId)!;
    if (!anchor.allowedTraceKinds.includes(event.kind)) {
      throw new RangeError(
        `FOA transition event ${event.id} is incompatible with source anchor ${anchor.id}`,
      );
    }
  }
}

interface RuntimeEventInput {
  readonly id: string;
  readonly kind: FoaTransitionRuntime7580EventKind;
  readonly sourceAnchorId: string;
  readonly label: FoaLocalizedText;
  readonly stackFrames?: readonly FoaTransitionStackFrame[];
  readonly activeFrameId?: string | null;
  readonly matrix?: readonly (readonly number[])[];
  readonly activeCell?: FoaTransitionCell | null;
  readonly dependencies?: readonly FoaTransitionDependency[];
  readonly output?: string | null;
}

function runtimeEvent(input: RuntimeEventInput): FoaTransitionRuntime7580Event {
  return Object.freeze({
    id: input.id,
    sequence: -1,
    kind: input.kind,
    sourceAnchorId: input.sourceAnchorId,
    label: foaText(input.label.zh, input.label.en),
    stackFrames: Object.freeze([...(input.stackFrames ?? [])].map(freezeStackFrame)),
    activeFrameId: input.activeFrameId ?? null,
    matrix: deepFreezeMatrix(input.matrix ?? []),
    activeCell:
      input.activeCell === null || input.activeCell === undefined
        ? null
        : cell(input.activeCell.row, input.activeCell.column),
    dependencies: Object.freeze([...(input.dependencies ?? [])].map(freezeDependency)),
    output: input.output ?? null,
  });
}

function timeline(
  lessonOrder: FoaTransitionRuntime7580Order,
  lessonId: string,
  caseId: string,
  sourceAnchors: readonly FoaTransitionSourceAnchor[],
  inputEvents: readonly FoaTransitionRuntime7580Event[],
  stdout: string,
): FoaTransitionRuntime7580Timeline {
  const events = Object.freeze(
    inputEvents.map((event, sequence) => Object.freeze({ ...event, sequence })),
  );
  return Object.freeze({
    lessonOrder,
    provenance: Object.freeze({
      kind: "teaching-model" as const,
      lessonId,
      caseId,
      notice: TEACHING_NOTICE,
    }),
    verification: "simulation-only" as const,
    anchors: sourceAnchors,
    events,
    stdout,
  });
}

function appendDependencyPair(
  events: FoaTransitionRuntime7580Event[],
  paths: number[][],
  direction: "above" | "left",
  sourceAnchorId: string,
  from: FoaTransitionCell,
  to: FoaTransitionCell,
): void {
  const value = paths[from.row]![from.column]!;
  const dependency = freezeDependency({ from, to, value });
  const suffix = `${String(to.row)}.${String(to.column)}.${direction}`;
  events.push(
    runtimeEvent({
      id: `lesson-80.read.${suffix}`,
      kind: "dependency-read",
      sourceAnchorId,
      label: foaText(
        `${direction === "above" ? "上方" : "左侧"} (${String(from.row)},${String(from.column)}) 提供 ${String(value)}`,
        `${direction === "above" ? "Above" : "Left"} cell (${String(from.row)},${String(from.column)}) provides ${String(value)}`,
      ),
      matrix: paths,
      activeCell: to,
      dependencies: [dependency],
    }),
  );
  paths[to.row]![to.column]! += value;
  events.push(
    runtimeEvent({
      id: `lesson-80.write.${suffix}`,
      kind: "array-write",
      sourceAnchorId,
      label: foaText(
        `paths[${String(to.row)}][${String(to.column)}] 写为 ${String(paths[to.row]![to.column]!)}`,
        `Write ${String(paths[to.row]![to.column]!)} to paths[${String(to.row)}][${String(to.column)}]`,
      ),
      matrix: paths,
      activeCell: to,
      dependencies: [dependency],
    }),
  );
}

function anchors(
  input: readonly FoaTransitionSourceAnchor[],
): readonly FoaTransitionSourceAnchor[] {
  const ids = new Set<string>();
  return Object.freeze(
    input.map((anchor) => {
      if (anchor.id.length === 0 || anchor.exact.length === 0 || ids.has(anchor.id)) {
        throw new TypeError(
          "FOA transition source anchors require unique non-empty IDs and slices",
        );
      }
      ids.add(anchor.id);
      return Object.freeze({
        id: anchor.id,
        exact: anchor.exact,
        allowedTraceKinds: Object.freeze([...anchor.allowedTraceKinds]),
      });
    }),
  );
}

function stackFrame(
  depth: number,
  argument: number,
  returnValue: number | null,
): FoaTransitionStackFrame {
  return Object.freeze({
    frameId: `moves:${String(depth)}`,
    functionName: "moves" as const,
    depth,
    argument,
    returnValue,
  });
}

function freezeStackFrame(frame: FoaTransitionStackFrame): FoaTransitionStackFrame {
  return stackFrame(frame.depth, frame.argument, frame.returnValue);
}

function cell(row: number, column: number): FoaTransitionCell {
  return Object.freeze({ row, column });
}

function freezeDependency(dependency: FoaTransitionDependency): FoaTransitionDependency {
  return Object.freeze({
    from: cell(dependency.from.row, dependency.from.column),
    to: cell(dependency.to.row, dependency.to.column),
    value: dependency.value,
  });
}

function normalizeOpenGrid(input: readonly (readonly number[])[]): number[][] {
  if (
    !Array.isArray(input) ||
    input.length !== 3 ||
    input.some((row) => !Array.isArray(row) || row.length !== 3)
  ) {
    throw new RangeError("FOA lesson 80 expects an exact 3×3 grid");
  }
  const grid = input.map((row) =>
    row.map((value: unknown) => {
      if (value !== 0 && value !== 1) throw new RangeError("FOA lesson 80 cells must be 0 or 1");
      return value;
    }),
  );
  if (grid[0]![0] !== 1 || grid[2]![2] !== 1) {
    throw new RangeError("FOA lesson 80 requires open start and destination cells");
  }
  return grid;
}

function deepFreezeMatrix(input: readonly (readonly number[])[]): readonly (readonly number[])[] {
  return Object.freeze(input.map((row) => Object.freeze([...row])));
}

function assertIntegerInRange(
  value: number,
  minimum: number,
  maximum: number,
  label: string,
): void {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new RangeError(
      `${label} must be an integer from ${String(minimum)} to ${String(maximum)}`,
    );
  }
}
