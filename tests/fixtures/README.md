# Test Fixtures

| File | Format | Source | License |
|------|--------|--------|---------|
| `sample.png` | PNG 2×2 | Programmatically generated (generate.mjs) | Public domain |
| `sample.jpg` | JPEG 1×1 | Programmatically generated (generate.mjs) | Public domain |
| `sample.webp` | WebP 1×1 | Programmatically generated (generate.mjs) | Public domain |
| `hair-sample.png` | PNG 2×2 | Placeholder — replace with a real CC0 photo before P6 | — |

Re-generate with: `node tests/fixtures/generate.mjs`

The hair-sample placeholder exists so E2E tests can reference a file path before the real photo is sourced. Replace it with a permissively-licensed (CC0 / public domain) photo that has fine hair or fur edges before running the inference spike (P1/P6).
