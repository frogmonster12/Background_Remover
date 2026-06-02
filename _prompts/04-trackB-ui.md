# Prompt 4 — Track B: UI + design system — worktree `track/ui`

Build the interface against the **mock** inference and the compose contract, so this runs in parallel with the real-model spike. Read `CLAUDE.md`. **Invoke the `advanced-frontend` skill** and apply the `uiux-pro-max-design-intelligence` rules below. Code against `src/contracts.ts`; do not change it.

## Design direction (tool / image-editor product, canvas-centric)
- **Layout:** single-screen workspace. A large central canvas preview is the hero; controls sit in a slim side panel (desktop) that collapses to a bottom sheet (mobile). One primary CTA per screen (Download).
- **Transparency:** render cutouts on a checkerboard backdrop so users can see what's transparent.
- **Dark + light together:** semantic CSS custom-property tokens (`--surface`, `--on-surface`, `--primary`, `--danger`), not raw hex in components. Test contrast in both themes (>=4.5:1 body).
- **Icons:** Lucide SVGs only — no emoji. Consistent stroke width and size tokens.
- **Drag-and-drop affordance:** an obvious dropzone with hover/drag-over state; also a file-picker fallback button. `cursor: pointer` on everything clickable.
- **Motion:** 150-300ms micro-interactions, transform/opacity only, ease-out on enter; respect `prefers-reduced-motion`.
- **Touch:** >=44px targets, `touch-action: manipulation`.
- **Performance:** `loading="lazy"` thumbnails, reserve canvas dimensions to avoid layout shift, skeleton/progress while inference runs (it can exceed 300ms).

## Deliverables
1. Dropzone + file picker -> `decodeToBitmap` (from compose track; if not merged yet, stub its signature) -> mock inference -> `applyMask` -> checkerboard preview.
2. Controls panel: background mode switch (transparent / color picker / blur slider / upload image), feather slider, model-quality toggle placeholder ("Quality" / "Fast" — wired to real models at integration).
3. A progress/loading state during inference; disabled Download button until a result exists.
4. Download button -> PNG (and JPEG when an opaque background is chosen).
5. Accessibility: labelled controls, visible focus rings, `aria-label` on icon buttons, keyboard-operable dropzone, `aria-live` status for "processing/done".

## Verification (report pass/fail)
- Playwright E2E against the mock: drop a fixture image -> preview renders -> change background mode -> Download yields a file. One assertion per background mode.
- Run an accessibility pass (axe via Playwright, or the skill's checklist): no critical violations; focus order matches visual order; contrast passes in both themes.
- `npm run typecheck` clean.
- Commit on `track/ui`: `feat(ui): workspace, dropzone, controls, themed + accessible (mock inference)`.
- Update `PROGRESS.md`.
