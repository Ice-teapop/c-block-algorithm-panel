# Privacy

Last updated: 2026-07-12

C 积木算法面板 is local-first software. The current beta does not include
telemetry, analytics, advertising, accounts, cloud synchronization, or a live
AI provider. It does not upload source code, traces, scenarios, diagnostics, or
execution results.

## Data stored locally

- Managed projects are stored under `~/Documents/C Algorithm Workbench/`.
- `main.c` is the authoritative program source. `entry.json` stores workspace
  metadata.
- `flow-view.json` may store source fingerprints, node coordinates, viewport,
  drafts, checkpoints, and panel layout. It is view state, not a second program.
- `scenarios.json` may store local inputs, expected output, branch targets, and
  size generators.
- `run-history.json` may store up to 100 bounded run summaries. Teaching
  simulations are excluded from real performance history.
- Workspace preferences, theme, and interface state may be stored in the
  Electron application data directory.
- Compilation, diagnostics, shadow-source traces, and tests create bounded
  temporary files. Cleanup is best effort after completion, cancellation, or
  failure.

Sidecars are created only when the corresponding project feature is saved. A
damaged, unsupported, or stale sidecar is reset or ignored without modifying
`main.c`.

## Local execution

The app invokes local system tools such as Apple clang and executes C programs
selected by the user. Those processes can access data according to effective
macOS permissions and the isolation mode shown by the app. Runtime stdin,
arguments, fixtures, stdout, stderr, resource measurements, and trace events
remain on the device.

## AI boundary

The beta's `LocalEvidenceMentor` and scenario provider are deterministic and
local. They inspect local static-analysis facts, program structure, real path
evidence, and run history to produce suggestions. They do not contact an
external model, upload data, automatically edit source, or claim that a hint is
proof.

Any future network AI provider must be disabled by default, identify the
provider and destination, explain exactly what data would leave the device, and
obtain explicit authorization in Settings before transmission.

## Deletion and retention

Run history is capped at 100 entries per managed project. Trace sessions are
bounded by event and byte limits and are not a permanent source of truth.

Deleting the application does not automatically delete managed projects in the
Documents folder. Users can inspect, back up, or remove those project folders
through Finder. Before deleting a project or custom template, verify whether an
existing project still depends on its source snapshot; retiring a template does
not delete C already generated into a project.
