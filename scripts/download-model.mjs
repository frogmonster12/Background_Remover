#!/usr/bin/env node
/**
 * Download ORMBG ONNX model weights to public/models/ for self-hosting.
 *
 * Run once before building:
 *   npm run download:model
 *
 * This puts the model at public/models/onnx-community/ormbg-ONNX/ which is
 * served at /models/... at runtime. The service worker caches these files
 * after first load, enabling full offline use on repeat visits.
 *
 * public/models/ is gitignored — weights are never committed.
 */

import { createWriteStream, mkdirSync, existsSync } from 'fs';
import { pipeline } from 'stream/promises';
import { join, dirname, sep } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const MODEL_DIR = join(ROOT, 'public', 'models', 'onnx-community', 'ormbg-ONNX');
const HF_BASE = 'https://huggingface.co/onnx-community/ormbg-ONNX/resolve/main';

const FILES = [
  'config.json',
  'preprocessor_config.json',
  'onnx/model_quantized.onnx',
];

async function download(relPath) {
  const url = `${HF_BASE}/${relPath}`;
  const dest = join(MODEL_DIR, relPath.split('/').join(sep));
  mkdirSync(dirname(dest), { recursive: true });

  if (existsSync(dest)) {
    console.log(`  skip  ${relPath} (already exists)`);
    return;
  }

  console.log(`  fetch ${relPath}`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  await pipeline(res.body, createWriteStream(dest));
  console.log(`  saved ${relPath}`);
}

// Node 24 has built-in fetch; no polyfill needed
console.log('Downloading ORMBG model weights…');
console.log(`  → ${MODEL_DIR}`);

try {
  for (const file of FILES) {
    await download(file);
  }
  console.log('\nDone. Run `npm run build` (or `npm run dev`) to use the local model.');
} catch (err) {
  console.error('\nDownload failed:', err.message);
  process.exit(1);
}
