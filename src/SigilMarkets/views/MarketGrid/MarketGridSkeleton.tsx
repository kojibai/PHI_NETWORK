// SigilMarkets/views/MarketGrid/MarketGridSkeleton.tsx
"use client";

import { useMemo } from "react";

export type MarketGridSkeletonProps = Readonly<{
  /** Default: 8 */
  count?: number;
  /** "honeycomb" matches default grid; "list" matches list layout */
  layout?: "honeycomb" | "list";
}>;

export const MarketGridSkeleton = (props: MarketGridSkeletonProps) => {
  const count = props.count ?? 8;
  const layout = props.layout ?? "honeycomb";

  const cells = useMemo(() => Array.from({ length: Math.max(1, Math.min(24, Math.floor(count))) }, (_, i) => i), [count]);

  return (
    <div className={`sm-grid ${layout === "list" ? "is-list" : "is-honeycomb"}`} aria-label="Loading markets">
      {cells.map((i) => (
        <div key={i} className="sm-skel-cell" />
      ))}
    </div>
  );
};
