import { Resvg } from "@resvg/resvg-js";
import type { VerifiedCardData } from "./types";
import { buildVerifiedCardSvg } from "./buildVerifiedCardSvg";

export function renderVerifiedOgPng(data: VerifiedCardData): Buffer {
  const svg = buildVerifiedCardSvg(data);
  const resvg = new Resvg(svg, {
    fitTo: { mode: "width", value: 1200 },
  });
  const pngData = resvg.render().asPng();
  return Buffer.from(pngData);
}
