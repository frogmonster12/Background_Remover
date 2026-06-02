# Prompt 1 — Inference spike (RISK GATE) — worktree `track/inference`

This is the project's highest-risk piece and a hard gate. Whether a permissively-licensed segmentation model runs acceptably in-browser via transformers.js is **unverified**. Prove it here before the team builds polish on top. Read `CLAUDE.md`. Check `find-skills` for an existing "ONNX/transformers.js in browser" recipe before hand-rolling.

**Two-strikes becomes one-strike here (model/graphics work):** if your first model choice fails to load, is too large, or is too slow, STOP and write a root-cause note plus 2-3 alternatives before trying a second model. Do not thrash.

## License hard rule
Only MIT or Apache-2.0 models. Do NOT use BRIA RMBG-1.4/2.0. Try **BiRefNet (MIT)** first; if it won't load or run acceptably in-browser, fall back to **ISNet general-use (Apache-2.0)**. Before wiring a model in, confirm its exact HF repo ID and license text and record both in `MODELS.md`.

## Scope (touch only these files)
`src/worker.ts`, `src/inference.ts`, `MODELS.md`. Code against the `WorkerRequest`/`WorkerResponse`/`RemovalResult` contracts in `src/contracts.ts` — do not change that file.

## Deliverables
1. `src/worker.ts`: a Web Worker that loads the chosen model once, runs `image-segmentation`, and replies with an alpha mask per the response contract. All heavy work stays in the worker.
2. `src/inference.ts`: backend selection — try **WebGPU**, fall back to **WASM** automatically; expose which backend won.
3. A real-model implementation of the inference interface that the mock currently satisfies, so swapping mock -> real is a one-line change later.
4. `MODELS.md` filled in: chosen model, HF repo, license, on-disk size, backend used, cold-load time, per-image inference time, and any artifacts seen on the hair fixture.

## Verification (report pass/fail)
- Add `tests/inference.spec.ts` (Playwright, real Chromium): load the worker, feed `tests/fixtures/hair.*`, assert the returned mask has a **non-trivial alpha channel** — not all-opaque and not all-transparent — and matches the fixture's dimensions.
- Log and report: chosen model + license, active backend (WebGPU/WASM), cold-load time, inference time.
- Manually confirm the cutout looks right (save the composited PNG to `tests/output/` and eyeball the hair edges).
- Commit on `track/inference`: `feat(inference): real model spike passing on <model>`.
- Update `PROGRESS.md`.

If neither approved model runs acceptably in-browser, STOP and report: root cause, what you tried, and options (different MIT/Apache model, quantized variant, accept ISNet quality ceiling). Do not silently degrade or reach for a non-commercial model.
