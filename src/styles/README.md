# Renderer styles

`../style.css` is the shared stylesheet manifest. Its import order is a compatibility contract:
the files are consecutive slices of the former monolithic stylesheet, so moving an import can
change existing selector precedence even when specificity is unchanged.

## Ownership

- `core/`: global tokens, resets, the application shell, and shared controls.
- `workbench/`: source projection, editing, navigation, flow canvas, and pane layout.
- `dashboard/`, `library/`, `analysis/`, `ai/`: feature-owned pages and panels.
- `runtime/`: scenarios, traces, metrics, and mentor surfaces.
- `tutorials/`: lesson shells, semantic scenes, runtime visualizations, and late overrides.

Feature-specific stylesheets loaded by HTML remain outside this manifest. In particular,
`ui/foa-transition-prototype-stage.css` and `ui/ai-workspace-window.css` intentionally load after
the shared entry point.

## Cascade rules

1. Do not reorder manifest imports as part of a feature change.
2. Keep `tutorials/final-overrides.css` after legacy and theme rules; its position is intentional.
3. Do not introduce `@layer` without a dedicated migration because it changes cascade priority.
4. Resolve asset URLs from the physical stylesheet location. Moving a relative `url()` changes its
   base path.
5. Keep each stylesheet at or below the 900-line budget enforced by
   `tests/config/style-manifest.test.ts`.

## Comment convention

- `Section:` identifies the selectors owned by a region.
- `Cascade contract:` explains why source order must not change.
- `Compatibility:` documents browser, zoom, container, or legacy behavior.
- `Layout invariant:` records a non-obvious geometry constraint.

Comments should explain ownership or a necessary constraint, not record milestone names or visual
preferences. The `Interaction foundation` and `=== v6 guided lesson rail` markers are currently
read by `tests/ui/interaction-foundation.test.ts`; retain them until that test no longer uses comment
boundaries.

## Verification

After changing the manifest or moving rules between files, run:

```sh
npx vitest run tests/config/style-manifest.test.ts tests/ui/interaction-foundation.test.ts tests/ui/block-library-manager.test.ts
npm run build:renderer
```
