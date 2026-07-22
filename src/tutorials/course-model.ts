const STABLE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;
const SEMVER = /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$/u;
const MAX_TEXT_LENGTH = 16_384;
const MAX_ITEMS = 2_048;

export type CourseStageMode =
  "semantic" | "block-observe" | "block-complete" | "block-compose" | "workspace-evidence";

export type CourseEvidenceBindingKind = "stage" | "workspace" | "workspace-source";
export type CourseEvidenceTrust = "local" | "verified";
export type CourseEvidenceValue = string | number | boolean | null;

export interface CourseKnowledgePointDefinition {
  readonly id: string;
  readonly title: string;
  readonly summary: string;
  readonly libraryEntryIds: readonly string[];
}

/** A stable, renderer-owned semantic event used by animation and source highlighting. */
export interface CourseSemanticEvent {
  readonly id: string;
  readonly type: string;
  readonly sourceAnchorId: string | null;
  readonly relationIds: readonly string[];
}

export interface CourseEvidenceExpectation {
  readonly key: string;
  readonly value: CourseEvidenceValue;
}

export interface CourseEvidenceRequirement {
  readonly id: string;
  readonly label: string;
  readonly evidenceType: string;
  readonly binding: CourseEvidenceBindingKind;
  readonly trust: CourseEvidenceTrust;
  readonly expectations: readonly CourseEvidenceExpectation[];
}

export interface CourseStageDefinition {
  readonly id: string;
  readonly title: string;
  readonly instruction: string;
  readonly mode: CourseStageMode;
  readonly knowledgePointIds: readonly string[];
  readonly events: readonly CourseSemanticEvent[];
  readonly requirements: readonly CourseEvidenceRequirement[];
}

export interface CourseUnitDefinition {
  readonly id: string;
  readonly version: string;
  readonly title: string;
  readonly summary: string;
  readonly knowledgePointIds: readonly string[];
  readonly prerequisiteUnitIds: readonly string[];
  readonly stages: readonly CourseStageDefinition[];
}

export interface CourseDefinition {
  readonly id: string;
  readonly version: string;
  readonly title: string;
  readonly summary: string;
  readonly knowledgePoints: readonly CourseKnowledgePointDefinition[];
  readonly units: readonly CourseUnitDefinition[];
}

/**
 * Snapshots and deeply freezes a course catalog. This prevents content loaders from changing an
 * active lesson's evidence contract after progress has been created.
 */
