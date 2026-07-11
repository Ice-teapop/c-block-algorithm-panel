import { existsSync, readdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { posix, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createScanner, LanguageVariant, SyntaxKind, type Scanner } from "typescript/unstable/ast";
import { describe, expect, it } from "vitest";

interface DependencyRule {
  readonly name: string;
  readonly severity: string;
  readonly from: { readonly path?: string };
  readonly to: { readonly path?: string };
}

interface DependencyConfig {
  readonly forbidden: readonly DependencyRule[];
}

interface SourceImport {
  readonly specifier: string;
}

interface BoundaryViolation {
  readonly rule: string;
  readonly source: string;
  readonly target: string;
}

interface ScannedToken {
  readonly kind: SyntaxKind;
  readonly value: string;
}

interface SourceUnit {
  readonly file: string;
  readonly text: string;
}

const PROJECT_ROOT = fileURLToPath(new URL("../..", import.meta.url));
const require = createRequire(import.meta.url);
const config = require("../../.dependency-cruiser.cjs") as DependencyConfig;

describe("workbench architecture boundaries", () => {
  it("keeps the emitted runtime graph on the same workbench allowlist", () => {
    const rule = requiredRule("workbench-metadata-can-only-import-workbench-or-shared");
    const from = new RegExp(requiredPath(rule.from.path));
    const to = new RegExp(requiredPath(rule.to.path));

    expect(from.test("src/workbench/registry.js")).toBe(true);
    expect(from.test(".dependency-cruiser-build/src/workbench/contracts.js")).toBe(true);
    for (const forbiddenPath of [
      "src/core/editing/model.js",
      "src/core/parser.js",
      "src/ui/workbench-shell.js",
      "src/app/session.js",
      "src/app.js",
      "src/renderer/c-parser.js",
      "electron/main/index.js",
      ".dependency-cruiser-build/src/ui/workbench-shell.js",
      ".dependency-cruiser-build/electron/preload/index.js",
    ]) {
      expect(to.test(forbiddenPath), forbiddenPath).toBe(true);
    }
    for (const allowedPath of [
      "src/workbench/contracts.js",
      "src/shared/protocol.js",
      ".dependency-cruiser-build/src/workbench/registry.js",
      ".dependency-cruiser-build/src/shared/protocol.js",
    ]) {
      expect(to.test(allowedPath), allowedPath).toBe(false);
    }
  });

  it("prevents the emitted core graph from importing workbench metadata", () => {
    const rule = requiredRule("core-cannot-import-workbench-shell-metadata");
    const from = new RegExp(requiredPath(rule.from.path));
    const to = new RegExp(requiredPath(rule.to.path));

    expect(from.test("src/core/parser.js")).toBe(true);
    expect(from.test(".dependency-cruiser-build/src/core/editing/engine.js")).toBe(true);
    expect(to.test("src/workbench/contracts.js")).toBe(true);
    expect(to.test(".dependency-cruiser-build/src/workbench/registry.js")).toBe(true);
    expect(to.test("src/ui/workbench-shell.js")).toBe(false);
  });

  it("keeps analysis out of emitted core write paths while preserving the core-to-analysis ban", () => {
    const analysisRule = requiredRule("analysis-cannot-import-core-write-paths");
    const analysisFrom = new RegExp(requiredPath(analysisRule.from.path));
    const coreWriteTarget = new RegExp(requiredPath(analysisRule.to.path));

    expect(analysisFrom.test("src/analysis/cfg.js")).toBe(true);
    expect(analysisFrom.test(".dependency-cruiser-build/src/analysis/def-use.js")).toBe(true);
    for (const forbiddenPath of [
      "src/core/editing/index.js",
      "src/core/emitter.js",
      "src/core/patch/engine.js",
      ".dependency-cruiser-build/src/core/editing/engine.js",
      ".dependency-cruiser-build/src/core/emitter/index.js",
      ".dependency-cruiser-build/src/core/patch.js",
    ]) {
      expect(coreWriteTarget.test(forbiddenPath), forbiddenPath).toBe(true);
    }
    for (const allowedPath of [
      "src/core/parser.js",
      "src/core/model.js",
      "src/analysis/cfg.js",
      ".dependency-cruiser-build/src/core/blocks.js",
    ]) {
      expect(coreWriteTarget.test(allowedPath), allowedPath).toBe(false);
    }

    const coreRule = requiredRule("core-write-path-cannot-import-analysis");
    const coreFrom = new RegExp(requiredPath(coreRule.from.path));
    const analysisTarget = new RegExp(requiredPath(coreRule.to.path));
    expect(coreFrom.test("src/core/editing/engine.js")).toBe(true);
    expect(analysisTarget.test("src/analysis/cfg.js")).toBe(true);
  });

  it("checks every TypeScript source import before type-only imports are erased", () => {
    const sources = architectureSourceFiles().map((file) => ({
      file,
      text: readFileSync(resolve(PROJECT_ROOT, file), "utf8"),
    }));

    expect(() => enforceSourceBoundaries(sources)).not.toThrow();
  });

  it("rejects type-only imports across both protected boundaries", () => {
    const workbenchProbe = [
      'import type { WorkbenchShell } from "../ui/workbench-shell.js";',
      'export type { EditPlan } from "../core/editing/model.js";',
    ].join("\n");

    expect(() =>
      enforceSourceBoundaries([{ file: "src/workbench/probe.ts", text: workbenchProbe }]),
    ).toThrowError(/workbench-metadata-can-only-import-workbench-or-shared/u);
    expect(inspectSourceImports("src/workbench/probe.ts", workbenchProbe)).toEqual([
      {
        rule: "workbench-metadata-can-only-import-workbench-or-shared",
        source: "src/workbench/probe.ts",
        target: "src/ui/workbench-shell.js",
      },
      {
        rule: "workbench-metadata-can-only-import-workbench-or-shared",
        source: "src/workbench/probe.ts",
        target: "src/core/editing/model.js",
      },
    ]);

    const coreProbe = 'import type { WorkbenchModuleDefinition } from "../workbench/contracts.js";';
    expect(() =>
      enforceSourceBoundaries([{ file: "src/core/model.ts", text: coreProbe }]),
    ).toThrowError(/core-cannot-import-workbench-shell-metadata/u);
    expect(inspectSourceImports("src/core/model.ts", coreProbe)).toEqual([
      {
        rule: "core-cannot-import-workbench-shell-metadata",
        source: "src/core/model.ts",
        target: "src/workbench/contracts.js",
      },
    ]);

    const analysisProbe = 'import type { FunctionCfg } from "../../analysis/model.js";';
    expect(() =>
      enforceSourceBoundaries([{ file: "src/core/editing/engine.ts", text: analysisProbe }]),
    ).toThrowError(/core-write-path-cannot-import-analysis/u);
    expect(inspectSourceImports("src/core/editing/engine.ts", analysisProbe)).toEqual([
      {
        rule: "core-write-path-cannot-import-analysis",
        source: "src/core/editing/engine.ts",
        target: "src/analysis/model.js",
      },
    ]);
  });

  it("rejects analysis type imports from current and future core write paths", () => {
    const analysisProbe = [
      'import type { EditPlan } from "../core/editing/model.js";',
      'export type { SourceEmitter } from "../core/emitter.js";',
      'import type { TextPatch } from "../core/patch/contracts.js";',
    ].join("\n");

    expect(() =>
      enforceSourceBoundaries([{ file: "src/analysis/probe.ts", text: analysisProbe }]),
    ).toThrowError(/analysis-cannot-import-core-write-paths/u);
    expect(inspectSourceImports("src/analysis/probe.ts", analysisProbe)).toEqual([
      {
        rule: "analysis-cannot-import-core-write-paths",
        source: "src/analysis/probe.ts",
        target: "src/core/editing/model.js",
      },
      {
        rule: "analysis-cannot-import-core-write-paths",
        source: "src/analysis/probe.ts",
        target: "src/core/patch/contracts.js",
      },
      {
        rule: "analysis-cannot-import-core-write-paths",
        source: "src/analysis/probe.ts",
        target: "src/core/emitter.js",
      },
    ]);
  });

  it("allows analysis to consume read-only core, analysis-local, and shared types", () => {
    expect(
      inspectSourceImports(
        "src/analysis/probe.ts",
        [
          'import type { CDocument } from "../core/model.js";',
          'import type { CfgNode } from "./contracts.js";',
          'export type { SourceEnvelope } from "../shared/protocol.js";',
        ].join("\n"),
      ),
    ).toEqual([]);
  });

  it("allows workbench-local and explicitly shared type imports", () => {
    expect(
      inspectSourceImports(
        "src/workbench/probe.ts",
        [
          'import type { WorkbenchModuleDefinition } from "./contracts.js";',
          'export type { SourceEnvelope } from "../shared/protocol.js";',
        ].join("\n"),
      ),
    ).toEqual([]);
  });

  it("keeps the renderer coordinator at or below the ADR limit", () => {
    const source = readFileSync(resolve(PROJECT_ROOT, "src/main.ts"), "utf8");
    const physicalLines = source.trimEnd().split(/\r?\n/u).length;

    expect(physicalLines).toBeLessThanOrEqual(500);
  });
});

function architectureSourceFiles(): readonly string[] {
  return ["src/core", "src/workbench", "src/analysis"].flatMap((directory) => {
    const absoluteDirectory = resolve(PROJECT_ROOT, directory);
    if (!existsSync(absoluteDirectory)) return [];
    return collectTypeScriptFiles(absoluteDirectory).map((file) => toProjectPath(file));
  });
}

function collectTypeScriptFiles(directory: string): readonly string[] {
  return readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) => {
      const path = resolve(directory, entry.name);
      if (entry.isDirectory()) return collectTypeScriptFiles(path);
      return entry.isFile() && entry.name.endsWith(".ts") ? [path] : [];
    })
    .sort();
}

