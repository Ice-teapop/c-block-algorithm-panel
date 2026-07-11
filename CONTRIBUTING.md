# Contributing

## Development environment

- macOS with Node 24 LTS (`>=24 <25`);
- npm 11.11.0, as declared by `packageManager`;
- Apple clang for local C compilation, Trace, and diagnostics;
- dependencies installed from the committed lockfile with `npm ci`.

Confirm the supported toolchain before changing code:

```sh
node --version
npm --version
npm run verify:toolchain
```

Use a focused branch and keep changes within the existing source-authoritative
architecture. Generated views, flow nodes, hints, metrics, scenarios, and
sidecars must not silently replace or rewrite `main.c`.

## Architecture rules

- Flow coordinates are view state. A semantic connection must generate legal C,
  reparse it, and prove the requested CFG postcondition before commit.
- Raw, macro, partial-CFG, unsafe fan-out, cross-syntax, and ambiguous-anchor
  edits fail closed.
- Trace instrumentation belongs in temporary shadow source and must retain
  fingerprint, authorization, cancellation, event, byte, and resource limits.
- Teaching simulations never enter real run history. Runtime measurements and
  Big-O claims remain separate evidence categories.
- Network AI providers are disabled by default and require a reviewed privacy
  contract plus explicit user authorization. Local hints must cite local
  evidence and never auto-edit source.
- New workbench features use contribution contracts instead of expanding the
  application entrypoint. Dependency cycles and architecture-boundary bypasses
  are rejected.
- Sidecar migration failures may reset view/history data but must never rewrite
  `main.c`.

## Required checks

Run the checks relevant to the change; release-affecting changes require the
full set:

```sh
npm run typecheck
npm run format:check
npm test
npm run build
npm run test:e2e
npm run accept:m9
```

`accept:m9` validates release metadata, tag/version rules, workflows, and the
unsigned-beta boundary without network access or building a DMG. It does not
replace unit, architecture, Electron, or installed-app regression.

## Pull requests

- Explain user-visible behavior, evidence, and fail-closed cases.
- Add deterministic tests for new behavior and regressions.
- Preserve arbitrary-C round trips and the local-first, trusted-execution
  boundary.
- Update architecture decisions when a dependency direction, persistence
  contract, Trace boundary, or source-authority rule changes.
- Document whether a new result is real execution, teaching simulation, static
  inference, or heuristic guidance.
- Do not commit generated `release/`, `dist/`, reports, temporary files, or local
  project sidecars.

## Beta release procedure

From a reviewed Node 24 checkout, first pass all release gates:

```sh
npm ci
npm run accept:m9
npm run format:check
npm test
npm run test:e2e
npm run dist:mac:beta
```

The beta workflow accepts only a tag exactly matching
`v<package.json version>`, builds one Universal DMG, creates and verifies
`SHA256SUMS.txt`, and publishes a GitHub prerelease. `accept:m9` itself does not
publish, tag, or upload anything.

The beta builder explicitly disables signing, Hardened Runtime, and
notarization. Stable `v0.1.0` remains blocked until a reviewed production config
uses Developer ID signing, minimal entitlements, Hardened Runtime, notarization,
stapling, and installed-app regression.
