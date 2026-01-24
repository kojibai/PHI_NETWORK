// scripts/ssr-pack.mjs
import fs from "node:fs";
import path from "node:path";

const distIndex = path.join(process.cwd(), "dist", "index.html");
const serverDir = path.join(process.cwd(), "dist", "server");
const serverTemplate = path.join(serverDir, "template.html");

// Copy dist/index.html -> dist/server/template.html
fs.mkdirSync(serverDir, { recursive: true });
fs.copyFileSync(distIndex, serverTemplate);
console.log(`SSR template copied -> ${serverTemplate}`);

// IMPORTANT: remove dist/index.html so Vercel rewrites can hit SSR for "/"
// Filesystem takes precedence over rewrites on Vercel. :contentReference[oaicite:2]{index=2}
fs.rmSync(distIndex);
console.log(`Removed static dist/index.html so SSR can handle "/"`);
