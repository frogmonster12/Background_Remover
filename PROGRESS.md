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

## Phase 6 — Integration

**Status:** COMPLETE ✓

### Done
- Merged all four tracks: compose → batch → ui (resolved compose.ts conflict: kept real impl)
- Self-hosted fonts: Syne, Figtree, JetBrains Mono served from `public/fonts/` — no CDN
- Real model wired as default (`USE_REAL_MODEL !== 'false'`); mock still available via env
- `applyMask` call fixed in `main.ts`: pass `removalResult.mask` (AlphaMask), sync return (OffscreenCanvas)
- `decodeToBitmap` from `formats.ts` used throughout (HEIC support, typed errors)
- Batch queue wired to real worker via `dispatchJob` helper; `mountBatchView` mounted in `#batch-panel`
- Single/Batch mode tabs in header
- Model quality toggle replaced with static ORMBG note (only one model shipped)
- `tests/e2e/network.spec.ts`: Playwright assertion — no third-party requests on load
- `tests/e2e/integration.spec.ts`: real-model E2E (formats/modes/feather/batch) — separate config
- Default `test:e2e` runs with `USE_REAL_MODEL=false` (fast mock); integration config uses real model

### Verification PASS ✓
- `typecheck`: 0 errors ✓
- `test`: 39/39 ✓
- `test:e2e` (smoke + network + UI + batch, mock inference): **17/17 ✓**
- `lint`: 0 errors ✓

### Notes
- `tests/e2e/integration.spec.ts` (real model) requires `npm run copy:ort` and model download (~44 MB on first run)
- Headless Chromium rejects synthetic minimal PNGs via `createImageBitmap`; batch E2E uses real JPEG copies (`fixture-a/b/c.jpg`)
- `tests/output/` gitignored; feather before/after saved there during integration E2E run

### Remaining
- Polish: responsive mobile layout, light mode refinement
- GitHub Pages deployment config
- README completion with usage instructions and model download note

---

## Parallel Tracks (after P0 commit)

| Track | Branch | Status |
|-------|--------|--------|
| P1 Inference Spike | track/inference | **COMPLETE** ✓ |
| P3 Compose/Canvas | track/compose | **COMPLETE** ✓ |
| P4 UI + Design | track/ui | **COMPLETE** ✓ |
| P5 Batch + ZIP | track/batch | **COMPLETE** ✓ |

---

## Phase 4 — UI + Design System

**Status:** COMPLETE ✓ (branch: `track/ui`)

### Done
- `src/compose.ts` — stub `decodeToBitmap` + `applyMask` (track/compose will replace)
- `src/main.ts` — full workspace app: dropzone, worker integration, compositing, download
- `src/style.css` — full design system: dark/light tokens, checkerboard canvas, all components
- `index.html` — Google Fonts (Syne + Figtree + JetBrains Mono), updated title
- `tests/e2e/ui.spec.ts` — 14 Playwright E2E tests

### Design direction: "Surgical Clarity"
- Dark-first (violet-indigo `#7c6af7` primary); light mode via `data-theme` + `prefers-color-scheme`
- `Syne` (brand) + `Figtree` (UI) + `JetBrains Mono` (values) — no generic system fonts
- Checkerboard canvas background so transparent cutouts are obvious
- Dropzone reticle corners animate in on hover/focus
- 150ms micro-interactions on all interactive states; `prefers-reduced-motion` respected
- Controls panel: 2-column mode grid, inline sub-options (color picker / blur slider / image upload)
- Progress: top-edge sweep bar + centered spinner card during model load / inference
- Download: PNG always; JPEG exposed only when background mode is opaque

### Verification PASS ✓
- `typecheck` ✓ (strict, no errors)
- `lint` ✓
- `test` 4/4 ✓ (unit tests unchanged)
- `test:e2e` (ui.spec.ts) **14/14 ✓**
  - drop image → preview renders
  - all 4 background modes (transparent / color / blur / image)
  - download PNG + JPEG
  - a11y: landmarks, aria-pressed, aria-live, tabindex, labels

### Accessibility pass
- Landmarks: `role="banner"`, `role="main"`, `<aside aria-label>` ✓
- All controls labelled (`for`, `aria-label`, or `aria-labelledby`) ✓
- Dropzone: `role="button"`, `tabindex="0"`, keyboard-operable ✓
- `aria-live="polite"` status region updates on processing/done/error ✓
- Mode buttons: `aria-pressed` toggled correctly ✓
- Range sliders: `aria-valuemin/max/now` kept in sync ✓
- ≥44px touch targets on all interactive elements ✓
- `[hidden]` respected over CSS `display` rules ✓
- `prefers-reduced-motion` disables animations ✓

### Notes
- `sample.png` fixture is a placeholder (70 bytes, invalid image). E2E tests use `hair-sample.jpg`.
- compose.ts stub feather: scales slider 0–20 → ~0–255px range; canonical implementation in track/compose.
- Quality toggle is wired UI-only (placeholder) — real model switching happens at integration (Phase 6).

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
