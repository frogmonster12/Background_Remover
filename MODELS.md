# Model Registry

Only MIT or Apache-2.0 models. Do NOT use BRIA RMBG-1.4 / RMBG-2.0 (non-commercial).

## Chosen model — ORMBG (Apache-2.0)

| Field | Value |
|-------|-------|
| Model | ORMBG (Open Robust Matting Background Removal) |
| HF Repo | `onnx-community/ormbg-ONNX` |
| Base model | `schirrmacher/ormbg` |
| License | **Apache-2.0** |
| On-disk size | uint8: 44.3 MB · fp16: 88.1 MB · fp32: 176 MB |
| Backend used | WASM (uint8) — WebGPU (fp16) on supported hardware |
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
- `public/models/onnx-community/ormbg-ONNX/onnx/model_quantized.onnx`

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

## Rejected candidates

| Model | Reason |
|-------|--------|
| briaai/RMBG-1.4 | Non-commercial research license — prohibited |
| briaai/RMBG-2.0 | Non-commercial research license — prohibited |
| onnx-community/BiRefNet_lite-ONNX (MIT) | WASM forward pass crashes with Emscripten C++ exception on `/bb/layers.X/Sub` ops; loads fine in Node.js (onnxruntime-node). Likely missing CPU kernel for bilateral-branch Sub nodes in ort-web WASM. Could re-evaluate if ort-web adds the kernel. |
| onnx-community/ISNet-ONNX | AGPL-3.0 license — not MIT or Apache-2.0, prohibited |
