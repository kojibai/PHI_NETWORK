// src/pages/sigilstream/attachments/ksfp.tsx
"use client";

import { useEffect, useRef, useState } from "react";
import type { AttachmentKsfpInline } from "./types";
import { listKsfpChunks, type KsfpLineageKey, type KsfpOriginManifest } from "../../../lib/ksfp1";
import { decodeFeedPayload, extractPayloadTokenFromUrlString } from "../../../utils/feedPayload";
import {
  SIGIL_REGISTRY_FALLBACK_LS_KEY,
  SIGIL_REGISTRY_LS_KEY,
  getInMemorySigilUrls,
} from "../../../utils/sigilRegistry";
import { LS_KEY, parseStringArray } from "../data/storage";

type KsfpStatus = "idle" | "loading" | "ready" | "error";

const prettyBytes = (n: number | undefined): string => {
  if (typeof n !== "number" || !Number.isFinite(n)) return "—";
  const KB = 1024;
  const MB = KB * 1024;
  const GB = MB * 1024;
  if (n >= GB) return `${(n / GB).toFixed(2)} GB`;
  if (n >= MB) return `${(n / MB).toFixed(2)} MB`;
  if (n >= KB) return `${(n / KB).toFixed(2)} KB`;
  return `${Math.round(n)} B`;
};

function canUseMediaSource(): boolean {
  return typeof window !== "undefined" && typeof window.MediaSource !== "undefined";
}

