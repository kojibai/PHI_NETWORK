// SigilMarkets/views/MarketRoom/StakeSlider.tsx
"use client";

import React, { useMemo, useState } from "react";
import type { PhiMicro } from "../../types/marketTypes";
import { formatPhiMicro, formatPhiMicroCompact, parsePhiToMicro } from "../../utils/format";
import { Button } from "../../ui/atoms/Button";
import { Chip } from "../../ui/atoms/Chip";
import { Icon } from "../../ui/atoms/Icon";
import { Divider } from "../../ui/atoms/Divider";

export type StakeSliderProps = Readonly<{
  spendableMicro: PhiMicro;
  valueMicro: PhiMicro;
  onChangeMicro: (next: PhiMicro) => void;

  disabled?: boolean;

  /** Optional presets in Φ (not micro). Defaults to [1, 5, 10, 25]. */
  presetsPhi?: readonly number[];

  /** If true, show an input field. Default: true */
  showInput?: boolean;
}>;

const clamp = (v: bigint, lo: bigint, hi: bigint): bigint => (v < lo ? lo : v > hi ? hi : v);

const toMicro = (phi: number): bigint => {
  if (!Number.isFinite(phi) || phi <= 0) return 0n;
  const whole = Math.floor(phi);
  const frac = phi - whole;
  const micro = BigInt(whole) * 1_000_000n + BigInt(Math.floor(frac * 1_000_000));
  return micro;
};

export const StakeSlider = (props: StakeSliderProps) => {
  const disabled = props.disabled ?? false;
  const showInput = props.showInput ?? true;

  const spendable = props.spendableMicro as unknown as bigint;
  const val = props.valueMicro as unknown as bigint;

  const max = spendable <= 0n ? 0n : spendable;
  const value = clamp(val, 0n, max);

  const pct = useMemo(() => {
    if (max <= 0n) return 0;
    const p = Number((value * 10_000n) / max) / 100; // 0..100 with 2 decimals
    return Number.isFinite(p) ? p : 0;
  }, [max, value]);

  const label = useMemo(() => formatPhiMicro(value as unknown as PhiMicro, { withUnit: true, maxDecimals: 6, trimZeros: true }), [value]);

  const compactSpendable = useMemo(
    () => formatPhiMicroCompact(props.spendableMicro, { withUnit: true, maxSig: 4 }),
    [props.spendableMicro],
  );

  const presets = props.presetsPhi ?? [1, 5, 10, 25];

  const onSlider = (e: React.ChangeEvent<HTMLInputElement>): void => {
    const n = Number(e.target.value);
    if (!Number.isFinite(n)) return;
    const next = clamp(BigInt(Math.floor(n)), 0n, max);
    props.onChangeMicro(next as unknown as PhiMicro);
  };

  // input editing
  const [input, setInput] = useState<string>("");
  const [inputErr, setInputErr] = useState<string | null>(null);

  const applyInput = (): void => {
    const res = parsePhiToMicro(input);
    if (!res.ok) {
      setInputErr(res.error);
      return;
    }
    setInputErr(null);
    const next = clamp(res.micro as unknown as bigint, 0n, max);
    props.onChangeMicro(next as unknown as PhiMicro);
  };

  return (
    <div className="sm-stake" data-sm="stake">
      <div className="sm-stake-top">
        <div className="sm-stake-left">
          <div className="sm-stake-k">Lock Φ</div>
          <div className="sm-stake-v">{label}</div>
        </div>
        <div className="sm-stake-right">
          <span className="sm-pill">
            <Icon name="vault" size={14} tone="dim" />
            spendable {compactSpendable}
          </span>
        </div>
      </div>

      <div className="sm-stake-slider">
        <input
          type="range"
          min={0}
          max={Number(max)}
          value={Number(value)}
          onChange={onSlider}
          disabled={disabled || max <= 0n}
          aria-label="Stake slider"
        />
        <div className="sm-stake-pct">{pct.toFixed(0)}%</div>
      </div>

      <div className="sm-stake-presets">
        {presets.map((p) => {
          const micro = toMicro(p);
          const can = micro > 0n && micro <= max;
          return (
            <Chip
              key={p}
              size="sm"
              selected={value === micro}
              onClick={() => can && props.onChangeMicro(micro as unknown as PhiMicro)}
              disabled={!can || disabled}
              left={<Icon name="plus" size={12} tone="dim" />}
            >
              {p}Φ
            </Chip>
          );
        })}

        <Chip
          size="sm"
          selected={value === max && max > 0n}
          onClick={() => props.onChangeMicro(max as unknown as PhiMicro)}
          disabled={disabled || max <= 0n}
          tone="gold"
        >
          Max
        </Chip>

        <Chip
          size="sm"
          selected={value === 0n}
          onClick={() => props.onChangeMicro(0n as unknown as PhiMicro)}
          disabled={disabled}
          tone="danger"
          variant="outline"
        >
          Clear
        </Chip>
      </div>

      {showInput ? (
        <>
          <Divider />
          <div className="sm-stake-input">
            <input
              className="sm-input"
              placeholder="Enter Φ amount (e.g. 3.21)"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              disabled={disabled}
              inputMode="decimal"
            />
            <Button size="sm" variant="primary" onClick={applyInput} disabled={disabled || input.trim().length === 0}>
              Apply
            </Button>
          </div>
          {inputErr ? <div className="sm-small" style={{ color: "rgba(255,104,104,0.90)" }}>{inputErr}</div> : null}
        </>
      ) : null}
    </div>
  );
};
