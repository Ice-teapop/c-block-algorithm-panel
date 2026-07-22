import { describe, expect, it } from "vitest";
import {
  createRuntimeDataFlowVerifier,
  type RuntimeDataFlowBinding,
  type RuntimeEventEnvelope,
  type RuntimeStateEvent,
  type RuntimeSymbolAnchor,
} from "../../src/runtime/data-flow-verifier.js";

const VALUE: RuntimeSymbolAnchor = Object.freeze({
  functionPath: "main",
  declarationStart: 12,
  declarationHash: "value-hash",
});
const VALUES: RuntimeSymbolAnchor = Object.freeze({
  functionPath: "main",
  declarationStart: 24,
  declarationHash: "values-hash",
});
const SEARCH: RuntimeSymbolAnchor = Object.freeze({
  functionPath: "search",
  declarationStart: 2,
  declarationHash: "search-hash",
});

describe("runtime data-flow verifier", () => {
  it("reduces real scalar, array, branch, stack, relation and stdout evidence", () => {
    const verifier = createRuntimeDataFlowVerifier(binding());
    verifier.accept(envelope(1, { kind: "scalar-write", symbol: VALUE, value: observed("7") }));
    verifier.accept(envelope(2, { kind: "branch", predicateId: "predicate.found", taken: true }));
    verifier.accept(
      envelope(3, { kind: "array-write", symbol: VALUES, index: 1, value: observed("9") }),
    );
    verifier.accept(
      envelope(4, { kind: "call-enter", frameId: "frame.search.1", function: SEARCH, depth: 0 }),
    );
    verifier.accept(envelope(5, { kind: "call-exit", frameId: "frame.search.1", depth: 0 }));
    verifier.accept(
      envelope(6, { kind: "object-link", source: VALUE, targetObjectId: "object.7" }),
    );
    verifier.accept(envelope(7, { kind: "stdout", text: "9\n" }));

    const snapshot = verifier.complete("9\n");
    expect(snapshot).toMatchObject({
      status: "consistent",
      lastSequence: 7,
      eventCount: 7,
      scalarValues: { value: { status: "observed", text: "7" } },
      branches: { "predicate.found": true },
      stdout: "9\n",
    });
    expect(snapshot.arrayValues.values).toEqual([
      { index: 1, value: { status: "observed", typeTag: "int", text: "9" } },
    ]);
    expect(snapshot.stack).toEqual([]);
    expect(snapshot.objectLinks).toEqual([{ sourceSymbolId: "value", targetObjectId: "object.7" }]);
    expect(snapshot.observedRelationIds).toEqual(["relation.value-output", "relation.values"]);
  });

  it.each([
    {
      name: "sequence gap",
      events: [envelope(2, { kind: "line" })],
      code: "sequence",
    },
    {
      name: "unknown symbol",
      events: [
        envelope(1, {
          kind: "scalar-write",
          symbol: { ...VALUE, declarationHash: "unknown" },
          value: observed("1"),
        }),
      ],
      code: "symbol",
    },
    {
      name: "array out of range",
      events: [
        envelope(1, { kind: "array-write", symbol: VALUES, index: 3, value: observed("1") }),
      ],
      code: "array-index",
    },
    {
      name: "stack pop mismatch",
      events: [envelope(1, { kind: "call-exit", frameId: "missing", depth: 0 })],
      code: "stack",
    },
  ])("fails closed on $name", ({ events, code }) => {
    const verifier = createRuntimeDataFlowVerifier(binding());
    for (const event of events) verifier.accept(event);
    expect(verifier.getSnapshot()).toMatchObject({
      status: "mismatch",
      issues: [{ code }],
    });
  });

  it("rejects stale provenance and never substitutes teaching evidence", () => {
    const verifier = createRuntimeDataFlowVerifier(binding());
    const event = envelope(1, { kind: "line" });
    verifier.accept({
      ...event,
      provenance: { ...event.provenance, sourceFingerprint: "other-source" },
    });
    expect(verifier.getSnapshot()).toMatchObject({
      status: "mismatch",
      issues: [{ code: "provenance" }],
    });
  });

  it("marks unavailable values partial and source changes stale", () => {
    const verifier = createRuntimeDataFlowVerifier(binding());
    verifier.accept(
      envelope(1, {
        kind: "scalar-write",
        symbol: VALUE,
        value: { status: "unavailable", reason: "unsupported type" },
      }),
    );
    expect(verifier.complete("").status).toBe("partial");
    expect(verifier.invalidate().status).toBe("stale");
  });

  it("rejects stdout that does not match the real run result", () => {
    const verifier = createRuntimeDataFlowVerifier(binding());
    verifier.accept(envelope(1, { kind: "stdout", text: "wrong\n" }));
    expect(verifier.complete("expected\n")).toMatchObject({
      status: "mismatch",
      issues: [{ code: "stdout" }],
    });
  });

  it("does not certify an empty trace with empty stdout", () => {
    const verifier = createRuntimeDataFlowVerifier(binding());
    expect(verifier.complete("")).toMatchObject({
      status: "partial",
      eventCount: 0,
      issues: [{ code: "evidence" }],
    });
  });

  it.each([
    {
      name: "unknown event kind",
      mutate: (valid: RuntimeEventEnvelope) => ({ ...valid, event: { kind: "mystery" } }),
    },
    {
      name: "missing event",
      mutate: (valid: RuntimeEventEnvelope) => ({ ...valid, event: undefined }),
    },
    {
      name: "invalid observed value",
      mutate: (valid: RuntimeEventEnvelope) => ({
        ...valid,
        event: {
          kind: "scalar-write",
          symbol: VALUE,
          value: { status: "observed", typeTag: "int" },
        },
      }),
    },
    {
      name: "invalid provenance shape",
      mutate: (valid: RuntimeEventEnvelope) => ({ ...valid, provenance: null }),
    },
  ])("fails closed without throwing on $name", ({ mutate }) => {
    const verifier = createRuntimeDataFlowVerifier(binding());
    const malformed = mutate(envelope(1, { kind: "line" })) as unknown as RuntimeEventEnvelope;
    expect(() => verifier.accept(malformed)).not.toThrow();
    expect(verifier.getSnapshot()).toMatchObject({
      status: "mismatch",
      issues: [{ code: "event" }],
    });
  });

  it("requires configured symbol, relation, predicate and minimum event evidence", () => {
    const configured = {
      ...binding(),
      requiredEvidence: {
        minimumEventCount: 3,
        symbolIds: ["value"],
        relationIds: ["relation.value-output"],
        predicateIds: ["predicate.found"],
      },
    } satisfies RuntimeDataFlowBinding;

    const incomplete = createRuntimeDataFlowVerifier(configured);
    incomplete.accept(envelope(1, { kind: "scalar-write", symbol: VALUE, value: observed("7") }));
    const incompleteSnapshot = incomplete.complete("");
    expect(incompleteSnapshot.status).toBe("partial");
    expect(incompleteSnapshot.issues).toHaveLength(2);
    expect(incompleteSnapshot.issues.every(({ code }) => code === "evidence")).toBe(true);

    const complete = createRuntimeDataFlowVerifier(configured);
    complete.accept(envelope(1, { kind: "scalar-write", symbol: VALUE, value: observed("7") }));
    complete.accept(envelope(2, { kind: "branch", predicateId: "predicate.found", taken: true }));
    complete.accept(envelope(3, { kind: "line" }));
    expect(complete.complete("")).toMatchObject({ status: "consistent", eventCount: 3 });
  });

  it("marks a targeted object relation only when the bound target symbol matches", () => {
    const configured = {
      ...binding(),
      relations: [
        ...binding().relations,
        { id: "relation.value-values", sourceSymbolId: "value", targetSymbolId: "values" },
      ],
    } satisfies RuntimeDataFlowBinding;

    const missingTarget = createRuntimeDataFlowVerifier(configured);
    missingTarget.accept(
      envelope(1, { kind: "object-link", source: VALUE, targetObjectId: "object.values" }),
    );
    expect(missingTarget.getSnapshot().observedRelationIds).not.toContain("relation.value-values");

    const wrongTarget = createRuntimeDataFlowVerifier(configured);
    wrongTarget.accept(
      envelope(1, {
        kind: "object-link",
        source: VALUE,
        targetObjectId: "object.values",
        targetSymbolId: "search",
      }),
    );
    expect(wrongTarget.getSnapshot().observedRelationIds).not.toContain("relation.value-values");

    const matchingTarget = createRuntimeDataFlowVerifier(configured);
    matchingTarget.accept(
      envelope(1, {
        kind: "object-link",
        source: VALUE,
        targetObjectId: "object.values",
        targetSymbolId: "values",
      }),
    );
    expect(matchingTarget.getSnapshot().observedRelationIds).toContain("relation.value-values");
  });
});

