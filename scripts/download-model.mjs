#!/usr/bin/env node
/**
 * Download ONNX model weights to public/models/ for self-hosting.
 *
 * Run once before building:
 *   npm run download:model
 *
 * Models land at public/models/<repo-id>/ which is served at /models/... at
 * runtime. The service worker caches these files after first load, enabling
 * full offline use on repeat visits.
 *
 * public/models/ is gitignored — weights are never committed.
 */

import { createWriteStream, mkdirSync, existsSync, renameSync, rmSync } from 'fs';
import { pipeline } from 'stream/promises';
import { join, dirname, sep } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const MODELS_ROOT = join(ROOT, 'public', 'models');

// Fetch exactly the ONNX variants the runtime requests (see src/inference.ts):
//   - ORMBG (Human):   WASM -> model_uint8.onnx; WebGPU -> model_fp16.onnx
//   - ISNet (General): WASM -> model_fp16.onnx (no uint8 variant published)
// Every requested file must be present locally or the runtime falls back to
// the HuggingFace CDN, weakening the offline/privacy guarantee.
const MODELS = [
  {
    name: 'ORMBG (Human, Apache-2.0)',
    repo: 'onnx-community/ormbg-ONNX',
    files: [
      'config.json',
      'preprocessor_config.json',
      'onnx/model_uint8.onnx',
      'onnx/model_fp16.onnx',
    ],
  },
  {
    name: 'ISNet general-use (General, MIT)',
    repo: 'imgly/isnet-general-onnx',
    files: [
      'config.json',
      'preprocessor_config.json',
      'onnx/model_fp16.onnx',
    ],
  },
];

async function download(repo, relPath) {
  const url = `https://huggingface.co/${repo}/resolve/main/${relPath}`;
  const dest = join(MODELS_ROOT, ...repo.split('/'), relPath.split('/').join(sep));
  mkdirSync(dirname(dest), { recursive: true });

  if (existsSync(dest)) {
    console.log(`  skip  ${relPath} (already exists)`);
    return;
  }

  // Stream to a .part file and rename on success so an interrupted download
  // never leaves a truncated file that a re-run would skip as "already exists".
  console.log(`  fetch ${relPath}`);
  const part = `${dest}.part`;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
    await pipeline(res.body, createWriteStream(part));
    renameSync(part, dest);
  } catch (err) {
    rmSync(part, { force: true });
    throw err;
  }
  console.log(`  saved ${relPath}`);
}

// Node 24 has built-in fetch; no polyfill needed.
try {
  for (const model of MODELS) {
    console.log(`\nDownloading ${model.name} -> public/models/${model.repo}/`);
    for (const file of model.files) {
      await download(model.repo, file);
    }
  }
  console.log('\nDone. Run `npm run build` (or `npm run dev`) to use the local models.');
} catch (err) {
  console.error('\nDownload failed:', err.message);
  process.exit(1);
}
