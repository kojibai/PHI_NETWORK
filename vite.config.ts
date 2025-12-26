import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { BASE_APP_VERSION } from "./src/version";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    dedupe: ["react", "react-dom", "react/jsx-runtime"],
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) {
            return;
          }

          if (/[\\/]node_modules[\\/](react|react-dom|react-router-dom)[\\/]/.test(id)) {
            return "react";
          }

          if (/[\\/]node_modules[\\/](three|@react-three)[\\/]/.test(id)) {
            return "three";
          }

          if (/[\\/]node_modules[\\/]@stripe[\\/]/.test(id)) {
            return "stripe";
          }

          if (/[\\/]node_modules[\\/]recharts[\\/]/.test(id)) {
            return "charts";
          }

          if (/[\\/]node_modules[\\/](qrcode|qrcode-generator|react-qr-code)[\\/]/.test(id)) {
            return "qr";
          }

          if (/[\\/]node_modules[\\/]framer-motion[\\/]/.test(id)) {
            return "motion";
          }

          if (
            /[\\/]node_modules[\\/](blakejs|buffer|decimal\\.js|fast-xml-parser|fflate|hash-wasm|html2canvas|jszip|lucide-react|pako|peerjs)[\\/]/
              .test(id)
          ) {
            return "utils";
          }
        },
      },
    },
  },
  define: {
    "import.meta.env.VITE_APP_VERSION": JSON.stringify(BASE_APP_VERSION),
  },
});
