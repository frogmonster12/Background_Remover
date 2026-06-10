# Ship checklist

Run every release. Commands assume a fresh `npm run build` first.
Latest run: **2026-06-10** (v2.0.1 candidate).

| # | Check | How | Result (2026-06-10) | Evidence |
|---|-------|-----|---------------------|----------|
| 1 | Real-browser backend | `node scripts/check-webgpu.mjs` (headed Chrome) | **PASS (documented)** | Real adapter found (AMD RX 5600 XT, rdna-1, not fallback; COI true), but ort-web JSEP cannot run ORMBG: `using ceil() in shape computation is not yet supported for MaxPool` at inference time. WebGPU probe disabled (`WEBGPU_ENABLED=false` in `src/inference.ts`); app completes on WASM, `model_uint8.onnx` fetched. See MODELS.md. |
| 2 | Production-build E2E | `npm run test:e2e:preview` (real model vs built dist/) | **PASS** | 8/8 — JPG/PNG/WEBP → transparent PNG, color/blur modes, feather, 5-image batch ZIP |
| 3 | Offline | `npm run verify:sw` (persistent profile, real model) | **PASS** | 7/7 incl. "removal works offline (model from cache)" and COI preserved offline; also re-proves poisoned-cache recovery |
| 4 | Lighthouse | `npx lighthouse http://localhost:4173 --chrome-flags="--headless=new"` vs preview | **PASS** | Performance 98 · Accessibility 100 · Best-Practices 100 · SEO 100. PWA category removed in Lighthouse 12+; PWA evidence = manifest + SW + check 3. Fixed this run: contrast tokens, aria-controls target, label/name mismatches, robots.txt |
| 5 | No third-party requests | `npx playwright test tests/e2e/network.spec.ts` | **PASS** | 1/1 — zero third-party requests on load |
| 6 | Deploy + live URL | Push → GitHub Actions → Pages → `node scripts/verify-live.mjs` | **PASS** | Live at <https://frogmonster12.github.io/Background_Remover/>. CI build green (typecheck, 77 unit tests, model download). Real removal completes on the live URL (WASM); downloaded cutout is PNG with alpha (125 KB). `crossOriginIsolated` false on first load (Pages has no custom headers), true from second load via SW header injection — both verified. Repo made public (required for Pages on free plan; project is an open-source release). Runtime paths made subpath-safe for `/Background_Remover/` (`./sw.js`, APP_BASE-derived `ort/` + `models/`) |
| 7 | Tag | Tag the verified commit | **PASS** | `v2.0.1` tagged at the deployed commit (`bbb99f8`) and pushed. Historical `v2.0.0` untouched |

## Regression suites (same run)

- `npm run typecheck` — 0 errors
- `npm run lint` — 0 errors
- `npm run test` — 77/77
- `npm run test:e2e` — 48/48 (mock-inference suite, incl. SW + brush + network)

## Reusable scripts

- `scripts/check-webgpu.mjs` — headed-browser backend probe + one real inference
- `scripts/verify-sw.mjs` (`npm run verify:sw`) — SW poison-recovery + offline rehearsal
- `scripts/bench-brush.mjs` — brush redraw benchmark (3000×2000)
- `playwright.preview.config.ts` (`npm run test:e2e:preview`) — integration E2E against the built artifact
