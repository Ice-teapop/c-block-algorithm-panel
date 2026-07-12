# Toolchain lock

M0 resolves every direct dependency once and commits the resulting manifest and lockfile. Later milestones use `npm ci`; dependency upgrades are isolated changes that rerun every completed acceptance gate.

## Runtime

| Component           | Supported / locked version |
| ------------------- | -------------------------- |
| Node.js             | 24.x LTS                   |
| npm                 | 11.11.0                    |
| Apple clang         | 17.x–21.x                  |
| macOS release build | Universal x64 + arm64      |

## Direct development dependencies

| Package                | Locked version |
| ---------------------- | -------------- |
| `@codemirror/commands` | 6.10.4         |
| `@codemirror/lang-cpp` | 6.0.3          |
| `@codemirror/language` | 6.12.4         |
| `@codemirror/state`    | 6.7.0          |
| `@codemirror/view`     | 6.43.6         |
| `@lezer/highlight`     | 1.2.3          |
| `@playwright/test`     | 1.61.1         |
| `@types/node`          | 24.13.3        |
| `codemirror`           | 6.0.2          |
| `concurrently`         | 10.0.3         |
| `dependency-cruiser`   | 17.4.3         |
| `electron`             | 43.0.0         |
| `electron-builder`     | 26.15.3        |
| `fast-check`           | 4.9.0          |
| `prettier`             | 3.9.5          |
| `tree-sitter-c`        | 0.24.1         |
| `typescript`           | 7.0.2          |
| `vite`                 | 8.1.3          |
| `vitest`               | 4.1.10         |
| `web-tree-sitter`      | 0.26.10        |

The parser dependencies entered at M1. Their browser runtime and C grammar WASM files are vendored under `resources/wasm/` and verified byte-for-byte against the locked npm packages after every renderer build.

## Electron build contract

1. `npm run dev` starts Vite, waits for its loopback URL, then opens Electron.
2. `npm run build` emits the renderer to `dist/`, the main process under `dist-electron/electron/main/`, and a bundled CommonJS preload to `dist-electron/preload/index.cjs`.
3. The preload stays CommonJS because sandboxed Electron preload scripts cannot use ESM imports.
4. `npm run test:e2e` builds and launches both the production `file://` application and the Vite HTTP development path through Playwright; both must load the two parser WASM modules in a real Electron renderer.
5. `npm run pack` creates an unpacked application; `npm run dist:mac` creates the macOS distributable.

## Reproducibility rules

1. `package.json` must use exact direct dependency versions.
2. `package-lock.json` must be committed and agree with the manifest.
3. Normal verification uses `npm ci`, never a floating install.
4. `npm run verify:toolchain` executes and verifies Node, npm and `/usr/bin/clang`, and rejects runtime drift or range-based direct dependencies. Apple clang remains fail-closed outside 17.x–21.x; the runtime additionally requires `/usr/bin/clang` and `xcrun` to resolve the same major version, a shared trusted Developer root for clang and the SDK, a matching dynamic sanitizer runtime, and a successful Seatbelt canary.
