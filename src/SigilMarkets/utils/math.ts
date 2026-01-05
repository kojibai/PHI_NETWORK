// SigilMarkets/utils/math.ts
/* eslint-disable @typescript-eslint/consistent-type-definitions */

/**
 * SigilMarkets — math
 *
 * Deterministic bigint math utilities for:
 * - fees (bps)
 * - quotes (stake -> shares) for AMM-ish and parimutuel modes
 * - payout (shares -> redeemable Φ)
 *
 * NOTE:
 * This module is intentionally conservative and "obvious":
 * - uses only integer micro-units (bigint)
 * - clamps and guards against division by zero
 * - provides predictable rounding
 */

import type {
  Bps,
  MarketSide,
  PhiMicro,
  PriceMicro,
  ShareMicro,
} from "../types/marketTypes";

import { ONE_PHI_MICRO, ONE_SHARE_MICRO } from "../types/marketTypes";

export type Rounding = "floor" | "ceil" | "round";

/** Safe clamp for bigint. */
export const clampBigInt = (v: bigint, lo: bigint, hi: bigint): bigint => {
  if (v < lo) return lo;
  if (v > hi) return hi;
  return v;
};

/** Multiply then divide with specified rounding: (a*b)/d */
export const mulDiv = (a: bigint, b: bigint, d: bigint, rounding: Rounding = "floor"): bigint => {
  if (d === 0n) return 0n;
  const prod = a * b;
  if (rounding === "floor") return prod / d;
  const q = prod / d;
  const r = prod % d;
  if (r === 0n) return q;

  if (rounding === "ceil") {
    return q + 1n;
  }

  // round-to-nearest, ties-to-even
  // Compare 2*r with d
  const twiceR = 2n * r;
  if (twiceR < d) return q;
  if (twiceR > d) return q + 1n;
  // tie
  return (q & 1n) === 0n ? q : q + 1n;
};

/** Apply fee in basis points: fee = amount * bps / 10_000 (floor). */
export const feeFromBps = (amount: bigint, feeBps: Bps): bigint => {
  const bps = BigInt(Math.max(0, Math.min(10_000, Math.floor(feeBps))));
  return mulDiv(amount, bps, 10_000n, "floor");
};

/** Subtract fee safely (never negative). */
export const subtractFee = (amount: bigint, feeBps: Bps): Readonly<{ net: bigint; fee: bigint }> => {
  const fee = feeFromBps(amount, feeBps);
  const net = amount > fee ? amount - fee : 0n;
  return { net, fee };
};

/**
 * Convert a price (microΦ per 1 share) to a "probability-ish" ratio (0..1) as rational bigint:
 * ratioMicro = priceMicro (since ONE_PHI_MICRO maps to 1.0)
 */
export const clampPriceMicro = (priceMicro: bigint): bigint => clampBigInt(priceMicro, 1n, ONE_PHI_MICRO);

/**
 * Compute shares received for a stake at a given average price:
 * sharesMicro = stakeMicro * ONE_SHARE_MICRO / priceMicro
 */
export const sharesForStakeAtPrice = (stakeMicro: PhiMicro, avgPriceMicro: PriceMicro): ShareMicro => {
  const price = clampPriceMicro(avgPriceMicro as unknown as bigint);
  const s = stakeMicro as unknown as bigint;
  if (s <= 0n) return 0n as ShareMicro;
  const shares = mulDiv(s, ONE_SHARE_MICRO, price, "floor");
  return shares as ShareMicro;
};

/**
 * Compute payout (microΦ) from shares:
 * payoutMicro = sharesMicro * redeemPerShareMicro / ONE_SHARE_MICRO
 */
export const payoutForShares = (sharesMicro: ShareMicro, redeemPerShareMicro: PhiMicro = ONE_PHI_MICRO): PhiMicro => {
  const sh = sharesMicro as unknown as bigint;
  if (sh <= 0n) return 0n as PhiMicro;
  const payout = mulDiv(sh, redeemPerShareMicro as unknown as bigint, ONE_SHARE_MICRO, "floor");
  return payout as PhiMicro;
};

/**
 * AMM-ish price impact model (simple, deterministic, intuitive):
 *
 * Let p0 be current YES price in microΦ (1..ONE_PHI_MICRO).
 * Let L be "liquidityMicro" (microΦ) that sets sensitivity.
 *
 * Buying YES pushes price up toward 1:
 *   p1 = p0 + (1 - p0) * s / (L + s)
 *
 * Buying NO pushes price down toward 0:
 *   p1 = p0 - p0 * s / (L + s)
 *
 * This keeps prices bounded and makes big moves harder as you approach extremes.
 */
export const ammPostYesPriceMicro = (args: Readonly<{
  yesPriceMicro: PriceMicro;
  side: MarketSide;
  stakeMicroNet: PhiMicro; // after entry fee
  liquidityMicro: PhiMicro; // sensitivity param
}>): PriceMicro => {
  const p0 = clampBigInt(args.yesPriceMicro as unknown as bigint, 1n, ONE_PHI_MICRO);
  const s = args.stakeMicroNet as unknown as bigint;
  const L0 = args.liquidityMicro as unknown as bigint;
  const L = L0 <= 0n ? ONE_PHI_MICRO : L0; // default to 1Φ sensitivity if unset

  if (s <= 0n) return p0 as PriceMicro;

  // frac = s / (L + s) in rational; apply with mulDiv
  const denom = L + s;

  if (args.side === "YES") {
    const oneMinus = ONE_PHI_MICRO - p0;
    const delta = mulDiv(oneMinus, s, denom, "floor");
    const p1 = clampBigInt(p0 + delta, 1n, ONE_PHI_MICRO);
    return p1 as PriceMicro;
  }

  // NO
  const delta = mulDiv(p0, s, denom, "floor");
  const p1 = clampBigInt(p0 - delta, 1n, ONE_PHI_MICRO);
  return p1 as PriceMicro;
};

