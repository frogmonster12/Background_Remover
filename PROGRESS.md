# Progress

## Phase 12 — Repo Cleanup + Brush Performance (dirty-region recomposite)

**Status:** COMPLETE ✓

### Phase 0 — repo hygiene (PASS)
- Committed orphaned prompt-08 work (`54899f9`): correct model variants in
  `download-model.mjs` (uint8 + fp16 — a clean CI checkout previously deployed
  broken), detailed WASM load-failure message, preview COOP/COEP headers
- Deleted dead `scripts/verify-preview.mjs` (superseded by `verify:sw`); pinned
  `verify-sw.mjs`'s old-SW reference to `cb29e33~1` (HEAD moved past it)
- Gitignored `tsconfig.tsbuildinfo`
- `.gitattributes` (`* text=auto eol=lf` + binary exceptions) committed
  separately (`c557c61`); index was already LF — phantom diffs were
  `core.autocrlf` checkout artifacts, now stopped
- Pruned 3 stale worktrees (`bgrw-batch`/`-compose`/`-ui`; clean, branches merged)
- Left untouched per instructions: `_prompts/*`, `.claude/settings.json`

### Phase 1 — brush performance
- **`src/compose.ts`:** new `applyMaskRegion(srcData, mask, options, region)` —
  composites only a clamped rect from pre-extracted source pixels; returns
  ImageData + origin for `putImageData`. `applyMask` signature untouched.
  - Supports transparent + color (the per-pixel-local modes), incl. feather
  - Region feather uses a summed-area table over the f-expanded rect —
    **pixel-identical** to `featherMask` (same truncated-window ÷ count math),
    O(1) per pixel instead of O(f²)
  - Returns null for blur/image — those need whole-frame context, so the brush
    falls back to the existing rAF-throttled full redraw in those modes
- **`src/main.ts`:** dirty-rect per rAF frame (segment bbox + brush radius +
  feather pad); region patch via `putImageData`; cached full-image `ImageData`
  extracted once per image on first pointerdown (~16 ms at 3000×2000, freed on
  new image); full-quality `recomposite()` on pointerup unchanged
- **`scripts/bench-brush.mjs`:** repeatable Chromium benchmark

### Measured (median, 3000×2000, Chromium)
| Path | ms / move |
|---|---|
| BEFORE: full recomposite + drawImage | **50–88** |
| region, transparent, brush r=24 (default) | **0.05** |
| region, transparent, brush r=120 (max) | 0.44 |
| region, color, r=24 | 0.14 |
| region, transparent, r=24 + feather 5 | 0.15 |
| region, transparent, r=120 + feather 20 (worst sliders) | 1.85 |
| one-time source extraction (per image) | 16.25 |

All region paths are comfortably under 16 ms — ~27× to ~1000× faster than the
full pass. (First SAT-less attempt hit 385 ms on the worst-slider case; the
summed-area table fixed it without losing exactness — no second strike.)

### Correctness
- 8 new Vitest cases prove region output is pixel-identical to a full
  `applyMask` pass (transparent/color, feather 0/1/2/3, rects overlapping
  corners and edges, clamping, null for blur/image)
- Blur/image modes: live stroke uses throttled full redraw (stated trade-off);
  pointerup always does a full-quality recomposite in every mode
- Undo/redo/reset untouched (they already used the full `recomposite()` path)

### Verification PASS ✓
- `typecheck`: 0 errors ✓ — `lint`: 0 errors ✓
- `test` (Vitest): 77/77 ✓ (8 new) — `test:e2e` (Playwright): 48/48 ✓
- Brush E2E pixel assertions exercise the region path and pass

---

## Phase 10 — Service Worker Cache Fix (BLOCKER)

**Status:** COMPLETE ✓ (v2.0.1)

### Root cause (recap)
The v2.0.0 SW was cache-first with no versioning or response validation. A
SPA-fallback HTML response cached under a model/wasm URL was served forever.
Incognito worked only because it has no registered SW.

### Done
- **`public/sw.js` rewritten:**
  - `CACHE_VERSION = 'v2.0.1'` constant — bump on each release
  - `activate`: deletes **every** cache not matching the current version (incl.
    `transformers-cache`, which can also hold a poisoned entry) + `clients.claim()`
  - `install`: `skipWaiting()` (already present) so the fixed SW replaces a broken one immediately
  - `shouldCache(request, response)`: only caches `response.ok`; never caches
    `text/html` for a non-HTML asset; `.onnx`/`.wasm` require a plausible binary
    content-type (empty tolerated for static hosts that omit it)
  - Fixed a pre-existing double-fetch bug (cache-hit path fired two network requests)
