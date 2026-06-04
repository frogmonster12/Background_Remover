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

---

## Phase 3 — Compose / Canvas

**Status:** COMPLETE ✓ (branch: `track/compose`)

### Done
- `src/formats.ts`: `decodeToBitmap(file)` — PNG/JPEG/WEBP/GIF via `createImageBitmap`; HEIC/HEIF
  lazy-loaded via dynamic `import('heic2any')` (only when a HEIC file is dropped).
  Throws typed `UnsupportedFormatError` for unsupported MIME types.
- `src/compose.ts`:
  - `featherMask(mask, w, h, radius)` — box-blur on the alpha channel; kills fringe halos.
  - `applyMask(image, mask, options)` — four background modes:
    - `transparent` — mask alpha straight through (default)
    - `color` — solid colour fill (CSS string, hex fast-path + canvas fallback)
    - `blur` — software two-pass box blur on the original, composited behind subject
    - `image` — user-supplied background, cover-fit, composited behind subject
  - `toPNG(canvas)` / `toJPEG(canvas, quality)` — `convertToBlob` wrappers.
- `tests/setup.ts`: minimal `OffscreenCanvas` + `ImageData` polyfill for happy-dom (v20 lacks
  these globals); pixel-accurate put/get/drawImage for the test suite.

### Dependency added
- `heic2any` v0.0.4 — ~2.7 MB unpacked; lazy-loaded, zero cost in the initial bundle.
  Node 24 compatible (browser library, no Node engine constraint). 230 transitive packages.

### Verification PASS ✓
- `typecheck` ✓ (tsc --noEmit)
- `test` 32/32 ✓ (28 new; 4 pre-existing mock tests)
- `lint` ✓

### Blockers
- None

---

## Parallel Tracks (after P0 commit)

| Track | Branch | Status |
|-------|--------|--------|
| P1 Inference Spike | track/inference | **COMPLETE** ✓ |
| P3 Compose/Canvas | track/compose | **COMPLETE** ✓ |
| P4 UI + Design | track/ui | Not started |
| P5 Batch + ZIP | track/batch | **COMPLETE** ✓ |

---

## Phase 5 — Batch + ZIP

**Status:** COMPLETE ✓ (branch: `track/batch`)

### Done
- `fflate` v0.8.3 (MIT, ~8 kB) added as runtime dependency
- `src/batch.ts`: `createBatchQueue(inferenceFn)` — sequential queue (`CONCURRENCY = 1`), per-item error isolation, subscriber pattern; `exportZip(items, renderFn)` — fflate ZIP with `name_N` filename dedup
- `src/batch.test.ts`: 8 unit tests (Vitest/happy-dom) — 5-item happy path, 4-done+1-error isolation, empty ZIP, dedup filenames
- `src/batch-view.ts`: framework-agnostic DOM component — file drop/browse input, aria-live progress bar, per-item thumbnail + Lucide status icons, "Download all (ZIP)" button
- `src/batch-view.css`: design-token–based styles, light + dark, spinner animation
- `src/main.ts`: updated to mount batch view with mock inference + canvas render fn
- `tests/e2e/batch.spec.ts`: Playwright E2E — 3 files → progress → 3 done → ZIP download

### Verification PASS ✓
- `test` 11/11 ✓ (8 batch + 3 pre-existing mock tests)
- `test:e2e` batch: 1/1 ✓, smoke: 1/1 ✓
- `typecheck` ✓, `lint` ✓

### Notes
- `createImageBitmap` is unavailable under Playwright's COEP-isolated context for the minimal fixture files; mock inference falls back to `mockRemoveBackground(64, 64)` — real wiring uses the worker message protocol
- E2E test uses 3 copies of `sample.png` (2×2, definitely valid) to avoid JPEG/WebP decode failures in headless Chromium

### Blockers
- None
