import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { textRange } from "../../src/core/model.js";
import type { FlowLockReason, FlowNode, FlowPort } from "../../src/flow/index.js";
import { flowCanvasNodePresentation } from "../../src/ui/flow-canvas.js";

const HAN = /[\u3400-\u9fff]/u;

describe("flow canvas locale presentation", () => {
  it("traverses every node, port and lock semantic without leaking Chinese UI copy in English", () => {
    const kinds: readonly FlowNode["kind"][] = Object.freeze([
      "module",
      "start",
      "end",
      "statement",
      "declaration",
      "branch",
      "loop",
      "switch",
      "assert",
      "control",
      "raw",
    ]);
    const edgeKinds: readonly Exclude<FlowPort["edgeKind"], null>[] = Object.freeze([
      "entry",
      "next",
      "branch-true",
      "branch-false",
      "switch-case",
      "switch-default",
      "switch-miss",
      "break",
      "continue",
      "goto",
      "return",
      "terminate",
    ]);
    const ports = Object.freeze([
      port("input", null, "输入"),
      ...edgeKinds.map((edgeKind) => port("output", edgeKind, `中文端口 ${edgeKind}`)),
    ]);
    const lockReasons: readonly FlowLockReason[] = Object.freeze([
      lockReason("translation-unit", "函数外源码属于 Translation Unit", null, null),
      lockReason("partial-cfg", "CFG 不完整", "unsupported-syntax", null),
      lockReason("raw-block", "原始源码区域不可安全改线", null, "parse-error"),
    ]);

    for (const kind of kinds) {
      const presentation = flowCanvasNodePresentation(
        node(kind, kind === "raw" ? "Raw · 解析恢复" : `source label ${kind}`, ports, lockReasons),
        "en",
      );
      expect(presentation.kind).not.toMatch(HAN);
      expect(presentation.portLabels).toHaveLength(ports.length);
      expect(presentation.portLabels.every((label) => !HAN.test(label))).toBe(true);
      expect(presentation.lockReasons).toHaveLength(lockReasons.length);
      expect(presentation.lockReasons.every((reason) => !HAN.test(reason))).toBe(true);
      if (kind === "raw") expect(presentation.label).toBe("Raw · parser recovery");
    }
  });

  it("preserves source-backed labels instead of translating user code", () => {
    const sourceLabel = 'printf("用户源码");';
    const presentation = flowCanvasNodePresentation(
      node("statement", sourceLabel, Object.freeze([]), Object.freeze([])),
      "en",
    );

    expect(presentation.label).toBe(sourceLabel);
    expect(Object.isFrozen(presentation)).toBe(true);
    expect(Object.isFrozen(presentation.portLabels)).toBe(true);
    expect(Object.isFrozen(presentation.lockReasons)).toBe(true);
  });

  it("statically keeps live locale redraw and translated detail/minimap paths wired", () => {
    const canvasSource = readFileSync(
      new URL("../../src/ui/flow-canvas.ts", import.meta.url),
      "utf8",
    );
    const controllerSource = readFileSync(
      new URL("../../src/app/flow-workbench-controller.ts", import.meta.url),
      "utf8",
    );

    expect(canvasSource).toContain('addEventListener?.("workbench-locale-change", onLocaleChange)');
    expect(canvasSource).toContain(
      'removeEventListener?.("workbench-locale-change", onLocaleChange)',
    );
    expect(canvasSource).toContain('english ? "Canvas overview" : "画布概览"');
    expect(canvasSource).toContain('english ? "Node details" : "节点详情"');
    expect(canvasSource).toContain('flowCanvasNodePresentation(node, english ? "en" : "zh-CN")');
    expect(controllerSource).toContain('options.elements.shell.dataset.locale === "en"');
    expect(controllerSource).toContain('english ? "Plain-language explanation" : "通俗解释"');
  });
});

function node(
  kind: FlowNode["kind"],
  label: string,
  ports: readonly FlowPort[],
  lockReasons: readonly FlowLockReason[],
): FlowNode {
  return Object.freeze({
    id: `node:${kind}`,
    functionId: "fn:main",
    sourceNodeId: `source:${kind}`,
    kind,
    label,
    nodeType: kind,
    range: textRange(0, 1),
    ownerBlockRange: textRange(0, 1),
    sourceText: "x;",
    reachable: true,
    locked: lockReasons.length > 0,
    lockReasons,
    allowsFanOut: kind === "branch" || kind === "switch" || kind === "loop",
    defaultPosition: Object.freeze({ x: 0, y: 0 }),
    ports,
  });
}

function port(
  direction: FlowPort["direction"],
  edgeKind: FlowPort["edgeKind"],
  label: string,
): FlowPort {
  return Object.freeze({
    id: `port:${direction}:${edgeKind ?? "input"}`,
    nodeId: "node",
    direction,
    channel: "control",
    edgeKind,
    label,
    editable: true,
    capacity: direction === "input" ? "many" : "one",
    allowsFanOut: false,
  });
}

function lockReason(
  code: FlowLockReason["code"],
  message: string,
  partialCode: FlowLockReason["partialCode"],
  rawReason: FlowLockReason["rawReason"],
): FlowLockReason {
  return Object.freeze({
    code,
    message,
    range: textRange(0, 1),
    partialCode,
    rawReason,
  });
}
