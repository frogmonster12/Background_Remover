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

---

## Phase 1 — Inference Spike

**Status:** COMPLETE ✓ (branch: `track/inference`)

### Done
- Model confirmed: `onnx-community/ormbg-ONNX` (Apache-2.0), uint8 quantized = 44.3 MB
- `src/inference.ts`: `detectBackend()` + `loadModel()` + `runInference()`, WebGPU→WASM fallback
- `src/worker.ts`: wired to real model when `__USE_REAL_MODEL__=true`
- `MODELS.md`: model, license, timings, rejected candidates documented
- `vite.config.ts`: COEP `credentialless`, `__FORCE_WASM__` flag, ORT WASM middleware plugin
- `public/ort/`: ORT WASM runtime files (gitignored, copy via `npm run copy:ort`)
- `playwright.inference.config.ts` + `npm run test:e2e:inference` script
- `tests/e2e/inference.spec.ts`: Playwright test — non-trivial mask assertion

### Verification PASS ✓
- Backend: WASM (uint8)
- Cold-load: ~6.7s (cached); first download ~44 MB
- Inference: ~4.2s on 512×341
- Mask: 27% foreground / 73% background (non-trivial ✓)
- Mask output saved to `tests/output/hair-mask.png` — eyeball hair edges manually
- `typecheck` ✓, `test` 4/4 ✓, `test:e2e:inference` 3/3 ✓, `lint` ✓

### Notes / model selection rationale
BiRefNet_lite-ONNX (MIT) was tried first but the forward pass crashes in ort-web WASM —
bilateral-branch Sub ops lack a CPU kernel in the WASM build. ORMBG (Apache-2.0, 44 MB uint8)
proved the inference spike end-to-end. See MODELS.md for full details.

### Blockers
- None

---

## Parallel Tracks (after P0 commit)

| Track | Branch | Status |
|-------|--------|--------|
| P1 Inference Spike | track/inference | **COMPLETE** ✓ |
| P3 Compose/Canvas | track/compose | Not started |
| P4 UI + Design | track/ui | Not started |
| P5 Batch + ZIP | track/batch | Not started |
