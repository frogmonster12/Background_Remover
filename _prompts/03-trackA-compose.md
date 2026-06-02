# Prompt 3 — Track A: compose + formats (canvas) — worktree `track/compose`

Pure canvas work. No model dependency — you test against a static mask fixture, so this runs fully in parallel with the inference spike. Read `CLAUDE.md`. Code against `src/contracts.ts` (`AlphaMask`, `BackgroundMode`, `CompositeOptions`); do not change it.

## Scope (touch only these files)
`src/compose.ts`, `src/formats.ts`, and their colocated tests. Keep these pure (no DOM globals beyond `OffscreenCanvas`/`ImageData` so they unit-test under happy-dom; where a real canvas is needed, guard it so tests can pass an `OffscreenCanvas`).

## Deliverables — `formats.ts` (more input formats, a v2 goal)
1. Decode PNG / JPEG / WEBP / GIF via `createImageBitmap`.
2. **HEIC support, lazy-loaded:** dynamically import `heic2any` only when a HEIC file is dropped (flag the added dependency in `PROGRESS.md` and confirm Node-24 compatibility). Convert HEIC -> bitmap.
3. A single `decodeToBitmap(file): Promise<ImageBitmap>` that handles all formats and throws a typed error for unsupported types.

## Deliverables — `compose.ts` (better edges + background replacement, both v2 goals)
1. `applyMask(image, mask, options): canvas` that composites the cutout.
2. Background modes per `CompositeOptions`: `transparent` (default), `color` (solid), `blur` (blurred copy of the original behind the subject), `image` (user-supplied background, cover-fit).
3. **Edge refinement:** a `feather`/erode pass on the mask alpha (configurable amount) to kill fringe halos around hair. Pure array math on the alpha channel.
4. Export helpers: `toPNG(canvas)` (preserves alpha) and `toJPEG(canvas, quality)` (for opaque backgrounds).

## Verification (report exact pass/fail counts)
- Unit tests (Vitest) for `compose.ts`: feed a known small image + a known mask; assert that transparent mode yields transparent pixels where mask alpha is 0; that color/blur/image modes fill those pixels; that feather softens a hard mask edge (alpha gradient appears).
- Unit tests for `formats.ts`: each format decodes to a bitmap of expected dimensions; unsupported type throws the typed error. Mock/skip the actual HEIC binary if it can't run headless, but test the dispatch path.
- `npm run typecheck` clean.
- Commit on `track/compose`: `feat(compose): canvas compositing, bg replace, feather, multi-format decode`.
- Update `PROGRESS.md`.
