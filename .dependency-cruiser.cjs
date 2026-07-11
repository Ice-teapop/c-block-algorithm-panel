/** @type {import("dependency-cruiser").IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: "no-unresolved-code-imports",
      severity: "error",
      from: {},
      to: {
        couldNotResolve: true,
        // v17 cannot resolve Vite query assets or web-tree-sitter's nested
        // conditional exports. These exact imports are independently checked
        // by TypeScript, Vite, and verify-wasm-assets.mjs.
        pathNot: "(?:\\.css$|\\.wasm\\?url$|^web-tree-sitter$)",
      },
    },
    {
      name: "no-circular",
      severity: "error",
      from: {},
      to: { circular: true },
    },
    {
      name: "renderer-cannot-import-electron-processes",
      severity: "error",
      from: { path: "^(?:\\.dependency-cruiser-build/)?src/(?!shared/)" },
      to: { path: "^(?:\\.dependency-cruiser-build/)?electron/" },
    },
    {
      name: "main-cannot-import-renderer",
      severity: "error",
      from: { path: "^(?:\\.dependency-cruiser-build/)?electron/main/" },
      to: { path: "^(?:\\.dependency-cruiser-build/)?src/(?!shared/)" },
    },
    {
      name: "preload-cannot-import-main",
      severity: "error",
      from: { path: "^(?:\\.dependency-cruiser-build/)?electron/preload/" },
      to: { path: "^(?:\\.dependency-cruiser-build/)?electron/main/" },
    },
    {
      name: "core-write-path-cannot-import-analysis",
      severity: "error",
      from: { path: "^(?:\\.dependency-cruiser-build/)?src/core/" },
      to: { path: "^(?:\\.dependency-cruiser-build/)?src/analysis/" },
    },
    {
      // Analysis is a read-only consumer. It must not acquire patch-producing
      // interfaces, including write paths that are added after M5.
      name: "analysis-cannot-import-core-write-paths",
      severity: "error",
      from: { path: "^(?:\\.dependency-cruiser-build/)?src/analysis/" },
      to: {
        path: "^(?:\\.dependency-cruiser-build/)?src/core/(?:editing|emitter|patch)(?:/|\\.|$)",
      },
    },
    {
      // This protects the emitted runtime graph. The matching TypeScript source
      // fitness test also catches imports erased by compilation (import type).
      name: "workbench-metadata-can-only-import-workbench-or-shared",
      severity: "error",
      from: { path: "^(?:\\.dependency-cruiser-build/)?src/workbench/" },
      to: {
        path: "^(?:\\.dependency-cruiser-build/)?(?:src/(?!workbench(?:/|\\.)|shared(?:/|\\.))|electron/)",
      },
    },
    {
      name: "core-cannot-import-workbench-shell-metadata",
      severity: "error",
      from: { path: "^(?:\\.dependency-cruiser-build/)?src/core/" },
      to: { path: "^(?:\\.dependency-cruiser-build/)?src/workbench/" },
    },
    {
      // ADR-0003: flow is a pure projection/intent domain. It may consume
      // immutable core/analysis facts, but never UI, Electron or patch writers.
      name: "flow-domain-cannot-import-ui-or-write-paths",
      severity: "error",
      from: { path: "^(?:\\.dependency-cruiser-build/)?src/flow/" },
      to: {
        path: "^(?:\\.dependency-cruiser-build/)?(?:electron/|src/(?:ui|app|workbench|core/(?:editing|emitter|patch))(?:/|\\.|$))",
      },
    },
    {
      name: "ai-cannot-import-core-write-interfaces",
      severity: "error",
      from: { path: "^(?:\\.dependency-cruiser-build/)?src/ai/" },
      to: {
        path: "^(?:\\.dependency-cruiser-build/)?src/core/(?:edit|emitter|patch)(?:/|\\.)",
      },
    },
  ],
  options: {
    doNotFollow: { path: "node_modules" },
  },
};
