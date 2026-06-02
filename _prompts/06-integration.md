# Prompt 6 — Integration (on `main`, after all tracks green)

Merge the four worktree branches and wire the real model into the real UI. Read `CLAUDE.md` and the current `PROGRESS.md` first. Verify repo state before assuming what's merged — check `git log` and the branches, don't trust memory.

## Merge order
`track/compose` -> `track/batch` -> `track/ui` -> `track/inference`. Resolve conflicts (should be minimal — tracks owned disjoint files; `contracts.ts` was frozen). If any track changed `contracts.ts`, stop and reconcile deliberately.

## Wiring
1. Replace the mock inference with the real worker from `track/inference` behind the same interface (the one-line switch from Prompt 0).
2. Connect the UI's model-quality toggle to the real model selector (Quality = BiRefNet or whatever P1 chose; Fast = ISNet) if two models shipped; if only one shipped, hide the toggle and note it in `PROGRESS.md`.
3. Connect the batch queue to the real worker and the UI's batch view.
4. Connect `decodeToBitmap` (formats) and `applyMask` (compose) into the real single-image and batch flows.

## Verification (report exact pass/fail counts) — this is the build-verification gate
- Full E2E (Playwright, real Chromium, real model): for each input format (JPG/PNG/WEBP, + HEIC if supported), drop -> real cutout -> download transparent PNG. Assert downloaded PNG has transparency.
- One E2E per background mode (transparent/color/blur/image) producing a correct composite.
- One batch E2E: 5 mixed-format images -> ZIP with 5 correct cutouts.
- Confirm feather slider visibly reduces hair fringing (save before/after to `tests/output/`).
- Confirm the active backend (WebGPU/WASM) is logged and the app still works when WebGPU is forced off.
- `npm run typecheck`, `npm run test`, `npm run test:e2e` all green; report exact counts.
- **Network check:** confirm zero network requests after the initial model load (DevTools / Playwright network assertion). The privacy claim must hold.
- Commit: `feat: integrate real inference with UI, batch, compose — full E2E green`.
- Update `PROGRESS.md`: integrated, remaining = polish/ship.
