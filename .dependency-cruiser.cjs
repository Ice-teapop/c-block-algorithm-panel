/** @type {import("dependency-cruiser").IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: "no-unresolved-code-imports",
      severity: "error",
      from: {},
      to: { couldNotResolve: true, pathNot: "\\.css$" },
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
