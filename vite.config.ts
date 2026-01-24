// vite.config.ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { BASE_APP_VERSION } from "./src/version";

export default defineConfig(({ isSsrBuild }) => {
  const ssrBuild = isSsrBuild === true;

  return {
    plugins: [react()],
    resolve: {
      dedupe: [
        "react",
        "react-dom",
        "react/jsx-runtime",
        "react-router",
        "react-router-dom",
      ],
    },
    server: {
      proxy: {
        "/api": "http://localhost:8787",
        "/sigils": {
          target: "https://m.kai.ac",
          changeOrigin: true,
          secure: true,
        },
      },
    },
    define: {
      "import.meta.env.VITE_APP_VERSION": JSON.stringify(BASE_APP_VERSION),
    },

    publicDir: ssrBuild ? false : "public",

    build: {
      outDir: ssrBuild ? "dist/server" : "dist",
      ssrManifest: !ssrBuild,
      target: ssrBuild ? "node20" : undefined,
      rollupOptions: {
        input: ssrBuild ? undefined : "index.html",
      },
    },

    ssr: {
      noExternal: ["react-router", "react-router-dom"],
    },
  };
});
