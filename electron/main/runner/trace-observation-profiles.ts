import { createHash } from "node:crypto";
import type { TraceObservationProfileId } from "../../../src/shared/trace.js";

export type TraceProbeValueType = "integer" | "boolean";

export type TraceProbeTemplate =
  | {
      readonly probeId: string;
      readonly kind: "scalar";
      readonly valueType: TraceProbeValueType;
    }
  | {
      readonly probeId: string;
      readonly kind: "array";
      readonly valueType: TraceProbeValueType;
      readonly rank: 1 | 2;
    }
  | {
      readonly probeId: string;
      readonly kind: "call";
    }
  | {
      readonly probeId: string;
      readonly kind: "object";
      readonly objectId: string;
      readonly targetObjectId: string;
      readonly fieldId: string | null;
    };

export type ResolvedTraceProbeDefinition = TraceProbeTemplate & {
  /** Small profile-local integer written into the native protocol. */
  readonly slot: number;
  /** Authorized one-based lines in the unmodified project source. */
  readonly lines: readonly number[];
};

export type TraceProbeEmission =
  | {
      readonly kind: "scalar";
      readonly expression: string;
    }
  | {
      readonly kind: "array";
      readonly indexExpressions: readonly string[];
      readonly expression: string;
    }
  | {
      readonly kind: "call";
      readonly phase: "enter" | "exit";
      readonly expression: string;
    }
  | {
      readonly kind: "object";
      readonly expression: string;
    };

export interface ResolvedTraceProbeSite {
  readonly insertionLine: number;
  readonly sourceLine: number;
  readonly placement: "before" | "after";
  readonly slot: number;
  readonly probeId: string;
  readonly emission: TraceProbeEmission;
}

export interface ResolvedTraceObservationProfile {
  readonly id: TraceObservationProfileId;
  readonly sourceSha256: string;
  readonly authorizationDigest: string;
  readonly probes: readonly ResolvedTraceProbeDefinition[];
  readonly sites: readonly ResolvedTraceProbeSite[];
}

interface ProbeSiteSpec {
  readonly insertionExact: string;
  readonly sourceExact: string;
  readonly insertionLineNumber?: number | undefined;
  readonly sourceLineNumber?: number | undefined;
  readonly placement: "before" | "after";
  readonly probeId: string;
  readonly emission: TraceProbeEmission;
}

interface TraceObservationProfileSpec {
  readonly id: TraceObservationProfileId;
  readonly sourceSha256: string;
  readonly probes: readonly TraceProbeTemplate[];
  readonly sites: readonly ProbeSiteSpec[];
}

