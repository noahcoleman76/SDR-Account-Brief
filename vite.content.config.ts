import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  publicDir: false,
  build: {
    outDir: "dist",
    emptyOutDir: false,
    sourcemap: true,
    rollupOptions: {
      input: "src/content/index.tsx",
      output: {
        format: "iife",
        name: "AccountBriefsForOutreachContent",
        entryFileNames: "assets/content.js",
        assetFileNames: "assets/[name][extname]",
        inlineDynamicImports: true
      }
    }
  }
});