function enforceSourceBoundaries(sources: readonly SourceUnit[]): void {
  const violations = sources.flatMap(({ file, text }) => inspectSourceImports(file, text));
  if (violations.length === 0) return;

  throw new Error(
    violations.map(({ rule, source, target }) => `${rule}: ${source} -> ${target}`).join("\n"),
  );
}

function inspectSourceImports(source: string, text: string): readonly BoundaryViolation[] {
  return collectSourceImports(text).flatMap(({ specifier }) => {
    const target = resolveInternalImport(source, specifier);
    if (target === undefined) return [];

    if (
      isInLayer(source, "src/workbench") &&
      !isInLayer(target, "src/workbench") &&
      !isInLayer(target, "src/shared")
    ) {
      return [
        {
          rule: "workbench-metadata-can-only-import-workbench-or-shared",
          source,
          target,
        },
      ];
    }

    if (isInLayer(source, "src/core") && isInLayer(target, "src/workbench")) {
      return [
        {
          rule: "core-cannot-import-workbench-shell-metadata",
          source,
          target,
        },
      ];
    }

    if (isInLayer(source, "src/core") && isInLayer(target, "src/analysis")) {
      return [
        {
          rule: "core-write-path-cannot-import-analysis",
          source,
          target,
        },
      ];
    }

    if (isInLayer(source, "src/analysis") && isCoreWritePath(target)) {
      return [
        {
          rule: "analysis-cannot-import-core-write-paths",
          source,
          target,
        },
      ];
    }

    return [];
  });
}