function splitMimeType(mime: string): { base: string; codec?: string } {
  const [baseRaw, ...paramParts] = mime.split(";");
  const base = baseRaw.trim();
  const params = paramParts.join(";").trim();
  if (!params) return { base };
  const match = params.match(/codecs\s*=\s*\"?([^\";]+)\"?/i);
  const codec = match?.[1]?.trim();
  return codec ? { base, codec } : { base };
}

function resolveMimeForMediaSource(origin: KsfpOriginManifest): { base: string; codec?: string } {
  const rawMime = origin.mime || "video/mp4";
  const parsed = splitMimeType(rawMime);
  return {
    base: parsed.base,
    codec: origin.specialization?.codec ?? parsed.codec,
  };
}

function fromBase64Url(token: string): Uint8Array {
  const base64 = token.replace(/-/g, "+").replace(/_/g, "/");
  const pad = base64.length % 4;
  const padded = pad ? base64 + "=".repeat(4 - pad) : base64;
  const binary = atob(padded);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
  return out;
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const out = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(out).set(bytes);
  return out;
}

async function waitForUpdateEnd(sourceBuffer: SourceBuffer): Promise<void> {
  if (!sourceBuffer.updating) return;
  await new Promise<void>((resolve, reject) => {
    const onEnd = (): void => {
      sourceBuffer.removeEventListener("updateend", onEnd);
      sourceBuffer.removeEventListener("error", onErr);
      resolve();
    };
    const onErr = (): void => {
      sourceBuffer.removeEventListener("updateend", onEnd);
      sourceBuffer.removeEventListener("error", onErr);
      reject(new Error("SourceBuffer error"));
    };
    sourceBuffer.addEventListener("updateend", onEnd);
    sourceBuffer.addEventListener("error", onErr);
  });
}

function lineageByKey(lineage: KsfpLineageKey[]): Map<string, KsfpLineageKey> {
  const map = new Map<string, KsfpLineageKey>();
  for (const item of lineage) {
    map.set(`${item.tier}:${item.chunkIndex}`, item);
  }
  return map;
}

function mergeLineage(base: KsfpLineageKey[], incoming: KsfpLineageKey[]): KsfpLineageKey[] {
  const map = lineageByKey(base);
  for (const item of incoming) {
    map.set(`${item.tier}:${item.chunkIndex}`, item);
  }
  return Array.from(map.values()).sort((a, b) => {
    if (a.tier !== b.tier) return a.tier - b.tier;
    return a.chunkIndex - b.chunkIndex;
  });
}

function collectAddTokens(): string[] {
  if (typeof window === "undefined") return [];
  const hashStr = window.location.hash.startsWith("#") ? window.location.hash.slice(1) : window.location.hash;
  const hashParams = new URLSearchParams(hashStr);
  const searchParams = new URLSearchParams(window.location.search);
  const addsRaw = [...hashParams.getAll("add"), ...searchParams.getAll("add")];
  const tokens: string[] = [];
  for (const raw of addsRaw) {
    const tok = extractPayloadTokenFromUrlString(raw);
    if (tok && !tokens.includes(tok)) tokens.push(tok);
  }
  return tokens;
}

function readRegistryUrls(): string[] {
  if (typeof window === "undefined") return [];
  const urls = new Set<string>(getInMemorySigilUrls());
  const readList = (key: string) => {
    try {
      const raw = window.localStorage.getItem(key);
      if (!raw) return;
      const parsed: unknown = JSON.parse(raw);
      if (!Array.isArray(parsed)) return;
      for (const v of parsed) {
        if (typeof v === "string" && v.trim()) urls.add(v.trim());
      }
    } catch {
      // ignore
    }
  };
  try {
    for (const u of parseStringArray(window.localStorage.getItem(LS_KEY))) {
      if (u.trim()) urls.add(u.trim());
    }
  } catch {
    // ignore
  }
  readList(SIGIL_REGISTRY_LS_KEY);
  readList(SIGIL_REGISTRY_FALLBACK_LS_KEY);
  return Array.from(urls);
}

function extractAddTokensFromUrl(url: string): string[] {
  const tokens: string[] = [];
  try {
    const u = new URL(url, window.location.origin);
    const hashStr = u.hash.startsWith("#") ? u.hash.slice(1) : u.hash;
    const hashParams = new URLSearchParams(hashStr);
    const addsRaw = [...u.searchParams.getAll("add"), ...hashParams.getAll("add")];
    for (const raw of addsRaw) {
      const tok = extractPayloadTokenFromUrlString(raw);
      if (tok && !tokens.includes(tok)) tokens.push(tok);
    }
  } catch {
    // ignore
  }
  return tokens;
}

function collectLineageFromAdds(originHash: string, base: KsfpLineageKey[]): KsfpLineageKey[] {
  const tokens = collectAddTokens();
  if (tokens.length === 0) return base;
  const incoming: KsfpLineageKey[] = [];

  for (const tok of tokens) {
    const payload = decodeFeedPayload(tok);
    if (!payload?.attachments || !Array.isArray(payload.attachments.items)) continue;
    for (const item of payload.attachments.items) {
      if (item.kind !== "ksfp-inline") continue;
      if (item.bundle.origin.fileHash !== originHash) continue;
      incoming.push(...item.bundle.lineage);
    }
  }

  return incoming.length > 0 ? mergeLineage(base, incoming) : base;
}

function collectLineageFromRegistry(originHash: string, base: KsfpLineageKey[]): KsfpLineageKey[] {
  const urls = readRegistryUrls();
  if (urls.length === 0) return base;
  const tokens: string[] = [];
  for (const url of urls) {
    const tok = extractPayloadTokenFromUrlString(url);
    if (tok && !tokens.includes(tok)) tokens.push(tok);
    for (const addTok of extractAddTokensFromUrl(url)) {
      if (!tokens.includes(addTok)) tokens.push(addTok);
    }
  }

  if (tokens.length === 0) return base;

  const incoming: KsfpLineageKey[] = [];
  for (const tok of tokens) {
    const payload = decodeFeedPayload(tok);
    if (!payload?.attachments || !Array.isArray(payload.attachments.items)) continue;
    for (const item of payload.attachments.items) {
      if (item.kind !== "ksfp-inline") continue;
      if (item.bundle.origin.fileHash !== originHash) continue;
      incoming.push(...item.bundle.lineage);
    }
  }

  return incoming.length > 0 ? mergeLineage(base, incoming) : base;
}

async function streamKsfpToMediaSource(
  origin: KsfpOriginManifest,
  lineage: KsfpLineageKey[],
  videoEl: HTMLVideoElement,
): Promise<() => void> {
  const mediaSource = new MediaSource();
  const objectUrl = URL.createObjectURL(mediaSource);
  videoEl.src = objectUrl;
  videoEl.load();

  const cleanup = (): void => {
    URL.revokeObjectURL(objectUrl);
  };

  await new Promise<void>((resolve) => {
    mediaSource.addEventListener("sourceopen", () => resolve(), { once: true });
  });

  const { base: mimeBase, codec } = resolveMimeForMediaSource(origin);
  const mime = codec ? `${mimeBase}; codecs="${codec}"` : mimeBase;

  const sourceBuffer = mediaSource.addSourceBuffer(mime);
  const map = lineageByKey(lineage);

  for (const chunk of listKsfpChunks(origin)) {
    const entry = map.get(`${chunk.tier}:${chunk.index}`);
    if (!entry) continue;
    const bytes = fromBase64Url(entry.payload.data_b64url);
    sourceBuffer.appendBuffer(toArrayBuffer(bytes));
    await waitForUpdateEnd(sourceBuffer);
  }

  mediaSource.endOfStream();
  return cleanup;
}

async function buildKsfpBlob(origin: KsfpOriginManifest, lineage: KsfpLineageKey[]): Promise<Blob | null> {
  const map = lineageByKey(lineage);
  const parts: ArrayBuffer[] = [];
  for (const chunk of listKsfpChunks(origin)) {
    const entry = map.get(`${chunk.tier}:${chunk.index}`);
    if (!entry) return null;
    parts.push(toArrayBuffer(fromBase64Url(entry.payload.data_b64url)));
  }
  return new Blob(parts, { type: origin.mime || "application/octet-stream" });
}

export function KsfpInlineCard({ item }: { item: AttachmentKsfpInline }): React.JSX.Element {
  const { origin, lineage } = item.bundle;
  const [status, setStatus] = useState<KsfpStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [playbackUrl, setPlaybackUrl] = useState<string | null>(null);
  const [mergedLineage, setMergedLineage] = useState<KsfpLineageKey[]>(lineage);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const isVideo = (origin.mime || item.type || "").startsWith("video/");

  useEffect(() => {
    const withAdds = collectLineageFromAdds(origin.fileHash, lineage);
    const withRegistry = collectLineageFromRegistry(origin.fileHash, withAdds);
    setMergedLineage(withRegistry);
  }, [origin.fileHash, lineage]);

  useEffect(() => {
    if (!videoRef.current) return;
    if (!isVideo) return;
    let cleanup: (() => void) | null = null;
    let cancelled = false;
    setStatus("loading");

    const fallbackToBlob = async (): Promise<void> => {
      const blob = await buildKsfpBlob(origin, mergedLineage);
      if (!blob) {
        throw new Error("Unable to reconstruct inline payload.");
      }
      const url = URL.createObjectURL(blob);
      setPlaybackUrl(url);
      setStatus("ready");
    };

    if (!canUseMediaSource()) {
      fallbackToBlob().catch((err) => {
        if (cancelled) return;
        setStatus("error");
        setError(err instanceof Error ? err.message : "KSFP playback failed.");
      });
      return () => {
        cancelled = true;
      };
    }

    const { base: mimeBase, codec } = resolveMimeForMediaSource(origin);
    const mime = codec ? `${mimeBase}; codecs="${codec}"` : mimeBase;
    if (!MediaSource.isTypeSupported(mime)) {
      fallbackToBlob().catch((err) => {
        if (cancelled) return;
        setStatus("error");
        setError(err instanceof Error ? err.message : "KSFP playback failed.");
      });
      return () => {
        cancelled = true;
      };
    }

    streamKsfpToMediaSource(origin, mergedLineage, videoRef.current)
      .then((c) => {
        if (cancelled) return;
        cleanup = c;
        setStatus("ready");
      })
      .catch((err) => {
        if (cancelled) return;
        fallbackToBlob().catch(() => {
          setStatus("error");
          setError(err instanceof Error ? err.message : "KSFP stream failed.");
        });
      });
    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, [origin, mergedLineage, isVideo]);

  useEffect(() => {
    return () => {
      if (playbackUrl) URL.revokeObjectURL(playbackUrl);
    };
  }, [playbackUrl]);

  const handlePrepareDownload = async (): Promise<void> => {
    setStatus("loading");
    const blob = await buildKsfpBlob(origin, mergedLineage);
    if (!blob) {
      setStatus("error");
      setError("Unable to reconstruct from inline payload.");
      return;
    }
    const url = URL.createObjectURL(blob);
    setDownloadUrl(url);
    setStatus("ready");
  };

  const safeName = item.name || origin.fileName || "file";

  return (
    <div className="sf-ksfp">
      <div className="sf-file-head">
        <div className="sf-file-name">{item.relPath || safeName}</div>
        <div className="sf-file-size">{prettyBytes(item.size ?? origin.byteLength)}</div>
      </div>

      <div className="sf-file-foot">
        <div className="sf-file-type">{origin.mime || item.type || "application/octet-stream"}</div>
        <code className="sf-hash mono">blake3:{origin.fileHash}</code>
      </div>

      {status === "error" && error && <div className="sf-note sf-note--warn">{error}</div>}

      {isVideo ? (
        <div className="sf-media sf-media--video sf-ksfp-media">
          {playbackUrl ? (
            <video src={playbackUrl} controls playsInline preload="metadata" />
          ) : (
            <video ref={videoRef} controls playsInline preload="metadata" />
          )}
        </div>
      ) : null}

      <div className="sf-ksfp-actions">
        {downloadUrl ? (
          <a className="sf-file-dl" href={downloadUrl} download={safeName}>
            Download
          </a>
        ) : (
          <button className="sf-file-dl sf-ksfp-btn" onClick={handlePrepareDownload} disabled={status === "loading"}>
            {status === "loading" ? "Preparing…" : "Prepare download"}
          </button>
        )}
        <span className="sf-ksfp-tag">KSFP-1 inline</span>
      </div>
    </div>
  );
}
