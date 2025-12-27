import React, { useMemo, useState } from "react";
import KaiQR from "../sigil/KaiQR";
import "./SigilSendQrModal.css";

const MAX_QR_PAYLOAD = 1400;

type Props = {
  open: boolean;
  url: string;
  amountDisplay?: string;
  hash?: string;
  downloadUrl?: string | null;
  downloadLabel?: string;
  onClose: () => void;
};

const SigilSendQrModal: React.FC<Props> = ({
  open,
  url,
  amountDisplay,
  hash,
  downloadUrl,
  downloadLabel,
  onClose,
}) => {
  const [copied, setCopied] = useState(false);
  const qrUrl = useMemo(() => {
    if (!url) return null;
    if (url.length > MAX_QR_PAYLOAD) return null;
    return url;
  }, [url]);

  if (!open) return null;

  const handleCopy = async () => {
    if (!url || typeof navigator === "undefined") return;
    try {
      await navigator.clipboard?.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div
      className="phi-send-success-overlay phi-qr-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Sigil transfer QR"
      onClick={onClose}
    >
      <div
        className="phi-send-success-card phi-qr-card"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="phi-success-orb" aria-hidden="true">
          <div className="phi-success-orb-inner" />
        </div>

        <div className="phi-success-header">
          <span className="phi-success-pill">SENT</span>
          <button
            type="button"
            className="phi-success-close"
            onClick={onClose}
            aria-label="Close QR"
          >
            ✕
          </button>
        </div>

        <h2 className="phi-success-title">Sigil QR Ready</h2>

        {amountDisplay && (
          <p className="phi-success-amount phi-qr-amount">
            <span className="mono">{amountDisplay}</span>
          </p>
        )}

        {qrUrl ? (
          <p className="phi-success-body">
            Scan this QR to open the transfer link and download the sigil glyph
            SVG on another device.
          </p>
        ) : (
          <p className="phi-success-body">
            QR payload is too large to render safely. Use the transfer link
            instead.
          </p>
        )}

        {qrUrl && (
          <div className="phi-qr-frame" aria-live="polite">
            <KaiQR
              uid={`sigil-qr-${hash ?? "send"}`}
              url={qrUrl}
              size={240}
              minModulePx={4}
              moduleOpacity={0.7}
              showHalo={false}
              showLattice={false}
              showGlyphRays={false}
              showTempleCorners={false}
              showCornerFlares={false}
              showChakraRing={false}
              showSeal
              polarity="dark-on-light"
            />
          </div>
        )}

        {hash && (
          <p className="phi-qr-hash">
            Hash: <span className="mono">{hash}</span>
          </p>
        )}

        <div className="phi-qr-actions">
          <button type="button" className="phi-qr-copy" onClick={handleCopy}>
            {copied ? "Transfer link copied" : "Copy transfer link"}
          </button>

          {downloadUrl && (
            <a
              className="phi-send-success-download"
              href={downloadUrl}
              download={downloadLabel || "sigil-send"}
              target="_blank"
              rel="noopener noreferrer"
            >
              <span
                className="phi-send-success-download-icon"
                aria-hidden="true"
              >
                ⬇︎
              </span>
              <span className="phi-send-success-download-text">
                Download sigil SVG
              </span>
            </a>
          )}

          <button type="button" className="phi-success-ok" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
};

export default SigilSendQrModal;
