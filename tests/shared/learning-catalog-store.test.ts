import { describe, expect, it } from "vitest";
import {
  LEARNING_CATALOG_MAX_BYTES,
  emptyLearningCatalogDocument,
  validateLearningCatalogDocument,
} from "../../src/shared/learning-catalog-store.js";

describe("learning catalog store contract", () => {
  it("canonicalizes a valid versioned object and exposes its revision", () => {
    const raw = '{ "tombstones": [], "templates": [], "revision": 4, "schemaVersion": 1 }';

    expect(validateLearningCatalogDocument(raw)).toEqual({
      ok: true,
      document: {
        revision: 4,
        serialized: '{"tombstones":[],"templates":[],"revision":4,"schemaVersion":1}',
      },
    });
  });

  it.each([
    ["array", "[]"],
    ["wrong schema", '{"schemaVersion":2,"revision":0,"templates":[],"tombstones":[]}'],
    ["negative revision", '{"schemaVersion":1,"revision":-1,"templates":[],"tombstones":[]}'],
    ["extra key", '{"schemaVersion":1,"revision":0,"templates":[],"tombstones":[],"path":"/tmp"}'],
  ])("rejects an invalid %s document", (_label, raw) => {
    expect(validateLearningCatalogDocument(raw)).toEqual({ ok: false, reason: "invalid" });
  });

  it("rejects documents over the UTF-8 byte limit", () => {
    const oversized = "你".repeat(Math.ceil(LEARNING_CATALOG_MAX_BYTES / 3) + 1);
    expect(validateLearningCatalogDocument(oversized)).toEqual({
      ok: false,
      reason: "too-large",
    });
  });

  it("creates a legal empty document without a deletion sentinel", () => {
    const empty = emptyLearningCatalogDocument(7);
    expect(validateLearningCatalogDocument(empty.serialized)).toEqual({
      ok: true,
      document: empty,
    });
    expect(JSON.parse(empty.serialized)).toEqual({
      schemaVersion: 1,
      revision: 7,
      templates: [],
      tombstones: [],
    });
  });
});
