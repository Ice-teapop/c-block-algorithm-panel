import type { TraceObservationProfileId } from "../shared/trace.js";
import { FOA_LESSONS } from "./foa-catalog.js";
import {
  createFoaTransitionRuntime63,
  createFoaTransitionRuntime70,
  type FoaTransitionRuntimePrototype,
} from "./foa-transition-runtime-63-70.js";
import {
  createFoaTransitionRuntime75,
  createFoaTransitionRuntime80,
  FOA_LESSON_80_DEFAULT_OPEN_GRID,
  type FoaTransitionRuntime7580Timeline,
} from "./foa-transition-runtime-75-80.js";

export const FOA_TRANSITION_TRACE_PROFILE_IDS = Object.freeze({
  63: "foa-transition-63-v1",
  70: "foa-transition-70-v1",
  75: "foa-transition-75-v1",
  80: "foa-transition-80-v1",
} as const satisfies Readonly<Record<63 | 70 | 75 | 80, TraceObservationProfileId>>);

export type FoaTransitionTraceProfileId =
  (typeof FOA_TRANSITION_TRACE_PROFILE_IDS)[keyof typeof FOA_TRANSITION_TRACE_PROFILE_IDS];

const DEFAULT_SEARCH_VALUES = Object.freeze([1, 3, 5, 7, 9]);

export interface FoaTransitionTraceEvidenceBinding {
  readonly teachingModelProvenance: "teaching-model";
  readonly upgradeProvenance: "real-trace";
  readonly requiredProvenanceFields: readonly [
    "sessionId",
    "sourceFingerprint",
    "inputDigest",
    "inputFingerprint",
    "observationProfileId",
    "observationAuthorizationDigest",
  ];
}

export interface FoaTransitionTraceBinding<
  Order extends 63 | 70 | 75 | 80,
  ProfileId extends FoaTransitionTraceProfileId,
  ModelInput,
  Model,
> {
  readonly profileId: ProfileId;
  readonly lessonOrder: Order;
  readonly lessonId: string;
  readonly source: string;
  readonly stdin: string;
  readonly expectedStdout: string;
  /** Profile authorization order; runtime probe events may repeat these IDs. */
  readonly requiredProbeIds: readonly string[];
  readonly modelInput: ModelInput;
  readonly model: Model;
  readonly evidenceBinding: FoaTransitionTraceEvidenceBinding;
}

export type FoaTransitionTraceBinding63 = FoaTransitionTraceBinding<
  63,
  "foa-transition-63-v1",
  Readonly<{ initialValue: number }>,
  FoaTransitionRuntimePrototype
>;

export type FoaTransitionTraceBinding70 = FoaTransitionTraceBinding<
  70,
  "foa-transition-70-v1",
  Readonly<{ values: readonly number[]; target: number }>,
  FoaTransitionRuntimePrototype
>;

export type FoaTransitionTraceBinding75 = FoaTransitionTraceBinding<
  75,
  "foa-transition-75-v1",
  Readonly<{ disks: number }>,
  FoaTransitionRuntime7580Timeline
>;

export type FoaTransitionTraceBinding80 = FoaTransitionTraceBinding<
  80,
  "foa-transition-80-v1",
  Readonly<{ openGrid: readonly (readonly number[])[] }>,
  FoaTransitionRuntime7580Timeline
>;

const REAL_TRACE_EVIDENCE_BINDING: FoaTransitionTraceEvidenceBinding = Object.freeze({
  teachingModelProvenance: "teaching-model",
  upgradeProvenance: "real-trace",
  requiredProvenanceFields: Object.freeze([
    "sessionId",
    "sourceFingerprint",
    "inputDigest",
    "inputFingerprint",
    "observationProfileId",
    "observationAuthorizationDigest",
  ] as const),
});

const REQUIRED_PROBE_IDS = Object.freeze({
  63: Object.freeze(["foa63.counter.value", "foa63.link.target"]),
  70: Object.freeze([
    "foa70.low",
    "foa70.high",
    "foa70.mid",
    "foa70.values.at-mid",
    "foa70.compare",
  ]),
  75: Object.freeze(["foa75.moves"]),
  80: Object.freeze([
    "foa80.open.cell",
    "foa80.paths.read-above",
    "foa80.paths.read-left",
    "foa80.paths.write",
  ]),
} as const);

