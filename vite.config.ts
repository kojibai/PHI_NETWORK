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
        manualChunks: {
          react: ["react", "react-dom", "react-router-dom"],
          three: ["three", "@react-three/fiber", "@react-three/drei"],
          stripe: ["@stripe/react-stripe-js", "@stripe/stripe-js"],
          charts: ["recharts"],
          qr: ["qrcode", "qrcode-generator", "react-qr-code"],
          motion: ["framer-motion"],
          utils: [
            "blakejs",
            "buffer",
            "decimal.js",
            "fast-xml-parser",
            "fflate",
            "hash-wasm",
            "html2canvas",
            "jszip",
            "lucide-react",
            "pako",
            "peerjs",
          ],
        },
      },
    },
  },
  define: {
    "import.meta.env.VITE_APP_VERSION": JSON.stringify(BASE_APP_VERSION),
  },
});
