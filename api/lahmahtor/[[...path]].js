import { handleLahmahtorProxy } from "../proxy/lahmahtorProxy.mjs";

function buildRequestUrl(req) {
  const host = req.headers?.host ? `http://${req.headers.host}` : "http://localhost";
  return new URL(req.url || "/", host);
}

export default async function handler(req, res) {
  const url = buildRequestUrl(req);
  await handleLahmahtorProxy(req, res, url);
}

export const config = {
  runtime: "nodejs",
};
