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
    const timeout = setTimeout(() => rejectReady(new Error("dev api did not start in time")), timeoutMs);
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

const makeRow = (id, pulse) => ({
  url: `https://example.com/p~${String(id).repeat(20).slice(0, 20)}`,
  pulse,
  updatedAt: pulse,
  title: `Title-${id}`,
  author: "@sync",
  kind: "text",
  shortBody: `Body ${id}`,
});

async function fetchJson(url) {
  const res = await fetch(url);
  assert.equal(res.ok, true, `request failed: ${url}`);
  return res.json();
}

test("delta roundtrip syncs paginated snapshot->delta->apply against live API", async () => {
  const tempRoot = mkdtempSync(join(tmpdir(), "phi-stream-roundtrip-"));
  const publicDir = join(tempRoot, "public");
  mkdirSync(publicDir, { recursive: true });

  const initial = [makeRow("A", 1), makeRow("B", 2), makeRow("C", 3), makeRow("D", 4), makeRow("E", 5)];
  writeFileSync(join(publicDir, "links.json"), JSON.stringify(initial), "utf8");

  const port = 18788;
  const proc = spawn(process.execPath, [devApiScript], {
    cwd: tempRoot,
    env: { ...process.env, API_PORT: String(port) },
    stdio: ["ignore", "pipe", "pipe"],
  });

  try {
    await waitForServer(proc);

    const base = `http://127.0.0.1:${port}`;
    const snapshotRecords = new Map();
    let cursor = null;

    for (let i = 0; i < 10; i += 1) {
      const page = await fetchJson(`${base}/api/stream/snapshot?compact=1&limit=2${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`);
      for (const row of page.rows) snapshotRecords.set(row.token, row.pulse);
      cursor = page.nextCursor;
      if (!cursor) break;
    }

    const startHead = await fetchJson(`${base}/api/stream/head`);
    assert.equal(snapshotRecords.size, 5);
    assert.equal(startHead.total, 5);

    const updated = [...initial, makeRow("F", 6), makeRow("G", 7)];
    writeFileSync(join(publicDir, "links.json"), JSON.stringify(updated), "utf8");

    const deltaRecords = new Map(snapshotRecords);
    let deltaCursor = null;
    let currentSeal = startHead.seal;

    for (let i = 0; i < 10; i += 1) {
      const page = await fetchJson(
        `${base}/api/stream/delta?after=${encodeURIComponent(startHead.seal)}&limit=1${deltaCursor ? `&cursor=${encodeURIComponent(deltaCursor)}` : ""}`,
      );
      for (const row of page.rows) deltaRecords.set(row.token, row.pulse);
      currentSeal = page.seal;
      deltaCursor = page.nextCursor;
      if (!deltaCursor) {
        assert.equal(page.latestSeal, currentSeal);
        break;
      }
    }

    const finalHead = await fetchJson(`${base}/api/stream/head`);
    assert.equal(finalHead.total, 7);
    assert.equal(finalHead.seal, currentSeal);
    assert.equal(deltaRecords.size, 7);
    assert.equal(deltaRecords.get("FFFFFFFFFFFFFFFFFFFF"), 6);
    assert.equal(deltaRecords.get("GGGGGGGGGGGGGGGGGGGG"), 7);
  } finally {
    proc.kill("SIGTERM");
    rmSync(tempRoot, { recursive: true, force: true });
  }
});
