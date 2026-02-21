export const ROW_H = 240;
export const OVERSCAN = 4;
export const BATCH = 18;

export function computeVirtualWindow(scrollTop: number, vh: number, count: number): { start: number; end: number } {
  const start = Math.max(0, Math.floor(scrollTop / ROW_H) - OVERSCAN);
  const end = Math.min(count, Math.ceil((scrollTop + vh) / ROW_H) + OVERSCAN);
  return { start, end };
}
