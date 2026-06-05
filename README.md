# Cutout — Background Remover

Remove image backgrounds in your browser. No uploads. No account. No server.

Every pixel is processed locally using a neural network that runs in WebAssembly. Nothing ever leaves your device.

---

## Why this is different

Most background-removal tools send your images to a server. This one doesn't. The AI model (44 MB, downloaded once) runs entirely in WebAssembly inside a Web Worker. After the first visit, the app and model are cached — it works offline.

---

## Features

- **Clean edges** — ORMBG neural network with optional edge feathering
- **Background modes** — Transparent, solid color, blur, or custom image
- **Batch processing** — Drop multiple files, download all as a ZIP
- **Offline-capable** — Service worker caches app and model after first load
- **Privacy** — Zero network requests after initial load; no analytics, no telemetry
- **Formats** — PNG, JPEG, WebP input; HEIC/HEIF on supported browsers; PNG/JPEG export

---

## Privacy

Once the page and model are loaded, all processing happens on-device. Verified by:

- The network inspector stays silent during inference
- The Content Security Policy blocks any unlisted connection targets
- No analytics or error-reporting scripts are included

---

## Supported formats

| Input | Notes |
|-------|-------|
| PNG | Full alpha-channel support |
| JPEG | Converted to RGBA internally |
| WebP | Browser-native decode |
| HEIC / HEIF | Requires browser support or the `heic2any` fallback (lazy-loaded, ~2.7 MB) |

| Export | When available |
|--------|---------------|
| PNG | Always (supports transparency) |
| JPEG | Only when background mode is opaque (color, blur, or image) |

---

## Model

| Field | Value |
|-------|-------|
| Model | ORMBG (Open Robust Matting Background Removal) |
| Source | `onnx-community/ormbg-ONNX` |
| License | **Apache-2.0** |
| Size | 44 MB (uint8 quantized) |
| Backend | WebAssembly (SIMD); WebGPU on supported hardware |

See [MODELS.md](MODELS.md) for the full model registry and rejected candidates.

---

## Licenses

| Component | License |
|-----------|---------|
| This repository | MIT |
| ORMBG model weights | Apache-2.0 |
| onnx-community/ormbg-ONNX export | Apache-2.0 |
| fflate (ZIP) | MIT |
| heic2any | MIT |
| @huggingface/transformers | Apache-2.0 |

---

## Local development

**Requirements:** Node 24 LTS

```bash
# 1. Install dependencies
npm install

# 2. Copy ORT WASM runtime files
npm run copy:ort

# 3. (Optional) Download model weights for offline support
#    ~44 MB, written to public/models/ (gitignored)
npm run download:model

# 4. Start dev server
npm run dev
```

The dev server runs at `http://localhost:5173` with the required COEP/COOP headers.

### Other commands

```bash
npm run typecheck       # TypeScript strict check
npm test                # Vitest unit tests
npm run test:e2e        # Playwright E2E (mock inference, fast)
npm run lint            # ESLint
npm run build           # Production build → dist/
npm run preview         # Serve built dist/
```

---

## Deploy to GitHub Pages

1. Push to `main` — the [deploy workflow](.github/workflows/deploy.yml) runs automatically.
2. In your repository settings → Pages → Source: **GitHub Actions**.
3. The workflow installs dependencies, downloads model weights, builds, and deploys `dist/`.

The service worker injects `Cross-Origin-Embedder-Policy: credentialless` and `Cross-Origin-Opener-Policy: same-origin` headers on GitHub Pages (which doesn't support custom HTTP headers natively), enabling SharedArrayBuffer for multithreaded WASM inference.

### Manual deploy

```bash
npm run copy:ort
npm run download:model   # Optional, but needed for offline PWA
npm run build
# Upload dist/ to any static host
```

---

## Architecture

```
index.html + main.ts        ← UI, tab switching, download
    │
    ├─ Web Worker (worker.ts)
    │       └─ inference.ts  ← ORMBG pipeline via transformers.js
    │
    ├─ compose.ts            ← featherMask, applyMask (pure, unit-tested)
    ├─ formats.ts            ← decodeToBitmap, HEIC support
    ├─ batch.ts              ← sequential queue, ZIP export
    └─ batch-view.ts         ← batch UI component
```

All heavy work (model load + inference) lives in the Web Worker and never blocks the main thread. The worker protocol is typed in `src/contracts.ts` and frozen — changes require updating both sides.
