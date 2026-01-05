// SigilMarkets/hooks/usePositions.ts
"use client";

import { useMemo } from "react";
import type { MarketId } from "../types/marketTypes";
import type { PositionId, PositionRecord, PositionStatus } from "../types/sigilPositionTypes";
import { usePositionById as useStorePositionById, usePositions as useStorePositions } from "../state/positionStore";

export type PositionsQuery = Readonly<{
  marketId?: MarketId;
  statuses?: readonly PositionStatus[];
}>;

export type PositionBuckets = Readonly<{
  open: readonly PositionRecord[];
  claimable: readonly PositionRecord[];
  lost: readonly PositionRecord[];
  refundable: readonly PositionRecord[];
  claimed: readonly PositionRecord[];
  refunded: readonly PositionRecord[];
}>;

const bucketize = (positions: readonly PositionRecord[]): PositionBuckets => {
  const open: PositionRecord[] = [];
  const claimable: PositionRecord[] = [];
  const lost: PositionRecord[] = [];
  const refundable: PositionRecord[] = [];
  const claimed: PositionRecord[] = [];
  const refunded: PositionRecord[] = [];

  for (const p of positions) {
    switch (p.status) {
      case "open":
        open.push(p);
        break;
      case "claimable":
        claimable.push(p);
        break;
      case "lost":
        lost.push(p);
        break;
      case "refundable":
        refundable.push(p);
        break;
      case "claimed":
        claimed.push(p);
        break;
      case "refunded":
        refunded.push(p);
        break;
      default: {
        // exhaustive
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const _never: never = p.status;
        open.push(p);
      }
    }
  }

  return { open, claimable, lost, refundable, claimed, refunded };
};

const filterByQuery = (positions: readonly PositionRecord[], q?: PositionsQuery): readonly PositionRecord[] => {
  if (!q) return positions;

  const byMarket =
    q.marketId !== undefined
      ? positions.filter((p) => (p.marketId as unknown as string) === (q.marketId as unknown as string))
      : positions;

  if (!q.statuses || q.statuses.length === 0) return byMarket;

  const allowed = new Set<PositionStatus>(q.statuses);
  return byMarket.filter((p) => allowed.has(p.status));
};

/**
 * Primary positions hook for views:
 * - optional filter by marketId / statuses
 * - includes pre-bucketed arrays for fast UI
 */
export const usePositions = (query?: PositionsQuery): Readonly<{
  positions: readonly PositionRecord[];
  buckets: PositionBuckets;
  counts: Readonly<{
    total: number;
    open: number;
    claimable: number;
    lost: number;
    refundable: number;
    claimed: number;
    refunded: number;
  }>;
}> => {
  const all = useStorePositions();

  const positions = useMemo(() => filterByQuery(all, query), [all, query?.marketId, query?.statuses]);

  const buckets = useMemo(() => bucketize(positions), [positions]);

  const counts = useMemo(
    () => ({
      total: positions.length,
      open: buckets.open.length,
      claimable: buckets.claimable.length,
      lost: buckets.lost.length,
      refundable: buckets.refundable.length,
      claimed: buckets.claimed.length,
      refunded: buckets.refunded.length,
    }),
    [positions.length, buckets],
  );

  return { positions, buckets, counts };
};

/** Convenience: positions for a single market */
export const usePositionsForMarket = (marketId: MarketId): Readonly<{
  positions: readonly PositionRecord[];
  buckets: PositionBuckets;
  counts: Readonly<{
    total: number;
    open: number;
    claimable: number;
    lost: number;
    refundable: number;
    claimed: number;
    refunded: number;
  }>;
}> => usePositions({ marketId });

/** Convenience: single position by id */
export const usePosition = (positionId: PositionId): PositionRecord | null => useStorePositionById(positionId);
