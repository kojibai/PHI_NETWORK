import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { BASE_APP_VERSION } from "./src/version";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    dedupe: ["react", "react-dom", "react/jsx-runtime"],
  },
  server: {
    proxy: {
      "/api": "http://localhost:8787",
    },
  },
  define: {
    "import.meta.env.VITE_APP_VERSION": JSON.stringify(BASE_APP_VERSION),
  },
  build: {
    assetsInlineLimit: 16384,
    cssCodeSplit: false,
    rollupOptions: {
      output: {
        inlineDynamicImports: true,
      },
    },
  },
});
