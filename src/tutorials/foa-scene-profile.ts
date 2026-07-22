import type { FoaLocalizedText } from "./foa-contracts.js";
import {
  getFoaSceneMechanism,
  type FoaSceneLearnerControl,
  type FoaSceneMechanism,
  type FoaSceneObservableKind,
  type FoaSceneStateField,
  type FoaSceneStateValueKind,
} from "./foa-scene-mechanisms.js";

export type FoaSceneKind =
  | "execution"
  | "state"
  | "expression"
  | "branch"
  | "loop"
  | "stream"
  | "call-stack"
  | "scope"
  | "pointer"
  | "array"
  | "matrix"
  | "search"
  | "plot"
  | "evidence"
  | "sorting";

export type FoaSceneConnection =
  "forward" | "branch" | "cycle" | "unwind" | "alias" | "grid" | "compare" | "evidence";

export type FoaSceneSlot =
  | "entry"
  | "input"
  | "gate"
  | "state"
  | "operation"
  | "decision"
  | "true-path"
  | "false-path"
  | "merge"
  | "condition"
  | "body"
  | "update"
  | "call"
  | "frame"
  | "base-case"
  | "return"
  | "scope"
  | "object"
  | "pointer"
  | "array"
  | "cursor"
  | "output"
  | "evidence";

export type FoaSceneEvidence =
  "input" | "state" | "condition" | "iteration" | "memory" | "output" | "test";

export type FoaSceneEdge = readonly [fromIndex: number, toIndex: number];

/** A compact object/alias model rendered separately from the lesson's control sequence. */
export interface FoaPointerAliasModel {
  readonly objectName: string;
  readonly pointerName: string;
  readonly initialValue: string;
  readonly writtenValue: string;
  /** The alias becomes evidence only after this many learner actions have been confirmed. */
  readonly revealAfterConfirmedCount: number;
  /** The object switches to writtenValue only after this many actions have been confirmed. */
  readonly writeAfterConfirmedCount: number;
}

/** A literal matrix case; values and row sums are evidence, not inferred runtime samples. */
export interface FoaMatrixCaseModel {
  readonly values: readonly (readonly number[])[];
  readonly rowSums: readonly number[];
}

export interface FoaSceneProfile extends FoaSceneMechanism {
  readonly order: number;
  readonly kind: FoaSceneKind;
  readonly connection: FoaSceneConnection;
  /** One semantic role per authored event. The catalog rejects mismatched lengths. */
  readonly slots: readonly FoaSceneSlot[];
  readonly evidence: readonly FoaSceneEvidence[];
  /** Authored topology for relationships that cannot be inferred from event order. */
  readonly edges?: readonly FoaSceneEdge[] | undefined;
  /** Optional pointer memory model. The control path remains in edges; aliases render separately. */
  readonly pointerAlias?: FoaPointerAliasModel | undefined;
  /** Optional literal matrix model for grid, row, column, and accumulator evidence. */
  readonly matrixCase?: FoaMatrixCaseModel | undefined;
  /** Interactive means the lesson owns a real input-driven model instead of a fixed-case replay. */
  readonly caseMode: "none" | "fixed" | "interactive";
  readonly special: boolean;
  readonly rationale: FoaLocalizedText;
}

export type FoaSceneProfileInput = Omit<FoaSceneProfile, keyof FoaSceneMechanism>;

export function defineFoaSceneProfile(profile: FoaSceneProfileInput): FoaSceneProfile {
  if (!Number.isInteger(profile.order) || profile.order < 1 || profile.order > 60) {
    throw new RangeError("FOA scene profile order must be an integer from 1 to 60");
  }
  if (profile.slots.length < 2 || profile.slots.length > 32) {
    throw new RangeError("FOA scene profiles require two to 32 semantic slots");
  }
  if (profile.evidence.length === 0) {
    throw new RangeError("FOA scene profiles require at least one visible evidence channel");
  }
  const edges = profile.edges?.map((edge) => {
    const [from, to] = edge;
    if (
      !Number.isInteger(from) ||
      !Number.isInteger(to) ||
      from < 0 ||
      to < 0 ||
      from >= profile.slots.length ||
      to >= profile.slots.length ||
      from === to
    ) {
      throw new RangeError("FOA scene edges must connect two distinct authored slots");
    }
    return Object.freeze([from, to] as const);
  });
  const pointerAlias = freezePointerAlias(profile);
  const matrixCase = freezeMatrixCase(profile);
  const mechanism = getFoaSceneMechanism(profile.order);
  return Object.freeze({
    ...profile,
    ...mechanism,
    slots: Object.freeze([...profile.slots]),
    evidence: Object.freeze([...profile.evidence]),
    ...(edges === undefined ? {} : { edges: Object.freeze(edges) }),
    ...(pointerAlias === undefined ? {} : { pointerAlias }),
    ...(matrixCase === undefined ? {} : { matrixCase }),
  });
}

export type {
  FoaSceneLearnerControl,
  FoaSceneMechanism,
  FoaSceneObservableKind,
  FoaSceneStateField,
  FoaSceneStateValueKind,
};

function freezePointerAlias(profile: FoaSceneProfileInput): FoaPointerAliasModel | undefined {
  const model = profile.pointerAlias;
  if (model === undefined) return undefined;
  if (profile.kind !== "pointer") {
    throw new RangeError("FOA pointer alias models require a pointer scene");
  }
  if (
    model.objectName.trim().length === 0 ||
    model.pointerName.trim().length === 0 ||
    model.initialValue.trim().length === 0 ||
    model.writtenValue.trim().length === 0
  ) {
    throw new RangeError("FOA pointer alias models require named, visible objects and values");
  }
  if (
    !Number.isInteger(model.revealAfterConfirmedCount) ||
    !Number.isInteger(model.writeAfterConfirmedCount) ||
    model.revealAfterConfirmedCount < 1 ||
    model.writeAfterConfirmedCount < model.revealAfterConfirmedCount ||
    model.writeAfterConfirmedCount > profile.slots.length
  ) {
    throw new RangeError("FOA pointer alias thresholds must follow the authored lesson sequence");
  }
  return Object.freeze({ ...model });
}

function freezeMatrixCase(profile: FoaSceneProfileInput): FoaMatrixCaseModel | undefined {
  const model = profile.matrixCase;
  if (model === undefined) return undefined;
  if (profile.kind !== "matrix") {
    throw new RangeError("FOA matrix case models require a matrix scene");
  }
  const columnCount = model.values[0]?.length ?? 0;
  if (
    model.values.length === 0 ||
    columnCount === 0 ||
    model.values.some((row) => row.length !== columnCount) ||
    model.rowSums.length !== model.values.length ||
    model.values.some(
      (row, index) => row.reduce((sum, value) => sum + value, 0) !== model.rowSums[index],
    )
  ) {
    throw new RangeError("FOA matrix cases require a rectangular grid and exact row sums");
  }
  return Object.freeze({
    values: Object.freeze(model.values.map((row) => Object.freeze([...row]))),
    rowSums: Object.freeze([...model.rowSums]),
  });
}
