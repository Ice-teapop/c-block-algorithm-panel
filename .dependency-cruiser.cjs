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