export function defineCourse(input: CourseDefinition): CourseDefinition {
  assertStableId(input.id, "course.id");
  assertSemver(input.version, "course.version");
  assertText(input.title, "course.title");
  assertText(input.summary, "course.summary");
  assertBoundedItems(input.knowledgePoints, "course.knowledgePoints");
  assertBoundedItems(input.units, "course.units");
  if (input.knowledgePoints.length === 0) throw new RangeError("课程至少需要一个知识点");
  if (input.units.length === 0) throw new RangeError("课程至少需要一个单元");

  const knowledgePointIds = new Set<string>();
  const knowledgePoints = Object.freeze(
    input.knowledgePoints.map((point) => {
      assertStableId(point.id, "knowledgePoint.id");
      assertUnique(knowledgePointIds, point.id, "知识点 ID");
      assertText(point.title, `knowledgePoint.${point.id}.title`);
      assertText(point.summary, `knowledgePoint.${point.id}.summary`);
      return Object.freeze({
        id: point.id,
        title: point.title,
        summary: point.summary,
        libraryEntryIds: freezeStableIds(
          point.libraryEntryIds,
          `knowledgePoint.${point.id}.libraryEntryIds`,
        ),
      });
    }),
  );

  const unitIds = new Set<string>();
  for (const unit of input.units) {
    assertStableId(unit.id, "unit.id");
    assertUnique(unitIds, unit.id, "单元 ID");
  }

  const globalStageIds = new Set<string>();
  const globalEventIds = new Set<string>();
  const globalRequirementIds = new Set<string>();
  const units = Object.freeze(
    input.units.map((unit) => {
      assertSemver(unit.version, `unit.${unit.id}.version`);
      assertText(unit.title, `unit.${unit.id}.title`);
      assertText(unit.summary, `unit.${unit.id}.summary`);
      assertBoundedItems(unit.stages, `unit.${unit.id}.stages`);
      if (unit.stages.length === 0) throw new RangeError(`单元 ${unit.id} 至少需要一个阶段`);
      const unitKnowledgePointIds = freezeKnownIds(
        unit.knowledgePointIds,
        knowledgePointIds,
        `unit.${unit.id}.knowledgePointIds`,
      );
      if (unitKnowledgePointIds.length === 0) {
        throw new RangeError(`单元 ${unit.id} 至少需要关联一个知识点`);
      }
      const prerequisiteUnitIds = freezeKnownIds(
        unit.prerequisiteUnitIds,
        unitIds,
        `unit.${unit.id}.prerequisiteUnitIds`,
      );
      if (prerequisiteUnitIds.includes(unit.id)) {
        throw new RangeError(`单元 ${unit.id} 不能依赖自身`);
      }

      const stages = Object.freeze(
        unit.stages.map((stage) => {
          assertStableId(stage.id, `unit.${unit.id}.stage.id`);
          assertUnique(globalStageIds, stage.id, "阶段 ID");
          assertText(stage.title, `stage.${stage.id}.title`);
          assertText(stage.instruction, `stage.${stage.id}.instruction`);
          assertStageMode(stage.mode);
          const stageKnowledgePointIds = freezeKnownIds(
            stage.knowledgePointIds,
            knowledgePointIds,
            `stage.${stage.id}.knowledgePointIds`,
          );
          if (stageKnowledgePointIds.length === 0) {
            throw new RangeError(`阶段 ${stage.id} 至少需要关联一个知识点`);
          }
          if (stageKnowledgePointIds.some((id) => !unitKnowledgePointIds.includes(id))) {
            throw new RangeError(`阶段 ${stage.id} 引用了单元范围外的知识点`);
          }
          assertBoundedItems(stage.events, `stage.${stage.id}.events`);
          assertBoundedItems(stage.requirements, `stage.${stage.id}.requirements`);
          if (stage.events.length === 0) {
            throw new RangeError(`阶段 ${stage.id} 至少需要一个稳定语义事件`);
          }
          if (stage.requirements.length === 0) {
            throw new RangeError(`阶段 ${stage.id} 至少需要一个验收条件`);
          }
          const events = Object.freeze(
            stage.events.map((event) => {
              assertStableId(event.id, `stage.${stage.id}.event.id`);
              assertUnique(globalEventIds, event.id, "语义事件 ID");
              assertStableId(event.type, `event.${event.id}.type`);
              if (event.sourceAnchorId !== null) {
                assertStableId(event.sourceAnchorId, `event.${event.id}.sourceAnchorId`);
              }
              return Object.freeze({
                id: event.id,
                type: event.type,
                sourceAnchorId: event.sourceAnchorId,
                relationIds: freezeStableIds(event.relationIds, `event.${event.id}.relationIds`),
              });
            }),
          );
          const requirements = Object.freeze(
            stage.requirements.map((requirement) => {
              assertStableId(requirement.id, `stage.${stage.id}.requirement.id`);
              assertUnique(globalRequirementIds, requirement.id, "验收条件 ID");
              assertText(requirement.label, `requirement.${requirement.id}.label`);
              assertStableId(
                requirement.evidenceType,
                `requirement.${requirement.id}.evidenceType`,
              );
              assertEvidenceBinding(requirement.binding);
              assertEvidenceTrust(requirement.trust);
              const expectationKeys = new Set<string>();
              const expectations = Object.freeze(
                requirement.expectations.map((expectation) => {
                  assertStableId(expectation.key, `requirement.${requirement.id}.expectation.key`);
                  assertUnique(expectationKeys, expectation.key, "证据字段");
                  assertEvidenceValue(
                    expectation.value,
                    `requirement.${requirement.id}.expectation.${expectation.key}`,
                  );
                  return Object.freeze({ key: expectation.key, value: expectation.value });
                }),
              );
              if (
                stage.mode === "workspace-evidence" &&
                (requirement.binding !== "workspace-source" || requirement.trust !== "verified")
              ) {
                throw new RangeError(
                  `工作区证据阶段 ${stage.id} 只接受绑定工作区与源码的 verified 证据`,
                );
              }
              return Object.freeze({
                id: requirement.id,
                label: requirement.label,
                evidenceType: requirement.evidenceType,
                binding: requirement.binding,
                trust: requirement.trust,
                expectations,
              });
            }),
          );
          return Object.freeze({
            id: stage.id,
            title: stage.title,
            instruction: stage.instruction,
            mode: stage.mode,
            knowledgePointIds: stageKnowledgePointIds,
            events,
            requirements,
          });
        }),
      );
      return Object.freeze({
        id: unit.id,
        version: unit.version,
        title: unit.title,
        summary: unit.summary,
        knowledgePointIds: unitKnowledgePointIds,
        prerequisiteUnitIds,
        stages,
      });
    }),
  );

  assertAcyclicPrerequisites(units);
  return Object.freeze({
    id: input.id,
    version: input.version,
    title: input.title,
    summary: input.summary,
    knowledgePoints,
    units,
  });
}

