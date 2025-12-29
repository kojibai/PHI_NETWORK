import http from "node:http";

import handler from "./proof/sigil.js";

const PORT = Number(process.env.PROOF_API_PORT ?? "8787");

const server = http.createServer((req, res) => {
  const host = req.headers.host ?? "localhost";
  const url = new URL(req.url ?? "/", `http://${host}`);

  if (url.pathname === "/") {
    res.statusCode = 200;
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.end(
      "Proof API is running. POST /api/proof/sigil with { poseidonHash, payloadHashHex | secret }."
    );
    return;
  }

  if (url.pathname === "/api/proof/sigil") {
    if (req.method !== "POST") {
      res.statusCode = 405;
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      res.end("Method not allowed. POST /api/proof/sigil.");
      return;
    }
    handler(req, res);
    return;
  }

  res.statusCode = 404;
  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.end("Not found");
});

server.listen(PORT, () => {
  console.log(`Proof API dev server listening on http://localhost:${PORT}`);
});
