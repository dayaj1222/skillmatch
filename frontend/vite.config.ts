import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// The build lands in ../static, which FastAPI serves. One origin in production,
// and the dev server proxies /api so there is no CORS config either way.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    outDir: "../static",
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:8766",
        changeOrigin: true,
      },
    },
  },
});
