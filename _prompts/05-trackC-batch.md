# Prompt 5 — Track C: batch queue + ZIP — worktree `track/batch`

Mirrors the desktop app's batch + ZIP behavior. No model dependency — wraps the single-image contract in a queue and tests against the mock. Runs in parallel. Read `CLAUDE.md`. Code against `src/contracts.ts`; do not change it.

## Scope (touch only these files)
`src/batch.ts` and its colocated test, plus a thin batch view component that the UI track will slot in at integration. Do not modify `contracts.ts`, `compose.ts`, or `worker.ts`.

## Deliverables
1. `src/batch.ts`: a queue that accepts N files, processes them one at a time through the inference interface (mock for now), tracks per-item status (`queued | processing | done | error`) and overall progress, and surfaces results. Keep it framework-agnostic (plain TS, event-emitter or callback based) so the UI can subscribe.
2. Concurrency control: process sequentially by default (model is single-threaded in the worker); make the limit a constant so integration can tune it.
3. Per-item error isolation: one failed image must not abort the batch.
4. ZIP export of all completed cutouts. Dedupe filenames inside the archive (mirror the desktop app's `name`, `name_1`, `name_2` scheme). Use a small, Node-24-compatible, MIT/Apache zip lib (e.g. `fflate`) — confirm license + size before adding.
5. A minimal batch list view (thumbnails + per-item status + overall progress bar + "Download all (ZIP)" button) that the UI track composes in later. Follow the same design tokens/accessibility rules as the UI prompt (Lucide icons, aria-live progress).

## Verification (report exact pass/fail counts)
- Unit tests (Vitest): enqueue 5 fixtures -> all reach `done`; inject one failing item -> batch still completes with 4 done + 1 error; ZIP contains the right number of entries with deduped names.
- Playwright E2E (against mock): select multiple files -> progress advances -> "Download all" produces a ZIP.
- `npm run typecheck` clean.
- Commit on `track/batch`: `feat(batch): sequential queue, error isolation, ZIP export`.
- Update `PROGRESS.md`.