export function findCourseUnit(
  definition: CourseDefinition,
  unitId: string,
): CourseUnitDefinition | null {
  return definition.units.find((unit) => unit.id === unitId) ?? null;
}

function assertAcyclicPrerequisites(units: readonly CourseUnitDefinition[]): void {
  const byId = new Map(units.map((unit) => [unit.id, unit] as const));
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (unitId: string): void => {
    if (visited.has(unitId)) return;
    if (visiting.has(unitId)) throw new RangeError(`课程先修关系存在循环：${unitId}`);
    visiting.add(unitId);
    const unit = byId.get(unitId);
    if (unit === undefined) throw new RangeError(`未知单元：${unitId}`);
    for (const prerequisiteId of unit.prerequisiteUnitIds) visit(prerequisiteId);
    visiting.delete(unitId);
    visited.add(unitId);
  };
  for (const unit of units) visit(unit.id);
}

function freezeKnownIds(
  input: readonly string[],
  known: ReadonlySet<string>,
  label: string,
): readonly string[] {
  const ids = freezeStableIds(input, label);
  for (const id of ids) {
    if (!known.has(id)) throw new RangeError(`${label} 引用了未知 ID ${id}`);
  }
  return ids;
}

function freezeStableIds(input: readonly string[], label: string): readonly string[] {
  assertBoundedItems(input, label);
  const seen = new Set<string>();
  return Object.freeze(
    input.map((id) => {
      assertStableId(id, label);
      assertUnique(seen, id, label);
      return id;
    }),
  );
}

function assertStableId(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string" || !STABLE_ID.test(value)) {
    throw new TypeError(`${label} 必须是稳定 ID`);
  }
}

function assertSemver(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string" || !SEMVER.test(value)) {
    throw new TypeError(`${label} 必须是三段语义版本`);
  }
}

function assertText(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string" || value.trim().length === 0 || value.length > MAX_TEXT_LENGTH) {
    throw new TypeError(`${label} 必须是非空且有界的文本`);
  }
}

function assertBoundedItems(value: readonly unknown[], label: string): void {
  if (!Array.isArray(value) || value.length > MAX_ITEMS) {
    throw new RangeError(`${label} 数量超限`);
  }
}

function assertUnique(seen: Set<string>, value: string, label: string): void {
  if (seen.has(value)) throw new RangeError(`${label} 重复：${value}`);
  seen.add(value);
}

function assertStageMode(value: unknown): asserts value is CourseStageMode {
  if (
    value !== "semantic" &&
    value !== "block-observe" &&
    value !== "block-complete" &&
    value !== "block-compose" &&
    value !== "workspace-evidence"
  ) {
    throw new TypeError("未知课程阶段模式");
  }
}

function assertEvidenceBinding(value: unknown): asserts value is CourseEvidenceBindingKind {
  if (value !== "stage" && value !== "workspace" && value !== "workspace-source") {
    throw new TypeError("未知证据绑定类型");
  }
}

function assertEvidenceTrust(value: unknown): asserts value is CourseEvidenceTrust {
  if (value !== "local" && value !== "verified") throw new TypeError("未知证据信任等级");
}

function assertEvidenceValue(value: unknown, label: string): asserts value is CourseEvidenceValue {
  if (
    value !== null &&
    typeof value !== "string" &&
    typeof value !== "number" &&
    typeof value !== "boolean"
  ) {
    throw new TypeError(`${label} 必须是可持久化的标量`);
  }
  if (typeof value === "string" && value.length > MAX_TEXT_LENGTH) {
    throw new RangeError(`${label} 文本超限`);
  }
  if (typeof value === "number" && !Number.isFinite(value)) {
    throw new TypeError(`${label} 数字必须有限`);
  }
}