export function createFoaTransitionTraceBinding63(initialValue = 4): FoaTransitionTraceBinding63 {
  const model = createFoaTransitionRuntime63(initialValue);
  return Object.freeze({
    profileId: FOA_TRANSITION_TRACE_PROFILE_IDS[63],
    lessonOrder: 63,
    lessonId: model.lessonId,
    source: sourceForLesson(63, model.lessonId),
    stdin: model.stdin,
    expectedStdout: model.stdout,
    requiredProbeIds: REQUIRED_PROBE_IDS[63],
    modelInput: Object.freeze({ initialValue }),
    model,
    evidenceBinding: REAL_TRACE_EVIDENCE_BINDING,
  });
}

export function createFoaTransitionTraceBinding70(
  values: readonly number[] = DEFAULT_SEARCH_VALUES,
  target = 7,
): FoaTransitionTraceBinding70 {
  const normalizedValues = Object.freeze([...values]);
  const model = createFoaTransitionRuntime70(normalizedValues, target);
  return Object.freeze({
    profileId: FOA_TRANSITION_TRACE_PROFILE_IDS[70],
    lessonOrder: 70,
    lessonId: model.lessonId,
    source: sourceForLesson(70, model.lessonId),
    stdin: model.stdin,
    expectedStdout: model.stdout,
    requiredProbeIds: REQUIRED_PROBE_IDS[70],
    modelInput: Object.freeze({ values: normalizedValues, target }),
    model,
    evidenceBinding: REAL_TRACE_EVIDENCE_BINDING,
  });
}

export function createFoaTransitionTraceBinding75(disks = 4): FoaTransitionTraceBinding75 {
  const model = createFoaTransitionRuntime75(disks);
  return Object.freeze({
    profileId: FOA_TRANSITION_TRACE_PROFILE_IDS[75],
    lessonOrder: 75,
    lessonId: model.provenance.lessonId,
    source: sourceForLesson(75, model.provenance.lessonId),
    stdin: `${String(disks)}\n`,
    expectedStdout: model.stdout,
    requiredProbeIds: REQUIRED_PROBE_IDS[75],
    modelInput: Object.freeze({ disks }),
    model,
    evidenceBinding: REAL_TRACE_EVIDENCE_BINDING,
  });
}

export function createFoaTransitionTraceBinding80(
  openGrid: readonly (readonly number[])[] = FOA_LESSON_80_DEFAULT_OPEN_GRID,
): FoaTransitionTraceBinding80 {
  const normalizedGrid = deepFreezeMatrix(openGrid);
  const model = createFoaTransitionRuntime80(normalizedGrid);
  return Object.freeze({
    profileId: FOA_TRANSITION_TRACE_PROFILE_IDS[80],
    lessonOrder: 80,
    lessonId: model.provenance.lessonId,
    source: sourceForLesson(80, model.provenance.lessonId),
    stdin: `${normalizedGrid.map((row) => row.join(" ")).join("\n")}\n`,
    expectedStdout: model.stdout,
    requiredProbeIds: REQUIRED_PROBE_IDS[80],
    modelInput: Object.freeze({ openGrid: normalizedGrid }),
    model,
    evidenceBinding: REAL_TRACE_EVIDENCE_BINDING,
  });
}

function deepFreezeMatrix(input: readonly (readonly number[])[]): readonly (readonly number[])[] {
  return Object.freeze(input.map((row) => Object.freeze([...row])));
}

function sourceForLesson(order: 63 | 70 | 75 | 80, lessonId: string): string {
  const lesson = FOA_LESSONS[order - 1];
  if (lesson === undefined || lesson.order !== order || lesson.id !== lessonId) {
    throw new RangeError(`FOA transition trace profile cannot resolve lesson ${String(order)}`);
  }
  return lesson.code.text;
}
