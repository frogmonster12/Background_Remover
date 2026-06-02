# Prompt 7 — Polish, PWA, security review, ship

Final pass. Read `CLAUDE.md` and `PROGRESS.md`. Use the skills: **`advanced-frontend`** for the UI polish, **`security-review`** before shipping, **`stop-slop`** for the README. Check `find-skills`/installed plugins for a PWA-caching recipe before hand-rolling one.

## Deliverables
1. **UI polish (`advanced-frontend`):** tighten spacing rhythm (4/8px), motion, empty/error/loading states, dark+light parity, focus states. Re-run the accessibility pass — zero critical axe violations.
2. **PWA / offline:** service worker that caches the app shell and the model weights after first load, so repeat visits work offline. Self-host model weights under `public/models/` (gitignored; document the fetch/build step in `MODELS.md`). Show an offline indicator. Verify the app fully works offline after one online visit.
3. **Security review (`security-review`):** audit file handling for XSS via crafted filenames in download names and ZIP entry names; check for object-URL leaks (revoke them); run `npm audit` and resolve high/critical; confirm CSP-friendly (no inline-eval needs beyond what onnxruntime requires — document any exception). Produce a short findings list with fixes applied.
4. **README (`stop-slop`):** write `README.md` — what it is, the privacy/offline pitch (nothing leaves your browser), supported formats, the v2 features (clean edges, background replacement, batch), a license table (your MIT code + each model's MIT/Apache license from `MODELS.md`), local-dev steps, and GitHub Pages deploy steps. Run it through `stop-slop` and report the score.
5. **Deploy:** configure GitHub Pages (or a static-host) build. Confirm the published `dist/` runs end-to-end from the live URL.

## Verification (report pass/fail)
- `npm run build` succeeds; `npm run preview` serves a working app.
- Full E2E green against the production build (not just dev).
- Offline test: load once online, go offline, reload -> still removes backgrounds.
- Lighthouse on the built site: report Performance / Accessibility / Best-Practices / PWA scores.
- Security findings list attached, high/critical resolved.
- README stop-slop score reported (revise if <35/50).
- Live URL loads and processes a test image.
- Final commit + tag `v2.0.0`. Update `PROGRESS.md`: shipped.
