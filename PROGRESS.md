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
| P4 UI + Design | track/ui | **COMPLETE** ✓ |
| P5 Batch + ZIP | track/batch | Not started |

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

### Blockers
- None
