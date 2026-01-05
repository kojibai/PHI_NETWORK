// SigilMarkets/views/MarketRoom/MarketRules.tsx
"use client";

import React, { useMemo } from "react";
import type { Market } from "../../types/marketTypes";
import { Card, CardContent } from "../../ui/atoms/Card";
import { Divider } from "../../ui/atoms/Divider";
import { Icon } from "../../ui/atoms/Icon";
import { Chip } from "../../ui/atoms/Chip";

export type MarketRulesProps = Readonly<{
  market: Market;
}>;

export const MarketRules = (props: MarketRulesProps) => {
  const r = props.market.def.rules;

  const oracleLabel = useMemo(() => {
    const p = r.oracle.provider;
    if (p === "sigil-oracle") return "Sigil Oracle";
    if (p === "committee") return "Committee";
    if (p === "crowd") return "Crowd";
    if (p === "external") return "External";
    return p;
  }, [r.oracle.provider]);

  const dispute = r.oracle.disputeWindowPulses ?? 0;

  return (
    <Card variant="glass2">
      <CardContent>
        <div className="sm-rules-head">
          <div className="sm-rules-title">
            <Icon name="check" size={14} tone="dim" /> Rules
          </div>
          <div className="sm-rules-badges">
            <Chip size="sm" selected={false} variant="outline">
              oracle • {oracleLabel}
            </Chip>
            <Chip size="sm" selected={false} variant="outline">
              fee • {r.settlement.feeBps} bps
            </Chip>
          </div>
        </div>

        <Divider />

        <div className="sm-rules-block">
          <div className="sm-rules-k">YES means</div>
          <div className="sm-rules-v">{r.yesCondition}</div>
        </div>

        {r.clarifications && r.clarifications.length > 0 ? (
          <>
            <Divider />
            <div className="sm-rules-block">
              <div className="sm-rules-k">Clarifications</div>
              <ul className="sm-rules-list">
                {r.clarifications.map((c, i) => (
                  <li key={i}>{c}</li>
                ))}
              </ul>
            </div>
          </>
        ) : null}

        <Divider />

        <div className="sm-rules-block">
          <div className="sm-rules-k">Dispute window</div>
          <div className="sm-rules-v">{dispute > 0 ? `${dispute} pulses` : "none (final on post)"}</div>
        </div>

        <Divider />

        <div className="sm-rules-block">
          <div className="sm-rules-k">Void policy</div>
          <div className="sm-rules-v">
            {r.voidPolicy.canVoid ? `can void • ${r.voidPolicy.refundMode}` : "cannot void"}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