- **Update affordance:** `#update-bar` ("A new version is ready." + Reload button,
  44px target) shown on `controllerchange` — only when the page already had a
  controller, so the very first install stays silent (`main.ts` + `style.css`)
- **`README.md`:** Troubleshooting section — automatic recovery via v2.0.1 + manual
  recovery (DevTools → Application → Unregister + Clear site data)
- **`package.json`:** version 2.0.1; new `verify:sw` script
- **Tests:**
  - `tests/sw.test.ts` — 16 Vitest tests that load the real `public/sw.js` into a
    mocked SW scope: activate deletes stale caches; never caches 404/500/HTML-for-
    `.onnx`/`.wasm`; caches valid binaries; offline serves cached binary; an HTML
    fallback can't overwrite a good cached binary; cross-origin/non-GET ignored
  - `tests/e2e/sw.spec.ts` — 5 Playwright tests: registration + control; only the
    current versioned cache exists; SPA-fallback for `.onnx` NOT cached (dev server
    really serves 200 text/html for bogus `.onnx` URLs — the exact poison scenario);
    stale-cache cleanup on SW update; update bar hidden by default
  - `scripts/verify-sw.mjs` (`npm run verify:sw`) — full recovery rehearsal against
    the built preview in a **persistent profile** (normal-profile equivalent):
    old v2.0.0 SW + poisoned `cutout-v2.0.0` & `transformers-cache` → app broken →
    swap in new sw.js (the "deploy") → update bar appears → reload → old caches
    deleted → real-model removal works → offline reload → removal still works,
    `crossOriginIsolated` preserved. **ALL 7 CHECKS PASSED.**

### Trade-off (documented)
Wiping all non-current caches on version bump deletes `transformers-cache`, so the
model re-downloads once per release (same-origin static fetch when self-hosted).
This is what guarantees recovery from any poisoned state without manual clearing.

### Verification PASS ✓
- `typecheck`: 0 errors ✓
- `lint`: 0 errors ✓
- `test` (Vitest): 69/69 ✓ (16 new SW tests)
- `test:e2e` (Playwright): 48/48 ✓ (5 new SW tests)
- `npm run build`: dist/sw.js contains `CACHE_VERSION = 'v2.0.1'` + `shouldCache` ✓
- `verify:sw` (real model, persistent profile, normal-profile equivalent): 7/7 ✓

---

## Phase 9 — Manual Touch-up Brush

**Status:** COMPLETE ✓

### Done
- **`src/brush.ts`** — pure, DOM-free brush core:
  - `stampMask(mask, w, h, cx, cy, radius, mode, strength)` — cosine-falloff circular stamp, mutates mask in place; restore pushes alpha → 255, erase → 0
  - `stampLine(...)` — interpolates stamps every ~radius/4 px for gap-free strokes
- **`src/brush.test.ts`** — 14 Vitest unit tests: restore/erase at center/edge/outside, out-of-bounds safety, `stampLine` gap fill
- **`src/main.ts`** — brush integration:
  - `workingMask` / `originalMask` cloned from `RemovalResult.mask` on each inference result
  - `recomposite()` uses `workingMask` so all modes (transparent/color/blur/image) and feather flow through edited mask
  - `paintStrokePreview()` lightweight canvas update (no button/overlay resize) for live rAF preview
  - Pointer Events API (mouse + touch + pen) on `#brush-overlay` canvas with `setPointerCapture`
  - rAF-throttled `paintFrame()` calls `stampLine` between `lastPaintPos` and `pendingPos`, then redraws
  - Full-quality `recomposite()` on `pointerup`
  - 20-entry undo stack (stroke-level snapshots saved on `pointerdown`); redo stack cleared on new stroke
  - Reset mask copies `originalMask` back into `workingMask` (also undo-able)
  - Ctrl+Z / Ctrl+Y / Ctrl+Shift+Z keyboard shortcuts
  - Circular cursor drawn on overlay at current pointer position (violet for restore, red for erase); inner ring shows 50% falloff boundary; cursor hidden on `pointerleave`
- **`src/style.css`** — brush controls styling:
  - `.preview-wrap` wrapper (inline-flex, position:relative) containing canvas + overlay
  - `.brush-overlay` (position:absolute; inset:0; cursor:none; pointer-events:all in done phase)
  - `.brush-section` / `.brush-mode-btn` / `.brush-actions` / `.brush-reset-btn` — consistent with existing sidebar tokens, light+dark, 44px targets
  - Brush section + trailing divider hidden via CSS in non-done phases
