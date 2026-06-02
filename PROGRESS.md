# Progress

## Phase 0 — Bootstrap

**Status:** COMPLETE ✓

### Done
- Node v24.14.1 confirmed, npm 11.15.0
- Vite + TypeScript (strict) scaffold — vanilla, no framework
- `src/contracts.ts` frozen (WorkerRequest/Response, RemovalResult, CompositeOptions, AlphaMask, BackgroundMode, InferenceBackend)
- `src/inference.mock.ts` — deterministic ellipse mask, conforms to RemovalResult
- `src/worker.ts` — dispatches to mock or real model via `__USE_REAL_MODEL__` build flag
- Vitest (happy-dom) + Playwright (Chromium) configured
- Test fixtures: sample.png, sample.jpg, sample.webp, hair-sample.png (placeholder)
- ESLint v9 flat config (`eslint.config.js`) with typescript-eslint
- MODELS.md stub, README.md stub
- All verification passes: `typecheck` ✓, `test` 4/4 ✓, `test:e2e` 1/1 ✓, `lint` ✓

### Blockers
- None

### Contracts frozen — four tracks unblocked
`src/contracts.ts` must not change without flagging. Tracks may proceed in parallel.

---

## Parallel Tracks (after P0 commit)

| Track | Branch | Status |
|-------|--------|--------|
| P1 Inference Spike | track/inference | Not started |
| P3 Compose/Canvas | track/compose | Not started |
| P4 UI + Design | track/ui | Not started |
| P5 Batch + ZIP | track/batch | Not started |
