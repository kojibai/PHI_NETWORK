// SigilMarkets/views/MarketGrid/MarketGridEmpty.tsx
"use client";
import { Card, CardContent } from "../../ui/atoms/Card";
import { Button } from "../../ui/atoms/Button";
import { useSigilMarketsUi } from "../../state/uiStore";

export const MarketGridEmpty = () => {
  const { actions } = useSigilMarketsUi();
  return (
    <Card variant="glass" className="sm-empty">
      <CardContent>
        <div className="sm-title">No markets match.</div>
        <div className="sm-subtitle" style={{ marginTop: 6 }}>
          Try clearing filters, or come back on the next pulse.
        </div>
        <div style={{ marginTop: 12 }}>
          <Button variant="primary" onClick={() => actions.setCategories([])}>
            Clear categories
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};
