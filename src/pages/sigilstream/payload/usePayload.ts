// src/pages/sigilstream/payload/usePayload.ts
"use client";

import { useEffect, useMemo } from "react";
import type { FeedPostPayload } from "../../../utils/feedPayload";
import { decodeFeedPayload, extractPayloadToken } from "../../../utils/feedPayload";
import type { KaiMomentStrict } from "../core/types";
import { kaiMomentFromAbsolutePulse } from "../core/kai_time";
import { report } from "../core/utils";
import { prependUniqueToStorage } from "../data/storage";
import type { AttachmentManifest } from "../attachments/types";
import { isAttachmentManifest } from "../attachments/types";

type Source = { url: string };

export function usePayload(
  setSources: React.Dispatch<React.SetStateAction<Source[]>>,
): {
  payload: FeedPostPayload | null;
  payloadKai: KaiMomentStrict | null;
  payloadError: string | null;
  payloadAttachments: AttachmentManifest | null;
} {
  const pathname = typeof window === "undefined" ? "" : window.location.pathname;
  const { payload, payloadKai, payloadError } = useMemo(() => {
    if (!pathname) {
      return {
        payload: null,
        payloadKai: null,
        payloadError: null,
      };
    }
    try {
      const token = extractPayloadToken(pathname);
      if (!token) {
        return {
          payload: null,
          payloadKai: null,
          payloadError: null,
        };
      }

      const decoded = decodeFeedPayload(token);
      if (!decoded) {
        return {
          payload: null,
          payloadKai: null,
          payloadError: "Invalid or corrupted stream payload.",
        };
      }

      // Derive Kai moment (beat/step/day/chakra) from absolute pulse
      try {
        const km = kaiMomentFromAbsolutePulse(decoded.pulse);
        return {
          payload: decoded,
          payloadKai: km,
          payloadError: null,
        };
      } catch (e) {
        report("kaiMomentFromAbsolutePulse", e);
        return {
          payload: decoded,
          payloadKai: null,
          payloadError: null,
        };
      }
    } catch (e) {
      report("usePayload decode/init", e);
      return {
        payload: null,
        payloadKai: null,
        payloadError: "Failed to read stream payload.",
      };
    }
  }, [pathname]);

  useEffect(() => {
    if (!payload?.url) return;
    // Ensure payload URL is present in the list (payload-first in UI handled upstream)
    setSources((prev) => {
      const exists = prev.some((s) => s.url === payload.url);
      if (exists) return prev;
      try {
        prependUniqueToStorage([payload.url]);
      } catch (e) {
        report("localStorage prependUniqueToStorage", e);
      }
      return [{ url: payload.url }, ...prev];
    });
  }, [payload?.url, setSources]);

  // Attachments surfaced from payload if present and well-formed
  const payloadAttachments = useMemo<AttachmentManifest | null>(() => {
    if (!payload) return null;
    const candidate = (payload as unknown as { attachments?: unknown }).attachments;
    return isAttachmentManifest(candidate) ? (candidate as AttachmentManifest) : null;
  }, [payload]);

  return { payload, payloadKai, payloadError, payloadAttachments };
}

export default usePayload;
