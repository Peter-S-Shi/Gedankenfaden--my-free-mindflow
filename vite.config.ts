import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    open: false,
  },
  // RC-A finding: Vite's dependency-scanner otherwise globs for HTML entry
  // points across the whole project, including generated Tauri codegen
  // assets under src-tauri/target/ once a native build has run locally
  // (and any stray .html under grill/), which starves or breaks the dep
  // scan and makes the real-browser export consumer tests
  // (f06-pdf-diagram-consumer, f09-browser-raster-consumer) hang/time out
  // whenever a Rust build has already produced target/ output on the same
  // machine. Scoping entries to the actual app entry point fixes this
  // without touching src-tauri or the generated build output at all.
  optimizeDeps: {
    entries: ['index.html'],
  },
});
