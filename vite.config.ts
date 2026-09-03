/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Relative base so the static SPA works on any host or subpath
// (Vercel, Netlify, GitHub Pages, plain file/CDN serving).
export default defineConfig({
  base: "./",
  plugins: [react()],
  build: {
    // Recharts is the bulk of the bundle; a single ~600 kB chunk (~175 kB
    // gzipped) is fine for a static planning tool with no route-splitting.
    // Raise the limit so the production build log stays clean.
    chunkSizeWarningLimit: 900,
  },
  test: {
    // Model tests are pure Node; component tests can opt into jsdom
    // per-file via `// @vitest-environment jsdom`.
    environment: "node",
    globals: true,
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
  },
});