function collectSourceImports(text: string): readonly SourceImport[] {
  const tokens = scan(text);
  const imports: SourceImport[] = [];

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token === undefined || token.kind !== SyntaxKind.ImportKeyword) continue;
    if (
      tokens[index - 1]?.kind === SyntaxKind.DotToken ||
      tokens[index + 1]?.kind === SyntaxKind.DotToken
    ) {
      continue;
    }

    const next = tokens[index + 1];
    if (next?.kind === SyntaxKind.OpenParenToken) {
      const specifier = tokens[index + 2];
      if (specifier?.kind === SyntaxKind.StringLiteral) {
        imports.push({ specifier: specifier.value });
      }
      continue;
    }

    if (next?.kind === SyntaxKind.StringLiteral) {
      imports.push({ specifier: next.value });
      continue;
    }

    for (let cursor = index + 1; cursor < tokens.length; cursor += 1) {
      const candidate = tokens[cursor];
      if (candidate === undefined || candidate.kind === SyntaxKind.SemicolonToken) break;
      if (candidate.kind === SyntaxKind.StringLiteral) {
        imports.push({ specifier: candidate.value });
        break;
      }
    }
  }

  for (let index = 0; index < tokens.length; index += 1) {
    if (tokens[index]?.kind !== SyntaxKind.ExportKeyword) continue;

    for (let cursor = index + 1; cursor < tokens.length; cursor += 1) {
      const candidate = tokens[cursor];
      if (candidate === undefined || candidate.kind === SyntaxKind.SemicolonToken) break;
      if (
        candidate.kind === SyntaxKind.FromKeyword &&
        tokens[cursor + 1]?.kind === SyntaxKind.StringLiteral
      ) {
        imports.push({ specifier: tokens[cursor + 1]?.value ?? "" });
        break;
      }
    }
  }

  return imports;
}

function scan(text: string): readonly ScannedToken[] {
  const scanner: Scanner = createScanner(true, LanguageVariant.Standard, text);
  const tokens: ScannedToken[] = [];

  for (let kind = scanner.scan(); kind !== SyntaxKind.EndOfFile; kind = scanner.scan()) {
    tokens.push({ kind, value: scanner.getTokenValue() });
  }

  return tokens;
}

function resolveInternalImport(source: string, specifier: string): string | undefined {
  const normalizedSpecifier = specifier.replaceAll("\\", "/");
  if (normalizedSpecifier.startsWith(".")) {
    return normalizeProjectPath(`${posix.dirname(source)}/${normalizedSpecifier}`);
  }
  if (normalizedSpecifier.startsWith("src/") || normalizedSpecifier.startsWith("electron/")) {
    return normalizeProjectPath(normalizedSpecifier);
  }
  return undefined;
}

function normalizeProjectPath(path: string): string {
  const parts: string[] = [];
  for (const part of path.split("/")) {
    if (part === "" || part === ".") continue;
    if (part === "..") parts.pop();
    else parts.push(part);
  }
  return parts.join("/");
}

function isInLayer(path: string, layer: string): boolean {
  return path === layer || path.startsWith(`${layer}/`);
}

function isCoreWritePath(path: string): boolean {
  return /^src\/core\/(?:editing|emitter|patch)(?:$|\/|\.)/u.test(path);
}

function toProjectPath(path: string): string {
  return relative(PROJECT_ROOT, path).replaceAll("\\", "/");
}

function requiredRule(name: string): DependencyRule {
  const rule = config.forbidden.find((candidate) => candidate.name === name);
  if (rule === undefined) throw new Error(`缺少依赖规则 ${name}`);
  expect(rule.severity).toBe("error");
  return rule;
}

function requiredPath(path: string | undefined): string {
  if (path === undefined) throw new Error("依赖规则缺少 path");
  return path;
}
