// SigilMarkets/views/MarketRoom/YesNoToggle.tsx
"use client";

import React, { useMemo } from "react";
import type { MarketSide, PriceMicro } from "../../types/marketTypes";
import { Segmented } from "../../ui/atoms/Segmented";
import { formatPriceMicro } from "../../utils/format";
import { Icon } from "../../ui/atoms/Icon";

export type YesNoToggleProps = Readonly<{
  value: MarketSide;
  onChange: (next: MarketSide) => void;
  disabled?: boolean;

  /** Optional live prices for richer toggles (Polymarket feel). */
  yesPriceMicro?: PriceMicro;
  noPriceMicro?: PriceMicro;

  /** Display mode for prices. Default: "cents" */
  priceMode?: "cents" | "prob";
}>;

export const YesNoToggle = (props: YesNoToggleProps) => {
  const priceMode = props.priceMode ?? "cents";

  const yesLabel = useMemo(() => {
    if (props.yesPriceMicro === undefined) return "YES";
    const p = formatPriceMicro(props.yesPriceMicro, { mode: priceMode, decimals: priceMode === "prob" ? 1 : 0 });
    return priceMode === "cents" ? `YES • ${p}` : `YES • ${p}`;
  }, [props.yesPriceMicro, priceMode]);

  const noLabel = useMemo(() => {
    if (props.noPriceMicro === undefined) return "NO";
    const p = formatPriceMicro(props.noPriceMicro, { mode: priceMode, decimals: priceMode === "prob" ? 1 : 0 });
    return priceMode === "cents" ? `NO • ${p}` : `NO • ${p}`;
  }, [props.noPriceMicro, priceMode]);

  const options = useMemo(
    () =>
      [
        { value: "YES" as const, label: yesLabel, tone: "cyan" as const },
        { value: "NO" as const, label: noLabel, tone: "violet" as const },
      ] as const,
    [yesLabel, noLabel],
  );

  return (
    <div className="sm-yesno" data-sm="yesno">
      <div className="sm-yesno-row">
        <div className="sm-yesno-hint">
          <span className="sm-yesno-ico" aria-hidden="true">
            <Icon name={props.value === "YES" ? "yes" : "no"} size={12} tone={props.value === "YES" ? "cyan" : "violet"} />
          </span>
          <span className="sm-yesno-text">Choose a side</span>
        </div>

        <Segmented<MarketSide>
          value={props.value}
          options={options}
          onChange={props.onChange}
          size="md"
          disabled={props.disabled}
          className="sm-yesno-seg"
        />
      </div>
    </div>
  );
};
