// src/pages/sigilstream/attachments/ksfp.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { AttachmentFileRef } from "./types";
import {
  KSFP_CACHE_NAME,
  isKsfpOriginUrl,
  loadKsfpOrigin,
  loadKsfpLineage,
  loadKsfpChunkBuffer,
  listKsfpChunks,
  type KsfpOriginManifest,
} from "../../../lib/ksfp1";

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

async function streamKsfpToMediaSource(
  originSig: string,
  origin: KsfpOriginManifest,
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

  const codec = origin.specialization?.codec;
  const mimeBase = origin.mime || "video/mp4";
  const mime = codec ? `${mimeBase}; codecs="${codec}"` : mimeBase;
  if (!MediaSource.isTypeSupported(mime)) {
    throw new Error(`Unsupported media type: ${mime}`);
  }
  const sourceBuffer = mediaSource.addSourceBuffer(mime);

  for (const chunk of listKsfpChunks(origin)) {
    const lineage = await loadKsfpLineage(originSig, chunk.tier, chunk.index, { cacheName: KSFP_CACHE_NAME });
    if (!lineage) continue;
    const buf = await loadKsfpChunkBuffer(lineage.payload.blobRef, { cacheName: KSFP_CACHE_NAME });
    if (!buf) continue;
    sourceBuffer.appendBuffer(buf);
    await waitForUpdateEnd(sourceBuffer);
  }

  mediaSource.endOfStream();
  return cleanup;
}

async function buildKsfpBlob(originSig: string, origin: KsfpOriginManifest): Promise<Blob | null> {
  const parts: ArrayBuffer[] = [];
  for (const chunk of listKsfpChunks(origin)) {
    const lineage = await loadKsfpLineage(originSig, chunk.tier, chunk.index, { cacheName: KSFP_CACHE_NAME });
    if (!lineage) return null;
    const buf = await loadKsfpChunkBuffer(lineage.payload.blobRef, { cacheName: KSFP_CACHE_NAME });
    if (!buf) return null;
    parts.push(buf);
  }
  return new Blob(parts, { type: origin.mime || "application/octet-stream" });
}

export function KsfpFileCard({ item }: { item: AttachmentFileRef }): React.JSX.Element {
  const [origin, setOrigin] = useState<KsfpOriginManifest | null>(null);
  const [status, setStatus] = useState<KsfpStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const originSig = useMemo(() => {
    if (!item.url) return null;
    try {
      const u = new URL(item.url, globalThis.location?.origin ?? "http://localhost");
      const parts = u.pathname.split("/").filter(Boolean);
      return parts[2] ?? null;
    } catch {
      return null;
    }
  }, [item.url]);

  useEffect(() => {
    if (!item.url || !isKsfpOriginUrl(item.url)) return;
    let active = true;
    setStatus("loading");
    setError(null);
    loadKsfpOrigin(item.url, { cacheName: KSFP_CACHE_NAME })
      .then((o) => {
        if (!active) return;
        if (!o) {
          setStatus("error");
          setError("KSFP origin missing from cache.");
          return;
        }
        setOrigin(o);
        setStatus("ready");
      })
      .catch((err) => {
        if (!active) return;
        setStatus("error");
        setError(err instanceof Error ? err.message : "Failed to load KSFP origin.");
      });
    return () => {
      active = false;
    };
  }, [item.url]);

  useEffect(() => {
    if (!origin || !originSig) return;
    if (!videoRef.current) return;
    if (!canUseMediaSource()) return;
    let cleanup: (() => void) | null = null;
    let cancelled = false;
    streamKsfpToMediaSource(originSig, origin, videoRef.current)
      .then((c) => {
        if (cancelled) return;
        cleanup = c;
      })
      .catch(() => {
        if (cancelled) return;
        setError("KSFP stream failed.");
      });
    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, [origin, originSig]);

  const handlePrepareDownload = async (): Promise<void> => {
    if (!origin || !originSig) return;
    setStatus("loading");
    const blob = await buildKsfpBlob(originSig, origin);
    if (!blob) {
      setStatus("error");
      setError("Unable to reconstruct from cache.");
      return;
    }
    const url = URL.createObjectURL(blob);
    setDownloadUrl(url);
    setStatus("ready");
  };

  const safeName = item.name || origin?.fileName || "file";
  const isVideo = (origin?.mime || item.type || "").startsWith("video/");

  return (
    <div className="sf-ksfp">
      <div className="sf-file-head">
        <div className="sf-file-name">{item.relPath || safeName}</div>
        <div className="sf-file-size">{prettyBytes(item.size ?? origin?.byteLength)}</div>
      </div>

      <div className="sf-file-foot">
        <div className="sf-file-type">{origin?.mime || item.type || "application/octet-stream"}</div>
        <code className="sf-hash mono">sha256:{item.sha256}</code>
      </div>

      {status === "error" && error && <div className="sf-note sf-note--warn">{error}</div>}

      {origin && isVideo ? (
        <div className="sf-media sf-media--video sf-ksfp-media">
          {canUseMediaSource() ? (
            <video ref={videoRef} controls playsInline preload="metadata" />
          ) : (
            <div className="sf-note">MediaSource not available. Use download to play.</div>
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
        <span className="sf-ksfp-tag">KSFP-1 cache</span>
      </div>
    </div>
  );
}

export function shouldRenderKsfp(item: AttachmentFileRef): boolean {
  return isKsfpOriginUrl(item.url);
}
