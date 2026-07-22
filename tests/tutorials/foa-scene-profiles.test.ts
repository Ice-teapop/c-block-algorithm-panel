import { describe, expect, it } from "vitest";
import { FOA_LESSONS } from "../../src/tutorials/foa-curriculum.js";
import { FOA_SCENE_PROFILES_001_020 } from "../../src/tutorials/foa-scene-profiles-001-020.js";
import { FOA_SCENE_PROFILES_021_040 } from "../../src/tutorials/foa-scene-profiles-021-040.js";
import { FOA_SCENE_PROFILES_041_060 } from "../../src/tutorials/foa-scene-profiles-041-060.js";
import {
  getFoaSceneProfile,
  validateFoaSceneProfiles,
} from "../../src/tutorials/foa-scene-profiles.js";

const PROFILE_GROUPS = [
  FOA_SCENE_PROFILES_001_020,
  FOA_SCENE_PROFILES_021_040,
  FOA_SCENE_PROFILES_041_060,
] as const;

const PROFILE_ENTRIES = PROFILE_GROUPS.flatMap((profiles) => Object.entries(profiles));

describe("FOA scene profiles", () => {
  it("covers lessons 1 through 60 exactly once across the split registries", () => {
    const orders = PROFILE_ENTRIES.map(([order]) => Number(order)).sort(
      (left, right) => left - right,
    );

    expect(PROFILE_ENTRIES).toHaveLength(60);
    expect(new Set(orders).size).toBe(60);
    expect(orders).toEqual(Array.from({ length: 60 }, (_, index) => index + 1));
    expect(() => validateFoaSceneProfiles()).not.toThrow();

    for (const [order, profile] of PROFILE_ENTRIES) {
      expect(profile.order).toBe(Number(order));
      expect(getFoaSceneProfile(Number(order))).toBe(profile);
    }
  });

  it("keeps every public profile and its semantic slots immutable", () => {
    for (const group of PROFILE_GROUPS) expect(Object.isFrozen(group)).toBe(true);
    for (const [, profile] of PROFILE_ENTRIES) {
      expect(Object.isFrozen(profile)).toBe(true);
      expect(Object.isFrozen(profile.slots)).toBe(true);
      if (profile.edges !== undefined) expect(Object.isFrozen(profile.edges)).toBe(true);
    }
  });

  it("assigns exactly one scene slot to every authored semantic-sequence step", () => {
    for (const lesson of FOA_LESSONS.slice(0, 60)) {
      const profile = getFoaSceneProfile(lesson);
      expect(profile.slots, lesson.id).toHaveLength(lesson.experience.semanticSequence.length);
    }
  });

  it("reserves interactive case models for the five input-driven lessons", () => {
    expect([2, 5, 16, 22, 60].map((order) => getFoaSceneProfile(order).caseMode)).toEqual([
      "interactive",
      "interactive",
      "interactive",
      "interactive",
      "interactive",
    ]);
  });

  it("keeps audited special-course topology contracts explicit", () => {
    expect(getFoaSceneProfile(36)).toMatchObject({
      kind: "call-stack",
      connection: "unwind",
      edges: [
        [0, 1],
        [1, 2],
        [2, 0],
        [2, 3],
      ],
    });
    expect(getFoaSceneProfile(47)).toMatchObject({
      kind: "pointer",
      connection: "alias",
      edges: [
        [0, 1],
        [1, 2],
        [2, 3],
        [1, 0],
        [2, 0],
      ],
    });
    expect(getFoaSceneProfile(54)).toMatchObject({
      kind: "matrix",
      connection: "grid",
      edges: [
        [0, 1],
        [1, 2],
        [2, 3],
        [3, 0],
      ],
    });
  });
});