function binding(): RuntimeDataFlowBinding {
  return Object.freeze({
    workspaceId: "workspace-1",
    sessionId: "trace-session-1",
    sourceFingerprint: "source-fingerprint",
    scenarioId: "scenario-1",
    inputDigest: "input-digest",
    symbolTableVersion: "symbols-v1",
    symbols: Object.freeze([
      Object.freeze({ id: "value", anchor: VALUE, storage: "scalar" as const }),
      Object.freeze({ id: "values", anchor: VALUES, storage: "array" as const, arrayLength: 3 }),
      Object.freeze({ id: "search", anchor: SEARCH, storage: "function" as const }),
    ]),
    predicateIds: Object.freeze(["predicate.found"]),
    relations: Object.freeze([
      Object.freeze({ id: "relation.value-output", sourceSymbolId: "value", targetSymbolId: null }),
      Object.freeze({ id: "relation.values", sourceSymbolId: "values", targetSymbolId: null }),
    ]),
  });
}

function envelope(sequence: number, event: RuntimeStateEvent): RuntimeEventEnvelope {
  return Object.freeze({
    schemaVersion: 2,
    provenance: Object.freeze({
      kind: "real-trace" as const,
      workspaceId: "workspace-1",
      sessionId: "trace-session-1",
      sourceFingerprint: "source-fingerprint",
      scenarioId: "scenario-1",
      inputDigest: "input-digest",
      symbolTableVersion: "symbols-v1",
    }),
    sequence,
    elapsedMs: sequence * 10,
    sourceLine: 12,
    event,
  });
}

function observed(text: string) {
  return Object.freeze({ status: "observed" as const, typeTag: "int", text });
}
