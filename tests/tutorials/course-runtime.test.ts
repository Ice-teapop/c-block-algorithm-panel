import { describe, expect, it, vi } from "vitest";
import {
  createCourseController,
  createCourseProgress,
  deserializeCourseProgress,
  readCourseProgress,
  recordCourseEvidence,
  serializeCourseProgress,
  startCourseUnit,
  summarizeCourseProgress,
  writeCourseProgress,
  type CourseEvidenceEvent,
  type CourseProgress,
  type CourseProgressStorageAdapter,
} from "../../src/tutorials/course-progress.js";
import {
  defineCourse,
  type CourseDefinition,
  type CourseStageMode,
} from "../../src/tutorials/course-model.js";

const MODES: readonly CourseStageMode[] = Object.freeze([
  "semantic",
  "block-observe",
  "block-complete",
  "block-compose",
  "workspace-evidence",
]);

function course(version = "1.0.0"): CourseDefinition {
  return {
    id: "course.foa",
    version,
    title: "Foundations of Algorithms",
    summary: "Evidence-gated algorithm lessons.",
    knowledgePoints: [
      {
        id: "knowledge.scan",
        title: "Linear scan",
        summary: "Visit each input once.",
        libraryEntryIds: ["algorithm.linear-scan"],
      },
    ],
    units: [
      {
        id: "unit.scan",
        version: "1.0.0",
        title: "Scan",
        summary: "Move from semantic animation to a verified run.",
        knowledgePointIds: ["knowledge.scan"],
        prerequisiteUnitIds: [],
        stages: MODES.map((mode, index) => ({
          id: `stage.scan.${index + 1}`,
          title: mode,
          instruction: `Complete ${mode}.`,
          mode,
          knowledgePointIds: ["knowledge.scan"],
          events: [
            {
              id: `event.scan.${index + 1}`,
              type: "focus",
              sourceAnchorId: `source.scan.${index + 1}`,
              relationIds: [`relation.scan.${index + 1}`],
            },
          ],
          requirements: [
            {
              id: `requirement.scan.${index + 1}`,
              label: `Verify ${mode}.`,
              evidenceType: index === 4 ? "real-run" : `action-${index + 1}`,
              binding: index === 4 ? "workspace-source" : "stage",
              trust: index === 4 ? "verified" : "local",
              expectations: [{ key: "passed", value: true }],
            },
          ],
        })),
      },
      {
        id: "unit.transfer",
        version: "1.0.0",
        title: "Transfer",
        summary: "Use the same idea independently.",
        knowledgePointIds: ["knowledge.scan"],
        prerequisiteUnitIds: ["unit.scan"],
        stages: [
          {
            id: "stage.transfer.1",
            title: "Transfer",
            instruction: "Apply the scan.",
            mode: "workspace-evidence",
            knowledgePointIds: ["knowledge.scan"],
            events: [
              {
                id: "event.transfer.1",
                type: "focus",
                sourceAnchorId: null,
                relationIds: [],
              },
            ],
            requirements: [
              {
                id: "requirement.transfer.1",
                label: "Run the transfer case.",
                evidenceType: "real-run",
                binding: "workspace-source",
                trust: "verified",
                expectations: [{ key: "passed", value: true }],
              },
            ],
          },
        ],
      },
    ],
  };
}

function evidence(
  progress: CourseProgress,
  type: string,
  overrides: Partial<CourseEvidenceEvent> = {},
): CourseEvidenceEvent {
  const unit = progress.units.find((item) => item.unitId === progress.activeUnitId);
  if (unit === undefined || unit.currentStageId === null) throw new Error("missing active stage");
  return {
    id: `evidence.${unit.currentStageId}`,
    type,
    trusted: true,
    binding: {
      courseId: progress.courseId,
      courseVersion: progress.courseVersion,
      unitId: unit.unitId,
      unitVersion: unit.unitVersion,
      stageId: unit.currentStageId,
      workspaceId: type === "real-run" ? "workspace.demo" : null,
      sourceFingerprint: type === "real-run" ? "source:demo" : null,
      scenarioId: type === "real-run" ? "scenario.demo" : null,
      scenarioVersion: type === "real-run" ? "1.0.0" : null,
    },
    values: { passed: true },
    ...overrides,
  };
}

function acceptAndAdvance(
  controller: ReturnType<typeof createCourseController>,
  type: string,
): void {
  const result = controller.recordEvidence(evidence(controller.getProgress(), type));
  expect(result.status).toBe("accepted");
  expect(controller.canAdvanceStage()).toBe(true);
  controller.advanceStage();
}

