# Toolchain lock

M0 resolves every direct dependency once and commits the resulting manifest and lockfile. Later milestones use `npm ci`; dependency upgrades are isolated changes that rerun every completed acceptance gate.

## Runtime

| Component           | Supported / locked version |
| ------------------- | -------------------------- |
| Node.js             | 24.x LTS                   |
| npm                 | 11.11.0                    |
| Apple clang         | 17.x–21.x                  |
| macOS release build | Universal x64 + arm64      |
| Windows             | Windows 10/11 x64          |
| llvm-mingw          | 20260616 / LLVM 22.1.8     |
| Windows target      | x86_64-w64-windows-gnu     |
| Windows installer   | NSIS one-click per-user    |

The Windows archive is fixed to
`llvm-mingw-20260616-ucrt-x86_64.zip` (187,504,083 bytes), SHA-256
`b9b68a4d276e16fa25802aaba458e4638f64b3884c290aaccdc2d87083b6ca35`.
`npm run prepare:win-toolchain` accepts only the registered HTTPS source and
bounded GitHub release redirects, validates the size and digest before
extraction, rejects unsafe archive paths, and stages the trimmed runtime under
`build/windows/x64/`.

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
5. `npm run pack` creates an unpacked application; `npm run dist:mac` creates
   the macOS distributable.
6. `npm run dist:win:beta` creates an explicit unsigned Windows x64 test
   installer; `npm run dist:win` requires Windows signing credentials and
   creates the Authenticode release candidate.
7. Both Windows packages copy `build/windows/x64/` to
   `resources/windows-runtime/`. The staged manifest binds the llvm-mingw
   release, target, compiler and Job Object broker digests.

## Reproducibility rules

1. `package.json` must use exact direct dependency versions.
2. `package-lock.json` must be committed and agree with the manifest.
3. Normal verification uses `npm ci`, never a floating install.
4. `npm run verify:toolchain` executes and verifies Node, npm and `/usr/bin/clang`, and rejects runtime drift or range-based direct dependencies. Apple clang remains fail-closed outside 17.x–21.x; the runtime additionally requires `/usr/bin/clang` and `xcrun` to resolve the same major version, a shared trusted Developer root for clang and the SDK, a matching dynamic sanitizer runtime, and a successful Seatbelt canary.
5. Windows release preparation verifies the pinned archive before extraction,
   compiles the Job Object broker with the staged compiler, runs a compile
   canary, and atomically installs the staged directory.
6. The Windows runtime rechecks its fixed manifest and critical file hashes.
   Missing or modified compiler/broker files disable native execution instead
   of falling back to an unverified system compiler.
7. Windows CI runs on `windows-2025` with Node 24 and npm 11.11.0, builds the
   unsigned NSIS candidate, then installs, launches, exercises and uninstalls
   it. Formal release additionally requires Authenticode and the signed
   installed-application gate.
