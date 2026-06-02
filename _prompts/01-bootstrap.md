# Prompt 0 — Bootstrap (run first, on `main`, alone)

You are setting up a new open-source web app, `bg-remover-web`, in the current empty folder. Read `CLAUDE.md` in this folder first and follow it. Before adding any dependency, check installed skills/plugins and use them where they fit — at minimum `advanced-frontend` (UI), `find-skills` (if a sub-task is a known solved problem). Run `node -v` and report it before installing anything.

This prompt's job is to make four later prompts able to run **in parallel** without colliding. It does that by freezing the typed contracts and shipping a mock inference path plus test fixtures, so feature work can proceed before the real model exists.

## Environment gate
- Run `node -v`. Confirm major version 24.x (Jeff's machine: v24.14.1). If not, stop and report.
- Confirm npm works. Record versions in `PROGRESS.md`.

## Deliverables
1. **Scaffold:** Vite + TypeScript (strict mode), vanilla (no React). `git init`, MIT `LICENSE`, `.gitignore` (ignore `node_modules`, `dist`, `public/models/`, Playwright artifacts).
2. **`src/contracts.ts` — the frozen interface other tracks code against.** Define and export at least:
   - `WorkerRequest` / `WorkerResponse` message types for the worker (request carries an `ImageBitmap` or transferable buffer + a job id; response carries an alpha mask as `ImageData` or `Uint8ClampedArray` + dimensions + job id + timing/backend metadata; plus an error variant).
   - `type AlphaMask` and the `RemovalResult` shape (original dimensions + mask).
   - `type BackgroundMode = 'transparent' | 'color' | 'blur' | 'image'` and a `CompositeOptions` interface (mode, color, blur radius, background image, feather amount).
   - `type InferenceBackend = 'webgpu' | 'wasm'`.
   - Document each with a short comment. This file is the integration boundary — later prompts must not change it without flagging.
3. **`src/inference.mock.ts`:** a mock that returns a deterministic mask (e.g. an ellipse/center cutout) matching the real worker's response contract, so UI and batch work can run before the model lands. Wire a build-time/env switch so the app uses the mock until the real worker is ready.
4. **Test harness:**
   - Vitest configured with happy-dom; one passing smoke test.
   - Playwright configured for Chromium; one passing smoke test that loads the dev server.
   - npm scripts: `test`, `test:e2e`, `lint`, `dev`, `build`, `preview`, plus `tsc --noEmit` wired into a `typecheck` script.
5. **Fixtures:** add `tests/fixtures/` with a few small sample images committed to the repo — at least one JPG, one PNG, one WEBP, and one with fine hair/fur edges (use a permissively-licensed or self-generated image; record source/license in `tests/fixtures/README.md`).
6. **Docs:** `PROGRESS.md` (done/next/blockers), `MODELS.md` (empty table: model | HF repo | license | size | backend | notes), and a stub `README.md` (one line; P7 writes the real one).

## Verification (report pass/fail)
- `node -v` reported and major version == 24.x.
- `npm run dev` serves a blank page, no console errors.
- `npm run typecheck`, `npm run test`, `npm run test:e2e` all pass.
- `src/contracts.ts` exports compile and the mock conforms to them (add a type-level test or a unit test asserting the mock's output matches `RemovalResult`).
- Commit: `chore: bootstrap scaffold, contracts, mock inference, test harness`.
- Update `PROGRESS.md`: contracts frozen, four tracks unblocked.

Do not start any feature work in this prompt. Stop after the harness is green and report.
