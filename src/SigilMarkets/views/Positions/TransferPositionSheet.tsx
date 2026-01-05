// SigilMarkets/views/Positions/TransferPositionSheet.tsx
"use client";

import React from "react";
import type { PositionRecord } from "../../types/sigilPositionTypes";
import { Sheet } from "../../ui/atoms/Sheet";
import { Button } from "../../ui/atoms/Button";
import { Icon } from "../../ui/atoms/Icon";
import { useSigilMarketsUi } from "../../state/uiStore";

export type TransferPositionSheetProps = Readonly<{
  open: boolean;
  onClose: () => void;
  position: PositionRecord;
}>;

export const TransferPositionSheet = (props: TransferPositionSheetProps) => {
  const { actions: ui } = useSigilMarketsUi();

  return (
    <Sheet
      open={props.open}
      onClose={props.onClose}
      title="Transfer"
      subtitle="Bearer-mode transfers will be wired after mint/export is complete."
      footer={
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
          <Button variant="ghost" onClick={props.onClose}>
            Close
          </Button>
          <Button
            variant="primary"
            onClick={() => ui.toast("info", "Transfer next", "We will add SigilShareSheet + transfer keys.")}
            leftIcon={<Icon name="share" size={14} tone="dim" />}
          >
            Start transfer
          </Button>
        </div>
      }
    >
      <div className="sm-small">
        Transfer flow will support:
        <ul style={{ marginTop: 8, paddingLeft: 18 }}>
          <li>Owner-bound transfers (safe default)</li>
          <li>Optional bearer mode (print/scan redeem)</li>
          <li>QR payload + offline handoff</li>
        </ul>
      </div>
    </Sheet>
  );
};
