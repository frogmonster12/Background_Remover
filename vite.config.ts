import { readFileSync } from 'fs';
import { join } from 'path';
import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  worker: {
    format: 'es',
  },
  build: {
    target: 'es2022',
  },
  define: {
    // Replaced at build time; default to mock unless USE_REAL_MODEL=true
    __USE_REAL_MODEL__: JSON.stringify(process.env['USE_REAL_MODEL'] === 'true'),
    // Skip WebGPU detection — used in headless Playwright tests where navigator.gpu
    // exists (SwiftShader) but ONNX WebGPU ops are unreliable.
    __FORCE_WASM__: JSON.stringify(process.env['FORCE_WASM'] === 'true'),
  },
  plugins: [
    {
      name: 'serve-ort-wasm',
      // ORT dynamically imports its .mjs glue module. Vite blocks direct imports of
      // files in public/ — so we resolve them here instead.
      // Files are copied to public/ort/ by `npm run copy:ort`.
      resolveId(source) {
        if (source.startsWith('/ort/') && source.endsWith('.mjs')) {
          return '\0ort-wasm-glue:' + source;
        }
        return null;
      },
      load(id) {
        if (id.startsWith('\0ort-wasm-glue:')) {
          const filename = id.replace('\0ort-wasm-glue:/ort/', '');
          const filePath = join(process.cwd(), 'public', 'ort', filename);
          return readFileSync(filePath, 'utf-8');
        }
        return null;
      },
    },
  ],
  server: {
    headers: {
      // COOP + COEP credentialless enables crossOriginIsolated (SharedArrayBuffer + WebGPU)
      // while allowing cross-origin CORS resources.
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'credentialless',
    },
  },
});
