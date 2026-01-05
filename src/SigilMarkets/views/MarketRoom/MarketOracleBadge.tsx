// SigilMarkets/views/MarketRoom/MarketOracleBadge.tsx
"use client";

import React, { useMemo } from "react";
import type { Market } from "../../types/marketTypes";
import { Chip } from "../../ui/atoms/Chip";
import { Icon } from "../../ui/atoms/Icon";
import { Tooltip } from "../../ui/atoms/Tooltip";

export type MarketOracleBadgeProps = Readonly<{
  market: Market;
}>;

const oracleTone = (provider: string): "default" | "gold" | "violet" | "cyan" => {
  if (provider === "sigil-oracle") return "gold";
  if (provider === "committee") return "violet";
  if (provider === "crowd") return "cyan";
  return "default";
};

const oracleLabel = (provider: string): string => {
  if (provider === "sigil-oracle") return "Sigil Oracle";
  if (provider === "committee") return "Committee";
  if (provider === "crowd") return "Crowd";
  if (provider === "external") return "External";
  return provider;
};

export const MarketOracleBadge = (props: MarketOracleBadgeProps) => {
  const provider = props.market.def.rules.oracle.provider;
  const label = useMemo(() => oracleLabel(provider), [provider]);
  const tone = useMemo(() => oracleTone(provider), [provider]);

  const tip = (
    <div>
      <div style={{ fontWeight: 900, marginBottom: 6 }}>{label}</div>
      <div style={{ opacity: 0.9 }}>
        Resolution is posted as a portable <b>Resolution Sigil</b> with evidence and signatures.
      </div>
    </div>
  );

  return (
    <Tooltip content={tip} placement="top">
      <Chip size="sm" selected={false} tone={tone} variant="outline" left={<Icon name="check" size={14} tone="dim" />}>
        {label}
      </Chip>
    </Tooltip>
  );
};
