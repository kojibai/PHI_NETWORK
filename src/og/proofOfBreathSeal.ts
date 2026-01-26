export type HashHex = string;

type ProofSealInput = {
  bundleHash: HashHex | undefined;
  capsuleHash: HashHex;
  svgHash?: HashHex;
  receiptHash?: HashHex;
  pulse?: number;
};

type SealPalette = {
  primary: string;
  secondary: string;
  accent: string;
  glow: string;
};

type SealGeometry = {
  ringCount: number;
  tickCount: number;
  polygonSides: number;
  rosetteCount: number;
  rosetteA: number;
  rosetteB: number;
  rosetteC: number;
  dashPattern: string;
  glowAlpha: number;
  gradientAngle: number;
  glassOpacity: number;
};

export type ProofOfBreathSeal = {
  palette: SealPalette;
  geometry: SealGeometry;
  draw: (ctx: CanvasRenderingContext2D, x: number, y: number, size: number) => void;
  toSvg: (x: number, y: number, size: number, idPrefix: string, label: string, microtext: string) => string;
};

function hexToBytes(hex: string): Uint8Array {
  const cleaned = hex.toLowerCase().replace(/[^0-9a-f]/g, "");
  const normalized = cleaned.length % 2 === 1 ? `0${cleaned}` : cleaned;
  const bytes = new Uint8Array(Math.floor(normalized.length / 2));
  for (let i = 0; i < bytes.length; i += 1) {
    const idx = i * 2;
    bytes[i] = parseInt(normalized.slice(idx, idx + 2), 16);
  }
  return bytes;
}

