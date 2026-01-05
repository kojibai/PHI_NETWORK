import type { Market } from "../../types/marketTypes";
import { Card } from "../../ui/atoms/Card";

export type ResolutionSigilCardProps = Readonly<{
  market: Market;
}>;

export const ResolutionSigilCard = ({ market }: ResolutionSigilCardProps) => {
  return (
    <Card className="sm-resolution__sigil">
      <div className="sm-resolution__title">Resolution Sigil</div>
      <p>{market.def.question}</p>
    </Card>
  );
};