- **`tests/e2e/brush.spec.ts`** — 26 Playwright tests:
  - Visibility (idle vs done), mode toggle, size slider, undo/redo/reset, Ctrl+Z/Y
  - Pixel-level: erase lowers alpha at canvas center; restore raises alpha at corners
  - Export: downloaded PNG reflects erase edit; brush edits survive bg-mode change
  - A11y: aria-label, aria-pressed, aria-valuemin/max/now on all controls
  - Before/after screenshots saved to `tests/output/brush-before.png` / `brush-after.png`

### Architecture note — performance
`applyMask` iterates all pixels on every rAF frame. For images ≤ 2K this is imperceptible
(< 5 ms). For images > ~4K (~8 M pixels) expect > 16 ms/frame lag during live strokes.
A dirty-bbox optimisation (composite only the stamped bounding box) would eliminate this
but was deferred as out of scope for this phase.

### Verification PASS ✓
- `typecheck`: 0 errors ✓
- `lint`: 0 errors ✓
- `test` (Vitest): 53/53 ✓ (14 new brush tests)
- `test:e2e` (Playwright): 43/43 ✓ (26 new brush tests)
- `build`: succeeds, no new warnings ✓
- Before/after screenshots saved to `tests/output/brush-before.png` and `brush-after.png`

---

## Phase 7 — Polish, PWA, Security, Ship

**Status:** COMPLETE ✓ (tagged v2.0.0)

### Done
- **Security fixes:**
  - Fixed XSS risk: `batch-view.ts` `statusEl.innerHTML` split to use `textContent` for user-controlled error labels
  - Sanitized ZIP entry names (`batch.ts:stemOf`) and download filenames (`main.ts`) — strip path separators, null bytes, leading dots
  - `npm audit`: 0 vulnerabilities
  - CSP meta tag added to `index.html`: `script-src 'self' 'wasm-unsafe-eval'` (ORT WASM exception documented); `style-src 'unsafe-inline'` required for Vite dev + dynamic `element.style` mutations
- **UI polish:**
  - Error state banner with message text (`#error-banner`, visible on `data-phase='error'`)
  - Offline indicator bar (slides up from bottom via `online`/`offline` events)
- **PWA / offline:**
  - `public/sw.js` — cache-first + background-update; injects COEP/COOP headers on navigation responses (enables SharedArrayBuffer on GitHub Pages)
  - `public/manifest.webmanifest` — name, icons, theme color, standalone display
  - `index.html` — manifest link, `theme-color`, apple-mobile meta, OG tags
  - SW registration in `main.ts` (fires on `load`, silent on failure)
  - `scripts/download-model.mjs` — downloads ORMBG weights to `public/models/` for self-hosting
  - `inference.ts` — `allowLocalModels: true` (tries self-hosted `/models/` first, falls back to HF CDN)
  - `npm run download:model` script added
  - `MODELS.md` updated with download instructions
- **Deploy:**
  - `.github/workflows/deploy.yml` — GitHub Actions → GitHub Pages (installs, copy-ort, download-model, typecheck, test, build, deploy)
- **README:** Full `README.md` with privacy pitch, formats, model table, license table, local-dev steps, GH Pages deploy steps
- **package.json:** version bumped to `2.0.0`

### Verification PASS ✓
- `typecheck`: 0 errors ✓
- `test` (Vitest): 39/39 ✓
- `test:e2e` (Playwright mock): **17/17 ✓**
- `lint`: 0 errors ✓
- `npm run build`: succeeds, `dist/` contains `sw.js` + `manifest.webmanifest` ✓
- `npm audit`: 0 vulnerabilities ✓

### Security findings (all resolved)
| Finding | Severity | Fix |
|---------|----------|-----|
| `batch-view.ts` innerHTML with user-controlled error message | Medium | `textContent` for label span; SVG only via innerHTML |
| ZIP entry names allow path traversal chars | Low | `stemOf()` sanitizes separators, null bytes, leading dots |
| Download `a.download` filename unsanitized | Low | Same sanitize function applied |
| No CSP | Medium | CSP meta tag added; `script-src 'self' 'wasm-unsafe-eval'` |

### Notes
- Offline test requires `npm run download:model` to have been run once; after that, SW caches everything on first online visit
- Chunk size warnings (ORT WASM ~21 MB, heic2any ~1.3 MB) are pre-existing and expected
- Live URL pending after GitHub Pages is configured in the repo settings

---

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