const PROFILE_SPECS: Readonly<Record<TraceObservationProfileId, TraceObservationProfileSpec>> =
  Object.freeze({
    "foa-transition-63-v1": profile(
      "foa-transition-63-v1",
      "ceb329cabfac517a524a6aa5f52013793e0af4f434eca8da243cfe2425e0b9cf",
      [
        scalar("foa63.counter.value", "integer"),
        objectLink("foa63.link.target", "foa63.link", "foa63.counter", null),
      ],
      [
        site(
          "struct Counter *link = &counter;",
          'if (scanf("%d", &counter.value) != 1) {',
          "before",
          "foa63.counter.value",
          scalarEmission("counter.value"),
        ),
        site(
          "struct Counter *link = &counter;",
          "struct Counter *link = &counter;",
          "after",
          "foa63.link.target",
          objectEmission("link == &counter"),
        ),
        site(
          "link->value++;",
          "link->value++;",
          "after",
          "foa63.counter.value",
          scalarEmission("counter.value"),
        ),
      ],
    ),
    "foa-transition-70-v1": profile(
      "foa-transition-70-v1",
      "a0d86b364758b5d55b66e8d3ffd1bcbb42fedd813974cc2b207b14c0aecf0ea9",
      [
        scalar("foa70.low", "integer"),
        scalar("foa70.high", "integer"),
        scalar("foa70.mid", "integer"),
        arrayProbe("foa70.values.at-mid", "integer", 1),
        scalar("foa70.compare", "boolean"),
      ],
      [
        site("size_t low = 0;", "size_t low = 0;", "after", "foa70.low", scalarEmission("low")),
        site(
          "size_t high = (size_t)count;",
          "size_t high = (size_t)count;",
          "after",
          "foa70.high",
          scalarEmission("high"),
        ),
        site(
          "size_t mid = low + (high - low) / 2;",
          "size_t mid = low + (high - low) / 2;",
          "after",
          "foa70.mid",
          scalarEmission("mid"),
        ),
        site(
          "if (values[mid] < target) {",
          "if (values[mid] < target) {",
          "before",
          "foa70.values.at-mid",
          arrayEmission(["mid"], "values[mid]"),
        ),
        site(
          "if (values[mid] < target) {",
          "if (values[mid] < target) {",
          "before",
          "foa70.compare",
          scalarEmission("values[mid] < target"),
        ),
        site(
          "low = mid + 1; /* trace-anchor: low */",
          "low = mid + 1; /* trace-anchor: low */",
          "after",
          "foa70.low",
          scalarEmission("low"),
        ),
        site(
          "high = mid; /* trace-anchor: high */",
          "high = mid; /* trace-anchor: high */",
          "after",
          "foa70.high",
          scalarEmission("high"),
        ),
      ],
    ),
    "foa-transition-75-v1": profile(
      "foa-transition-75-v1",
      "0b9e6e6d66d57b19f41cba1413222f38c39edaecf5e6a78f30e269a5a2deb04d",
      [call("foa75.moves")],
      [
        site(
          "static int moves(int disks) {",
          "static int moves(int disks) {",
          "after",
          "foa75.moves",
          callEmission("enter", "disks"),
        ),
        site("return 0;", "return 0;", "before", "foa75.moves", callEmission("exit", "0"), {
          insertionLineNumber: 11,
          sourceLineNumber: 11,
        }),
        site(
          "return result;",
          "return result;",
          "before",
          "foa75.moves",
          callEmission("exit", "result"),
        ),
      ],
    ),
    "foa-transition-80-v1": profile(
      "foa-transition-80-v1",
      "c724083ea80f15835ec6357347e8d7296337df24fb95073f0a666989d6c523a7",
      [
        arrayProbe("foa80.open.cell", "boolean", 2),
        arrayProbe("foa80.paths.read-above", "integer", 2),
        arrayProbe("foa80.paths.read-left", "integer", 2),
        arrayProbe("foa80.paths.write", "integer", 2),
      ],
      [
        site(
          "if (open[r][c] != 0 && open[r][c] != 1) {",
          'if (scanf("%d", &open[r][c]) != 1) {',
          "before",
          "foa80.open.cell",
          arrayEmission(["r", "c"], "open[r][c] != 0"),
        ),
        site(
          "paths[r][c] = 0;",
          "paths[r][c] = 0;",
          "after",
          "foa80.paths.write",
          arrayEmission(["r", "c"], "paths[r][c]"),
        ),
        site(
          "paths[0][0] = 1;",
          "paths[0][0] = 1;",
          "after",
          "foa80.paths.write",
          arrayEmission(["0", "0"], "paths[0][0]"),
        ),
        site(
          "if (open[r][c] == 0) {",
          "if (open[r][c] == 0) {",
          "before",
          "foa80.open.cell",
          arrayEmission(["r", "c"], "open[r][c] != 0"),
        ),
        site(
          "paths[r][c] += paths[r - 1][c];",
          "paths[r][c] += paths[r - 1][c];",
          "before",
          "foa80.paths.read-above",
          arrayEmission(["r - 1", "c"], "paths[r - 1][c]"),
        ),
        site(
          "paths[r][c] += paths[r - 1][c];",
          "paths[r][c] += paths[r - 1][c];",
          "after",
          "foa80.paths.write",
          arrayEmission(["r", "c"], "paths[r][c]"),
        ),
        site(
          "paths[r][c] += paths[r][c - 1];",
          "paths[r][c] += paths[r][c - 1];",
          "before",
          "foa80.paths.read-left",
          arrayEmission(["r", "c - 1"], "paths[r][c - 1]"),
        ),
        site(
          "paths[r][c] += paths[r][c - 1];",
          "paths[r][c] += paths[r][c - 1];",
          "after",
          "foa80.paths.write",
          arrayEmission(["r", "c"], "paths[r][c]"),
        ),
      ],
    ),
  });

