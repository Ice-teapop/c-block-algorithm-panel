import type { FoaLessonDefinition } from "./foa-contracts.js";
import type { FoaSceneProfile } from "./foa-scene-profile.js";
import { FOA_SCENE_PROFILES_001_020 } from "./foa-scene-profiles-001-020.js";
import { FOA_SCENE_PROFILES_021_040 } from "./foa-scene-profiles-021-040.js";
import { FOA_SCENE_PROFILES_041_060 } from "./foa-scene-profiles-041-060.js";

const PROFILES: Readonly<Record<number, FoaSceneProfile>> = Object.freeze({
  ...FOA_SCENE_PROFILES_001_020,
  ...FOA_SCENE_PROFILES_021_040,
  ...FOA_SCENE_PROFILES_041_060,
});

export function getFoaSceneProfile(
  lesson: number | Pick<FoaLessonDefinition, "order" | "semanticEvents">,
): FoaSceneProfile {
  const order = typeof lesson === "number" ? lesson : lesson.order;
  const profile = PROFILES[order];
  if (profile === undefined)
    throw new RangeError(`FOA lesson ${String(order)} has no scene profile`);
  if (typeof lesson !== "number" && profile.slots.length !== lesson.semanticEvents.length) {
    throw new RangeError(
      `FOA lesson ${String(order)} scene profile does not match its event count`,
    );
  }
  return profile;
}

export function validateFoaSceneProfiles(): void {
  const orders = Object.keys(PROFILES)
    .map(Number)
    .sort((left, right) => left - right);
  if (orders.length !== 60 || orders.some((order, index) => order !== index + 1)) {
    throw new RangeError("FOA scene profiles must cover lessons 1 through 60 exactly once");
  }
}

validateFoaSceneProfiles();