function seedFromBytes(bytes: Uint8Array): number {
  let hash = 2166136261;
  for (const byte of bytes) {
    hash ^= byte;
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return hash >>> 0;
}

function mulberry32(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function randInt(rand: () => number, min: number, max: number): number {
  return Math.floor(rand() * (max - min + 1)) + min;
}

function hsl(hue: number, sat: number, light: number): string {
  return `hsl(${hue} ${sat}% ${light}%)`;
}

function buildRosettePath(radius: number, a: number, b: number, c: number, steps = 220): string {
  const pts: string[] = [];
  for (let i = 0; i <= steps; i += 1) {
    const t = (i / steps) * Math.PI * 2;
    const r = radius * (0.62 + 0.28 * Math.sin(c * t));
    const x = Math.cos(a * t) * r;
    const y = Math.sin(b * t) * r;
    pts.push(`${i === 0 ? "M" : "L"}${x.toFixed(2)} ${y.toFixed(2)}`);
  }
  return `${pts.join(" ")} Z`;
}

function polygonPath(radius: number, sides: number, rotation = -Math.PI / 2): string {
  const pts: string[] = [];
  for (let i = 0; i < sides; i += 1) {
    const t = rotation + (i / sides) * Math.PI * 2;
    const x = Math.cos(t) * radius;
    const y = Math.sin(t) * radius;
    pts.push(`${i === 0 ? "M" : "L"}${x.toFixed(2)} ${y.toFixed(2)}`);
  }
  return `${pts.join(" ")} Z`;
}

export function buildProofOfBreathSeal(input: ProofSealInput): ProofOfBreathSeal {
  const seedBytes = hexToBytes(
    `${input.capsuleHash}${(input.bundleHash ?? "").slice(0, 32)}${input.svgHash ?? ""}${input.receiptHash ?? ""}`,
  );
  const seed = seedFromBytes(seedBytes);
  const rand = mulberry32(seed);
  const pulseShift = typeof input.pulse === "number" && Number.isFinite(input.pulse) ? Math.abs(input.pulse) % 360 : 0;
  const baseHue = randInt(rand, 0, 359);
  const accentHue = (baseHue + randInt(rand, 24, 160)) % 360;
  const secondaryHue = (baseHue + randInt(rand, 180, 260)) % 360;
  const palette: SealPalette = {
    primary: hsl(baseHue, 78, 62),
    secondary: hsl(secondaryHue, 62, 58),
    accent: hsl(accentHue, 76, 64),
    glow: `hsla(${baseHue}, 82%, 70%, ${0.35 + rand() * 0.25})`,
  };

  const geometry: SealGeometry = {
    ringCount: randInt(rand, 2, 4),
    tickCount: randInt(rand, 12, 24),
    polygonSides: randInt(rand, 5, 11),
    rosetteCount: randInt(rand, 2, 3),
    rosetteA: randInt(rand, 2, 6),
    rosetteB: randInt(rand, 3, 7),
    rosetteC: randInt(rand, 2, 5),
    dashPattern: `${randInt(rand, 4, 8)} ${randInt(rand, 2, 6)}`,
    glowAlpha: 0.28 + rand() * 0.3,
    gradientAngle: (baseHue + accentHue + pulseShift) % 360,
    glassOpacity: 0.42 + rand() * 0.2,
  };

  const draw = (ctx: CanvasRenderingContext2D, x: number, y: number, size: number) => {
    const radius = size / 2;
    const angle = (geometry.gradientAngle * Math.PI) / 180;
    const gradX = Math.cos(angle) * radius;
    const gradY = Math.sin(angle) * radius;
    const strokeGradient = ctx.createLinearGradient(-gradX, -gradY, gradX, gradY);
    strokeGradient.addColorStop(0, palette.primary);
    strokeGradient.addColorStop(0.55, palette.accent);
    strokeGradient.addColorStop(1, palette.secondary);
    const glassGradient = ctx.createRadialGradient(0, 0, radius * 0.1, 0, 0, radius);
    glassGradient.addColorStop(0, palette.accent);
    glassGradient.addColorStop(0.5, palette.primary);
    glassGradient.addColorStop(1, "rgba(10,12,18,0.7)");
    ctx.save();
    ctx.translate(x, y);
    ctx.lineCap = "round";
    for (let i = 0; i < geometry.ringCount; i += 1) {
      const ringR = radius * (0.92 - i * 0.12);
      ctx.strokeStyle = i % 2 === 0 ? strokeGradient : palette.secondary;
      ctx.lineWidth = 1.6 - i * 0.2;
      ctx.beginPath();
      ctx.setLineDash(i === 0 ? geometry.dashPattern.split(" ").map(Number) : []);
      ctx.arc(0, 0, ringR, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.setLineDash([]);
    ctx.strokeStyle = palette.accent;
    ctx.lineWidth = 1.1;
    for (let i = 0; i < geometry.tickCount; i += 1) {
      const t = (i / geometry.tickCount) * Math.PI * 2;
      const inner = radius * 0.82;
      const outer = radius * 0.95;
      ctx.beginPath();
      ctx.moveTo(Math.cos(t) * inner, Math.sin(t) * inner);
      ctx.lineTo(Math.cos(t) * outer, Math.sin(t) * outer);
      ctx.stroke();
    }
    for (let i = 0; i < geometry.rosetteCount; i += 1) {
      const scale = radius * (0.52 - i * 0.08);
      const a = geometry.rosetteA + i;
      const b = geometry.rosetteB + i;
      const c = geometry.rosetteC + i;
      ctx.strokeStyle = i % 2 === 0 ? palette.secondary : palette.accent;
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let s = 0; s <= 240; s += 1) {
        const t = (s / 240) * Math.PI * 2;
        const r = scale * (0.62 + 0.28 * Math.sin(c * t));
        const px = Math.cos(a * t) * r;
        const py = Math.sin(b * t) * r;
        if (s === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.stroke();
    }
    ctx.fillStyle = glassGradient;
    ctx.strokeStyle = strokeGradient;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    const poly = geometry.polygonSides;
    for (let i = 0; i <= poly; i += 1) {
      const t = (-Math.PI / 2) + (i / poly) * Math.PI * 2;
      const px = Math.cos(t) * radius * 0.32;
      const py = Math.sin(t) * radius * 0.32;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  };

  const toSvg = (x: number, y: number, size: number, idPrefix: string, label: string, microtext: string) => {
    const radius = size / 2;
    const ringR = radius * 0.92;
    const textR = radius * 0.72;
    const gradId = `${idPrefix}-pob-grad`;
    const glassId = `${idPrefix}-pob-glass`;
    const frostId = `${idPrefix}-pob-frost`;
    const ringPaths = Array.from({ length: geometry.ringCount }).map((_, idx) => {
      const r = ringR - idx * radius * 0.12;
      const stroke = idx % 2 === 0 ? `url(#${gradId})` : palette.secondary;
      const dash = idx === 0 ? `stroke-dasharray="${geometry.dashPattern}"` : "";
      const width = (1.8 - idx * 0.22).toFixed(2);
      return `<circle cx="0" cy="0" r="${r.toFixed(2)}" fill="none" stroke="${stroke}" stroke-width="${width}" ${dash} opacity="0.9" />`;
    });

    const ticks = Array.from({ length: geometry.tickCount }).map((_, idx) => {
      const t = (idx / geometry.tickCount) * Math.PI * 2;
      const inner = radius * 0.78;
      const outer = radius * 0.95;
      const x1 = Math.cos(t) * inner;
      const y1 = Math.sin(t) * inner;
      const x2 = Math.cos(t) * outer;
      const y2 = Math.sin(t) * outer;
      return `<line x1="${x1.toFixed(2)}" y1="${y1.toFixed(2)}" x2="${x2.toFixed(2)}" y2="${y2.toFixed(2)}" stroke="${palette.accent}" stroke-width="1" opacity="0.7" />`;
    });

    const rosettes = Array.from({ length: geometry.rosetteCount }).map((_, idx) => {
      const scale = radius * (0.52 - idx * 0.08);
      const a = geometry.rosetteA + idx;
      const b = geometry.rosetteB + idx;
      const c = geometry.rosetteC + idx;
      const stroke = idx % 2 === 0 ? palette.secondary : palette.accent;
      const path = buildRosettePath(scale, a, b, c);
      return `<path d="${path}" fill="none" stroke="${stroke}" stroke-width="1" opacity="0.65" />`;
    });

    const polyPath = polygonPath(radius * 0.3, geometry.polygonSides);
    const textPathId = `${idPrefix}-pob-text`;
    const microPathId = `${idPrefix}-pob-micro`;
    const topArc = `M ${(-textR).toFixed(2)} 0 A ${textR.toFixed(2)} ${textR.toFixed(2)} 0 0 1 ${textR.toFixed(2)} 0`;
    const bottomArc = `M ${textR.toFixed(2)} 0 A ${textR.toFixed(2)} ${textR.toFixed(2)} 0 0 1 ${(-textR).toFixed(2)} 0`;

    return `
      <g transform="translate(${x} ${y})">
        <defs>
          <linearGradient id="${gradId}" x1="0%" y1="0%" x2="100%" y2="100%" gradientTransform="rotate(${geometry.gradientAngle})">
            <stop offset="0%" stop-color="${palette.primary}" stop-opacity="0.95" />
            <stop offset="55%" stop-color="${palette.accent}" stop-opacity="0.75" />
            <stop offset="100%" stop-color="${palette.secondary}" stop-opacity="0.9" />
          </linearGradient>
          <radialGradient id="${glassId}" cx="50%" cy="45%" r="70%">
            <stop offset="0%" stop-color="${palette.accent}" stop-opacity="0.35" />
            <stop offset="45%" stop-color="${palette.primary}" stop-opacity="${geometry.glassOpacity.toFixed(2)}" />
            <stop offset="100%" stop-color="rgba(10,12,18,0.6)" stop-opacity="0.9" />
          </radialGradient>
          <filter id="${frostId}" x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feColorMatrix in="blur" type="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 0.55 0" />
            <feMerge>
              <feMergeNode />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <path id="${textPathId}" d="${topArc}" />
          <path id="${microPathId}" d="${bottomArc}" />
        </defs>
        <circle cx="0" cy="0" r="${(radius * 0.98).toFixed(2)}" fill="url(#${glassId})" stroke="url(#${gradId})" stroke-width="1.4" opacity="0.92" filter="url(#${frostId})" />
        ${ringPaths.join("\n")}
        ${ticks.join("\n")}
        ${rosettes.join("\n")}
        <path d="${polyPath}" fill="rgba(10,12,18,0.7)" stroke="url(#${gradId})" stroke-width="1.3" />
        <text font-family="Inter, Segoe UI, Helvetica Neue, Arial, sans-serif" font-size="14" font-weight="700" letter-spacing="0.18em" fill="${palette.primary}">
          <textPath href="#${textPathId}" startOffset="50%" text-anchor="middle">${label}</textPath>
        </text>
        <text font-family="Inter, Segoe UI, Helvetica Neue, Arial, sans-serif" font-size="9" font-weight="600" letter-spacing="0.18em" fill="${palette.secondary}" opacity="0.8">
          <textPath href="#${microPathId}" startOffset="50%" text-anchor="middle">${microtext}</textPath>
        </text>
      </g>
    `;
  };

  return { palette, geometry, draw, toSvg };
}