export function resolveTraceObservationProfile(
  profileId: TraceObservationProfileId,
  source: string,
): ResolvedTraceObservationProfile | null {
  const spec = PROFILE_SPECS[profileId];
  if (sha256(source) !== spec.sourceSha256) return null;
  const lines = source.split(/\r?\n/u);
  const slots = new Map(spec.probes.map((probe, index) => [probe.probeId, index + 1]));
  const sites: ResolvedTraceProbeSite[] = [];
  const linesByProbe = new Map<string, Set<number>>();
  for (const siteSpec of spec.sites) {
    const insertionLine = resolveExactLine(
      lines,
      siteSpec.insertionExact,
      siteSpec.insertionLineNumber,
    );
    const sourceLine = resolveExactLine(lines, siteSpec.sourceExact, siteSpec.sourceLineNumber);
    const slot = slots.get(siteSpec.probeId);
    if (insertionLine === null || sourceLine === null || slot === undefined) return null;
    sites.push(
      Object.freeze({
        insertionLine,
        sourceLine,
        placement: siteSpec.placement,
        slot,
        probeId: siteSpec.probeId,
        emission: freezeEmission(siteSpec.emission),
      }),
    );
    const probeLines = linesByProbe.get(siteSpec.probeId) ?? new Set<number>();
    probeLines.add(sourceLine);
    linesByProbe.set(siteSpec.probeId, probeLines);
  }
  const probes = spec.probes.map((probe, index): ResolvedTraceProbeDefinition =>
    Object.freeze({
      ...probe,
      slot: index + 1,
      lines: Object.freeze([...(linesByProbe.get(probe.probeId) ?? [])].sort((a, b) => a - b)),
    }),
  );
  if (probes.some((probe) => probe.lines.length === 0)) return null;
  return Object.freeze({
    id: spec.id,
    sourceSha256: spec.sourceSha256,
    authorizationDigest: authorizationDigest(spec),
    probes: Object.freeze(probes),
    sites: Object.freeze(sites),
  });
}

export function traceObservationProfileMatchesSource(
  profile: ResolvedTraceObservationProfile,
  source: string,
): boolean {
  const resolved = resolveTraceObservationProfile(profile.id, source);
  return resolved !== null && resolved.authorizationDigest === profile.authorizationDigest;
}

function profile(
  id: TraceObservationProfileId,
  sourceSha256: string,
  probes: readonly TraceProbeTemplate[],
  sites: readonly ProbeSiteSpec[],
): TraceObservationProfileSpec {
  return Object.freeze({
    id,
    sourceSha256,
    probes: Object.freeze(probes.map((probe) => Object.freeze({ ...probe }))),
    sites: Object.freeze(sites.map((entry) => Object.freeze({ ...entry }))),
  });
}

function site(
  insertionExact: string,
  sourceExact: string,
  placement: "before" | "after",
  probeId: string,
  emission: TraceProbeEmission,
  fixedLines: {
    readonly insertionLineNumber?: number | undefined;
    readonly sourceLineNumber?: number | undefined;
  } = {},
): ProbeSiteSpec {
  return Object.freeze({
    insertionExact,
    sourceExact,
    placement,
    probeId,
    emission,
    ...fixedLines,
  });
}

function scalar(probeId: string, valueType: TraceProbeValueType): TraceProbeTemplate {
  return Object.freeze({ probeId, kind: "scalar", valueType });
}

function arrayProbe(
  probeId: string,
  valueType: TraceProbeValueType,
  rank: 1 | 2,
): TraceProbeTemplate {
  return Object.freeze({ probeId, kind: "array", valueType, rank });
}

function call(probeId: string): TraceProbeTemplate {
  return Object.freeze({ probeId, kind: "call" });
}

function objectLink(
  probeId: string,
  objectId: string,
  targetObjectId: string,
  fieldId: string | null,
): TraceProbeTemplate {
  return Object.freeze({ probeId, kind: "object", objectId, targetObjectId, fieldId });
}

function scalarEmission(expression: string): TraceProbeEmission {
  return Object.freeze({ kind: "scalar", expression });
}

function arrayEmission(
  indexExpressions: readonly string[],
  expression: string,
): TraceProbeEmission {
  return Object.freeze({
    kind: "array",
    indexExpressions: Object.freeze([...indexExpressions]),
    expression,
  });
}

function callEmission(phase: "enter" | "exit", expression: string): TraceProbeEmission {
  return Object.freeze({ kind: "call", phase, expression });
}

function objectEmission(expression: string): TraceProbeEmission {
  return Object.freeze({ kind: "object", expression });
}

function freezeEmission(emission: TraceProbeEmission): TraceProbeEmission {
  return emission.kind === "array"
    ? Object.freeze({
        ...emission,
        indexExpressions: Object.freeze([...emission.indexExpressions]),
      })
    : Object.freeze({ ...emission });
}

function resolveExactLine(
  lines: readonly string[],
  exact: string,
  fixedLine: number | undefined,
): number | null {
  if (fixedLine !== undefined) {
    return Number.isSafeInteger(fixedLine) &&
      fixedLine >= 1 &&
      lines[fixedLine - 1]?.trim() === exact
      ? fixedLine
      : null;
  }
  const matches: number[] = [];
  for (const [index, line] of lines.entries()) {
    if (line.trim() === exact) matches.push(index + 1);
  }
  return matches.length === 1 ? (matches[0] ?? null) : null;
}

function authorizationDigest(spec: TraceObservationProfileSpec): string {
  return sha256(
    JSON.stringify({
      version: 1,
      id: spec.id,
      sourceSha256: spec.sourceSha256,
      probes: spec.probes,
      sites: spec.sites,
    }),
  );
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}
