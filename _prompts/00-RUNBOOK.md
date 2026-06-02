# Build runbook — bg-remover-web

How to execute the seven prompts in `_prompts/`, what runs in parallel, and how to wire it together. Read this once before starting.

## The core idea: contracts first, then parallel tracks

Prompt 0 scaffolds the repo **and writes the typed contracts** (`src/contracts.ts`) plus a mock inference function and test fixtures. Once those contracts exist, three feature tracks and the real-model spike all code against them independently — so four agents can run at once in separate git worktrees without colliding. The model spike swapping the mock for the real model is the only merge that touches shared inference code.

## Dependency map

```
        ┌─────────────────────────────┐
        │ Prompt 0: Bootstrap          │  (main branch, run first, alone)
        │ scaffold + contracts + mock  │
        │ + fixtures + test harness    │
        └──────────────┬──────────────┘
                       │  contracts.ts frozen
   ┌───────────┬───────┴───────┬───────────────┐
   ▼           ▼               ▼               ▼
┌────────┐ ┌────────┐     ┌────────┐     ┌────────┐
│ P1     │ │ P3     │     │ P4     │     │ P5     │   ← run in parallel
│ Infer  │ │ TrackA │     │ TrackB │     │ TrackC │      (git worktrees)
│ SPIKE  │ │compose │     │ UI     │     │ batch  │
│ (gate) │ │ canvas │     │ +design│     │ +zip   │
└───┬────┘ └───┬────┘     └───┬────┘     └───┬────┘
    └──────────┴──────┬───────┴──────────────┘
                      ▼
            ┌──────────────────┐
            │ P6: Integration  │  (merge worktrees, wire real model in)
            └────────┬─────────┘
                     ▼
            ┌──────────────────┐
            │ P7: Polish + Ship│  (advanced-frontend, PWA, security-review,
            │                  │   README via stop-slop, GitHub Pages)
            └──────────────────┘
```

**Why these four parallelize cleanly:**
- P1 (spike) touches only `src/inference.ts` + `src/worker.ts` + `MODELS.md`.
- P3 (compose) touches only `src/compose.ts` / `src/formats.ts` — pure canvas, tested against a static mask fixture, needs no model.
- P4 (UI) builds against the **mock** inference + the compose contract; swaps to real later.
- P5 (batch) wraps the single-image contract in a queue; no model dependency.

The only shared file is `contracts.ts`, frozen by P0. Nobody edits it during the parallel phase without flagging.

## How to run the parallel tracks (git worktrees)

After Prompt 0 is merged to `main`:

```bash
# from repo root
git worktree add ../bgrw-spike   -b track/inference
git worktree add ../bgrw-compose -b track/compose
git worktree add ../bgrw-ui      -b track/ui
git worktree add ../bgrw-batch   -b track/batch
```

Open a separate Claude Code session in each worktree folder and paste the matching prompt (P1, P3, P4, P5). Each runs its own tests against the shared contracts. When all four go green, merge in this order: compose -> batch -> ui -> inference, resolving in P6.

If you'd rather not juggle four sessions, run them sequentially in the same checkout in the order P1, P3, P4, P5 — the prompts don't assume parallelism, they just permit it.

## Testing strategy (built into every prompt)

- **Unit (Vitest, happy-dom):** `compose.ts`, `formats.ts`, queue logic. Pure functions, fast.
- **Inference check (P1):** a node/worker script runs the chosen model on a bundled hair-sample fixture and asserts the output has a non-trivial alpha channel (not all-opaque, not all-transparent) plus logs backend + timing.
- **E2E (Playwright, real Chromium):** drag a JPG in -> cutout appears -> download produces a PNG with transparency; one test per input format; one per background-replace mode. This is the build-verification gate — install/build passing is not "done."
- Each prompt ends by **running its tests and reporting exact pass/fail counts**, per Jeff's rules.

## Skill reminders (every prompt repeats these)
- UI prompts -> `advanced-frontend`.
- Pre-ship -> `security-review` (filename XSS, object-URL leaks, `npm audit`).
- README + copy -> `stop-slop`.
- Stuck on a solved problem -> `find-skills`, and check installed skills/plugins before assuming none fit.

## Order of operations checklist
1. Run **Prompt 0** on `main`. Verify dev server + contracts + mock + fixtures + green test harness. Commit.
2. Create worktrees. Run **P1, P3, P4, P5** (parallel or sequential).
3. Each track: tests green, committed on its branch.
4. Run **P6** integration: merge, wire real model into UI, full E2E green.
5. Run **P7**: polish, PWA, security-review, README, deploy. Final E2E + Lighthouse.
