import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { spawn } from "node:child_process";
import { test } from "node:test";

const repoRoot = resolve(process.cwd());
const devApiScript = resolve(repoRoot, "scripts/dev-api.mjs");

function waitForServer(proc, timeoutMs = 8000) {
  return new Promise((resolveReady, rejectReady) => {
    const timeout = setTimeout(() => {
      rejectReady(new Error("dev api did not start in time"));
    }, timeoutMs);

    const onData = (chunk) => {
      if (String(chunk).includes("Sigil proof API listening")) {
        clearTimeout(timeout);
        proc.stdout.off("data", onData);
        resolveReady();
      }
    };

    proc.stdout.on("data", onData);
    proc.once("exit", (code) => {
      clearTimeout(timeout);
      rejectReady(new Error(`dev api exited before ready (code ${code ?? "null"})`));
    });
  });
}

test("dev api stream loader accepts /p~ URLs and keeps seal stable without updatedAt", async () => {
  const tempRoot = mkdtempSync(join(tmpdir(), "phi-dev-api-"));
  const publicDir = join(tempRoot, "public");
  mkdirSync(publicDir, { recursive: true });

  const token = "A".repeat(20);
  writeFileSync(
    join(publicDir, "links.json"),
    JSON.stringify([{ url: `https://example.com/p~${token}` }]),
    "utf8",
  );

  const port = 18787;
  const proc = spawn(process.execPath, [devApiScript], {
    cwd: tempRoot,
    env: { ...process.env, API_PORT: String(port) },
    stdio: ["ignore", "pipe", "pipe"],
  });

  try {
    await waitForServer(proc);

    const first = await fetch(`http://127.0.0.1:${port}/api/stream/head`).then((r) => r.json());
    const second = await fetch(`http://127.0.0.1:${port}/api/stream/head`).then((r) => r.json());
    const delta = await fetch(`http://127.0.0.1:${port}/api/stream/delta?after=${encodeURIComponent(first.seal)}`).then((r) => r.json());

    assert.equal(first.total, 1);
    assert.equal(second.total, 1);
    assert.equal(first.seal, second.seal);
    assert.equal(delta.rows.length, 0);
  } finally {
    proc.kill("SIGTERM");
    rmSync(tempRoot, { recursive: true, force: true });
  }
});
