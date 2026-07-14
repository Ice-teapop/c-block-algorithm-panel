# Security Policy

## Supported releases

Only the latest GitHub Release receives security fixes. `v0.0.1` is the first
public release in the reset version line.

The historical `v0.0.1` Universal DMG is unsigned and unnotarized. Public
availability is not an Apple security review, signing claim, or notarization
claim. Future AlgoLatch releases are published only after the signed and
notarized distribution gate passes.

## Reporting a vulnerability

Do not disclose a suspected vulnerability in a public issue. Use
[GitHub private vulnerability reporting](https://github.com/Ice-teapop/c-block-algorithm-panel/security/advisories/new)
and include:

- the affected application and macOS versions;
- a minimal reproduction without private source code or API keys;
- the expected and observed security boundary;
- whether the issue involves untrusted C, filesystem access, IPC, Trace,
  source rewriting, AI credentials, network context, or process cleanup; and
- whether you observed any source, project, credential, or conversation data
  leaving its documented boundary.

The project aims to acknowledge or provide a status update within seven days.
Fix timing depends on severity, reproducibility, and the affected boundary.

## Source-authoritative editing boundary

`main.c` is the only executable source of truth. Flow coordinates, sidecars,
AI conversations, model output, and analysis results cannot directly redefine
program semantics.

A connection or structured edit is accepted only after exact snapshot
validation, candidate-source generation, full reparsing, lossless round-trip
validation, and the required CFG postcondition. Raw text, macro boundaries,
partial CFG, unsafe fan-out, cross-syntax connections, and ambiguous anchors
fail closed.

Deleting or corrupting `flow-view.json`, `scenarios.json`,
`run-history.json`, `tutorial-progress.json`, or `ai-project.json` must not
change `main.c`. A source-fingerprint mismatch invalidates stale flow, Trace,
run, lesson, and AI-edit evidence instead of attempting a guessed migration.

## AI provider and credential boundary

Network AI is optional and disabled until the user configures a provider.

- API keys are encrypted with Electron `safeStorage` and bound to a provider.
- Renderer code receives public configuration and `hasCredential`; it cannot
  read plaintext credentials, ciphertext, request headers, or generic IPC.
- Requests run only in the Electron main process over HTTPS.
- Each request is limited to the selected provider's registered official host.
- Redirects and arbitrary user-defined endpoints are rejected.
- The app does not retry a key against another provider or silently change the
  selected model.
- Timeouts, response-size limits, strict JSON parsing, cancellation,
  malformed responses, and source changes fail closed.

Default AI context contains the current function and bounded diagnostic,
control-flow, run, and conversation evidence. It excludes filesystem paths,
stdin, program arguments, fixtures, and credentials. Full source is sent only
after the user explicitly enables Review changes or Agent mode. The AI window
keeps this full-source disclosure visible while either mode is active.

Third-party providers remain responsible for their own transport, account,
processing, and retention controls after a request reaches their official
service.

## AI Project and source-change boundary

Each managed workspace may store one bounded `ai-project.json`. The main
process validates opaque workspace IDs, exact request shapes, revisions,
message limits, file size, regular-file status, and schema version. Mutations
use a temporary file, `fsync`, and atomic rename. Conversation files never
store provider credentials, request headers, absolute paths, or arbitrary
endpoints.

AI source editing defaults to read-only. Enabling review or controlled
execution does not grant filesystem, command, or arbitrary code-execution
access. The model may only return a structured replacement proposal. The
application binds it to the current workspace revision and source fingerprint,
creates a checkpoint, produces an exact diff, and routes it through the normal
source-authoritative validation path. Review mode also requires explicit user
approval before commit.

Stale, non-unique, malformed, raw, partial, locked, parse-degrading, or
CFG-degrading proposals are rejected. AI cannot create or delete files, write
outside the managed workspace, execute commands, or bypass undo history.

## Trace boundary

Trace uses temporary shadow-source instrumentation; it does not edit project
source. Each session is tied to a source fingerprint and one run authorization.
Sessions support cancellation and stop at 10,000 events or 8 MiB. Unsupported
C layouts, source changes, malformed batches, stale sessions, or resource-limit
failures cannot silently produce a real-path conclusion.

Teaching simulation is visually and structurally separate from real execution.
Simulation output and timing never enter real performance history or represent
observed program behavior.

## Local code-execution boundary

The application compiles and runs C programs on the user's computer. Treat
unknown C files as executable code. Resource limits and best-effort isolation
reduce risk but do not turn arbitrary native code into a safe document format.

When the app reports that macOS Seatbelt isolation is unavailable, trusted-only
execution requires native confirmation for the exact request. The authorization
is single-use and binds the displayed request summary. Renderer code cannot
grant, broaden, or reuse it.

## Distribution trust boundary

Download the `v0.0.1` DMG and `SHA256SUMS.txt` from the same GitHub Release,
then run:

```sh
shasum -a 256 --check SHA256SUMS.txt
```

Do not open the DMG if verification fails. Gatekeeper may require Control-click
→ Open or explicit approval in **System Settings → Privacy & Security**. Do not
disable Gatekeeper globally.

The formal AlgoLatch builder requires a Developer ID Application identity,
Hardened Runtime, a fixed minimal entitlement set, Apple notarization, stapling,
quarantine-aware Gatekeeper assessment, Universal binary verification, and an
installed-application regression. Missing credentials or any failed check stops
the release before upload.

The separate Beta builder explicitly disables signing and notarization, writes
to `release-beta/`, and includes `unsigned` in the filename. It is for local
development only and must never be described or published as Apple-verified.
