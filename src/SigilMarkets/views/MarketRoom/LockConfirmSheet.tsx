// SigilMarkets/views/MarketRoom/LockConfirmSheet.tsx
"use client";

import React, { useMemo } from "react";
import type { KaiMoment, MarketQuote, PhiMicro } from "../../types/marketTypes";
import { Sheet } from "../../ui/atoms/Sheet";
import { Button } from "../../ui/atoms/Button";
import { Divider } from "../../ui/atoms/Divider";
import { Icon } from "../../ui/atoms/Icon";
import { formatPhiMicro, formatSharesMicro } from "../../utils/format";

export type LockConfirmSheetProps = Readonly<{
  open: boolean;
  onClose: () => void;

  now: KaiMoment;

  quote: MarketQuote | null;

  /** Current spendable to confirm capacity */
  spendableMicro: PhiMicro;

  onConfirm: () => void;

  loading?: boolean;
}>;

export const LockConfirmSheet = (props: LockConfirmSheetProps) => {
  const q = props.quote;

  const stake = useMemo(() => (q ? formatPhiMicro(q.stakeMicro, { withUnit: true, maxDecimals: 6, trimZeros: true }) : "—"), [q]);
  const fee = useMemo(() => (q ? formatPhiMicro(q.feeMicro, { withUnit: true, maxDecimals: 6, trimZeros: true }) : "—"), [q]);
  const total = useMemo(() => (q ? formatPhiMicro(q.totalCostMicro, { withUnit: true, maxDecimals: 6, trimZeros: true }) : "—"), [q]);
  const shares = useMemo(() => (q ? formatSharesMicro(q.expectedSharesMicro, { maxDecimals: 2 }) : "—"), [q]);

  const spendable = useMemo(
    () => formatPhiMicro(props.spendableMicro, { withUnit: true, maxDecimals: 6, trimZeros: true }),
    [props.spendableMicro],
  );

  const can = useMemo(() => {
    if (!q) return false;
    const s = props.spendableMicro as unknown as bigint;
    const c = q.stakeMicro as unknown as bigint;
    return s >= c && c > 0n;
  }, [props.spendableMicro, q]);

  return (
    <Sheet
      open={props.open}
      onClose={props.onClose}
      title="Lock & Mint"
      subtitle="This locks Φ into the market and mints your Position Sigil."
      footer={
        <div className="sm-lock-footer">
          <Button variant="ghost" onClick={props.onClose} disabled={props.loading}>
            Cancel
          </Button>
          <Button variant="primary" onClick={props.onConfirm} disabled={!can || props.loading} loading={props.loading}>
            Confirm lock
          </Button>
        </div>
      }
    >
      <div className="sm-lock">
        <div className="sm-lock-hero sm-breathe">
          <div className="sm-lock-hero-ico" aria-hidden="true">
            <Icon name="vault" size={18} tone="gold" />
          </div>
          <div className="sm-lock-hero-text">
            <div className="sm-lock-hero-title">Seal your stance</div>
            <div className="sm-lock-hero-sub">pulse {props.now.pulse}</div>
          </div>
        </div>

        <Divider />

        <div className="sm-lock-grid">
          <div className="sm-lock-row">
            <span className="sm-lock-k">Spendable</span>
            <span className="sm-lock-v">{spendable}</span>
          </div>

          <Divider />

          <div className="sm-lock-row">
            <span className="sm-lock-k">Stake</span>
            <span className="sm-lock-v">{stake}</span>
          </div>
          <div className="sm-lock-row">
            <span className="sm-lock-k">Fee</span>
            <span className="sm-lock-v">{fee}</span>
          </div>
          <div className="sm-lock-row">
            <span className="sm-lock-k">Total</span>
            <span className="sm-lock-v">{total}</span>
          </div>

          <Divider />

          <div className="sm-lock-row">
            <span className="sm-lock-k">Shares</span>
            <span className="sm-lock-v">{shares}</span>
          </div>
        </div>

        {!can ? (
          <div className="sm-lock-warn">
            <Icon name="warning" size={14} tone="danger" /> Not enough spendable Φ for this lock.
          </div>
        ) : (
          <div className="sm-small">If your side wins, your shares redeem into your Vault. If you lose, the lock is consumed.</div>
        )}
      </div>
    </Sheet>
  );
};
