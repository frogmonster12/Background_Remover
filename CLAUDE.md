# Project: bg-remover-web (open source, browser-only)

Browser-only AI background remover. All inference runs client-side (WebGPU with WASM fallback). No backend, no uploads, no login. Deploys as static files to GitHub Pages. This is a clean open-source release — separate from Jeff's existing PySide6/Flask desktop app. Do not reference or import desktop code.

## Tech stack
- Node 24 LTS (Jeff's machine: v24.14.1). **Run `node -v` and report it before adding any dependency.** If the major version is not 24.x, stop and tell Jeff.
- Vite + TypeScript (strict). Vanilla TS — no React, no UI framework. Keep dependencies minimal.
- Inference: `@huggingface/transformers` (transformers.js) inside a Web Worker.
- Tests: Vitest (unit, happy-dom env) + Playwright (browser E2E, real Chromium).
- OS: Windows. Use cross-platform scripts in package.json (no bash-only syntax).

## Commands
- Dev: `npm run dev`
- Build: `npm run build`
- Preview built site: `npm run preview`
- Type check: `npx tsc --noEmit`
- Unit tests: `npm run test`
- E2E tests: `npm run test:e2e`
- Lint: `npm run lint`

## License hard rule (read before choosing a model)
Only **MIT or Apache-2.0** models. Do **NOT** use BRIA **RMBG-1.4 / RMBG-2.0** — they are non-commercial / research-only and would make this repo unsafe for commercial reuse. Approved candidates: **BiRefNet (MIT)**, **ISNet general-use (Apache-2.0)**. Before wiring any model in, confirm and record its exact Hugging Face repo ID and license in `MODELS.md`.

## Code conventions
- Named exports, no default exports.
- Colocate unit tests: `compose.ts` -> `compose.test.ts`.
- All heavy work (model load + inference) stays in the Web Worker, never the main thread.
- Communicate with the worker only through the typed message protocol in `src/contracts.ts`. Do not invent ad-hoc message shapes.
- Pure functions in `compose.ts` / `formats.ts` — no DOM globals so they unit-test under happy-dom.
- SVG icons only (Lucide). No emoji as UI icons.
- Semantic color tokens in CSS custom properties, not raw hex in components. Ship light + dark together.

## Boundaries
- Never add a dependency without confirming Node-24 compatibility and noting bundle-size impact.
- Never commit model weight binaries to git (gitignore `public/models/`); document the download step instead.
- Never call the network at runtime after the initial model fetch. The privacy claim ("nothing leaves your browser") must stay true — no analytics, no telemetry, no remote logging.
- Ask before changing the worker message protocol in `contracts.ts` once tracks are running against it.

## Skills to use (check at the start of each prompt)
- `advanced-frontend` for any UI work.
- `security-review` before shipping the file-handling / build (XSS via filenames, object-URL leaks, dependency audit).
- `stop-slop` for the README and any user-facing copy.
- `find-skills` if you hit a task that smells like a solved problem (e.g. ONNX-in-browser, PWA caching).
- Also check installed plugins/skills with the skills tools before assuming none apply.

## Workflow rules (Jeff's standing rules)
- Sequential phases: one deliverable + one verification each. Report pass/fail before moving on.
- Build verification: actually run the artifact and confirm the primary flow end-to-end. Install success != working app.
- Two-strikes rule: if the same bug class fails twice, stop and write a root-cause note + 2-3 alternatives before a third attempt. For model/graphics work, flag after the **first** failure.
- Keep `PROGRESS.md` current after every phase (done / next / blockers) so a fresh session resumes from it alone.
- Commit at each phase boundary with a message naming the phase.