describe("course runtime", () => {
  it("deep-freezes all five stage modes and rejects unsafe workspace evidence contracts", () => {
    const definition = defineCourse(course());
    expect(definition.units[0]?.stages.map((stage) => stage.mode)).toEqual(MODES);
    expect(Object.isFrozen(definition)).toBe(true);
    expect(Object.isFrozen(definition.units[0]?.stages[0]?.events[0])).toBe(true);
    expect(Object.isFrozen(definition.knowledgePoints[0]?.libraryEntryIds)).toBe(true);

    const invalid = course();
    const stage = invalid.units[0]!.stages[4]!;
    const unsafe: CourseDefinition = {
      ...invalid,
      units: [
        {
          ...invalid.units[0]!,
          stages: [
            ...invalid.units[0]!.stages.slice(0, 4),
            {
              ...stage,
              requirements: [{ ...stage.requirements[0]!, trust: "local" }],
            },
          ],
        },
        invalid.units[1]!,
      ],
    };
    expect(() => defineCourse(unsafe)).toThrow(/verified 证据/u);
  });

  it("rejects prerequisite cycles and globally ambiguous stable IDs", () => {
    const cyclic = course();
    const withCycle: CourseDefinition = {
      ...cyclic,
      units: [{ ...cyclic.units[0]!, prerequisiteUnitIds: ["unit.transfer"] }, cyclic.units[1]!],
    };
    expect(() => defineCourse(withCycle)).toThrow(/循环/u);

    const duplicate = course();
    const second = duplicate.units[1]!;
    const duplicateEvent: CourseDefinition = {
      ...duplicate,
      units: [
        duplicate.units[0]!,
        {
          ...second,
          stages: [
            {
              ...second.stages[0]!,
              events: [{ ...second.stages[0]!.events[0]!, id: "event.scan.1" }],
            },
          ],
        },
      ],
    };
    expect(() => defineCourse(duplicateEvent)).toThrow(/语义事件 ID 重复/u);
  });

  it("moves through every mode only after exact evidence and masters the unit", () => {
    const controller = createCourseController({
      definition: course(),
      progress: createCourseProgress(course()),
    });
    controller.startUnit("unit.scan");
    for (let index = 0; index < 4; index += 1) {
      acceptAndAdvance(controller, `action-${index + 1}`);
    }
    expect(controller.getProgress().units[0]).toMatchObject({
      status: "active",
      currentStageId: "stage.scan.5",
    });

    const untrusted = recordCourseEvidence(
      course(),
      controller.getProgress(),
      evidence(controller.getProgress(), "real-run", { trusted: false }),
    );
    expect(untrusted).toMatchObject({ status: "rejected", reason: "untrusted" });
    const wrongSource = evidence(controller.getProgress(), "real-run", {
      binding: {
        ...evidence(controller.getProgress(), "real-run").binding,
        sourceFingerprint: null,
      },
    });
    expect(controller.recordEvidence(wrongSource)).toMatchObject({
      status: "rejected",
      reason: "source-missing",
    });

    acceptAndAdvance(controller, "real-run");
    expect(controller.getProgress()).toMatchObject({ activeUnitId: null });
    expect(controller.getProgress().units[0]).toMatchObject({
      status: "mastered",
      currentStageId: null,
    });
    expect(controller.getSummary()).toMatchObject({
      masteredUnits: 1,
      masteryPercent: 50,
      fullyMastered: false,
      knowledgePoints: [
        {
          knowledgePointId: "knowledge.scan",
          totalUnits: 2,
          masteredUnits: 1,
          masteryPercent: 50,
          mastered: false,
        },
      ],
    });
  });

  it("invalidates stale source-bound evidence before stage completion", () => {
    const controller = createCourseController({
      definition: course(),
      progress: createCourseProgress(course()),
    });
    controller.startUnit("unit.scan");
    for (let index = 0; index < 4; index += 1) {
      acceptAndAdvance(controller, `action-${index + 1}`);
    }
    expect(controller.recordEvidence(evidence(controller.getProgress(), "real-run")).status).toBe(
      "accepted",
    );
    expect(controller.canAdvanceStage()).toBe(true);
    controller.invalidateSourceEvidence({
      workspaceId: "workspace.demo",
      previousSourceFingerprint: "source:demo",
      nextSourceFingerprint: "source:changed",
    });
    expect(controller.canAdvanceStage()).toBe(false);
    expect(controller.getProgress().units[0]?.satisfactions).toEqual([]);
  });

  it("locks multiple workspace requirements to one workspace and source", () => {
    const base = course();
    const scan = base.units[0]!;
    const finalStage = scan.stages[4]!;
    const definition: CourseDefinition = {
      ...base,
      units: [
        {
          ...scan,
          stages: [
            ...scan.stages.slice(0, 4),
            {
              ...finalStage,
              requirements: [
                finalStage.requirements[0]!,
                {
                  id: "requirement.scan.trace",
                  label: "Verify the matching trace.",
                  evidenceType: "real-trace",
                  binding: "workspace-source",
                  trust: "verified",
                  expectations: [{ key: "passed", value: true }],
                },
              ],
            },
          ],
        },
        base.units[1]!,
      ],
    };
    const controller = createCourseController({
      definition,
      progress: createCourseProgress(definition),
    });
    controller.startUnit("unit.scan");
    for (let index = 0; index < 4; index += 1) {
      acceptAndAdvance(controller, `action-${index + 1}`);
    }
    expect(controller.recordEvidence(evidence(controller.getProgress(), "real-run")).status).toBe(
      "accepted",
    );
    const baseTrace = evidence(controller.getProgress(), "real-trace", {
      id: "evidence.trace",
      binding: {
        ...evidence(controller.getProgress(), "real-run").binding,
      },
    });
    expect(
      controller.recordEvidence({
        ...baseTrace,
        binding: { ...baseTrace.binding, workspaceId: "workspace.other" },
      }),
    ).toMatchObject({ status: "rejected", reason: "binding-mismatch" });
    expect(
      controller.recordEvidence({
        ...baseTrace,
        binding: { ...baseTrace.binding, sourceFingerprint: "source:other" },
      }),
    ).toMatchObject({ status: "rejected", reason: "binding-mismatch" });
    expect(controller.recordEvidence(baseTrace).status).toBe("accepted");
    expect(controller.canAdvanceStage()).toBe(true);
  });

  it("allows skipping without mastery and keeps prerequisite gates evidence-based", () => {
    let progress = createCourseProgress(course());
    const controller = createCourseController({ definition: course(), progress });
    progress = controller.skipUnit("unit.scan");
    expect(summarizeCourseProgress(course(), progress)).toMatchObject({
      masteredUnits: 0,
      skippedUnits: 1,
      visitedPercent: 50,
      masteryPercent: 0,
    });
    expect(() => controller.startUnit("unit.transfer")).toThrow(/先修单元尚未掌握/u);
    controller.startUnit("unit.scan");
    expect(controller.getProgress().units[0]).toMatchObject({ status: "active", attempts: 1 });
    controller.resetUnit("unit.scan");
    expect(controller.getProgress().units[0]).toMatchObject({
      status: "not-started",
      attempts: 0,
    });
  });

  it("serializes deterministically and fails closed on malformed or unsupported progress", () => {
    const definition = course();
    const started = startCourseUnit(definition, createCourseProgress(definition), "unit.scan");
    const serialized = serializeCourseProgress(definition, started);
    expect(deserializeCourseProgress(serialized, definition)).toMatchObject({
      status: "restored",
      progress: started,
    });
    expect(deserializeCourseProgress("{", definition)).toMatchObject({
      status: "reset",
      reason: "invalid-json",
    });
    expect(
      deserializeCourseProgress(
        JSON.stringify({ ...JSON.parse(serialized), schemaVersion: 99 }),
        definition,
      ),
    ).toMatchObject({ status: "reset", reason: "unsupported-version" });

    const corrupted = JSON.parse(serialized) as Record<string, unknown>;
    const units = corrupted.units as Array<Record<string, unknown>>;
    units[0]!.currentStageId = "stage.unknown";
    expect(deserializeCourseProgress(JSON.stringify(corrupted), definition)).toMatchObject({
      status: "reset",
      reason: "corrupted",
    });
  });

  it("migrates legacy and course versions conservatively", () => {
    const legacy = {
      schemaVersion: 0,
      courseId: "course.foa",
      courseVersion: "0.9.0",
      units: [
        { unitId: "unit.scan", unitVersion: "1.0.0", status: "completed" },
        { unitId: "unit.transfer", unitVersion: "1.0.0", status: "skipped" },
      ],
    };
    const migratedLegacy = deserializeCourseProgress(JSON.stringify(legacy), course());
    expect(migratedLegacy).toMatchObject({ status: "migrated", reason: "schema-v0" });
    expect(migratedLegacy.progress.units.map((unit) => unit.status)).toEqual([
      "mastered",
      "skipped",
    ]);

    const oldProgress = migratedLegacy.progress;
    const oldSerialized = serializeCourseProgress(course(), oldProgress);
    const currentDefinition = course("2.0.0");
    const versionMigrated = deserializeCourseProgress(oldSerialized, currentDefinition);
    expect(versionMigrated).toMatchObject({ status: "migrated", reason: "course-version" });
    expect(versionMigrated.progress.units.map((unit) => unit.status)).toEqual([
      "mastered",
      "skipped",
    ]);
  });

  it("uses an async renderer storage adapter without exposing IPC", async () => {
    const values = new Map<string, string>();
    const storage: CourseProgressStorageAdapter = {
      read: vi.fn(async (id) => values.get(id) ?? null),
      write: vi.fn(async (id, serialized) => {
        values.set(id, serialized);
      }),
      remove: vi.fn(async (id) => {
        values.delete(id);
      }),
    };
    const progress = startCourseUnit(course(), createCourseProgress(course()), "unit.scan");
    await writeCourseProgress(storage, course(), progress);
    await expect(readCourseProgress(storage, course())).resolves.toMatchObject({
      status: "restored",
      progress,
    });

    const failing: CourseProgressStorageAdapter = {
      read: vi.fn(async () => {
        throw new Error("blocked");
      }),
      write: vi.fn(async () => undefined),
      remove: vi.fn(async () => undefined),
    };
    await expect(readCourseProgress(failing, course())).resolves.toMatchObject({
      status: "reset",
      reason: "storage-error",
    });
  });
});
