"use client";

import React, { useEffect, useMemo, useState } from "react";
import FeedCard from "../../../components/FeedCard";
import { streamStore, type StreamPreview } from "../../../lib/stream/streamStore";

import { BATCH, ROW_H, computeVirtualWindow } from "./virtualWindow";

type Props = { urls: string[] };

function useVirtualWindow(count: number): { start: number; end: number; topPad: number; bottomPad: number } {
  const [scrollTop, setScrollTop] = useState(0);
  const [vh, setVh] = useState(900);

  useEffect(() => {
    const onScroll = () => setScrollTop(window.scrollY || 0);
    const onResize = () => setVh(window.innerHeight || 900);
    onResize();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onResize);
    };
  }, []);

  const { start, end } = computeVirtualWindow(scrollTop, vh, count);
  return { start, end, topPad: start * ROW_H, bottomPad: Math.max(0, (count - end) * ROW_H) };
}

function PreviewCard({ preview, onOpen }: { preview: StreamPreview; onOpen: () => void }): React.JSX.Element {
  return (
    <article className="feed-card" aria-label={`Preview ${preview.title}`}>
      <header className="feed-head"><strong>{preview.title}</strong></header>
      <p>{preview.shortBody}</p>
      <div className="feed-actions">
        <button type="button" className="feed-btn" onClick={onOpen}>Open</button>
      </div>
    </article>
  );
}

export function StreamList({ urls }: Props): React.JSX.Element {
  const [hydrated, setHydrated] = useState(false);
  const [visibleCount, setVisibleCount] = useState(BATCH);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [previewMap, setPreviewMap] = useState<Record<string, StreamPreview>>({});

  useEffect(() => {
    let dead = false;
    void (async () => {
      await streamStore.ingestUrls(urls);
      const map: Record<string, StreamPreview> = {};
      for (const u of urls) {
        const p = await streamStore.getPreview(u);
        if (p) map[u] = p;
      }
      if (!dead) {
        setPreviewMap(map);
        setHydrated(true);
      }
    })();
    return () => {
      dead = true;
    };
  }, [urls]);

  useEffect(() => {
    const t = window.setInterval(() => setVisibleCount((v) => Math.min(urls.length, v + BATCH)), 120);
    return () => window.clearInterval(t);
  }, [urls.length]);

  const progressive = useMemo(() => urls.slice(0, visibleCount), [urls, visibleCount]);
  const vw = useVirtualWindow(progressive.length);
  const windowed = progressive.slice(vw.start, vw.end);

  if (!urls.length) return <></>;

  return (
    <div className="sf-list" aria-label="Memory Stream">
      <div style={{ height: vw.topPad }} />
      {windowed.map((u) => {
        const isOpen = Boolean(expanded[u]);
        const preview = previewMap[u];
        return isOpen || !hydrated || !preview ? (
          <FeedCard key={u} url={u} threadMode="self" />
        ) : (
          <PreviewCard key={u} preview={preview} onOpen={() => {
            setExpanded((prev) => ({ ...prev, [u]: true }));
            void streamStore.prefetchAround(preview.token);
          }} />
        );
      })}
      <div style={{ height: vw.bottomPad }} />
    </div>
  );
}

export default StreamList;
