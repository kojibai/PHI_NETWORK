import React from "react";
import { useParams } from "react-router-dom";

import "./VerifyEmbedPage.css";
import { parseSlug } from "../utils/verifySigil";

function ellipsizeMiddle(value: string, head = 10, tail = 8): string {
  const trimmed = value.trim();
  if (!trimmed) return "—";
  if (trimmed.length <= head + tail + 3) return trimmed;
  return `${trimmed.slice(0, head)}…${trimmed.slice(trimmed.length - tail)}`;
}

export default function VerifyEmbedPage(): React.JSX.Element {
  const { slug: rawSlug } = useParams();
  const slug = parseSlug(rawSlug ?? "");
  const status = "STANDBY";

  const pulseLabel = slug.pulse ? String(slug.pulse) : "—";
  const phiLabel = slug.shortSig ? ellipsizeMiddle(slug.shortSig, 8, 6) : "—";
  const openUrl = `/verify/${encodeURIComponent(slug.raw || rawSlug || "")}`;

  return (
    <div className="embed-verify" role="article" aria-label="Embedded proof badge">
      <div className="embed-card">
        <div className="embed-status">
          <span className="embed-dot" data-status={status} />
          <span className="embed-status-label">{status}</span>
        </div>
        <div className="embed-meta">
          <div className="embed-field">
            <span className="embed-field-label">Pulse</span>
            <span className="embed-field-value">{pulseLabel}</span>
          </div>
          <div className="embed-field">
            <span className="embed-field-label">ΦKey</span>
            <span className="embed-field-value">{phiLabel}</span>
          </div>
        </div>
        <a className="embed-open" href={openUrl} target="_blank" rel="noopener noreferrer">
          Open
        </a>
      </div>
    </div>
  );
}
