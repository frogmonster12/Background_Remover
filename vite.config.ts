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
  },
  server: {
    headers: {
      // Required for SharedArrayBuffer / cross-origin isolation (WebGPU)
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
});