/**
 * Quote a trade (AMM-ish).
 * - Applies entry fee (bps) to stake
 * - Computes post-trade YES price using simple impact model
 * - Uses avgPrice = midpoint(p0, p1) for shares calculation
 */
export type AmmQuote = Readonly<{
  stakeMicro: PhiMicro;
  feeMicro: PhiMicro;
  netStakeMicro: PhiMicro;

  yesPriceBeforeMicro: PriceMicro;
  yesPriceAfterMicro: PriceMicro;

  avgPriceMicro: PriceMicro;
  worstPriceMicro: PriceMicro;

  sharesMicro: ShareMicro;
}>;

export const quoteAmmTrade = (args: Readonly<{
  side: MarketSide;
  stakeMicro: PhiMicro;
  yesPriceMicro: PriceMicro; // current YES price
  feeBps: Bps;
  liquidityMicro: PhiMicro; // sensitivity param (microΦ)
}>): AmmQuote => {
  const stake = args.stakeMicro as unknown as bigint;
  const { net, fee } = subtractFee(stake, args.feeBps);

  const netStakeMicro = net as PhiMicro;
  const feeMicro = fee as PhiMicro;

  const p0 = clampBigInt(args.yesPriceMicro as unknown as bigint, 1n, ONE_PHI_MICRO) as PriceMicro;
  const p1 = ammPostYesPriceMicro({
    yesPriceMicro: p0,
    side: args.side,
    stakeMicroNet: netStakeMicro,
    liquidityMicro: args.liquidityMicro,
  });

  // Determine side price path:
  // If buying YES, the "price paid" is YES price; it rises from p0 to p1.
  // If buying NO, the effective price is NO price = ONE_PHI_MICRO - YES price; it rises as YES falls.
  const yesBefore = p0 as unknown as bigint;
  const yesAfter = p1 as unknown as bigint;

  const sidePriceBefore = args.side === "YES" ? yesBefore : ONE_PHI_MICRO - yesBefore;
  const sidePriceAfter = args.side === "YES" ? yesAfter : ONE_PHI_MICRO - yesAfter;

  const worst = sidePriceAfter > sidePriceBefore ? sidePriceAfter : sidePriceBefore; // worst = higher price
  const avg = (sidePriceBefore + sidePriceAfter) / 2n;

  const avgClamped = clampBigInt(avg, 1n, ONE_PHI_MICRO) as PriceMicro;
  const worstClamped = clampBigInt(worst, 1n, ONE_PHI_MICRO) as PriceMicro;

  const shares = sharesForStakeAtPrice(netStakeMicro, avgClamped);

  return {
    stakeMicro: stake as PhiMicro,
    feeMicro,
    netStakeMicro,
    yesPriceBeforeMicro: p0 as PriceMicro,
    yesPriceAfterMicro: p1,
    avgPriceMicro: avgClamped,
    worstPriceMicro: worstClamped,
    sharesMicro: shares,
  };
};

/**
 * Quote a parimutuel "stake" (simple):
 * - Fee may be applied (entry fee)
 * - Shares are set 1:1 with Φ (sharesMicro = netStakeMicro * ONE_SHARE_MICRO / ONE_PHI_MICRO)
 *   so payout math can still use payoutForShares.
 */
export type ParimutuelQuote = Readonly<{
  stakeMicro: PhiMicro;
  feeMicro: PhiMicro;
  netStakeMicro: PhiMicro;

  sharesMicro: ShareMicro;
  avgPriceMicro: PriceMicro;
  worstPriceMicro: PriceMicro;
}>;

export const quoteParimutuelStake = (args: Readonly<{
  stakeMicro: PhiMicro;
  feeBps: Bps;
}>): ParimutuelQuote => {
  const stake = args.stakeMicro as unknown as bigint;
  const { net, fee } = subtractFee(stake, args.feeBps);

  const netStakeMicro = net as PhiMicro;
  const feeMicro = fee as PhiMicro;

  // Treat 1 share = 1Φ claim unit for uniformity.
  const shares = mulDiv(net, ONE_SHARE_MICRO, ONE_PHI_MICRO, "floor");

  // Show a neutral "price" (0.5) since pools determine payout later.
  const neutral = (ONE_PHI_MICRO / 2n) as PriceMicro;

  return {
    stakeMicro: stake as PhiMicro,
    feeMicro,
    netStakeMicro,
    sharesMicro: shares as ShareMicro,
    avgPriceMicro: neutral,
    worstPriceMicro: neutral,
  };
};

/**
 * Slippage check helper:
 * - maxSlippageBps is compared against (worst - avg)/avg
 * - returns ok=false if slippage is too high
 */
export const checkSlippage = (args: Readonly<{
  avgPriceMicro: PriceMicro;
  worstPriceMicro: PriceMicro;
  maxSlippageBps: Bps;
}>): Readonly<{ ok: true } | { ok: false; error: string }> => {
  const avg = args.avgPriceMicro as unknown as bigint;
  const worst = args.worstPriceMicro as unknown as bigint;
  const maxBps = BigInt(Math.max(0, Math.min(10_000, Math.floor(args.maxSlippageBps))));

  if (avg <= 0n) return { ok: false, error: "avg price invalid" };
  if (worst <= avg) return { ok: true };

  // slippageBps = (worst - avg) / avg * 10_000
  const diff = worst - avg;
  const slipBps = mulDiv(diff, 10_000n, avg, "ceil");

  if (slipBps > maxBps) return { ok: false, error: "slippage too high" };
  return { ok: true };
};
