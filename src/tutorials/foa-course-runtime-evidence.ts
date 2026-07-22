import { getFoaFixedRuntimeEvidence } from "./foa-fixed-runtime-evidence.js";
import {
  defaultFoaInteractiveRun,
  getFoaInteractiveInputDefinition,
  type FoaInteractiveRun,
} from "./foa-interactive-inputs.js";
import { createFoaInteractiveRuntimeEvidence } from "./foa-interactive-runtime-evidence.js";
import type { FoaCourseRuntimeEvidence } from "./foa-runtime-evidence-contracts.js";
import type { FoaSceneProfile } from "./foa-scene-profile.js";

/** Resolve the exact evidence program for a shared FOA runtime lesson. No generic fallback exists. */
export function resolveFoaCourseRuntimeEvidence(
  profile: FoaSceneProfile,
  run: FoaInteractiveRun | null,
): FoaCourseRuntimeEvidence {
  const evidence = resolveEvidence(profile, run);
  if (evidence.order !== profile.order) {
    throw new RangeError("FOA runtime evidence does not match its scene profile");
  }
  if (evidence.frames.length !== profile.slots.length) {
    throw new RangeError("FOA shared runtime evidence must match the authored semantic slots");
  }
  const expectedFieldIds = [...profile.stateShape.map(({ id }) => id)].sort();
  for (const frame of evidence.frames) {
    const actualFieldIds = Object.keys(frame.stateValues).sort();
    if (actualFieldIds.join("\0") !== expectedFieldIds.join("\0")) {
      throw new RangeError(
        `FOA runtime evidence ${String(profile.order)} does not cover its state shape`,
      );
    }
  }
  return evidence;
}

function resolveEvidence(
  profile: FoaSceneProfile,
  run: FoaInteractiveRun | null,
): FoaCourseRuntimeEvidence {
  if (run !== null) return createFoaInteractiveRuntimeEvidence(run);
  if (profile.caseMode === "interactive") {
    const definition = getFoaInteractiveInputDefinition(profile.order);
    if (definition === null) {
      throw new RangeError(
        `FOA interactive runtime ${String(profile.order)} has no input definition`,
      );
    }
    return createFoaInteractiveRuntimeEvidence(defaultFoaInteractiveRun(definition));
  }
  return getFoaFixedRuntimeEvidence(profile.order);
}
