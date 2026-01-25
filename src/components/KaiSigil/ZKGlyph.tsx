import React, { useRef, useEffect, useMemo } from "react";
import { CENTER, PHI, SPACE, lissajousPath } from "./constants";
import { PULSE_MS } from "../../utils/kai_pulse";

type Props = {
  uid: string;
  size: number;
  phaseColor: string;
  outerRingText: string;
  innerRingText: string;

  verified: boolean;
  zkScheme?: string;
  zkPoseidonHash?: string;
  proofPresent: boolean;

  animate: boolean;
  prefersReduce: boolean;
};

const ZKGlyph: React.FC<Props> = ({
  uid,
  size,
  phaseColor,
  outerRingText,
  innerRingText,
  verified,
  zkScheme,
  zkPoseidonHash,
  proofPresent,
  animate,
  prefersReduce,
}) => {
  const rOuter = SPACE * 0.34;
  const rInner = rOuter / PHI;
  const rPetal = rInner * 0.96;
  const petalScale = rPetal / (SPACE / 2);

  const phiRingId = `${uid}-zk-phi-ring`;
  const binRingId = `${uid}-zk-bin-ring`;
  const gradId = `${uid}-zk-grad`;
  const petalUseId = `${uid}-zk-petal-def`;

  // seal defs
  const sealGlowId = `${uid}-seal-glow`;

  const wPetal = Math.max(1.0, (size ?? 240) * 0.008);
  const wRing = Math.max(0.9, (size ?? 240) * 0.007);
  const wGlow = Math.max(1.2, (size ?? 240) * 0.009);
  const doAnim = animate && !prefersReduce;

  const petalDefRef = useRef<SVGPathElement | null>(null);

  useEffect(() => {
    if (!doAnim) return;
    const el = petalDefRef.current;
    if (!el) return;

    let raf = 0;
    const t0 = performance.now();

    const secPerPulse = PULSE_MS / 1000;
    const fA = (1 / secPerPulse) * (PHI * 0.21);
    const fB = (1 / secPerPulse) * ((PHI - 1) * 0.17);
    const fD = (1 / secPerPulse) * (Math.SQRT2 * 0.15);

    const a0 = 5,
      b0 = 8,
      aAmp = 1.6,
      bAmp = 1.2;
    const d0 = Math.PI / 2,
      dAmp = Math.PI / 3;

    const render = () => {
      const t = (performance.now() - t0) / 1000;
      const aDyn = a0 + aAmp * (0.5 + 0.5 * Math.sin(2 * Math.PI * fA * t));
      const bDyn = b0 + bAmp * (0.5 + 0.5 * Math.sin(2 * Math.PI * fB * t + 1.234));
      const deltaDyn = d0 + dAmp * Math.sin(2 * Math.PI * fD * t + 0.777);
      el.setAttribute("d", lissajousPath(aDyn, bDyn, deltaDyn));
      raf = requestAnimationFrame(render);
    };

    raf = requestAnimationFrame(render);
    return () => cancelAnimationFrame(raf);
  }, [doAnim]);

  // ─────────────────────────────────────────────────────────────
  // Φ RING TEXT — export-safe (no textPath fallback ever)
  // ─────────────────────────────────────────────────────────────

  const mono = `ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`;
  const uiSans = `ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial`;

  const outerFont = Math.max(8, (size ?? 240) * 0.026);
  const innerFont = Math.max(7, (size ?? 240) * 0.022);

  const approxCharW = (fs: number) => fs * 0.62;
  const maxCharsForRadius = (radius: number, fs: number) => {
    const circ = 2 * Math.PI * radius;
    return Math.max(48, Math.floor(circ / approxCharW(fs)));
  };

  const condenseSeal = (raw: string, maxLen: number) => {
    const s = (raw ?? "").trim();
    if (!s) return "";

    const wanted = [
      "sig=",
      "b58=",
      "len=",
      "crc32=",
      "creator=",
      "zk=",
      "alg=",
      "day=",
      "beat=",
      "hz=",
      "poseidon=",
    ];

    const parts = s.split(" · ").map((p) => p.trim()).filter(Boolean);
    const kept = parts.filter((p) => wanted.some((w) => p.startsWith(w)));

    const out = (kept.length ? kept : parts).join(" · ");
    if (out.length <= maxLen) return out;
    return out.slice(0, Math.max(0, maxLen - 1)).trimEnd() + "…";
  };

  const outerDisplay = useMemo(() => {
    const maxLen = maxCharsForRadius(rOuter, outerFont);
    return condenseSeal(outerRingText, maxLen);
  }, [outerRingText, rOuter, outerFont]);

  const innerDisplay = useMemo(() => {
    const maxLen = maxCharsForRadius(rInner, innerFont);
    return condenseSeal(innerRingText, maxLen);
  }, [innerRingText, rInner, innerFont]);

  const renderRingText = (
    text: string,
    radius: number,
    fontFamily: string,
    fontSize: number,
    fill: string,
    opacity: number
  ) => {
    const chars = Array.from(text);
    if (!chars.length) return null;

    const start = -Math.PI / 2;
    const n = chars.length;

    const stroke = "#001014";
    const strokeW = Math.max(0.45, fontSize * 0.085);

    return (
      <g aria-hidden="true" pointerEvents="none">
        {chars.map((ch, i) => {
          const t = i / n;
          const ang = start + t * Math.PI * 2;
          const x = CENTER + radius * Math.cos(ang);
          const y = CENTER + radius * Math.sin(ang);
          const deg = (ang * 180) / Math.PI + 90;

          return (
            <text
              key={`${i}-${ch}`}
              transform={`translate(${x} ${y}) rotate(${deg})`}
              fontFamily={fontFamily}
              fontSize={fontSize}
              fill={fill}
              opacity={opacity}
              textAnchor="middle"
              dominantBaseline="middle"
              letterSpacing="0"
              stroke={stroke}
              strokeOpacity="0.6"
              strokeWidth={strokeW}
              paintOrder="stroke"
            >
              {ch}
            </text>
          );
        })}
      </g>
    );
  };

  // ─────────────────────────────────────────────────────────────
  // Authority seal (money-grade) — ONLY when verified
  // ─────────────────────────────────────────────────────────────

  const statusForAria = verified ? "verified" : proofPresent ? "proof-present" : "unverified";
  const showSeal = verified === true;

  const sealGreen = "#00FFD0";
  const sealInk = "#001014";
  const plateFill = "#061012";

  // typography: disciplined, engraved, not loud
  const sealTitleFont = Math.max(9, Math.min(14, Math.floor((size ?? 240) * 0.038)));
  const sealSubFont = Math.max(7, Math.min(11, Math.floor((size ?? 240) * 0.026)));
  const sealMicroFont = Math.max(6, Math.min(9, Math.floor((size ?? 240) * 0.020)));

  const schemeShort = useMemo(() => {
    const s = (zkScheme ?? "").trim().toLowerCase();
    if (!s) return "G16";
    if (s.includes("groth16")) return "G16";
    if (s.includes("plonk")) return "PLONK";
    return s.slice(0, 4).toUpperCase();
  }, [zkScheme]);

  const serialNib = useMemo(() => {
    const h = (zkPoseidonHash ?? "").trim();
    if (!h) return "";
    const up = h.toUpperCase();
    if (up.length <= 10) return up;
    return `${up.slice(0, 5)}…${up.slice(-3)}`;
  }, [zkPoseidonHash]);

  // Capsule plate: smaller + more embedded
  const plateW = rInner * 1.18;
  const plateH = rInner * 0.40;
  const plateX = CENTER - plateW / 2;
  const plateY = CENTER - plateH / 2;
  const plateR = Math.max(10, plateH * 0.50); // capsule

  // Rosette ticks: security paper cue (lightweight, WebKit-safe)
  const rosetteR = rInner * 0.78;
  const tickCount = 72;
  const tickLong = Math.max(6, (size ?? 240) * 0.030);
  const tickShort = Math.max(3.5, (size ?? 240) * 0.018);
  const tickW = Math.max(1, (size ?? 240) * 0.0032);

  const ticks = useMemo(() => {
    if (!showSeal) return [];
    const out: Array<{ x1: number; y1: number; x2: number; y2: number; key: string }> = [];
    for (let i = 0; i < tickCount; i++) {
      const ang = (i / tickCount) * Math.PI * 2 - Math.PI / 2;
      const isMajor = i % 6 === 0;
      const len = isMajor ? tickLong : tickShort;

      const x1 = CENTER + rosetteR * Math.cos(ang);
      const y1 = CENTER + rosetteR * Math.sin(ang);
      const x2 = CENTER + (rosetteR + len) * Math.cos(ang);
      const y2 = CENTER + (rosetteR + len) * Math.sin(ang);

      out.push({ x1, y1, x2, y2, key: `${i}` });
    }
    return out;
  }, [showSeal, rosetteR, tickCount, tickLong, tickShort]);

  // Latent Φ watermark
  const phiWatermarkFont = Math.max(40, Math.floor((size ?? 240) * 0.42));

  return (
    <g
      id={`${uid}-zk-glyph`}
      aria-label={`Atlantean zero-knowledge verification glyph (${statusForAria})`}
      pointerEvents="none"
    >
      <defs>
        <radialGradient id={gradId} cx="50%" cy="50%" r="60%">
          <stop offset="0%" stopColor={phaseColor} stopOpacity="0.85">
            {doAnim && (
              <>
                <animate
                  attributeName="stop-opacity"
                  values=".55;.85;.55"
                  dur={`${PULSE_MS}ms`}
                  repeatCount="indefinite"
                />
                <animate
                  attributeName="stop-color"
                  values={`${phaseColor};#00FFD0;${phaseColor}`}
                  dur={`${PULSE_MS * 3}ms`}
                  repeatCount="indefinite"
                />
              </>
            )}
          </stop>
          <stop offset="55%" stopColor={phaseColor} stopOpacity="0.55">
            {doAnim && (
              <animate
                attributeName="stop-color"
                values={`${phaseColor};#00FFD0;${phaseColor}`}
                dur={`${PULSE_MS * 3}ms`}
                repeatCount="indefinite"
              />
            )}
          </stop>
          <stop offset="100%" stopColor="#00FFD0" stopOpacity="0.25">
            {doAnim && (
              <animate
                attributeName="stop-opacity"
                values=".15;.35;.15"
                dur={`${PULSE_MS}ms`}
                repeatCount="indefinite"
              />
            )}
          </stop>
        </radialGradient>

        {/* subtle glow for the seal (WebKit-safe: blur + merge) */}
        <filter id={sealGlowId} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="2" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>

        <path
          id={phiRingId}
          d={`M ${CENTER} ${CENTER - rOuter} a ${rOuter} ${rOuter} 0 1 1 0 ${2 * rOuter} a ${rOuter} ${rOuter} 0 1 1 0 -${2 * rOuter}`}
          fill="none"
        />
        <path
          id={binRingId}
          d={`M ${CENTER} ${CENTER - rInner} a ${rInner} ${rInner} 0 1 1 0 ${2 * rInner} a ${rInner} ${rInner} 0 1 1 0 -${2 * rInner}`}
          fill="none"
        />

        <path id={petalUseId} ref={petalDefRef} d={lissajousPath(5, 8, Math.PI / 2)} />
      </defs>

      <circle
        cx={CENTER}
        cy={CENTER}
        r={rOuter}
        fill="none"
        stroke={`url(#${gradId})`}
        strokeWidth={wGlow}
        opacity="0.5"
        vectorEffect="non-scaling-stroke"
      />

      {Array.from({ length: 12 }, (_, i) => (
        <use
          key={i}
          href={`#${petalUseId}`}
          transform={`translate(${CENTER},${CENTER}) scale(${petalScale}) rotate(${i * 30}) translate(${-CENTER},${-CENTER})`}
          stroke={`url(#${gradId})`}
          strokeWidth={wPetal}
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity="0.42"
          fill="none"
          vectorEffect="non-scaling-stroke"
        />
      ))}

      <g opacity="0.25">
        <circle
          cx={CENTER - rInner / 2.2}
          cy={CENTER}
          r={rInner * 0.86}
          fill="none"
          stroke={phaseColor}
          strokeWidth={wRing}
        />
        <circle
          cx={CENTER + rInner / 2.2}
          cy={CENTER}
          r={rInner * 0.86}
          fill="none"
          stroke={sealGreen}
          strokeWidth={wRing}
        />
      </g>

      <circle
        cx={CENTER}
        cy={CENTER}
        r={rInner}
        fill="none"
        stroke={`url(#${gradId})`}
        strokeWidth={wRing}
        opacity="0.55"
        vectorEffect="non-scaling-stroke"
      />

      {/* Φ ring (mono, engraved) */}
      {outerDisplay && renderRingText(outerDisplay, rOuter, mono, outerFont, phaseColor, 0.33)}

      {/* binary / seal ring (sans, lighter) */}
      {innerDisplay && renderRingText(innerDisplay, rInner, uiSans, innerFont, sealGreen, 0.28)}

      {/* MONEY-GRADE SEAL (only when verified) */}
      {showSeal && (
        <g aria-hidden="true" pointerEvents="none" filter={`url(#${sealGlowId})`}>
          {/* rosette tick ring */}
          <g opacity="0.32">
            {ticks.map((t) => (
              <line
                key={t.key}
                x1={t.x1}
                y1={t.y1}
                x2={t.x2}
                y2={t.y2}
                stroke={sealGreen}
                strokeOpacity="0.50"
                strokeWidth={tickW}
                strokeLinecap="round"
                vectorEffect="non-scaling-stroke"
              />
            ))}
          </g>

          {/* latent Φ watermark */}
          <text
            x={CENTER}
            y={CENTER}
            textAnchor="middle"
            dominantBaseline="middle"
            fontFamily={uiSans}
            fontSize={phiWatermarkFont}
            fontWeight="900"
            fill={sealGreen}
            fillOpacity="0.05"
          >
            Φ
          </text>

          {/* capsule plate (embedded) */}
          <rect
            x={plateX}
            y={plateY}
            width={plateW}
            height={plateH}
            rx={plateR}
            ry={plateR}
            fill={plateFill}
            fillOpacity="0.12"
            stroke={sealGreen}
            strokeOpacity="0.22"
            strokeWidth={1.2}
            vectorEffect="non-scaling-stroke"
          />

          {/* inner hairline */}
          <rect
            x={plateX + 3}
            y={plateY + 3}
            width={plateW - 6}
            height={plateH - 6}
            rx={Math.max(8, plateR - 3)}
            ry={Math.max(8, plateR - 3)}
            fill="none"
            stroke={sealGreen}
            strokeOpacity="0.10"
            strokeWidth={1}
            vectorEffect="non-scaling-stroke"
          />

          {/* VERIFIED — engraved (authority cue) */}
          <text
            x={CENTER}
            y={CENTER - sealTitleFont * 0.36}
            textAnchor="middle"
            dominantBaseline="middle"
            fontFamily={uiSans}
            fontSize={sealTitleFont}
            fontWeight="900"
            letterSpacing="0.38em"
            fill={sealGreen}
            fillOpacity="0.84"
            stroke={sealInk}
            strokeOpacity="0.40"
            strokeWidth={Math.max(1, sealTitleFont * 0.08)}
            paintOrder="stroke"
          >
            VERIFIED
          </text>

          {/* PROOF OF BREATH — micro line */}
          <text
            x={CENTER}
            y={CENTER + sealSubFont * 0.10}
            textAnchor="middle"
            dominantBaseline="middle"
            fontFamily={uiSans}
            fontSize={sealSubFont}
            fontWeight="800"
            letterSpacing="0.22em"
            fill={sealGreen}
            fillOpacity="0.58"
          >
            PROOF•OF•BREATH
          </text>

          {/* microprint serial (money cue) */}
          <text
            x={CENTER}
            y={CENTER + sealSubFont * 1.06}
            textAnchor="middle"
            dominantBaseline="middle"
            fontFamily={mono}
            fontSize={sealMicroFont}
            fontWeight="700"
            letterSpacing="0.16em"
            fill={sealGreen}
            fillOpacity="0.44"
          >
            {`ZK:${schemeShort}${serialNib ? ` • ID:${serialNib}` : ""}`}
          </text>
        </g>
      )}
    </g>
  );
};

export default ZKGlyph;
