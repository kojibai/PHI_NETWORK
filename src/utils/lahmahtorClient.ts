/*
  Shared Internal Sigil API (LAH-MAH-TOR) singleton.
  Provides a local, offline replacement for remote explorer APIs.
*/

import { InternalSigilApi } from "./lahmahtor";

const hasWindow = typeof window !== "undefined";
const INTERNAL_FLAG = "__LAHMAHTOR_INTERNAL__";

type InternalWindow = Window & { __LAHMAHTOR__?: InternalSigilApi; __LAHMAHTOR_INTERNAL__?: boolean };

let serverSingleton: InternalSigilApi | null = null;

function buildInternalApi(): InternalSigilApi {
  const baseOrigin = hasWindow ? window.location.origin : "https://example.invalid";
  return new InternalSigilApi({ baseOrigin });
}

export function getInternalSigilApi(): InternalSigilApi {
  if (hasWindow) {
    const w = window as InternalWindow;
    if (!w.__LAHMAHTOR__) {
      w.__LAHMAHTOR__ = buildInternalApi();
    }
    w.__LAHMAHTOR_INTERNAL__ = true;
    return w.__LAHMAHTOR__;
  }

  if (!serverSingleton) serverSingleton = buildInternalApi();
  return serverSingleton;
}

export function markInternalSigilApiEnabled(): void {
  if (!hasWindow) return;
  const w = window as InternalWindow;
  w.__LAHMAHTOR_INTERNAL__ = true;
}

export function isInternalSigilApiEnabled(): boolean {
  if (!hasWindow) return false;
  const w = window as InternalWindow;
  return Boolean(w.__LAHMAHTOR_INTERNAL__);
}
