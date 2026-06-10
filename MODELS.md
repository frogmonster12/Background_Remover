# Model Registry

Only MIT or Apache-2.0 models. Do NOT use BRIA RMBG-1.4 / RMBG-2.0 (non-commercial).

The app ships **two** models behind the Human/General toggle (default: Human):

| Toggle | Model | HF repo | License | WASM file | Size |
|--------|-------|---------|---------|-----------|------|
| **Human** (default) | ORMBG | `onnx-community/ormbg-ONNX` | Apache-2.0 | `model_uint8.onnx` | 44.3 MB |
| **General** | ISNet general-use | `imgly/isnet-general-onnx` | MIT | `model_fp16.onnx` | 88.2 MB |

## Chosen model — ORMBG (Apache-2.0)

| Field | Value |
|-------|-------|
| Model | ORMBG (Open Robust Matting Background Removal) |
| HF Repo | `onnx-community/ormbg-ONNX` |
| Base model | `schirrmacher/ormbg` |
| License | **Apache-2.0** |
| On-disk size | uint8: 44.3 MB · fp16: 88.1 MB · fp32: 176 MB |
| Backend used | WASM (uint8). WebGPU disabled — see note below |
| Cold-load time | ~6.7s (browser-cached); first download ~44 MB over network |
| Per-image time | ~4.2s on 512×341 WASM |
| Hair-edge artifacts | Visual check pending (`tests/output/hair-mask.png` — see eyeball step) |

### Self-hosting for offline support

The model weights are **not committed to git** (`public/models/` is gitignored).
To enable offline-capable builds, download them once before building:

```bash
npm run download:model
# Downloads ~44 MB to public/models/onnx-community/ormbg-ONNX/
```

Files written:
- `public/models/onnx-community/ormbg-ONNX/config.json`
- `public/models/onnx-community/ormbg-ONNX/preprocessor_config.json`
- `public/models/onnx-community/ormbg-ONNX/onnx/model_uint8.onnx`
- `public/models/onnx-community/ormbg-ONNX/onnx/model_fp16.onnx`

### WebGPU status (verified 2026-06, ship check)

ORMBG **cannot run on ort-web's WebGPU (JSEP) backend** today. The model loads
and `model_fp16.onnx` is fetched, but inference fails with
`using ceil() in shape computation is not yet supported for MaxPool` — an
ort-web operator gap, reproduced on real hardware (AMD RX 5600 XT, headed
Chrome, cross-origin-isolated page). `detectBackend()` therefore skips the
WebGPU probe (`WEBGPU_ENABLED = false` in `src/inference.ts`) so WebGPU-capable
visitors don't download the 88 MB fp16 model just to hit the error. Re-test and
flip the flag when ort-web adds ceil-mode MaxPool support.

**Without this step:** inference.ts falls back to the HuggingFace CDN automatically.
Offline use then requires the browser's own HTTP cache to have warmed up.
**With this step:** model is served from same origin; the service worker caches it
after first visit, enabling full offline use on repeat visits.

### License verification

`onnx-community/ormbg-ONNX` is built on `schirrmacher/ormbg` which is Apache-2.0.
ONNX export: `onnx-community` namespace (Apache-2.0).
No BRIA / non-commercial components.

### Pipeline API

```javascript
const pipe = await pipeline('background-removal', 'onnx-community/ormbg-ONNX', { dtype: 'uint8' });
const output = await pipe(rawImage); // returns RawImage (RGBA)
// Alpha channel = foreground mask: 255 = keep, 0 = remove
```

---

## General model — ISNet general-use (MIT)

| Field | Value |
|-------|-------|
| Model | ISNet general-use (DIS / Dichotomous Image Segmentation) |
| HF Repo | `imgly/isnet-general-onnx` (published by IMG.LY GmbH) |
| Base model | `xuebinqin/DIS` isnet-general-use (Apache-2.0) |
| License | **MIT** (HF repo tag; base model Apache-2.0 — both permissive) |
| On-disk size | fp16: 88.2 MB · fp32: 176 MB (fp32 not used) |
| Backend used | WASM (**fp16** — no uint8 variant published; fp16 verified working in ort-web WASM, spike 2026-06-10) |
| Per-image time | ~3.7–4.2 s on 640×480 WASM (same ballpark as ORMBG) |
| Input size | 1024×1024 (per `preprocessor_config.json`) |
| Good at | Illustrations/cartoons, products, arbitrary objects — the domains ORMBG fails on |
| Restrictions | WebGPU disabled app-wide (see WebGPU note above — ISNet shares the MaxPool-ceil architecture). Self-hosted via `npm run download:model`; offline-capable after first use like ORMBG. |

Spike evidence (2026-06-10, Playwright Chromium, WASM): on the cartoon fixture
ORMBG punches a hole through the subject and masks in a cloud
(`tests/output/cartoon-mask-human.png`), while ISNet returns a complete subject
(`cartoon-mask-general.png`); the product fixture cuts cleanly
(`product-mask-general.png`). Test: `tests/e2e/inference-general.spec.ts`.

### License verification

The HF repo `imgly/isnet-general-onnx` is tagged **MIT** by IMG.LY GmbH (the
vendor behind `@imgly/background-removal`, which ships these exact weights).
The underlying ISNet general-use checkpoint comes from `xuebinqin/DIS`
(Apache-2.0). No BRIA / non-commercial components.

Note: `onnx-community/ISNet-ONNX` hosts the *same architecture* but is tagged
AGPL-3.0 — do NOT swap repos casually; the imgly repo is the permissive one.

---

## Rejected candidates

| Model | Reason |
|-------|--------|
| briaai/RMBG-1.4 | Non-commercial research license — prohibited |
| briaai/RMBG-2.0 | Non-commercial research license — prohibited |
| onnx-community/BiRefNet_lite-ONNX (MIT) | WASM forward pass crashes with Emscripten C++ exception on `/bb/layers.X/Sub` ops; loads fine in Node.js (onnxruntime-node). Likely missing CPU kernel for bilateral-branch Sub nodes in ort-web WASM. Could re-evaluate if ort-web adds the kernel. |
| onnx-community/ISNet-ONNX | AGPL-3.0 license — not MIT or Apache-2.0, prohibited |
