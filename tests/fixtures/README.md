# Test Fixtures

| File | Format | Source | License |
|------|--------|--------|---------|
| `sample.png` | PNG 2×2 | Programmatically generated (generate.mjs) | Public domain |
| `sample.jpg` | JPEG 1×1 | Programmatically generated (generate.mjs) | Public domain |
| `sample.webp` | WebP 1×1 | Programmatically generated (generate.mjs) | Public domain |
| `hair-sample.png` | PNG 2×2 | Placeholder (kept for smoke tests) | Public domain |
| `hair-sample.jpg` | JPEG 512px | Pexels portrait (free-to-use license) — used by inference spike | [Pexels License](https://www.pexels.com/license/) |

Re-generate synthetic fixtures with: `node tests/fixtures/generate.mjs`

**Note for public release:** replace `hair-sample.jpg` with a CC0 / public-domain portrait before shipping to ensure the repo is fully open-source clean. Pexels photos are free for use but not CC0.
