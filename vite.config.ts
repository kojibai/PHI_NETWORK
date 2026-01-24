// vite.config.ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { BASE_APP_VERSION } from "./src/version";

export default defineConfig(({ isSsrBuild }) => {
  const ssrBuild = isSsrBuild === true;

  return {
    plugins: [react()],
    resolve: {
      dedupe: ["react", "react-dom", "react/jsx-runtime"],
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
    build: {
      // ✅ Client build must land in "dist/" for Vercel static hosting.
      outDir: ssrBuild ? "dist/server" : "dist",
      // ✅ SSR manifest is only useful for the CLIENT build (used by SSR runtime),
      // so do NOT emit it during server build.
      ssrManifest: !ssrBuild,
      rollupOptions: {
        // ✅ Client build needs index.html input; server build does not.
        input: ssrBuild ? undefined : "index.html",
      },
    },
    ssr: {
      noExternal: ["react-router-dom"],
    },
  };
});
